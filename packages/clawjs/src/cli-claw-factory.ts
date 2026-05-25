import { createClaw } from "@clawjs/claw";
import { createWorkspaceClaw } from "@clawjs/workspace";
import type { WorkspaceClawInstance } from "@clawjs/workspace";
import type { RuntimeAdapterId } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";

const MIN_GATEWAY_PORT = 1;
const MAX_GATEWAY_PORT = 65535;

export function parseCliGatewayPortFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw invalidGatewayPortError(value);
  }
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < MIN_GATEWAY_PORT || port > MAX_GATEWAY_PORT) {
    throw invalidGatewayPortError(value);
  }
  return port;
}

function cliGatewayConfig(flags: Record<string, string>) {
  const port = parseCliGatewayPortFlag(flags["gateway-port"]);
  return {
    url: flags["gateway-url"],
    token: flags["gateway-token"],
    ...(port === undefined ? {} : { port }),
    configPath: flags["gateway-config"],
  };
}

function invalidGatewayPortError(value: string): CliHandledError {
  return new CliHandledError("invalid_gateway_port", "--gateway-port must be an integer TCP port between 1 and 65535.", CLI_EXIT_USAGE, {
    location: "cli.gateway.port",
    suggestion: "Use a whole-number port from 1 to 65535.",
    safeNextStep: "Fix --gateway-port and rerun the same claw command.",
    details: { value },
  });
}

export async function createCliClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  argv: string[] = [],
) {
  const explicitSecretsBackend = flags["secrets-url"] || flags["secrets-token"] || flags["secrets-tenant-id"] ? "secrets" : undefined;
  return createClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      provider: flags.provider,
      model: flags.model,
      wire: flags.wire as "chat_completions" | "responses" | undefined,
      baseUrl: flags["base-url"],
      secretRef: flags["secret-ref"],
      envKey: flags["env-key"],
      permissionMode: flags.sandbox as "read-only" | "workspace-write" | "danger-full-access" | undefined,
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      binaryPath: flags["binary-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: cliGatewayConfig(flags),
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    secrets: (
      flags["secrets-backend"]
      || flags["secrets-url"]
      || flags["secrets-token"]
      || flags["secrets-tenant-id"]
      || process.env.CLAW_SECRETS_BACKEND
      || process.env.CLAW_SECRETS_BASE_URL
      || process.env.CLAW_SECRETS_TOKEN
      || process.env.CLAW_SECRETS_TENANT_ID
    ) ? {
      backend: (flags["secrets-backend"] || explicitSecretsBackend || process.env.CLAW_SECRETS_BACKEND) as "local_proxy" | "secrets" | undefined,
      baseUrl: flags["secrets-url"] || process.env.CLAW_SECRETS_BASE_URL,
      credential: flags["secrets-token"] || process.env.CLAW_SECRETS_TOKEN,
      tenantId: flags["secrets-tenant-id"] || process.env.CLAW_SECRETS_TENANT_ID,
      sidecarPath: flags["secrets-sidecar"] || process.env.CLAW_SECRETS_SIDECAR_PATH,
    } : undefined,
    templates: {
      pack: flags["template-pack"],
    },
    library: {
      rootDir: flags["library-dir"],
    },
    rules: {
      rootDir: flags["rules-dir"],
    },
    guidance: {
      rootDir: flags["guidance-dir"],
    },
    resources: {
      rootDir: flags["resources-dir"],
    },
    skills: {
      homeDir: flags["skills-home"],
      // Default OFF in CLI to avoid surprising user-home filesystem mutations.
      // Use `claw skills import` explicitly to opt in.
      autoImport: process.env.CLAW_SKILLS_AUTO_IMPORT === "1",
    },
    images: {
      rootDir: flags["image-library"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
      openaiBaseUrl: flags["openai-base-url"],
      env: {
        ...process.env,
        ...(flags["secret-ref"] ? { CLAW_OPENAI_IMAGE_SECRET_REF: flags["secret-ref"] } : {}),
        ...(flags["openai-base-url"] ? { CLAW_OPENAI_IMAGE_BASE_URL: flags["openai-base-url"] } : {}),
      },
    },
    notify: flags["notify-url"]
      ? {
        baseUrl: flags["notify-url"],
        sourceToken: flags["notify-source-token"],
        clientToken: flags["notify-client-token"],
      }
      : undefined,
    time: flags["time-url"] || process.env.CLAW_TIME_URL
      ? {
        mode: "client",
        baseUrl: flags["time-url"] || process.env.CLAW_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAW_TIME_TOKEN,
      }
      : undefined,
  });
}

export async function createCliWorkspaceClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  _contextCwd: string,
): Promise<WorkspaceClawInstance> {
  return createWorkspaceClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      provider: flags.provider,
      model: flags.model,
      wire: flags.wire as "chat_completions" | "responses" | undefined,
      baseUrl: flags["base-url"],
      secretRef: flags["secret-ref"],
      envKey: flags["env-key"],
      permissionMode: flags.sandbox as "read-only" | "workspace-write" | "danger-full-access" | undefined,
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      binaryPath: flags["binary-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: cliGatewayConfig(flags),
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    templates: {
      pack: flags["template-pack"],
    },
    time: flags["time-url"] || process.env.CLAW_TIME_URL
      ? {
        mode: "client",
        baseUrl: flags["time-url"] || process.env.CLAW_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAW_TIME_TOKEN,
      }
      : undefined,
  });
}
