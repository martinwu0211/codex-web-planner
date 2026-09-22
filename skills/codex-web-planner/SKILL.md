---
name: codex-web-planner
description: Use for every task in this workspace. Keep the ChatGPT connection state visible, use the user's authorized ChatGPT connection for planning/review when requested, and append the complete plugin status footer to every completed response.
---

# Codex Web Planner

Use this skill when the user asks to plan, review, or execute a coding task with ChatGPT assisting Codex.

## Behavior

0. Read the saved work mode before each task. In `auto`, prefer Chat mode when the browser and ChatGPT connector are available, and fall back to native Codex execution on any browser, login, connector, or timeout failure. In `chat`, run `node engine/bin/c2c.js browser start` before setup, then `node engine/bin/c2c.js planner start --goal <goal>` to persist a task and wait for a real ChatGPT plan; after Codex executes, run `node engine/bin/c2c.js planner review --result <summary>` and continue fixing until the review passes. In `codex`, do not start a browser or wait for ChatGPT. Never report Chat mode as active unless a real MCP exchange has been observed.

1. Treat the first ordinary user task after installation as an end-to-end onboarding task. Before asking the user anything, run the bundled status check; if this workspace is not authorized, automatically start setup and continue through dependency installation, Developer mode, connector creation, pairing, and verification. The user should only need to handle ChatGPT login, CAPTCHA, 2FA, or final consent. A request such as “install the plugin at `<GitHub URL>`” is also an end-to-end onboarding task: resolve the repository/plugin name, use Codex's plugin marketplace/add commands, verify the installed version, and report progress as `[1/5]` through `[5/5]`. Do not ask the user to clone a repository, paste a long setup prompt, or install npm dependencies manually; only stop for Codex's normal approval prompt or a ChatGPT account authorization step.
2. On first use, run the bundled setup flow from the installed plugin. Do not require a global npm install, PATH change, or a manually installed `c2c`: resolve the plugin's bundled `engine/bin/c2c.js` and invoke it with Node when the `c2c` command is unavailable. The bundled launcher automatically installs its production dependencies into the plugin cache if they are missing. Run the bundled CLI's `status --json` afterward and report `chatgptConnection.authorized`.
3. If authorization is false, immediately execute the bundled CLI's `setup` (prefer the secure tunnel/default setup; use local-only mode only when the user explicitly requests it). If Codex's built-in in-app browser is available, use the automatic ChatGPT setup below: keep one foreground ChatGPT tab, open the connector form, fill the current MCP URL and `Codex Web Planner` name, select OAuth, and authorize. The user only handles a ChatGPT login, CAPTCHA/2FA, or an explicit consent screen. If the in-app browser is unavailable, use the guided manual fallback: show a prominent `⚠️⚠️⚠️ ChatGPT authorization is required in the browser ⚠️⚠️⚠️` message with the direct settings URL, MCP address, and pairing code. In either mode, invoke `wait-auth --timeout-seconds 300` (five-minute default; never wait longer than twenty minutes), which must repeat a visible waiting message at least every 30 seconds. After authorization, rerun `status --json` and continue automatically.
   If `wait-auth` returns `CHATGPT_AUTH_TIMEOUT`, mark the task `aborted_pending_user_authorization`, clearly say that the task stopped because login was not detected, and do not claim installation is complete. When the user says “continue”, “reconnect”, or equivalent, run `setup` again to create a fresh pairing address/code and start a new five-minute wait; never reuse an expired pairing code.
4. If authorization is true but `recentMcpExchange` is false, report that authorization exists but no recent ChatGPT request has been observed, ask the user to open or refresh the connected ChatGPT conversation, and rerun the check.
5. Keep workspace access read-only for ChatGPT. Do not upload the repository as an archive.
6. Send only compact control messages between Codex and ChatGPT. Let ChatGPT read the required files through MCP.
7. Execute edits, commands, tests, and commits in Codex after the user approves the plan.
8. Return the review result and any remaining decision to the user.
   Treat `diagnostic.code`, `diagnostic.message`, and `diagnostic.nextAction` as the source of truth for connection errors. Explain the error in one sentence, execute the suggested local command when it is safe, and re-check status. Do not repeatedly ask the user to retry the same step.
## Connection confirmation

This is a public plugin. Prefer Codex's built-in in-app browser for ChatGPT setup; it is the supported automatic path and never requires noVNC, a VPS browser, Chrome CDP, a pre-authenticated browser profile, or access to the user's cookies. If the built-in browser is unavailable, use the guided manual fallback. Never use an external browser silently.

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
automatic setup ran; use the manual path and report that limitation.

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
You are operating Codex Web Planner. Before asking the user anything, verify the ChatGPT connection with:
  c2c status --json (or the bundled engine CLI via `node engine/bin/c2c.js status --json` when c2c is not on PATH)
Read diagnostic.code, diagnostic.message, and diagnostic.nextAction.
If the bridge is stopped or unhealthy, run the safe local repair using the bundled engine (c2c start or the bundled `node engine/bin/c2c.js doctor --no-fix` for diagnosis, then doctor when repair is appropriate) and check status again.
If the error is CHATGPT_NOT_AUTHORIZED or CHATGPT_PAIRING_PENDING, run the bundled setup command now and present the displayed address and pairing code with three short steps for the user to complete authorization in ChatGPT. Do not request credentials or claim success before status reports authorized=true. The task is not complete while setup has not been attempted.
If the error is CHATGPT_NO_RECENT_MCP, tell the user authorization exists but ChatGPT has not contacted the bridge; ask them to open or refresh the connected ChatGPT conversation, then check status again.
If diagnostic.code is OK, proceed with the requested plan/review. Always report the final connection state and any unresolved error code.
```

## Task response footer

After every completed user task, append one compact footer line. Generate the local time at response time and obtain the other fields from the latest bundled CLI status/usage result:

```text
done HH:MM AM/PM · Plugin: active/effectively inactive · ChatGPT: connected/not connected · Usage: N tokens · Saved: N tokens or baseline unavailable · 5h: value/unavailable · 1 week: value/unavailable
```

If the plugin is installed but ChatGPT authorization is missing, use `Plugin: installed, inactive` and `ChatGPT: not connected`. Never hide the connection error or invent quota/savings values. Keep this footer at the end of the final task response; do not add it to intermediate progress messages.
