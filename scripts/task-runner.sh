#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# task-runner.sh — TASKS.md のチェックリストに従い claude -p で順次実行
#
# TASKS.md 書式:
#   - [ ] @role task-id — 説明
#   - [x] @role task-id — 説明  (完了)
#   - [!] @role task-id — 説明  (失敗)
#
# role: pm, qa, dev
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TASKS_DIR="$PROJECT_DIR/tasks"
TASKS_FILE="$TASKS_DIR/TASKS.md"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
LOGS_DIR="$TASKS_DIR/logs"
PID_FILE="$TASKS_DIR/.runner.pid"

# デフォルト設定
INTERVAL="${INTERVAL:-60}"
ONCE=false
DRY_RUN=false
CLAUDE_MODEL="${CLAUDE_MODEL:-}"
CLAUDE_PERMISSION="${CLAUDE_PERMISSION:-bypassPermissions}"

# ============================================================
# 関数定義
# ============================================================

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

TASKS.md のチェックリストを上から順に読み、未完了タスクを claude -p で実行する。
各タスクには @role（pm/qa/dev）が付与され、ロールに応じたシステムプロンプトで実行される。

  TASKS.md の書式:
    - [ ] @pm  001-plan        — 要件定義        (未実行)
    - [ ] @qa  002-test-auth   — 認証テスト作成  (未実行)
    - [ ] @dev 003-impl-auth   — 認証実装        (未実行)
    - [x] @dev 003-impl-auth   — 認証実装        (完了)
    - [!] @dev 003-impl-auth   — 認証実装        (失敗)

  各タスクの詳細は tasks/<task-id>.md に記述する。
  ロール別プロンプトは scripts/prompts/{pm,qa,dev}.md に定義。

Options:
  --once          1件処理したら終了
  --dry-run       実行せず対象タスクを表示
  --interval N    チェック間隔（秒, デフォルト: 60）
  --model MODEL   Claude モデル指定 (sonnet, opus, haiku)
  --permission M  permission-mode (default, bypassPermissions, plan)
  --list          TASKS.md の内容を表示して終了
  -h, --help      このヘルプを表示

Environment:
  INTERVAL          チェック間隔（秒, デフォルト: 60）
  CLAUDE_MODEL      モデル指定
  CLAUDE_PERMISSION permission-mode (デフォルト: default)
EOF
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# TASKS.md から最初の未完了行を解析して "role task-id" を返す
# 書式: - [ ] @role task-id — 説明
next_pending() {
  local line
  line="$(grep '^- \[ \] @' "$TASKS_FILE" | head -1)" || true
  [[ -z "$line" ]] && return
  local role task_id
  role="$(echo "$line" | awk '{ print $4 }' | sed 's/^@//')"
  task_id="$(echo "$line" | awk '{ print $5 }')"
  echo "$role $task_id"
}

# TASKS.md のチェックを更新する（スペース数に依存しない）
mark_task() {
  local role="$1" task_id="$2" mark="$3"
  sed -i '' "s/^- \[ \] @${role}  *${task_id} /- [${mark}] @${role} ${task_id} /" "$TASKS_FILE"
}

list_tasks() {
  if [[ ! -f "$TASKS_FILE" ]]; then
    echo "TASKS.md が見つかりません: $TASKS_FILE"
    exit 1
  fi
  cat "$TASKS_FILE"
}

check_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$PID_FILE")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "ERROR: task-runner は既に実行中です (PID: $old_pid)"
      echo "       強制再起動する場合: kill $old_pid && rm $PID_FILE"
      exit 1
    fi
    rm -f "$PID_FILE"
  fi
}

cleanup() {
  log "シャットダウン..."
  rm -f "$PID_FILE"
  exit 0
}

run_task() {
  local role="$1" task_id="$2"
  local task_file="$TASKS_DIR/${task_id}.md"
  local prompt_file="$PROMPTS_DIR/${role}.md"
  local log_file="$LOGS_DIR/${task_id}.log"

  # バリデーション
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

  # ロール用システムプロンプト + セキュリティルールを結合
  local security_file="$PROMPTS_DIR/_security.md"
  local system_prompt
  system_prompt="$(cat "$prompt_file")"
  if [[ -f "$security_file" ]]; then
    system_prompt="$system_prompt"$'\n\n'"$(cat "$security_file")"
  fi

  # タスク本文を取得
  local prompt
  prompt="$(cat "$task_file")"

  # claude コマンド組み立て
  local claude_args=(-p)
  claude_args+=(--allowedTools "Bash Edit Read Write Glob Grep NotebookEdit")
  claude_args+=(--append-system-prompt "$system_prompt")
  if [[ -n "$CLAUDE_MODEL" ]]; then
    claude_args+=(--model "$CLAUDE_MODEL")
  fi

  # 既存ログがあればアーカイブに移動
  if [[ -f "$log_file" ]]; then
    local archive_dir="$LOGS_DIR/archive"
    mkdir -p "$archive_dir"
    local ts
    ts="$(date '+%Y%m%d-%H%M%S')"
    mv "$log_file" "$archive_dir/${task_id}_${ts}.log"
    log "既存ログをアーカイブ: archive/${task_id}_${ts}.log"
  fi

  # 実行
  local exit_code=0
  log "role=$role, claude ${claude_args[0]} ${claude_args[1]} ${claude_args[2]} (prompt: ${#prompt} chars)"
  {
    echo "=== Task: @${role} ${task_id} ==="
    echo "=== Started: $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo ""
    echo "$prompt" | (cd "$PROJECT_DIR" && claude "${claude_args[@]}") 2>&1
    echo ""
    echo "=== Finished: $(date '+%Y-%m-%d %H:%M:%S') ==="
  } > "$log_file" 2>&1 || exit_code=$?

  # TASKS.md のチェック更新
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
    --once)       ONCE=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --interval)   INTERVAL="$2"; shift 2 ;;
    --model)      CLAUDE_MODEL="$2"; shift 2 ;;
    --permission) CLAUDE_PERMISSION="$2"; shift 2 ;;
    --list)       list_tasks; exit 0 ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ============================================================
# メイン
# ============================================================

if [[ ! -f "$TASKS_FILE" ]]; then
  echo "ERROR: $TASKS_FILE が見つかりません"
  exit 1
fi

trap cleanup SIGINT SIGTERM
mkdir -p "$LOGS_DIR"

# dry-run
if $DRY_RUN; then
  log "=== DRY-RUN: 未完了タスク ==="
  found=false
  while IFS= read -r line; do
    echo "$line" | grep -q '^- \[ \] @' || continue
    role="$(echo "$line" | awk '{ print $4 }' | sed 's/^@//')"
    task_id="$(echo "$line" | awk '{ print $5 }')"
    [[ -z "$task_id" ]] && continue
    found=true
    desc="$(echo "$line" | sed "s/^.*— //")"
    task_file="$TASKS_DIR/${task_id}.md"
    prompt_file="$PROMPTS_DIR/${role}.md"
    log "@${role} ${task_id} — ${desc}"
    if [[ -f "$task_file" ]]; then
      echo "  task:   $task_file"
    else
      echo "  task:   NOT FOUND"
    fi
    if [[ -f "$prompt_file" ]]; then
      echo "  prompt: $prompt_file"
    else
      echo "  prompt: NOT FOUND"
    fi
  done < "$TASKS_FILE"
  $found || log "未完了タスクなし"
  exit 0
fi

check_pid
echo $$ > "$PID_FILE"

log "task-runner 起動 (interval=${INTERVAL}s, once=$ONCE)"
log "project: $PROJECT_DIR"
log "tasks:   $TASKS_FILE"
log "prompts: $PROMPTS_DIR"

while true; do
  result="$(next_pending)"

  if [[ -n "$result" ]]; then
    role="$(echo "$result" | awk '{ print $1 }')"
    task_id="$(echo "$result" | awk '{ print $2 }')"
    run_task "$role" "$task_id" || true
    if $ONCE; then
      log "--once モードのため終了"
      break
    fi
  else
    if $ONCE; then
      log "未完了タスクなし。終了"
      break
    fi
    log "未完了タスクなし。${INTERVAL}秒後に再チェック..."
    sleep "$INTERVAL"
  fi
done

rm -f "$PID_FILE"
