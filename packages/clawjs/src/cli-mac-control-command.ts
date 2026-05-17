import {
  MAC_CAPABILITY_ATLAS,
  MAC_CONTROL_COMMAND_ROOTS,
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  clawMacControlPlaneRegistry,
  findMacAtlasCapability,
  listMacAtlasCapabilities,
  listMacRelatedSurfaces,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

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

  if (group === "mac") return runMacPortal(input, command, target);
  if (group === "permissions") return runMacPermissions(input, command, target);
  return runMacFamily(input, group, command);
}

function runMacPortal(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, command: string | undefined, target: string | undefined): number {
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
    return runMacPermissions({ ...input, positionals: ["permissions", target].filter(Boolean) }, target, undefined);
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
    return writePayload(input, "mac", {
      command: "revert",
      receiptId: target,
      status: "plan_required",
      revertContract: "Revert always plans first and only executes after explicit confirmation.",
    });
  }
  throw new CliHandledError("unknown_mac_command", `Unknown Mac control command: ${action}`, CLI_EXIT_USAGE);
}

function runMacPermissions(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, command: string | undefined, target: string | undefined): number {
  const action = command ?? "list";
  if (action === "list" || action === "coverage") {
    return writePayload(input, "permissions", {
      command: action,
      packs: MAC_PERMISSION_PACKS,
      permissions: MAC_PERMISSION_CATALOG,
    });
  }
  if (action === "show" || action === "check" || action === "request" || action === "explain") {
    const permission = target ? resolvePermission(target) : undefined;
    if (!permission) throw new CliHandledError("unknown_mac_permission", `Unknown Mac permission: ${target ?? "<missing>"}`, CLI_EXIT_USAGE);
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

function runMacFamily(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}, group: string, command: string | undefined): number {
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
    return writePayload(input, group, buildDryRunPlan(capability));
  }

  return writePayload(input, group, {
    root: group,
    capability,
    status: capability.coverageState === "executable" || capability.coverageState === "host_validated" ? "signed_host_required" : capability.coverageState,
    message: "Mac action execution is brokered by the signed host. Use --dry-run to inspect the plan in this CLI surface.",
    relatedSurfaces: capability.cli.relatedSurfaces,
  });
}

function buildDryRunPlan(capability: NonNullable<ReturnType<typeof findMacAtlasCapability>>) {
  return {
    status: "dry_run",
    capabilityId: capability.id,
    risk: capability.risk,
    coverageState: capability.coverageState,
    willMutate: capability.mutatesState,
    permissions: capability.permissions,
    revert: capability.revert,
    relatedSurfaces: capability.cli.relatedSurfaces,
    approvalRequired: capability.risk === "medium" || capability.risk === "high" || capability.risk === "critical",
    execution: "signed_host_broker",
  };
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
