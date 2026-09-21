#!/usr/bin/env bash
set -euo pipefail
session="codex-planner"
workspace="${1:-$(pwd)}"
if tmux has-session -t "$session" 2>/dev/null; then
  exec tmux attach-session -t "$session"
fi
tmux new-session -s "$session" -c "$workspace" "codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C '$workspace'"
