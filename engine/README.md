# Codex Web Planner engine

This directory contains the local runtime bundled by the Codex Web Planner plugin.
It starts the workspace bridge, exposes the scoped MCP endpoint, waits for the user's
ChatGPT authorization, and records local status and usage metrics.

The engine is embedded in the public `codex-web-planner` plugin. Users should install
that plugin through Codex; they do not need to install this directory or a separate
upstream product. The upstream MIT license and attribution are retained in
`LICENSE` and `../THIRD_PARTY_NOTICES.md`.

## Development

Use `pnpm install` and `pnpm build` for a source checkout. The published plugin includes
`dist/`, so a clean user install needs only production dependencies.
