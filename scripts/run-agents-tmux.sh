#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# run-agents-tmux.sh — pm/qa/dev の task-runner を tmux 3ペインで常駐起動
#
# 使い方:
#   ./scripts/run-agents-tmux.sh
#
# オプション:
#   --session NAME          tmux セッション名 (default: slide-stock-agents)
#   --interval SECONDS      task-runner のチェック間隔 (default: 30)
#   --dev-permission MODE   dev用の permission (default: plan)
#   --dev-model MODEL       dev用のモデル (optional)
#   --pm-model MODEL        pm用のモデル (optional)
#   --qa-model MODEL        qa用のモデル (optional)
#   --kill                  既存セッションを kill してから作り直す
#
# NOTE:
# - tasks/TASKS.md のタスクを @pm/@qa/@dev に振り分ける運用を想定
# - tmux が必要
# ============================================================

SESSION="slide-stock-agents"
INTERVAL="30"
DEV_PERMISSION="plan"
PM_MODEL=""
QA_MODEL=""
DEV_MODEL=""
KILL=false

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --session NAME          tmux session name (default: ${SESSION})
  --interval SECONDS      runner interval seconds (default: ${INTERVAL})
  --dev-permission MODE   dev permission (default: ${DEV_PERMISSION})
  --pm-model MODEL        pm model (optional)
  --qa-model MODEL        qa model (optional)
  --dev-model MODEL       dev model (optional)
  --kill                  kill existing session if exists
  -h, --help              show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --dev-permission) DEV_PERMISSION="$2"; shift 2 ;;
    --pm-model) PM_MODEL="$2"; shift 2 ;;
    --qa-model) QA_MODEL="$2"; shift 2 ;;
    --dev-model) DEV_MODEL="$2"; shift 2 ;;
    --kill) KILL=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

command -v tmux >/dev/null 2>&1 || die "tmux not found. Please install tmux."

cd "$PROJECT_DIR"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  if $KILL; then
    tmux kill-session -t "$SESSION"
  else
    echo "Session already exists: $SESSION"
    echo "Attach: tmux attach -t $SESSION"
    echo "Or recreate with: $0 --kill"
    exit 0
  fi
fi

# Build commands per role
pm_cmd="cd \"$PROJECT_DIR\" && ROLE=pm INTERVAL=$INTERVAL ./scripts/task-runner.sh"
qa_cmd="cd \"$PROJECT_DIR\" && ROLE=qa INTERVAL=$INTERVAL ./scripts/task-runner.sh"
dev_cmd="cd \"$PROJECT_DIR\" && ROLE=dev INTERVAL=$INTERVAL CLAUDE_PERMISSION=$DEV_PERMISSION ./scripts/task-runner.sh"

if [[ -n "$PM_MODEL" ]]; then pm_cmd="$pm_cmd --model \"$PM_MODEL\""; fi
if [[ -n "$QA_MODEL" ]]; then qa_cmd="$qa_cmd --model \"$QA_MODEL\""; fi
if [[ -n "$DEV_MODEL" ]]; then dev_cmd="$dev_cmd --model \"$DEV_MODEL\""; fi

# Create session with one window
tmux new-session -d -s "$SESSION" -n agents

# Layout:
#  +-------------------+-------------------+
#  |        PM         |        QA         |
#  +-------------------+-------------------+
#  |                 DEV                   |
#  +---------------------------------------+

# Split right for QA
tmux split-window -h -t "$SESSION:agents"

# Split bottom for DEV (split from left pane so dev is bottom-left by default)
tmux select-pane -t "$SESSION:agents.0"
tmux split-window -v -t "$SESSION:agents.0"

# Make bottom pane span full width by swapping and resizing (simple approach: use tiled layout then resize)
tmux select-layout -t "$SESSION:agents" tiled

# Put names on panes (status line)
tmux set-option -t "$SESSION" -g pane-border-status top
tmux set-option -t "$SESSION" -g pane-border-format "#{pane_index} #{pane_title}"

tmux select-pane -t "$SESSION:agents.0"
tmux select-pane -t "$SESSION:agents.1"
tmux select-pane -t "$SESSION:agents.2"

tmux select-pane -t "$SESSION:agents.0"
tmux select-pane -T "PM"
tmux send-keys -t "$SESSION:agents.0" "$pm_cmd" C-m

tmux select-pane -t "$SESSION:agents.1"
tmux select-pane -T "QA"
tmux send-keys -t "$SESSION:agents.1" "$qa_cmd" C-m

tmux select-pane -t "$SESSION:agents.2"
tmux select-pane -T "DEV"
tmux send-keys -t "$SESSION:agents.2" "$dev_cmd" C-m

# A nicer layout: even top panes, larger bottom.
# (May vary by terminal size; safe defaults)
tmux select-layout -t "$SESSION:agents" even-horizontal
tmux resize-pane -t "$SESSION:agents.2" -y 18 2>/dev/null || true

tmux attach -t "$SESSION"

