import { test } from "vitest";
import assert from "node:assert/strict";

import {
  NEED_OPPORTUNITY_KINDS,
  NEED_ROUTE_DIMENSIONS,
  NEED_ROUTE_MATURITY_STATES,
  dedupeNeedOpportunities,
  evaluateNeedRoutes,
  generateNeedRoutes,
  listNeedRoutePilotPacks,
} from "./index.ts";

test("need route lab exposes composable dimensions and the agreed maturity model", () => {
  assert.deepEqual(NEED_ROUTE_MATURITY_STATES, [
    "idea",
    "observed_gap",
    "candidate",
    "accepted",
    "planned",
    "active",
    "validating",
    "shipped",
    "parked",
    "rejected",
  ]);
  assert.deepEqual(NEED_OPPORTUNITY_KINDS, [
    "feature",
    "subfeature",
    "bug",
    "refactor",
    "test",
    "docs",
    "data",
    "surface",
    "validation",
    "security",
    "perf",
    "research",
  ]);
  assert.deepEqual(NEED_ROUTE_DIMENSIONS.map((dimension) => dimension.id), [
    "human_intent",
    "autonomy_preference",
    "domain",
    "target_surface",
    "agent_topology",
    "infrastructure",
    "data_state",
    "permission_risk",
    "deliverable",
    "validation_mode",
  ]);
});

test("need route lab starts with the four agreed pilot packs", () => {
  assert.deepEqual(listNeedRoutePilotPacks().map((pack) => pack.id), [
    "agent_workflow",
    "app_building_deploy",
    "infra_remote",
    "iot_home",
  ]);
  assert.equal(generateNeedRoutes().length, 4);
  assert.equal(generateNeedRoutes({ pilotPackId: "iot_home" })[0]?.id, "route_new_light_control_surface");
});

test("need route evaluations produce scored opportunities and external pending markers", () => {
  const evaluations = evaluateNeedRoutes(generateNeedRoutes());
  const opportunities = evaluations.flatMap((evaluation) => evaluation.opportunities);
  assert.equal(evaluations.length, 4);
  assert.ok(opportunities.some((opportunity) => opportunity.kind === "bug" && opportunity.id.endsWith(".collections_schema_inspectability")));
  assert.ok(opportunities.some((opportunity) => opportunity.externalPending && opportunity.affectedSurfaces.includes("iot")));
  assert.ok(opportunities.every((opportunity) => opportunity.score.total >= 0 && opportunity.score.total <= 10));
});

test("need opportunity dedupe uses stable fingerprints across routes", () => {
  const opportunities = evaluateNeedRoutes(generateNeedRoutes()).flatMap((evaluation) => evaluation.opportunities);
  const deduped = dedupeNeedOpportunities(opportunities);
  assert.ok(deduped.unique.length < opportunities.length);
  assert.ok(deduped.duplicates.some((entry) => entry.duplicateIds.length > 0));
  assert.equal(deduped.unique.filter((opportunity) => opportunity.title === "Track collection schema inspectability failures").length, 1);
});
