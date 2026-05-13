import os from "os";
import path from "path";

export const DEFAULT_SECRETS_PROXY_PATH = path.join(os.homedir(), "bin", "secrets-proxy");

export interface SecretsCommandSpec {
  command: string;
  argsPrefix: string[];
  env: NodeJS.ProcessEnv;
}

function resolveSecretsProxyPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAW_SECRETS_PROXY_PATH?.trim()
    || process.env.CLAW_SECRETS_PROXY_PATH?.trim()
    || DEFAULT_SECRETS_PROXY_PATH;
}

function resolveSecretsBackend(env?: NodeJS.ProcessEnv): "local_proxy" | "secrets" {
  const explicitBackend = env?.CLAW_SECRETS_BACKEND?.trim()
    || process.env.CLAW_SECRETS_BACKEND?.trim();
  if (explicitBackend) {
    return explicitBackend === "secrets" ? "secrets" : "local_proxy";
  }
  const mergedEnv = buildSecretsRunnerEnv(env);
  const hasSecretsConfig = !!(
    (mergedEnv.CLAW_SECRETS_BASE_URL?.trim())
    && (mergedEnv.CLAW_SECRETS_TOKEN?.trim())
    && (mergedEnv.CLAW_SECRETS_TENANT_ID?.trim())
  );
  const backend = hasSecretsConfig ? "secrets" : "local_proxy";
  return backend === "secrets" ? "secrets" : "local_proxy";
}

export function buildSecretsRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

export function resolveSecretsCommandSpec(env?: NodeJS.ProcessEnv): SecretsCommandSpec {
  const mergedEnv = buildSecretsRunnerEnv(env);
  if (resolveSecretsBackend(env) === "secrets") {
    const sidecarPath = mergedEnv.CLAW_SECRETS_SIDECAR_PATH?.trim();
    if (!sidecarPath) {
      throw new Error("CLAW_SECRETS_SIDECAR_PATH is required when CLAW_SECRETS_BACKEND=secrets");
    }
    const nodePath = mergedEnv.CLAW_SECRETS_NODE_PATH?.trim() || process.execPath;
    return {
      command: nodePath,
      argsPrefix: [sidecarPath],
      env: mergedEnv,
    };
  }
  return {
    command: resolveSecretsProxyPath(env),
    argsPrefix: [],
    env: mergedEnv,
  };
}

export { resolveSecretsBackend, resolveSecretsProxyPath };
