import assert from "node:assert/strict";
import { test } from "vitest";

import { clawCliCommandRegistry } from "../cli-command-registry.ts";
import {
  KEYWORD_ROUTER_SCHEMA_VERSION,
  findKeywordRouterConcept,
  findKeywordRouterConceptByCommand,
  listKeywordRouterCommands,
  listKeywordRouterConcepts,
  loadKeywordRouter,
  normalizeKeyword,
  relatedKeywordSuggestions,
  routeKeywords,
} from "./keyword-router.ts";

test("loadKeywordRouter returns the curated document with the expected schema version", () => {
  const document = loadKeywordRouter();
  assert.equal(document.schemaVersion, KEYWORD_ROUTER_SCHEMA_VERSION);
  assert.ok(document.summary.length > 0);
  assert.ok(document.concepts.length >= 20, `expected at least 20 concepts, got ${document.concepts.length}`);
});

test("every concept declares all required fields and a non-empty keyword set", () => {
  for (const concept of listKeywordRouterConcepts()) {
    assert.ok(concept.id, "concept id");
    assert.ok(concept.primaryCommand, `concept ${concept.id} primaryCommand`);
    assert.ok(concept.summary, `concept ${concept.id} summary`);
    assert.ok(concept.useWhen, `concept ${concept.id} useWhen`);
    assert.ok(concept.exampleInvocation, `concept ${concept.id} exampleInvocation`);
    assert.ok(concept.antiPattern, `concept ${concept.id} antiPattern`);
    assert.ok(concept.family, `concept ${concept.id} family`);
    assert.ok(Array.isArray(concept.keywords) && concept.keywords.length >= 2, `concept ${concept.id} keywords`);
    assert.ok(Array.isArray(concept.relatedConcepts), `concept ${concept.id} relatedConcepts`);
  }
});

test("concept ids are unique", () => {
  const ids = listKeywordRouterConcepts().map((concept) => concept.id);
  const seen = new Set(ids);
  assert.equal(seen.size, ids.length, `expected unique ids, got duplicates in ${ids.join(", ")}`);
});

test("relatedConcepts only point at known concept ids", () => {
  const ids = new Set(listKeywordRouterConcepts().map((concept) => concept.id));
  for (const concept of listKeywordRouterConcepts()) {
    for (const related of concept.relatedConcepts) {
      assert.ok(ids.has(related), `concept ${concept.id} references unknown related concept ${related}`);
    }
  }
});

test("normalizeKeyword lowercases, trims and strips diacritics", () => {
  assert.equal(normalizeKeyword("Tarea"), "tarea");
  assert.equal(normalizeKeyword("  decisión  "), "decision");
  assert.equal(normalizeKeyword("Aprobación"), "aprobacion");
});

test("routeKeywords returns the task concept first for task-like inputs", () => {
  const matches = routeKeywords(["task"], { limit: 3 });
  assert.ok(matches.length > 0);
  assert.equal(matches[0]!.concept.id, "task");
  assert.equal(matches[0]!.concept.primaryCommand, "tasks");
});

test("routeKeywords matches Spanish synonyms", () => {
  const matches = routeKeywords(["tarea"], { limit: 1 });
  assert.equal(matches[0]?.concept.id, "task");
});

test("routeKeywords resolves unified instruction governance", () => {
  const matches = routeKeywords(["instructions"], { limit: 1 });
  assert.equal(matches[0]?.concept.id, "instructions");
  assert.equal(matches[0]?.concept.primaryCommand, "instructions");
});

test("routeKeywords accepts multiple keywords and ranks intersecting concepts higher", () => {
  const matches = routeKeywords(["task", "deadline", "blocker"], { limit: 6 });
  const ids = matches.map((match) => match.concept.id);
  assert.ok(ids.includes("task"));
  assert.ok(ids.includes("deadline"));
  assert.ok(ids.includes("blocker"));
});

test("routeKeywords with empty inputs returns no matches", () => {
  assert.deepEqual(routeKeywords([]), []);
  assert.deepEqual(routeKeywords([""]), []);
});

test("findKeywordRouterConcept and findKeywordRouterConceptByCommand resolve known entries", () => {
  assert.equal(findKeywordRouterConcept("task")?.primaryCommand, "tasks");
  assert.equal(findKeywordRouterConceptByCommand("decisions")?.id, "decision");
  assert.equal(findKeywordRouterConcept("does-not-exist"), undefined);
});

test("relatedKeywordSuggestions returns a compact, scored suggestion list", () => {
  const suggestions = relatedKeywordSuggestions("tarea bloqueo", { limit: 4 });
  assert.ok(suggestions.length > 0);
  const top = suggestions[0]!;
  assert.ok(top.primaryCommand);
  assert.ok(top.exampleInvocation);
  assert.ok(top.score > 0);
});

test("every concept's primaryCommand resolves to a registered CLI command", () => {
  const registered = new Set(clawCliCommandRegistry.commands.map((entry) => entry.name));
  const allowSoonToExist = new Set(["router", "about"]);
  for (const concept of listKeywordRouterConcepts()) {
    if (allowSoonToExist.has(concept.primaryCommand)) continue;
    assert.ok(
      registered.has(concept.primaryCommand),
      `concept ${concept.id} primaryCommand ${concept.primaryCommand} is not in clawCliCommandRegistry`,
    );
  }
});

test("listKeywordRouterCommands returns sorted unique command names", () => {
  const names = listKeywordRouterCommands();
  const sorted = [...names].sort();
  assert.deepEqual(names, sorted);
  assert.equal(new Set(names).size, names.length);
});
