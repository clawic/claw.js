export interface CodexCommandOptions {
  binaryPath?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

function readConfiguredValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveCodexBinaryPath(options: CodexCommandOptions = {}): string {
  return readConfiguredValue(options.binaryPath)
    ?? readConfiguredValue(options.env?.CLAW_CODEX_PATH)
    ?? readConfiguredValue(process.env.CLAW_CODEX_PATH)
    ?? "codex";
}

export function withCodexCommandEnv(
  env?: NodeJS.ProcessEnv,
  options: CodexCommandOptions = {},
): NodeJS.ProcessEnv | undefined {
  const commandEnv = {
    ...process.env,
    ...(env ?? {}),
  };

  const resolvedHome = readConfiguredValue(commandEnv.CODEX_HOME) ?? readConfiguredValue(options.homeDir);
  if (resolvedHome) {
    commandEnv.CODEX_HOME = resolvedHome;
  }

  const resolvedBinary = readConfiguredValue(options.binaryPath) ?? readConfiguredValue(commandEnv.CLAW_CODEX_PATH);
  if (resolvedBinary) {
    commandEnv.CLAW_CODEX_PATH = resolvedBinary;
  }

  return Object.keys(commandEnv).length > 0 ? commandEnv : undefined;
}

export function buildCodexCommand(
  args: string[],
  options: CodexCommandOptions = {},
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const env = withCodexCommandEnv(options.env, options);
  return {
    command: resolveCodexBinaryPath({
      ...options,
      ...(env ? { env } : {}),
    }),
    args,
    ...(env ? { env } : {}),
  };
}
