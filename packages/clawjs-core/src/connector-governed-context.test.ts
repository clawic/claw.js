import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER,
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS,
  buildConnectorContextDoctorReport,
  explainConnectorContextChoice,
  getConnectorGovernedContextProviderSchema,
  redactConnectorContextRecord,
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
