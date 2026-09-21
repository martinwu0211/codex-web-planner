import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir } from "../config/paths.js";
import { appendAudit, redact as auditRedact } from "../audit/index.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const redact = auditRedact;

export interface LoggerOptions {
  name?: string;
  level?: LogLevel;
  file?: string | null;
  console?: boolean;
}

export class Logger {
  private level: number;
  private file: string | null;
  private useConsole: boolean;
  private name: string;

  constructor(opts: LoggerOptions = {}) {
    this.name = opts.name ?? "c2c";
    this.level = LEVELS[opts.level ?? (process.env.C2C_LOG_LEVEL as LogLevel) ?? "info"] ?? LEVELS.info;
    this.useConsole = opts.console ?? false;
    if (opts.file === undefined) {
      const dir = ensureDir(path.join(getStateDir(), "logs"));
      this.file = path.join(dir, `${this.name}.log`);
    } else {
      this.file = opts.file;
    }
  }

  private write(level: LogLevel, msg: string, extra?: unknown): void {
    if (LEVELS[level] < this.level) return;
    const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${this.name}]`, redact(msg)];
    if (extra !== undefined) {
      try {
        parts.push(redact(JSON.stringify(extra)));
      } catch {
        parts.push("[unserializable]");
      }
    }
    const line = parts.join(" ") + "\n";
    if (this.file) {
      try {
        fs.appendFileSync(this.file, line, { mode: 0o600 });
      } catch {
        // logging must never crash the bridge
      }
    }
    appendAudit({ event: `log.${level}`, detail: { logger: this.name, message: redact(msg) } });
    if (this.useConsole) process.stderr.write(line);
  }

  debug(msg: string, extra?: unknown): void {
    this.write("debug", msg, extra);
  }
  info(msg: string, extra?: unknown): void {
    this.write("info", msg, extra);
  }
  warn(msg: string, extra?: unknown): void {
    this.write("warn", msg, extra);
  }
  error(msg: string, extra?: unknown): void {
    this.write("error", msg, extra);
  }
}

export const nullLogger = new Logger({ file: null, console: false, level: "error" });
