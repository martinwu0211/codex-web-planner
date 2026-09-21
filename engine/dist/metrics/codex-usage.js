import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function asRecord(value) {
    return value && typeof value === "object" ? value : null;
}
function number(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function sessionFile(sessionId) {
    const root = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const sessions = path.join(root, "sessions");
    if (!fs.existsSync(sessions))
        return null;
    const matches = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(full);
            else if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`))
                matches.push(full);
        }
    };
    walk(sessions);
    return matches.length === 1 ? matches[0] : null;
}
function remaining(window) {
    const used = number(window?.used_percent);
    if (used === null || used < 0 || used > 100)
        return null;
    return `${Math.max(0, 100 - used)}%`;
}
/** Read only the current Codex thread's local records; no network or credentials. */
export function readCodexUsage() {
    const sessionId = process.env.CODEX_THREAD_ID ?? null;
    if (!sessionId)
        return { available: false, sessionId: null, inputTokens: null, outputTokens: null, totalTokens: null, fiveHourRemaining: null, weeklyRemaining: null, reason: "CODEX_THREAD_ID 未设置" };
    const file = sessionFile(sessionId);
    if (!file)
        return { available: false, sessionId, inputTokens: null, outputTokens: null, totalTokens: null, fiveHourRemaining: null, weeklyRemaining: null, reason: "找不到当前会话记录" };
    let lines;
    try {
        const raw = fs.readFileSync(file, "utf8");
        lines = raw.split("\n").slice(-2000).reverse();
    }
    catch {
        return { available: false, sessionId, inputTokens: null, outputTokens: null, totalTokens: null, fiveHourRemaining: null, weeklyRemaining: null, reason: "无法读取当前会话记录" };
    }
    let usage = null;
    let limits = null;
    for (const line of lines) {
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            continue;
        }
        const payload = asRecord(event.payload);
        if (!payload)
            continue;
        if (!usage && event.type === "token_usage_record")
            usage = asRecord(payload.usage) ?? asRecord(payload.thread_token_usage);
        if (!limits) {
            const rate = asRecord(payload.rate_limits);
            if (rate)
                limits = rate;
        }
        if (usage && limits)
            break;
    }
    const primary = asRecord(limits?.primary);
    const secondary = asRecord(limits?.secondary);
    const byMinutes = new Map();
    if (primary) {
        const n = number(primary.window_minutes);
        if (n !== null)
            byMinutes.set(n, primary);
    }
    if (secondary) {
        const n = number(secondary.window_minutes);
        if (n !== null)
            byMinutes.set(n, secondary);
    }
    const inputTokens = number(usage?.input_tokens);
    const outputTokens = number(usage?.output_tokens);
    const totalTokens = number(usage?.total_tokens);
    return {
        available: usage !== null || limits !== null,
        sessionId,
        inputTokens,
        outputTokens,
        totalTokens,
        fiveHourRemaining: remaining(byMinutes.get(300)),
        weeklyRemaining: remaining(byMinutes.get(10080)),
        reason: usage || limits ? undefined : "当前会话还没有用量快照",
    };
}
//# sourceMappingURL=codex-usage.js.map