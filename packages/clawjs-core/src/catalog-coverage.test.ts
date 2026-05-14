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

test("catalog coverage candidate mappings point to existing built-in collections", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.equal(need.coverage.status, "candidate_mapping");
    assert.ok(need.coverage.collectionNames.length > 0, `${need.id} has no candidate collections`);
    for (const collectionName of need.coverage.collectionNames) {
      assert.ok(
        KNOWN_COLLECTION_NAMES.has(collectionName),
        `${need.id} maps to missing collection ${collectionName}`,
      );
    }
  }
});
