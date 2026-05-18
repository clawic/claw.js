import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildRemoteExternalPendingRegister,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteRouteContractCatalog,
  clawPersistentSurfaceRegistry,
  remoteSyncRequiredRouteIds,
} from "@clawjs/core";

import { buildRelayApp } from "./app.ts";

const registeredRouteIds = () => (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id);

test("relay exposes remote Gateway and Sync conformance API routes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-remote-sync-"));
  const built = await buildRelayApp({
    config: {
      dbPath: path.join(tempRoot, "relay.sqlite"),
      corsOrigins: [],
    },
  });
  try {
    const conformance = await built.app.inject({ method: "GET", url: "/v1/remote/conformance" });
    assert.equal(conformance.statusCode, 200);
    const conformancePayload = conformance.json() as {
      status: string;
      decisions: Array<{ decisionId: string }>;
      requiredRoutes: Array<{ routeId: string; registered: boolean }>;
      missingRoutes: string[];
      hostedSelfHostedParity: string;
      transportContract: string;
    };
    assert.equal(conformancePayload.status, "baseline_registered");
    assert.equal(conformancePayload.missingRoutes.length, 0);
    assert.equal(conformancePayload.hostedSelfHostedParity, "required");
    assert.equal(conformancePayload.transportContract, "transport_agnostic_iroh_v1_adapter");
    assert.equal(conformancePayload.decisions.some((entry) => entry.decisionId === "remote_surface_parity"), true);
    assert.equal(conformancePayload.decisions.length, 22);
    assert.deepEqual(conformancePayload.requiredRoutes.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
    assert.equal(conformancePayload.requiredRoutes.every((entry) => entry.registered), true);

    const externalPending = await built.app.inject({ method: "GET", url: "/v1/remote/external-pending" });
    assert.equal(externalPending.statusCode, 200);
    const externalPendingPayload = externalPending.json() as { status: string; writes: boolean; requirements: Array<{ requirementId: string; sourceReceipt: string; status: string; writes: boolean }> };
    const expectedExternalPending = buildRemoteExternalPendingRegister();
    assert.equal(externalPendingPayload.status, "external_pending");
    assert.equal(externalPendingPayload.writes, false);
    assert.deepEqual(
      externalPendingPayload.requirements.map((entry) => entry.requirementId),
      expectedExternalPending.requirements.map((entry) => entry.requirementId),
    );
    assert.equal(externalPendingPayload.requirements.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.sourceReceipt === "RemoteTransportHandshakeReceipt"), true);
    assert.equal(externalPendingPayload.requirements.some((entry) => entry.requirementId === "hosted_deployment"), true);
    assert.equal(externalPendingPayload.requirements.every((entry) => entry.status === "external_pending" && entry.writes === false), true);

    const routeContracts = await built.app.inject({ method: "GET", url: "/v1/remote/route-contracts" });
    assert.equal(routeContracts.statusCode, 200);
    const routeContractsPayload = routeContracts.json() as { status: string; writes: boolean; missingRouteIds: string[]; contracts: Array<{ routeId: string; localContractRefs: string[]; remoteEntryPoints: string[]; parityRequired: boolean; parallelApiAllowed: boolean; writes: boolean }> };
    const expectedRouteContracts = buildRemoteRouteContractCatalog({ registeredRouteIds: registeredRouteIds() });
    assert.equal(routeContractsPayload.status, "complete");
    assert.equal(routeContractsPayload.writes, false);
    assert.deepEqual(routeContractsPayload.missingRouteIds, []);
    assert.deepEqual(
      routeContractsPayload.contracts.map((entry) => entry.routeId),
      expectedRouteContracts.contracts.map((entry) => entry.routeId),
    );
    assert.deepEqual(routeContractsPayload.contracts.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
    assert.equal(routeContractsPayload.contracts.some((entry) => entry.routeId === "remote.searchGateway" && entry.localContractRefs.includes("claw search")), true);
    assert.equal(routeContractsPayload.contracts.some((entry) => entry.routeId === "gateway.multiTenantAgentService" && entry.remoteEntryPoints.includes("POST /v1/gateway/agent-service/evaluate")), true);
    assert.equal(routeContractsPayload.contracts.every((entry) => entry.parityRequired && !entry.parallelApiAllowed && entry.writes === false), true);

    const providerDeviceE2EPlan = await built.app.inject({ method: "GET", url: "/v1/remote/provider-device-e2e-plan" });
    assert.equal(providerDeviceE2EPlan.statusCode, 200);
    const providerDeviceE2EPlanPayload = providerDeviceE2EPlan.json() as { status: string; writes: boolean; requiredDomains: string[]; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; noPlaintextSecrets: boolean; plaintextMaterialIncluded: boolean; hostedSelfHostedParityRequired: boolean };
    const expectedProviderDeviceE2EPlan = buildRemoteProviderDeviceE2EValidationPlan({ requiredRouteIds: remoteSyncRequiredRouteIds });
    assert.equal(providerDeviceE2EPlanPayload.status, "external_pending");
    assert.equal(providerDeviceE2EPlanPayload.writes, false);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredDomains, expectedProviderDeviceE2EPlan.requiredDomains);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredRouteIds, expectedProviderDeviceE2EPlan.requiredRouteIds);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredExternalPendingIds, expectedProviderDeviceE2EPlan.requiredExternalPendingIds);
    assert.equal(providerDeviceE2EPlanPayload.noPlaintextSecrets, true);
    assert.equal(providerDeviceE2EPlanPayload.plaintextMaterialIncluded, false);
    assert.equal(providerDeviceE2EPlanPayload.hostedSelfHostedParityRequired, true);

    const classifications = await built.app.inject({ method: "GET", url: "/v1/remote/classifications" });
    assert.equal(classifications.statusCode, 200);
    const classificationPayload = classifications.json() as { classifications: Array<{ id: string; relay: string }> };
    assert.equal(classificationPayload.classifications.some((entry) => entry.id === "claw.gateway" && entry.relay === "remote-safe"), true);

    const classificationReceipt = await built.app.inject({
      method: "POST",
      url: "/v1/remote/classifications/receipts",
      headers: { "content-type": "application/json" },
      payload: {
        capabilityId: "claw.gateway",
        classification: "remote-safe",
        routeId: "remote.chatGateway",
        policyRef: "docs/adr/0022-remote-gateway-sync-redesign.md",
        testRefs: ["relay/src/server/remote-sync-routes.test.ts"],
      },
    });
    assert.equal(classificationReceipt.statusCode, 200);
    const classificationReceiptPayload = classificationReceipt.json() as { status: string; receipt: { capabilityId: string; classification: string; remoteSafeReady: boolean; missingEvidence: string[]; writes: boolean }; writes: boolean };
    assert.equal(classificationReceiptPayload.status, "dry_run_only");
    assert.equal(classificationReceiptPayload.receipt.capabilityId, "claw.gateway");
    assert.equal(classificationReceiptPayload.receipt.classification, "remote-safe");
    assert.equal(classificationReceiptPayload.receipt.remoteSafeReady, true);
    assert.deepEqual(classificationReceiptPayload.receipt.missingEvidence, []);
    assert.equal(classificationReceiptPayload.receipt.writes, false);
    assert.equal(classificationReceiptPayload.writes, false);

    const gateway = await built.app.inject({ method: "GET", url: "/v1/gateway/conformance" });
    assert.equal(gateway.statusCode, 200);
    const gatewayPayload = gateway.json() as { gateway: { contract: string; hostedSelfHostedParity: string } };
    assert.equal(gatewayPayload.gateway.contract, "registered_local_contract_projection");
    assert.equal(gatewayPayload.gateway.hostedSelfHostedParity, "required");

    const compatibilityAdapters = await built.app.inject({ method: "GET", url: "/v1/remote/compatibility/adapters" });
    assert.equal(compatibilityAdapters.statusCode, 200);
    const compatibilityAdaptersPayload = compatibilityAdapters.json() as { adapters: Array<{ legacySurface: string; canonicalRouteId: string; mapsToCanonical: boolean; parallelApiIntroduced: boolean; writes: boolean }>; writes: boolean };
    assert.equal(compatibilityAdaptersPayload.adapters.some((entry) => entry.legacySurface === "relay.mobile.chat" && entry.canonicalRouteId === "remote.chatGateway"), true);
    assert.equal(compatibilityAdaptersPayload.adapters.every((entry) => entry.mapsToCanonical && !entry.parallelApiIntroduced && !entry.writes), true);
    assert.equal(compatibilityAdaptersPayload.writes, false);

    const compatibilityAdapter = await built.app.inject({
      method: "POST",
      url: "/v1/remote/compatibility/adapters",
      headers: { "content-type": "application/json" },
      payload: {
        legacySurface: "relay.mobile.search",
        canonicalRouteId: "remote.searchGateway",
        clientKind: "web",
      },
    });
    assert.equal(compatibilityAdapter.statusCode, 200);
    const compatibilityAdapterPayload = compatibilityAdapter.json() as { receipt: { clientKind: string; canonicalRouteId: string; mapsToCanonical: boolean; parallelApiIntroduced: boolean; writes: boolean }; status: string; writes: boolean };
    assert.equal(compatibilityAdapterPayload.status, "dry_run_only");
    assert.equal(compatibilityAdapterPayload.receipt.clientKind, "web");
    assert.equal(compatibilityAdapterPayload.receipt.canonicalRouteId, "remote.searchGateway");
    assert.equal(compatibilityAdapterPayload.receipt.mapsToCanonical, true);
    assert.equal(compatibilityAdapterPayload.receipt.parallelApiIntroduced, false);
    assert.equal(compatibilityAdapterPayload.receipt.writes, false);
    assert.equal(compatibilityAdapterPayload.writes, false);

    const agentService = await built.app.inject({
      method: "POST",
      url: "/v1/gateway/agent-service/evaluate",
      headers: { "content-type": "application/json" },
      payload: {
        tenantId: "tenant.acme",
        agentId: "agent.support",
        assignmentId: "assignment.service",
        estimatedCostCents: 300,
      },
    });
    assert.equal(agentService.statusCode, 200);
    const agentServicePayload = agentService.json() as {
      allowed: boolean;
      billingAccountId: string;
      isolationKey: string;
      audit: { eventType: string; decision: string };
      writes: boolean;
    };
    assert.equal(agentServicePayload.allowed, true);
    assert.equal(agentServicePayload.billingAccountId, "billing.demo");
    assert.equal(agentServicePayload.isolationKey, "tenant.acme:assignment.service");
    assert.equal(agentServicePayload.audit.eventType, "remote.agent_service.evaluated");
    assert.equal(agentServicePayload.writes, false);

    const agentServiceExecution = await built.app.inject({
      method: "POST",
      url: "/v1/gateway/agent-service/executions",
      headers: { "content-type": "application/json" },
      payload: {
        tenantId: "tenant.acme",
        agentId: "agent.support",
        assignmentId: "assignment.service",
        estimatedCostCents: 300,
      },
    });
    assert.equal(agentServiceExecution.statusCode, 200);
    const agentServiceExecutionPayload = agentServiceExecution.json() as {
      status: string;
      decision: { allowed: boolean; writes: boolean };
      receipt: { status: string; runtimeExecutionVerified: boolean; billingMeterPersisted: boolean; externalPending: string[]; writes: boolean };
      writes: boolean;
    };
    assert.equal(agentServiceExecutionPayload.status, "dry_run_external_pending");
    assert.equal(agentServiceExecutionPayload.decision.allowed, true);
    assert.equal(agentServiceExecutionPayload.decision.writes, false);
    assert.equal(agentServiceExecutionPayload.receipt.status, "signed_pending_runtime");
    assert.equal(agentServiceExecutionPayload.receipt.runtimeExecutionVerified, false);
    assert.equal(agentServiceExecutionPayload.receipt.billingMeterPersisted, false);
    assert.equal(agentServiceExecutionPayload.receipt.externalPending.includes("agent_runtime_execution"), true);
    assert.equal(agentServiceExecutionPayload.receipt.externalPending.includes("billing_meter_persistence"), true);
    assert.equal(agentServiceExecutionPayload.receipt.writes, false);
    assert.equal(agentServiceExecutionPayload.writes, false);

    const gatewayAudit = await built.app.inject({
      method: "POST",
      url: "/v1/gateway/audit/receipts",
      headers: { "content-type": "application/json" },
      payload: {
        routeId: "remote.chatGateway",
        actorKind: "human",
        actorId: "user.remote",
        resourceType: "session",
        resourceId: "session.demo",
        action: "read",
      },
    });
    assert.equal(gatewayAudit.statusCode, 200);
    const gatewayAuditPayload = gatewayAudit.json() as {
      status: string;
      receipt: { routeId: string; hostAuditStore: string; signedHostAuditPersisted: boolean; externalPending: string[]; writes: boolean };
      writes: boolean;
    };
    assert.equal(gatewayAuditPayload.status, "dry_run_external_pending");
    assert.equal(gatewayAuditPayload.receipt.routeId, "remote.chatGateway");
    assert.equal(gatewayAuditPayload.receipt.hostAuditStore, "signed_host_audit");
    assert.equal(gatewayAuditPayload.receipt.signedHostAuditPersisted, false);
    assert.equal(gatewayAuditPayload.receipt.externalPending.includes("signed_host_audit_persistence"), true);
    assert.equal(gatewayAuditPayload.receipt.writes, false);
    assert.equal(gatewayAuditPayload.writes, false);

    const manifests = await built.app.inject({ method: "GET", url: "/v1/sync/manifests?driver=skills" });
    assert.equal(manifests.statusCode, 200);
    const manifestsPayload = manifests.json() as { manifests: Array<{ driver: string; secretPolicy: { plaintextReplication: boolean } }> };
    assert.equal(manifestsPayload.manifests[0]?.driver, "skills");
    assert.equal(manifestsPayload.manifests[0]?.secretPolicy.plaintextReplication, false);

    const plan = await built.app.inject({
      method: "POST",
      url: "/v1/sync/plan",
      headers: { "content-type": "application/json" },
      payload: {
        driver: "skills",
        localHash: "hash-a",
        peerHash: "hash-b",
      },
    });
    assert.equal(plan.statusCode, 200);
    const planPayload = plan.json() as {
      mode: string;
      writes: boolean;
      actions: Array<{ action: string; reason: string }>;
      conflicts: Array<{ status: string; objectRef: string }>;
      nextCursor?: { cursor: string };
    };
    assert.equal(planPayload.mode, "plan");
    assert.equal(planPayload.writes, false);
    assert.equal(planPayload.actions.some((action) => action.action === "conflict" && action.reason === "diverged_snapshots_detect_and_elevate"), true);
    assert.equal(planPayload.conflicts[0]?.status, "open");
    assert.equal(planPayload.conflicts[0]?.objectRef, "skill.review");
    assert.equal(planPayload.nextCursor?.cursor.includes("skill.review"), true);

    const conflicts = await built.app.inject({
      method: "POST",
      url: "/v1/sync/conflicts",
      headers: { "content-type": "application/json" },
      payload: { localHash: "hash-a", peerHash: "hash-b" },
    });
    assert.equal(conflicts.statusCode, 200);
    const conflictsPayload = conflicts.json() as { conflicts: Array<{ status: string }>; silentOverwriteAllowed: boolean; writes: boolean };
    assert.equal(conflictsPayload.conflicts[0]?.status, "open");
    assert.equal(conflictsPayload.silentOverwriteAllowed, false);
    assert.equal(conflictsPayload.writes, false);

    const syncApplication = await built.app.inject({
      method: "POST",
      url: "/v1/sync/applications",
      headers: { "content-type": "application/json" },
      payload: {
        driver: "skills",
        localHash: "hash-a",
        peerSnapshot: [],
        actorId: "agent.sync",
      },
    });
    assert.equal(syncApplication.statusCode, 200);
    const syncApplicationPayload = syncApplication.json() as {
      status: string;
      receipt: { status: string; driver: string; physicalDriverApplied: boolean; externalPending: string[]; writes: boolean };
      reconciliation: { appliedChangeIds: string[] };
      writes: boolean;
    };
    assert.equal(syncApplicationPayload.status, "dry_run_external_pending");
    assert.equal(syncApplicationPayload.receipt.status, "signed_pending_driver_application");
    assert.equal(syncApplicationPayload.receipt.driver, "skills");
    assert.equal(syncApplicationPayload.receipt.physicalDriverApplied, false);
    assert.equal(syncApplicationPayload.receipt.externalPending.includes("physical_sync_driver_application"), true);
    assert.equal(syncApplicationPayload.receipt.writes, false);
    assert.equal(syncApplicationPayload.reconciliation.appliedChangeIds.length, 1);
    assert.equal(syncApplicationPayload.writes, false);

    const authorityHandoff = await built.app.inject({
      method: "POST",
      url: "/v1/sync/authority-handoffs",
      headers: { "content-type": "application/json" },
      payload: {
        resourceId: "skills:default",
        driver: "skills",
        ownerNodeId: "node.mac",
        toNodeId: "node.server",
        requestedAuthority: "primary",
        actorId: "agent.sync",
      },
    });
    assert.equal(authorityHandoff.statusCode, 200);
    const authorityHandoffPayload = authorityHandoff.json() as {
      status: string;
      receipt: { status: string; fromNodeId: string; toNodeId: string; requestedAuthority: string; physicalAuthorityApplied: boolean; externalPending: string[]; writes: boolean };
      writes: boolean;
    };
    assert.equal(authorityHandoffPayload.status, "dry_run_external_pending");
    assert.equal(authorityHandoffPayload.receipt.status, "signed_pending_authority_handoff");
    assert.equal(authorityHandoffPayload.receipt.fromNodeId, "node.mac");
    assert.equal(authorityHandoffPayload.receipt.toNodeId, "node.server");
    assert.equal(authorityHandoffPayload.receipt.requestedAuthority, "primary");
    assert.equal(authorityHandoffPayload.receipt.physicalAuthorityApplied, false);
    assert.equal(authorityHandoffPayload.receipt.externalPending.includes("physical_authority_handoff"), true);
    assert.equal(authorityHandoffPayload.receipt.writes, false);
    assert.equal(authorityHandoffPayload.writes, false);

    const nodes = await built.app.inject({ method: "GET", url: "/v1/nodes" });
    assert.equal(nodes.statusCode, 200);
    const nodesPayload = nodes.json() as { nodes: Array<{ id: string }> };
    assert.equal(nodesPayload.nodes.some((node) => node.id === "claw.coordinator"), true);

    const revoke = await built.app.inject({
      method: "POST",
      url: "/v1/nodes/revoke",
      headers: { "content-type": "application/json" },
      payload: { nodeId: "node.peer" },
    });
    assert.equal(revoke.statusCode, 200);
    const revokePayload = revoke.json() as { operation: string; status: string; writes: boolean };
    assert.equal(revokePayload.operation, "revoke");
    assert.equal(revokePayload.status, "dry_run_only");
    assert.equal(revokePayload.writes, false);

    const invitation = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/invitations",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        allowedResourceIds: ["skills:default"],
        allowedActions: ["read", "sync"],
      },
    });
    assert.equal(invitation.statusCode, 200);
    const invitationPayload = invitation.json() as { invitation: { status: string; writes: boolean; allowedResourceIds: string[] }; writes: boolean };
    assert.equal(invitationPayload.invitation.status, "pending");
    assert.equal(invitationPayload.invitation.allowedResourceIds[0], "skills:default");
    assert.equal(invitationPayload.writes, false);

    const acceptance = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/invitations/accept",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        allowedResourceIds: ["skills:default"],
        allowedActions: ["read", "sync"],
      },
    });
    assert.equal(acceptance.statusCode, 200);
    const acceptancePayload = acceptance.json() as { acceptance: { status: string; physicalPeerTrustVerified: boolean; externalPending: string[]; writes: boolean }; status: string; writes: boolean };
    assert.equal(acceptancePayload.status, "dry_run_external_pending");
    assert.equal(acceptancePayload.acceptance.status, "signed_pending_peer_trust");
    assert.equal(acceptancePayload.acceptance.physicalPeerTrustVerified, false);
    assert.equal(acceptancePayload.acceptance.externalPending.includes("physical_peer_trust"), true);
    assert.equal(acceptancePayload.acceptance.externalPending.includes("device_trust_acceptance"), true);
    assert.equal(acceptancePayload.acceptance.writes, false);
    assert.equal(acceptancePayload.writes, false);

    const share = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/shares",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        resourceId: "skills:default",
        driver: "skills",
        actions: ["read", "sync"],
      },
    });
    assert.equal(share.statusCode, 200);
    const sharePayload = share.json() as { share: { status: string; resourceId: string; plaintextSecrets: boolean; writes: boolean }; writes: boolean };
    assert.equal(sharePayload.share.status, "proposed");
    assert.equal(sharePayload.share.resourceId, "skills:default");
    assert.equal(sharePayload.share.plaintextSecrets, false);
    assert.equal(sharePayload.writes, false);

    const meshRevocation = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/revocations",
      headers: { "content-type": "application/json" },
      payload: { targetType: "share", targetId: "mesh_share_1", reason: "owner_revoked" },
    });
    assert.equal(meshRevocation.statusCode, 200);
    const meshRevocationPayload = meshRevocation.json() as { revocation: { targetType: string; cascadeSyncQueues: boolean; writes: boolean }; writes: boolean };
    assert.equal(meshRevocationPayload.revocation.targetType, "share");
    assert.equal(meshRevocationPayload.revocation.cascadeSyncQueues, true);
    assert.equal(meshRevocationPayload.writes, false);
  } finally {
    await built.app.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
