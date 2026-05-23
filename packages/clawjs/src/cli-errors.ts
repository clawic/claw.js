export const CLI_EXIT_OK = 0;
export const CLI_EXIT_FAILURE = 1;
export const CLI_EXIT_DEGRADED = 2;
export const CLI_EXIT_USAGE = 64;

export type CliErrorStatus = "FAIL" | "USAGE" | "DEGRADED" | "BLOCKED" | "EXTERNAL_PENDING";

export interface CliHandledErrorOptions {
  readonly exitCode?: number;
  readonly status?: CliErrorStatus;
  readonly location?: string;
  readonly suggestion?: string;
  readonly safeNextStep?: string;
  readonly details?: Record<string, unknown>;
}

export interface CliErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly status: CliErrorStatus;
  readonly location: string;
  readonly suggestion: string;
  readonly safeNextStep: string;
  readonly details?: Record<string, unknown>;
}

export class CliHandledError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly status: CliErrorStatus;
  readonly location?: string;
  readonly suggestion?: string;
  readonly safeNextStep?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, exitCodeOrOptions: number | CliHandledErrorOptions = CLI_EXIT_FAILURE, options: CliHandledErrorOptions = {}) {
    super(message);
    const resolved = typeof exitCodeOrOptions === "number"
      ? { ...options, exitCode: exitCodeOrOptions }
      : exitCodeOrOptions;
    this.code = code;
    this.exitCode = resolved.exitCode ?? CLI_EXIT_FAILURE;
    this.status = resolved.status ?? statusForExitCode(this.exitCode);
    this.location = resolved.location;
    this.suggestion = resolved.suggestion;
    this.safeNextStep = resolved.safeNextStep;
    this.details = resolved.details;
  }
}

export function statusForExitCode(exitCode: number): CliErrorStatus {
  if (exitCode === CLI_EXIT_USAGE) return "USAGE";
  if (exitCode === CLI_EXIT_DEGRADED) return "DEGRADED";
  return "FAIL";
}

export function cliErrorPayload(error: CliHandledError | { code: string; message: string; status?: CliErrorStatus; location?: string; suggestion?: string; safeNextStep?: string; details?: Record<string, unknown> }): CliErrorPayload {
  const status = error.status ?? "FAIL";
  const defaults = actionableDefaultsForStatus(status);
  return {
    code: error.code,
    message: error.message,
    status,
    location: error.location ?? defaults.location,
    suggestion: error.suggestion ?? defaults.suggestion,
    safeNextStep: error.safeNextStep ?? defaults.safeNextStep,
    ...(error.details ? { details: error.details } : {}),
  };
}

export function formatCliErrorText(error: CliHandledError): string {
  const payload = cliErrorPayload(error);
  const lines = [
    `${payload.status}: ${redactCliErrorText(payload.message)}`,
    `code: ${redactCliErrorText(payload.code)}`,
    `location: ${redactCliErrorText(payload.location)}`,
    `suggestion: ${redactCliErrorText(payload.suggestion)}`,
    `next: ${redactCliErrorText(payload.safeNextStep)}`,
  ];
  return lines.join("\n");
}

function actionableDefaultsForStatus(status: CliErrorStatus): { location: string; suggestion: string; safeNextStep: string } {
  switch (status) {
    case "USAGE":
      return {
        location: "cli.argv",
        suggestion: "Check the command, subcommand, flags, and required arguments before retrying.",
        safeNextStep: "Run claw inspect commands --json or rerun the command with --help.",
      };
    case "DEGRADED":
    case "EXTERNAL_PENDING":
      return {
        location: "external.prerequisite",
        suggestion: "Treat this as unavailable evidence or an external prerequisite, not a successful validation.",
        safeNextStep: "Inspect the command JSON error, satisfy the named prerequisite, then rerun the same command.",
      };
    case "BLOCKED":
      return {
        location: "blocked.prerequisite",
        suggestion: "Resolve the named prerequisite before retrying; do not continue with a destructive or live action.",
        safeNextStep: "Inspect the command JSON error, fix the prerequisite, then rerun the same command.",
      };
    case "FAIL":
    default:
      return {
        location: "cli.runtime",
        suggestion: "Inspect the command JSON error and the named command surface before retrying.",
        safeNextStep: "Rerun the same command with --json after fixing the reported input, host, or runtime state.",
      };
  }
}

function redactCliErrorText(value: string): string {
  let redacted = value;
  redacted = redacted.replaceAll(/\bBearer\s+([A-Za-z0-9._-]{6,})/gi, "Bearer [REDACTED]");
  redacted = redacted.replaceAll(/\bsk-[A-Za-z0-9._-]{6,}\b/g, "[REDACTED]");
  redacted = redacted.replaceAll(/\b(api[_ -]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)/gi, (_match, label: string) => `${label}: [REDACTED]`);
  redacted = redacted.replaceAll(/\/Users\/[^/\s]+/g, "~");
  return redacted;
}
