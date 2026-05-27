#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const selfTest = process.argv.includes("--self-test");

const processPath = "docs/governance/rfc-process.md";
const templatePath = "docs/rfcs/TEMPLATE.md";
const registryPath = "docs/rfcs/registry.json";
const assertionPath = "docs/constitution.assertions.json";
const discoverabilityPath = "docs/discoverability.registry.json";

const statuses = new Set(["draft", "review", "accepted", "rejected", "withdrawn", "superseded"]);
const proposalKinds = new Set(["canonical_type", "user_profile_attribute", "standard", "constitutional_amendment"]);
const vi4Criteria = new Set(["universal", "digital_workflow", "multi_surface_reuse", "human_recognizable"]);
const amendmentTiers = new Set(["editorial", "expansion", "structural"]);

function absolute(relativePath) {
  return path.join(rootDir, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function readTestDocsRouteText() {
  const packageJson = read("package.json");
  if (!packageJson.includes("scripts/test-docs-runner.mjs")) return packageJson;
  return exists("scripts/test-docs-runner.mjs")
    ? `${packageJson}\n${read("scripts/test-docs-runner.mjs")}`
    : packageJson;
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function publicUrl(value) {
  return typeof value === "string" && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:discussions|issues|pull)\/\d+(?:[#?][^\s]*)?$/u.test(value);
}

function validateRequiredText(relativePath, snippets, errors) {
  if (!exists(relativePath)) {
    errors.push(`missing ${relativePath}`);
    return;
  }
  const text = read(relativePath);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${relativePath} is missing required snippet: ${snippet}`);
  }
}

function validateRegistry(errors, registry = readJson(registryPath)) {
  if (registry.version !== 1) errors.push("docs/rfcs/registry.json version must be 1");
  if (!Array.isArray(registry.rfcs)) errors.push("docs/rfcs/registry.json rfcs must be an array");
  const seen = new Set();
  for (const rfc of registry.rfcs ?? []) {
    const label = rfc.id ?? "<missing id>";
    if (!/^RFC-\d{4}$/u.test(rfc.id ?? "")) errors.push(`${label} id must match RFC-0001 style`);
    if (seen.has(rfc.id)) errors.push(`${label} is duplicated`);
    seen.add(rfc.id);
    if (!rfc.title || typeof rfc.title !== "string") errors.push(`${label} title is required`);
    if (!statuses.has(rfc.status)) errors.push(`${label} has invalid status ${rfc.status}`);
    if (!proposalKinds.has(rfc.proposalKind)) errors.push(`${label} has invalid proposalKind ${rfc.proposalKind}`);
    if (rfc.discussionUrl !== null && !publicUrl(rfc.discussionUrl)) {
      errors.push(`${label} discussionUrl must be a public GitHub Discussion, issue, or pull request URL`);
    }
    if (!Array.isArray(rfc.constitutionalPrinciples) || rfc.constitutionalPrinciples.length === 0) {
      errors.push(`${label} constitutionalPrinciples must be a non-empty array`);
    }
    if (!Array.isArray(rfc.affectedSurfaces) || rfc.affectedSurfaces.length === 0) {
      errors.push(`${label} affectedSurfaces must be a non-empty array`);
    }
    if (!Array.isArray(rfc.decisionRefs)) errors.push(`${label} decisionRefs must be an array`);
    if (rfc.status !== "draft" && !publicUrl(rfc.discussionUrl)) {
      errors.push(`${label} non-draft RFCs require a public discussionUrl`);
    }
    if (rfc.status === "accepted") {
      const signoff = rfc.maintainerSignoff;
      if (!signoff || typeof signoff !== "object") errors.push(`${label} accepted RFC requires maintainerSignoff`);
      if (!signoff?.signedBy) errors.push(`${label} accepted RFC requires maintainerSignoff.signedBy`);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(signoff?.signedAt ?? "")) errors.push(`${label} accepted RFC requires maintainerSignoff.signedAt`);
      if (!publicUrl(signoff?.decisionUrl)) errors.push(`${label} accepted RFC requires public maintainerSignoff.decisionUrl`);
      if ((rfc.decisionRefs ?? []).length === 0) errors.push(`${label} accepted RFC requires decisionRefs`);
    } else if (rfc.maintainerSignoff !== null && rfc.maintainerSignoff !== undefined) {
      errors.push(`${label} maintainerSignoff must be null until acceptance`);
    }
    if (["rejected", "withdrawn"].includes(rfc.status) && !rfc.resolution) {
      errors.push(`${label} ${rfc.status} RFC requires resolution`);
    }
    if (rfc.status === "superseded" && !rfc.supersededBy) {
      errors.push(`${label} superseded RFC requires supersededBy`);
    }
    validateProposalSpecificFields(rfc, label, errors);
  }
}

function validateProposalSpecificFields(rfc, label, errors) {
  if (rfc.proposalKind === "canonical_type") {
    const evidence = rfc.canonicalTypeEvidence;
    if (!evidence || typeof evidence !== "object") errors.push(`${label} canonical_type requires canonicalTypeEvidence`);
    const criteria = evidence?.criteria ?? [];
    if (!Array.isArray(criteria) || !criteria.some((criterion) => vi4Criteria.has(criterion))) {
      errors.push(`${label} canonical_type must prove at least one VI.4 criterion`);
    }
    for (const field of ["schemaNotes", "relationshipNotes", "migrationNotes", "visualRepresentationNotes"]) {
      if (!evidence?.[field]) errors.push(`${label} canonical_type requires canonicalTypeEvidence.${field}`);
    }
  }
  if (rfc.proposalKind === "user_profile_attribute") {
    const evidence = rfc.userProfileAttributeEvidence;
    if (!evidence || typeof evidence !== "object") errors.push(`${label} user_profile_attribute requires userProfileAttributeEvidence`);
    for (const field of ["agentBenefit", "portabilityNotes", "privacyNotes", "thirdPartyBenefitBan"]) {
      if (!evidence?.[field]) errors.push(`${label} user_profile_attribute requires userProfileAttributeEvidence.${field}`);
    }
    if (evidence?.thirdPartyBenefitBan !== true) {
      errors.push(`${label} user_profile_attribute must set thirdPartyBenefitBan to true`);
    }
  }
  if (rfc.proposalKind === "standard") {
    const evidence = rfc.standardEvidence;
    if (!evidence || typeof evidence !== "object") errors.push(`${label} standard requires standardEvidence`);
    for (const field of ["dataShape", "operationsOrProtocol", "compatibility", "conformance", "discoveryRoute"]) {
      if (!evidence?.[field]) errors.push(`${label} standard requires standardEvidence.${field}`);
    }
  }
  if (rfc.proposalKind === "constitutional_amendment") {
    const evidence = rfc.constitutionalAmendmentEvidence;
    if (!evidence || typeof evidence !== "object") errors.push(`${label} constitutional_amendment requires constitutionalAmendmentEvidence`);
    if (!amendmentTiers.has(evidence?.tier)) errors.push(`${label} constitutional amendment requires valid tier`);
    if (evidence?.tier === "structural" && evidence?.minimumPublicDiscussionDays !== 30) {
      errors.push(`${label} structural amendment requires minimumPublicDiscussionDays: 30`);
    }
  }
}

function validateRouting(errors) {
  const assertions = readJson(assertionPath).assertions ?? [];
  for (const principle of ["VI.4", "VI.9"]) {
    const assertion = assertions.find((entry) => entry.principle === principle);
    if (!assertion) {
      errors.push(`${principle} assertion is missing`);
      continue;
    }
    if (assertion.status !== "enforced") errors.push(`${principle} assertion must be enforced`);
    if (!assertion.canonicalDocs?.includes(processPath)) errors.push(`${principle} assertion must route to ${processPath}`);
    if (!assertion.protectorScripts?.includes("scripts/rfc-process-check.mjs")) {
      errors.push(`${principle} assertion must be protected by scripts/rfc-process-check.mjs`);
    }
  }

  const registry = readJson(discoverabilityPath);
  const processEntry = (registry.artifacts ?? []).find((entry) => entry.canonicalSource === processPath);
  if (!processEntry) {
    errors.push(`${processPath} is missing from docs/discoverability.registry.json`);
  } else {
    const queries = processEntry.searchQueries ?? [];
    if (!queries.some((entry) => /RFC/i.test(entry.query) && entry.expectPath === processPath)) {
      errors.push(`${processPath} discoverability entry must include an RFC search query`);
    }
  }

  for (const [relativePath, snippets] of [
    ["docs/canonical-data-catalog.md", ["RFC process", "rfc-process.md"]],
    ["docs/adr/0005-canonical-data-catalog.md", ["RFC process", processPath]],
    ["docs/constitution-map.md", ["rfc-process.md", "scripts/rfc-process-check.mjs"]],
    ["docs/decision-map.md", ["rfc-process.md", "scripts/rfc-process-check.mjs"]],
    ["skills/canonical-catalog-expansion/SKILL.md", ["RFC process", processPath]],
    ["package.json", ["rfc-process-check.mjs"]],
  ]) {
    const text = relativePath === "package.json" ? readTestDocsRouteText() : read(relativePath);
    for (const snippet of snippets) {
      if (!text.includes(snippet)) errors.push(`${relativePath} must mention ${snippet}`);
    }
  }
}

function runCheck(registry) {
  const errors = [];
  validateRequiredText(processPath, [
    "canonical data type promotion under VI.4",
    "canonical user-profile attribute standardization under VI.9",
    "public GitHub Discussion, issue, or pull request",
    "`draft`",
    "`review`",
    "`accepted`",
    "`rejected`",
    "`withdrawn`",
    "`superseded`",
    "maintainer signs off",
    "custom database or linked note is insufficient",
    "advertising, market segmentation, or third-party benefit",
    "at least thirty days of public discussion",
  ], errors);
  validateRequiredText(templatePath, [
    "Proposal Kind:",
    "Discussion URL:",
    "Maintainer Sign-off:",
    "For `canonical_type`",
    "For `user_profile_attribute`",
    "For `standard`",
    "For `constitutional_amendment`",
  ], errors);
  validateRegistry(errors, registry);
  validateRouting(errors);
  return errors;
}

function runSelfTest() {
  const goodRegistry = {
    version: 1,
    rfcs: [
      {
        id: "RFC-0001",
        title: "Accepted canonical type",
        status: "accepted",
        proposalKind: "canonical_type",
        discussionUrl: "https://github.com/clawic/clawjs/discussions/1",
        maintainerSignoff: {
          signedBy: "maintainer",
          signedAt: "2026-05-21",
          decisionUrl: "https://github.com/clawic/clawjs/pull/1"
        },
        constitutionalPrinciples: ["VI.4"],
        affectedSurfaces: ["data", "docs"],
        decisionRefs: ["docs/canonical-data-catalog.md"],
        canonicalTypeEvidence: {
          criteria: ["human_recognizable"],
          schemaNotes: "Sparse schema.",
          relationshipNotes: "Typed relations.",
          migrationNotes: "Additive.",
          visualRepresentationNotes: "Card, list, detail."
        }
      }
    ]
  };
  const errors = [];
  validateRegistry(errors, goodRegistry);
  assert.deepEqual(errors, []);

  const badRegistry = {
    version: 1,
    rfcs: [
      {
        id: "RFC-1",
        title: "Bad",
        status: "accepted",
        proposalKind: "user_profile_attribute",
        discussionUrl: "file:///private/session",
        maintainerSignoff: null,
        constitutionalPrinciples: [],
        affectedSurfaces: [],
        decisionRefs: [],
        userProfileAttributeEvidence: { thirdPartyBenefitBan: false }
      }
    ]
  };
  const badErrors = [];
  validateRegistry(badErrors, badRegistry);
  assert.ok(badErrors.some((error) => error.includes("id must match")));
  assert.ok(badErrors.some((error) => error.includes("public GitHub")));
  assert.ok(badErrors.some((error) => error.includes("maintainerSignoff")));
  assert.ok(badErrors.some((error) => error.includes("thirdPartyBenefitBan")));
  console.log("rfc-process-check self-test passed");
}

if (selfTest) {
  runSelfTest();
} else {
  const errors = runCheck();
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log("rfc-process-check passed");
}
