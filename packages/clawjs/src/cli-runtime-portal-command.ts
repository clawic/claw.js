// @ts-nocheck
import type { RuntimeAdapterId } from "@clawjs/core";
import { getRuntimeAdapter, getRuntimeSessionDescriptor, listRuntimeAdapters } from "@clawjs/claw";

import { RUNTIME_ADAPTER_IDS } from "./cli-constants.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

const RUNTIME_PORTAL_IDS = new Set(["openclaw", "codex", "hermes"]);

const DOMAIN_ALIASES = new Map([
  ["provider", "providers"],
  ["model", "models"],
  ["auth-state", "auth"],
  ["schedule", "scheduler"],
  ["schedules", "scheduler"],
  ["skill", "skills"],
  ["channel", "channels"],
  ["plugin", "plugins"],
  ["session", "sessions"],
  ["conversation", "sessions"],
  ["conversations", "sessions"],
]);

const DOMAIN_ORDER = [
  "runtime",
  "workspace",
  "providers",
  "models",
  "auth",
  "scheduler",
  "memory",
  "skills",
  "channels",
  "plugins",
  "sessions",
  "streaming",
  "sandbox",
  "doctor",
  "compat",
];

function normalizeDomain(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-") || "summary";
  return DOMAIN_ALIASES.get(normalized) ?? normalized;
}

function writePayload(input, payload, meta = {}) {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "runtime", payload, {
      invokedCommand: "runtime",
      subcommand: input.command ?? null,
      operation: input.subcommand ?? null,
      ...meta,
    });
    return;
  }
  input.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function runtimePortalUsage(binName: string): string {
  return [
    `Usage: ${binName} runtime <openclaw|codex|hermes> <summary|domains|domain|resources|commands|status|session|workspace> [options]`,
    "",
    "Examples:",
    `  ${binName} runtime openclaw domains --json`,
    `  ${binName} runtime codex resources skills --json`,
    `  ${binName} runtime hermes commands --json`,
  ].join("\n");
}

function buildCommandMatrix(adapter, runtimeId: RuntimeAdapterId) {
  return {
    runtimeId,
    runtimeName: adapter.runtimeName,
    authority: "runtime_adapter",
    executableByClawCli: [
      {
        command: `runtime ${runtimeId} status`,
        delegatesTo: "adapter.getStatus",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} domains`,
        delegatesTo: "adapter capability map and resource facades",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} resources <domain>`,
        delegatesTo: "adapter resource catalog/list methods",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} session`,
        delegatesTo: "adapter session descriptor",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} install --dry-run`,
        delegatesTo: adapter.buildInstallCommand().command,
        args: adapter.buildInstallCommand().args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} repair --dry-run`,
        delegatesTo: adapter.buildRepairCommand().command,
        args: adapter.buildRepairCommand().args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} setup-workspace --dry-run`,
        delegatesTo: adapter.buildWorkspaceSetupCommand({ agentId: "default", workspaceDir: "." }).command,
        args: adapter.buildWorkspaceSetupCommand({ agentId: "default", workspaceDir: "." }).args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} uninstall --dry-run`,
        delegatesTo: adapter.buildUninstallCommand().command,
        args: adapter.buildUninstallCommand().args,
        writesRuntime: false,
      },
    ],
    resourceDomains: ["providers", "models", "auth", "scheduler", "memory", "skills", "channels", "plugins"],
    mutationPolicy: runtimeId === "codex"
      ? "Codex-owned config remains read-only from ClawJS unless Codex exposes an explicit supported mutation path."
      : "Runtime-owned actions must delegate to the runtime adapter or be marked unsupported.",
  };
}

async function readResources(claw, domain: string, status) {
  switch (domain) {
    case "providers":
      return { providers: await claw.providers.list() };
    case "models":
      return { models: await claw.models.list(), defaultModel: await claw.models.getDefault() };
    case "auth":
      return { auth: await claw.auth.status() };
    case "scheduler":
      return { schedulers: await claw.scheduler.list() };
    case "memory":
      return { memory: await claw.memory.list() };
    case "skills":
      return { skills: await claw.skills.list() };
    case "channels":
      return { channels: await claw.channels.list() };
    case "plugins":
      if (status.adapter !== "openclaw") {
        return {
          plugins: [],
          status: status.capabilityMap?.plugins ?? { supported: false, status: "unsupported", strategy: "unsupported" },
        };
      }
      return { plugins: await claw.runtime.plugins.status() };
    default:
      return {
        providers: await claw.providers.list(),
        models: await claw.models.list(),
        defaultModel: await claw.models.getDefault(),
        auth: await claw.auth.status(),
        schedulers: await claw.scheduler.list(),
        memory: await claw.memory.list(),
        skills: await claw.skills.list(),
        channels: await claw.channels.list(),
      };
  }
}

function domainRows(status, resources, workspace, session) {
  const capabilityMap = status.capabilityMap ?? {};
  return DOMAIN_ORDER.map((domain) => {
    const capabilityKey = domain === "providers" ? "auth" : domain === "sessions" ? "session_cli" : domain;
    const capability = capabilityMap[capabilityKey];
    const count = domain === "providers" ? resources.providers?.length
      : domain === "models" ? resources.models?.length
      : domain === "scheduler" ? resources.schedulers?.length
      : domain === "memory" ? resources.memory?.length
      : domain === "skills" ? resources.skills?.length
      : domain === "channels" ? resources.channels?.length
      : domain === "workspace" ? workspace.managedFiles?.length
      : undefined;
    return {
      domain,
      supported: capability?.supported ?? (domain === "workspace" || domain === "sessions" ? true : undefined),
      status: capability?.status ?? (domain === "workspace" ? "ready" : undefined),
      strategy: capability?.strategy ?? (domain === "workspace" ? "native" : undefined),
      count,
      authority: domain === "workspace" ? "claw_workspace" : domain === "sessions" ? session.sessionPersistence ?? "runtime" : "runtime_adapter",
      limitations: capability?.limitations ?? [],
    };
  });
}

function pickDomain(payload, domain: string) {
  switch (domain) {
    case "summary":
      return payload;
    case "runtime":
      return payload.status;
    case "workspace":
      return payload.workspace;
    case "sessions":
      return payload.session;
    case "providers":
    case "models":
    case "auth":
    case "scheduler":
    case "memory":
    case "skills":
    case "channels":
    case "plugins":
      return payload.resources[domain];
    case "streaming":
    case "sandbox":
    case "doctor":
    case "compat":
      return payload.status.capabilityMap?.[domain] ?? null;
    default:
      return null;
  }
}

export async function runRuntimePortalCli(input): Promise<number | null> {
  if (input.group !== "runtime") return null;

  if (input.command === "adapters") {
    const adapters = listRuntimeAdapters().map((adapter) => ({
      id: adapter.id,
      runtimeName: adapter.runtimeName,
      stability: adapter.stability,
      supportLevel: adapter.supportLevel,
      targetedForFullIntegration: RUNTIME_PORTAL_IDS.has(adapter.id),
    }));
    writePayload(input, { adapters });
    return CLI_EXIT_OK;
  }

  if (!input.command || !RUNTIME_ADAPTER_IDS.has(input.command)) return null;
  if (!RUNTIME_PORTAL_IDS.has(input.command)) return null;

  const runtimeId = input.command as RuntimeAdapterId;
  const operation = input.subcommand ?? "summary";
  const domain = normalizeDomain(input.positionals[3] ?? input.flags.domain);
  const adapter = getRuntimeAdapter(runtimeId);
  const scopedFlags = { ...input.flags, runtime: runtimeId };
  const claw = await input.createCliClaw(runtimeId, scopedFlags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId);

  if (operation === "help" || operation === "--help") {
    input.context.stdout.write(`${runtimePortalUsage(input.binName)}\n`);
    return CLI_EXIT_OK;
  }

  if (operation === "commands") {
    writePayload(input, buildCommandMatrix(adapter, runtimeId), { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  if (operation === "session") {
    writePayload(input, {
      runtimeId,
      session: getRuntimeSessionDescriptor(adapter, { adapter: runtimeId, workspacePath: input.workspaceRoot }),
    }, { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  if (operation === "workspace") {
    writePayload(input, {
      runtimeId,
      workspace: {
        managedFiles: await claw.workspace.listManagedFiles(),
        canonicalPaths: claw.workspace.canonicalPaths(),
        inspect: await claw.workspace.inspect(),
      },
    }, { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  const status = await claw.runtime.status();
  const session = getRuntimeSessionDescriptor(adapter, { adapter: runtimeId, workspacePath: input.workspaceRoot });
  const workspace = {
    managedFiles: await claw.workspace.listManagedFiles(),
    canonicalPaths: claw.workspace.canonicalPaths(),
  };

  if (operation === "status") {
    writePayload(input, { runtimeId, status }, { runtimeId, operation });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  const requestedResourceDomain = operation === "resources" ? normalizeDomain(input.positionals[3] ?? input.flags.domain) : "all";
  const resources = await readResources(claw, requestedResourceDomain, status);
  const payload = {
    runtimeId,
    runtimeName: adapter.runtimeName,
    support: {
      stability: adapter.stability,
      supportLevel: adapter.supportLevel,
      recommended: !!adapter.recommended,
    },
    status,
    session,
    workspace,
    resources,
    domains: domainRows(status, resources, workspace, session),
  };

  if (operation === "summary" || operation === "domains") {
    writePayload(input, payload, { runtimeId, operation });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (operation === "domain" || operation === "resources") {
    const selectedDomain = operation === "resources" ? requestedResourceDomain : domain;
    const selected = pickDomain(payload, selectedDomain);
    if (selected === null) {
      if (!input.wantsJson) input.context.stderr.write(`Unknown runtime domain: ${selectedDomain}\n`);
      return CLI_EXIT_USAGE;
    }
    writePayload(input, {
      runtimeId,
      domain: selectedDomain,
      data: selected,
    }, { runtimeId, operation, domain: selectedDomain });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (!input.wantsJson) input.context.stderr.write(`${runtimePortalUsage(input.binName)}\n`);
  return CLI_EXIT_USAGE;
}
