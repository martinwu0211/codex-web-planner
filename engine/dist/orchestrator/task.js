import crypto from "node:crypto";
import path from "node:path";
import { askChatGpt } from "../browser/supervisor.js";
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
export async function startPlanning(goal, timeoutMs = 120_000) {
    const task = { taskId: crypto.randomUUID(), goal, phase: "planning", updatedAt: new Date().toISOString() };
    saveTask(task);
    const result = await askChatGpt(`You are the planning and review brain for Codex Web Planner.\nTask ID: ${task.taskId}\nGoal: ${goal}\nReturn ONLY JSON in this schema: {"steps":[{"id":"step-1","action":"...","verification":"..."}],"risks":["..."],"verification":["..."]}. Do not edit files.`, 9222, timeoutMs);
    if (!result.ok)
        return { task: saveTask({ ...task, phase: "blocked", updatedAt: new Date().toISOString() }), ...result };
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
    const result = await askChatGpt(`Review Codex execution for task ${reviewing.taskId}.\nOriginal goal: ${reviewing.goal}\nPlan: ${reviewing.plan ?? "(missing)"}\nExecution result:\n${resultText}\nReturn PASS or FIXES with concise evidence. Do not edit files.`, 9222, timeoutMs);
    const done = result.ok && /^\s*PASS\b/i.test(result.response ?? "");
    const task = saveTask({ ...reviewing, phase: done ? "done" : result.ok ? "executing" : "blocked", review: result.response, updatedAt: new Date().toISOString() });
    return { task, ok: result.ok, code: result.code, message: result.message };
}
export function plannerStatus() { return readTask(); }
//# sourceMappingURL=task.js.map