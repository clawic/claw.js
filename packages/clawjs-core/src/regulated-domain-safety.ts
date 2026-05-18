export const regulatedDomainSafetyVersion = 1;

export const regulatedDomains = [
  "health",
  "mental_health",
  "reproductive_intimate",
  "pharma",
  "finance",
  "banking",
  "insurance",
  "legal",
  "hr_employment",
  "education",
  "government_public_services",
  "housing_real_estate",
  "compliance_grc",
  "identity",
  "security",
  "billing_payments",
  "labs_research",
  "iot_physical_actions",
  "vehicles_transport",
  "minors",
] as const;

export type RegulatedDomain = typeof regulatedDomains[number];

export const sensitiveDataClasses = [
  "health_record",
  "mental_health_record",
  "sexual_reproductive_record",
  "medication_or_pharma_record",
  "financial_record",
  "banking_record",
  "insurance_record",
  "legal_record",
  "employment_record",
  "education_record",
  "government_record",
  "housing_record",
  "identity_record",
  "security_record",
  "billing_or_payment_record",
  "research_or_lab_record",
  "minor_record",
  "third_party_sensitive_record",
] as const;

export type SensitiveDataClass = typeof sensitiveDataClasses[number];

export const regulatedDecisionEffects = [
  "none",
  "recordkeeping",
  "draft",
  "summary",
  "interpretation",
  "recommendation",
  "external_action",
  "final_decision",
] as const;

export type RegulatedDecisionEffect = typeof regulatedDecisionEffects[number];

export const allowedRegulatedUses = [
  "local_recordkeeping",
  "search",
  "extraction",
  "factual_summary",
  "questions_to_review",
  "gaps_and_provenance",
  "non_final_draft",
  "human_or_professional_review_preparation",
] as const;

export type AllowedRegulatedUse = typeof allowedRegulatedUses[number];

export const blockedRegulatedUses = [
  "diagnosis_or_treatment",
  "therapy_or_crisis_counseling",
  "legal_strategy_as_final_advice",
  "investment_or_credit_decision",
  "insurance_coverage_decision",
  "employment_decision",
  "education_admission_decision",
  "government_benefits_or_services_decision",
  "regulated_filing_or_submission",
  "emergency_handling",
  "autonomous_sensitive_external_action",
] as const;

export type BlockedRegulatedUse = typeof blockedRegulatedUses[number];

export const prohibitedRegulatedPractices = [
  "social_scoring",
  "harmful_manipulation_or_deception",
  "sensitive_biometric_or_emotion_inference",
  "criminal_risk_profiling",
  "credit_or_lending_decision",
  "employment_decision",
  "education_admission_decision",
  "insurance_coverage_decision",
  "legal_service_decision",
  "medical_diagnosis_or_treatment_decision",
  "emergency_handling",
  "autonomous_regulated_filing_or_submission",
] as const;

export type ProhibitedRegulatedPractice = typeof prohibitedRegulatedPractices[number];

export type SubjectKind = "self" | "third_party" | "professional_client" | "patient" | "employee" | "student" | "minor";
export type DisclaimerPolicy = "contextual_remembered" | "always_visible" | "first_use_only";
export type OutputLabelPolicy = "required" | "ui_only" | "on_demand";
export type AuditPolicy = "local_configurable_redacted" | "minimal" | "full";

export interface RegulatedDomainPolicy {
  regulatedDomain: RegulatedDomain;
  sensitiveDataClasses: SensitiveDataClass[];
  allowedUses: AllowedRegulatedUse[];
  blockedUses: BlockedRegulatedUse[];
  prohibitedPractices: ProhibitedRegulatedPractice[];
  professionalReviewRequired: boolean;
  disclaimerPolicy: DisclaimerPolicy;
  outputLabelPolicy: OutputLabelPolicy;
  auditPolicy: AuditPolicy;
}

export interface RegulatedActionRequest {
  regulatedDomain: RegulatedDomain;
  decisionEffect: RegulatedDecisionEffect;
  requestedUse?: AllowedRegulatedUse | BlockedRegulatedUse | ProhibitedRegulatedPractice;
  subjectKind?: SubjectKind;
  minorInvolved?: boolean;
  externalAction?: boolean;
  sensitiveExport?: boolean;
  remoteOrProviderUse?: boolean;
  professionalContext?: boolean;
}

export type RegulatedActionDenialCode =
  | "unknown_regulated_domain"
  | "blocked_regulated_use"
  | "prohibited_practice"
  | "final_decision_blocked"
  | "professional_context_blocked"
  | "minor_guard_required"
  | "external_review_required"
  | "sensitive_export_review_required"
  | "remote_or_provider_opt_in_required";

export interface RegulatedActionDecision {
  allowed: boolean;
  requiresHumanReview: boolean;
  requiresProfessionalReview: boolean;
  denialCodes: RegulatedActionDenialCode[];
  outputLabels: string[];
  disclaimerPolicy: DisclaimerPolicy;
  auditPolicy: AuditPolicy;
}

const baseAllowedUses = [...allowedRegulatedUses];
const baseBlockedUses = [...blockedRegulatedUses];
const baseProhibitedPractices = [...prohibitedRegulatedPractices];

function policy(domain: RegulatedDomain, sensitiveDataClassesForDomain: SensitiveDataClass[]): RegulatedDomainPolicy {
  return {
    regulatedDomain: domain,
    sensitiveDataClasses: sensitiveDataClassesForDomain,
    allowedUses: baseAllowedUses,
    blockedUses: baseBlockedUses,
    prohibitedPractices: baseProhibitedPractices,
    professionalReviewRequired: true,
    disclaimerPolicy: "contextual_remembered",
    outputLabelPolicy: "required",
    auditPolicy: "local_configurable_redacted",
  };
}

export const regulatedDomainSafetyPolicies: readonly RegulatedDomainPolicy[] = [
  policy("health", ["health_record", "third_party_sensitive_record"]),
  policy("mental_health", ["mental_health_record", "health_record", "third_party_sensitive_record"]),
  policy("reproductive_intimate", ["sexual_reproductive_record", "health_record", "third_party_sensitive_record"]),
  policy("pharma", ["medication_or_pharma_record", "health_record", "research_or_lab_record"]),
  policy("finance", ["financial_record", "billing_or_payment_record", "third_party_sensitive_record"]),
  policy("banking", ["banking_record", "financial_record", "identity_record"]),
  policy("insurance", ["insurance_record", "financial_record", "health_record"]),
  policy("legal", ["legal_record", "identity_record", "third_party_sensitive_record"]),
  policy("hr_employment", ["employment_record", "identity_record", "third_party_sensitive_record"]),
  policy("education", ["education_record", "minor_record", "third_party_sensitive_record"]),
  policy("government_public_services", ["government_record", "identity_record", "third_party_sensitive_record"]),
  policy("housing_real_estate", ["housing_record", "financial_record", "identity_record"]),
  policy("compliance_grc", ["security_record", "identity_record", "third_party_sensitive_record"]),
  policy("identity", ["identity_record", "third_party_sensitive_record"]),
  policy("security", ["security_record", "identity_record"]),
  policy("billing_payments", ["billing_or_payment_record", "financial_record", "identity_record"]),
  policy("labs_research", ["research_or_lab_record", "health_record", "third_party_sensitive_record"]),
  policy("iot_physical_actions", ["security_record", "third_party_sensitive_record"]),
  policy("vehicles_transport", ["security_record", "identity_record", "third_party_sensitive_record"]),
  policy("minors", ["minor_record", "education_record", "health_record", "third_party_sensitive_record"]),
];

export function isRegulatedDomain(value: string): value is RegulatedDomain {
  return regulatedDomains.includes(value as RegulatedDomain);
}

export function getRegulatedDomainPolicy(domain: RegulatedDomain): RegulatedDomainPolicy {
  const found = regulatedDomainSafetyPolicies.find((entry) => entry.regulatedDomain === domain);
  if (!found) {
    throw new Error(`Missing regulated domain safety policy: ${domain}`);
  }
  return found;
}

export function evaluateRegulatedAction(request: RegulatedActionRequest): RegulatedActionDecision {
  if (!isRegulatedDomain(request.regulatedDomain)) {
    return {
      allowed: false,
      requiresHumanReview: true,
      requiresProfessionalReview: true,
      denialCodes: ["unknown_regulated_domain"],
      outputLabels: createRegulatedOutputLabels(request),
      disclaimerPolicy: "contextual_remembered",
      auditPolicy: "local_configurable_redacted",
    };
  }

  const currentPolicy = getRegulatedDomainPolicy(request.regulatedDomain);
  const denialCodes: RegulatedActionDenialCode[] = [];

  if (request.requestedUse && currentPolicy.blockedUses.includes(request.requestedUse as BlockedRegulatedUse)) {
    denialCodes.push("blocked_regulated_use");
  }
  if (request.requestedUse && currentPolicy.prohibitedPractices.includes(request.requestedUse as ProhibitedRegulatedPractice)) {
    denialCodes.push("prohibited_practice");
  }
  if (request.decisionEffect === "final_decision") {
    denialCodes.push("final_decision_blocked");
  }
  if (request.professionalContext === true) {
    denialCodes.push("professional_context_blocked");
  }
  if (request.minorInvolved === true || request.subjectKind === "minor") {
    denialCodes.push("minor_guard_required");
  }
  if (request.externalAction === true || request.decisionEffect === "external_action") {
    denialCodes.push("external_review_required");
  }
  if (request.sensitiveExport === true) {
    denialCodes.push("sensitive_export_review_required");
  }
  if (request.remoteOrProviderUse === true) {
    denialCodes.push("remote_or_provider_opt_in_required");
  }

  return {
    allowed: denialCodes.length === 0,
    requiresHumanReview: denialCodes.length > 0,
    requiresProfessionalReview: currentPolicy.professionalReviewRequired,
    denialCodes,
    outputLabels: createRegulatedOutputLabels(request),
    disclaimerPolicy: currentPolicy.disclaimerPolicy,
    auditPolicy: currentPolicy.auditPolicy,
  };
}

export function createRegulatedOutputLabels(request: Pick<RegulatedActionRequest, "regulatedDomain" | "decisionEffect">): string[] {
  return [
    "draft",
    "not_professional_advice",
    "human_review_required",
    "sources_and_gaps_required",
    `regulated_domain:${request.regulatedDomain}`,
    `decision_effect:${request.decisionEffect}`,
  ];
}

export function assertRegulatedDomainSafetyComplete(): void {
  const registered = new Set(regulatedDomainSafetyPolicies.map((entry) => entry.regulatedDomain));
  const missing = regulatedDomains.filter((domain) => !registered.has(domain));
  if (missing.length > 0) {
    throw new Error(`Missing regulated domain safety policies: ${missing.join(", ")}`);
  }

  for (const entry of regulatedDomainSafetyPolicies) {
    if (entry.allowedUses.length === 0 || entry.blockedUses.length === 0 || entry.prohibitedPractices.length === 0) {
      throw new Error(`Incomplete regulated domain safety policy: ${entry.regulatedDomain}`);
    }
    if (entry.outputLabelPolicy !== "required") {
      throw new Error(`Regulated domain output labels must be required: ${entry.regulatedDomain}`);
    }
  }
}
