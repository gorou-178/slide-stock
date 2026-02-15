#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# task-runner.sh — TASKS.md のチェックリストに従い claude -p で順次実行（並列対応）
#
# TASKS.md 書式:
# - [ ] @role task-id — 説明         (未着手)
# - [>] @role task-id — 説明         (CLAIM済み / 実行中)
# - [x] @role task-id — 説明         (完了)
# - [!] @role task-id — 説明         (失敗)
#
# role: pm, qa, dev
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TASKS_DIR="$PROJECT_DIR/tasks"
TASKS_FILE="$TASKS_DIR/TASKS.md"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
LOGS_DIR="$TASKS_DIR/logs"
LOCK_DIR="$TASKS_DIR/.runner.lock"

# デフォルト設定
INTERVAL="${INTERVAL:-60}"
ONCE=false
DRY_RUN=false
ROLE="${ROLE:-}" # pm / qa / dev（空なら全ロール対象）
CLAUDE_MODEL="${CLAUDE_MODEL:-}"
CLAUDE_PERMISSION="${CLAUDE_PERMISSION:-bypassPermissions}" # default / bypassPermissions / plan

PID_FILE="" # role確定後に設定

usage() {
  cat <<'EOF'
task-runner.sh — tasks/TASKS.md のチェックリストに従い claude -p を実行します（並列対応）。

TASKS.md:
  - [ ] @role task-id — 説明   (未着手)
  - [>] @role task-id — 説明   (CLAIM済み)
  - [x] @role task-id — 説明   (完了)
  - [!] @role task-id — 説明   (失敗)

Options:
  --role ROLE         対象ロール (pm|qa|dev)。未指定なら全ロール
  --once              1件処理したら終了
  --dry-run           実行せず対象タスクを表示
  --interval N        チェック間隔（秒, デフォルト: 60）
  --model MODEL       Claude モデル指定 (sonnet, opus, haiku)
  --permission M      permission-mode (default, bypassPermissions, plan)
  --list              TASKS.md の内容を表示して終了
  -h, --help          このヘルプを表示

Environment:
  ROLE                 対象ロール
  INTERVAL             チェック間隔（秒, デフォルト: 60）
  CLAUDE_MODEL          モデル指定
  CLAUDE_PERMISSION     permission-mode
EOF
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

require_tasks_file() {
  if [[ ! -f "$TASKS_FILE" ]]; then
    echo "ERROR: TASKS.md が見つかりません: $TASKS_FILE"
    exit 1
  fi
}

list_tasks() {
  require_tasks_file
  cat "$TASKS_FILE"
}

validate_role() {
  if [[ -n "$ROLE" ]] && [[ "$ROLE" != "pm" && "$ROLE" != "qa" && "$ROLE" != "dev" ]]; then
    echo "ERROR: --role は pm|qa|dev のいずれかです: ROLE=$ROLE"
    exit 1
  fi
}

set_pid_file() {
  local suffix="all"
  [[ -n "$ROLE" ]] && suffix="$ROLE"
  PID_FILE="$TASKS_DIR/.runner.${suffix}.pid"
}

check_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$PID_FILE" || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "ERROR: task-runner は既に実行中です (${PID_FILE}, PID: $old_pid)"
      echo "  強制再起動する場合: kill $old_pid && rm $PID_FILE"
      exit 1
    fi
    rm -f "$PID_FILE"
  fi
}

cleanup() {
  log "シャットダウン..."
  rm -f "$PID_FILE" || true
  exit 0
}

# ----------------------------
# 排他（短時間ロック / 依存少なめ）
# ----------------------------
acquire_lock() {
  local tries=50
  local i=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    i=$((i + 1))
    if [[ $i -ge $tries ]]; then
      log "ERROR: lock を取得できませんでした: $LOCK_DIR"
      return 1
    fi
    sleep 0.1
  done
  return 0
}

release_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

# TASKS.md から未着手タスクを1つ返す: "role task_id"
next_pending() {
  local line filter
  if [[ -n "$ROLE" ]]; then
    filter="^- \\[ \\] @$ROLE "
    line="$(grep -E "$filter" "$TASKS_FILE" | head -1)" || true
  else
    line="$(grep -E '^- \[ \] @' "$TASKS_FILE" | head -1)" || true
  fi

  [[ -z "$line" ]] && return 1

  # 例: - [ ] @pm T-001 — 説明
  local role task_id
  role="$(echo "$line" | awk '{ print $4 }' | sed 's/^@//')"
  task_id="$(echo "$line" | awk '{ print $5 }')"
  [[ -z "$role" || -z "$task_id" ]] && return 1
  echo "$role $task_id"
}

# TASKS.md のチェックを更新する（[ ]/[>] -> [x]/[!]/[>]）
mark_task() {
  local role="$1" task_id="$2" mark="$3"
  sed -i '' -E \
    "s/^-[[:space:]]\\[[[:space:]>]\\][[:space:]]@$role[[:space:]]*$task_id[[:space:]]/- [$mark] @$role $task_id /" \
    "$TASKS_FILE"
}

# 未着手([ ]) を CLAIM([>]) にする（ロック中に実施）
claim_task() {
  local role="$1" task_id="$2"
  if grep -q -E "^- \\[ \\] @$role[[:space:]]*$task_id[[:space:]]" "$TASKS_FILE"; then
    sed -i '' -E \
      "s/^- \\[ \\] @$role[[:space:]]*$task_id[[:space:]]/- [>] @$role $task_id /" \
      "$TASKS_FILE"
    return 0
  fi
  return 1
}

dry_run() {
  log "=== DRY-RUN: 未完了タスク ==="
  local found=false
  while IFS= read -r line; do
    echo "$line" | grep -qE '^- \[ \] @' || continue
    local role task_id desc task_file prompt_file
    role="$(echo "$line" | awk '{ print $4 }' | sed 's/^@//')"
    task_id="$(echo "$line" | awk '{ print $5 }')"
    [[ -z "$task_id" ]] && continue
    if [[ -n "$ROLE" && "$role" != "$ROLE" ]]; then
      continue
    fi
    found=true
    desc="$(echo "$line" | sed "s/^.*— //")"
    task_file="$TASKS_DIR/${task_id}.md"
    prompt_file="$PROMPTS_DIR/${role}.md"
    log "@${role} ${task_id} — ${desc}"
    [[ -f "$task_file" ]] && echo "  task:   $task_file" || echo "  task:   NOT FOUND"
    [[ -f "$prompt_file" ]] && echo "  prompt: $prompt_file" || echo "  prompt: NOT FOUND"
  done < "$TASKS_FILE"

  $found || log "未完了タスクなし"
}

run_task() {
  local role="$1" task_id="$2"
  local task_file="$TASKS_DIR/${task_id}.md"
  local prompt_file="$PROMPTS_DIR/${role}.md"
  local log_file="$LOGS_DIR/${task_id}.log"

  if [[ ! -f "$task_file" ]]; then
    log "ERROR: タスクファイルが見つかりません: $task_file"
    mark_task "$role" "$task_id" "!"
    return 1
  fi
  if [[ ! -f "$prompt_file" ]]; then
    log "ERROR: ロールプロンプトが見つかりません: $prompt_file"
    mark_task "$role" "$task_id" "!"
    return 1
  fi

  log "=== タスク開始: @${role} ${task_id} ==="

  local security_file="$PROMPTS_DIR/_security.md"
  local system_prompt
  system_prompt="$(cat "$prompt_file")"
  if [[ -f "$security_file" ]]; then
    system_prompt="$system_prompt"$'\n\n'"$(cat "$security_file")"
  fi

  local prompt
  prompt="$(cat "$task_file")"

  local claude_args=(-p)
  claude_args+=(--allowedTools "Bash Edit Read Write Glob Grep NotebookEdit")
  claude_args+=(--append-system-prompt "$system_prompt")
  claude_args+=(--permission "$CLAUDE_PERMISSION")
  if [[ -n "$CLAUDE_MODEL" ]]; then
    claude_args+=(--model "$CLAUDE_MODEL")
  fi

  if [[ -f "$log_file" ]]; then
    local archive_dir="$LOGS_DIR/archive"
    mkdir -p "$archive_dir"
    local ts
    ts="$(date '+%Y%m%d-%H%M%S')"
    mv "$log_file" "$archive_dir/${task_id}_${ts}.log"
    log "既存ログをアーカイブ: archive/${task_id}_${ts}.log"
  fi

  local exit_code=0
  log "role=$role, permission=$CLAUDE_PERMISSION, model=${CLAUDE_MODEL:-default}"

  {
    echo "=== Task: @${role} ${task_id} ==="
    echo "=== Started: $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo ""
    echo "$prompt" | (cd "$PROJECT_DIR" && claude "${claude_args[@]}") 2>&1
    echo ""
    echo "=== Finished: $(date '+%Y-%m-%d %H:%M:%S') ==="
  } > "$log_file" 2>&1 || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    mark_task "$role" "$task_id" "x"
    log "=== タスク完了: @${role} ${task_id} ==="
  else
    mark_task "$role" "$task_id" "!"
    log "=== タスク失敗: @${role} ${task_id} (exit=$exit_code) ==="
  fi

  return $exit_code
}

# ============================================================
# 引数パース
# ============================================================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) ROLE="$2"; shift 2 ;;
    --once) ONCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --model) CLAUDE_MODEL="$2"; shift 2 ;;
    --permission) CLAUDE_PERMISSION="$2"; shift 2 ;;
    --list) list_tasks; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# ============================================================
# メイン
# ============================================================
require_tasks_file
validate_role
set_pid_file

trap cleanup SIGINT SIGTERM
mkdir -p "$LOGS_DIR"

if $DRY_RUN; then
  dry_run
  exit 0
fi

check_pid
echo $$ > "$PID_FILE"

log "task-runner 起動 (interval=${INTERVAL}s, once=$ONCE, role=${ROLE:-all})"
log "project: $PROJECT_DIR"
log "tasks:   $TASKS_FILE"
log "prompts: $PROMPTS_DIR"
log "pid:     $PID_FILE"

while true; do
  claimed=""

  # 1) ロック中に「選ぶ→CLAIM」を原子的に
  if acquire_lock; then
    result="$(next_pending || true)"
    if [[ -n "$result" ]]; then
      role="$(echo "$result" | awk '{ print $1 }')"
      task_id="$(echo "$result" | awk '{ print $2 }')"
      if claim_task "$role" "$task_id"; then
        claimed="$role $task_id"
      fi
    fi
    release_lock
  fi

  # 2) CLAIMできたものを実行（実行中はロックしない）
  if [[ -n "$claimed" ]]; then
    role="$(echo "$claimed" | awk '{ print $1 }')"
    task_id="$(echo "$claimed" | awk '{ print $2 }')"
    run_task "$role" "$task_id" || true
    if $ONCE; then
      log "--once モードのため終了"
      break
    fi
    continue
  fi

  # 未完了なし / 取り負け
  if $ONCE; then
    log "未完了タスクなし（またはCLAIMできず）。終了"
    break
  fi
  log "未完了タスクなし（またはCLAIMできず）。${INTERVAL}秒後に再チェック..."
  sleep "$INTERVAL"
done

rm -f "$PID_FILE" || true
