import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir } from "../config/paths.js";
import { readUiPrefs } from "../config/ui-prefs.js";
const usageFile = () => path.join(getStateDir(), "metrics", "token-usage.json");
/** A conservative, content-free estimate suitable for comparing runs (chars / 4). */
export function estimateTokens(chars) {
    return Math.ceil(Math.max(0, chars) / 4);
}
export function recordMcpExchange(inputChars, outputChars) {
    if (!readUiPrefs().tokenMetricsEnabled)
        return;
    try {
        const file = usageFile();
        let current = {};
        try {
            current = JSON.parse(fs.readFileSync(file, "utf8"));
        }
        catch {
            // First exchange: start a fresh aggregate.
        }
        const next = {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            requests: Number(current.requests ?? 0) + 1,
            inputChars: Number(current.inputChars ?? 0) + Math.max(0, inputChars),
            outputChars: Number(current.outputChars ?? 0) + Math.max(0, outputChars),
            estimatedInputTokens: Number(current.estimatedInputTokens ?? 0) + estimateTokens(inputChars),
            estimatedOutputTokens: Number(current.estimatedOutputTokens ?? 0) + estimateTokens(outputChars),
        };
        ensureDir(path.dirname(file));
        fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
        fs.chmodSync(file, 0o600);
    }
    catch {
        // Metrics must never break the MCP bridge.
    }
}
export function readTokenUsage() {
    try {
        return JSON.parse(fs.readFileSync(usageFile(), "utf8"));
    }
    catch {
        return {
            schemaVersion: 1,
            updatedAt: new Date(0).toISOString(),
            requests: 0,
            inputChars: 0,
            outputChars: 0,
            estimatedInputTokens: 0,
            estimatedOutputTokens: 0,
        };
    }
}
//# sourceMappingURL=token-counter.js.map