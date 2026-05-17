import { z } from "zod";

import { remoteSyncRequiredRouteIds } from "./remote-sync.ts";

export const remoteRouteContractSchema = z.object({
  schemaVersion: z.literal(1),
  routeId: z.string().min(1),
  layer: z.enum(["gateway", "connector", "sync", "mesh"]),
  capability: z.string().min(1),
  localContractRefs: z.array(z.string().min(1)).min(1),
  remoteEntryPoints: z.array(z.string().min(1)).min(1),
  decisionIds: z.array(z.string().min(1)).min(1),
  parityRequired: z.literal(true),
  parallelApiAllowed: z.literal(false),
  writes: z.literal(false),
});

export const remoteRouteContractCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["complete", "incomplete"]),
  contracts: z.array(remoteRouteContractSchema),
  missingRouteIds: z.array(z.string().min(1)),
  writes: z.literal(false),
});

export type RemoteRouteContract = z.infer<typeof remoteRouteContractSchema>;
export type RemoteRouteContractCatalog = z.infer<typeof remoteRouteContractCatalogSchema>;

const remoteRouteContractDefinitions: RemoteRouteContract[] = [
  {
    schemaVersion: 1,
    routeId: "remote.chatGateway",
    layer: "gateway",
    capability: "chat sessions and conversation access",
    localContractRefs: ["claw sessions", "claw chat", "docs/cli.md"],
    remoteEntryPoints: ["claw remote routes", "GET /v1/remote/conformance"],
    decisionIds: ["remote_api_shape", "first_vertical_slice", "remote_actor_model"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "remote.searchGateway",
    layer: "gateway",
    capability: "search queries and search index access",
    localContractRefs: ["claw search", "docs/search.md"],
    remoteEntryPoints: ["claw remote routes", "GET /v1/remote/conformance"],
    decisionIds: ["remote_api_shape", "first_vertical_slice", "remote_surface_parity"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "remote.secretBrokeredOperation",
    layer: "connector",
    capability: "secret-reference brokered operation",
    localContractRefs: ["claw gateway secret-lease", "claw gateway secret-provider", "docs/relay.md"],
    remoteEntryPoints: ["claw gateway secret-lease", "claw gateway secret-provider"],
    decisionIds: ["remote_secrets_model", "remote_actor_model", "first_vertical_slice"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "sync.skills",
    layer: "sync",
    capability: "skills synchronization",
    localContractRefs: ["claw sync manifest --driver skills", "claw sync apply --driver skills"],
    remoteEntryPoints: ["POST /v1/sync/plan", "POST /v1/sync/applications"],
    decisionIds: ["sync_substrate", "sync_lateral_domains", "sync_authority_model"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "sync.memoryUserModel",
    layer: "sync",
    capability: "memory and user-model synchronization",
    localContractRefs: ["claw sync manifest --driver memory_user_model", "docs/relay.md"],
    remoteEntryPoints: ["POST /v1/sync/plan", "POST /v1/sync/applications"],
    decisionIds: ["sync_substrate", "sync_lateral_domains", "sync_authority_model"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "sync.driveFiles",
    layer: "sync",
    capability: "drive files and blob synchronization",
    localContractRefs: ["claw sync manifest --driver drive_files", "claw sync manifest --driver blobs"],
    remoteEntryPoints: ["POST /v1/sync/plan", "POST /v1/sync/applications"],
    decisionIds: ["sync_substrate", "sync_lateral_domains", "client_cache_policy"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "sync.sqliteResources",
    layer: "sync",
    capability: "SQLite tables, partial SQLite, sidecars, agent config, and workspace state",
    localContractRefs: ["claw sync manifest --driver sqlite_tables", "claw sync manifest --driver workspace_state"],
    remoteEntryPoints: ["POST /v1/sync/plan", "POST /v1/sync/applications"],
    decisionIds: ["sync_substrate", "sync_lateral_domains", "conflict_default"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "gateway.headlessAgentHost",
    layer: "gateway",
    capability: "complete headless ClawJS host",
    localContractRefs: ["claw gateway serve", "docs/adr/0022-remote-gateway-sync-redesign.md"],
    remoteEntryPoints: ["claw gateway serve --record true", "GET /v1/gateway/conformance"],
    decisionIds: ["headless_host_model", "topology_priority", "hosted_service_position"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "gateway.multiTenantAgentService",
    layer: "gateway",
    capability: "governed multi-tenant agent service",
    localContractRefs: ["claw gateway agent-service", "RemoteAgentServiceExecutionReceipt"],
    remoteEntryPoints: ["POST /v1/gateway/agent-service/evaluate", "POST /v1/gateway/agent-service/executions"],
    decisionIds: ["agent_service_model", "first_vertical_slice", "remote_actor_model"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
  {
    schemaVersion: 1,
    routeId: "mesh.resourceShare",
    layer: "mesh",
    capability: "inter-mesh invitation, share, and revocation",
    localContractRefs: ["claw nodes invite", "claw nodes share", "claw nodes revoke"],
    remoteEntryPoints: ["POST /v1/mesh/invitations", "POST /v1/mesh/shares", "POST /v1/mesh/revocations"],
    decisionIds: ["mesh_collaboration_scope", "topology_priority", "sync_authority_model"],
    parityRequired: true,
    parallelApiAllowed: false,
    writes: false,
  },
].map((entry) => remoteRouteContractSchema.parse(entry));

export function buildRemoteRouteContractCatalog(input: {
  generatedAt?: string;
  registeredRouteIds?: readonly string[];
} = {}): RemoteRouteContractCatalog {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const registeredRouteIds = new Set(input.registeredRouteIds ?? remoteSyncRequiredRouteIds);
  const missingRouteIds = remoteSyncRequiredRouteIds.filter((routeId) => !registeredRouteIds.has(routeId));
  return remoteRouteContractCatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    status: missingRouteIds.length ? "incomplete" : "complete",
    contracts: remoteRouteContractDefinitions,
    missingRouteIds,
    writes: false,
  });
}
