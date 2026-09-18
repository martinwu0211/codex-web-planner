#!/usr/bin/env bash
set -euo pipefail

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
engine_dir="$root_dir/engine"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 20 or newer is required.' >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  printf '%s\n' 'Node.js 20 or newer is required.' >&2
  exit 1
fi

cd "$engine_dir"
if corepack pnpm --version >/dev/null 2>&1; then
  corepack pnpm install
  corepack pnpm build
else
  npx --yes pnpm@11.24.0 install
  npx --yes pnpm@11.24.0 build
fi
printf '%s\n' 'Codex Web Planner is ready. Ask Codex to complete the one-time ChatGPT connection.'
