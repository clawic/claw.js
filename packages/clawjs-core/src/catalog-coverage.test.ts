import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BUILTIN_COLLECTIONS_BY_NAME,
  CATALOG_AUDITED_ARCHETYPES,
  CATALOG_AUDITED_BATCHES,
  CATALOG_AUDITED_NEEDS,
  CATALOG_COVERAGE_NEEDS,
  CATALOG_COVERAGE_SCENARIOS,
  CATALOG_COVERAGE_WAVES,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  listCatalogAuditedNeeds,
  listCatalogCoverageNeeds,
  summarizeCatalogAuditedBatch,
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

test("audited catalog expansion ledger locks the selected 120 archetype target", () => {
  assert.deepEqual(CATALOG_AUDITED_BATCHES.map((batch) => batch.id), [
    "commerce_billing_procurement",
    "learning_assessment",
    "sports_booking_venues",
    "health_fitness_care",
    "home_property_possessions",
    "work_hr_legal_ops",
    "crm_support_growth",
    "personal_memory_documents",
  ]);
  assert.equal(CATALOG_AUDITED_ARCHETYPES.length, 120);
  assert.equal(CATALOG_AUDITED_NEEDS.length, 1440);

  for (const batch of CATALOG_AUDITED_BATCHES) {
    assert.equal(CATALOG_AUDITED_ARCHETYPES.filter((archetype) => archetype.batch === batch.id).length, 15);
    assert.equal(listCatalogAuditedNeeds({ batch: batch.id }).length, 180);
  }
  assert.deepEqual(CATALOG_AUDITED_BATCHES.map((batch) => [batch.id, batch.status]), [
    ["commerce_billing_procurement", "audited"],
    ["learning_assessment", "audited"],
    ["sports_booking_venues", "audited"],
    ["health_fitness_care", "audited"],
    ["home_property_possessions", "audited"],
    ["work_hr_legal_ops", "audited"],
    ["crm_support_growth", "audited"],
    ["personal_memory_documents", "audited"],
  ]);
});

test("catalog coverage need ids are stable and unique", () => {
  const ids = new Set<string>();
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.match(need.id, /^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+$/);
    assert.ok(!ids.has(need.id), `Duplicate coverage need id: ${need.id}`);
    ids.add(need.id);
  }
});

test("audited catalog need ids and mappings are stable and final", () => {
  const ids = new Set<string>();
  for (const need of CATALOG_AUDITED_NEEDS) {
    assert.match(need.id, /^[a-z0-9_]+\.[a-z0-9_]+$/);
    assert.ok(!ids.has(need.id), `Duplicate audited coverage need id: ${need.id}`);
    ids.add(need.id);
    assert.ok(need.workflow.length > 0, `${need.id} has no workflow`);
    assert.ok(need.humanValue.length > 0, `${need.id} has no human value`);
    assert.ok(need.requiredEntities.length > 0, `${need.id} has no required entities`);
    assert.ok(need.requiredFields.length > 0, `${need.id} has no required fields`);
    assert.ok(need.fieldMappings.length > 0, `${need.id} has no field mappings`);
    assert.ok(need.relationMappings.length > 0, `${need.id} has no relation mappings`);
    assert.ok(need.coverage.confidence === "high" || need.coverage.confidence === "medium", `${need.id} has invalid confidence`);
    assert.notEqual(need.coverage.status, "gap", `${need.id} closes with an unresolved gap`);
  }
});

test("catalog coverage needs avoid branded provider vocabulary", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    const text = JSON.stringify(need).toLowerCase();
    for (const term of BANNED_BRAND_TERMS) {
      assert.ok(!text.includes(term), `Coverage need ${need.id} contains banned brand term ${term}`);
    }
  }

  for (const need of CATALOG_AUDITED_NEEDS) {
    const text = JSON.stringify(need).toLowerCase();
    for (const term of BANNED_BRAND_TERMS) {
      assert.ok(!text.includes(term), `Audited coverage need ${need.id} contains banned brand term ${term}`);
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

  for (const archetype of CATALOG_AUDITED_ARCHETYPES) {
    assert.ok(archetype.valueProposition.length > 0, `${archetype.id} has no value proposition`);
    assert.ok(archetype.workflow.length > 0, `${archetype.id} has no workflow`);
    assert.ok(archetype.collectionNames.length > 0, `${archetype.id} has no collection mappings`);
    for (const tag of archetype.evidence) {
      assert.ok(EVIDENCE_TAGS.has(tag), `${archetype.id} uses unknown evidence tag ${tag}`);
    }
  }

  for (const need of CATALOG_AUDITED_NEEDS) {
    assert.ok(need.evidence.length > 0, `${need.id} has no evidence tags`);
    for (const tag of need.evidence) {
      assert.ok(EVIDENCE_TAGS.has(tag), `${need.id} uses unknown evidence tag ${tag}`);
    }
    for (const relation of need.requiredRelationships) {
      assert.ok(RELATION_KINDS.has(relation.kind), `${need.id} uses unknown relation kind ${relation.kind}`);
    }
  }
});

test("catalog coverage mappings point to existing canonical or custom collections", () => {
  for (const need of CATALOG_COVERAGE_NEEDS) {
    assert.ok(
      need.coverage.status === "canonical" || need.coverage.status === "custom_database",
      `${need.id} uses non-final coverage status ${need.coverage.status}`,
    );
    assert.ok(need.coverage.collectionNames.length > 0, `${need.id} has no mapped collections`);
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

test("audited coverage mappings point to exact fields and relation fields", () => {
  for (const need of CATALOG_AUDITED_NEEDS) {
    for (const collectionName of need.coverage.collectionNames) {
      assert.ok(KNOWN_COLLECTION_NAMES.has(collectionName), `${need.id} maps to missing collection ${collectionName}`);
    }

    for (const mapping of need.fieldMappings) {
      const collection = KNOWN_COLLECTIONS.get(mapping.collectionName);
      assert.ok(collection, `${need.id} maps field on missing collection ${mapping.collectionName}`);
      const field = collection?.fields.find((candidate) => candidate.name === mapping.fieldName);
      assert.ok(field, `${need.id} maps missing field ${mapping.collectionName}.${mapping.fieldName}`);
      assert.match(mapping.fieldName, /^[a-z][A-Za-z0-9]*$/, `${need.id} field ${mapping.fieldName} is not camelCase`);
    }

    for (const mapping of need.relationMappings) {
      const collection = KNOWN_COLLECTIONS.get(mapping.collectionName);
      assert.ok(collection, `${need.id} maps relation on missing collection ${mapping.collectionName}`);
      const field = collection?.fields.find((candidate) => candidate.name === mapping.fieldName);
      assert.ok(field, `${need.id} maps missing relation ${mapping.collectionName}.${mapping.fieldName}`);
      assert.equal(field?.type, "relation", `${need.id} maps ${mapping.collectionName}.${mapping.fieldName} but it is not a relation`);
      assert.equal(field?.relation?.collectionName, mapping.targetCollectionName, `${need.id} maps relation target incorrectly`);
      assert.equal(field?.relation?.kind, mapping.kind, `${need.id} maps relation semantic kind incorrectly`);
    }
  }
});

test("audited reviewed aliases are registered on canonical fields", () => {
  for (const need of CATALOG_AUDITED_NEEDS) {
    for (const mapping of need.fieldMappings) {
      if (!mapping.aliasesReviewed?.length) continue;

      const collection = KNOWN_COLLECTIONS.get(mapping.collectionName);
      assert.ok(collection, `${need.id} maps alias on missing collection ${mapping.collectionName}`);
      const field = collection?.fields.find((candidate) => candidate.name === mapping.fieldName);
      assert.ok(field, `${need.id} maps alias on missing field ${mapping.collectionName}.${mapping.fieldName}`);

      const fieldAliases = new Set(field?.aliases ?? []);
      for (const alias of mapping.aliasesReviewed) {
        assert.ok(
          fieldAliases.has(alias),
          `${need.id} reviewed alias ${alias} is not registered on ${mapping.collectionName}.${mapping.fieldName}`,
        );
      }
    }
  }
});

test("audited non-commerce batches use domain-specific mappings instead of commerce placeholders", () => {
  const auditedNonCommerceArchetypes = new Map(
    CATALOG_AUDITED_ARCHETYPES
      .filter((archetype) => archetype.batch !== "commerce_billing_procurement")
      .filter((archetype) => CATALOG_AUDITED_BATCHES.find((batch) => batch.id === archetype.batch)?.status === "audited")
      .map((archetype) => [archetype.id, new Set(archetype.collectionNames)]),
  );

  for (const need of CATALOG_AUDITED_NEEDS.filter((candidate) => auditedNonCommerceArchetypes.has(candidate.archetypeId))) {
    const allowedCollections = auditedNonCommerceArchetypes.get(need.archetypeId);
    assert.ok(allowedCollections, `${need.id} has no matching audited archetype`);

    const mappedCollections = [
      ...need.fieldMappings.map((mapping) => mapping.collectionName),
      ...need.relationMappings.map((mapping) => mapping.collectionName),
    ];
    assert.ok(
      mappedCollections.some((collectionName) => allowedCollections?.has(collectionName)),
      `${need.id} does not map to any collection declared by its learning archetype`,
    );
    assert.equal(
      mappedCollections.some((collectionName) => ["orders", "invoices", "charges", "balance_transactions"].includes(collectionName)),
      false,
      `${need.id} still maps to a commerce placeholder collection outside the commerce batch`,
    );
  }
});

test("audited batch reports expose progress and keep closure debt explicit", () => {
  for (const batch of CATALOG_AUDITED_BATCHES) {
    const report = summarizeCatalogAuditedBatch(batch.id);
    assert.equal(report.status, batch.status);
    assert.equal(report.archetypes, 15);
    assert.equal(report.needs, 180);
    assert.equal(report.gaps, 0);
    assert.equal(report.jsonAuditDebt, 0);
    if (batch.status === "audited") {
      assert.equal(report.domainMappedNeeds, 180);
      assert.equal(report.seededNeeds, 0);
      assert.ok(report.customDatabaseBoundaries > 0);
    } else {
      assert.equal(report.domainMappedNeeds, 0);
      assert.equal(report.seededNeeds, 180);
      assert.equal(report.customDatabaseBoundaries, 0);
      assert.equal(report.additiveChanges, 0);
    }
  }
  assert.equal(summarizeCatalogAuditedBatch("commerce_billing_procurement").additiveChanges, 30);
  assert.equal(summarizeCatalogAuditedBatch("learning_assessment").additiveChanges, 0);
  assert.equal(summarizeCatalogAuditedBatch("sports_booking_venues").additiveChanges, 0);
  assert.equal(summarizeCatalogAuditedBatch("health_fitness_care").additiveChanges, 0);
  assert.equal(summarizeCatalogAuditedBatch("learning_assessment").customDatabaseBoundaries, 15);
  assert.equal(summarizeCatalogAuditedBatch("sports_booking_venues").customDatabaseBoundaries, 30);
  assert.equal(summarizeCatalogAuditedBatch("health_fitness_care").customDatabaseBoundaries, 30);
});

test("canonical coverage mappings include built-in relation examples for each required semantic kind", () => {
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
