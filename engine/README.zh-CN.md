# Codex Web Planner Runtime Engine

This directory contains the local runtime bundled with the Codex Web Planner plugin, which starts the workspace Bridge,
provides a restricted MCP endpoint, waits for the user to complete ChatGPT authorization, and records local status and usage.

It is part of the public `codex-web-planner` plugin. Users should install the plugin through Codex,
without installing this directory or other upstream products separately. The upstream MIT license and attribution are retained in
`LICENSE` and `../THIRD_PARTY_NOTICES.md`.

## Development

Use `pnpm install` and `pnpm build` after checking out the source. The published plugin already includes `dist/`,
so a clean installation requires only production dependencies.
