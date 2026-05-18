import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildRemoteExternalPendingRegister,
  buildRemoteExternalValidationChecklist,
  buildRemoteExternalValidationApprovalRequest,
  buildRemoteExternalValidationEvidenceArtifact,
  buildRemoteExternalValidationEvidenceTemplate,
  buildRemoteExternalValidationReport,
  buildRemoteExternalValidationReadiness,
  buildRemoteExternalValidationRunbook,
  buildRemoteGoalClosureGate,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteRouteContractCatalog,
  buildRemoteSourceQaReviewTemplate,
  buildSyncDriverCatalog,
  clawPersistentSurfaceRegistry,
  remoteGoalClosureRequiredSourceQaIds,
  remoteSyncRequiredRouteIds,
} from "@clawjs/core";

import { buildRelayApp } from "./app.ts";

const registeredRouteIds = () => (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id);
const expectedRelayClassifications = () => clawPersistentSurfaceRegistry.nodes
  .filter((node) => node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay"))
  .map((node) => ({
    id: node.id,
    relay: node.programmaticSurfaces?.includes("relay")
      ? "remote-safe"
      : node.surfaceGaps?.find((gap) => gap.surface === "relay")?.status ?? "pending",
  }));

const expectedCompatibilityAdapters = [
  { legacySurface: "relay.mobile.chat", canonicalRouteId: "remote.chatGateway", clientKind: "ios" },
  { legacySurface: "relay.mobile.search", canonicalRouteId: "remote.searchGateway", clientKind: "web" },
];
const expectedRemoteHttpMethodRoutes = [
  "GET:/v1/remote/classifications",
  "POST:/v1/remote/classifications/receipts",
  "GET:/v1/remote/conformance",
  "GET:/v1/remote/offline-command",
  "POST:/v1/remote/offline-command",
  "GET:/v1/remote/external-pending",
  "GET:/v1/remote/external-validation-checklist",
  "GET:/v1/remote/external-validation-template",
  "POST:/v1/remote/external-validation-template",
  "GET:/v1/remote/external-validation-artifact",
  "POST:/v1/remote/external-validation-artifact",
  "GET:/v1/remote/external-validation-runbook",
  "GET:/v1/remote/external-validation-readiness",
  "POST:/v1/remote/external-validation-readiness",
  "GET:/v1/remote/external-validation-approval-request",
  "POST:/v1/remote/external-validation-approval-request",
  "GET:/v1/remote/external-validation-report",
  "POST:/v1/remote/external-validation-report",
  "GET:/v1/remote/source-qa-template",
  "POST:/v1/remote/source-qa-template",
  "GET:/v1/remote/closure-gate",
  "POST:/v1/remote/closure-gate",
  "GET:/v1/remote/route-contracts",
  "GET:/v1/remote/provider-device-e2e-plan",
  "GET:/v1/remote/compatibility/adapters",
  "POST:/v1/remote/compatibility/adapters",
  "GET:/v1/gateway/conformance",
  "POST:/v1/gateway/agent-service/evaluate",
  "POST:/v1/gateway/agent-service/executions",
  "POST:/v1/gateway/audit/receipts",
  "GET:/v1/sync/drivers",
  "GET:/v1/sync/manifests",
  "POST:/v1/sync/manifests",
  "GET:/v1/sync/changes",
  "POST:/v1/sync/plan",
  "POST:/v1/sync/conflicts",
  "POST:/v1/sync/applications",
  "POST:/v1/sync/authority-handoffs",
  "GET:/v1/nodes",
  "POST:/v1/nodes/pair",
  "POST:/v1/nodes/trust",
  "POST:/v1/nodes/revoke",
  "POST:/v1/mesh/invitations",
  "POST:/v1/mesh/invitations/accept",
  "POST:/v1/mesh/shares",
  "POST:/v1/mesh/revocations",
];
const remoteHttpSmokePayloads: Record<string, Record<string, unknown>> = {
  "POST:/v1/remote/classifications/receipts": {
    capabilityId: "claw.gateway",
    classification: "remote-safe",
    routeId: "remote.chatGateway",
    policyRef: "docs/adr/0022-remote-gateway-sync-redesign.md",
    testRefs: ["relay/src/server/remote-sync-routes.test.ts"],
  },
};

test("relay exposes remote Gateway and Sync conformance API routes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-remote-sync-"));
  const built = await buildRelayApp({
    config: {
      dbPath: path.join(tempRoot, "relay.sqlite"),
      corsOrigins: [],
    },
  });
  try {
    for (const entry of expectedRemoteHttpMethodRoutes) {
      const [method, url] = entry.split(":");
      const response = await built.app.inject({
        method,
        url,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        payload: method === "POST" ? remoteHttpSmokePayloads[entry] ?? {} : undefined,
      });
      assert.equal(response.statusCode, 200, `${method} ${url} must be mounted`);
    }

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
    const expectedExternalPendingRequirementIds = expectedExternalPending.requirements.map((entry) => entry.requirementId);
    assert.equal(externalPendingPayload.status, "external_pending");
    assert.equal(externalPendingPayload.writes, false);
    assert.deepEqual(
      externalPendingPayload.requirements.map((entry) => entry.requirementId),
      expectedExternalPendingRequirementIds,
    );
    assert.equal(externalPendingPayload.requirements.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.sourceReceipt === "RemoteTransportHandshakeReceipt"), true);
    assert.equal(externalPendingPayload.requirements.some((entry) => entry.requirementId === "hosted_deployment"), true);
    assert.equal(externalPendingPayload.requirements.every((entry) => entry.status === "external_pending" && entry.writes === false), true);

    const externalValidationChecklist = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-checklist" });
    assert.equal(externalValidationChecklist.statusCode, 200);
    const externalValidationChecklistPayload = externalValidationChecklist.json() as { status: string; writes: boolean; requirementIds: string[]; coverage: { requirementCount: number; coveredRequirementCount: number; missingRequirementIds: string[] }; items: Array<{ requirementId: string; sourceReceipt: string; requiredCommand: string; requiredArtifacts: string[]; approvedRunRequired: boolean; physicalEvidenceRequired: boolean; plaintextMaterialIncluded: boolean; writes: boolean }> };
    const expectedExternalValidationChecklist = buildRemoteExternalValidationChecklist();
    assert.equal(externalValidationChecklistPayload.status, "external_pending");
    assert.equal(externalValidationChecklistPayload.writes, false);
    assert.deepEqual(externalValidationChecklistPayload.requirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(externalValidationChecklistPayload.requirementIds, expectedExternalValidationChecklist.requirementIds);
    assert.equal(externalValidationChecklistPayload.coverage.requirementCount, expectedExternalPending.requirements.length);
    assert.equal(externalValidationChecklistPayload.coverage.coveredRequirementCount, expectedExternalPending.requirements.length);
    assert.deepEqual(externalValidationChecklistPayload.coverage.missingRequirementIds, []);
    assert.deepEqual(
      externalValidationChecklistPayload.items.map((entry) => entry.requirementId),
      expectedExternalValidationChecklist.items.map((entry) => entry.requirementId),
    );
    assert.equal(externalValidationChecklistPayload.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.requiredCommand.includes("claw nodes heartbeat")), true);
    assert.equal(externalValidationChecklistPayload.items.some((entry) => entry.requirementId === "provider_device_e2e" && entry.requiredArtifacts.includes("RemoteProviderDeviceE2EValidationPlan")), true);
    assert.equal(externalValidationChecklistPayload.items.every((entry) => entry.approvedRunRequired && entry.physicalEvidenceRequired && entry.plaintextMaterialIncluded === false && !entry.writes), true);

    const externalValidationTemplate = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-template" });
    assert.equal(externalValidationTemplate.statusCode, 200);
    const externalValidationTemplatePayload = externalValidationTemplate.json() as { status: string; writes: boolean; requirementCount: number; checklistItems: Array<{ requirementId: string }>; evidence: Array<{ requirementId: string; approvedRun: boolean; approvedRunRef?: string; artifactRefs: string[]; acceptedCriteria: string[]; plaintextMaterialIncluded: boolean; writes: boolean }>; submissionCommand: string };
    const expectedExternalValidationTemplate = buildRemoteExternalValidationEvidenceTemplate();
    assert.equal(externalValidationTemplatePayload.status, "external_pending");
    assert.equal(externalValidationTemplatePayload.writes, false);
    assert.equal(externalValidationTemplatePayload.requirementCount, expectedExternalPending.requirements.length);
    assert.deepEqual(externalValidationTemplatePayload.evidence.map((entry) => entry.requirementId), expectedExternalValidationTemplate.evidence.map((entry) => entry.requirementId));
    assert.equal(externalValidationTemplatePayload.checklistItems.length, expectedExternalPending.requirements.length);
    assert.deepEqual(externalValidationTemplatePayload.checklistItems.map((entry) => entry.requirementId), expectedExternalPendingRequirementIds);
    assert.equal(externalValidationTemplatePayload.evidence.every((entry) => !entry.approvedRun && entry.approvedRunRef === undefined && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);
    assert.equal(externalValidationTemplatePayload.submissionCommand.includes("claw remote validation-report"), true);
    assert.equal(externalValidationTemplatePayload.submissionCommand.includes("--evidence-file"), true);

    const scopedExternalValidationTemplate = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-template",
      headers: { "content-type": "application/json" },
      payload: { requirementIds: ["physical_iroh_handshake", "provider_device_e2e"] },
    });
    assert.equal(scopedExternalValidationTemplate.statusCode, 200);
    const scopedExternalValidationTemplatePayload = scopedExternalValidationTemplate.json() as { requirementCount: number; evidence: Array<{ requirementId: string }> };
    assert.equal(scopedExternalValidationTemplatePayload.requirementCount, 2);
    assert.deepEqual(scopedExternalValidationTemplatePayload.evidence.map((entry) => entry.requirementId), ["physical_iroh_handshake", "provider_device_e2e"]);

    const externalValidationArtifactResponse = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-artifact" });
    assert.equal(externalValidationArtifactResponse.statusCode, 200);
    const externalValidationArtifactPayload = externalValidationArtifactResponse.json() as { status: string; writes: boolean; sourceConversationId: string; sourcePlanId: string; evidence: Array<{ requirementId: string; approvedRun: boolean; artifactRefs: string[]; acceptedCriteria: string[]; plaintextMaterialIncluded: boolean; writes: boolean }> };
    const expectedExternalValidationArtifact = buildRemoteExternalValidationEvidenceArtifact();
    assert.equal(externalValidationArtifactPayload.status, "external_pending");
    assert.equal(externalValidationArtifactPayload.writes, false);
    assert.equal(externalValidationArtifactPayload.sourceConversationId, expectedExternalValidationArtifact.sourceConversationId);
    assert.equal(externalValidationArtifactPayload.sourcePlanId, expectedExternalValidationArtifact.sourcePlanId);
    assert.deepEqual(externalValidationArtifactPayload.evidence.map((entry) => entry.requirementId), expectedExternalValidationArtifact.evidence.map((entry) => entry.requirementId));
    assert.equal(externalValidationArtifactPayload.evidence.every((entry) => !entry.approvedRun && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);

    const scopedExternalValidationArtifact = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-artifact",
      headers: { "content-type": "application/json" },
      payload: { requirementIds: ["physical_iroh_handshake", "provider_device_e2e"] },
    });
    assert.equal(scopedExternalValidationArtifact.statusCode, 200);
    const scopedExternalValidationArtifactPayload = scopedExternalValidationArtifact.json() as { evidence: Array<{ requirementId: string }> };
    assert.deepEqual(scopedExternalValidationArtifactPayload.evidence.map((entry) => entry.requirementId), ["physical_iroh_handshake", "provider_device_e2e"]);

    const externalValidationRunbook = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-runbook" });
    assert.equal(externalValidationRunbook.statusCode, 200);
    const externalValidationRunbookPayload = externalValidationRunbook.json() as { status: string; writes: boolean; validationStepCount: number; externalRequirementCount: number; e2ePlan: { requiredTopologyTargets: string[]; validationSteps: Array<{ domain: string }> }; evidenceArtifact: { evidence: Array<{ requirementId: string }> }; reportCommand: string; closureGateCommand: string; requiredCommands: string[] };
    const expectedExternalValidationRunbook = buildRemoteExternalValidationRunbook();
    assert.equal(externalValidationRunbookPayload.status, "external_pending");
    assert.equal(externalValidationRunbookPayload.writes, false);
    assert.equal(externalValidationRunbookPayload.validationStepCount, expectedExternalValidationRunbook.validationStepCount);
    assert.equal(externalValidationRunbookPayload.externalRequirementCount, expectedExternalPending.requirements.length);
    assert.deepEqual(externalValidationRunbookPayload.e2ePlan.validationSteps.map((entry) => entry.domain), ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
    assert.equal(externalValidationRunbookPayload.e2ePlan.requiredTopologyTargets.includes("windows_host"), true);
    assert.equal(externalValidationRunbookPayload.e2ePlan.requiredTopologyTargets.includes("mobile_client"), true);
    assert.deepEqual(externalValidationRunbookPayload.evidenceArtifact.evidence.map((entry) => entry.requirementId), expectedExternalPendingRequirementIds);
    assert.equal(externalValidationRunbookPayload.reportCommand.includes("validation-report"), true);
    assert.equal(externalValidationRunbookPayload.closureGateCommand.includes("closure-gate"), true);
    assert.equal(externalValidationRunbookPayload.requiredCommands.some((entry) => entry.includes("validation-artifact")), true);

    const externalValidationReadiness = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-readiness" });
    assert.equal(externalValidationReadiness.statusCode, 200);
    const externalValidationReadinessPayload = externalValidationReadiness.json() as { status: string; writes: boolean; sourceQaReady: boolean; externalEvidenceReady: boolean; evidenceCount: number; requiredEvidenceCount: number; missingEvidenceRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockedExternalRequirementIds: string[]; closureGateBlockers: string[] };
    const expectedExternalValidationReadiness = buildRemoteExternalValidationReadiness();
    assert.equal(externalValidationReadinessPayload.status, "not_ready");
    assert.equal(externalValidationReadinessPayload.writes, false);
    assert.equal(externalValidationReadinessPayload.sourceQaReady, false);
    assert.equal(externalValidationReadinessPayload.externalEvidenceReady, false);
    assert.equal(externalValidationReadinessPayload.evidenceCount, 0);
    assert.equal(externalValidationReadinessPayload.requiredEvidenceCount, expectedExternalValidationReadiness.requiredEvidenceCount);
    assert.deepEqual(externalValidationReadinessPayload.missingEvidenceRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(externalValidationReadinessPayload.clearableExternalRequirementIds, []);
    assert.deepEqual(externalValidationReadinessPayload.blockedExternalRequirementIds, expectedExternalPendingRequirementIds);
    assert.equal(externalValidationReadinessPayload.closureGateBlockers.includes("source_qa_review"), true);

    const externalValidationApprovalRequest = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-approval-request" });
    assert.equal(externalValidationApprovalRequest.statusCode, 200);
    const externalValidationApprovalRequestPayload = externalValidationApprovalRequest.json() as { status: string; approvalRequired: boolean; approved: boolean; readinessStatus: string; writes: boolean; requirementIds: string[]; validationDomains: string[]; prohibitedActions: string[] };
    const expectedExternalValidationApprovalRequest = buildRemoteExternalValidationApprovalRequest();
    assert.equal(externalValidationApprovalRequestPayload.status, "approval_required");
    assert.equal(externalValidationApprovalRequestPayload.approvalRequired, true);
    assert.equal(externalValidationApprovalRequestPayload.approved, false);
    assert.equal(externalValidationApprovalRequestPayload.readinessStatus, expectedExternalValidationApprovalRequest.readinessStatus);
    assert.equal(externalValidationApprovalRequestPayload.writes, false);
    assert.deepEqual(externalValidationApprovalRequestPayload.requirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(externalValidationApprovalRequestPayload.validationDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
    assert.equal(externalValidationApprovalRequestPayload.prohibitedActions.some((entry) => entry.includes("plaintext secrets")), true);

    const externalValidationReport = await built.app.inject({ method: "GET", url: "/v1/remote/external-validation-report" });
    assert.equal(externalValidationReport.statusCode, 200);
    const externalValidationReportPayload = externalValidationReport.json() as { status: string; writes: boolean; requirementCount: number; evidenceCount: number; clearableRequirementIds: string[]; blockedRequirementIds: string[]; invalidEvidenceRequirementIds: string[]; duplicateEvidenceRequirementIds: string[]; items: Array<{ requirementId: string; clearable: boolean; status: string; writes: boolean; missingArtifacts: string[]; approvedRunRefPresent: boolean }> };
    const expectedExternalValidationReport = buildRemoteExternalValidationReport();
    assert.equal(externalValidationReportPayload.status, "external_pending");
    assert.equal(externalValidationReportPayload.writes, false);
    assert.equal(externalValidationReportPayload.requirementCount, expectedExternalPending.requirements.length);
    assert.equal(externalValidationReportPayload.evidenceCount, 0);
    assert.deepEqual(externalValidationReportPayload.clearableRequirementIds, []);
    assert.deepEqual(externalValidationReportPayload.blockedRequirementIds, expectedExternalValidationReport.blockedRequirementIds);
    assert.deepEqual(externalValidationReportPayload.invalidEvidenceRequirementIds, []);
    assert.deepEqual(externalValidationReportPayload.duplicateEvidenceRequirementIds, []);
    assert.equal(externalValidationReportPayload.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.missingArtifacts.includes("RemoteTransportHandshakeReceipt")), true);
    assert.equal(externalValidationReportPayload.items.every((entry) => !entry.clearable && entry.status === "external_pending" && !entry.approvedRunRefPresent && !entry.writes), true);

    const externalValidationArtifact = JSON.parse(fs.readFileSync(path.resolve("docs/remote-gateway-sync-external-validation-evidence.json"), "utf8")) as { evidence: unknown[] };
    const artifactExternalValidationReport = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-report",
      headers: { "content-type": "application/json" },
      payload: externalValidationArtifact,
    });
    assert.equal(artifactExternalValidationReport.statusCode, 200);
    const artifactExternalValidationReportPayload = artifactExternalValidationReport.json() as { status: string; writes: boolean; evidenceCount: number; clearableRequirementIds: string[]; blockedRequirementIds: string[]; invalidEvidenceRequirementIds: string[]; duplicateEvidenceRequirementIds: string[] };
    assert.equal(artifactExternalValidationReportPayload.status, "external_pending");
    assert.equal(artifactExternalValidationReportPayload.writes, false);
    assert.equal(artifactExternalValidationReportPayload.evidenceCount, expectedExternalPending.requirements.length);
    assert.deepEqual(artifactExternalValidationReportPayload.clearableRequirementIds, []);
    assert.deepEqual(artifactExternalValidationReportPayload.blockedRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(artifactExternalValidationReportPayload.invalidEvidenceRequirementIds, []);
    assert.deepEqual(artifactExternalValidationReportPayload.duplicateEvidenceRequirementIds, []);

    const completeEvidence = expectedExternalValidationChecklist.items.map((entry) => ({
      schemaVersion: 1,
      requirementId: entry.requirementId,
      approvedRun: true,
      approvedRunRef: `approval://${entry.requirementId}`,
      physicalEvidenceRef: `evidence://${entry.requirementId}`,
      artifactRefs: entry.requiredArtifacts,
      acceptedCriteria: entry.acceptanceCriteria,
      plaintextMaterialIncluded: false,
      executedAt: "2026-05-17T10:13:24.000Z",
      writes: false,
    }));
    const completeExternalValidationReport = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-report",
      headers: { "content-type": "application/json" },
      payload: { evidence: completeEvidence },
    });
    assert.equal(completeExternalValidationReport.statusCode, 200);
    const completeExternalValidationReportPayload = completeExternalValidationReport.json() as { status: string; writes: boolean; clearableRequirementIds: string[]; blockedRequirementIds: string[]; invalidEvidenceRequirementIds: string[]; duplicateEvidenceRequirementIds: string[]; items: Array<{ clearable: boolean; writes: boolean; approvedRunRefPresent: boolean }> };
    assert.equal(completeExternalValidationReportPayload.status, "clearable");
    assert.equal(completeExternalValidationReportPayload.writes, false);
    assert.deepEqual(completeExternalValidationReportPayload.clearableRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(completeExternalValidationReportPayload.blockedRequirementIds, []);
    assert.deepEqual(completeExternalValidationReportPayload.invalidEvidenceRequirementIds, []);
    assert.deepEqual(completeExternalValidationReportPayload.duplicateEvidenceRequirementIds, []);
    assert.equal(completeExternalValidationReportPayload.items.every((entry) => entry.clearable && entry.approvedRunRefPresent && !entry.writes), true);

    const invalidExternalValidationReport = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-report",
      headers: { "content-type": "application/json" },
      payload: {
        evidence: [
          ...completeEvidence,
          {
            schemaVersion: 1,
            requirementId: "unknown_external_requirement",
            approvedRun: true,
            approvedRunRef: "approval://unknown",
            physicalEvidenceRef: "evidence://unknown",
            artifactRefs: ["UnknownArtifact"],
            acceptedCriteria: ["unknown criterion"],
            plaintextMaterialIncluded: false,
            executedAt: "2026-05-17T10:13:24.000Z",
            writes: false,
          },
        ],
      },
    });
    assert.equal(invalidExternalValidationReport.statusCode, 200);
    const invalidExternalValidationReportPayload = invalidExternalValidationReport.json() as { status: string; invalidEvidenceRequirementIds: string[]; clearableRequirementIds: string[] };
    assert.equal(invalidExternalValidationReportPayload.status, "external_pending");
    assert.deepEqual(invalidExternalValidationReportPayload.invalidEvidenceRequirementIds, ["unknown_external_requirement"]);
    assert.deepEqual(invalidExternalValidationReportPayload.clearableRequirementIds, expectedExternalPendingRequirementIds);

    const sourceQaTemplate = await built.app.inject({ method: "GET", url: "/v1/remote/source-qa-template" });
    assert.equal(sourceQaTemplate.statusCode, 200);
    const sourceQaTemplatePayload = sourceQaTemplate.json() as { status: string; writes: boolean; sourceConversationId: string; sourcePlanId: string; requiredSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; reviewCount: number; submissionCommand: string; items: Array<{ qaId: string; decisionKey: string; reviewed: boolean; disposition: null; evidenceRefs: string[]; reviewedAt: null; writes: boolean }> };
    const expectedSourceQaTemplate = buildRemoteSourceQaReviewTemplate();
    assert.equal(sourceQaTemplatePayload.status, "incomplete");
    assert.equal(sourceQaTemplatePayload.writes, false);
    assert.equal(sourceQaTemplatePayload.sourceConversationId, expectedSourceQaTemplate.sourceConversationId);
    assert.equal(sourceQaTemplatePayload.sourcePlanId, expectedSourceQaTemplate.sourcePlanId);
    assert.deepEqual(sourceQaTemplatePayload.requiredSourceQaIds, expectedSourceQaTemplate.requiredSourceQaIds);
    assert.deepEqual(sourceQaTemplatePayload.externalPendingRequiredSourceQaIds, expectedSourceQaTemplate.externalPendingRequiredSourceQaIds);
    assert.equal(sourceQaTemplatePayload.reviewCount, 23);
    assert.equal(sourceQaTemplatePayload.items.every((entry) => !entry.reviewed && entry.disposition === null && entry.evidenceRefs.length === 0 && entry.reviewedAt === null && !entry.writes), true);
    assert.equal(sourceQaTemplatePayload.items.some((entry) => entry.qaId === "QA-023" && entry.decisionKey === "goal_closure_gate"), true);
    assert.equal(sourceQaTemplatePayload.submissionCommand.includes("claw remote closure-gate"), true);

    const scopedSourceQaTemplate = await built.app.inject({
      method: "POST",
      url: "/v1/remote/source-qa-template",
      headers: { "content-type": "application/json" },
      payload: { sourceQaIds: ["QA-001", "QA-023"] },
    });
    assert.equal(scopedSourceQaTemplate.statusCode, 200);
    const scopedSourceQaTemplatePayload = scopedSourceQaTemplate.json() as { reviewCount: number; externalPendingRequiredSourceQaIds: string[]; items: Array<{ qaId: string }> };
    assert.equal(scopedSourceQaTemplatePayload.reviewCount, 2);
    assert.deepEqual(scopedSourceQaTemplatePayload.externalPendingRequiredSourceQaIds, []);
    assert.deepEqual(scopedSourceQaTemplatePayload.items.map((entry) => entry.qaId), ["QA-001", "QA-023"]);

    const closureGate = await built.app.inject({ method: "GET", url: "/v1/remote/closure-gate" });
    assert.equal(closureGate.statusCode, 200);
    const closureGatePayload = closureGate.json() as { status: string; writes: boolean; requiredSourceQaIds: string[]; reviewedSourceQaIds: string[]; missingSourceQaIds: string[]; invalidSourceQaIds: string[]; duplicateSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; invalidExternalPendingDispositionQaIds: string[]; sourceQaReviewStatus: string; sourceQaReviewItems: unknown[]; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[] };
    const expectedClosureGate = buildRemoteGoalClosureGate();
    assert.equal(closureGatePayload.status, "blocked");
    assert.equal(closureGatePayload.writes, false);
    assert.deepEqual(closureGatePayload.requiredSourceQaIds, expectedClosureGate.requiredSourceQaIds);
    assert.deepEqual(closureGatePayload.reviewedSourceQaIds, []);
    assert.equal(closureGatePayload.missingSourceQaIds.length, 23);
    assert.deepEqual(closureGatePayload.invalidSourceQaIds, []);
    assert.deepEqual(closureGatePayload.duplicateSourceQaIds, []);
    assert.deepEqual(closureGatePayload.externalPendingRequiredSourceQaIds, expectedClosureGate.externalPendingRequiredSourceQaIds);
    assert.deepEqual(closureGatePayload.invalidExternalPendingDispositionQaIds, []);
    assert.equal(closureGatePayload.sourceQaReviewStatus, "incomplete");
    assert.equal(closureGatePayload.sourceQaReviewItems.length, 0);
    assert.deepEqual(closureGatePayload.blockedExternalRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(closureGatePayload.clearableExternalRequirementIds, []);
    assert.equal(closureGatePayload.blockers.includes("source_qa_review"), true);
    assert.equal(closureGatePayload.blockers.includes("external_validation"), true);

    const sourceQaReviewArtifact = JSON.parse(fs.readFileSync(path.resolve("docs/remote-gateway-sync-source-qa-review.json"), "utf8")) as { items: unknown[] };
    const reviewedPendingClosureGate = await built.app.inject({
      method: "POST",
      url: "/v1/remote/closure-gate",
      headers: { "content-type": "application/json" },
      payload: {
        ...sourceQaReviewArtifact,
        evidence: externalValidationArtifact.evidence,
      },
    });
    assert.equal(reviewedPendingClosureGate.statusCode, 200);
    const reviewedPendingClosureGatePayload = reviewedPendingClosureGate.json() as { status: string; writes: boolean; missingSourceQaIds: string[]; invalidSourceQaIds: string[]; duplicateSourceQaIds: string[]; invalidExternalPendingDispositionQaIds: string[]; sourceQaReviewStatus: string; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[] };
    assert.equal(reviewedPendingClosureGatePayload.status, "blocked");
    assert.equal(reviewedPendingClosureGatePayload.writes, false);
    assert.deepEqual(reviewedPendingClosureGatePayload.missingSourceQaIds, []);
    assert.deepEqual(reviewedPendingClosureGatePayload.invalidSourceQaIds, []);
    assert.deepEqual(reviewedPendingClosureGatePayload.duplicateSourceQaIds, []);
    assert.deepEqual(reviewedPendingClosureGatePayload.invalidExternalPendingDispositionQaIds, []);
    assert.equal(reviewedPendingClosureGatePayload.sourceQaReviewStatus, "complete");
    assert.deepEqual(reviewedPendingClosureGatePayload.blockedExternalRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(reviewedPendingClosureGatePayload.clearableExternalRequirementIds, []);
    assert.deepEqual(reviewedPendingClosureGatePayload.blockers, ["external_validation"]);

    const wrongSourceClosureGate = await built.app.inject({
      method: "POST",
      url: "/v1/remote/closure-gate",
      headers: { "content-type": "application/json" },
      payload: {
        ...sourceQaReviewArtifact,
        sourceConversationId: "wrong-source-conversation",
        evidence: externalValidationArtifact.evidence,
      },
    });
    assert.notEqual(wrongSourceClosureGate.statusCode, 200);

    const wrongSourceValidationReport = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-report",
      headers: { "content-type": "application/json" },
      payload: {
        ...externalValidationArtifact,
        sourcePlanId: "wrong-source-plan",
      },
    });
    assert.notEqual(wrongSourceValidationReport.statusCode, 200);

    const readyForApprovedRun = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-readiness",
      headers: { "content-type": "application/json" },
      payload: {
        ...sourceQaReviewArtifact,
        evidence: externalValidationArtifact.evidence,
      },
    });
    assert.equal(readyForApprovedRun.statusCode, 200);
    const readyForApprovedRunPayload = readyForApprovedRun.json() as { status: string; writes: boolean; sourceQaReady: boolean; externalEvidenceReady: boolean; sourceQaReviewStatus: string; evidenceCount: number; requiredEvidenceCount: number; missingEvidenceRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockedExternalRequirementIds: string[]; closureGateBlockers: string[]; nextAction: string };
    assert.equal(readyForApprovedRunPayload.status, "ready_for_approved_run");
    assert.equal(readyForApprovedRunPayload.writes, false);
    assert.equal(readyForApprovedRunPayload.sourceQaReady, true);
    assert.equal(readyForApprovedRunPayload.externalEvidenceReady, true);
    assert.equal(readyForApprovedRunPayload.sourceQaReviewStatus, "complete");
    assert.equal(readyForApprovedRunPayload.evidenceCount, expectedExternalPending.requirements.length);
    assert.equal(readyForApprovedRunPayload.requiredEvidenceCount, expectedExternalPending.requirements.length);
    assert.deepEqual(readyForApprovedRunPayload.missingEvidenceRequirementIds, []);
    assert.deepEqual(readyForApprovedRunPayload.clearableExternalRequirementIds, []);
    assert.deepEqual(readyForApprovedRunPayload.blockedExternalRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(readyForApprovedRunPayload.closureGateBlockers, ["external_validation"]);
    assert.equal(readyForApprovedRunPayload.nextAction.includes("approved physical/provider validation"), true);

    const approvalRequestReady = await built.app.inject({
      method: "POST",
      url: "/v1/remote/external-validation-approval-request",
      headers: { "content-type": "application/json" },
      payload: {
        ...sourceQaReviewArtifact,
        evidence: externalValidationArtifact.evidence,
      },
    });
    assert.equal(approvalRequestReady.statusCode, 200);
    const approvalRequestReadyPayload = approvalRequestReady.json() as { status: string; approvalRequired: boolean; approved: boolean; readinessStatus: string; requirementIds: string[]; requiredCommands: string[]; writes: boolean };
    assert.equal(approvalRequestReadyPayload.status, "approval_required");
    assert.equal(approvalRequestReadyPayload.approvalRequired, true);
    assert.equal(approvalRequestReadyPayload.approved, false);
    assert.equal(approvalRequestReadyPayload.readinessStatus, "ready_for_approved_run");
    assert.deepEqual(approvalRequestReadyPayload.requirementIds, expectedExternalPendingRequirementIds);
    assert.equal(approvalRequestReadyPayload.requiredCommands.some((entry) => entry.includes("validation-readiness")), true);
    assert.equal(approvalRequestReadyPayload.writes, false);

    const clearableClosureGate = await built.app.inject({
      method: "POST",
      url: "/v1/remote/closure-gate",
      headers: { "content-type": "application/json" },
      payload: {
        reviewedSourceQaIds: remoteGoalClosureRequiredSourceQaIds,
        evidence: completeEvidence,
      },
    });
    assert.equal(clearableClosureGate.statusCode, 200);
    const clearableClosureGatePayload = clearableClosureGate.json() as { status: string; writes: boolean; missingSourceQaIds: string[]; duplicateSourceQaIds: string[]; invalidExternalPendingDispositionQaIds: string[]; sourceQaReviewStatus: string; sourceQaReviewItems: unknown[]; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[] };
    assert.equal(clearableClosureGatePayload.status, "clearable");
    assert.equal(clearableClosureGatePayload.writes, false);
    assert.deepEqual(clearableClosureGatePayload.missingSourceQaIds, []);
    assert.deepEqual(clearableClosureGatePayload.duplicateSourceQaIds, []);
    assert.deepEqual(clearableClosureGatePayload.invalidExternalPendingDispositionQaIds, []);
    assert.equal(clearableClosureGatePayload.sourceQaReviewStatus, "complete");
    assert.equal(clearableClosureGatePayload.sourceQaReviewItems.length, 23);
    assert.deepEqual(clearableClosureGatePayload.blockedExternalRequirementIds, []);
    assert.deepEqual(clearableClosureGatePayload.clearableExternalRequirementIds, expectedExternalPendingRequirementIds);
    assert.deepEqual(clearableClosureGatePayload.blockers, []);

    const routeContracts = await built.app.inject({ method: "GET", url: "/v1/remote/route-contracts" });
    assert.equal(routeContracts.statusCode, 200);
    const routeContractsPayload = routeContracts.json() as { status: string; writes: boolean; missingRouteIds: string[]; contracts: Array<{ routeId: string; layer: string; localContractRefs: string[]; remoteEntryPoints: string[]; parityRequired: boolean; parallelApiAllowed: boolean; writes: boolean }> };
    const expectedRouteContracts = buildRemoteRouteContractCatalog({ registeredRouteIds: registeredRouteIds() });
    assert.equal(routeContractsPayload.status, "complete");
    assert.equal(routeContractsPayload.writes, false);
    assert.deepEqual(routeContractsPayload.missingRouteIds, []);
    assert.deepEqual(
      routeContractsPayload.contracts.map((entry) => entry.routeId),
      expectedRouteContracts.contracts.map((entry) => entry.routeId),
    );
    assert.deepEqual(routeContractsPayload.contracts.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
    assert.deepEqual(routeContractsPayload.contracts.map((entry) => entry.layer), expectedRouteContracts.contracts.map((entry) => entry.layer));
    assert.equal(routeContractsPayload.contracts.some((entry) => entry.routeId === "remote.searchGateway" && entry.localContractRefs.includes("claw search")), true);
    assert.equal(routeContractsPayload.contracts.some((entry) => entry.routeId === "gateway.multiTenantAgentService" && entry.remoteEntryPoints.includes("POST /v1/gateway/agent-service/evaluate")), true);
    assert.equal(routeContractsPayload.contracts.every((entry) => entry.parityRequired && !entry.parallelApiAllowed && entry.writes === false), true);

    const providerDeviceE2EPlan = await built.app.inject({ method: "GET", url: "/v1/remote/provider-device-e2e-plan" });
    assert.equal(providerDeviceE2EPlan.statusCode, 200);
    const providerDeviceE2EPlanPayload = providerDeviceE2EPlan.json() as { status: string; writes: boolean; requiredDomains: string[]; requiredTopologyTargets: string[]; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; validationSteps: Array<{ domain: string; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; requiredArtifacts: string[]; acceptanceCriteria: string[]; writes: boolean }>; noPlaintextSecrets: boolean; plaintextMaterialIncluded: boolean; hostedSelfHostedParityRequired: boolean };
    const expectedProviderDeviceE2EPlan = buildRemoteProviderDeviceE2EValidationPlan({ requiredRouteIds: remoteSyncRequiredRouteIds });
    assert.equal(providerDeviceE2EPlanPayload.status, "external_pending");
    assert.equal(providerDeviceE2EPlanPayload.writes, false);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredDomains, expectedProviderDeviceE2EPlan.requiredDomains);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredTopologyTargets, expectedProviderDeviceE2EPlan.requiredTopologyTargets);
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredRouteIds, expectedProviderDeviceE2EPlan.requiredRouteIds);
    assert.deepEqual(providerDeviceE2EPlanPayload.validationSteps.map((entry) => entry.requiredRouteIds), expectedProviderDeviceE2EPlan.validationSteps.map((entry) => entry.requiredRouteIds));
    assert.deepEqual(providerDeviceE2EPlanPayload.requiredExternalPendingIds, expectedProviderDeviceE2EPlan.requiredExternalPendingIds);
    assert.deepEqual(providerDeviceE2EPlanPayload.validationSteps.map((entry) => entry.domain), expectedProviderDeviceE2EPlan.requiredDomains);
    assert.equal(providerDeviceE2EPlanPayload.validationSteps.some((entry) => entry.domain === "secret_refs" && entry.requiredRouteIds.includes("remote.secretBrokeredOperation") && entry.requiredExternalPendingIds.includes("provider_secret_retrieval")), true);
    assert.equal(providerDeviceE2EPlanPayload.validationSteps.every((entry) => entry.requiredArtifacts.length > 0 && entry.acceptanceCriteria.length > 0 && !entry.writes), true);
    assert.equal(providerDeviceE2EPlanPayload.noPlaintextSecrets, true);
    assert.equal(providerDeviceE2EPlanPayload.plaintextMaterialIncluded, false);
    assert.equal(providerDeviceE2EPlanPayload.hostedSelfHostedParityRequired, true);

    const classifications = await built.app.inject({ method: "GET", url: "/v1/remote/classifications" });
    assert.equal(classifications.statusCode, 200);
    const classificationPayload = classifications.json() as { classifications: Array<{ id: string; relay: string }> };
    assert.equal(classificationPayload.classifications.length, 57);
    assert.deepEqual(
      classificationPayload.classifications.map((entry) => ({ id: entry.id, relay: entry.relay })),
      expectedRelayClassifications(),
    );
    assert.equal(classificationPayload.classifications.some((entry) => entry.relay === "pending" || entry.relay === "blocked"), false);
    assert.equal(classificationPayload.classifications.filter((entry) => entry.relay === "remote-safe").length, 19);

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

    const offlineCommand = await built.app.inject({ method: "GET", url: "/v1/remote/offline-command" });
    assert.equal(offlineCommand.statusCode, 200);
    const offlineCommandPayload = offlineCommand.json() as { routeId: string; status: string; reason: string; enqueued: boolean; retryable: boolean; writes: boolean };
    assert.equal(offlineCommandPayload.routeId, "remote.chatGateway");
    assert.equal(offlineCommandPayload.status, "failed_fast");
    assert.equal(offlineCommandPayload.reason, "connector_offline");
    assert.equal(offlineCommandPayload.enqueued, false);
    assert.equal(offlineCommandPayload.retryable, true);
    assert.equal(offlineCommandPayload.writes, false);

    const scopedOfflineCommand = await built.app.inject({
      method: "POST",
      url: "/v1/remote/offline-command",
      headers: { "content-type": "application/json" },
      payload: { routeId: "remote.searchGateway", reason: "transport_unavailable", actorId: "user.remote" },
    });
    assert.equal(scopedOfflineCommand.statusCode, 200);
    const scopedOfflineCommandPayload = scopedOfflineCommand.json() as { routeId: string; status: string; reason: string; enqueued: boolean; writes: boolean };
    assert.equal(scopedOfflineCommandPayload.routeId, "remote.searchGateway");
    assert.equal(scopedOfflineCommandPayload.status, "failed_fast");
    assert.equal(scopedOfflineCommandPayload.reason, "transport_unavailable");
    assert.equal(scopedOfflineCommandPayload.enqueued, false);
    assert.equal(scopedOfflineCommandPayload.writes, false);

    const syncDrivers = await built.app.inject({ method: "GET", url: "/v1/sync/drivers" });
    assert.equal(syncDrivers.statusCode, 200);
    const syncDriversPayload = syncDrivers.json() as { status: string; writes: boolean; driverCount: number; requiredDrivers: string[]; coveredDrivers: string[]; requiredRouteIds: string[]; missingDrivers: string[]; missingRouteIds: string[]; authorityModel: string; conflictDefault: string; physicalApplicationStatus: string; entries: Array<{ driver: string; routeId: string; lateralDomains: string[]; manifestBacked: boolean; changelogBacked: boolean; authorityScoped: boolean; partialResourceSupported: boolean; physicalDriverRequired: boolean; commands: string[]; writes: boolean }> };
    const expectedSyncDrivers = buildSyncDriverCatalog({ registeredRouteIds: registeredRouteIds() });
    assert.equal(syncDriversPayload.status, "complete");
    assert.equal(syncDriversPayload.writes, false);
    assert.equal(syncDriversPayload.driverCount, expectedSyncDrivers.driverCount);
    assert.deepEqual(syncDriversPayload.requiredDrivers, expectedSyncDrivers.requiredDrivers);
    assert.deepEqual(syncDriversPayload.coveredDrivers, expectedSyncDrivers.coveredDrivers);
    assert.deepEqual(syncDriversPayload.requiredRouteIds, expectedSyncDrivers.requiredRouteIds);
    assert.deepEqual(syncDriversPayload.missingDrivers, []);
    assert.deepEqual(syncDriversPayload.missingRouteIds, []);
    assert.equal(syncDriversPayload.authorityModel, "per_resource");
    assert.equal(syncDriversPayload.conflictDefault, "detect_and_elevate");
    assert.equal(syncDriversPayload.physicalApplicationStatus, "external_pending");
    assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.driver), expectedSyncDrivers.entries.map((entry) => entry.driver));
    assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.routeId), expectedSyncDrivers.entries.map((entry) => entry.routeId));
    assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.lateralDomains), expectedSyncDrivers.entries.map((entry) => entry.lateralDomains));
    assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.commands), expectedSyncDrivers.entries.map((entry) => entry.commands));
    assert.equal(syncDriversPayload.entries.some((entry) => entry.driver === "skills" && entry.routeId === "sync.skills" && entry.lateralDomains.includes("skills")), true);
    assert.equal(syncDriversPayload.entries.some((entry) => entry.driver === "memory_user_model" && entry.routeId === "sync.memoryUserModel" && entry.lateralDomains.includes("memory")), true);
    assert.equal(syncDriversPayload.entries.some((entry) => entry.driver === "drive_files" && entry.routeId === "sync.driveFiles" && entry.lateralDomains.includes("drive")), true);
    assert.equal(syncDriversPayload.entries.some((entry) => entry.driver === "sqlite_partial" && entry.partialResourceSupported), true);
    assert.equal(syncDriversPayload.entries.every((entry) => entry.manifestBacked && entry.changelogBacked && entry.authorityScoped && entry.physicalDriverRequired && !entry.writes), true);
    assert.equal(syncDriversPayload.entries.every((entry) => entry.commands.some((command) => command.includes("claw sync apply"))), true);

    const compatibilityAdapters = await built.app.inject({ method: "GET", url: "/v1/remote/compatibility/adapters" });
    assert.equal(compatibilityAdapters.statusCode, 200);
    const compatibilityAdaptersPayload = compatibilityAdapters.json() as { adapters: Array<{ legacySurface: string; canonicalRouteId: string; clientKind: string; mapsToCanonical: boolean; parallelApiIntroduced: boolean; writes: boolean }>; writes: boolean };
    assert.deepEqual(
      compatibilityAdaptersPayload.adapters.map((entry) => ({ legacySurface: entry.legacySurface, canonicalRouteId: entry.canonicalRouteId, clientKind: entry.clientKind })),
      expectedCompatibilityAdapters,
    );
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

    const regulatedShare = await built.app.inject({
      method: "POST",
      url: "/v1/mesh/shares",
      headers: { "content-type": "application/json" },
      payload: {
        issuerMeshId: "mesh.home",
        coordinatorNodeId: "node.mac",
        recipientMeshId: "mesh.server",
        resourceId: "health:patient:123",
        kind: "patient",
        driver: "sqlite_tables",
        actions: ["execute"],
        allowedActions: ["read", "sync", "execute"],
      },
    });
    assert.equal(regulatedShare.statusCode, 500);
    assert.equal(regulatedShare.body.includes("Regulated remote shares require explicit review"), true);

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
