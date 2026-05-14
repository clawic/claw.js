export interface OpenClawCommandOptions {
  binaryPath?: string;
  homeDir?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface OpenClawCommandRunner {
  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  stream?(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  spawnDetachedPty?(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
  ): { pid: number | undefined; command: string; args: string[] };
}

function readConfiguredValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mergeProcessEnv(...envs: Array<Record<string, string | undefined> | undefined>): NodeJS.ProcessEnv {
  const merged = {} as NodeJS.ProcessEnv;
  for (const env of envs) {
    if (!env) continue;
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

export function resolveOpenClawBinaryPath(options: OpenClawCommandOptions = {}): string {
  return readConfiguredValue(options.binaryPath)
    ?? readConfiguredValue(options.env?.CLAW_OPENCLAW_PATH)
    ?? readConfiguredValue(process.env.CLAW_OPENCLAW_PATH)
    ?? "openclaw";
}

export function withOpenClawBinaryEnv(
  env?: NodeJS.ProcessEnv,
  binaryPath?: string,
): NodeJS.ProcessEnv | undefined {
  const resolvedBinaryPath = readConfiguredValue(binaryPath) ?? readConfiguredValue(env?.CLAW_OPENCLAW_PATH);
  if (!resolvedBinaryPath) {
    return env;
  }
  return mergeProcessEnv(env, { CLAW_OPENCLAW_PATH: resolvedBinaryPath });
}

export function withOpenClawCommandEnv(
  env?: NodeJS.ProcessEnv,
  options: OpenClawCommandOptions = {},
): NodeJS.ProcessEnv | undefined {
  const commandEnv = withOpenClawBinaryEnv(mergeProcessEnv(process.env, env), options.binaryPath) ?? ({} as NodeJS.ProcessEnv);
  const resolvedStateDir = readConfiguredValue(commandEnv.OPENCLAW_STATE_DIR) ?? readConfiguredValue(options.homeDir);
  const resolvedConfigPath = readConfiguredValue(commandEnv.OPENCLAW_CONFIG_PATH) ?? readConfiguredValue(options.configPath);

  if (resolvedStateDir) {
    commandEnv.OPENCLAW_STATE_DIR = resolvedStateDir;
  }
  if (resolvedConfigPath) {
    commandEnv.OPENCLAW_CONFIG_PATH = resolvedConfigPath;
  }

  return Object.keys(commandEnv).length > 0 ? commandEnv : undefined;
}

export function buildOpenClawCommand(
  args: string[],
  options: OpenClawCommandOptions = {},
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const env = withOpenClawCommandEnv(options.env, options);
  return {
    command: resolveOpenClawBinaryPath({
      ...options,
      ...(env ? { env } : {}),
    }),
    args,
    ...(env ? { env } : {}),
  };
}

export function withOpenClawCommandRunner<T extends OpenClawCommandRunner>(
  runner: T,
  options: OpenClawCommandOptions = {},
): T {
  const env = withOpenClawCommandEnv(options.env, options);
  const binaryPath = resolveOpenClawBinaryPath({
    ...options,
    ...(env ? { env } : {}),
  });

  return {
    exec(command, args, execOptions = {}) {
      const commandEnv = withOpenClawCommandEnv(execOptions.env ?? env, options);
      return runner.exec(command === "openclaw" ? binaryPath : command, args, {
        ...execOptions,
        ...(commandEnv ? { env: commandEnv } : {}),
      });
    },
    ...(typeof runner.stream === "function" ? {
      stream(command, args, streamOptions = {}) {
        const commandEnv = withOpenClawCommandEnv(streamOptions.env ?? env, options);
        return runner.stream!(command === "openclaw" ? binaryPath : command, args, {
          ...streamOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
    ...(typeof runner.spawnDetachedPty === "function" ? {
      spawnDetachedPty(command, args, spawnOptions = {}) {
        const commandEnv = withOpenClawCommandEnv(spawnOptions.env ?? env, options);
        return runner.spawnDetachedPty!(command === "openclaw" ? binaryPath : command, args, {
          ...spawnOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
  } as T;
}
