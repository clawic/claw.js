import { test } from "vitest";
import assert from "node:assert/strict";

import { BUILTIN_COLLECTIONS } from "../../index.ts";

// This ledger must stay empty in the final no-grandfathering state.
const CATALOG_METADATA_DEBT_BASELINE = new Set<string>([]);

const EVIDENCE_TAGS = new Set([
  "human_recognizable",
  "market_validated",
  "multi_domain_reuse",
  "agent_useful",
]);

const RELATION_KINDS = new Set([
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

const REQUIRED_REASONS = new Set([
  "identity",
  "integrity",
  "lifecycle",
  "relation_integrity",
]);

function getCatalogComplianceIssues(collection: (typeof BUILTIN_COLLECTIONS)[number]): string[] {
  const issues: string[] = [];

  if (!collection.catalog) {
    issues.push("missing catalog metadata");
  } else {
    if (collection.catalog.purpose.trim().length === 0) issues.push("empty catalog purpose");
    if (collection.catalog.evidence.length === 0) issues.push("missing catalog evidence");
    for (const tag of collection.catalog.evidence) {
      if (!EVIDENCE_TAGS.has(tag)) issues.push(`unknown evidence tag ${tag}`);
    }
  }

  for (const field of collection.fields) {
    if (field.required && !field.requiredReason) {
      issues.push(`${field.name} required without reason`);
    } else if (field.requiredReason && !REQUIRED_REASONS.has(field.requiredReason)) {
      issues.push(`${field.name} unknown required reason`);
    }

    if (field.type === "relation" && !field.relation?.kind) {
      issues.push(`${field.name} relation without semantic kind`);
    } else if (field.relation?.kind && !RELATION_KINDS.has(field.relation.kind)) {
      issues.push(`${field.name} unknown relation kind`);
    }
  }

  return issues;
}

test("catalog metadata debt ledger is empty in the final no-grandfathering state", () => {
  assert.equal(CATALOG_METADATA_DEBT_BASELINE.size, 0);
  const currentNames = new Set(BUILTIN_COLLECTIONS.map((collection) => collection.name));
  for (const name of CATALOG_METADATA_DEBT_BASELINE) {
    assert.ok(currentNames.has(name), `Catalog metadata debt ledger includes missing collection "${name}"`);
  }
});

test("catalog metadata debt ledger matches current non-compliant built-ins", () => {
  const nonCompliantNames = BUILTIN_COLLECTIONS
    .filter((collection) => getCatalogComplianceIssues(collection).length > 0)
    .map((collection) => collection.name)
    .sort();
  const debtNames = [...CATALOG_METADATA_DEBT_BASELINE].sort();

  assert.deepEqual(
    debtNames,
    nonCompliantNames,
    "Catalog metadata debt ledger must exactly match non-compliant built-ins; remove fixed collections and never hide new gaps.",
  );
});

test("collections outside the debt ledger declare purpose and evidence", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    if (CATALOG_METADATA_DEBT_BASELINE.has(collection.name)) continue;

    assert.deepEqual(getCatalogComplianceIssues(collection), [], `${collection.name} is outside the debt ledger`);
  }
});

test("built-in relation fields use specific semantic kinds", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    for (const field of collection.fields) {
      if (field.type !== "relation") continue;
      assert.notEqual(field.relation?.kind, "generic", `${collection.name}.${field.name} uses generic relation kind`);
    }
  }
});

test("catalog metadata is valid when present on any collection", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    if (collection.catalog) {
      assert.ok(collection.catalog.purpose.trim().length > 0, `${collection.name} catalog purpose is empty`);
      assert.ok(collection.catalog.evidence.length > 0, `${collection.name} catalog evidence is empty`);
      for (const tag of collection.catalog.evidence) {
        assert.ok(EVIDENCE_TAGS.has(tag), `${collection.name} uses unknown evidence tag "${tag}"`);
      }
    }

    for (const field of collection.fields) {
      for (const alias of field.aliases ?? []) {
        assert.equal(alias, alias.trim(), `${collection.name}.${field.name} alias has surrounding whitespace`);
        assert.ok(alias.length > 0, `${collection.name}.${field.name} has empty alias`);
      }

      if (field.requiredReason) {
        assert.ok(
          REQUIRED_REASONS.has(field.requiredReason),
          `${collection.name}.${field.name} uses unknown requiredReason "${field.requiredReason}"`,
        );
      }

      if (field.relation?.kind) {
        assert.ok(
          RELATION_KINDS.has(field.relation.kind),
          `${collection.name}.${field.name} uses unknown relation kind "${field.relation.kind}"`,
        );
      }
    }
  }
});
