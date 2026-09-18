# Embedded engine

This directory contains the embedded MIT-licensed `codex-with-chatgpt` engine used by Codex Web Planner.

The public plugin entry point is the repository root and `.codex-plugin/plugin.json`. Install and use the
`codex-web-planner` skill from `skills/codex-web-planner/`; the embedded engine's upstream skill is not a
second plugin skill and is intentionally not loaded separately.

See [LICENSE](LICENSE) for the engine license and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for
third-party attribution. Engine implementation details and tests remain in this directory.
