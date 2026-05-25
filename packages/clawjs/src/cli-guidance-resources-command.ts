import { actorKindSchema, guidanceRiskClassSchema, resourceKindSchema, type ResourceKind, type RuntimeAdapterId } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { createCliClaw } from "./cli-claw-factory.ts";

type GuidanceCliFacade = {
    status: () => { records: number; active: number; archived: number };
    list: (input?: { status?: "active" | "archived" }) => Array<{ id: string; title: string; status: string; severity: string; capsule: string; details?: string }>;
    show: (id: string) => { id: string; status: string; severity: string; capsule: string; details?: string } | null;
    create: (input: unknown) => { id: string };
    archive: (id: string) => { id: string };
    match: (input: unknown) => { hints: Array<{ id: string; severity: string; capsule: string }> };
};

type ResourcesCliFacade = {
    list: (input?: { status?: "active" | "missing" | "moved" | "stale"; kind?: string; refreshStatus?: boolean }) => Array<{ id: string; kind: string; status: string; label?: string }>;
    register: (input: unknown) => { id: string };
    show: (id: string) => unknown | null;
    resolve: (id: string) => unknown;
    status: (id: string) => unknown;
    read: (id: string, input?: { maxBytes?: number }) => { content?: string } | unknown;
};

type GuidanceResourcesClaw = Awaited<ReturnType<typeof createCliClaw>> & {
  guidance: GuidanceCliFacade;
  resources: ResourcesCliFacade;
};

const GUIDANCE_LIST_STATUSES = ["active", "archived"] as const;
const GUIDANCE_SEVERITIES = ["info", "notice", "warning", "critical"] as const;
const GUIDANCE_ACTOR_KINDS = actorKindSchema.options;
const GUIDANCE_RISK_CLASSES = guidanceRiskClassSchema.options;
const GUIDANCE_SUBCOMMANDS = ["status", "list", "show", "create", "archive", "match"] as const;
const RESOURCE_LIST_STATUSES = ["active", "missing", "moved", "stale"] as const;
const RESOURCE_SUBCOMMANDS = ["list", "register", "show", "resolve", "read", "status"] as const;
const RESOURCE_LOCATOR_KINDS = ["path", "url", "hostname", "secret-ref", "opaque"] as const;

export async function runGuidanceResourcesCli(input: {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  runtimeAdapterId: RuntimeAdapterId;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
}): Promise<number | null> {
  if (input.group !== "guidance" && input.group !== "resources") return null;
  const claw = await createCliClaw(
    input.runtimeAdapterId,
    input.flags,
    input.workspaceRoot,
    input.appId,
    input.workspaceId,
    input.agentId,
    input.argv,
  ) as GuidanceResourcesClaw;

  try {
    if (input.group === "guidance") {
      return runGuidanceCli({ ...input, claw });
    }
    return runResourcesCli({ ...input, claw });
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, input.group, handled, {
      invokedCommand: input.group,
      subcommand: input.command ?? null,
      ...(input.subcommand ? { operation: input.subcommand } : {}),
    });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}

function runGuidanceCli(input: Parameters<typeof runGuidanceResourcesCli>[0] & { claw: GuidanceResourcesClaw }): number {
  const { command, subcommand, flags, context, wantsJson, claw } = input;
  const guidance = claw.guidance as GuidanceCliFacade;
  const write = (payload: unknown) => writeCommandJsonOk(context.stdout, "guidance", payload, {
    invokedCommand: "guidance",
    subcommand: command ?? null,
    ...(subcommand ? { operation: subcommand } : {}),
  });

  if (!command || command === "status") {
    const status = guidance.status();
    if (wantsJson) write(status);
    else context.stdout.write(`guidance ${status.records} active ${status.active} archived ${status.archived}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "list") {
    const records = guidance.list({ ...(flags.status ? { status: parseAllowedFlag(flags.status, GUIDANCE_LIST_STATUSES, "invalid_guidance_status", "guidance list --status", "cli.guidance.status") } : {}) });
    if (wantsJson) write({ guidance: records });
    else context.stdout.write(`${records.map((record) => `${record.severity} ${record.status} ${record.id} ${record.title}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "show" || command === "get") {
    const id = subcommand || flags.id;
    if (!id) throw new CliHandledError("usage", "Usage: claw guidance show <id>", CLI_EXIT_USAGE);
    const record = guidance.show(id);
    if (!record) throw new CliHandledError("not_found", `Guidance not found: ${id}`, CLI_EXIT_FAILURE);
    if (wantsJson) write(record);
    else context.stdout.write(`${record.severity} ${record.id}\n${record.capsule}\n${record.details ? `${record.details}\n` : ""}`);
    return CLI_EXIT_OK;
  }
  if (command === "create") {
    if (!flags.title || !flags.capsule) {
      throw new CliHandledError("usage", "Usage: claw guidance create --title TEXT --capsule TEXT [--command CMD] [--resource res_...]", CLI_EXIT_USAGE);
    }
    const record = guidance.create({
      id: flags.id,
      title: flags.title,
      capsule: flags.capsule,
      details: flags.details,
      severity: flags.severity
        ? parseAllowedFlag(flags.severity, GUIDANCE_SEVERITIES, "invalid_guidance_severity", "guidance create --severity", "cli.guidance.severity")
        : undefined,
      ...(flags.priority !== undefined ? { priority: parseGuidancePriorityFlag(flags.priority) } : {}),
      resourceIds: parseCsvFlag(flags.resource || flags.resources),
      commands: parseCsvFlag(flags.command || flags.commands),
      applyWhen: {
        commands: parseCsvFlag(flags.command || flags.commands),
        flags: parseCsvFlag(flags.flag || flags.flags),
        argIncludes: parseCsvFlag(flags.arg || flags.args || flags["arg-includes"]),
        cwdPrefixes: parseCsvFlag(flags.cwd || flags["cwd-prefix"] || flags["cwd-prefixes"]),
        domains: parseCsvFlag(flags.domain || flags.domains),
        services: parseCsvFlag(flags.service || flags.services),
        hostnames: parseCsvFlag(flags.hostname || flags.hostnames),
        urls: parseCsvFlag(flags.url || flags.urls),
        secretRefs: parseCsvFlag(flags["secret-ref"] || flags["secret-refs"]),
        resourceIds: parseCsvFlag(flags["match-resource"] || flags["match-resources"]),
        projects: parseCsvFlag(flags.project || flags.projects),
        workspaces: parseCsvFlag(flags.workspace || flags.workspaces),
        agents: parseCsvFlag(flags.agent || flags.agents),
        actorKinds: parseAllowedCsvFlag(flags["actor-kind"] || flags["actor-kinds"], GUIDANCE_ACTOR_KINDS, "invalid_guidance_actor_kind", "guidance create --actor-kind", "cli.guidance.actor_kind"),
        riskClasses: parseAllowedCsvFlag(flags["risk-class"] || flags["risk-classes"], GUIDANCE_RISK_CLASSES, "invalid_guidance_risk_class", "guidance create --risk-class", "cli.guidance.risk_class"),
      },
    });
    if (wantsJson) write(record);
    else context.stdout.write(`created guidance ${record.id}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "archive") {
    const id = subcommand || flags.id;
    if (!id) throw new CliHandledError("usage", "Usage: claw guidance archive <id>", CLI_EXIT_USAGE);
    const record = guidance.archive(id);
    if (wantsJson) write(record);
    else context.stdout.write(`archived guidance ${record.id}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "match") {
    const result = guidance.match({
      command: subcommand || flags.command,
      flags: parseCsvFlag(flags.flag || flags.flags),
      args: parseCsvFlag(flags.arg || flags.args),
      cwd: flags.cwd,
      domain: flags.domain,
      service: flags.service,
      hostname: flags.hostname,
      url: flags.url,
      secretRef: flags["secret-ref"],
      resourceIds: parseCsvFlag(flags.resource || flags.resources),
      project: flags.project,
      workspace: flags.workspace,
      agent: flags.agent,
      actorKind: flags["actor-kind"]
        ? parseAllowedFlag(flags["actor-kind"], GUIDANCE_ACTOR_KINDS, "invalid_guidance_actor_kind", "guidance match --actor-kind", "cli.guidance.actor_kind")
        : undefined,
      riskClass: flags["risk-class"]
        ? parseAllowedFlag(flags["risk-class"], GUIDANCE_RISK_CLASSES, "invalid_guidance_risk_class", "guidance match --risk-class", "cli.guidance.risk_class")
        : undefined,
      ...(flags.limit !== undefined ? { limit: parseNonNegativeIntegerFlag(flags.limit, "guidance match limit") } : {}),
    });
    if (wantsJson) write(result);
    else context.stdout.write(`${result.hints.map((hint) => `${hint.severity} ${hint.id} ${hint.capsule}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (wantsJson) {
    writeCommandJsonError(context.stdout, "guidance", new CliHandledError(
      "unknown_guidance_subcommand",
      command ? `Unknown guidance subcommand: ${command}.` : "Missing guidance subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.guidance.subcommand",
        suggestion: `Use one of: ${GUIDANCE_SUBCOMMANDS.join(", ")}.`,
        safeNextStep: "Run claw guidance list --json to inspect active guidance, or claw help guidance --json for the guidance command surface.",
        details: {
          received: command ?? null,
          validSubcommands: [...GUIDANCE_SUBCOMMANDS],
        },
      },
    ), {
      invokedCommand: "guidance",
      subcommand: command ?? null,
    });
    return CLI_EXIT_USAGE;
  }
  context.stderr.write("Usage: claw guidance list|show|create|archive|match\n");
  return CLI_EXIT_USAGE;
}

function runResourcesCli(input: Parameters<typeof runGuidanceResourcesCli>[0] & { claw: GuidanceResourcesClaw }): number {
  const { command, subcommand, flags, positionals, context, wantsJson, claw } = input;
  const resourcesFacade = claw.resources as ResourcesCliFacade;
  const write = (payload: unknown) => writeCommandJsonOk(context.stdout, "resources", payload, {
    invokedCommand: "resources",
    subcommand: command ?? null,
    ...(subcommand ? { operation: subcommand } : {}),
  });

  if (!command || command === "list") {
    const resources = resourcesFacade.list({
      ...(flags.status ? { status: parseAllowedFlag(flags.status, RESOURCE_LIST_STATUSES, "invalid_resource_status", "resources list --status", "cli.resources.status") } : {}),
      ...(flags.kind ? { kind: flags.kind } : {}),
      ...(readBooleanFlag(input.argv ?? [], flags, "refresh", false) ? { refreshStatus: true } : {}),
    });
    if (wantsJson) write({ resources });
    else context.stdout.write(`${resources.map((resource) => `${resource.status} ${resource.kind} ${resource.id} ${resource.label ?? ""}`.trim()).join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "register") {
    const locator = resolveResourceLocator(positionals[2] || flags.path || flags.url || flags.hostname || flags["secret-ref"], flags);
    if (!locator) throw new CliHandledError("usage", "Usage: claw resources register <path|url|hostname|secret-ref> [--kind file|directory|project|workspace|server|secret-ref|document|instruction|other]", CLI_EXIT_USAGE);
    const resource = resourcesFacade.register({
      id: flags.id,
      kind: flags.kind ? parseResourceKindFlag(flags.kind) : undefined,
      locator,
      label: flags.label,
      scope: {
        workspaceId: flags["workspace-id"],
        projectId: flags["project-id"],
        agentId: flags["agent-id"],
      },
      fingerprint: flags.fingerprint,
      bookmark: flags.bookmark,
      fileIdentity: flags["file-identity"],
    });
    if (wantsJson) write(resource);
    else context.stdout.write(`${resource.id}\n`);
    return CLI_EXIT_OK;
  }
  if (command === "show" || command === "resolve" || command === "status" || command === "read") {
    const id = subcommand || flags.id;
    if (!id) throw new CliHandledError("usage", `Usage: claw resources ${command} <res_id>`, CLI_EXIT_USAGE);
    const payload = command === "read"
      ? resourcesFacade.read(id, { ...(flags["max-bytes"] !== undefined ? { maxBytes: parseResourceMaxBytesFlag(flags["max-bytes"]) } : {}) })
      : command === "status"
        ? resourcesFacade.status(id)
        : command === "resolve"
          ? resourcesFacade.resolve(id)
          : resourcesFacade.show(id);
    if (!payload) throw new CliHandledError("not_found", `Resource not found: ${id}`, CLI_EXIT_FAILURE);
    if (wantsJson) write(payload);
    else if (command === "read" && isResourceReadPayload(payload) && payload.content) context.stdout.write(payload.content);
    else context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return CLI_EXIT_OK;
  }

  if (wantsJson) {
    writeCommandJsonError(context.stdout, "resources", new CliHandledError(
      "unknown_resources_subcommand",
      command ? `Unknown resources subcommand: ${command}.` : "Missing resources subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.resources.subcommand",
        suggestion: `Use one of: ${RESOURCE_SUBCOMMANDS.join(", ")}.`,
        safeNextStep: "Run claw resources list --json to inspect registered resources, or claw help resources --json for the resources command surface.",
        details: {
          received: command ?? null,
          validSubcommands: [...RESOURCE_SUBCOMMANDS],
        },
      },
    ), {
      invokedCommand: "resources",
      subcommand: command ?? null,
    });
    return CLI_EXIT_USAGE;
  }
  context.stderr.write(`Usage: claw resources ${RESOURCE_SUBCOMMANDS.join("|")}\n`);
  return CLI_EXIT_USAGE;
}

function isResourceReadPayload(value: unknown): value is { content?: string } {
  return typeof value === "object" && value !== null && "content" in value;
}

function parseNonNegativeIntegerFlag(value: string, label: string): number {
  const parsed = parseCanonicalDecimalInteger(value, { signed: false });
  if (parsed === null || parsed < 0) {
    throw new CliHandledError("invalid_guidance_limit", `${label} must be a non-negative integer.`, CLI_EXIT_USAGE, {
      location: "cli.guidance.limit",
    });
  }
  return parsed;
}

function parseGuidancePriorityFlag(value: string): number {
  const parsed = parseCanonicalDecimalInteger(value, { signed: true });
  if (parsed === null) {
    throw new CliHandledError("invalid_guidance_priority", "guidance create --priority must be an integer.", CLI_EXIT_USAGE, {
      location: "cli.guidance.priority",
    });
  }
  return parsed;
}

function parseAllowedFlag<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  code: string,
  label: string,
  location: string,
): TValue {
  if ((allowed as readonly string[]).includes(value)) return value as TValue;
  throw new CliHandledError(code, `${label} must be one of: ${allowed.join(", ")}.`, CLI_EXIT_USAGE, { location });
}

function parseAllowedCsvFlag<TValue extends string>(
  value: string | undefined,
  allowed: readonly TValue[],
  code: string,
  label: string,
  location: string,
): TValue[] {
  return parseCsvFlag(value).map((entry) => parseAllowedFlag(entry, allowed, code, label, location));
}

function parseResourceMaxBytesFlag(value: string): number {
  const parsed = parseCanonicalDecimalInteger(value, { signed: false });
  if (parsed === null || parsed < 1 || parsed > 256_000) {
    throw new CliHandledError("invalid_resource_max_bytes", "resources read --max-bytes must be an integer between 1 and 256000.", CLI_EXIT_USAGE, {
      location: "cli.resources.max_bytes",
    });
  }
  return parsed;
}

function parseCanonicalDecimalInteger(value: string, options: { signed: boolean }): number | null {
  const pattern = options.signed ? /^-?(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)$/;
  if (!pattern.test(value) || value === "-0") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function parseResourceKindFlag(value: string): ResourceKind {
  const parsed = resourceKindSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new CliHandledError("invalid_resource_kind", `resources register --kind must be one of: ${resourceKindSchema.options.join(", ")}.`, CLI_EXIT_USAGE, {
    location: "cli.resources.kind",
  });
}

function resolveResourceLocator(value: string | undefined, flags: Record<string, string>) {
  if (!value) return null;
  if (flags["secret-ref"]) return { kind: "secret-ref" as const, value };
  if (flags.hostname) return { kind: "hostname" as const, value };
  if (flags.url || /^https?:\/\//.test(value)) return { kind: "url" as const, value };
  if (flags["locator-kind"]) {
    return {
      kind: parseAllowedFlag(flags["locator-kind"], RESOURCE_LOCATOR_KINDS, "invalid_resource_locator_kind", "resources register --locator-kind", "cli.resources.locator_kind"),
      value,
    };
  }
  return { kind: "path" as const, value };
}
