import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BUILTIN_COLLECTIONS_BY_NAME,
  CATALOG_COVERAGE_NEEDS,
  CATALOG_COVERAGE_SCENARIOS,
  CATALOG_COVERAGE_WAVES,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  listCatalogCoverageNeeds,
} from "./index.ts";
import type {
  BuiltinCatalogEvidenceTag,
  BuiltinRelationKind,
} from "./builtins/_types.ts";

const EVIDENCE_TAGS = new Set<BuiltinCatalogEvidenceTag>([
  "human_recognizable",
  "market_validated",
  "multi_domain_reuse",
  "agent_useful",
]);

const RELATION_KINDS = new Set<BuiltinRelationKind>([
  "ownership",
  "membership",
  "participant",
  "line_item",
  "source_import",
  "attachment",
  "location",
  "temporal_event",
  "financial_transaction",
  "observation_sample",
  "dependency",
  "generic",
]);

const BANNED_BRAND_TERMS = [
  "stripe",
  "anki",
  "playtomic",
  "notion",
  "salesforce",
  "hubspot",
  "apple",
  "google",
  "airtable",
];

const KNOWN_COLLECTION_NAMES = new Set([
  ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
  ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
]);
const KNOWN_COLLECTIONS = new Map([
  ...BUILTIN_COLLECTIONS_BY_NAME.entries(),
  ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => [collection.name, collection] as const),
]);

test("catalog coverage ledger seeds at least one thousand generic needs", () => {
  assert.equal(CATALOG_COVERAGE_WAVES.length, 12);
  assert.equal(CATALOG_COVERAGE_SCENARIOS.length, 12);
  assert.equal(CATALOG_COVERAGE_NEEDS.length, 1008);

  for (const wave of CATALOG_COVERAGE_WAVES) {
    assert.equal(listCatalogCoverageNeeds({ wave: wave.id }).length, 84);
  }
});

test("catalog coverage need ids are stable and unique", () => {
  const ids = new Set<string>();
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.match(need.id, /^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+$/);
    assert.ok(!ids.has(need.id), `Duplicate coverage need id: ${need.id}`);
    ids.add(need.id);
  }
});

test("catalog coverage needs avoid branded provider vocabulary", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    const text = JSON.stringify(need).toLowerCase();
    for (const term of BANNED_BRAND_TERMS) {
      assert.ok(!text.includes(term), `Coverage need ${need.id} contains banned brand term ${term}`);
    }
  }
});

test("catalog coverage needs use supported evidence and relation semantics", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.ok(need.evidence.length > 0, `${need.id} has no evidence tags`);
    for (const tag of need.evidence) {
      assert.ok(EVIDENCE_TAGS.has(tag), `${need.id} uses unknown evidence tag ${tag}`);
    }

    assert.ok(need.requiredRelationships.length > 0, `${need.id} has no relationship needs`);
    for (const relation of need.requiredRelationships) {
      assert.ok(RELATION_KINDS.has(relation.kind), `${need.id} uses unknown relation kind ${relation.kind}`);
      assert.ok(relation.from.length > 0, `${need.id} relation ${relation.name} has no source entity`);
      assert.ok(relation.to.length > 0, `${need.id} relation ${relation.name} has no target entity`);
    }
  }
});

test("catalog coverage mappings point to existing canonical or custom collections", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.ok(
      need.coverage.status === "canonical" || need.coverage.status === "custom_database",
      `${need.id} uses non-final coverage status ${need.coverage.status}`,
    );
    assert.ok(need.coverage.collectionNames.length > 0, `${need.id} has no candidate collections`);
    for (const collectionName of need.coverage.collectionNames) {
      assert.ok(
        KNOWN_COLLECTION_NAMES.has(collectionName),
        `${need.id} maps to missing collection ${collectionName}`,
      );
    }
  }
});

test("catalog coverage mappings name fields and relation semantics", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.ok(need.coverage.fieldNames && need.coverage.fieldNames.length > 0, `${need.id} has no field mapping`);
    assert.ok(need.coverage.relationNames && need.coverage.relationNames.length > 0, `${need.id} has no relation mapping`);
    const availableFields = new Set(
      need.coverage.collectionNames.flatMap((collectionName) =>
        (KNOWN_COLLECTIONS.get(collectionName)?.fields ?? []).map((field) => field.name),
      ),
    );

    for (const fieldName of need.coverage.fieldNames) {
      assert.match(fieldName, /^[a-z][A-Za-z0-9]*$/, `${need.id} field mapping ${fieldName} is not camelCase`);
      assert.ok(availableFields.has(fieldName), `${need.id} maps missing field ${fieldName}`);
    }
    for (const relationName of need.coverage.relationNames) {
      assert.match(relationName, /^[a-z0-9_]+$/, `${need.id} relation mapping ${relationName} is not snake_case`);
    }
  }
});

test("candidate coverage mappings include built-in relation examples for each required semantic kind", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    if (need.coverage.status === "custom_database") continue;

    const relationKinds = new Set<BuiltinRelationKind>();
    for (const collectionName of need.coverage.collectionNames) {
      const collection = BUILTIN_COLLECTIONS_BY_NAME.get(collectionName);
      for (const field of collection?.fields ?? []) {
        if (field.type === "relation" && field.relation?.kind) relationKinds.add(field.relation.kind);
      }
    }

    for (const relation of need.requiredRelationships) {
      assert.ok(
        relationKinds.has(relation.kind),
        `${need.id} maps ${relation.kind} without a built-in relation example`,
      );
    }
  }
});
