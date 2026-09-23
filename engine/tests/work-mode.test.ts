import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeUiPrefs, readUiPrefs, recordChatOutcome } from "../src/config/ui-prefs.js";
import { cleanup, isolateStateDir } from "./helpers.js";
vi.mock("../src/browser/supervisor.js", () => ({ startBrowser: vi.fn(), askChatGpt: vi.fn() }));
import { startBrowser, askChatGpt } from "../src/browser/supervisor.js";
import { startPlanning, reviewExecution } from "../src/orchestrator/task.js";
const cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(cleanup); delete process.env.C2C_STATE_DIR; vi.clearAllMocks(); });
function codexState() { const dir = isolateStateDir(); dirs.push(dir); mergeUiPrefs({ workMode: "codex" }); return dir; }
describe("saved work mode takes precedence", () => {
  it("blocks clean-install setup before trying to install dependencies", () => {
    const dir = isolateStateDir(); dirs.push(dir);
    const launcher = path.join(dir, "c2c.mjs");
    fs.copyFileSync(fileURLToPath(new URL("../bin/c2c.js", import.meta.url)), launcher);
    const result = spawnSync(process.execPath, [launcher, "setup", "--json"], { env: process.env, encoding: "utf8", timeout: 10000 });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).code).toBe("CODEX_MODE_ACTIVE");
    expect(result.stderr).not.toContain("installing");
  });
  it("starts in codex and only a verified response selects chat", () => {
    const dir = isolateStateDir(); dirs.push(dir);
    expect(readUiPrefs().workMode).toBe("codex");
    expect(recordChatOutcome(true)).toBe("codex");
    mergeUiPrefs({ workMode: "auto" });
    expect(recordChatOutcome(true)).toBe("chat");
    expect(recordChatOutcome(false)).toBe("auto");
  });
  it("promotes auto to chat after a valid plan and retries subsequent auto tasks", async () => {
    const dir = isolateStateDir(); dirs.push(dir); mergeUiPrefs({ workMode: "auto" });
    vi.mocked(askChatGpt).mockResolvedValue({ ok: false, code: "OFFLINE", message: "offline" });
    await startPlanning("first", 1000);
    expect(askChatGpt).toHaveBeenCalledTimes(2); expect(readUiPrefs().workMode).toBe("auto");
    vi.mocked(askChatGpt).mockResolvedValue({ ok: true, code: "OK", message: "reply", response: '{"steps":[{"id":"1","action":"test"}]}' });
    await startPlanning("second", 1000);
    expect(askChatGpt).toHaveBeenCalledTimes(3); expect(readUiPrefs().workMode).toBe("chat");
  });
  it("does not let a late reply undo a user switch to codex", async () => {
    const dir = isolateStateDir(); dirs.push(dir); mergeUiPrefs({ workMode: "auto" });
    vi.mocked(askChatGpt).mockImplementation(async () => {
      mergeUiPrefs({ workMode: "codex" });
      return { ok: true, code: "OK", message: "late", response: '{"steps":[{"action":"late"}]}' };
    });
    expect((await startPlanning("pending", 1000)).task.mode).toBe("codex");
    expect(readUiPrefs().workMode).toBe("codex"); expect(askChatGpt).toHaveBeenCalledTimes(1);
  });

  it("does not start a browser even when planning explicitly requests chat", async () => {
    codexState();
    expect((await startPlanning("local task")).code).toBe("CODEX_NATIVE_MODE");
    expect((await startPlanning("local task", 1000, "chat")).code).toBe("CODEX_NATIVE_MODE");
    expect(startBrowser).not.toHaveBeenCalled(); expect(askChatGpt).not.toHaveBeenCalled();
  });
  it("does not review an old chat task after switching to codex", async () => {
    const dir = codexState();
    fs.mkdirSync(path.join(dir, "orchestrator"), { recursive: true });
    fs.writeFileSync(path.join(dir, "orchestrator/task.json"), JSON.stringify({ taskId: "old", goal: "old", mode: "chat", phase: "executing", updatedAt: new Date().toISOString() }));
    expect((await reviewExecution("done")).code).toBe("CODEX_NATIVE_REVIEW_SKIPPED");
    expect(askChatGpt).not.toHaveBeenCalled();
  });
  it("uses saved chat mode when no mode argument is supplied", async () => {
    const dir = isolateStateDir(); dirs.push(dir); mergeUiPrefs({ workMode: "chat" });
    vi.mocked(askChatGpt).mockResolvedValue({ ok: false, code: "TEST_OFFLINE", message: "offline" });
    const result = await startPlanning("task", 1000);
    expect(result.task.mode).toBe("codex"); expect(result.code).toBe("FALLBACK_CODEX");
    expect(readUiPrefs().workMode).toBe("auto");
    expect(askChatGpt).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["setup"], ["start"], ["restart"], ["pair"], ["wait-auth"], ["doctor"],
    ["browser", "start"], ["browser", "ask", "--text", "must not send"],
    ["browser", "connector", "--name", "test", "--mcp-url", "https://example.com/mcp"],
    ["tunnel", "login"],
  ])("blocks connection command %j before side effects", (...args) => {
    const dir = codexState();
    const result = spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, C2C_STATE_DIR: dir }, encoding: "utf8", timeout: 10000 });
    expect(result.status).toBe(1);
    expect(result.stdout, JSON.stringify({args, stderr: result.stderr, error: result.error})).toContain("ChatGPT connection actions are disabled");
    expect(fs.existsSync(path.join(dir, "runtime"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "browser"))).toBe(false);
  });
  it("CLI planner inherits codex mode without a mode flag", () => {
    codexState();
    const result = spawnSync(process.execPath, [cli, "planner", "start", "--goal", "local only", "--json"], { env: process.env, encoding: "utf8", timeout: 10000 });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout || JSON.stringify({error:result.stderr})).code).toBe("CODEX_NATIVE_MODE");
  });
});
