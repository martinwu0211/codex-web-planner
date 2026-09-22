import crypto from "node:crypto";
import path from "node:path";
import { askChatGpt, startBrowser } from "../browser/supervisor.js";
import { getStateDir, readJsonIfExists, writeSecureJson, ensureDir } from "../config/paths.js";
const taskFile = () => path.join(getStateDir(), "orchestrator", "task.json");
const readTask = () => readJsonIfExists(taskFile());
const saveTask = (task) => { ensureDir(path.dirname(taskFile())); writeSecureJson(taskFile(), task); return task; };
function parsePlan(text) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
    if (!match)
        return null;
    try {
        const raw = JSON.parse(match[1] ?? match[0]);
        if (!Array.isArray(raw.steps) || raw.steps.length === 0)
            return null;
        const steps = raw.steps.map((step, index) => {
            const item = step;
            return { id: String(item.id ?? `step-${index + 1}`), action: String(item.action ?? ""), verification: item.verification ? String(item.verification) : undefined };
        }).filter((step) => step.action.trim());
        return { steps, risks: Array.isArray(raw.risks) ? raw.risks.map(String) : [], verification: Array.isArray(raw.verification) ? raw.verification.map(String) : [] };
    }
    catch {
        return null;
    }
}
export async function startPlanning(goal, timeoutMs = 120_000, mode = "auto", onWait) {
    const task = { taskId: crypto.randomUUID(), goal, mode, phase: mode === "codex" ? "executing" : "planning", updatedAt: new Date().toISOString() };
    saveTask(task);
    if (mode === "codex")
        return { task, ok: true, code: "CODEX_NATIVE_MODE", message: "ChatGPT is disabled; continue with native Codex execution." };
    let result;
    try {
        await startBrowser();
        result = await askChatGpt(`You are the planning and review brain for Codex Web Planner.\nTask ID: ${task.taskId}\nGoal: ${goal}\nReturn ONLY JSON in this schema: {"steps":[{"id":"step-1","action":"...","verification":"..."}],"risks":["..."],"verification":["..."]}. Do not edit files.`, 9222, timeoutMs, onWait);
    }
    catch (error) {
        result = { ok: false, code: "CHATGPT_BROWSER_ERROR", message: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok && mode === "auto") {
        try {
            await startBrowser();
            result = await askChatGpt(`Retry planning for task ${task.taskId}. Goal: ${goal}. Return only the required JSON plan schema.`, 9222, timeoutMs, onWait);
        }
        catch (error) {
            result = { ok: false, code: "CHATGPT_BROWSER_ERROR", message: error instanceof Error ? error.message : String(error) };
        }
    }
    if (!result.ok) {
        if (mode === "auto")
            return { task: saveTask({ ...task, phase: "executing", mode: "codex", fallbackReason: `${result.code}: ${result.message}`, updatedAt: new Date().toISOString() }), ok: true, code: "FALLBACK_CODEX", message: `ChatGPT unavailable; automatically switched to native Codex execution (${result.code}).` };
        return { task: saveTask({ ...task, phase: "blocked", updatedAt: new Date().toISOString() }), ...result };
    }
    const parsed = parsePlan(result.response ?? "");
    if (!parsed)
        return { task: saveTask({ ...task, phase: "blocked", plan: result.response, updatedAt: new Date().toISOString() }), ok: false, code: "PLAN_PARSE_FAILED", message: "ChatGPT returned a response that does not match the required plan schema." };
    const next = saveTask({ ...task, phase: "executing", plan: result.response, ...parsed, updatedAt: new Date().toISOString() });
    return { task: next, ok: true, code: result.code, message: result.message };
}
export async function reviewExecution(resultText, timeoutMs = 120_000) {
    const current = readTask();
    if (!current)
        return { task: null, ok: false, code: "TASK_NOT_FOUND", message: "No planner task is active." };
    const reviewing = saveTask({ ...current, phase: "reviewing", updatedAt: new Date().toISOString() });
    if (reviewing.mode === "codex")
        return { task: saveTask({ ...reviewing, phase: "done", review: "Skipped: native Codex mode", updatedAt: new Date().toISOString() }), ok: true, code: "CODEX_NATIVE_REVIEW_SKIPPED", message: "Native Codex mode completed without ChatGPT review." };
    const result = await askChatGpt(`Review Codex execution for task ${reviewing.taskId}.\nOriginal goal: ${reviewing.goal}\nPlan: ${reviewing.plan ?? "(missing)"}\nExecution result:\n${resultText}\nReturn PASS or FIXES with concise evidence. Do not edit files.`, 9222, timeoutMs);
    if (!result.ok && reviewing.mode === "auto")
        return { task: saveTask({ ...reviewing, phase: "done", fallbackReason: `${result.code}: ${result.message}`, review: "ChatGPT review unavailable; accepted native Codex completion.", updatedAt: new Date().toISOString() }), ok: true, code: "REVIEW_FALLBACK_CODEX", message: "ChatGPT review unavailable; task completed in native Codex fallback mode." };
    const done = result.ok && /^\s*PASS\b/i.test(result.response ?? "");
    const task = saveTask({ ...reviewing, phase: done ? "done" : result.ok ? "executing" : "blocked", review: result.response, updatedAt: new Date().toISOString() });
    return { task, ok: result.ok, code: result.code, message: result.message };
}
export function plannerStatus() { return readTask(); }
//# sourceMappingURL=task.js.map