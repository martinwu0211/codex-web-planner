---
name: codex-web-planner
description: Use for every task in this workspace. Keep the ChatGPT connection state visible, use the user's authorized ChatGPT connection for planning/review when requested, and append the complete plugin status footer to every completed response.
---

# Codex Web Planner

Use this skill when the user asks to plan, review, or execute a coding task with ChatGPT assisting Codex.

## Behavior

1. On first use, run the bundled setup flow from this installed plugin. Do not require a global npm install, PATH change, or a manually installed `c2c`: resolve the plugin's bundled `engine/bin/c2c.js` and invoke it with Node when the `c2c` command is unavailable. Do not merely say that setup started: run the bundled CLI's `status --json` afterward and report `chatgptConnection.authorized`. If it is false, guide the user through the shortest path: run the bundled CLI's `setup`, open the displayed connection address in ChatGPT's connector settings, enter the displayed pairing code, then rerun `status --json` until authorization is confirmed. If it is true but `recentMcpExchange` is false, report that authorization exists but no recent ChatGPT request has been observed, and ask the user to open or refresh the connected ChatGPT conversation.
   Treat `diagnostic.code`, `diagnostic.message`, and `diagnostic.nextAction` as the source of truth for connection errors. Explain the error in one sentence, execute the suggested local command when it is safe, and re-check status. Do not repeatedly ask the user to retry the same step.
2. Keep workspace access read-only for ChatGPT. Do not upload the repository as an archive.
3. Send only compact control messages between Codex and ChatGPT. Let ChatGPT read the required files through MCP.
4. Execute edits, commands, tests, and commits in Codex after the user approves the plan.
5. Return the review result and any remaining decision to the user.

## Connection confirmation

Before using ChatGPT for a plan or review, show a concise connection check:

```text
ChatGPT 授权：已连接 / 未连接
ChatGPT 通信：最近 10 分钟有响应 / 尚未检测到
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
If the error is CHATGPT_NOT_AUTHORIZED or CHATGPT_PAIRING_PENDING, run c2c setup and present the displayed address and pairing code with three short steps for the user to complete authorization in ChatGPT. Do not request credentials or claim success before status reports authorized=true.
If the error is CHATGPT_NO_RECENT_MCP, tell the user authorization exists but ChatGPT has not contacted the bridge; ask them to open or refresh the connected ChatGPT conversation, then check status again.
If diagnostic.code is OK, proceed with the requested plan/review. Always report the final connection state and any unresolved error code.
```

## Task response footer

After every completed user task, append one compact footer line. Generate the local time at response time and obtain the other fields from the latest bundled CLI status/usage result:

```text
done HH:MM AM/PM · Plugin: active/effectively inactive · ChatGPT: connected/not connected · Usage: N tokens · Saved: N tokens or baseline unavailable · 5h: value/unavailable · 1 week: value/unavailable
```

If the plugin is installed but ChatGPT authorization is missing, use `Plugin: installed, inactive` and `ChatGPT: not connected`. Never hide the connection error or invent quota/savings values. Keep this footer at the end of the final task response; do not add it to intermediate progress messages.
