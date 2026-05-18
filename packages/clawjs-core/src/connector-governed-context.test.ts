import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER,
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS,
  buildConnectorContextDoctorReport,
  explainConnectorContextChoice,
  getConnectorGovernedContextProviderSchema,
  redactConnectorContextRecord,
  resolveConnectorContextDefaultRefs,
  validateConnectorContextProviderSchema,
  type ConnectorGovernedContextRecord,
} from "./index.ts";

test("governed connector context catalog keeps agreed provider order and adds store providers", () => {
  assert.deepEqual(CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS.map((schema) => schema.providerId), [...CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER]);
  assert.ok(getConnectorGovernedContextProviderSchema("apple"));
  assert.ok(getConnectorGovernedContextProviderSchema("amazon_appstore"));
  assert.ok(getConnectorGovernedContextProviderSchema("revenuecat"));

  const google = getConnectorGovernedContextProviderSchema("google");
  assert.equal(google?.subprofiles?.some((subprofile) => subprofile.id === "google_play"), true);
});

test("builtin governed connector context schemas pass doctor checks", () => {
  const report = buildConnectorContextDoctorReport();

  assert.equal(report.ok, true);
  assert.equal(report.providers, CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS.length);
  assert.deepEqual(report.gaps, []);
});

test("provider schemas expose safe daily-use examples and secret-ref coverage", () => {
  for (const schema of CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS) {
    assert.equal(Boolean(schema.guidance?.summary), true, schema.providerId);
    assert.equal(schema.fields.some((field) => field.sensitivity === "secret_ref"), true, schema.providerId);
    for (const contextKind of schema.contextKinds) {
      const example = schema.examples?.find((entry) => entry.kind === contextKind.kind);
      assert.ok(example, `${schema.providerId}:${contextKind.kind}`);
      for (const requiredField of contextKind.requiredFields) {
        assert.ok(example.fields[requiredField], `${example.id}:${requiredField}`);
      }
    }
  }
});

test("provider doctor reports daily-use fixture and fallback gaps", () => {
  const revenueCat = getConnectorGovernedContextProviderSchema("revenuecat");
  assert.ok(revenueCat);

  const gaps = validateConnectorContextProviderSchema({
    ...revenueCat,
    examples: revenueCat.examples?.filter((example) => example.id !== "revenuecat_api_v1"),
  });

  assert.equal(gaps.some((gap) => gap.code === "fallback_ref_missing"), true);
});

test("Apple context fails closed when Team ID or Bundle ID context is blocked or missing", () => {
  const appleTeam: ConnectorGovernedContextRecord = {
    id: "apple_team_wrong",
    providerId: "apple",
    kind: "team",
    displayName: "Wrong Apple Team",
    state: "blocked",
    fields: {
      team_id: { value: "TEAM-WRONG", sensitivity: "private" },
    },
  };
  const appleApp: ConnectorGovernedContextRecord = {
    id: "apple_app_main",
    providerId: "apple",
    kind: "app",
    displayName: "Main App",
    state: "active",
    fields: {
      bundle_id: { value: "com.example.app", sensitivity: "private" },
    },
  };

  const decision = explainConnectorContextChoice({
    providerId: "apple",
    operationId: "apple.upload",
    environment: "production",
    requirements: [
      { kind: "team", fields: ["team_id"] },
      { kind: "app", fields: ["bundle_id", "sku"] },
    ],
    candidates: [appleTeam, appleApp],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_object_blocked"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_field_missing" && reason.field === "sku"), true);
  assert.equal(decision.reasons.every((reason) => typeof reason.remedy === "string" && reason.remedy.length > 0), true);
});

test("RevenueCat API v2 is the default and v1 is a traced fallback", () => {
  const v2: ConnectorGovernedContextRecord = {
    id: "revenuecat_api_v2",
    providerId: "revenuecat",
    kind: "key",
    displayName: "RevenueCat API v2",
    state: "paused",
    fields: {
      api_version: { value: "v2", sensitivity: "public" },
      api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v2" },
    },
  };
  const v1: ConnectorGovernedContextRecord = {
    id: "revenuecat_api_v1",
    providerId: "revenuecat",
    kind: "key",
    displayName: "RevenueCat API v1",
    state: "active",
    fields: {
      api_version: { value: "v1", sensitivity: "public" },
      api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v1" },
    },
  };
  const schema = getConnectorGovernedContextProviderSchema("revenuecat");

  const decision = explainConnectorContextChoice({
    providerId: "revenuecat",
    operationId: "revenuecat.project_configuration.read",
    requirements: [{ kind: "key", fields: ["api_version", "api_key"] }],
    defaultRefs: ["revenuecat_api_v2"],
    fallbackRules: schema?.fallbacks,
    candidates: [v1, v2],
  });

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.selected.map((record) => record.id), ["revenuecat_api_v1"]);
  assert.deepEqual(decision.trace.fallbackRuleIds, ["revenuecat_v2_to_v1"]);
});

test("scoped defaults resolve by matching scope and priority", () => {
  const refs = resolveConnectorContextDefaultRefs({
    providerId: "revenuecat",
    operationId: "revenuecat.project_configuration.read",
    environment: "production",
    agentId: "agent.release",
    roleId: "release",
    rules: [
      { id: "global", scope: { kind: "global" }, providerId: "revenuecat", contextRef: "revenuecat_api_v1", priority: 10 },
      { id: "provider", scope: { kind: "provider", id: "revenuecat" }, providerId: "revenuecat", contextRef: "revenuecat_api_v2", priority: 20 },
      { id: "staging", scope: { kind: "environment", id: "staging" }, providerId: "revenuecat", contextRef: "revenuecat_staging", priority: 500 },
      { id: "agent", scope: { kind: "agent", id: "agent.release" }, providerId: "revenuecat", contextRef: "revenuecat_release_agent", priority: 100 },
      { id: "operation", scope: { kind: "operation", id: "revenuecat.project_configuration.read" }, providerId: "revenuecat", contextRef: "revenuecat_read_key", priority: 80 },
    ],
  });

  assert.deepEqual(refs, ["revenuecat_release_agent", "revenuecat_read_key", "revenuecat_api_v2", "revenuecat_api_v1"]);
});

test("object and field policies apply only to matching agent role and operation scopes", () => {
  const candidate: ConnectorGovernedContextRecord = {
    id: "apple_app_release",
    providerId: "apple",
    kind: "app",
    displayName: "Release App",
    state: "active",
    policy: {
      effect: "deny",
      reason: "Only the release agent is blocked from this app.",
      appliesToAgents: ["agent.release"],
    },
    fields: {
      bundle_id: {
        value: "com.example.app",
        sensitivity: "private",
        policy: {
          effect: "requires_approval",
          reason: "Release role needs approval for this Bundle ID.",
          appliesToRoles: ["release"],
          appliesToOperations: ["apple.upload"],
        },
      },
      sku: { value: "SKU123", sensitivity: "private" },
    },
  };

  const ordinary = explainConnectorContextChoice({
    providerId: "apple",
    operationId: "apple.upload",
    actorId: "agent.docs",
    roleId: "docs",
    requirements: [{ kind: "app", fields: ["bundle_id", "sku"] }],
    candidates: [candidate],
  });
  assert.equal(ordinary.allowed, true);

  const release = explainConnectorContextChoice({
    providerId: "apple",
    operationId: "apple.upload",
    actorId: "agent.release",
    roleId: "release",
    requirements: [{ kind: "app", fields: ["bundle_id", "sku"] }],
    candidates: [candidate],
  });
  assert.equal(release.allowed, false);
  assert.equal(release.reasons.some((reason) => reason.code === "policy_denied"), true);
  assert.equal(release.reasons.some((reason) => reason.code === "policy_requires_approval" && reason.field === "bundle_id"), true);
});

test("context choice fails closed for field policy, missing secret binding, approval, and wrong environment", () => {
  const decision = explainConnectorContextChoice({
    providerId: "apple",
    operationId: "apple.upload",
    environment: "production",
    requirements: [
      { kind: "team", fields: ["team_id"] },
      { kind: "key", fields: ["app_store_connect_api_key"] },
      { kind: "app", fields: ["bundle_id", "sku"] },
    ],
    candidates: [
      {
        id: "apple_team_approval",
        providerId: "apple",
        kind: "team",
        displayName: "Apple team requiring approval",
        state: "active",
        policy: { effect: "requires_approval", reason: "Release signing requires explicit approval." },
        fields: {
          team_id: { value: "TEAM-APPROVAL", sensitivity: "private" },
        },
      },
      {
        id: "apple_key_missing_secret",
        providerId: "apple",
        kind: "key",
        displayName: "App Store Connect key",
        state: "active",
        fields: {
          app_store_connect_api_key: { sensitivity: "secret_ref" },
        },
      },
      {
        id: "apple_app_wrong_env",
        providerId: "apple",
        kind: "app",
        displayName: "Wrong environment app",
        state: "active",
        fields: {
          environment: { value: "staging", sensitivity: "public" },
          bundle_id: {
            value: "com.example.app",
            sensitivity: "private",
            policy: { effect: "deny", reason: "This Bundle ID is blocked for release." },
          },
          sku: { value: "SKU123", sensitivity: "private" },
        },
      },
    ],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "policy_requires_approval" && reason.recordId === "apple_team_approval"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_secret_binding_missing" && reason.field === "app_store_connect_api_key"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "wrong_environment" && reason.recordId === "apple_app_wrong_env"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_field_blocked" && reason.field === "bundle_id"), true);
  assert.equal(decision.reasons.every((reason) => typeof reason.remedy === "string" && reason.remedy.length > 0), true);
});

test("redaction keeps public values and never exposes private or secret material by default", () => {
  const redacted = redactConnectorContextRecord({
    id: "apple_app_main",
    providerId: "apple",
    kind: "app",
    displayName: "Main App",
    state: "active",
    fields: {
      track: { value: "production", sensitivity: "public" },
      bundle_id: { value: "com.example.app", sensitivity: "private" },
      app_store_connect_api_key: { sensitivity: "secret_ref", secretRef: "secret://apple/key" },
    },
  });

  assert.equal(redacted.fields.track.value, "production");
  assert.equal(redacted.fields.bundle_id.value, "redacted");
  assert.equal(redacted.fields.app_store_connect_api_key.value, null);
  assert.equal(redacted.fields.app_store_connect_api_key.secretRef, "secret://apple/key");
});
