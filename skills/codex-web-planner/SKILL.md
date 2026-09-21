---
name: codex-web-planner
description: Use ChatGPT through the user's own authorized connection to plan and review coding work while Codex performs execution.
---

# Codex Web Planner

Use this skill when the user asks to plan, review, or execute a coding task with ChatGPT assisting Codex.

## Behavior

1. On first use, run the bundled setup flow. Do not merely say that setup started: run `c2c status --json` afterward and report `chatgptConnection.authorized`. If it is false, guide the user through the shortest path: run `c2c setup`, open the displayed connection address in ChatGPT's connector settings, enter the displayed pairing code, then rerun `c2c status --json` until authorization is confirmed. If it is true but `recentMcpExchange` is false, report that authorization exists but no recent ChatGPT request has been observed, and ask the user to open or refresh the connected ChatGPT conversation.
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
  c2c status --json
Read diagnostic.code, diagnostic.message, and diagnostic.nextAction.
If the bridge is stopped or unhealthy, run the safe local repair (c2c start or c2c doctor --no-fix for diagnosis, then c2c doctor when repair is appropriate) and check status again.
If the error is CHATGPT_NOT_AUTHORIZED or CHATGPT_PAIRING_PENDING, run c2c setup and present the displayed address and pairing code with three short steps for the user to complete authorization in ChatGPT. Do not request credentials or claim success before status reports authorized=true.
If the error is CHATGPT_NO_RECENT_MCP, tell the user authorization exists but ChatGPT has not contacted the bridge; ask them to open or refresh the connected ChatGPT conversation, then check status again.
If diagnostic.code is OK, proceed with the requested plan/review. Always report the final connection state and any unresolved error code.
```
