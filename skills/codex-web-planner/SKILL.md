---
name: codex-web-planner
description: Use ChatGPT through the user's own authorized connection to plan and review coding work while Codex performs execution.
---

# Codex Web Planner

Use this skill when the user asks to plan, review, or execute a coding task with ChatGPT assisting Codex.

## Behavior

1. On first use, run the bundled setup flow and ask the user to complete the one-time authorization in their own ChatGPT account.
2. Keep workspace access read-only for ChatGPT. Do not upload the repository as an archive.
3. Send only compact control messages between Codex and ChatGPT. Let ChatGPT read the required files through MCP.
4. Execute edits, commands, tests, and commits in Codex after the user approves the plan.
5. Return the review result and any remaining decision to the user.

Never ask for, store, or reuse another person's ChatGPT credentials. Never put tokens, private URLs, machine paths, or session IDs in this plugin.
