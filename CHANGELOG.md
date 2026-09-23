# Changelog

## 0.1.47

- New installations default to Codex mode. Mode selection is checked before connection side effects.
- A successful GPT response promotes Auto to Chat; failed Chat calls return to Auto while Codex continues locally. Auto retries on subsequent tasks, with at most one retry per task.
- Codex mode blocks browser setup, pairing, connection repair, planning calls, and reviews, including old tasks and replies arriving after a manual mode switch.
- Planner commands inherit saved mode instead of silently defaulting to Auto.
- Clarify built-in and managed-browser support, and separate workspace authorization from verified GPT communication.
- Preserve cumulative Codex usage readings and describe token comparisons as baseline differences, not proven savings.
