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
async function pages(debugPort) {
    try {
        return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    }
    catch {
        return [];
    }
}
async function evaluate(wsUrl, expression) {
    return await new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        const id = Math.floor(Math.random() * 1_000_000_000);
        const timer = setTimeout(() => { try {
            socket.close();
        }
        catch { } reject(new Error("CDP evaluation timed out")); }, 3000);
        socket.addEventListener("open", () => socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } })));
        socket.addEventListener("message", (event) => {
            try {
                const message = JSON.parse(String(event.data));
                if (message.id !== id)
                    return;
                clearTimeout(timer);
                socket.close();
                if (message.error)
                    reject(new Error("CDP evaluation failed"));
                else
                    resolve(message.result?.result?.value);
            }
            catch { /* ignore unrelated messages */ }
        });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP websocket unavailable")); });
    });
}
async function chatgptState(debugPort) {
    const targets = (await pages(debugPort)).filter((page) => page.type === "page");
    const chat = targets.find((page) => /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
    if (!chat)
        return { state: "absent", pages: targets.length };
    if (!chat.webSocketDebuggerUrl)
        return { state: "unknown", pages: targets.length };
    try {
        const value = await evaluate(chat.webSocketDebuggerUrl, `(() => { const text = document.body?.innerText || ''; const hasComposer = !!document.querySelector('textarea, [contenteditable="true"]'); const login = /\\b(log in|sign in|登录|注册)\\b/i.test(text) && !hasComposer; return { login, hasComposer }; })()`);
        const result = value;
        return { state: result.login ? "login_required" : result.hasComposer ? "ready" : "unknown", pages: targets.length };
    }
    catch {
        return { state: "unknown", pages: targets.length };
    }
}
export async function sendChatGptPrompt(text, debugPort = 9222) {
    const target = (await pages(debugPort)).find((page) => page.type === "page" && /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
    if (!target?.webSocketDebuggerUrl)
        return { ok: false, code: "CHATGPT_PAGE_MISSING", message: "No ChatGPT page is open in the managed browser." };
    try {
        const result = await evaluate(target.webSocketDebuggerUrl, `(text => {
      const composer = document.querySelector('textarea, [contenteditable="true"]');
      if (!composer) return { ok: false, code: "CHATGPT_LOGIN_REQUIRED", message: "ChatGPT is not ready for input; sign in first." };
      if (composer instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(composer, text);
      } else { composer.textContent = text; }
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      const buttons = Array.from(document.querySelectorAll('button'));
      const send = buttons.find((b) => /send|发送|submit/i.test(b.getAttribute('aria-label') || b.textContent || '') && !(b as HTMLButtonElement).disabled);
      if (!send) return { ok: false, code: "CHATGPT_SEND_BUTTON_MISSING", message: "ChatGPT composer found but the send button was not detected." };
      (send as HTMLElement).click();
      return { ok: true, code: "CHATGPT_PROMPT_SENT", message: "Prompt sent to ChatGPT." };
    })(${JSON.stringify(text)})`);
        return result;
    }
    catch {
        return { ok: false, code: "CHATGPT_BROWSER_ERROR", message: "The managed ChatGPT page did not accept the prompt." };
    }
}
export async function browserStatus(debugPort = 9222) {
    const executable = findExecutable();
    const runtime = readRuntime();
    if (!executable)
        return { state: "missing", executable: null, pid: null, debugPort, profileDir: profileDir(), loginHint: "Install Chromium or set CODEX_WEB_PLANNER_BROWSER.", chatgpt: "absent", pages: 0 };
    const live = await reachable(debugPort);
    if (live) {
        const chat = await chatgptState(debugPort);
        return { state: "running", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: chat.state === "login_required" ? "Sign in to ChatGPT in the visible browser." : "ChatGPT browser is ready.", chatgpt: chat.state, pages: chat.pages };
    }
    return { state: runtime.pid && processExists(runtime.pid) ? "unreachable" : "stopped", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "The browser will open ChatGPT after start.", chatgpt: "absent", pages: 0 };
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
    return { ...current, state: "stopped", pid: null, chatgpt: "absent", pages: 0 };
}
//# sourceMappingURL=supervisor.js.map