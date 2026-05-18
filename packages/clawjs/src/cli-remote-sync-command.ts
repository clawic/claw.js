import {
  buildRemoteConformanceReport,
  buildRemoteExternalPendingRegister,
  buildRemoteExternalValidationChecklist,
  buildRemoteExternalValidationEvidenceTemplate,
  buildRemoteExternalValidationReport,
  buildRemoteGoalClosureGate,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteRouteContractCatalog,
  buildRemoteSourceQaReviewTemplate,
  buildSyncPlan,
  clawPersistentSurfaceRegistry,
  createGatewayDeploymentManifest,
  createMeshInvitation,
  createMeshInvitationAcceptance,
  createMeshResourceShare,
  createMeshRevocation,
  createNodeTrustDecision,
  createRemoteAgentServiceExecutionReceipt,
  createRemoteClientCacheSnapshot,
  createRemoteCompatibilityAdapterReceipt,
  createRemoteGatewayAuditReceipt,
  createRemoteSurfaceClassificationReceipt,
  createSyncAuthorityHandoffReceipt,
  createRemoteSecretProviderReceipt,
  createSyncDriverApplicationReceipt,
  createSyncResourceManifest,
  createTransportHandshakeReceipt,
  evaluateRemoteAgentServiceAccess,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  syncObjectSnapshotSchema,
  type MeshShareAction,
  type RemoteExternalValidationEvidence,
  type RemoteSourceQaReviewItem,
  type RemoteCompatibilityClientKind,
  type SyncAuthority,
  type SyncDriver,
  type SyncObjectSnapshot,
} from "@clawjs/core";
import fs from "fs";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { RemoteSyncStateStore, type RemoteSyncCoordinatorSigner } from "./remote-sync-state-store.ts";

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

function stateStoreFromFlags(input: RemoteSyncCliInput): RemoteSyncStateStore | null {
  const stateDir = input.flags["state-dir"] ?? input.flags["remote-state-dir"];
  return stateDir ? new RemoteSyncStateStore({ stateDir }) : null;
}

function wantsDurableRecord(input: RemoteSyncCliInput): boolean {
  return input.flags.record === "true" || input.flags.durable === "true";
}

function wantsDurableQueue(input: RemoteSyncCliInput): boolean {
  return input.flags.queue === "true" || input.flags["record-queue"] === "true";
}

function coordinatorSignerFromFlags(input: RemoteSyncCliInput): RemoteSyncCoordinatorSigner | undefined {
  const privateKeyFile = input.flags["coordinator-private-key-file"];
  const publicKeyFile = input.flags["coordinator-public-key-file"];
  if (!privateKeyFile && !publicKeyFile) return undefined;
  if (!privateKeyFile || !publicKeyFile) {
    throw new Error("Coordinator signing requires both --coordinator-private-key-file and --coordinator-public-key-file.");
  }
  return {
    keyId: input.flags["coordinator-key-id"] ?? "coordinator.local",
    privateKeyPem: fs.readFileSync(privateKeyFile, "utf8"),
    publicKeyPem: fs.readFileSync(publicKeyFile, "utf8"),
  };
}

function requireStateStore(input: RemoteSyncCliInput, usage: string): RemoteSyncStateStore | number {
  const store = stateStoreFromFlags(input);
  if (!store) return missing(input, usage);
  return store;
}

function requireCoordinatorSigner(input: RemoteSyncCliInput, usage: string): RemoteSyncCoordinatorSigner | number {
  const signer = coordinatorSignerFromFlags(input);
  if (!signer) return missing(input, usage);
  return signer;
}

function actorContextFromFlags(input: RemoteSyncCliInput) {
  const actorKind = input.flags["actor-kind"];
  const parsedActorKind: "human" | "device" | "agent" | "service" | "organization" = actorKind === "human" || actorKind === "device" || actorKind === "service" || actorKind === "organization" ? actorKind : "agent";
  return {
    actorKind: parsedActorKind,
    actorId: input.flags["actor-id"] ?? input.flags["agent-id"] ?? "agent.remote",
    ...(input.flags["device-id"] ? { deviceId: input.flags["device-id"] } : {}),
    ...(input.flags["organization-id"] ? { organizationId: input.flags["organization-id"] } : {}),
    ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
    ...(input.flags["assignment-id"] ? { assignmentId: input.flags["assignment-id"] } : {}),
    ...(input.flags["run-id"] ? { runId: input.flags["run-id"] } : {}),
    nodeId: input.flags["owner-node"] ?? input.flags["node-id"] ?? "local",
    transport: input.flags.transport ?? "gateway",
    trustMode: input.flags["trust-mode"] === "sovereign_e2e_tunnel" ? "sovereign_e2e_tunnel" as const : "governed_gateway" as const,
  };
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

function parseAuthority(value: string | undefined): SyncAuthority | undefined {
  if (!value) return undefined;
  if (
    value === "primary"
    || value === "replica"
    || value === "cache"
    || value === "mirror"
    || value === "joint"
  ) return value;
  throw new Error(`Invalid sync authority: ${value}`);
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

function parseExternalValidationEvidence(value: string | undefined): RemoteExternalValidationEvidence[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as RemoteExternalValidationEvidence[] : [parsed as RemoteExternalValidationEvidence];
}

function parseRequirementIds(value: string | undefined): string[] | undefined {
  const entries = listFlag(value, []);
  return entries.length ? entries : undefined;
}

function parseReviewedSourceQaIds(value: string | undefined): string[] {
  return listFlag(value, []);
}

function parseSourceQaIds(value: string | undefined): string[] | undefined {
  const entries = listFlag(value, []);
  return entries.length ? entries : undefined;
}

function parseSourceQaReviews(value: string | undefined): RemoteSourceQaReviewItem[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as RemoteSourceQaReviewItem[] : [parsed as RemoteSourceQaReviewItem];
}

function meshActionFlags(value: string | undefined, fallback: MeshShareAction[]): MeshShareAction[] {
  const allowed = new Set<MeshShareAction>(["read", "sync", "search", "execute", "lease_secret"]);
  const parsed = listFlag(value, fallback).filter((entry): entry is MeshShareAction => allowed.has(entry as MeshShareAction));
  return parsed.length ? parsed : fallback;
}

function remoteCompatibilityClientKind(value: string | undefined): RemoteCompatibilityClientKind {
  if (value === "ios" || value === "android" || value === "web" || value === "desktop" || value === "server" || value === "unknown") return value;
  return "unknown";
}

function remoteCompatibilityAdapterFromFlags(input: RemoteSyncCliInput) {
  const status = input.flags.status === "deprecated_adapter" || input.flags.status === "blocked" ? input.flags.status : "active_adapter";
  return createRemoteCompatibilityAdapterReceipt({
    legacySurface: input.flags["legacy-surface"] ?? input.flags.surface ?? "relay.mobile.chat",
    canonicalRouteId: input.flags["canonical-route"] ?? input.flags["route-id"] ?? "remote.chatGateway",
    clientKind: remoteCompatibilityClientKind(input.flags["client-kind"]),
    status,
    createdAt: input.flags.now ?? new Date().toISOString(),
  });
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

function meshInvitationAcceptanceFromFlags(input: RemoteSyncCliInput) {
  const invitation = meshInvitationFromFlags(input);
  return createMeshInvitationAcceptance({
    invitation,
    accepterMeshId: input.flags["accepter-mesh"] ?? input.flags["recipient-mesh"] ?? "mesh.peer",
    actor: {
      actorKind: "human",
      actorId: input.flags["actor-id"] ?? "user.local",
      nodeId: input.flags["owner-node"] ?? input.flags["node-id"] ?? "local",
      transport: input.flags.transport ?? "gateway",
      trustMode: "governed_gateway",
    },
    acceptedAt: input.flags.now ?? "2026-05-17T10:07:30.000Z",
    physicalPeerTrustVerified: input.flags["physical-peer-trust"] === "true",
  });
}

function transportHandshakeFromFlags(input: RemoteSyncCliInput) {
  const now = input.flags.now ?? new Date().toISOString();
  return createTransportHandshakeReceipt({
    transport: input.flags.transport ?? "iroh",
    adapter: input.flags.adapter,
    initiatorNodeId: input.flags["owner-node"] ?? input.flags["initiator-node"] ?? "local",
    responderNodeId: input.flags["peer-node"] ?? input.flags["responder-node"] ?? "peer",
    coordinatorNodeId: input.flags["coordinator-node"] ?? input.flags["owner-node"] ?? "local",
    trustMode: input.flags["trust-mode"] === "governed_gateway" ? "governed_gateway" : "sovereign_e2e_tunnel",
    challengeNonce: input.flags["challenge-nonce"] ?? "challenge-nonce-local",
    responseNonce: input.flags["response-nonce"] ?? "response-nonce-peer",
    createdAt: now,
    expiresAt: input.flags["expires-at"],
    physicalTransportVerified: input.flags["physical-verified"] === "true",
  });
}

function nodeTrustDecisionFromFlags(input: RemoteSyncCliInput) {
  const effect = input.flags.effect === "deny" || input.flags.effect === "revoke" ? input.flags.effect : "allow";
  return createNodeTrustDecision({
    subjectNodeId: input.flags["target-node"] ?? input.flags["peer-node"] ?? input.flags["subject-node"] ?? "peer",
    coordinatorNodeId: input.flags["coordinator-node"] ?? input.flags["owner-node"] ?? "local",
    actor: actorContextFromFlags(input),
    trustMode: input.flags["trust-mode"] === "governed_gateway" ? "governed_gateway" : "sovereign_e2e_tunnel",
    transport: input.flags.transport ?? "iroh",
    effect,
    grantedRouteIds: listFlag(input.flags["route-ids"], remoteSyncRequiredRouteIds.slice()),
    createdAt: input.flags.now ?? new Date().toISOString(),
    expiresAt: input.flags["expires-at"],
    physicalAcceptanceVerified: input.flags["physical-accepted"] === "true",
  });
}

function gatewayDeploymentFromFlags(input: RemoteSyncCliInput, operation: "serve" | "project") {
  const deploymentKind = input.flags["deployment-kind"] === "hosted" || input.flags.hosted === "true" || operation === "project" ? "hosted" : "self_hosted";
  return createGatewayDeploymentManifest({
    deploymentKind,
    gatewayNodeId: input.flags["gateway-node"] ?? input.flags["owner-node"] ?? "gateway.local",
    coordinatorNodeId: input.flags["coordinator-node"] ?? input.flags["owner-node"] ?? "local",
    bindAddress: input.flags["bind-address"] ?? input.flags.bind ?? "127.0.0.1:24102",
    publicBaseUrl: input.flags["public-base-url"],
    contractRouteIds: listFlag(input.flags["route-ids"], remoteSyncRequiredRouteIds.slice()),
    createdAt: input.flags.now ?? new Date().toISOString(),
    physicalDeploymentVerified: input.flags["physical-verified"] === "true",
  });
}

function numberFlag(value: string | undefined, fallback: number): number {
  if (value && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function agentServiceAssignmentFromFlags(input: RemoteSyncCliInput) {
  const tenantId = input.flags["tenant-id"] ?? "tenant.demo";
  const agentId = input.flags["agent-id"] ?? "agent.service";
  const assignmentId = input.flags["assignment-id"] ?? "assignment.service";
  const status: "active" | "paused" | "revoked" = input.flags["assignment-status"] === "paused" || input.flags["assignment-status"] === "revoked"
    ? input.flags["assignment-status"]
    : "active";
  return {
    schemaVersion: 1 as const,
    tenantId,
    agentId,
    assignmentId,
    status,
    routeIds: listFlag(input.flags["route-ids"], ["gateway.multiTenantAgentService"]),
    budgetId: input.flags["budget-id"] ?? "budget.service",
    billingAccountId: input.flags["billing-account"] ?? "billing.demo",
    isolationKey: input.flags["isolation-key"] ?? `${tenantId}:${assignmentId}`,
    auditRequired: true as const,
  };
}

function agentServiceBudgetFromFlags(input: RemoteSyncCliInput, assignment: ReturnType<typeof agentServiceAssignmentFromFlags>) {
  return {
    budgetId: input.flags["budget-id"] ?? assignment.budgetId,
    tenantId: input.flags["budget-tenant-id"] ?? assignment.tenantId,
    billingAccountId: input.flags["billing-account"] ?? assignment.billingAccountId,
    limitCents: numberFlag(input.flags["limit-cents"], 5000),
    usedCents: numberFlag(input.flags["used-cents"], 0),
    billingMeterId: input.flags["billing-meter"] ?? "meter.agent-service",
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
    if (input.flags["capability-id"]) {
      const usage = "remote classify --capability-id <id> --classification remote-safe|local-only|blocked|pending --route-id <route-id> --policy-ref <ref> --test-refs <refs> --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem>";
      const classificationFlag = input.flags.classification ?? input.flags.relay;
      const classification = classificationFlag === "local-only" || classificationFlag === "blocked" || classificationFlag === "pending" ? classificationFlag : "remote-safe";
      const receipt = createRemoteSurfaceClassificationReceipt({
        capabilityId: input.flags["capability-id"],
        classification,
        routeId: input.flags["route-id"],
        policyRef: input.flags["policy-ref"],
        testRefs: listFlag(input.flags["test-refs"] ?? input.flags.tests, []),
        reason: input.flags.reason,
        createdAt: input.flags.now,
      });
      const store = stateStoreFromFlags(input);
      if (wantsDurableRecord(input) && !store) return missing(input, usage);
      const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
      if (typeof signer === "number") return signer;
      const state = store && wantsDurableRecord(input) && signer
        ? store.recordRemoteSurfaceClassificationReceipt(receipt, { now: input.flags.now, signer })
        : undefined;
      const status = state?.coordinatorSignature ? "signed_remote_classification_recorded" : "dry_run_only";
      return writeOutput(input, "remote", { status, receipt, writes: false, ...(state ? { state } : {}) }, `classify: ${status}`, command);
    }
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
  if (command === "pending") {
    const register = buildRemoteExternalPendingRegister({ generatedAt: input.flags.now });
    return writeOutput(input, "remote", register, `${register.status} requirements=${register.requirements.length}`, command);
  }
  if (command === "validation-checklist" || command === "external-validation-checklist") {
    const checklist = buildRemoteExternalValidationChecklist({ generatedAt: input.flags.now });
    return writeOutput(input, "remote", checklist, `${checklist.status} covered=${checklist.coverage.coveredRequirementCount}/${checklist.coverage.requirementCount}`, command);
  }
  if (command === "validation-template" || command === "evidence-template" || command === "external-validation-template") {
    const template = buildRemoteExternalValidationEvidenceTemplate({
      generatedAt: input.flags.now,
      requirementIds: parseRequirementIds(input.flags["requirement-ids"] ?? input.flags.requirements),
    });
    return writeOutput(input, "remote", template, `${template.status} evidence=${template.evidence.length}/${template.requirementCount}`, command);
  }
  if (command === "validation-report" || command === "external-validation-report") {
    const report = buildRemoteExternalValidationReport({
      generatedAt: input.flags.now,
      evidence: parseExternalValidationEvidence(input.flags["evidence-json"]),
    });
    return writeOutput(input, "remote", report, `${report.status} clearable=${report.clearableRequirementIds.length}/${report.requirementCount}`, command);
  }
  if (command === "source-qa-template" || command === "qa-template" || command === "source-review-template") {
    const template = buildRemoteSourceQaReviewTemplate({
      generatedAt: input.flags.now,
      sourceQaIds: parseSourceQaIds(input.flags["source-qa-ids"] ?? input.flags["qa-ids"]),
    });
    return writeOutput(input, "remote", template, `${template.status} sourceQa=${template.reviewCount}/${template.requiredSourceQaIds.length}`, command);
  }
  if (command === "closure-gate" || command === "goal-closure-gate") {
    const gate = buildRemoteGoalClosureGate({
      generatedAt: input.flags.now,
      reviewedSourceQaIds: parseReviewedSourceQaIds(input.flags["reviewed-source-qa-ids"] ?? input.flags["source-qa-ids"]),
      sourceQaReviews: parseSourceQaReviews(input.flags["source-qa-review-json"]),
      evidence: parseExternalValidationEvidence(input.flags["evidence-json"]),
    });
    return writeOutput(input, "remote", gate, `${gate.status} blockers=${gate.blockers.length}`, command);
  }
  if (command === "contracts") {
    const catalog = buildRemoteRouteContractCatalog({ generatedAt: input.flags.now, registeredRouteIds: routeIds() });
    return writeOutput(input, "remote", catalog, `${catalog.status} contracts=${catalog.contracts.length}`, command);
  }
  if (command === "e2e-plan" || command === "provider-device-e2e-plan") {
    const plan = buildRemoteProviderDeviceE2EValidationPlan({
      createdAt: input.flags.now,
      requiredRouteIds: remoteSyncRequiredRouteIds,
    });
    return writeOutput(input, "remote", plan, `${plan.status} domains=${plan.requiredDomains.length} routes=${plan.requiredRouteIds.length}`, command);
  }
  if (command === "compat") {
    const receipt = remoteCompatibilityAdapterFromFlags(input);
    const usage = "remote compat --legacy-surface <surface> --canonical-route <route-id> --client-kind ios|android|web|desktop --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem>";
    const store = stateStoreFromFlags(input);
    if (wantsDurableRecord(input) && !store) return missing(input, usage);
    const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
    if (typeof signer === "number") return signer;
    const state = store && wantsDurableRecord(input) && signer
      ? store.recordCompatibilityAdapterReceipt(receipt, { now: input.flags.now, signer })
      : undefined;
    const status = state?.coordinatorSignature ? "signed_compat_adapter_recorded" : "dry_run_only";
    return writeOutput(input, "remote", {
      status,
      receipt,
      writes: false,
      ...(state ? { state } : {}),
    }, `compat: ${status}`, command);
  }
  return missing(input, "remote classify|check|routes|conformance|pending|validation-checklist|validation-template|validation-report|source-qa-template|closure-gate|contracts|e2e-plan|compat");
}

export async function runSyncCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "manifest") {
    const manifest = manifestFromFlags(input);
    const store = stateStoreFromFlags(input);
    const state = store && wantsDurableRecord(input) ? store.recordManifest(manifest, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) }) : undefined;
    return writeOutput(input, "sync", { manifest, ...(state ? { state } : {}) }, JSON.stringify(manifest, null, 2), command);
  }
  if (command === "status") {
    const store = stateStoreFromFlags(input);
    const stored = store?.read();
    const queueEntries = stored ? Object.values(stored.queues).flat() : [];
    const signatureStatus = store?.verifyCoordinatorSignatures();
    const payload = {
      status: "baseline_registered",
      resources: remoteSyncRequiredRouteIds.filter((routeId) => routeId.startsWith("sync.")),
      conflictDefault: "detect_and_elevate",
      ...(stored && store ? {
        state: {
          statePath: store.statePath,
          durable: true,
          manifests: Object.keys(stored.manifests).length,
          queueEntries: queueEntries.length,
          applications: Object.keys(stored.applications).length,
          authorityHandoffs: Object.keys(stored.authorityHandoffs).length,
          blockedQueueEntries: queueEntries.filter((entry) => entry.status === "blocked").length,
          auditEvents: stored.audit.length,
          coordinatorSignatures: signatureStatus?.signatureCount ?? 0,
          verifiedCoordinatorSignatures: signatureStatus?.valid ?? 0,
          invalidCoordinatorSignatures: signatureStatus?.invalid ?? 0,
        },
      } : {}),
    };
    return writeOutput(input, "sync", payload, `${payload.status} resources=${payload.resources.length}`, command);
  }
  if (command === "plan" || command === "run") {
    const plan = planFromFlags(input);
    const store = stateStoreFromFlags(input);
    const state = command === "run" && store && wantsDurableQueue(input)
      ? store.enqueuePlan(plan, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) })
      : undefined;
    const payload = { mode: command === "run" ? (state ? "queued" : "dry_run") : "plan", ...plan, ...(state ? { state } : {}) };
    return writeOutput(input, "sync", payload, `${payload.mode} actions=${plan.actions.length} conflicts=${plan.conflicts.length}`, command);
  }
  if (command === "reconcile") {
    const store = stateStoreFromFlags(input);
    if (!store) return missing(input, "sync reconcile --state-dir <dir> [--ack-change-ids <ids>] [--resolved-conflict-ids <ids>]");
    const manifest = manifestFromFlags(input);
    const state = store.reconcile(manifest, {
      acknowledgedChangeIds: listFlag(input.flags["ack-change-ids"] ?? input.flags.acks, []),
      resolvedConflictIds: listFlag(input.flags["resolved-conflict-ids"] ?? input.flags.resolved, []),
      now: input.flags.now,
      signer: coordinatorSignerFromFlags(input),
    });
    return writeOutput(input, "sync", state, `reconciled queue=${state.reconciliation.queue.length}`, command);
  }
  if (command === "apply") {
    const usage = "sync apply --state-dir <dir> --record true --resource-id <id> --driver <driver> --coordinator-private-key-file <pem> --coordinator-public-key-file <pem>";
    const store = requireStateStore(input, usage);
    if (typeof store === "number") return store;
    const signer = requireCoordinatorSigner(input, usage);
    if (typeof signer === "number") return signer;
    const manifest = manifestFromFlags(input);
    const now = input.flags.now ?? new Date().toISOString();
    const reconciliationState = store.reconcile(manifest, {
      acknowledgedChangeIds: listFlag(input.flags["ack-change-ids"] ?? input.flags.acks, []),
      resolvedConflictIds: listFlag(input.flags["resolved-conflict-ids"] ?? input.flags.resolved, []),
      now,
      signer,
    });
    const receipt = createSyncDriverApplicationReceipt({
      manifest,
      reconciliation: reconciliationState.reconciliation,
      actor: actorContextFromFlags(input),
      createdAt: now,
      physicalDriverApplied: input.flags["physical-driver-applied"] === "true",
    });
    const state = store.recordSyncDriverApplicationReceipt(receipt, { now, signer });
    return writeOutput(input, "sync", {
      status: state.receipt.status,
      writes: false,
      reconciliation: reconciliationState.reconciliation,
      receipt: state.receipt,
      state,
    }, `apply: ${state.receipt.status}`, command);
  }
  if (command === "handoff") {
    const usage = "sync handoff --resource-id <id> --driver <driver> --to-node <node-id> --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem>";
    const manifest = manifestFromFlags(input);
    const now = input.flags.now ?? new Date().toISOString();
    const receipt = createSyncAuthorityHandoffReceipt({
      manifest,
      toNodeId: input.flags["to-node"] ?? input.flags["peer-node"] ?? "peer",
      actor: actorContextFromFlags(input),
      requestedAuthority: parseAuthority(input.flags["requested-authority"] ?? input.flags.authority),
      requestedResidency: listFlag(input.flags["requested-residency"], []),
      createdAt: now,
      physicalAuthorityApplied: input.flags["physical-authority-applied"] === "true",
      rejected: input.flags.rejected === "true",
    });
    const store = stateStoreFromFlags(input);
    if (wantsDurableRecord(input) && !store) return missing(input, usage);
    const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
    if (typeof signer === "number") return signer;
    const state = store && wantsDurableRecord(input) && signer
      ? store.recordSyncAuthorityHandoffReceipt(receipt, { now, signer })
      : undefined;
    const status = state?.coordinatorSignature ? "signed_authority_handoff_recorded" : "dry_run_external_pending";
    return writeOutput(input, "sync", {
      status,
      writes: false,
      receipt: state?.receipt ?? receipt,
      ...(state ? { state } : {}),
    }, `handoff: ${status}`, command);
  }
  if (command === "conflicts") {
    const plan = planFromFlags(input);
    const payload = { conflicts: plan.conflicts, defaultPolicy: "detect_and_elevate", silentOverwriteAllowed: false };
    return writeOutput(input, "sync", payload, `conflicts=${plan.conflicts.length} defaultPolicy=detect_and_elevate`, command);
  }
  if (command === "cache") {
    const manifest = manifestFromFlags(input);
    const snapshot = createRemoteClientCacheSnapshot({
      manifest,
      objectRef: input.flags["object-ref"] ?? "skill.review",
      nodeId: input.flags["owner-node"] ?? input.flags["node-id"] ?? "local",
      clientId: input.flags["client-id"] ?? "mobile.local",
      contentHash: input.flags["content-hash"] ?? input.flags.hash ?? "hash-cache",
      cachedAt: input.flags.now,
      ttlSeconds: numberFlag(input.flags["ttl-seconds"], manifest.cachePolicy.ttlSeconds),
    });
    const store = stateStoreFromFlags(input);
    const state = store && wantsDurableRecord(input) ? store.recordRemoteCacheSnapshot(snapshot, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) }) : undefined;
    return writeOutput(input, "sync", { snapshot, status: state?.coordinatorSignature ? "signed_cache_snapshot_recorded" : state ? "cache_snapshot_recorded" : "dry_run_only", writes: false, ...(state ? { state } : {}) }, `cache: ${state ? "recorded" : "dry_run_only"}`, command);
  }
  return missing(input, "sync manifest|status|plan|run|reconcile|apply|handoff|conflicts|cache");
}

export async function runNodesCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "list") {
    const nodes = remoteLayerNodes();
    return writeOutput(input, "nodes", { nodes }, nodes.map((node) => `${node.id}: ${node.name}`).join("\n"), command);
  }
  if (command === "pair" || command === "trust" || command === "revoke" || command === "heartbeat") {
    if (command === "heartbeat") {
      const receipt = transportHandshakeFromFlags(input);
      const usage = "nodes heartbeat --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--transport iroh] [--owner-node <id>] [--peer-node <id>]";
      const store = stateStoreFromFlags(input);
      if (wantsDurableRecord(input) && !store) return missing(input, usage);
      const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
      if (typeof signer === "number") return signer;
      const state = store && wantsDurableRecord(input) && signer
        ? store.recordTransportHandshake(receipt, { now: input.flags.now, signer })
        : undefined;
      const status = state?.coordinatorSignature ? "signed_transport_handshake_recorded" : "dry_run_external_pending";
      return writeOutput(input, "nodes", {
        receipt,
        status,
        writes: false,
        physicalTransport: receipt.physicalTransportVerified ? "verified" : "external_pending",
        ...(state ? { state } : {}),
      }, `heartbeat: ${status}`, command);
    }
    if (command === "trust") {
      const decision = nodeTrustDecisionFromFlags(input);
      const usage = "nodes trust --target-node <id> --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--transport iroh]";
      const store = stateStoreFromFlags(input);
      if (wantsDurableRecord(input) && !store) return missing(input, usage);
      const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
      if (typeof signer === "number") return signer;
      const state = store && wantsDurableRecord(input) && signer
        ? store.recordNodeTrustDecision(decision, { now: input.flags.now, signer })
        : undefined;
      const status = state?.coordinatorSignature ? "signed_node_trust_recorded" : "dry_run_external_pending";
      return writeOutput(input, "nodes", {
        decision,
        status,
        writes: false,
        physicalAcceptance: decision.physicalAcceptanceVerified ? "verified" : "external_pending",
        ...(state ? { state } : {}),
      }, `trust: ${status}`, command);
    }
    if (command === "revoke" && input.flags["target-id"]) {
      const revocation = createMeshRevocation({
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
      });
      const store = stateStoreFromFlags(input);
      const state = store && wantsDurableRecord(input) ? store.recordRevocation(revocation, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) }) : undefined;
      const status = state?.coordinatorSignature ? "signed_recorded_revocation" : state ? "recorded_revocation" : "dry_run_only";
      const payload = {
        revocation,
        status,
        writes: false,
        ...(state ? { state } : {}),
      };
      return writeOutput(input, "nodes", payload, `revoke: ${status}`, command);
    }
    const payload = { operation: command, status: "dry_run_only", writes: false, reason: "Pairing/trust mutations require explicit signed-host or Coordinator implementation." };
    return writeOutput(input, "nodes", payload, `${command}: dry_run_only`, command);
  }
  if (command === "invite") {
    const invitation = meshInvitationFromFlags(input);
    const store = stateStoreFromFlags(input);
    const state = store && wantsDurableRecord(input) ? store.recordInvitation(invitation, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) }) : undefined;
    const status = state?.coordinatorSignature ? "signed_recorded_proposal" : state ? "recorded_proposal" : "dry_run_only";
    return writeOutput(input, "nodes", { invitation, status, writes: false, ...(state ? { state } : {}) }, `invite: ${status}`, command);
  }
  if (command === "accept") {
    const acceptance = meshInvitationAcceptanceFromFlags(input);
    const usage = "nodes accept --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--issuer-mesh <id>] [--recipient-mesh <id>] [--allowed-resources <ids>]";
    const store = stateStoreFromFlags(input);
    if (wantsDurableRecord(input) && !store) return missing(input, usage);
    const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
    if (typeof signer === "number") return signer;
    const state = store && wantsDurableRecord(input) && signer
      ? store.recordInvitationAcceptance(acceptance, { now: input.flags.now, signer })
      : undefined;
    const status = state?.coordinatorSignature ? "signed_invitation_acceptance_recorded" : "dry_run_external_pending";
    return writeOutput(input, "nodes", {
      acceptance,
      status,
      writes: false,
      physicalPeerTrust: acceptance.physicalPeerTrustVerified ? "verified" : "external_pending",
      ...(state ? { state } : {}),
    }, `accept: ${status}`, command);
  }
  if (command === "share") {
    const share = meshShareFromFlags(input);
    const store = stateStoreFromFlags(input);
    const state = store && wantsDurableRecord(input) ? store.recordShare(share, { now: input.flags.now, signer: coordinatorSignerFromFlags(input) }) : undefined;
    const status = state?.coordinatorSignature ? "signed_recorded_proposal" : state ? "recorded_proposal" : "dry_run_only";
    return writeOutput(input, "nodes", { share, status, writes: false, ...(state ? { state } : {}) }, `share: ${status}`, command);
  }
  return missing(input, "nodes list|pair|trust|revoke|invite|accept|share|heartbeat");
}

export async function runGatewayCli(input: RemoteSyncCliInput): Promise<number> {
  const command = input.positionals[1];
  if (command === "conformance") {
    const payload = conformancePayload();
    return writeOutput(input, "gateway", payload, `${payload.status} hostedSelfHostedParity=${payload.hostedSelfHostedParity}`, command);
  }
  if (command === "serve" || command === "project") {
    const deployment = gatewayDeploymentFromFlags(input, command);
    const usage = `gateway ${command} --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--deployment-kind hosted|self_hosted]`;
    const store = stateStoreFromFlags(input);
    if (wantsDurableRecord(input) && !store) return missing(input, usage);
    const signer = wantsDurableRecord(input) ? requireCoordinatorSigner(input, usage) : undefined;
    if (typeof signer === "number") return signer;
    const state = store && wantsDurableRecord(input) && signer
      ? store.recordGatewayDeployment(deployment, { now: input.flags.now, signer })
      : undefined;
    const status = state?.coordinatorSignature ? "signed_gateway_deployment_recorded" : "dry_run_external_pending";
    const payload = { operation: command, deployment, status, writes: false, conformanceRequired: true, ...(state ? { state } : {}) };
    return writeOutput(input, "gateway", payload, `${command}: ${status} conformanceRequired=true`, command);
  }
  if (command === "agent-service") {
    const assignment = agentServiceAssignmentFromFlags(input);
    const budget = agentServiceBudgetFromFlags(input, assignment);
    const request = {
      tenantId: input.flags["tenant-id"] ?? assignment.tenantId,
      agentId: input.flags["agent-id"] ?? assignment.agentId,
      assignmentId: input.flags["assignment-id"] ?? assignment.assignmentId,
      routeId: input.flags["route-id"] ?? "gateway.multiTenantAgentService",
      estimatedCostCents: numberFlag(input.flags["estimated-cost-cents"], 0),
      now: input.flags.now ?? "2026-05-17T10:10:00.000Z",
    };
    const decision = evaluateRemoteAgentServiceAccess({
      request,
      assignment,
      budget,
    });
    if (wantsDurableRecord(input)) {
      const usage = "gateway agent-service --state-dir <dir> --record true --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--tenant-id <id>] [--agent-id <id>] [--assignment-id <id>]";
      const store = requireStateStore(input, usage);
      if (typeof store === "number") return store;
      const signer = requireCoordinatorSigner(input, usage);
      if (typeof signer === "number") return signer;
      const receipt = createRemoteAgentServiceExecutionReceipt({
        request,
        assignment,
        budget,
        decision,
        createdAt: request.now,
        runtimeExecutionVerified: input.flags["runtime-verified"] === "true",
        billingMeterPersisted: input.flags["billing-meter-persisted"] === "true",
      });
      const state = store.recordRemoteAgentServiceExecutionReceipt(receipt, { now: request.now, signer });
      return writeOutput(input, "gateway", {
        status: "signed_agent_service_receipt_recorded",
        writes: false,
        decision,
        receipt: state.receipt,
        state,
      }, "agent-service: signed_agent_service_receipt_recorded", command);
    }
    return writeOutput(input, "gateway", decision, `agent-service: ${decision.allowed ? "allow" : "deny"}`, command);
  }
  if (command === "audit") {
    const usage = "gateway audit --state-dir <dir> --record true --route-id <route-id> --resource-type <type> --action <action> --coordinator-private-key-file <pem> --coordinator-public-key-file <pem>";
    const store = requireStateStore(input, usage);
    if (typeof store === "number") return store;
    const signer = requireCoordinatorSigner(input, usage);
    if (typeof signer === "number") return signer;
    const routeId = input.flags["route-id"];
    const resourceType = input.flags["resource-type"];
    const action = input.flags.action;
    if (!routeId || !resourceType || !action) return missing(input, usage);
    const now = input.flags.now ?? new Date().toISOString();
    const receipt = createRemoteGatewayAuditReceipt({
      sourceEventType: input.flags["source-event-type"] === "remote.agent_service.evaluated" || input.flags["source-event-type"] === "gateway.agent_service.execution"
        ? input.flags["source-event-type"]
        : "remote.access.evaluated",
      routeId,
      actor: actorContextFromFlags(input),
      resourceType,
      ...(input.flags["resource-id"] ? { resourceId: input.flags["resource-id"] } : {}),
      action,
      decision: input.flags.decision === "deny" ? "deny" : "allow",
      createdAt: now,
      signedHostAuditPersisted: input.flags["host-audit-persisted"] === "true",
    });
    const state = store.recordRemoteGatewayAuditReceipt(receipt, { now, signer });
    return writeOutput(input, "gateway", {
      status: "signed_gateway_audit_receipt_recorded",
      writes: false,
      receipt: state.receipt,
      state,
    }, "audit: signed_gateway_audit_receipt_recorded", command);
  }
  if (command === "secret-lease" || command === "secret-provider") {
    const usage = `gateway ${command} --state-dir <dir> --secret-ref <ref> --resource-id <id> --coordinator-private-key-file <pem> --coordinator-public-key-file <pem> [--action <action>] [--ttl-seconds <seconds>]`;
    const store = requireStateStore(input, usage);
    if (typeof store === "number") return store;
    const signer = requireCoordinatorSigner(input, usage);
    if (typeof signer === "number") return signer;
    if (input.flags.plaintext === "true" || input.flags["return-plaintext"] === "true") {
      input.context.stderr.write("Secret leases never return plaintext.\n");
      return CLI_EXIT_USAGE;
    }
    const secretRef = input.flags["secret-ref"] ?? input.flags.secret;
    const resourceId = input.flags["resource-id"];
    if (!secretRef || !resourceId) return missing(input, usage);
    const ttlSeconds = numberFlag(input.flags["ttl-seconds"], 900);
    const now = input.flags.now ?? new Date().toISOString();
    const expiresAt = input.flags["expires-at"] ?? new Date(Date.parse(now) + ttlSeconds * 1000).toISOString();
    const state = store.issueSecretLease({
      secretRef,
      actor: actorContextFromFlags(input),
      action: input.flags.action ?? "lease_secret",
      resourceId,
      expiresAt,
      now,
      signer,
    });
    if (command === "secret-provider") {
      const providerId = input.flags["provider-id"];
      const credentialBindingId = input.flags["credential-binding-id"];
      if (!providerId || !credentialBindingId) return missing(input, `${usage} --provider-id <id> --credential-binding-id <id>`);
      const receipt = createRemoteSecretProviderReceipt({
        lease: state.lease,
        providerId,
        credentialBindingId,
        operationId: input.flags["operation-id"],
        createdAt: now,
        providerAccessVerified: input.flags["provider-verified"] === "true",
      });
      const providerState = store.recordSecretProviderReceipt(receipt, { now, signer });
      return writeOutput(input, "gateway", {
        status: "signed_secret_provider_receipt_recorded",
        writes: false,
        lease: state.lease,
        receipt: providerState.receipt,
        state: {
          lease: state,
          providerReceipt: providerState,
        },
      }, "secret-provider: signed_secret_provider_receipt_recorded", command);
    }
    return writeOutput(input, "gateway", { status: "signed_secret_lease_issued", writes: false, ...state }, "secret-lease: signed_secret_lease_issued", command);
  }
  return missing(input, "gateway serve|project|conformance|agent-service|audit|secret-lease|secret-provider");
}

export function remoteSyncExitForPayload(payload: { status?: string; missingRoutes?: unknown[] }): number {
  return payload.status === "baseline_incomplete" || (payload.missingRoutes?.length ?? 0) > 0 ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
}
