---
name: codex-web-planner
description: Use for every task in this workspace. Keep the ChatGPT connection state visible, use the user's authorized ChatGPT connection for planning/review when requested, and append the complete plugin status footer to every completed response.
---

# Codex Web Planner

Use this skill when the user asks to plan, review, or execute a coding task with ChatGPT assisting Codex.

## Work mode is the first gate

Before connection checks, onboarding, dependency repair, browser actions, planning, or review, read the saved `workMode` from `c2c prefs --json`. If the CLI is broken, read the existing state directory's `prefs.json` directly; do not bootstrap dependencies just to read the mode. This gate overrides every connection/setup/self-repair instruction below and legacy ChatGPT integration workflows. It does not override system instructions or the user's explicit instructions.

- `codex`: execute in native Codex. Do not start or repair a Bridge/tunnel/browser, create pairing codes, ask for login/authorization, or send ChatGPT plans/reviews. Missing authorization is expected, not a repair trigger. Read-only status checks and explicitly requested local plugin maintenance are allowed. Do not follow a status diagnostic's connection action in this mode.
- `auto`: reconnect automatically on subsequent tasks, with at most one repair/retry per task. If unavailable, finish the current task in native Codex while keeping saved mode `auto`. Do not block unrelated work on login or pairing.
- `chat`: use the verified ChatGPT connection. A failed call persists `auto` and continues locally; later tasks retry the connection.

New installations default to `codex`. An explicit user request to connect GPT first saves `auto` to opt into connection attempts. Only a real successful response promotes the saved mode to `chat`; pairing or a running browser alone is insufficient. A switch to `codex` during a pending response cancels further polling and cannot be overwritten by that response.

A user request to switch modes must first persist `c2c prefs set --work-mode <mode> --json` and read it back. A saved `codex` mode cannot be bypassed by a planner flag or an old task saved in `chat` mode. Resume connection only after the user requests switching away from Codex mode. When pausing an in-progress connection, stop only the connection service started for that attempt; preserve browser profiles and other tabs.

## Behavior

Only after the work-mode gate permits ChatGPT setup, use this onboarding flow; the user must not paste another setup prompt or run `c2c` manually. Resolve the bundled engine, install production dependencies, read the saved work mode, reuse a configured CDP browser when present, otherwise start the managed Chromium browser, open ChatGPT, and continue setup. Stop only for ChatGPT login, CAPTCHA, 2FA, or final consent, then resume automatically after the user completes that action.

## Agent self-repair and visible progress

Use the installed plugin as an agent workflow, not as a blind script. At the beginning of every task, announce a short stage such as `[1/5] checking plugin`, `[2/5] checking browser`, or `[3/5] waiting for ChatGPT login`. While waiting for login, consent, or an assistant response, emit a visible heartbeat at least every 30 seconds. If the user asks what they need to do during a wait, report the current stage, exact required action, and that the task will resume automatically; do not restart setup or create a second task.

When a step fails, inspect and repair it before asking the user. The canonical repair paths are:

- bundled CLI: `engine/bin/c2c.js` (run it with Node when `c2c` is unavailable);
- plugin engine dependencies: the installed plugin's `engine/` directory and its package manifest;
- persistent state: `${CODEX_STATE_DIR}/browser/`, `${CODEX_STATE_DIR}/orchestrator/`, and `${CODEX_STATE_DIR}/sessions/` (use the resolved Codex state directory, never invent a second one);
- managed browser profile: `${CODEX_STATE_DIR}/browser/profile/`;
- browser control: `c2c browser status`, `c2c browser start`, and `c2c browser ask`;
- planner loop: `c2c planner status`, `c2c planner start`, and `c2c planner review`;
- Bridge diagnosis: `c2c status --json` followed by the reported `diagnostic.nextAction`.

Self-repair rules: install missing bundled dependencies, restart a stale Bridge, reuse the existing CDP browser before launching another one, remove only stale runtime files after confirming the process is gone, retry one time after a browser or connector failure, and then switch to native Codex mode in `auto`. Never loop indefinitely, delete the user's browser profile to fix a login problem, claim a local MCP call was a ChatGPT call, or request credentials. Include the exact path and command being repaired in progress output so another Agent can continue from the same state.

0. Read the saved work mode before each task. In `auto`, prefer Chat mode when the browser and ChatGPT connector are available, and fall back to native Codex execution on any browser, login, connector, or timeout failure. In `chat`, run `node engine/bin/c2c.js browser start` before setup, then `node engine/bin/c2c.js planner start --goal <goal>` to persist a task and wait for a real ChatGPT plan; after Codex executes, run `node engine/bin/c2c.js planner review --result <summary>` and continue fixing until the review passes. In `codex`, do not start a browser or wait for ChatGPT. Never report Chat mode as active unless a real MCP exchange has been observed.

1. Treat the first ordinary user task after installation as an end-to-end onboarding task. Before asking the user anything, run the bundled status check; if this workspace is not authorized, automatically start setup and continue through dependency installation, Developer mode, connector creation, pairing, and verification. The user should only need to handle ChatGPT login, CAPTCHA, 2FA, or final consent. A request such as “install the plugin at `<GitHub URL>`” is also an end-to-end onboarding task: resolve the repository/plugin name, use Codex's plugin marketplace/add commands, verify the installed version, and report progress as `[1/5]` through `[5/5]`. Do not ask the user to clone a repository, paste a long setup prompt, or install npm dependencies manually; only stop for Codex's normal approval prompt or a ChatGPT account authorization step.
2. On first use, run the bundled setup flow from the installed plugin. Do not require a global npm install, PATH change, or a manually installed `c2c`: resolve the plugin's bundled `engine/bin/c2c.js` and invoke it with Node when the `c2c` command is unavailable. The bundled launcher automatically installs its production dependencies into the plugin cache if they are missing. Run the bundled CLI's `status --json` afterward and report `chatgptConnection.authorized`.
3. If authorization is false, immediately execute the bundled CLI's `setup` (prefer the secure tunnel/default setup; use local-only mode only when the user explicitly requests it). Then use the managed browser path, in this exact order: `browser start` → `browser connector --name "Codex Web Planner" --mcp-url <the URL printed by setup>`. This command opens the connector form, fills the name and current MCP URL, selects OAuth, and submits it; do not run ad-hoc DOM inspection or paste `example.com` into the form. The user only handles ChatGPT sign-in, CAPTCHA/2FA, and the pairing-code/final-consent screen. Show the pairing code prominently after sign-in, then invoke `wait-auth --timeout-seconds 300` (five-minute default; never wait longer than twenty minutes), which must repeat a visible waiting message at least every 30 seconds. After authorization, rerun `status --json` and continue automatically.
   If `wait-auth` returns `CHATGPT_AUTH_TIMEOUT`, mark the task `aborted_pending_user_authorization`, clearly say that the task stopped because login was not detected, and do not claim installation is complete. When the user says “continue”, “reconnect”, or equivalent, run `setup` again to create a fresh pairing address/code and start a new five-minute wait; never reuse an expired pairing code.
4. If authorization is true but `recentMcpExchange` is false, report that authorization exists but no recent ChatGPT request has been observed, ask the user to open or refresh the connected ChatGPT conversation, and rerun the check.
5. Keep workspace access read-only for ChatGPT. Do not upload the repository as an archive.
6. Send only compact control messages between Codex and ChatGPT. Let ChatGPT read the required files through MCP.
7. Execute edits, commands, tests, and commits in Codex after the user approves the plan.
8. Return the review result and any remaining decision to the user.
   Treat `diagnostic.code`, `diagnostic.message`, and `diagnostic.nextAction` as the source of truth for connection errors. Explain the error in one sentence, execute the suggested local command when it is safe, and re-check status. Do not repeatedly ask the user to retry the same step.
## Connection confirmation

After the work-mode gate, prefer an available built-in browser. If it is unavailable, the bundled `browser` commands can use an existing, user-authorized managed Chromium browser. Announce that path before using it. Only use manual setup when neither browser path is available. Do not confuse missing built-in browser tools with missing browser automation. Never use an external browser silently or access cookies or credentials.

## Automatic ChatGPT setup (built-in browser)

When the Codex client exposes `setupBrowserRuntime()` and `agent.browsers`, run the setup in one
foreground in-app browser tab. Reuse that tab and never open a second ChatGPT tab. Keep it visible
and marked as handed off while waiting for the user. Use direct URLs only:

- Developer mode: `https://chatgpt.com/#settings/Security` (skip when `c2c prefs --json` says it is already enabled).
- Connector creation: `https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins`.
- Installed connectors: `https://chatgpt.com/plugins`.

Create exactly one connector for the current workspace named `Codex Web Planner` (reuse this short
name when reconnecting). Fill the current public MCP URL, choose OAuth, and submit the
form. If ChatGPT presents a login, CAPTCHA, 2FA, or explicit consent screen, stop automation and
tell the user one concrete action; resume in the same tab after it is complete. Never type a password,
token, cookie, or session value. After the connector shows Connected/authorized, run `c2c pair --json`
and provide only the returned pairing code to the visible authorization form. Verify with
`workspace_info` before claiming success. If the built-in browser capability is absent, do not pretend
automatic setup ran; check the authorized managed-browser path before using manual setup.

Before using ChatGPT for a plan or review, show a concise connection check:

```text
ChatGPT authorization: connected / not connected
ChatGPT communication: response within the last 10 minutes / no recent response detected
```

Use `c2c status --json` as the source of truth. `tokenCount > 0` means the ChatGPT connector has authorized the workspace; `recentMcpExchange` means the bridge has observed an MCP request within the last ten minutes. Never claim that ChatGPT is connected based only on the bridge process being running.

Never ask for, store, or reuse another person's ChatGPT credentials. Never put tokens, private URLs, machine paths, or session IDs in this plugin.

## Agent self-repair prompt

Use this internal prompt at the start of every planner request:

```text
You are operating Codex Web Planner. First read workMode. In codex mode, stop this connection workflow and execute natively. Only when the mode permits ChatGPT, verify the connection with:
  c2c status --json (or the bundled engine CLI via `node engine/bin/c2c.js status --json` when c2c is not on PATH)
Read diagnostic.code, diagnostic.message, and diagnostic.nextAction.
If the bridge is stopped or unhealthy, run the safe local repair using the bundled engine (c2c start or the bundled `node engine/bin/c2c.js doctor --no-fix` for diagnosis, then doctor when repair is appropriate) and check status again.
If the error is CHATGPT_NOT_AUTHORIZED or CHATGPT_PAIRING_PENDING, run the bundled setup command, start the managed browser, and run the bundled `browser connector` command with the setup output. Present only the current connector name, MCP address, and pairing code with three short steps for the user to complete sign-in/pairing in ChatGPT. Do not request credentials or claim success before status reports authorized=true. The task is not complete while setup has not been attempted.
If the error is CHATGPT_NO_RECENT_MCP, tell the user authorization exists but ChatGPT has not contacted the bridge; ask them to open or refresh the connected ChatGPT conversation, then check status again.
If diagnostic.code is OK, proceed with the requested plan/review. Always report the final connection state and any unresolved error code.
```

## Task response footer

After every completed user task, append one compact footer line. Generate the local time at response time and obtain the other fields from the latest bundled CLI status/usage result:

```text
done HH:MM AM/PM · Plugin: active/effectively inactive · ChatGPT: connected/not connected · Usage: N tokens · Baseline delta: N tokens or baseline unavailable · 5h: value/unavailable · 1 week: value/unavailable
```

If the plugin is installed but ChatGPT authorization is missing, use `Plugin: installed, inactive` and `ChatGPT: not connected`. Never hide the connection error or invent quota/savings values. Keep this footer at the end of the final task response; do not add it to intermediate progress messages.
