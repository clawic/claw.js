import {
  MAC_CAPABILITY_ATLAS,
  MAC_CONTROL_COMMAND_ROOTS,
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  type MacActionRequest,
  buildMacActionPlan,
  clawMacControlPlaneRegistry,
  clawContractVersionV1,
  findMacAtlasCapability,
  listMacAtlasCapabilities,
  listMacRelatedSurfaces,
  macActionRequestSchema,
} from "@clawjs/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

const execFileAsync = promisify(execFile);

export const MAC_CONTROL_CLI_ROOTS = new Set(MAC_CONTROL_COMMAND_ROOTS.map((entry) => entry.root));

export function isMacControlCliRoot(group: string | undefined): boolean {
  return !!group && MAC_CONTROL_CLI_ROOTS.has(group);
}

export async function runMacControlCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [group, command, target] = input.positionals;
  if (!group || !isMacControlCliRoot(group)) return CLI_EXIT_USAGE;

  if (group === "mac") return await runMacPortal(input, command, target);
  if (group === "permissions") return await runMacPermissions(input, command, target);
  return await runMacFamily(input, group, command, input.positionals.slice(2));
}

async function runMacPortal(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, command: string | undefined, target: string | undefined): Promise<number> {
  const action = command ?? "coverage";
  if (action === "atlas" || action === "coverage") {
    const family = input.flags.family ?? target;
    const capabilities = listMacAtlasCapabilities(family ? { family } : {});
    return writePayload(input, "mac", {
      registryVersion: clawMacControlPlaneRegistry.version,
      command: action,
      family: family ?? null,
      roots: MAC_CONTROL_COMMAND_ROOTS,
      capabilities,
      coverage: summarizeCoverage(capabilities),
    });
  }
  if (action === "permissions") {
    return runMacPermissions({ ...input, positionals: ["permissions", ...(target ? [target] : [])] }, target, undefined);
  }
  if (action === "doctor") {
    return writePayload(input, "mac", {
      command: "doctor",
      status: "planned",
      checks: [
        "signed-host identity",
        "TCC permission projection",
        "native action broker allowlist",
        "receipt/audit store",
        "Clawix and Claw.app host validation",
      ],
    });
  }
  if (action === "audit") {
    const live = await runSignedHostIfConfigured(input, "mac", ["system", "mac", "audit", "--json"]);
    if (live !== null) return live;
    return writePayload(input, "mac", { command: "audit", status: "host_required", reason: "Mac action audit lives in the signed host operational store." });
  }
  if (action === "plan") {
    if (!target) throw new CliHandledError("usage_error", `Usage: ${input.binName} mac plan <mac.capability.id> [--json]`, CLI_EXIT_USAGE);
    const capability = findMacAtlasCapability(target);
    if (!capability) throw new CliHandledError("unknown_mac_capability", `Unknown Mac capability: ${target}`, CLI_EXIT_USAGE);
    return writePayload(input, "mac", buildDryRunPlan(capability));
  }
  if (action === "revert") {
    if (!target?.startsWith("macact_")) throw new CliHandledError("usage_error", `Usage: ${input.binName} mac revert macact_<id> [--json]`, CLI_EXIT_USAGE);
    const hostArgs = ["system", "mac", "revert", "--receipt-id", target, "--json"];
    if (hasConfirm(input)) hostArgs.splice(hostArgs.length - 1, 0, "--confirm", "true");
    const live = await runSignedHostIfConfigured(input, "mac", hostArgs);
    if (live !== null) return live;
    return writePayload(input, "mac", {
      command: "revert",
      receiptId: target,
      status: "plan_required",
      revertContract: "Revert always plans first and only executes after explicit confirmation.",
    });
  }
  throw new CliHandledError("unknown_mac_command", `Unknown Mac control command: ${action}`, CLI_EXIT_USAGE);
}

async function runMacPermissions(input: {
  argv?: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, command: string | undefined, target: string | undefined): Promise<number> {
  const action = command ?? "list";
  if (action === "list" || action === "coverage") {
    const live = await runSignedHostIfConfigured(input, "permissions", ["system", "mac", "permissions", "--json"]);
    if (live !== null) return live;
    return writePayload(input, "permissions", {
      command: action,
      packs: MAC_PERMISSION_PACKS,
      permissions: MAC_PERMISSION_CATALOG,
    });
  }
  if (action === "show" || action === "check" || action === "request" || action === "explain") {
    const permission = target ? resolvePermission(target) : undefined;
    if (!permission) throw new CliHandledError("unknown_mac_permission", `Unknown Mac permission: ${target ?? "<missing>"}`, CLI_EXIT_USAGE);
    if (action === "request") {
      const hostArgs = [
        "system",
        "mac",
        "permissions",
        "--command",
        "request",
        "--permission-id",
        permission.id,
        "--json",
      ];
      if (hasConfirm(input)) hostArgs.splice(hostArgs.length - 1, 0, "--confirm", "true");
      const live = await runSignedHostIfConfigured(input, "permissions", hostArgs);
      if (live !== null) return live;
    }
    return writePayload(input, "permissions", {
      command: action,
      permission,
      plan: action === "request"
        ? {
            status: "permission_plan",
            nativePrompt: "just_in_time_only",
            execution: "signed_host_required",
            surprisePrompt: false,
          }
        : undefined,
    });
  }
  if (action === "audit") {
    return writePayload(input, "permissions", { command: "audit", status: "host_required", reason: "Permission lifecycle audit is stored by the signed host." });
  }
  if (action === "doctor") {
    return writePayload(input, "permissions", {
      command: "doctor",
      checks: ["Info.plist usage descriptions", "entitlements", "TCC projection", "revocation preflight", "broker-only permission calls"],
    });
  }
  throw new CliHandledError("unknown_permissions_command", `Unknown permissions command: ${action}`, CLI_EXIT_USAGE);
}

async function runMacFamily(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, group: string, command: string | undefined, targetPositionals: string[] = []): Promise<number> {
  const capabilities = listMacAtlasCapabilities({ family: group });
  const action = command ?? "coverage";
  if (action === "coverage" || action === "list" && capabilities.length === 0) {
    return writePayload(input, group, {
      root: group,
      relatedSurfaces: listMacRelatedSurfaces(group),
      capabilities,
      coverage: summarizeCoverage(capabilities),
    });
  }

  const capability = capabilities.find((entry) => entry.action === action || entry.cli.aliases.some((alias) => alias.endsWith(` ${action}`)));
  if (!capability) {
    return writePayload(input, group, {
      root: group,
      action,
      status: "atlas_gap",
      relatedSurfaces: listMacRelatedSurfaces(group),
      knownCapabilities: capabilities.map((entry) => ({ id: entry.id, usage: entry.cli.canonicalUsage, coverageState: entry.coverageState })),
    });
  }

  if (input.argv.includes("--dry-run") || input.flags["dry-run"] === "true" || input.flags.dryRun === "true") {
    return writePayload(input, group, buildDryRunPlan(capability, input.flags, targetPositionals));
  }

  if (capability.coverageState === "executable" || capability.coverageState === "host_validated") {
    const request = buildMacRequest(capability, input.flags, targetPositionals, false);
    const hostArgs = ["system", "mac", "execute", "--request-json", JSON.stringify(request), "--json"];
    const live = await runSignedHostIfConfigured(input, group, hostArgs);
    if (live !== null) return live;
  }

  return writePayload(input, group, {
    root: group,
    capability,
    status: capability.coverageState === "executable" || capability.coverageState === "host_validated" ? "signed_host_required" : capability.coverageState,
    message: "Mac action execution is brokered by the signed host. Use --dry-run to inspect the plan in this CLI surface.",
    relatedSurfaces: capability.cli.relatedSurfaces,
  });
}

function buildDryRunPlan(capability: NonNullable<ReturnType<typeof findMacAtlasCapability>>, flags: Record<string, string> = {}, targetPositionals: string[] = []) {
  const request = buildMacRequest(capability, flags, targetPositionals, true);
  const plan = buildMacActionPlan({ request, capability });
  return {
    status: "dry_run",
    plan,
    capabilityId: capability.id,
    risk: plan.risk,
    coverageState: plan.coverageState,
    willMutate: plan.willMutate,
    permissions: plan.permissionRequirements.map((permission) => permission.permissionId),
    blockedReasons: plan.blockedReasons,
    revert: plan.rollback.level,
    relatedSurfaces: plan.relatedSurfaces,
    approvalRequired: plan.requiredApprovals.length > 0,
    execution: "signed_host_broker",
  };
}

function buildMacRequest(
  capability: NonNullable<ReturnType<typeof findMacAtlasCapability>>,
  flags: Record<string, string> = {},
  targetPositionals: string[] = [],
  dryRun: boolean,
): MacActionRequest {
  const requestShape = buildRequestShape(capability, flags, targetPositionals);
  return macActionRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: `cli.${capability.id}`,
    capabilityId: capability.id,
    actor: { kind: "owner_cli", id: "local-cli", role: "owner" },
    host: { hostId: "active-signed-host", bundleId: "signed-host-required", appVariant: dryRun ? "cli-dry-run" : "cli-live" },
    ...requestShape,
    dryRun,
    reason: flags.reason,
  });
}

function buildRequestShape(
  capability: NonNullable<ReturnType<typeof findMacAtlasCapability>>,
  flags: Record<string, string>,
  targetPositionals: string[],
): { target?: { kind: string; name?: string; selector?: Record<string, unknown> }; arguments?: Record<string, unknown> } {
  const args: Record<string, unknown> = {};
  const positionalTarget = targetPositionals.join(" ").trim() || undefined;
  const secretRef = flags["secret-ref"] ?? flags.secretRef ?? flags.secret;
  const device = flags.device ?? flags.interface;
  if (device) args.device = device;

  if (capability.id === "mac.wifi.connect") {
    const ssid = flags.ssid ?? positionalTarget;
    if (ssid) args.ssid = ssid;
    if (secretRef) args.secretRef = secretRef;
    if (flags.password) args.password = flags.password;
    return {
      target: ssid ? { kind: "wifi_network", name: ssid, selector: { ssid } } : undefined,
      arguments: args,
    };
  }

  if (capability.family === "shortcut" && (capability.action === "show" || capability.action === "run")) {
    const name = flags.name ?? positionalTarget;
    if (name) args.name = name;
    if (flags.input) args.input = flags.input;
    if (flags.output) args.output = flags.output;
    return {
      target: name ? { kind: "shortcut", name, selector: { name } } : undefined,
      arguments: args,
    };
  }

  if (capability.family === "window") {
    const selector: Record<string, unknown> = {};
    for (const key of ["id", "app", "title", "x", "y", "width", "height"]) {
      if (flags[key]) args[key] = flags[key];
    }
    if (flags.id) selector.id = flags.id;
    if (flags.app) selector.app = flags.app;
    if (flags.title) selector.title = flags.title;
    if (flags.focused === "true" || flags.focused === "") {
      selector.focused = true;
      args.focused = "true";
    }
    return {
      target: Object.keys(selector).length > 0 ? { kind: "window", selector } : undefined,
      arguments: args,
    };
  }

  if (capability.id === "mac.audio.volume" || capability.id === "mac.display.brightness") {
    const numericPositionals = targetPositionals.filter((entry) => /^\d+$/.test(entry));
    const value = flags.value ?? numericPositionals[numericPositionals.length - 1];
    if (value) args.value = value;
    return Object.keys(args).length > 0 ? { arguments: args } : {};
  }

  return Object.keys(args).length > 0 ? { arguments: args } : {};
}

function summarizeCoverage(capabilities: typeof MAC_CAPABILITY_ATLAS) {
  const summary: Record<string, number> = {};
  for (const capability of capabilities) {
    summary[capability.coverageState] = (summary[capability.coverageState] ?? 0) + 1;
  }
  return summary;
}

function resolvePermission(target: string) {
  const normalized = target.startsWith("mac.permission.") ? target : `mac.permission.${target.replace(/-/g, "_")}`;
  return MAC_PERMISSION_CATALOG.find((entry) => entry.id === normalized || entry.id.endsWith(`.${target}`) || entry.label.toLowerCase() === target.toLowerCase());
}

function writePayload(input: {
  context: CliContext;
  wantsJson: boolean;
}, canonicalCommand: string, payload: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, canonicalCommand, payload);
  } else if (Array.isArray((payload as { capabilities?: unknown[] }).capabilities)) {
    const rows = ((payload as { capabilities: Array<{ id: string; risk: string; coverageState: string; cli: { canonicalUsage: string } }> }).capabilities).map((entry) => ({
      id: entry.id,
      risk: entry.risk,
      state: entry.coverageState,
      usage: entry.cli.canonicalUsage,
    }));
    input.context.stdout.write(rows.length > 0 ? `${formatCliTable(rows)}\n` : `${JSON.stringify(payload, null, 2)}\n`);
  } else {
    input.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
  return CLI_EXIT_OK;
}

async function runSignedHostIfConfigured(
  input: { context: CliContext; wantsJson: boolean },
  canonicalCommand: string,
  args: string[],
): Promise<number | null> {
  const parts = splitLiveBrokerCommand(process.env.CLAW_LIVE_BROKER_COMMAND);
  if (!parts) return null;
  const [executable, ...prefixArgs] = parts;
  const response = await runSignedHostCommand(executable, [...prefixArgs, ...args]);
  return writePayload(input, canonicalCommand, {
    status: "signed_host_result",
    source: "CLAW_LIVE_BROKER_COMMAND",
    response,
  });
}

function splitLiveBrokerCommand(command: string | undefined): string[] | null {
  const trimmed = command?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/);
}

async function runSignedHostCommand(executable: string, args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(executable, args, {
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseSignedHostJSON(stdout);
  } catch (error) {
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string" ? (error as { stdout: string }).stdout : "";
    if (stdout.trim()) return parseSignedHostJSON(stdout);
    const message = error instanceof Error ? error.message : String(error);
    throw new CliHandledError("signed_host_bridge_failed", `Mac signed host bridge failed: ${message}`);
  }
}

function parseSignedHostJSON(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliHandledError("signed_host_bridge_invalid_json", `Mac signed host bridge returned invalid JSON: ${message}`);
  }
}

function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes" || value === "";
}

function hasConfirm(input: { argv?: string[]; flags: Record<string, string> }): boolean {
  return isTruthy(input.flags.confirm) ||
    isTruthy(input.flags.approved) ||
    input.argv?.includes("--confirm") === true ||
    input.argv?.includes("--approved") === true;
}
