type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  environment: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    environment: process.env.NODE_ENV || "development",
    ...meta,
  };

  if (process.env.NODE_ENV === "production") {
    console.log(JSON.stringify(entry));
  } else {
    const colorMap: Record<LogLevel, string> = {
      debug: "\x1b[36m",
      info: "\x1b[32m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    console.log(`${colorMap[level]}[${level.toUpperCase()}]${reset} ${message}`, meta || "");
  }
}
