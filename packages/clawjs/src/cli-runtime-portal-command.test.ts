import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("runtime domain requires an explicit manifest domain in JSON mode", async () => {
  const result = await runCliCapture(["runtime", "codex", "domain", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error?: { code?: string; status?: string };
    meta?: { canonicalCommand?: string; operation?: string; runtimeId?: string };
  };

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, "missing_runtime_domain");
  assert.equal(payload.error?.status, "USAGE");
  assert.equal(payload.meta?.canonicalCommand, "runtime");
  assert.equal(payload.meta?.operation, "domain");
  assert.equal(payload.meta?.runtimeId, "codex");
});

test("runtime session metadata omits gateway credentials in JSON mode", async () => {
  const result = await runCliCapture([
    "runtime",
    "hermes",
    "session",
    "--gateway-url",
    "http://127.0.0.1:18181",
    "--gateway-token",
    "secret-runtime-token-12345678",
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      session?: {
        gateway?: { token?: string; headers?: Record<string, string> };
        fallbackGateway?: { token?: string; headers?: Record<string, string> };
      };
    };
  };

  assert.equal(result.code, 0);
  assert.equal(result.stdout.includes("secret-runtime-token-12345678"), false);
  assert.equal(payload.data?.session?.gateway?.token, undefined);
  assert.equal(payload.data?.session?.gateway?.headers, undefined);
  assert.equal(payload.data?.session?.fallbackGateway?.token, undefined);
  assert.equal(payload.data?.session?.fallbackGateway?.headers, undefined);
});

test("runtime session usage errors preserve JSON envelopes", async () => {
  const missingKey = await runCliCapture(["runtime", "openclaw", "sessions", "preview", "--json"], process.cwd());
  const missingKeyPayload = JSON.parse(missingKey.stdout) as {
    ok: boolean;
    error?: { code?: string; status?: string };
    meta?: { canonicalCommand?: string; operation?: string; runtimeId?: string; action?: string };
  };

  assert.equal(missingKey.code, CLI_EXIT_USAGE);
  assert.equal(missingKeyPayload.ok, false);
  assert.equal(missingKeyPayload.error?.code, "missing_runtime_session_key");
  assert.equal(missingKeyPayload.error?.status, "USAGE");
  assert.equal(missingKeyPayload.meta?.canonicalCommand, "runtime");
  assert.equal(missingKeyPayload.meta?.operation, "sessions");
  assert.equal(missingKeyPayload.meta?.runtimeId, "openclaw");
  assert.equal(missingKeyPayload.meta?.action, "preview");

  const missingMessage = await runCliCapture(["runtime", "openclaw", "sessions", "send", "--session-key", "alpha", "--json"], process.cwd());
  const missingMessagePayload = JSON.parse(missingMessage.stdout) as {
    ok: boolean;
    error?: { code?: string; status?: string };
    meta?: { operation?: string; runtimeId?: string; action?: string };
  };

  assert.equal(missingMessage.code, CLI_EXIT_USAGE);
  assert.equal(missingMessagePayload.ok, false);
  assert.equal(missingMessagePayload.error?.code, "missing_runtime_session_message");
  assert.equal(missingMessagePayload.error?.status, "USAGE");
  assert.equal(missingMessagePayload.meta?.operation, "sessions");
  assert.equal(missingMessagePayload.meta?.runtimeId, "openclaw");
  assert.equal(missingMessagePayload.meta?.action, "send");

  const unknownAction = await runCliCapture(["runtime", "hermes", "sessions", "teleport", "--json"], process.cwd());
  const unknownActionPayload = JSON.parse(unknownAction.stdout) as {
    ok: boolean;
    error?: { code?: string; status?: string };
    meta?: { operation?: string; runtimeId?: string; action?: string };
  };

  assert.equal(unknownAction.code, CLI_EXIT_USAGE);
  assert.equal(unknownActionPayload.ok, false);
  assert.equal(unknownActionPayload.error?.code, "unknown_runtime_session_action");
  assert.equal(unknownActionPayload.error?.status, "USAGE");
  assert.equal(unknownActionPayload.meta?.operation, "sessions");
  assert.equal(unknownActionPayload.meta?.runtimeId, "hermes");
  assert.equal(unknownActionPayload.meta?.action, "teleport");
});

test("Hermes support audit keeps repair and permission policies behind approval-gate evidence", async () => {
  const result = await runCliCapture(["runtime", "hermes", "support", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      evidenceRequirements?: Array<{
        id?: string;
        blockerClass?: string;
        approvalRequired?: boolean;
        exactCommand?: string;
        supportResolution?: string;
        doNotRunWithoutApproval?: boolean;
        expectedRedactedEvidence?: string[];
      }>;
      evidenceReentryPackets?: Array<{
        requirementId?: string;
        status?: string;
        exactCommand?: string;
        doNotRunWithoutApproval?: boolean;
        claimBlockedUntil?: string;
      }>;
      closureChecklist?: Array<{
        domain?: string;
        closureStatus?: string;
        evidenceRequirementIds?: string[];
      }>;
      domains?: Array<{
        domain?: string;
        writeBackAllowed?: boolean;
        writeBackApprovalGated?: boolean;
        implementedFacets?: string[];
        blockingFacets?: string[];
      }>;
    };
  };

  assert.equal(result.code, 2);
  const requirements = payload.data?.evidenceRequirements ?? [];
  const doctor = requirements.find((requirement) => requirement.id === "hermes.doctorCompat.approval_gate_evidence");
  const sandbox = requirements.find((requirement) => requirement.id === "hermes.sandboxPermissions.approval_gate_evidence");
  for (const requirement of [doctor, sandbox]) {
    assert.equal(requirement?.blockerClass, "direct_blocker");
    assert.equal(requirement?.approvalRequired, true);
    assert.equal(requirement?.supportResolution, "explicitly_product_blocked_not_a_silent_gap");
    assert.equal(requirement?.doNotRunWithoutApproval, true);
    assert.equal(requirement?.expectedRedactedEvidence?.includes("approval_gate_fixture_receipt"), true);
  }
  assert.equal(doctor?.exactCommand, "claw runtime hermes domain doctorCompat --json");
  assert.equal(sandbox?.exactCommand, "claw runtime hermes domain sandboxPermissions --json");

  const packets = payload.data?.evidenceReentryPackets ?? [];
  const doctorPacket = packets.find((packet) => packet.requirementId === "hermes.doctorCompat.approval_gate_evidence");
  const sandboxPacket = packets.find((packet) => packet.requirementId === "hermes.sandboxPermissions.approval_gate_evidence");
  assert.equal(doctorPacket?.status, "blocked_until_approval_gate_fixture");
  assert.equal(sandboxPacket?.status, "blocked_until_approval_gate_fixture");
  assert.equal(doctorPacket?.doNotRunWithoutApproval, true);
  assert.equal(sandboxPacket?.doNotRunWithoutApproval, true);
  assert.equal(doctorPacket?.claimBlockedUntil, "approval_gate_fixture_and_redacted_receipt_attached");
  assert.equal(sandboxPacket?.claimBlockedUntil, "approval_gate_fixture_and_redacted_receipt_attached");

  const domains = payload.data?.domains ?? [];
  const doctorDomain = domains.find((domain) => domain.domain === "doctorCompat");
  const sandboxDomain = domains.find((domain) => domain.domain === "sandboxPermissions");
  for (const domain of [doctorDomain, sandboxDomain]) {
    assert.equal(domain?.writeBackAllowed, false);
    assert.equal(domain?.writeBackApprovalGated, true);
    assert.equal(domain?.implementedFacets?.includes("runtime_write_policy_allowed"), false);
    assert.equal(domain?.blockingFacets?.includes("approval_gate_contract"), true);
  }

  const closure = payload.data?.closureChecklist ?? [];
  assert.equal(closure.find((item) => item.domain === "doctorCompat")?.closureStatus, "product_blocked");
  assert.equal(closure.find((item) => item.domain === "sandboxPermissions")?.closureStatus, "product_blocked");
});

test("Hermes approval-gate fixtures attach redacted receipts without runtime mutation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-approval-gate-"));
  const fixturePath = path.join(tempDir, "approval-gate-fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: [
      {
        domain: "doctorCompat",
        receiptId: "fixture-doctor-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "denied_without_approval",
        command: "hermes doctor --fix --dry-run",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
      {
        domain: "sandboxPermissions",
        receiptId: "fixture-sandbox-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "dry_run_only",
        command: "hermes security audit --dry-run",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
    ],
  }));

  const result = await runCliCapture([
    "runtime",
    "hermes",
    "support",
    "--approval-gate-fixture",
    fixturePath,
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      evidenceRequirements?: Array<{ id?: string }>;
      evidenceReadinessSummary?: {
        approvalGateBlockedCount?: number;
        approvalGateRequirementIds?: string[];
        nextRequiredActions?: string[];
      };
      domains?: Array<{
        domain?: string;
        approvalGateFixtureStatus?: string;
        approvalGateFixtureReceipt?: { receiptId?: string; plaintextSecretLeak?: boolean; mutationWithoutApproval?: boolean };
        implementedFacets?: string[];
        blockingFacets?: string[];
      }>;
      closureChecklist?: Array<{ domain?: string; closureStatus?: string; implementedFacets?: string[]; blockingFacets?: string[] }>;
      finalPromotionReview?: { requiredForPromotion?: string[] };
      finalSupportClaimDecision?: { blockedPromotionClaims?: string[] };
      blockingReasons?: string[];
    };
  };

  assert.equal(result.code, 2);
  assert.equal(payload.data?.evidenceRequirements?.some((requirement) => requirement.id === "hermes.doctorCompat.approval_gate_evidence"), false);
  assert.equal(payload.data?.evidenceRequirements?.some((requirement) => requirement.id === "hermes.sandboxPermissions.approval_gate_evidence"), false);
  assert.equal(payload.data?.evidenceReadinessSummary?.approvalGateBlockedCount, 0);
  assert.deepEqual(payload.data?.evidenceReadinessSummary?.approvalGateRequirementIds, []);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("approval_gate_fixture_and_redacted_receipt"), false);
  assert.equal(payload.data?.finalPromotionReview?.requiredForPromotion?.includes("approval_gate_fixture_and_redacted_receipt"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("approval_gate_fixture"), false);
  assert.equal(payload.data?.blockingReasons?.includes("approval_gate_fixture_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("native_write_back_pending"), true);
  assert.equal(payload.data?.blockingReasons?.includes("production_transport_policy_pending"), true);

  const doctorDomain = payload.data?.domains?.find((domain) => domain.domain === "doctorCompat");
  const sandboxDomain = payload.data?.domains?.find((domain) => domain.domain === "sandboxPermissions");
  assert.equal(doctorDomain?.approvalGateFixtureStatus, "attached");
  assert.equal(sandboxDomain?.approvalGateFixtureStatus, "attached");
  assert.equal(doctorDomain?.approvalGateFixtureReceipt?.receiptId, "fixture-doctor-denial");
  assert.equal(sandboxDomain?.approvalGateFixtureReceipt?.receiptId, "fixture-sandbox-denial");
  assert.equal(doctorDomain?.approvalGateFixtureReceipt?.plaintextSecretLeak, false);
  assert.equal(sandboxDomain?.approvalGateFixtureReceipt?.mutationWithoutApproval, false);
  assert.equal(doctorDomain?.implementedFacets?.includes("approval_gate_fixture_receipt"), true);
  assert.equal(sandboxDomain?.blockingFacets?.includes("approval_gate_contract"), false);

  const doctorClosure = payload.data?.closureChecklist?.find((item) => item.domain === "doctorCompat");
  const sandboxClosure = payload.data?.closureChecklist?.find((item) => item.domain === "sandboxPermissions");
  assert.equal(doctorClosure?.closureStatus, "implemented_or_projected");
  assert.equal(sandboxClosure?.closureStatus, "implemented_or_projected");
  assert.equal(doctorClosure?.implementedFacets?.includes("approval_gate_fixture_receipt"), true);
  assert.equal(sandboxClosure?.blockingFacets?.includes("approval_gate_contract"), false);
});

test("Hermes live-evidence fixtures attach approved redacted receipts without external mutation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-live-evidence-"));
  const fixturePath = path.join(tempDir, "live-evidence-fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["channels", "providers", "auth", "models"].map((domain) => ({
      domain,
      receiptId: `fixture-${domain}-live-evidence`,
      receiptType: "external_live_evidence_receipt",
      status: "approved_redacted_live_evidence",
      command: `claw runtime hermes domain ${domain} --json`,
      approved: true,
      readOnly: true,
      redacted: true,
      mutationPerformed: false,
      plaintextSecretLeak: false,
      supportContractMatchesManifest: true,
    })),
  }));

  const result = await runCliCapture([
    "runtime",
    "hermes",
    "support",
    "--live-evidence-fixture",
    fixturePath,
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      evidenceRequirements?: Array<{ id?: string }>;
      evidenceReadinessSummary?: {
        approvalRequiredCount?: number;
        externalPendingCount?: number;
        externalPendingRequirementIds?: string[];
        nextRequiredActions?: string[];
      };
      domains?: Array<{
        domain?: string;
        liveEvidenceFixtureStatus?: string;
        liveEvidenceFixtureReceipt?: { receiptId?: string; plaintextSecretLeak?: boolean; mutationPerformed?: boolean };
        implementedFacets?: string[];
        blockingFacets?: string[];
      }>;
      closureChecklist?: Array<{ domain?: string; closureStatus?: string; implementedFacets?: string[]; blockingFacets?: string[] }>;
      finalPromotionReview?: { requiredForPromotion?: string[] };
      finalSupportClaimDecision?: { blockedPromotionClaims?: string[]; externalPendingCount?: number };
      blockingReasons?: string[];
    };
  };

  assert.equal(result.code, 2);
  for (const domain of ["channels", "providers", "auth", "models"]) {
    assert.equal(payload.data?.evidenceRequirements?.some((requirement) => requirement.id === `hermes.${domain}.live_evidence`), false);
    const auditDomain = payload.data?.domains?.find((entry) => entry.domain === domain);
    assert.equal(auditDomain?.liveEvidenceFixtureStatus, "attached");
    assert.equal(auditDomain?.liveEvidenceFixtureReceipt?.receiptId, `fixture-${domain}-live-evidence`);
    assert.equal(auditDomain?.liveEvidenceFixtureReceipt?.plaintextSecretLeak, false);
    assert.equal(auditDomain?.liveEvidenceFixtureReceipt?.mutationPerformed, false);
    assert.equal(auditDomain?.implementedFacets?.includes("approved_live_evidence_receipt"), true);
    assert.equal(auditDomain?.blockingFacets?.includes("approved_live_evidence"), false);
  }
  assert.equal(payload.data?.evidenceReadinessSummary?.approvalRequiredCount, 2);
  assert.equal(payload.data?.evidenceReadinessSummary?.externalPendingCount, 0);
  assert.deepEqual(payload.data?.evidenceReadinessSummary?.externalPendingRequirementIds, []);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("approved_redacted_live_evidence"), false);
  assert.equal(payload.data?.finalPromotionReview?.requiredForPromotion?.includes("approved_redacted_live_evidence"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("external_live_evidence"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.externalPendingCount, 0);
  assert.equal(payload.data?.blockingReasons?.includes("live_channel_evidence_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("live_provider_evidence_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("live_auth_evidence_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("live_model_evidence_pending"), false);

  const channelClosure = payload.data?.closureChecklist?.find((item) => item.domain === "channels");
  assert.equal(channelClosure?.closureStatus, "implemented_or_projected");
  assert.equal(channelClosure?.implementedFacets?.includes("approved_live_evidence_receipt"), true);
  assert.equal(channelClosure?.blockingFacets?.includes("approved_live_evidence"), false);
});

test("Hermes support audit discounts every locally verifiable fixture while preserving real blockers", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-local-parity-"));
  const hermesHome = path.join(tempDir, ".hermes");
  const hermesSessionDir = path.join(hermesHome, "sessions", "2026", "05", "26");
  fs.mkdirSync(hermesSessionDir, { recursive: true });
  fs.writeFileSync(path.join(hermesSessionDir, "runtime-session.jsonl"), [
    "{\"type\":\"metadata\",\"content\":\"hermes native preview\"}",
    "{\"role\":\"assistant\",\"content\":\"Hermes reply with api_key=TEST_SECRET_1234567890\"}",
    "{\"role\":\"user\",\"content\":\"follow up\"}",
    "",
  ].join("\n"));

  const fixturePath = path.join(tempDir, "approval-gate-fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: [
      {
        domain: "doctorCompat",
        receiptId: "fixture-doctor-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "denied_without_approval",
        command: "hermes doctor --fix --dry-run",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
      {
        domain: "sandboxPermissions",
        receiptId: "fixture-sandbox-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "dry_run_only",
        command: "hermes security audit --dry-run",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
    ],
  }));

  const result = await runCliCapture([
    "runtime",
    "hermes",
    "support",
    "--home-dir",
    hermesHome,
    "--gateway-url",
    "http://127.0.0.1:9",
    "--approval-gate-fixture",
    fixturePath,
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      supportComplete?: boolean;
      evidenceReadinessSummary?: {
        totalRequirementCount?: number;
        upstreamContractBlockedCount?: number;
        approvalGateBlockedCount?: number;
        tuiGatewayWrapperBlockedCount?: number;
        tuiGatewayFixtureBackedCount?: number;
        productionTransportBlockedCount?: number;
        writeBackContractBlockedCount?: number;
        nextRequiredActions?: string[];
        upstreamContractRequirementIds?: string[];
      };
      finalSupportClaimDecision?: {
        blockedPromotionClaims?: string[];
        promotionEvidenceRequired?: string[];
      };
      blockingReasons?: string[];
      closureChecklist?: Array<{
        domain?: string;
        closureStatus?: string;
        implementedFacets?: string[];
        blockingFacets?: string[];
      }>;
    };
  };

  assert.equal(result.code, 2);
  assert.equal(result.stdout.includes("TEST_SECRET_1234567890"), false);
  assert.equal(payload.data?.supportComplete, false);
  assert.equal(payload.data?.evidenceReadinessSummary?.totalRequirementCount, 20);
  assert.equal(payload.data?.evidenceReadinessSummary?.upstreamContractBlockedCount, 12);
  assert.equal(payload.data?.evidenceReadinessSummary?.approvalGateBlockedCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.tuiGatewayWrapperBlockedCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.tuiGatewayFixtureBackedCount, 4);
  assert.equal(payload.data?.evidenceReadinessSummary?.productionTransportBlockedCount, 4);
  assert.equal(payload.data?.evidenceReadinessSummary?.writeBackContractBlockedCount, 12);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("approval_gate_fixture_and_redacted_receipt"), false);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("tui_gateway_wrapper_fixture_and_round_trip_evidence"), false);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("approved_redacted_live_evidence"), true);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("production_transport_lifecycle_policy_and_native_round_trip_evidence"), true);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("official_runtime_write_back_contract_fixture"), true);
  assert.equal(payload.data?.evidenceReadinessSummary?.nextRequiredActions?.includes("official_runtime_native_contract_fixture"), true);
  for (const readAction of ["preview", "resolve", "history"]) {
    assert.equal(payload.data?.evidenceReadinessSummary?.upstreamContractRequirementIds?.includes(`hermes.sessions.${readAction}.action_contract`), false);
  }
  assert.deepEqual(payload.data?.evidenceReadinessSummary?.upstreamContractRequirementIds, [
    "hermes.sessions.write_back_contract",
    "hermes.skills.write_back_contract",
    "hermes.memory.write_back_contract",
    "hermes.providers.write_back_contract",
    "hermes.auth.write_back_contract",
    "hermes.models.write_back_contract",
    "hermes.scheduler.write_back_contract",
    "hermes.plugins.write_back_contract",
    "hermes.gateway.write_back_contract",
    "hermes.configuration.write_back_contract",
    "hermes.sessions.pin.native_write_back_contract",
    "hermes.sessions.unpin.native_write_back_contract",
  ]);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("approval_gate_fixture"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("tui_gateway_wrapper_fixture"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("write_back"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("production_transport_lifecycle"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("external_live_evidence"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.promotionEvidenceRequired?.includes("approval_gate_fixture_and_redacted_receipt"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.promotionEvidenceRequired?.includes("tui_gateway_wrapper_fixture_and_round_trip_evidence"), false);
  assert.equal(payload.data?.blockingReasons?.includes("approval_gate_fixture_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("tui_gateway_round_trip_evidence_pending"), false);
  assert.equal(payload.data?.blockingReasons?.includes("native_write_back_pending"), true);
  assert.equal(payload.data?.blockingReasons?.includes("production_transport_policy_pending"), true);

  const sessionClosure = payload.data?.closureChecklist?.find((item) => item.domain === "sessions");
  assert.equal(sessionClosure?.implementedFacets?.includes("session_preview_action"), true);
  assert.equal(sessionClosure?.implementedFacets?.includes("session_resolve_action"), true);
  assert.equal(sessionClosure?.implementedFacets?.includes("session_history_action"), true);
  assert.equal(sessionClosure?.blockingFacets?.includes("native_write_back_contract"), true);
  assert.equal(sessionClosure?.blockingFacets?.includes("native_action_contract"), true);
});

test("Hermes support audit removes external live blockers when every approved receipt is attached", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-complete-local-evidence-"));
  const approvalFixturePath = path.join(tempDir, "approval-gate-fixture.json");
  const liveFixturePath = path.join(tempDir, "live-evidence-fixture.json");
  fs.writeFileSync(approvalFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: [
      {
        domain: "doctorCompat",
        receiptId: "fixture-doctor-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "denied_without_approval",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
      {
        domain: "sandboxPermissions",
        receiptId: "fixture-sandbox-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "dry_run_only",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
    ],
  }));
  fs.writeFileSync(liveFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["channels", "providers", "auth", "models"].map((domain) => ({
      domain,
      receiptId: `fixture-${domain}-live-evidence`,
      receiptType: "external_live_evidence_receipt",
      status: "approved_redacted_live_evidence",
      command: `claw runtime hermes domain ${domain} --json`,
      approved: true,
      readOnly: true,
      redacted: true,
      mutationPerformed: false,
      plaintextSecretLeak: false,
      supportContractMatchesManifest: true,
    })),
  }));

  const result = await runCliCapture([
    "runtime",
    "hermes",
    "support",
    "--gateway-url",
    "http://127.0.0.1:9",
    "--approval-gate-fixture",
    approvalFixturePath,
    "--live-evidence-fixture",
    liveFixturePath,
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      evidenceReadinessSummary?: {
        totalRequirementCount?: number;
        approvalRequiredCount?: number;
        externalPendingCount?: number;
        upstreamContractBlockedCount?: number;
        approvalGateBlockedCount?: number;
        tuiGatewayWrapperBlockedCount?: number;
        tuiGatewayFixtureBackedCount?: number;
        productionTransportBlockedCount?: number;
        writeBackContractBlockedCount?: number;
        nextRequiredActions?: string[];
      };
      finalSupportClaimDecision?: {
        blockedPromotionClaims?: string[];
        promotionEvidenceRequired?: string[];
        externalPendingCount?: number;
      };
      blockingReasons?: string[];
    };
  };

  assert.equal(result.code, 2);
  assert.equal(payload.data?.evidenceReadinessSummary?.totalRequirementCount, 16);
  assert.equal(payload.data?.evidenceReadinessSummary?.approvalRequiredCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.externalPendingCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.upstreamContractBlockedCount, 12);
  assert.equal(payload.data?.evidenceReadinessSummary?.approvalGateBlockedCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.tuiGatewayWrapperBlockedCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.tuiGatewayFixtureBackedCount, 4);
  assert.equal(payload.data?.evidenceReadinessSummary?.productionTransportBlockedCount, 4);
  assert.equal(payload.data?.evidenceReadinessSummary?.writeBackContractBlockedCount, 12);
  assert.deepEqual(payload.data?.evidenceReadinessSummary?.nextRequiredActions, [
    "production_transport_lifecycle_policy_and_native_round_trip_evidence",
    "official_runtime_write_back_contract_fixture",
    "official_runtime_native_contract_fixture",
  ]);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("external_live_evidence"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("approval_gate_fixture"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("tui_gateway_wrapper_fixture"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("write_back"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("production_transport_lifecycle"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.promotionEvidenceRequired?.includes("approved_redacted_live_evidence"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.externalPendingCount, 0);
  assert.deepEqual(payload.data?.blockingReasons, [
    "native_write_back_pending",
    "production_transport_policy_pending",
  ]);
});

test("Hermes support audit keeps native pin blockers without an official pin contract", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-official-contract-evidence-"));
  const approvalFixturePath = path.join(tempDir, "approval-gate-fixture.json");
  const liveFixturePath = path.join(tempDir, "live-evidence-fixture.json");
  const productionTransportFixturePath = path.join(tempDir, "production-transport-fixture.json");
  const writeBackContractFixturePath = path.join(tempDir, "write-back-contract-fixture.json");
  const nativeContractFixturePath = path.join(tempDir, "native-contract-fixture.json");
  fs.writeFileSync(approvalFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: [
      {
        domain: "doctorCompat",
        receiptId: "fixture-doctor-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "denied_without_approval",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
      {
        domain: "sandboxPermissions",
        receiptId: "fixture-sandbox-denial",
        receiptType: "approval_gate_fixture_receipt",
        status: "dry_run_only",
        approved: false,
        redacted: true,
        mutationPerformed: false,
        mutationWithoutApproval: false,
        plaintextSecretLeak: false,
      },
    ],
  }));
  fs.writeFileSync(liveFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["channels", "providers", "auth", "models"].map((domain) => ({
      domain,
      receiptId: `fixture-${domain}-live-evidence`,
      receiptType: "external_live_evidence_receipt",
      status: "approved_redacted_live_evidence",
      command: `claw runtime hermes domain ${domain} --json`,
      approved: true,
      readOnly: true,
      redacted: true,
      mutationPerformed: false,
      plaintextSecretLeak: false,
      supportContractMatchesManifest: true,
    })),
  }));
  fs.writeFileSync(productionTransportFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["send", "inject", "abort", "create"].map((action) => ({
      domain: "sessions",
      action,
      receiptId: `fixture-${action}-production-transport`,
      receiptType: "production_transport_lifecycle_receipt",
      status: "production_transport_lifecycle_verified",
      officialTransportSurface: "api_server_http",
      approved: true,
      redacted: true,
      plaintextSecretLeak: false,
      lifecyclePolicyApproved: true,
      productionTransportLifecycleManaged: true,
      nonLoopbackEndpointApproved: true,
      nativeRoundTripVerified: true,
      capabilitiesEndpointVerified: true,
      runLifecycleEndpointsVerified: true,
      eventStreamVerified: true,
      approvalEndpointVerified: true,
      stopEndpointVerified: true,
      responsePersistenceVerified: true,
    })),
  }));
  fs.writeFileSync(writeBackContractFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["sessions", "skills", "memory", "providers", "auth", "models", "scheduler", "plugins", "gateway", "configuration"].map((domain) => ({
      domain,
      receiptId: `fixture-${domain}-write-back-contract`,
      receiptType: "official_runtime_write_back_contract_receipt",
      status: "official_write_back_contract_verified",
      approved: true,
      redacted: true,
      plaintextSecretLeak: false,
      officialContractKnown: true,
      nonDestructiveFixture: true,
      roundTripNativeVisibility: true,
      noSilentWriteBack: true,
      supportContractMatchesManifest: true,
    })),
  }));
  fs.writeFileSync(nativeContractFixturePath, JSON.stringify({
    schemaVersion: 1,
    runtimeId: "hermes",
    receipts: ["pin", "unpin"].map((action) => ({
      domain: "sessions",
      action,
      receiptId: `fixture-${action}-native-contract`,
      receiptType: "official_runtime_native_contract_receipt",
      status: "official_native_contract_verified",
      approved: true,
      redacted: true,
      plaintextSecretLeak: false,
      officialContractKnown: true,
      nonDestructiveFixture: true,
      roundTripNativeVisibility: true,
      writesRuntime: true,
    })),
  }));

  const result = await runCliCapture([
    "runtime",
    "hermes",
    "support",
    "--gateway-url",
    "http://127.0.0.1:9",
    "--approval-gate-fixture",
    approvalFixturePath,
    "--live-evidence-fixture",
    liveFixturePath,
    "--production-transport-fixture",
    productionTransportFixturePath,
    "--write-back-contract-fixture",
    writeBackContractFixturePath,
    "--native-contract-fixture",
    nativeContractFixturePath,
    "--json",
  ], process.cwd());
  const payload = JSON.parse(result.stdout) as {
    data?: {
      evidenceReadinessSummary?: {
        totalRequirementCount?: number;
        productionTransportBlockedCount?: number;
        writeBackContractBlockedCount?: number;
        productBlockedCount?: number;
        nextRequiredActions?: string[];
      };
      domains?: Array<{
        domain?: string;
        writeBackContractFixtureStatus?: string;
        writeBackContractFixtureReceipt?: { receiptId?: string; plaintextSecretLeak?: boolean };
        productionTransportReceipts?: Array<{
          action?: string;
          officialTransportSurface?: string;
          capabilitiesEndpointVerified?: boolean;
          runLifecycleEndpointsVerified?: boolean;
          eventStreamVerified?: boolean;
          approvalEndpointVerified?: boolean;
          stopEndpointVerified?: boolean;
          responsePersistenceVerified?: boolean;
          verifiedEndpoints?: string[];
        }>;
        implementedFacets?: string[];
      }>;
      finalSupportClaimDecision?: {
        status?: string;
        decision?: string;
        claimDisposition?: string;
        supportCompletionMode?: string | null;
        blockedPromotionClaims?: string[];
        productBlockedByDecisionCount?: number;
        promotionEvidenceRequired?: string[];
      };
      blockingReasons?: string[];
    };
  };

  assert.equal(result.code, 2);
  assert.equal(payload.data?.evidenceReadinessSummary?.totalRequirementCount, 2);
  assert.equal(payload.data?.evidenceReadinessSummary?.productionTransportBlockedCount, 0);
  assert.equal(payload.data?.evidenceReadinessSummary?.writeBackContractBlockedCount, 2);
  assert.equal(payload.data?.evidenceReadinessSummary?.productBlockedCount, 2);
  assert.deepEqual(payload.data?.evidenceReadinessSummary?.nextRequiredActions, [
    "official_runtime_write_back_contract_fixture",
    "official_runtime_native_contract_fixture",
  ]);
  const sessionsDomain = payload.data?.domains?.find((entry) => entry.domain === "sessions");
  assert.equal(sessionsDomain?.writeBackContractFixtureStatus, "attached");
  assert.equal(sessionsDomain?.writeBackContractFixtureReceipt?.receiptId, "fixture-sessions-write-back-contract");
  assert.equal(sessionsDomain?.writeBackContractFixtureReceipt?.plaintextSecretLeak, false);
  assert.equal(sessionsDomain?.implementedFacets?.includes("official_write_back_contract_receipt"), true);
  const sendTransportReceipt = sessionsDomain?.productionTransportReceipts?.find((entry) => entry.action === "send");
  assert.equal(sendTransportReceipt?.officialTransportSurface, "api_server_http");
  assert.equal(sendTransportReceipt?.capabilitiesEndpointVerified, true);
  assert.equal(sendTransportReceipt?.runLifecycleEndpointsVerified, true);
  assert.equal(sendTransportReceipt?.eventStreamVerified, true);
  assert.equal(sendTransportReceipt?.approvalEndpointVerified, true);
  assert.equal(sendTransportReceipt?.stopEndpointVerified, true);
  assert.equal(sendTransportReceipt?.responsePersistenceVerified, true);
  assert.equal(sendTransportReceipt?.verifiedEndpoints?.includes("POST /v1/runs"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("write_back"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("production_transport_lifecycle"), false);
  assert.equal(payload.data?.finalSupportClaimDecision?.blockedPromotionClaims?.includes("upstream_native_contracts"), true);
  assert.equal(payload.data?.finalSupportClaimDecision?.productBlockedByDecisionCount, 2);
  assert.equal(payload.data?.finalSupportClaimDecision?.status, "not_promoted");
  assert.equal(payload.data?.finalSupportClaimDecision?.decision, "keep_current_lowered_runtime_ecosystem_claim");
  assert.equal(payload.data?.finalSupportClaimDecision?.claimDisposition, "unpromoted_product_claim_lowered");
  assert.equal(payload.data?.finalSupportClaimDecision?.supportCompletionMode, "operable_non_default");
  assert.deepEqual(payload.data?.finalSupportClaimDecision?.promotionEvidenceRequired, [
    "keep_lowered_claim_until_upstream_native_contracts_exist",
    "ecosystem_production_claim",
    "ecosystem_recommended_claim",
  ]);
  assert.deepEqual(payload.data?.blockingReasons, [
    "native_write_back_pending",
  ]);
});
