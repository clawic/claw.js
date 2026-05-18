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
  assert.equal(recordkeeping.requiresProfessionalReview, true);
  assert.deepEqual(recordkeeping.denialCodes, []);

  const finalDecision = evaluateRegulatedAction({
    regulatedDomain: "finance",
    decisionEffect: "final_decision",
    requestedUse: "investment_or_credit_decision",
  });
  assert.equal(finalDecision.allowed, false);
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
  assert.deepEqual(decision.denialCodes.sort(), [
    "external_review_required",
    "remote_or_provider_opt_in_required",
    "sensitive_export_review_required",
  ]);
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
