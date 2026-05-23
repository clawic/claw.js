import { randomBytes } from "crypto";

import { clawCommandRequestSchema, clawContractVersionV1 } from "@clawjs/core";
import type { ClawCommandResponse, ClawDomain } from "@clawjs/core";

import { HostClientError, sendHostCommand } from "./host-client.ts";
import { activeHost, readHostRegistry } from "./host-registry.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { stringifyCliJson, writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { hostRegistryOptions } from "./cli-host-command.ts";
import type { CliContext } from "./index.ts";

const DEFAULT_HOST_RESOURCES: Partial<Record<ClawDomain, string>> = {
  agents: "agents",
  skills: "skills",
  design: "design",
  sessions: "sessions",
  projects: "projects",
  memory: "notes",
  files: "entries",
  productivity: "items",
  calendar: "events",
  contacts: "contacts",
  reminders: "items",
  mail: "messages",
  notes: "notes",
  messages: "conversations",
  browser: "sessions",
  terminal: "sessions",
  voice: "transcripts",
  models: "models",
  services: "services",
  database: "records",
  integrations: "integrations",
  secrets: "secrets",
  mini_apps: "apps",
};

function requestId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

function hostForwardArguments(flags: Record<string, string>): Record<string, unknown> {
  const skipped = new Set(["json", "claw-home", "host", "host-id"]);
  return Object.fromEntries(Object.entries(flags).filter(([key]) => !skipped.has(key)));
}

export async function runSystemCapabilitiesCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, resource, action = "list"] = input.positionals;
  if (resource !== "capabilities") return CLI_EXIT_USAGE;
  if (!["list", "grant", "revoke"].includes(action)) {
    throw new CliHandledError("usage_error", `Usage: ${input.binName} system capabilities list|grant|revoke [scope]`, CLI_EXIT_USAGE);
  }
  return runHostForwardCli({
    domain: "system",
    resource: "capabilities",
    action,
    flags: input.flags,
    context: input.context,
    wantsJson: input.wantsJson,
    extraArguments: {
      ...(input.positionals[3] ? { scope: input.positionals[3] } : {}),
    },
  });
}

export async function runDirectHostDomainCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const [group, command, subcommand] = input.positionals;
  const domain = group as ClawDomain;
  const resource = subcommand ? command : DEFAULT_HOST_RESOURCES[domain];
  const action = subcommand ?? command ?? "list";
  if (!resource || !action) return CLI_EXIT_USAGE;
  return runHostForwardCli({
    domain,
    resource,
    action,
    flags: input.flags,
    context: input.context,
    wantsJson: input.wantsJson,
  });
}

export async function runHostForwardCli(input: {
  domain: ClawDomain;
  resource: string;
  action: string;
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  extraArguments?: Record<string, unknown>;
}): Promise<number> {
  const registry = readHostRegistry(hostRegistryOptions(input.flags));
  const requestedHostId = input.flags.host ?? input.flags["host-id"];
  const host = requestedHostId
    ? registry.hosts.find((entry) => entry.id === requestedHostId) ?? null
    : activeHost(registry);
  if (!host) {
    throw new CliHandledError(
      "host_unavailable",
      requestedHostId
        ? `Host not registered: ${requestedHostId}.`
        : "No active host configured. Run `claw host register ... --use` or start Clawix/Claw.app first.",
      CLI_EXIT_DEGRADED,
    );
  }

  const request = clawCommandRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: requestId(`${input.domain}-${input.action}`),
    domain: input.domain,
    resource: input.resource,
    action: input.action,
    arguments: {
      ...hostForwardArguments(input.flags),
      ...(input.extraArguments ?? {}),
    },
    clientContext: {
      pid: process.pid,
      executablePath: process.argv[1] ?? "claw",
      tty: Boolean(process.stdout.isTTY),
    },
    validationMode: input.flags["validation-mode"] ?? "host_real",
  });

  try {
    const response = await sendHostCommand(host, request);
    writeHostResponse(input.context, response, input.wantsJson, {
      subcommand: `${input.domain} ${input.resource} ${input.action}`,
      domain: input.domain,
      resource: input.resource,
      action: input.action,
      hostId: host.id,
    });
    return response.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  } catch (error) {
    if (error instanceof HostClientError) {
      throw new CliHandledError(error.code, error.message, error.code === "host_transport_unsupported" ? CLI_EXIT_USAGE : CLI_EXIT_DEGRADED, {
        status: error.code === "host_transport_unsupported" ? "USAGE" : "DEGRADED",
        location: `host:${host.id}`,
        suggestion: "Check the active host registration and verify the endpoint is reachable before forwarding domain commands.",
        safeNextStep: "Run claw host status --json, then register or start a reachable host endpoint.",
      });
    }
    throw error;
  }
}

function writeHostResponse(context: CliContext, response: ClawCommandResponse, wantsJson: boolean, meta: Record<string, unknown>): void {
  if (wantsJson) {
    if (response.ok) {
      writeCommandJsonOk(context.stdout, "host", response.data ?? null, {
        ...meta,
        hostRequestId: response.requestId,
        host: response.meta,
      });
    } else {
      writeCommandJsonError(
        context.stdout,
        "host",
        new CliHandledError(response.error?.code ?? "host_command_failed", response.error?.message ?? "Host command failed.", CLI_EXIT_FAILURE, {
          status: "FAIL",
          location: `host:${meta.hostId ?? "active"}`,
          suggestion: "Inspect the host response error and rerun only after the host-side prerequisite is fixed.",
          safeNextStep: "Run claw host status --json, then retry the same command with --json for a fresh envelope.",
        }),
        {
          ...meta,
          hostRequestId: response.requestId,
          host: response.meta,
        },
      );
    }
    return;
  }
  if (!response.ok) {
    context.stderr.write(`${response.error?.message ?? "Host command failed."}\n`);
    return;
  }
  if (response.data === undefined) {
    context.stdout.write("ok\n");
  } else if (typeof response.data === "string") {
    context.stdout.write(`${response.data}\n`);
  } else {
    context.stdout.write(`${stringifyCliJson(response.data)}\n`);
  }
}
