# Codex Web Planner

ChatGPT plans and reviews. Codex executes.

Codex Web Planner turns ChatGPT into the planning brain for a Codex coding session. ChatGPT reads the workspace through a read-only connection, produces a concrete plan, and reviews the result. Codex keeps control of edits, commands, tests, and commits.

## Install

Import this plugin directory into Codex, then ask Codex:

> Set up Codex Web Planner for this workspace.

The first setup builds the local bridge and opens the one-time ChatGPT authorization step. Use your own ChatGPT account. After setup, ask Codex to use the planner for a coding task.

The plugin checks the connection before planning. `c2c status --json` reports an error code, a plain-language explanation, and the next action. The agent uses that diagnostic to repair the local bridge automatically when possible. If user authorization is required, it gives the displayed connection address and pairing code, then verifies the result instead of claiming success early.

## What this version promises

- ChatGPT receives read-only workspace context through MCP.
- Codex keeps all file edits, shell commands, tests, and commits.
- The control loop is plan → approve → execute → review.
- Credentials, tokens, domains, and workspace paths stay out of the plugin package.

## Local setup

From this directory, run `./scripts/setup.sh`. The script installs dependencies and builds the bridge in `engine/`. It does not create credentials or send workspace data anywhere.

## Measuring context usage

The bridge keeps a local, content-free aggregate at the platform state directory under
`metrics/token-usage.json`. It records request/response character counts and a rough token estimate
(characters divided by four); it never stores MCP content, credentials, or workspace paths. Use the
file to compare the compact control-message workflow with a baseline task run. The CLI also shows
the current total under `c2c status`; use `c2c usage` for the full breakdown. To disable or restore
new measurements, run `c2c prefs set --token-metrics off` or `c2c prefs set --token-metrics on`.

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

### CLI status footer

Every `c2c status`/`c2c usage` invocation shows the plugin state, Usage, saved-token estimate, and the `5h`/`1 week` quota fields. If ChatGPT is not authorized, the footer says `插件：未生效（ChatGPT 未连接）` and the diagnostic gives the exact repair command. Saved tokens require a trusted comparison baseline via `C2C_BASELINE_TOKENS`; quota values can be supplied by a trusted host integration with `C2C_QUOTA_5H` and `C2C_QUOTA_WEEK`.
