import {
  buildRemoteConformanceReport,
  buildSyncPlan,
  clawApiPath,
  clawPersistentSurfaceRegistry,
  createSyncResourceManifest,
  remoteSyncRequiredRouteIds,
  syncDriverSchema,
  syncObjectSnapshotSchema,
  type SyncAuthority,
  type SyncDriver,
  type SyncObjectSnapshot,
} from "@clawjs/core";
import type { FastifyInstance, FastifyRequest } from "fastify";

function routeIds(): string[] {
  return (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id);
}

function nodeIds(): string[] {
  return clawPersistentSurfaceRegistry.nodes.map((node) => node.id);
}

function remoteConformancePayload() {
  return buildRemoteConformanceReport({ routeIds: routeIds(), nodeIds: nodeIds() });
}

function remoteClassificationsPayload() {
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
  return { classifications };
}

function remoteLayerNodesPayload() {
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
  return { nodes: clawPersistentSurfaceRegistry.nodes.filter((node) => layerIds.has(node.id)) };
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    if (body.byteLength === 0) return {};
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function parseDriver(value: unknown): SyncDriver {
  return syncDriverSchema.parse(stringValue(value, "skills"));
}

function parseSnapshots(value: unknown, fallback: SyncObjectSnapshot[]): SyncObjectSnapshot[] {
  if (value === undefined || value === null) return fallback;
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => syncObjectSnapshotSchema.parse(entry));
}

function manifestFromInput(input: Record<string, unknown>) {
  const driver = parseDriver(input.driver);
  return createSyncResourceManifest({
    resourceId: stringValue(input.resourceId ?? input["resource-id"], "skills:default"),
    kind: stringValue(input.kind, driver),
    ownerNodeId: stringValue(input.ownerNodeId ?? input["owner-node"], "local"),
    driver,
    authority: typeof input.authority === "string" ? input.authority as SyncAuthority : undefined,
    allowedPeerNodeIds: typeof input.peerNodeId === "string"
      ? [input.peerNodeId]
      : Array.isArray(input.allowedPeerNodeIds) ? input.allowedPeerNodeIds.filter((entry): entry is string => typeof entry === "string") : [],
    ttlSeconds: numberValue(input.ttlSeconds, 3600),
  });
}

function planFromInput(input: Record<string, unknown>) {
  const manifest = manifestFromInput(input);
  const now = stringValue(input.now, "2026-05-17T10:00:00.000Z");
  const localNodeId = stringValue(input.localNodeId ?? input.ownerNodeId ?? input["owner-node"], "local");
  const peerNodeId = stringValue(input.peerNodeId ?? input["peer-node"], "peer");
  const objectRef = stringValue(input.objectRef ?? input["object-ref"], "skill.review");
  const localSnapshots = parseSnapshots(input.localSnapshots ?? input.localSnapshot, [{
    resourceId: manifest.resourceId,
    objectRef,
    nodeId: localNodeId,
    contentHash: stringValue(input.localHash ?? input["local-hash"], "hash-local"),
    updatedAt: stringValue(input.localUpdatedAt ?? input["local-updated-at"], "2026-05-17T09:00:00.000Z"),
    deleted: false,
  }]);
  const peerSnapshots = parseSnapshots(input.peerSnapshots ?? input.peerSnapshot, [{
    resourceId: manifest.resourceId,
    objectRef,
    nodeId: peerNodeId,
    contentHash: stringValue(input.peerHash ?? input["peer-hash"], "hash-peer"),
    updatedAt: stringValue(input.peerUpdatedAt ?? input["peer-updated-at"], "2026-05-17T09:05:00.000Z"),
    deleted: false,
  }]);
  return buildSyncPlan({
    manifest,
    actor: {
      actorKind: "agent",
      actorId: stringValue(input.actorId ?? input["actor-id"], "agent.sync"),
      nodeId: localNodeId,
      transport: stringValue(input.transport, "gateway"),
      trustMode: "governed_gateway",
    },
    localNodeId,
    peerNodeId,
    localSnapshots,
    peerSnapshots,
    now,
  });
}

function dryRunNodeOperation(operation: string, body: Record<string, unknown>) {
  return {
    operation,
    status: "dry_run_only",
    writes: false,
    nodeId: typeof body.nodeId === "string" ? body.nodeId : null,
    reason: "Pairing, trust, sharing, and revocation mutations require signed Coordinator execution.",
  };
}

export function registerRemoteSyncRoutes(app: FastifyInstance): void {
  app.get(clawApiPath("remote/classifications"), async () => remoteClassificationsPayload());

  app.get(clawApiPath("remote/conformance"), async () => remoteConformancePayload());

  app.get(clawApiPath("gateway/conformance"), async () => ({
    ...remoteConformancePayload(),
    gateway: {
      mode: "dry_run_conformance",
      contract: "registered_local_contract_projection",
      hostedSelfHostedParity: "required",
    },
  }));

  app.get(clawApiPath("sync/manifests"), async (request) => {
    const query = request.query as Record<string, unknown>;
    const drivers = query.driver ? [parseDriver(query.driver)] : [...syncDriverSchema.options];
    return {
      manifests: drivers.map((driver) => createSyncResourceManifest({
        resourceId: `${driver}:default`,
        kind: driver,
        ownerNodeId: stringValue(query.ownerNodeId ?? query["owner-node"], "local"),
        driver,
        allowedPeerNodeIds: typeof query.peerNodeId === "string" ? [query.peerNodeId] : [],
      })),
    };
  });

  app.post(clawApiPath("sync/manifests"), async (request) => ({
    manifest: manifestFromInput(readBody(request)),
    writes: false,
    mode: "dry_run_manifest",
  }));

  app.get(clawApiPath("sync/changes"), async () => ({
    changes: [],
    cursorRequired: true,
    resources: remoteSyncRequiredRouteIds.filter((routeId) => routeId.startsWith("sync.")),
    writes: false,
  }));

  app.post(clawApiPath("sync/plan"), async (request) => ({
    mode: "plan",
    ...planFromInput(readBody(request)),
  }));

  app.post(clawApiPath("sync/conflicts"), async (request) => {
    const plan = planFromInput(readBody(request));
    return {
      conflicts: plan.conflicts,
      defaultPolicy: "detect_and_elevate",
      silentOverwriteAllowed: false,
      writes: false,
    };
  });

  app.get(clawApiPath("nodes"), async () => remoteLayerNodesPayload());
  app.post(clawApiPath("nodes/pair"), async (request) => dryRunNodeOperation("pair", readBody(request)));
  app.post(clawApiPath("nodes/trust"), async (request) => dryRunNodeOperation("trust", readBody(request)));
  app.post(clawApiPath("nodes/revoke"), async (request) => dryRunNodeOperation("revoke", readBody(request)));
}
