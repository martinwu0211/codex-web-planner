import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir } from "../config/paths.js";
import { appendAudit, redact as auditRedact } from "../audit/index.js";
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
export const redact = auditRedact;
export class Logger {
    level;
    file;
    useConsole;
    name;
    constructor(opts = {}) {
        this.name = opts.name ?? "c2c";
        this.level = LEVELS[opts.level ?? process.env.C2C_LOG_LEVEL ?? "info"] ?? LEVELS.info;
        this.useConsole = opts.console ?? false;
        if (opts.file === undefined) {
            const dir = ensureDir(path.join(getStateDir(), "logs"));
            this.file = path.join(dir, `${this.name}.log`);
        }
        else {
            this.file = opts.file;
        }
    }
    write(level, msg, extra) {
        if (LEVELS[level] < this.level)
            return;
        const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${this.name}]`, redact(msg)];
        if (extra !== undefined) {
            try {
                parts.push(redact(JSON.stringify(extra)));
            }
            catch {
                parts.push("[unserializable]");
            }
        }
        const line = parts.join(" ") + "\n";
        if (this.file) {
            try {
                fs.appendFileSync(this.file, line, { mode: 0o600 });
            }
            catch {
                // logging must never crash the bridge
            }
        }
        appendAudit({ event: `log.${level}`, detail: { logger: this.name, message: redact(msg) } });
        if (this.useConsole)
            process.stderr.write(line);
    }
    debug(msg, extra) {
        this.write("debug", msg, extra);
    }
    info(msg, extra) {
        this.write("info", msg, extra);
    }
    warn(msg, extra) {
        this.write("warn", msg, extra);
    }
    error(msg, extra) {
        this.write("error", msg, extra);
    }
}
export const nullLogger = new Logger({ file: null, console: false, level: "error" });
//# sourceMappingURL=index.js.map