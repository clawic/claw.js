import {
  clawPersistentSurfaceRegistry,
  createExampleSyncResourceManifest,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
} from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

type CliContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
};

type RemoteSyncCliInput = {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
};

function routeIds() {
  return (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id);
}

function remoteRoutes() {
  const required = new Set<string>(remoteSyncRequiredRouteIds);
  return (clawPersistentSurfaceRegistry.routes ?? []).filter((route) => required.has(route.id));
}

function remoteLayerNodes() {
  const layerIds = new Set([
    "claw.coordinator",
    "claw.gateway",
    "claw.connector",
    "claw.sync",
    "claw.transport.iroh",
    "claw.headlessHost",
    "claw.remoteCache",
    "claw.remote.classification",
  ]);
  return clawPersistentSurfaceRegistry.nodes.filter((node) => layerIds.has(node.id));
}

function writeOutput(input: RemoteSyncCliInput, command: string, data: unknown, text: string, subcommand?: string): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, command, data, { subcommand: subcommand ?? null });
  } else {
    input.context.stdout.write(`${text}\n`);
  }
  return CLI_EXIT_OK;
}

function missing(input: RemoteSyncCliInput, usage: string): number {
  input.context.stderr.write(`Usage: ${input.binName} ${usage}\n`);
  return CLI_EXIT_USAGE;
}

function conformancePayload() {
  const routes = routeIds();
  const missingRoutes = remoteSyncRequiredRouteIds.filter((routeId) => !routes.includes(routeId));
  return {
    status: missingRoutes.length === 0 ? "baseline_registered" : "baseline_incomplete",
    decisions: remoteSyncRequiredDecisionIds.map((decisionId) => ({ decisionId, status: "must_verify_before_goal_completion" })),
    requiredRoutes: remoteSyncRequiredRouteIds.map((routeId) => ({ routeId, registered: routes.includes(routeId) })),
    missingRoutes,
    hostedSelfHostedParity: "required",
    trustModes: ["sovereign_e2e_tunnel", "governed_gateway"],
    transportContract: "transport_agnostic_iroh_v1_adapter",
  };
}

export async function runRemoteCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "classify") {
    const classifications = clawPersistentSurfaceRegistry.nodes
      .filter((node) => node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay"))
      .map((node) => ({
        id: node.id,
        name: node.name,
        relay: node.programmaticSurfaces?.includes("relay")
          ? "remote-safe"
          : node.surfaceGaps?.find((gap) => gap.surface === "relay")?.status ?? "pending",
        policy: node.notes ?? null,
      }));
    return writeOutput(input, "remote", { classifications }, classifications.map((entry) => `${entry.id}: ${entry.relay}`).join("\n"), command);
  }
  if (command === "check") {
    const payload = conformancePayload();
    return writeOutput(input, "remote", payload, `${payload.status} missingRoutes=${payload.missingRoutes.length}`, command);
  }
  if (command === "routes") {
    const routes = remoteRoutes();
    return writeOutput(input, "remote", { routes }, routes.map((route) => route.id).join("\n"), command);
  }
  if (command === "conformance") {
    const payload = conformancePayload();
    return writeOutput(input, "remote", payload, `${payload.status} decisions=${payload.decisions.length}`, command);
  }
  return missing(input, "remote classify|check|routes|conformance");
}

export async function runSyncCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "manifest") {
    const manifest = createExampleSyncResourceManifest({
      resourceId: input.flags["resource-id"] ?? "skills:default",
      kind: input.flags.kind ?? "skills",
      ownerNodeId: input.flags["owner-node"] ?? "local",
      driver: (input.flags.driver ?? "skills") as Parameters<typeof createExampleSyncResourceManifest>[0]["driver"],
      routeIds: ["sync.skills"],
    });
    return writeOutput(input, "sync", { manifest }, JSON.stringify(manifest, null, 2), command);
  }
  if (command === "status") {
    const payload = { status: "baseline_registered", resources: remoteSyncRequiredRouteIds.filter((routeId) => routeId.startsWith("sync.")), conflictDefault: "detect_and_elevate" };
    return writeOutput(input, "sync", payload, `${payload.status} resources=${payload.resources.length}`, command);
  }
  if (command === "plan" || command === "run") {
    const payload = { mode: command === "run" ? "dry_run_required_initially" : "plan", writes: false, routes: remoteRoutes().filter((route) => route.id.startsWith("sync.")).map((route) => route.id) };
    return writeOutput(input, "sync", payload, `${payload.mode} routes=${payload.routes.length}`, command);
  }
  if (command === "conflicts") {
    const payload = { conflicts: [], defaultPolicy: "detect_and_elevate", silentOverwriteAllowed: false };
    return writeOutput(input, "sync", payload, "conflicts=0 defaultPolicy=detect_and_elevate", command);
  }
  return missing(input, "sync manifest|status|plan|run|conflicts");
}

export async function runNodesCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "list") {
    const nodes = remoteLayerNodes();
    return writeOutput(input, "nodes", { nodes }, nodes.map((node) => `${node.id}: ${node.name}`).join("\n"), command);
  }
  if (command === "pair" || command === "trust" || command === "revoke" || command === "heartbeat") {
    const payload = { operation: command, status: "dry_run_only", writes: false, reason: "Pairing/trust mutations require explicit signed-host or Coordinator implementation." };
    return writeOutput(input, "nodes", payload, `${command}: dry_run_only`, command);
  }
  return missing(input, "nodes list|pair|trust|revoke|heartbeat");
}

export async function runGatewayCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "conformance") {
    const payload = conformancePayload();
    return writeOutput(input, "gateway", payload, `${payload.status} hostedSelfHostedParity=${payload.hostedSelfHostedParity}`, command);
  }
  if (command === "serve" || command === "project") {
    const payload = { operation: command, status: "dry_run_only", writes: false, conformanceRequired: true };
    return writeOutput(input, "gateway", payload, `${command}: dry_run_only conformanceRequired=true`, command);
  }
  return missing(input, "gateway serve|project|conformance");
}

export function remoteSyncExitForPayload(payload: { status?: string; missingRoutes?: unknown[] }): number {
  return payload.status === "baseline_incomplete" || (payload.missingRoutes?.length ?? 0) > 0 ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
}
