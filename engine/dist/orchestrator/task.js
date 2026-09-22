import crypto from "node:crypto";
import path from "node:path";
import { askChatGpt } from "../browser/supervisor.js";
import { getStateDir, readJsonIfExists, writeSecureJson, ensureDir } from "../config/paths.js";
const taskFile = () => path.join(getStateDir(), "orchestrator", "task.json");
const readTask = () => readJsonIfExists(taskFile());
const saveTask = (task) => { ensureDir(path.dirname(taskFile())); writeSecureJson(taskFile(), task); return task; };
export async function startPlanning(goal, timeoutMs = 120_000) {
    const task = { taskId: crypto.randomUUID(), goal, phase: "planning", updatedAt: new Date().toISOString() };
    saveTask(task);
    const result = await askChatGpt(`You are the planning and review brain for Codex Web Planner.\nTask ID: ${task.taskId}\nGoal: ${goal}\nReturn a concise implementation plan with risks and verification steps. Do not edit files.`, 9222, timeoutMs);
    if (!result.ok)
        return { task: saveTask({ ...task, phase: "blocked", updatedAt: new Date().toISOString() }), ...result };
    const next = saveTask({ ...task, phase: "executing", plan: result.response, updatedAt: new Date().toISOString() });
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