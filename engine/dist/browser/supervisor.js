import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getStateDir, ensureDir } from "../config/paths.js";
const runtimeFile = () => path.join(getStateDir(), "browser", "runtime.json");
const profileDir = () => path.join(getStateDir(), "browser", "profile");
const candidates = () => [
    process.env.CODEX_WEB_PLANNER_BROWSER,
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    path.join(os.homedir(), ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"),
].filter((v) => Boolean(v));
function findExecutable() {
    return candidates().find((candidate) => fs.existsSync(candidate)) ?? null;
}
function readRuntime() {
    try {
        return JSON.parse(fs.readFileSync(runtimeFile(), "utf8"));
    }
    catch {
        return {};
    }
}
async function reachable(port) {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        return response.ok;
    }
    catch {
        return false;
    }
}
export async function browserStatus(debugPort = 9222) {
    const executable = findExecutable();
    const runtime = readRuntime();
    if (!executable)
        return { state: "missing", executable: null, pid: null, debugPort, profileDir: profileDir(), loginHint: "Install Chromium or set CODEX_WEB_PLANNER_BROWSER." };
    const live = await reachable(debugPort);
    if (live)
        return { state: "running", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "Open ChatGPT in the visible browser and sign in if required." };
    return { state: runtime.pid && processExists(runtime.pid) ? "unreachable" : "stopped", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "The browser will open ChatGPT after start." };
}
function processExists(pid) { try {
    process.kill(pid, 0);
    return true;
}
catch {
    return false;
} }
export async function startBrowser(debugPort = 9222) {
    const before = await browserStatus(debugPort);
    if (before.state === "running")
        return before;
    if (!before.executable)
        return before;
    ensureDir(path.dirname(runtimeFile()));
    ensureDir(profileDir());
    const child = spawn(before.executable, [
        `--user-data-dir=${profileDir()}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${debugPort}`,
        "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "https://chatgpt.com/",
    ], { detached: true, stdio: "ignore" });
    child.unref();
    fs.writeFileSync(runtimeFile(), JSON.stringify({ pid: child.pid, port: debugPort }) + "\n", { mode: 0o600 });
    for (let i = 0; i < 30; i += 1) {
        if ((await browserStatus(debugPort)).state === "running")
            break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return browserStatus(debugPort);
}
export async function stopBrowser(debugPort = 9222) {
    const current = await browserStatus(debugPort);
    if (current.pid && processExists(current.pid)) {
        try {
            process.kill(current.pid, "SIGTERM");
        }
        catch { /* already gone */ }
    }
    try {
        fs.unlinkSync(runtimeFile());
    }
    catch { /* no runtime file */ }
    return { ...current, state: "stopped", pid: null };
}
//# sourceMappingURL=supervisor.js.map