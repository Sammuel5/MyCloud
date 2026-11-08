import { getLogLevel } from "@/lib/config";

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldLog(level: string): boolean {
  return (LEVELS[level] ?? 20) >= (LEVELS[getLogLevel()] ?? 20);
}

function sanitize(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/password|secret|token|authorization|cookie/i.test(key)) {
      output[key] = "[redacted]";
    } else if (value instanceof Error) {
      output[key] = { name: value.name, message: value.message, stack: value.stack };
    } else if (typeof value === "string" && value.length > 1000) {
      output[key] = `${value.slice(0, 1000)}…`;
    } else {
      output[key] = value;
    }
  }
  return output;
}

function emit(level: "debug" | "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    scope: "mycloud",
    message,
    ...sanitize(metadata),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => emit("debug", message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => emit("info", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => emit("warn", message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => emit("error", message, metadata),
};
