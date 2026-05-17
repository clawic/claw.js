import {
  buildRemoteConformanceReport,
  buildSyncPlan,
  clawPersistentSurfaceRegistry,
  createMeshInvitation,
  createMeshResourceShare,
  createMeshRevocation,
  createSyncResourceManifest,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  syncObjectSnapshotSchema,
  type MeshShareAction,
  type SyncDriver,
  type SyncObjectSnapshot,
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

function nodeIds() {
  return clawPersistentSurfaceRegistry.nodes.map((node) => node.id);
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
  return buildRemoteConformanceReport({ routeIds: routeIds(), nodeIds: nodeIds() });
}

function parseDriver(value: string | undefined): SyncDriver {
  const driver = value ?? "skills";
  if (
    driver === "skills"
    || driver === "memory_user_model"
    || driver === "sessions"
    || driver === "drive_files"
    || driver === "blobs"
    || driver === "sqlite_tables"
    || driver === "sqlite_partial"
    || driver === "sidecar"
    || driver === "search_index"
    || driver === "agent_config"
    || driver === "workspace_state"
  ) return driver;
  throw new Error(`Invalid sync driver: ${driver}`);
}

function parseSnapshots(value: string | undefined, fallback: SyncObjectSnapshot[]): SyncObjectSnapshot[] {
  if (!value) return fallback;
  const parsed = JSON.parse(value) as unknown;
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => syncObjectSnapshotSchema.parse(entry));
}

function manifestFromFlags(input: RemoteSyncCliInput) {
  const driver = parseDriver(input.flags.driver);
  return createSyncResourceManifest({
    resourceId: input.flags["resource-id"] ?? "skills:default",
    kind: input.flags.kind ?? driver,
    ownerNodeId: input.flags["owner-node"] ?? "local",
    driver,
    allowedPeerNodeIds: input.flags["peer-node"] ? [input.flags["peer-node"]] : [],
  });
}

function planFromFlags(input: RemoteSyncCliInput) {
  const manifest = manifestFromFlags(input);
  const now = input.flags.now ?? "2026-05-17T10:00:00.000Z";
  const localNodeId = input.flags["owner-node"] ?? "local";
  const peerNodeId = input.flags["peer-node"] ?? "peer";
  const localSnapshots = parseSnapshots(input.flags["local-snapshot-json"], [{
    resourceId: manifest.resourceId,
    objectRef: input.flags["object-ref"] ?? "skill.review",
    nodeId: localNodeId,
    contentHash: input.flags["local-hash"] ?? "hash-local",
    updatedAt: input.flags["local-updated-at"] ?? "2026-05-17T09:00:00.000Z",
    deleted: false,
  }]);
  const peerSnapshots = parseSnapshots(input.flags["peer-snapshot-json"], [{
    resourceId: manifest.resourceId,
    objectRef: input.flags["object-ref"] ?? "skill.review",
    nodeId: peerNodeId,
    contentHash: input.flags["peer-hash"] ?? "hash-peer",
    updatedAt: input.flags["peer-updated-at"] ?? "2026-05-17T09:05:00.000Z",
    deleted: false,
  }]);
  return buildSyncPlan({
    manifest,
    actor: {
      actorKind: "agent",
      actorId: input.flags["actor-id"] ?? "agent.sync",
      nodeId: localNodeId,
      transport: input.flags.transport ?? "gateway",
      trustMode: "governed_gateway",
    },
    localNodeId,
    peerNodeId,
    localSnapshots,
    peerSnapshots,
    now,
  });
}

function listFlag(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries : fallback;
}

function meshActionFlags(value: string | undefined, fallback: MeshShareAction[]): MeshShareAction[] {
  const allowed = new Set<MeshShareAction>(["read", "sync", "search", "execute", "lease_secret"]);
  const parsed = listFlag(value, fallback).filter((entry): entry is MeshShareAction => allowed.has(entry as MeshShareAction));
  return parsed.length ? parsed : fallback;
}

function meshInvitationFromFlags(input: RemoteSyncCliInput) {
  return createMeshInvitation({
    issuerMeshId: input.flags["issuer-mesh"] ?? "mesh.local",
    coordinatorNodeId: input.flags["coordinator-node"] ?? input.flags["owner-node"] ?? "local",
    recipientMeshId: input.flags["recipient-mesh"],
    inviteePublicKeyRef: input.flags["invitee-key"],
    trustMode: input.flags["trust-mode"] === "governed_gateway" ? "governed_gateway" : "sovereign_e2e_tunnel",
    transport: input.flags.transport ?? "iroh",
    allowedResourceIds: listFlag(input.flags["allowed-resources"] ?? input.flags["resource-id"], ["skills:default"]),
    allowedActions: meshActionFlags(input.flags.actions, ["read", "sync"]),
    createdAt: input.flags.now ?? "2026-05-17T10:07:00.000Z",
    expiresAt: input.flags["expires-at"] ?? "2026-05-18T10:07:00.000Z",
  });
}

function meshShareFromFlags(input: RemoteSyncCliInput) {
  const manifest = manifestFromFlags(input);
  const invitation = createMeshInvitation({
    issuerMeshId: input.flags["issuer-mesh"] ?? "mesh.local",
    coordinatorNodeId: input.flags["coordinator-node"] ?? input.flags["owner-node"] ?? "local",
    recipientMeshId: input.flags["recipient-mesh"] ?? input.flags["to-mesh"] ?? "mesh.peer",
    trustMode: input.flags["trust-mode"] === "governed_gateway" ? "governed_gateway" : "sovereign_e2e_tunnel",
    transport: input.flags.transport ?? "iroh",
    allowedResourceIds: listFlag(input.flags["allowed-resources"] ?? manifest.resourceId, [manifest.resourceId]),
    allowedActions: meshActionFlags(input.flags.actions, ["read", "sync"]),
    createdAt: input.flags.now ?? "2026-05-17T10:07:00.000Z",
    expiresAt: input.flags["expires-at"] ?? "2026-05-18T10:07:00.000Z",
  });
  return createMeshResourceShare({
    invitation,
    fromMeshId: input.flags["from-mesh"] ?? invitation.issuerMeshId,
    toMeshId: input.flags["to-mesh"] ?? invitation.recipientMeshId ?? "mesh.peer",
    manifest,
    actions: meshActionFlags(input.flags.actions, ["read", "sync"]),
    secretRefs: listFlag(input.flags["secret-refs"], []),
    createdAt: input.flags.now ?? "2026-05-17T10:08:00.000Z",
    expiresAt: input.flags["expires-at"] ?? "2026-05-18T10:08:00.000Z",
  });
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
    const manifest = manifestFromFlags(input);
    return writeOutput(input, "sync", { manifest }, JSON.stringify(manifest, null, 2), command);
  }
  if (command === "status") {
    const payload = { status: "baseline_registered", resources: remoteSyncRequiredRouteIds.filter((routeId) => routeId.startsWith("sync.")), conflictDefault: "detect_and_elevate" };
    return writeOutput(input, "sync", payload, `${payload.status} resources=${payload.resources.length}`, command);
  }
  if (command === "plan" || command === "run") {
    const plan = planFromFlags(input);
    const payload = { mode: command === "run" ? "dry_run" : "plan", ...plan };
    return writeOutput(input, "sync", payload, `${payload.mode} actions=${plan.actions.length} conflicts=${plan.conflicts.length}`, command);
  }
  if (command === "conflicts") {
    const plan = planFromFlags(input);
    const payload = { conflicts: plan.conflicts, defaultPolicy: "detect_and_elevate", silentOverwriteAllowed: false };
    return writeOutput(input, "sync", payload, `conflicts=${plan.conflicts.length} defaultPolicy=detect_and_elevate`, command);
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
    if (command === "revoke" && input.flags["target-id"]) {
      const payload = {
        revocation: createMeshRevocation({
          targetType: input.flags["target-type"] === "invitation" || input.flags["target-type"] === "node_trust" ? input.flags["target-type"] : "share",
          targetId: input.flags["target-id"],
          actor: {
            actorKind: "human",
            actorId: input.flags["actor-id"] ?? "user.local",
            nodeId: input.flags["owner-node"] ?? "local",
            transport: input.flags.transport ?? "gateway",
            trustMode: "governed_gateway",
          },
          reason: input.flags.reason ?? "owner_revoked",
          revokedAt: input.flags.now ?? "2026-05-17T10:09:00.000Z",
        }),
        status: "dry_run_only",
        writes: false,
      };
      return writeOutput(input, "nodes", payload, "revoke: dry_run_only mesh revocation", command);
    }
    const payload = { operation: command, status: "dry_run_only", writes: false, reason: "Pairing/trust mutations require explicit signed-host or Coordinator implementation." };
    return writeOutput(input, "nodes", payload, `${command}: dry_run_only`, command);
  }
  if (command === "invite") {
    const invitation = meshInvitationFromFlags(input);
    return writeOutput(input, "nodes", { invitation, status: "dry_run_only", writes: false }, "invite: dry_run_only", command);
  }
  if (command === "share") {
    const share = meshShareFromFlags(input);
    return writeOutput(input, "nodes", { share, status: "dry_run_only", writes: false }, "share: dry_run_only", command);
  }
  return missing(input, "nodes list|pair|trust|revoke|invite|share|heartbeat");
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
