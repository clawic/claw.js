export const connectorGovernedContextVersion = 1;

export const CONNECTOR_CONTEXT_SENSITIVITIES = ["public", "private", "secret_ref"] as const;
export type ConnectorContextSensitivity = (typeof CONNECTOR_CONTEXT_SENSITIVITIES)[number];

export const CONNECTOR_GOVERNED_STATES = ["active", "paused", "blocked", "retired"] as const;
export type ConnectorGovernedState = (typeof CONNECTOR_GOVERNED_STATES)[number];

export const CONNECTOR_CONTEXT_KINDS = [
  "account",
  "organization",
  "workspace",
  "project",
  "team",
  "app",
  "product",
  "entitlement",
  "key",
  "webhook",
  "endpoint",
  "environment",
  "signing_identity",
] as const;
export type ConnectorContextKind = (typeof CONNECTOR_CONTEXT_KINDS)[number] | (string & {});

export const CONNECTOR_CONTEXT_SCOPE_KINDS = [
  "global",
  "workspace",
  "project",
  "app",
  "environment",
  "provider",
  "operation",
  "agent",
  "role",
] as const;
export type ConnectorContextScopeKind = (typeof CONNECTOR_CONTEXT_SCOPE_KINDS)[number];

export interface ConnectorContextScope {
  kind: ConnectorContextScopeKind;
  id?: string;
}

export type ConnectorContextPolicyEffect = "allow" | "deny" | "requires_approval";

export interface ConnectorContextPolicy {
  effect: ConnectorContextPolicyEffect;
  reason: string;
  appliesToAgents?: string[];
  appliesToRoles?: string[];
  appliesToOperations?: string[];
  requireAuthorization?: boolean;
}

export interface ConnectorContextGuidance {
  summary: string;
  instructions?: string[];
  preferWhen?: string[];
  avoidWhen?: string[];
}

export interface ConnectorContextFieldSchema {
  name: string;
  sensitivity: ConnectorContextSensitivity;
  required?: boolean;
  aliases?: string[];
  guidance?: ConnectorContextGuidance;
  policy?: ConnectorContextPolicy;
}

export interface ConnectorContextKindSchema {
  kind: ConnectorContextKind;
  displayName: string;
  requiredFields: string[];
  recommendedFields?: string[];
  defaultScopes?: ConnectorContextScopeKind[];
  guidance?: ConnectorContextGuidance;
}

export interface ConnectorContextProviderSubprofile {
  id: string;
  displayName: string;
  summary: string;
  requiredKinds: ConnectorContextKind[];
  guidance?: ConnectorContextGuidance;
  sourceDocs?: string[];
}

export interface ConnectorContextFallbackRule {
  id: string;
  fromRef: string;
  toRef: string;
  condition: string;
  guidance: string;
}

export interface ConnectorContextDefaultRule {
  id: string;
  scope: ConnectorContextScope;
  providerId?: string;
  operationIds?: string[];
  contextRef: string;
  priority: number;
  condition?: string;
}

export interface ConnectorContextProviderSchema {
  schemaVersion: 1;
  providerId: string;
  displayName: string;
  summary: string;
  sourceDocs: string[];
  contextKinds: ConnectorContextKindSchema[];
  fields: ConnectorContextFieldSchema[];
  subprofiles?: ConnectorContextProviderSubprofile[];
  defaults?: ConnectorContextDefaultRule[];
  fallbacks?: ConnectorContextFallbackRule[];
  examples?: ConnectorGovernedContextRecord[];
  guidance?: ConnectorContextGuidance;
}

export interface ConnectorContextRecordField {
  value?: string | number | boolean | null;
  sensitivity: ConnectorContextSensitivity;
  secretRef?: string;
  guidance?: ConnectorContextGuidance;
  policy?: ConnectorContextPolicy;
}

export interface ConnectorGovernedContextRecord {
  id: string;
  providerId: string;
  kind: ConnectorContextKind;
  displayName: string;
  state: ConnectorGovernedState;
  parentId?: string;
  resourceId?: string;
  principalId?: string;
  externalId?: string;
  scopes?: ConnectorContextScope[];
  priority?: number;
  fields: Record<string, ConnectorContextRecordField>;
  guidance?: ConnectorContextGuidance;
  policy?: ConnectorContextPolicy;
  desired?: Record<string, unknown>;
  observed?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  source?: "manual" | "imported" | "provider_readonly" | "fixture";
  updatedAt?: string;
}

export interface ConnectorContextRequirement {
  kind: ConnectorContextKind;
  fields: string[];
  optional?: boolean;
}

export type ConnectorContextDecisionReasonCode =
  | "context_required"
  | "context_decision_mismatch"
  | "context_record_missing"
  | "context_field_missing"
  | "context_secret_binding_missing"
  | "context_object_blocked"
  | "context_object_paused"
  | "context_object_retired"
  | "context_field_blocked"
  | "wrong_environment"
  | "policy_requires_approval"
  | "policy_denied";

export interface ConnectorContextDecisionReason {
  code: ConnectorContextDecisionReasonCode;
  message: string;
  remedy?: string;
  recordId?: string;
  kind?: ConnectorContextKind;
  field?: string;
}

export interface ConnectorContextChoiceInput {
  providerId: string;
  operationId?: string;
  environment?: string;
  actorId?: string;
  roleId?: string;
  requirements: ConnectorContextRequirement[];
  candidates: ConnectorGovernedContextRecord[];
  defaultRefs?: string[];
  fallbackRules?: ConnectorContextFallbackRule[];
}

export interface ConnectorContextDefaultResolutionInput {
  providerId: string;
  operationId?: string;
  workspaceId?: string;
  projectId?: string;
  appId?: string;
  environment?: string;
  agentId?: string;
  roleId?: string;
  rules: ConnectorContextDefaultRule[];
}

export interface ConnectorContextChoice {
  allowed: boolean;
  selected: ConnectorGovernedContextRecord[];
  rejected: Array<{ recordId: string; reasons: ConnectorContextDecisionReason[] }>;
  reasons: ConnectorContextDecisionReason[];
  trace: {
    providerId: string;
    operationId?: string;
    environment?: string;
    defaultRefs: string[];
    fallbackRuleIds: string[];
  };
}

export interface ConnectorContextDoctorGap {
  code:
    | "missing_context_kind"
    | "missing_required_field_schema"
    | "invalid_field_sensitivity"
    | "missing_source_doc"
    | "missing_provider_guidance"
    | "missing_context_kind_guidance"
    | "missing_secret_ref_field"
    | "missing_daily_use_example"
    | "invalid_example_provider"
    | "invalid_example_kind"
    | "example_missing_required_field"
    | "fallback_ref_missing"
    | "default_ref_missing";
  providerId: string;
  message: string;
  field?: string;
  kind?: ConnectorContextKind;
}

export interface ConnectorContextDoctorReport {
  ok: boolean;
  providers: number;
  gaps: ConnectorContextDoctorGap[];
}

export interface RedactedConnectorGovernedContextRecord extends Omit<ConnectorGovernedContextRecord, "fields"> {
  fields: Record<string, { value?: unknown; sensitivity: ConnectorContextSensitivity; secretRef?: string; redacted?: boolean; guidance?: ConnectorContextGuidance; policy?: ConnectorContextPolicy }>;
}

const sourceDocs = {
  appleAppInformation: "https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/",
  appleIapInformation: "https://developer.apple.com/help/app-store-connect/reference/in-app-purchase-information",
  googlePlayEdits: "https://developers.google.com/android-publisher/edits",
  googlePlayBundles: "https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/list",
  googlePlaySigning: "https://support.google.com/googleplay/android-developer/answer/9842756",
  amazonSubmission: "https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html",
  revenueCatApiV2: "https://www.revenuecat.com/docs/api-v2",
};

function field(name: string, sensitivity: ConnectorContextSensitivity, required = false, guidance?: string): ConnectorContextFieldSchema {
  return {
    name,
    sensitivity,
    required,
    ...(guidance ? { guidance: { summary: guidance } } : {}),
  };
}

function kind(kind: ConnectorContextKind, displayName: string, requiredFields: string[], recommendedFields: string[] = []): ConnectorContextKindSchema {
  return {
    kind,
    displayName,
    requiredFields,
    ...(recommendedFields.length > 0 ? { recommendedFields } : {}),
    defaultScopes: ["provider", "workspace", "project", "app", "environment", "agent", "role"],
    guidance: { summary: `Use this ${displayName} context only when it matches the requested provider operation scope.` },
  };
}

function provider(input: Omit<ConnectorContextProviderSchema, "schemaVersion">): ConnectorContextProviderSchema {
  const schema: ConnectorContextProviderSchema = {
    schemaVersion: 1,
    ...input,
    guidance: input.guidance ?? { summary: input.summary },
  };
  const examples = [...buildDefaultProviderExamples(schema), ...(input.examples ?? [])];
  return {
    ...schema,
    examples: Array.from(new Map(examples.map((example) => [example.id, example])).values()),
  };
}

function providerFieldNames(schema: ConnectorContextProviderSchema): Set<string> {
  return new Set(schema.fields.map((entry) => entry.name));
}

function buildDefaultProviderExamples(schema: ConnectorContextProviderSchema): ConnectorGovernedContextRecord[] {
  const fieldByName = new Map(schema.fields.map((entry) => [entry.name, entry]));
  return schema.contextKinds.map((entry) => {
    const fields: ConnectorGovernedContextRecord["fields"] = {};
    for (const fieldName of [...entry.requiredFields, ...(entry.recommendedFields ?? [])]) {
      const fieldSchema = fieldByName.get(fieldName);
      if (!fieldSchema) continue;
      fields[fieldName] = exampleField(schema.providerId, fieldSchema);
    }
    return {
      id: `${schema.providerId}_${entry.kind}_example`,
      providerId: schema.providerId,
      kind: entry.kind,
      displayName: `${entry.displayName} example`,
      state: "active",
      fields,
      guidance: entry.guidance ?? { summary: `Safe fixture for ${schema.displayName} ${entry.kind} context.` },
      source: "fixture",
      verification: {
        source: "schema_fixture",
        confidence: "example_only",
      },
    };
  });
}

function exampleField(providerId: string, schema: ConnectorContextFieldSchema): ConnectorContextRecordField {
  if (schema.sensitivity === "secret_ref") {
    return {
      sensitivity: "secret_ref",
      secretRef: `secret://${providerId}/${schema.name}/example`,
      ...(schema.guidance ? { guidance: schema.guidance } : {}),
      ...(schema.policy ? { policy: schema.policy } : {}),
    };
  }
  return {
    sensitivity: schema.sensitivity,
    value: exampleFieldValue(schema.name, schema.sensitivity),
    ...(schema.guidance ? { guidance: schema.guidance } : {}),
    ...(schema.policy ? { policy: schema.policy } : {}),
  };
}

function exampleFieldValue(name: string, sensitivity: ConnectorContextSensitivity): string {
  if (name === "environment") return "production";
  if (name === "api_version") return "v2";
  if (name === "track") return "production";
  if (name === "binary_kind") return "android";
  return sensitivity === "public" ? `${name}_example` : `example_${name}`;
}

export function redactConnectorContextValue(value: unknown, sensitivity: ConnectorContextSensitivity, includePrivate = false): unknown {
  if (sensitivity === "public") return value;
  if (sensitivity === "secret_ref") return value === undefined || value === null ? null : "secret_ref";
  return includePrivate ? value : "redacted";
}

export function redactConnectorContextRecord(record: ConnectorGovernedContextRecord, options: { includePrivate?: boolean } = {}): RedactedConnectorGovernedContextRecord {
  const fields: RedactedConnectorGovernedContextRecord["fields"] = {};
  for (const [name, value] of Object.entries(record.fields)) {
    fields[name] = {
      sensitivity: value.sensitivity,
      value: redactConnectorContextValue(value.value, value.sensitivity, options.includePrivate),
      ...(value.secretRef ? { secretRef: value.sensitivity === "secret_ref" ? value.secretRef : "redacted" } : {}),
      ...(value.sensitivity !== "public" && !options.includePrivate ? { redacted: true } : {}),
      ...(value.guidance ? { guidance: value.guidance } : {}),
      ...(value.policy ? { policy: value.policy } : {}),
    };
  }
  return { ...record, fields };
}

export function validateConnectorContextProviderSchema(schema: ConnectorContextProviderSchema): ConnectorContextDoctorGap[] {
  const gaps: ConnectorContextDoctorGap[] = [];
  const fields = providerFieldNames(schema);
  const kinds = new Set(schema.contextKinds.map((entry) => entry.kind));
  const examples = schema.examples ?? [];
  const exampleIds = new Set(examples.map((entry) => entry.id));
  if (schema.sourceDocs.length === 0) {
    gaps.push({ code: "missing_source_doc", providerId: schema.providerId, message: "Provider schema must cite official or canonical source documentation." });
  }
  if (!schema.guidance?.summary) {
    gaps.push({ code: "missing_provider_guidance", providerId: schema.providerId, message: "Provider schema must include agent-facing guidance." });
  }
  if (!schema.fields.some((entry) => entry.sensitivity === "secret_ref")) {
    gaps.push({ code: "missing_secret_ref_field", providerId: schema.providerId, message: "Provider schema must declare at least one secret_ref field for brokered credentials." });
  }
  for (const entry of schema.fields) {
    if (!CONNECTOR_CONTEXT_SENSITIVITIES.includes(entry.sensitivity)) {
      gaps.push({ code: "invalid_field_sensitivity", providerId: schema.providerId, field: entry.name, message: `Invalid sensitivity for ${entry.name}.` });
    }
  }
  for (const entry of schema.contextKinds) {
    if (!kinds.has(entry.kind)) {
      gaps.push({ code: "missing_context_kind", providerId: schema.providerId, kind: entry.kind, message: `Missing context kind ${entry.kind}.` });
    }
    if (!entry.guidance?.summary) {
      gaps.push({ code: "missing_context_kind_guidance", providerId: schema.providerId, kind: entry.kind, message: `Context kind ${entry.kind} must include guidance.` });
    }
    if (!examples.some((example) => example.providerId === schema.providerId && example.kind === entry.kind)) {
      gaps.push({ code: "missing_daily_use_example", providerId: schema.providerId, kind: entry.kind, message: `Context kind ${entry.kind} must include a safe daily-use fixture example.` });
    }
    for (const requiredField of entry.requiredFields) {
      if (!fields.has(requiredField)) {
        gaps.push({ code: "missing_required_field_schema", providerId: schema.providerId, kind: entry.kind, field: requiredField, message: `Missing field schema ${requiredField} required by ${entry.kind}.` });
      }
    }
  }
  for (const subprofile of schema.subprofiles ?? []) {
    for (const requiredKind of subprofile.requiredKinds) {
      if (!kinds.has(requiredKind)) {
        gaps.push({ code: "missing_context_kind", providerId: schema.providerId, kind: requiredKind, message: `Subprofile ${subprofile.id} requires missing kind ${requiredKind}.` });
      }
    }
  }
  for (const example of examples) {
    if (example.providerId !== schema.providerId) {
      gaps.push({ code: "invalid_example_provider", providerId: schema.providerId, message: `Example ${example.id} belongs to ${example.providerId}.` });
    }
    const kindSchema = schema.contextKinds.find((entry) => entry.kind === example.kind);
    if (!kindSchema) {
      gaps.push({ code: "invalid_example_kind", providerId: schema.providerId, kind: example.kind, message: `Example ${example.id} uses unknown context kind ${example.kind}.` });
      continue;
    }
    for (const requiredField of kindSchema.requiredFields) {
      if (!example.fields[requiredField]) {
        gaps.push({ code: "example_missing_required_field", providerId: schema.providerId, kind: example.kind, field: requiredField, message: `Example ${example.id} is missing required field ${requiredField}.` });
      }
    }
  }
  for (const defaultRule of schema.defaults ?? []) {
    if (!exampleIds.has(defaultRule.contextRef)) {
      gaps.push({ code: "default_ref_missing", providerId: schema.providerId, message: `Default ${defaultRule.id} references missing example/context ${defaultRule.contextRef}.` });
    }
  }
  for (const fallback of schema.fallbacks ?? []) {
    if (!exampleIds.has(fallback.fromRef)) {
      gaps.push({ code: "fallback_ref_missing", providerId: schema.providerId, message: `Fallback ${fallback.id} references missing source ${fallback.fromRef}.` });
    }
    if (!exampleIds.has(fallback.toRef)) {
      gaps.push({ code: "fallback_ref_missing", providerId: schema.providerId, message: `Fallback ${fallback.id} references missing target ${fallback.toRef}.` });
    }
  }
  return gaps;
}

export function buildConnectorContextDoctorReport(schemas: ConnectorContextProviderSchema[] = CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS): ConnectorContextDoctorReport {
  const gaps = schemas.flatMap(validateConnectorContextProviderSchema);
  return {
    ok: gaps.length === 0,
    providers: schemas.length,
    gaps,
  };
}

export function resolveConnectorContextDefaultRefs(input: ConnectorContextDefaultResolutionInput): string[] {
  const matches = input.rules
    .filter((rule) => defaultRuleMatches(input, rule))
    .sort((left, right) => {
      const priority = right.priority - left.priority;
      if (priority !== 0) return priority;
      return defaultScopeRank(right.scope.kind) - defaultScopeRank(left.scope.kind);
    });
  return Array.from(new Set(matches.map((rule) => rule.contextRef)));
}

export function explainConnectorContextChoice(input: ConnectorContextChoiceInput): ConnectorContextChoice {
  const selected: ConnectorGovernedContextRecord[] = [];
  const rejected: Array<{ recordId: string; reasons: ConnectorContextDecisionReason[] }> = [];
  const reasons: ConnectorContextDecisionReason[] = [];
  const defaultRefs = input.defaultRefs ?? [];
  const fallbackRuleIds: string[] = [];

  for (const requirement of input.requirements) {
    const candidates = input.candidates
      .filter((candidate) => candidate.providerId === input.providerId && candidate.kind === requirement.kind)
      .sort((left, right) => scoreCandidate(right, defaultRefs) - scoreCandidate(left, defaultRefs));

    if (candidates.length === 0) {
      if (!requirement.optional) {
        reasons.push({ code: "context_record_missing", kind: requirement.kind, message: `Missing ${requirement.kind} context for ${input.providerId}.` });
        reasons[reasons.length - 1]!.remedy = `Create or import an active ${requirement.kind} context for ${input.providerId}, then rerun explain.`;
      }
      continue;
    }

    let chosen: ConnectorGovernedContextRecord | null = null;
    for (const candidate of candidates) {
      const candidateReasons = evaluateCandidate(input, requirement, candidate);
      if (candidateReasons.length === 0) {
        chosen = candidate;
        break;
      }
      rejected.push({ recordId: candidate.id, reasons: candidateReasons });
    }

    if (!chosen && input.fallbackRules) {
      const fallback = input.fallbackRules.find((rule) => candidates.some((candidate) => candidate.id === rule.fromRef) && candidates.some((candidate) => candidate.id === rule.toRef));
      if (fallback) {
        fallbackRuleIds.push(fallback.id);
        const target = candidates.find((candidate) => candidate.id === fallback.toRef);
        if (target) {
          const targetReasons = evaluateCandidate(input, requirement, target);
          if (targetReasons.length === 0) chosen = target;
        }
      }
    }

    if (!chosen) {
      reasons.push(...(rejected.find((entry) => candidates.some((candidate) => candidate.id === entry.recordId))?.reasons ?? [{
        code: "context_required",
        kind: requirement.kind,
        message: `No eligible ${requirement.kind} context matched the request.`,
        remedy: `Activate an eligible ${requirement.kind} context, fix missing fields, or choose an approved fallback.`,
      }]));
      continue;
    }
    const tracedFallback = input.fallbackRules?.find((rule) => rejected.some((entry) => entry.recordId === rule.fromRef) && rule.toRef === chosen.id);
    if (tracedFallback && !fallbackRuleIds.includes(tracedFallback.id)) {
      fallbackRuleIds.push(tracedFallback.id);
    }
    selected.push(chosen);
  }

  return {
    allowed: reasons.length === 0,
    selected,
    rejected,
    reasons,
    trace: {
      providerId: input.providerId,
      ...(input.operationId ? { operationId: input.operationId } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
      defaultRefs,
      fallbackRuleIds,
    },
  };
}

function scoreCandidate(candidate: ConnectorGovernedContextRecord, defaultRefs: string[]): number {
  const defaultIndex = defaultRefs.indexOf(candidate.id);
  const defaultBoost = defaultIndex >= 0 ? 10_000 + (defaultRefs.length - defaultIndex) : 0;
  return defaultBoost + (candidate.priority ?? 0);
}

function evaluateCandidate(input: ConnectorContextChoiceInput, requirement: ConnectorContextRequirement, candidate: ConnectorGovernedContextRecord): ConnectorContextDecisionReason[] {
  const reasons: ConnectorContextDecisionReason[] = [];
  if (candidate.state === "blocked") reasons.push({ code: "context_object_blocked", recordId: candidate.id, kind: candidate.kind, message: `${candidate.id} is blocked.`, remedy: "Use an allowed alternative context or explicitly unblock it after approval." });
  if (candidate.state === "paused") reasons.push({ code: "context_object_paused", recordId: candidate.id, kind: candidate.kind, message: `${candidate.id} is paused.`, remedy: "Use an active alternative context or reactivate this context after review." });
  if (candidate.state === "retired") reasons.push({ code: "context_object_retired", recordId: candidate.id, kind: candidate.kind, message: `${candidate.id} is retired.`, remedy: "Use a replacement context; retired records should not be selected." });
  if (input.environment) {
    const fieldValue = candidate.fields.environment?.value ?? candidate.fields.environment_id?.value;
    if (fieldValue && fieldValue !== input.environment) {
      reasons.push({ code: "wrong_environment", recordId: candidate.id, kind: candidate.kind, field: "environment", message: `${candidate.id} is scoped to ${String(fieldValue)}, not ${input.environment}.`, remedy: `Select context for ${input.environment} or change the requested environment.` });
    }
  }
  if (candidate.policy?.effect === "deny" && contextPolicyApplies(candidate.policy, input)) reasons.push({ code: "policy_denied", recordId: candidate.id, kind: candidate.kind, message: candidate.policy.reason, remedy: "Use a policy-allowed context or change the policy through an approved flow." });
  if (candidate.policy?.effect === "requires_approval" && contextPolicyApplies(candidate.policy, input)) reasons.push({ code: "policy_requires_approval", recordId: candidate.id, kind: candidate.kind, message: candidate.policy.reason, remedy: "Request scoped approval for this context or choose an already approved alternative." });

  for (const fieldName of requirement.fields) {
    const fieldValue = candidate.fields[fieldName];
    if (!fieldValue) {
      reasons.push({ code: "context_field_missing", recordId: candidate.id, kind: candidate.kind, field: fieldName, message: `${candidate.id} is missing ${fieldName}.`, remedy: `Set ${fieldName} on ${candidate.id} or choose another active ${candidate.kind} context.` });
      continue;
    }
    if (fieldValue.policy?.effect === "deny" && contextPolicyApplies(fieldValue.policy, input)) reasons.push({ code: "context_field_blocked", recordId: candidate.id, kind: candidate.kind, field: fieldName, message: fieldValue.policy.reason, remedy: `Use a different ${fieldName} value/context or update field policy through an approved flow.` });
    if (fieldValue.policy?.effect === "requires_approval" && contextPolicyApplies(fieldValue.policy, input)) reasons.push({ code: "policy_requires_approval", recordId: candidate.id, kind: candidate.kind, field: fieldName, message: fieldValue.policy.reason, remedy: `Request scoped approval for ${candidate.id}.${fieldName}.` });
    if (fieldValue.sensitivity === "secret_ref" && !fieldValue.secretRef) {
      reasons.push({ code: "context_secret_binding_missing", recordId: candidate.id, kind: candidate.kind, field: fieldName, message: `${candidate.id}.${fieldName} requires a secret_ref binding.`, remedy: `Run accounts link-secret ${candidate.id} --field ${fieldName} --secret-ref secret://...` });
    }
  }
  return reasons;
}

function defaultRuleMatches(input: ConnectorContextDefaultResolutionInput, rule: ConnectorContextDefaultRule): boolean {
  if (rule.providerId && rule.providerId !== input.providerId) return false;
  if (rule.operationIds?.length && (!input.operationId || !rule.operationIds.includes(input.operationId))) return false;
  switch (rule.scope.kind) {
    case "global": return true;
    case "provider": return !rule.scope.id || rule.scope.id === input.providerId;
    case "operation": return Boolean(input.operationId && rule.scope.id === input.operationId);
    case "workspace": return Boolean(input.workspaceId && rule.scope.id === input.workspaceId);
    case "project": return Boolean(input.projectId && rule.scope.id === input.projectId);
    case "app": return Boolean(input.appId && rule.scope.id === input.appId);
    case "environment": return Boolean(input.environment && rule.scope.id === input.environment);
    case "agent": return Boolean(input.agentId && rule.scope.id === input.agentId);
    case "role": return Boolean(input.roleId && rule.scope.id === input.roleId);
  }
}

function defaultScopeRank(kind: ConnectorContextScopeKind): number {
  switch (kind) {
    case "agent": return 90;
    case "role": return 85;
    case "operation": return 80;
    case "app": return 70;
    case "environment": return 60;
    case "project": return 50;
    case "workspace": return 40;
    case "provider": return 30;
    case "global": return 10;
  }
}

function contextPolicyApplies(policy: ConnectorContextPolicy, input: ConnectorContextChoiceInput): boolean {
  if (policy.appliesToOperations?.length && (!input.operationId || !policy.appliesToOperations.includes(input.operationId))) return false;
  if (policy.appliesToAgents?.length && (!input.actorId || !policy.appliesToAgents.includes(input.actorId))) return false;
  if (policy.appliesToRoles?.length && (!input.roleId || !policy.appliesToRoles.includes(input.roleId))) return false;
  return true;
}

export const CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER = [
  "discord",
  "gitlab",
  "github",
  "google",
  "airtable",
  "salesforce",
  "hubspot",
  "stripe",
  "notion",
  "slack",
  "telegram_bot_api",
  "whatsapp",
  "apple",
  "amazon_appstore",
  "revenuecat",
] as const;

const commonAccountFields = [
  field("account_id", "private", true),
  field("account_label", "public", false),
  field("environment", "public", false),
  field("api_key", "secret_ref", false),
];

export const CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS: ConnectorContextProviderSchema[] = [
  provider({
    providerId: "discord",
    displayName: "Discord",
    summary: "Discord workspaces, apps, bot credentials, channel endpoints, and webhook targets.",
    sourceDocs: ["https://discord.com/developers/docs/intro"],
    contextKinds: [kind("account", "Discord account", ["account_id"]), kind("workspace", "Discord server", ["workspace_id"]), kind("app", "Discord application", ["app_id"]), kind("webhook", "Discord webhook", ["webhook_url"])],
    fields: [...commonAccountFields, field("workspace_id", "private", true), field("app_id", "private", true), field("bot_token", "secret_ref", false), field("webhook_url", "secret_ref", true)],
  }),
  provider({
    providerId: "gitlab",
    displayName: "GitLab",
    summary: "GitLab accounts, groups, projects, access tokens, and webhooks.",
    sourceDocs: ["https://docs.gitlab.com/api/rest/"],
    contextKinds: [kind("account", "GitLab account", ["account_id"]), kind("organization", "GitLab group", ["group_id"]), kind("project", "GitLab project", ["project_id"]), kind("key", "GitLab token", ["api_key"])],
    fields: [...commonAccountFields, field("group_id", "private", true), field("project_id", "private", true), field("webhook_secret", "secret_ref", false)],
  }),
  provider({
    providerId: "github",
    displayName: "GitHub",
    summary: "GitHub accounts, organizations, repositories, app installations, tokens, and webhooks.",
    sourceDocs: ["https://docs.github.com/rest"],
    contextKinds: [kind("account", "GitHub account", ["account_id"]), kind("organization", "GitHub organization", ["organization_id"]), kind("project", "GitHub repository", ["repository"]), kind("app", "GitHub App", ["app_id"]), kind("key", "GitHub credential", ["api_key"])],
    fields: [...commonAccountFields, field("organization_id", "private", true), field("repository", "private", true), field("app_id", "private", true), field("installation_id", "private", false), field("webhook_secret", "secret_ref", false)],
  }),
  provider({
    providerId: "google",
    displayName: "Google",
    summary: "Google accounts, Cloud projects, OAuth clients, Play Console apps, package names, and signing identities.",
    sourceDocs: [sourceDocs.googlePlayEdits, sourceDocs.googlePlayBundles, sourceDocs.googlePlaySigning],
    contextKinds: [kind("account", "Google account", ["account_id"]), kind("organization", "Google organization", ["organization_id"]), kind("project", "Google Cloud project", ["project_id"]), kind("app", "Google Play app", ["package_name"]), kind("key", "Google credential", ["api_key"]), kind("signing_identity", "Android signing identity", ["certificate_sha256"])],
    fields: [...commonAccountFields, field("organization_id", "private", true), field("project_id", "private", true), field("package_name", "private", true), field("play_console_app_id", "private", false), field("track", "public", false), field("certificate_sha256", "private", true), field("service_account_json", "secret_ref", false)],
    subprofiles: [{
      id: "google_play",
      displayName: "Google Play",
      summary: "Play Console publication context: developer account, package name, app id, track, and upload signing identity.",
      requiredKinds: ["account", "project", "app", "signing_identity"],
      sourceDocs: [sourceDocs.googlePlayEdits, sourceDocs.googlePlayBundles, sourceDocs.googlePlaySigning],
    }],
  }),
  provider({
    providerId: "airtable",
    displayName: "Airtable",
    summary: "Airtable accounts, workspaces, bases, tables, and personal access tokens.",
    sourceDocs: ["https://airtable.com/developers/web/api/introduction"],
    contextKinds: [kind("account", "Airtable account", ["account_id"]), kind("workspace", "Airtable workspace", ["workspace_id"]), kind("project", "Airtable base", ["base_id"]), kind("key", "Airtable token", ["api_key"])],
    fields: [...commonAccountFields, field("workspace_id", "private", true), field("base_id", "private", true), field("table_id", "private", false)],
  }),
  provider({
    providerId: "salesforce",
    displayName: "Salesforce",
    summary: "Salesforce orgs, environments, connected apps, endpoints, and credentials.",
    sourceDocs: ["https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/"],
    contextKinds: [kind("account", "Salesforce account", ["account_id"]), kind("organization", "Salesforce org", ["organization_id"]), kind("environment", "Salesforce environment", ["environment"]), kind("endpoint", "Salesforce endpoint", ["instance_url"]), kind("key", "Salesforce credential", ["api_key"])],
    fields: [...commonAccountFields, field("organization_id", "private", true), field("instance_url", "private", true), field("connected_app_id", "private", false), field("refresh_token", "secret_ref", false)],
  }),
  provider({
    providerId: "hubspot",
    displayName: "HubSpot",
    summary: "HubSpot portals, apps, private app tokens, and webhooks.",
    sourceDocs: ["https://developers.hubspot.com/docs/api/overview"],
    contextKinds: [kind("account", "HubSpot account", ["account_id"]), kind("workspace", "HubSpot portal", ["portal_id"]), kind("app", "HubSpot app", ["app_id"]), kind("key", "HubSpot token", ["api_key"]), kind("webhook", "HubSpot webhook", ["webhook_secret"])],
    fields: [...commonAccountFields, field("portal_id", "private", true), field("app_id", "private", true), field("webhook_secret", "secret_ref", true)],
  }),
  provider({
    providerId: "stripe",
    displayName: "Stripe",
    summary: "Stripe accounts, environments, products, prices, API keys, restricted keys, and webhook secrets.",
    sourceDocs: ["https://docs.stripe.com/api"],
    contextKinds: [kind("account", "Stripe account", ["account_id"]), kind("environment", "Stripe mode", ["environment"]), kind("product", "Stripe product", ["product_id"]), kind("key", "Stripe key", ["api_key"]), kind("webhook", "Stripe webhook", ["webhook_secret"])],
    fields: [...commonAccountFields, field("product_id", "private", true), field("price_id", "private", false), field("restricted_key", "secret_ref", false), field("webhook_secret", "secret_ref", true)],
  }),
  provider({
    providerId: "notion",
    displayName: "Notion",
    summary: "Notion accounts, workspaces, databases, pages, integrations, and internal tokens.",
    sourceDocs: ["https://developers.notion.com/reference/intro"],
    contextKinds: [kind("account", "Notion account", ["account_id"]), kind("workspace", "Notion workspace", ["workspace_id"]), kind("project", "Notion database", ["database_id"]), kind("key", "Notion integration token", ["api_key"])],
    fields: [...commonAccountFields, field("workspace_id", "private", true), field("database_id", "private", true), field("page_id", "private", false)],
  }),
  provider({
    providerId: "slack",
    displayName: "Slack",
    summary: "Slack workspaces, apps, bots, channels, OAuth tokens, and signing secrets.",
    sourceDocs: ["https://api.slack.com/apis"],
    contextKinds: [kind("account", "Slack account", ["account_id"]), kind("workspace", "Slack workspace", ["workspace_id"]), kind("app", "Slack app", ["app_id"]), kind("key", "Slack token", ["api_key"]), kind("webhook", "Slack webhook", ["webhook_url"])],
    fields: [...commonAccountFields, field("workspace_id", "private", true), field("app_id", "private", true), field("channel_id", "private", false), field("signing_secret", "secret_ref", false), field("webhook_url", "secret_ref", true)],
  }),
  provider({
    providerId: "telegram_bot_api",
    displayName: "Telegram Bot API",
    summary: "Telegram bot identities, chats, webhook endpoints, bot tokens, and allowed update policies.",
    sourceDocs: ["https://core.telegram.org/bots/api"],
    contextKinds: [kind("account", "Telegram account", ["account_id"]), kind("app", "Telegram bot", ["bot_id"]), kind("endpoint", "Telegram chat", ["chat_id"]), kind("webhook", "Telegram webhook", ["webhook_url"]), kind("key", "Telegram bot token", ["api_key"])],
    fields: [...commonAccountFields, field("bot_id", "private", true), field("chat_id", "private", true), field("webhook_url", "secret_ref", true), field("allowed_updates", "public", false)],
  }),
  provider({
    providerId: "whatsapp",
    displayName: "WhatsApp",
    summary: "WhatsApp Business accounts, phone number ids, app ids, access tokens, and webhook secrets.",
    sourceDocs: ["https://developers.facebook.com/docs/whatsapp/cloud-api"],
    contextKinds: [kind("account", "Meta account", ["account_id"]), kind("organization", "WhatsApp Business account", ["business_account_id"]), kind("app", "Meta app", ["app_id"]), kind("endpoint", "Phone number", ["phone_number_id"]), kind("key", "WhatsApp token", ["api_key"])],
    fields: [...commonAccountFields, field("business_account_id", "private", true), field("app_id", "private", true), field("phone_number_id", "private", true), field("verify_token", "secret_ref", false)],
  }),
  provider({
    providerId: "apple",
    displayName: "Apple App Store Connect",
    summary: "Apple developer accounts, Team IDs, Bundle IDs, SKUs, App Store Connect API keys, products, entitlements, and signing identities.",
    sourceDocs: [sourceDocs.appleAppInformation, sourceDocs.appleIapInformation],
    contextKinds: [
      kind("account", "Apple developer account", ["account_id", "team_id"]),
      kind("team", "Apple Team", ["team_id"]),
      kind("app", "App Store Connect app", ["bundle_id", "sku"]),
      kind("product", "In-app purchase or subscription", ["product_id"]),
      kind("entitlement", "Apple entitlement", ["entitlement_id"]),
      kind("key", "App Store Connect API key", ["api_key", "issuer_id", "key_id"]),
      kind("signing_identity", "Apple signing identity", ["team_id", "signing_certificate_sha256"]),
      kind("environment", "Apple release environment", ["environment"]),
    ],
    fields: [
      ...commonAccountFields,
      field("team_id", "private", true, "Use the exact Team ID approved for the app or fail closed."),
      field("bundle_id", "private", true, "Must match the application bundle identifier before signing or upload."),
      field("sku", "private", true, "Internal App Store Connect SKU; keep stable after creation."),
      field("apple_id", "private", false),
      field("issuer_id", "private", true),
      field("key_id", "private", true),
      field("product_id", "private", true),
      field("entitlement_id", "private", true),
      field("signing_certificate_sha256", "private", true),
      field("signing_identity_label", "private", false),
    ],
    guidance: {
      summary: "Apple signing and upload must use the approved Team ID, Bundle ID, SKU, product ids, and signing identity for the target app/environment.",
      instructions: ["Fail closed when Team ID, Bundle ID, SKU, or signing identity is missing, paused, blocked, retired, or mismatched."],
    },
  }),
  provider({
    providerId: "amazon_appstore",
    displayName: "Amazon Appstore",
    summary: "Amazon developer accounts, app listings, package names, Fire/Vega binaries, IAP products, security profiles, and submission environments.",
    sourceDocs: [sourceDocs.amazonSubmission],
    contextKinds: [kind("account", "Amazon developer account", ["account_id"]), kind("app", "Amazon Appstore app", ["package_name", "amazon_app_id"]), kind("product", "Amazon IAP product", ["product_id"]), kind("key", "Amazon credential", ["api_key"]), kind("environment", "Amazon submission environment", ["environment"])],
    fields: [...commonAccountFields, field("developer_account_id", "private", false), field("package_name", "private", true), field("amazon_app_id", "private", true), field("product_id", "private", true), field("security_profile_id", "private", false), field("binary_kind", "public", false)],
  }),
  provider({
    providerId: "revenuecat",
    displayName: "RevenueCat",
    summary: "RevenueCat accounts, projects, apps, products, entitlements, webhooks, and versioned API keys.",
    sourceDocs: [sourceDocs.revenueCatApiV2],
    contextKinds: [
      kind("account", "RevenueCat account", ["account_id"]),
      kind("project", "RevenueCat project", ["project_id"]),
      kind("app", "RevenueCat app", ["app_id"]),
      kind("product", "RevenueCat product", ["product_id"]),
      kind("entitlement", "RevenueCat entitlement", ["entitlement_id"]),
      kind("key", "RevenueCat API key", ["api_key", "api_version"]),
      kind("webhook", "RevenueCat webhook", ["webhook_secret"]),
    ],
    fields: [...commonAccountFields, field("project_id", "private", true), field("app_id", "private", true), field("product_id", "private", true), field("entitlement_id", "private", true), field("api_version", "public", true), field("webhook_secret", "secret_ref", true)],
    defaults: [{ id: "revenuecat_v2_default", scope: { kind: "provider", id: "revenuecat" }, providerId: "revenuecat", contextRef: "revenuecat_api_v2", priority: 100, condition: "Use API v2 whenever the required endpoint and permissions exist." }],
    fallbacks: [{ id: "revenuecat_v2_to_v1", fromRef: "revenuecat_api_v2", toRef: "revenuecat_api_v1", condition: "API v2 does not cover the needed endpoint.", guidance: "Use v1 only as an explicit fallback and preserve the trace." }],
    examples: [
      {
        id: "revenuecat_api_v2",
        providerId: "revenuecat",
        kind: "key",
        displayName: "RevenueCat API v2 fixture",
        state: "active",
        fields: {
          api_version: { value: "v2", sensitivity: "public" },
          api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v2/example" },
        },
        source: "fixture",
      },
      {
        id: "revenuecat_api_v1",
        providerId: "revenuecat",
        kind: "key",
        displayName: "RevenueCat API v1 fallback fixture",
        state: "active",
        fields: {
          api_version: { value: "v1", sensitivity: "public" },
          api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v1/example" },
        },
        source: "fixture",
      },
    ],
    guidance: {
      summary: "Prefer RevenueCat API v2 keys when possible; use v1 only as a traced fallback for endpoints not covered by v2.",
      instructions: ["Do not mix public SDK keys with server secret keys.", "Never expose secret API key material; use secret_ref bindings only."],
    },
  }),
];

export function getConnectorGovernedContextProviderSchema(providerId: string): ConnectorContextProviderSchema | null {
  return CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS.find((schema) => schema.providerId === providerId) ?? null;
}
