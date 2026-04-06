import pino from "pino";

const isLocal = !process.env.ENVIRONMENT || process.env.ENVIRONMENT === "local";

const gcpSeverity: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isLocal ? "debug" : "info"),
  // In production, format logs for Cloud Logging (severity + message fields)
  ...(isLocal
    ? {}
    : {
        formatters: {
          level(label: string): { severity: string } {
            return { severity: gcpSeverity[label] ?? "DEFAULT" };
          },
        },
        messageKey: "message",
      }),
});
