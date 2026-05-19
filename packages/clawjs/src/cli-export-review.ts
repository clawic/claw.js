import fs from "fs";

import {
  evaluateRegulatedAction,
  type RegulatedActionDecision,
  type RegulatedDecisionEffect,
  type RegulatedDomain,
} from "@clawjs/core";

import { CliHandledError, CLI_EXIT_FAILURE } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";

export interface CliExportReview {
  confirmed: true;
  approvalId: string;
  legalLabel: string;
  policy: RegulatedActionDecision;
}

export function requireCliExportReview(input: {
  argv: string[];
  flags: Record<string, string>;
  operation: string;
  regulatedDomain?: RegulatedDomain;
  decisionEffect?: RegulatedDecisionEffect;
}): CliExportReview {
  const confirmed = readBooleanFlag(input.argv, input.flags, "confirm", false) ||
    readBooleanFlag(input.argv, input.flags, "approved", false);
  const approvalId = (input.flags["approval-id"] ?? input.flags["host-approval-id"] ?? "").trim();
  const legalLabel = (input.flags["legal-label"] ?? "").trim();
  const policy = evaluateRegulatedAction({
    regulatedDomain: input.regulatedDomain ?? "identity",
    decisionEffect: input.decisionEffect ?? "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: true,
    policyConfig: {
      confirmed,
      approvalId,
      legalLabel,
      materialConsent: confirmed,
      destinationAuthorized: confirmed,
    },
  });
  if (policy.policyDecision === "block") {
    throw new CliHandledError(
      "export_policy_blocked",
      `${input.operation} is blocked by regulated safety policy: ${policy.reasonCodes.join(", ") || "blocked"}.`,
      CLI_EXIT_FAILURE,
    );
  }
  if (!policy.allowed && !confirmed) {
    throw new CliHandledError(
      "export_confirmation_required",
      `${input.operation} requires --confirm before exporting or sharing data.`,
      CLI_EXIT_FAILURE,
    );
  }
  if (!policy.allowed && !approvalId) {
    throw new CliHandledError(
      "export_approval_required",
      `${input.operation} requires --approval-id or --host-approval-id from explicit human review.`,
      CLI_EXIT_FAILURE,
    );
  }
  if (!policy.allowed && !legalLabel) {
    throw new CliHandledError(
      "export_legal_label_required",
      `${input.operation} requires --legal-label so the exported output keeps its review label.`,
      CLI_EXIT_FAILURE,
    );
  }
  if (!policy.allowed) {
    throw new CliHandledError(
      "export_policy_confirmation_required",
      `${input.operation} requires policy confirmation: ${policy.requirements.join(", ")}.`,
      CLI_EXIT_FAILURE,
    );
  }
  return { confirmed: true, approvalId, legalLabel, policy };
}

export function writeCliLegalSidecar(input: {
  outputPath: string;
  review: CliExportReview;
  kind: string;
  source: Record<string, unknown>;
}): void {
  fs.writeFileSync(`${input.outputPath}.claw-legal.json`, JSON.stringify({
    schemaVersion: 1,
    kind: input.kind,
    exportedAt: new Date().toISOString(),
    approvalId: input.review.approvalId,
    legalLabel: input.review.legalLabel,
    confirmed: input.review.confirmed,
    policy: {
      decision: input.review.policy.policyDecision,
      reasonCodes: input.review.policy.reasonCodes,
      requirements: input.review.policy.requirements,
      outputLabels: input.review.policy.outputLabels,
      disclaimerPolicy: input.review.policy.disclaimerPolicy,
      auditPolicy: input.review.policy.auditPolicy,
      policyApplied: input.review.policy.policyApplied,
    },
    source: input.source,
  }, null, 2));
}
