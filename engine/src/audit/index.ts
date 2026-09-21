import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir } from "../config/paths.js";

const REDACT_PATTERNS: RegExp[] = [
  /c2c_(?:at|rt|ac|admin)_[A-Za-z0-9_-]+/g,
  /(authorization"?\s*[:=]\s*"?bearer\s+)[^\s"']+/gi,
  /((?:access_token|refresh_token|client_secret|code_verifier|code|token)"?\s*[:=]\s*"?)[A-Za-z0-9._~+/-]{16,}/gi,
  /\b[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\b/g,
];

export function redact(input: string): string {
  let output = input;
  for (const pattern of REDACT_PATTERNS) {
    output = output.replace(pattern, (_match, prefix) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]"
    );
  }
  return output;
}

const SENSITIVE_KEYS = /(?:content|body|prompt|password|secret|cookie|credential|token|code|input|output)/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redact(value).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)])
    );
  }
  return value;
}

/**
 * Machine-readable local audit trail for clean-install testing.
 *
 * This module deliberately owns one fixed file under the Codex state
 * directory. Callers cannot select an arbitrary path, and values are
 * redacted before they leave the process. The audit trail contains lifecycle
 * metadata only; it must never contain credentials, tokens, cookies, or file
 * contents.
 */
export interface AuditEvent {
  event: string;
  workspaceId?: string;
  result?: "ok" | "error" | "pending";
  detail?: Record<string, unknown>;
}

export function auditFile(): string {
  return path.join(ensureDir(path.join(getStateDir(), "audit")), "events.jsonl");
}

export function appendAudit(event: AuditEvent): void {
  const record = {
    timestamp: new Date().toISOString(),
    ...event,
    detail: event.detail === undefined ? undefined : sanitize(event.detail),
  };
  try {
    const file = auditFile();
    fs.appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  } catch {
    // Auditing must never prevent the user task from running.
  }
}

export function readAuditTail(lines = 100): string[] {
  try {
    const content = fs.readFileSync(auditFile(), "utf8").trim();
    if (!content) return [];
    return content.split("\n").slice(-Math.max(1, Math.floor(lines)));
  } catch {
    return [];
  }
}
