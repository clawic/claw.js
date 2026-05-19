import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assertRegulatedDomainSafetyComplete,
  createConnectorCapability,
  createRegulatedOutputLabels,
  evaluateRegulatedAction,
  getRegulatedDomainPolicy,
  regulatedDomainSafetyPolicies,
  regulatedDomains,
  type AgentAccessRequest,
} from "./index.ts";

test("regulated domain safety has complete first-wave coverage", () => {
  assert.doesNotThrow(() => assertRegulatedDomainSafetyComplete());
  assert.deepEqual(
    regulatedDomainSafetyPolicies.map((entry) => entry.regulatedDomain).sort(),
    [...regulatedDomains].sort(),
  );

  for (const domain of regulatedDomains) {
    const policy = getRegulatedDomainPolicy(domain);
    assert.equal(policy.disclaimerPolicy, "contextual_remembered");
    assert.equal(policy.outputLabelPolicy, "required");
    assert.equal(policy.auditPolicy, "local_configurable_redacted");
    assert.equal(policy.professionalReviewRequired, true);
    assert.ok(policy.allowedUses.includes("local_recordkeeping"));
    assert.ok(policy.allowedUses.includes("non_final_draft"));
    assert.ok(policy.blockedUses.includes("diagnosis_or_treatment"));
    assert.ok(policy.prohibitedPractices.includes("social_scoring"));
  }
});

test("regulated domain safety permits recordkeeping but blocks final regulated decisions", () => {
  const recordkeeping = evaluateRegulatedAction({
    regulatedDomain: "health",
    decisionEffect: "recordkeeping",
    requestedUse: "local_recordkeeping",
  });
  assert.equal(recordkeeping.allowed, true);
  assert.equal(recordkeeping.policyDecision, "allow");
  assert.equal(recordkeeping.requiresProfessionalReview, true);
  assert.deepEqual(recordkeeping.denialCodes, []);
  assert.ok(recordkeeping.requirements.includes("output_label"));
  assert.equal(recordkeeping.policyApplied.mode, "normal");

  const finalDecision = evaluateRegulatedAction({
    regulatedDomain: "finance",
    decisionEffect: "final_decision",
    requestedUse: "investment_or_credit_decision",
  });
  assert.equal(finalDecision.allowed, false);
  assert.equal(finalDecision.policyDecision, "block");
  assert.deepEqual(finalDecision.denialCodes.sort(), ["blocked_regulated_use", "final_decision_blocked"]);
  assert.ok(finalDecision.outputLabels.includes("not_professional_advice"));
  assert.ok(finalDecision.outputLabels.includes("regulated_domain:finance"));
});

test("regulated domain safety requires explicit review for exports, external actions, and providers", () => {
  const decision = evaluateRegulatedAction({
    regulatedDomain: "legal",
    decisionEffect: "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: true,
    remoteOrProviderUse: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.policyDecision, "confirm");
  assert.deepEqual(decision.requirements.sort(), [
    "authorized_destination",
    "human_review",
    "local_audit",
    "material_consent",
    "output_label",
    "professional_review",
    "remote_or_provider_opt_in",
  ]);
  assert.deepEqual(decision.denialCodes.sort(), [
    "external_review_required",
    "remote_or_provider_opt_in_required",
    "sensitive_export_review_required",
  ]);
});

test("regulated domain safety allows confirmable actions when policy config satisfies review", () => {
  const decision = evaluateRegulatedAction({
    regulatedDomain: "legal",
    decisionEffect: "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: true,
    remoteOrProviderUse: true,
    policyConfig: {
      mode: "authorized_automation",
      confirmed: true,
      approvalId: "approval_legal_export",
      legalLabel: "Legal draft export - human reviewed",
      materialConsent: true,
      destinationAuthorized: true,
      automationAuthorized: true,
      outputLabelsSatisfied: true,
    },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.policyDecision, "allow");
  assert.deepEqual(decision.denialCodes.sort(), [
    "external_review_required",
    "remote_or_provider_opt_in_required",
    "sensitive_export_review_required",
  ]);
  assert.equal(decision.policyApplied.mode, "authorized_automation");
  assert.equal(decision.policyApplied.materialConsent, true);
  assert.equal(decision.policyApplied.destinationAuthorized, true);
  assert.equal(decision.policyApplied.outputLabelsSatisfied, true);
});

test("regulated domain safety does not require per-surface legal labels for authorized automation", () => {
  const decision = evaluateRegulatedAction({
    regulatedDomain: "identity",
    decisionEffect: "external_action",
    requestedUse: "human_or_professional_review_preparation",
    externalAction: true,
    policyConfig: {
      mode: "authorized_automation",
      automationAuthorized: true,
      outputLabelsSatisfied: true,
      destinationAuthorized: true,
      materialConsent: true,
    },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.policyDecision, "allow");
  assert.equal(decision.policyApplied.automationAuthorized, true);
  assert.equal(decision.policyApplied.outputLabelsSatisfied, true);
});

test("regulated domain safety supports log-only decisions for configured audit-only safe actions", () => {
  const decision = evaluateRegulatedAction({
    regulatedDomain: "education",
    decisionEffect: "summary",
    requestedUse: "factual_summary",
    policyConfig: {
      auditOnly: true,
    },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.policyDecision, "log-only");
  assert.deepEqual(decision.denialCodes, []);
  assert.ok(decision.requirements.includes("local_audit"));
});

test("regulated domain labels persist domain and decision effect", () => {
  assert.deepEqual(createRegulatedOutputLabels({
    regulatedDomain: "mental_health",
    decisionEffect: "summary",
  }), [
    "draft",
    "not_professional_advice",
    "human_review_required",
    "sources_and_gaps_required",
    "regulated_domain:mental_health",
    "decision_effect:summary",
  ]);
});

test("agent and connector declarations can carry regulated safety metadata", () => {
  const request: AgentAccessRequest = {
    resourceType: "health-record",
    action: "read",
    regulatedSafety: {
      regulatedDomains: ["health"],
      sensitiveDataClasses: ["health_record"],
      decisionEffect: "summary",
      professionalReviewRequired: true,
      outputLabelsRequired: true,
    },
  };
  assert.deepEqual(request.regulatedSafety?.regulatedDomains, ["health"]);

  const capability = createConnectorCapability("health.export.records", {
    summary: "Export health records",
    riskTiers: ["read"],
    regulatedDomains: ["health"],
    sensitiveDataClasses: ["health_record"],
    decisionEffects: ["external_action"],
    requiresProfessionalReview: true,
    requiresSensitiveExportReview: true,
    thirdPartyDisclosure: true,
  });
  assert.equal(capability.requiresSensitiveExportReview, true);
  assert.deepEqual(capability.regulatedDomains, ["health"]);
});
