#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# run-agents-tmux-worktrees.sh
# - pm/qa/dev を git worktree で分離
# - tmux 3ペインで並列に task-runner を常駐起動
# - TASKS/lock/log は "共通" を参照して取り合いを防止
#
# 使い方:
#   ./scripts/run-agents-tmux-worktrees.sh --init
#   ./scripts/run-agents-tmux-worktrees.sh
#
# オプション:
#   --init               worktree を作成（未作成なら）
#   --session NAME       tmux セッション名 (default: slide-stock-agents)
#   --interval SEC       runner interval (default: 30)
#   --worktree-root DIR  worktree root dir (default: .worktrees)
#   --base-ref REF       worktree のベース (default: origin/main -> main -> HEAD)
#   --kill               既存セッションを kill して作り直す
# ============================================================

SESSION="slide-stock-agents"
INTERVAL="30"
WORKTREE_ROOT=".worktrees"
BASE_REF=""
INIT=false
KILL=false

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --init               create worktrees if missing
  --session NAME       tmux session name (default: ${SESSION})
  --interval SEC       runner interval seconds (default: ${INTERVAL})
  --worktree-root DIR  worktree root dir (default: ${WORKTREE_ROOT})
  --base-ref REF       base ref (default: origin/main -> main -> HEAD)
  --kill               kill existing tmux session if exists
  -h, --help           show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) INIT=true; shift ;;
    --session) SESSION="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --worktree-root) WORKTREE_ROOT="$2"; shift 2 ;;
    --base-ref) BASE_REF="$2"; shift 2 ;;
    --kill) KILL=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

command -v tmux >/dev/null 2>&1 || die "tmux not found. Please install tmux."
command -v git >/dev/null 2>&1 || die "git not found."

cd "$PROJECT_DIR"

# resolve base ref
resolve_base_ref() {
  if [[ -n "$BASE_REF" ]]; then
    echo "$BASE_REF"; return 0
  fi
  if git show-ref --verify --quiet refs/remotes/origin/main; then
    echo "origin/main"; return 0
  fi
  if git show-ref --verify --quiet refs/heads/main; then
    echo "main"; return 0
  fi
  echo "HEAD"
}

BASE_REF_RESOLVED="$(resolve_base_ref)"

WT_ROOT_ABS="$PROJECT_DIR/$WORKTREE_ROOT"
PM_DIR="$WT_ROOT_ABS/pm"
QA_DIR="$WT_ROOT_ABS/qa"
DEV_DIR="$WT_ROOT_ABS/dev"

COMMON_TASKS_DIR="$PROJECT_DIR/tasks"   # ← 共通SSOT（ここを全runnerが見る）
COMMON_LOCK_DIR="$COMMON_TASKS_DIR/.runner.lock"
COMMON_LOGS_DIR="$COMMON_TASKS_DIR/logs"

create_worktree_if_missing() {
  local role="${1:?role is required}"
  local dir="${2:?dir is required}"
  local branch="agent/${role}"

  if [[ -d "$dir" ]]; then
    return 0
  fi

  mkdir -p "$WT_ROOT_ABS"

  # branch が存在するならそれを使う。なければ BASE から新規作成
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    git worktree add "$dir" "$branch"
  else
    git worktree add -b "$branch" "$dir" "$BASE_REF_RESOLVED"
  fi
}

if $INIT; then
  echo "Initializing worktrees under: $WORKTREE_ROOT (base: $BASE_REF_RESOLVED)"
  create_worktree_if_missing "pm" "$PM_DIR"
  create_worktree_if_missing "qa" "$QA_DIR"
  create_worktree_if_missing "dev" "$DEV_DIR"
fi

[[ -d "$PM_DIR" ]] || die "pm worktree not found: $PM_DIR (run with --init)"
[[ -d "$QA_DIR" ]] || die "qa worktree not found: $QA_DIR (run with --init)"
[[ -d "$DEV_DIR" ]] || die "dev worktree not found: $DEV_DIR (run with --init)"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  if $KILL; then
    tmux kill-session -t "$SESSION"
  else
    echo "Session already exists: $SESSION"
    echo "Attach: tmux attach -t $SESSION"
    echo "Recreate: $0 --kill"
    exit 0
  fi
fi

# Commands:
# - 各ペインは自分の worktree に cd して作業（衝突を減らす）
# - ただし TASKS/lock/log は共通ディレクトリを参照（CLAIM排他を成立させる）
pm_cmd="cd \"$PM_DIR\" && ROLE=pm INTERVAL=$INTERVAL TASKS_DIR=\"$COMMON_TASKS_DIR\" LOCK_DIR=\"$COMMON_LOCK_DIR\" LOGS_DIR=\"$COMMON_LOGS_DIR\" ./scripts/task-runner.sh"
qa_cmd="cd \"$QA_DIR\" && ROLE=qa INTERVAL=$INTERVAL TASKS_DIR=\"$COMMON_TASKS_DIR\" LOCK_DIR=\"$COMMON_LOCK_DIR\" LOGS_DIR=\"$COMMON_LOGS_DIR\" ./scripts/task-runner.sh"
dev_cmd="cd \"$DEV_DIR\" && ROLE=dev INTERVAL=$INTERVAL CLAUDE_PERMISSION=plan TASKS_DIR=\"$COMMON_TASKS_DIR\" LOCK_DIR=\"$COMMON_LOCK_DIR\" LOGS_DIR=\"$COMMON_LOGS_DIR\" ./scripts/task-runner.sh"

# Create session & panes
tmux new-session -d -s "$SESSION" -n agents

# Layout (tiled first, then resize bottom bigger)
tmux split-window -h -t "$SESSION:agents"
tmux select-pane -t "$SESSION:agents.0"
tmux split-window -v -t "$SESSION:agents.0"
tmux select-layout -t "$SESSION:agents" tiled

# Pane titles
tmux set-option -t "$SESSION" -g pane-border-status top
tmux set-option -t "$SESSION" -g pane-border-format "#{pane_index} #{pane_title}"

tmux select-pane -t "$SESSION:agents.0"
tmux select-pane -T "PM (worktree: $WORKTREE_ROOT/pm)"
tmux send-keys -t "$SESSION:agents.0" "$pm_cmd" C-m

tmux select-pane -t "$SESSION:agents.1"
tmux select-pane -T "QA (worktree: $WORKTREE_ROOT/qa)"
tmux send-keys -t "$SESSION:agents.1" "$qa_cmd" C-m

tmux select-pane -t "$SESSION:agents.2"
tmux select-pane -T "DEV (worktree: $WORKTREE_ROOT/dev)"
tmux send-keys -t "$SESSION:agents.2" "$dev_cmd" C-m

# Prefer: top panes even, bottom larger
tmux select-layout -t "$SESSION:agents" even-horizontal
tmux resize-pane -t "$SESSION:agents.2" -y 18 2>/dev/null || true

tmux attach -t "$SESSION"
