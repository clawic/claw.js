import assert from "node:assert/strict";
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
  assert.equal(doctorPacket?.status, "blocked_until_upstream_contract");
  assert.equal(sandboxPacket?.status, "blocked_until_upstream_contract");
  assert.equal(doctorPacket?.doNotRunWithoutApproval, true);
  assert.equal(sandboxPacket?.doNotRunWithoutApproval, true);
  assert.equal(doctorPacket?.claimBlockedUntil, "approval_gate_fixture_and_redacted_receipt_attached");
  assert.equal(sandboxPacket?.claimBlockedUntil, "approval_gate_fixture_and_redacted_receipt_attached");

  const closure = payload.data?.closureChecklist ?? [];
  assert.equal(closure.find((item) => item.domain === "doctorCompat")?.closureStatus, "product_blocked");
  assert.equal(closure.find((item) => item.domain === "sandboxPermissions")?.closureStatus, "product_blocked");
});
