import assert from "node:assert/strict";
import { test } from "vitest";

import {
  requiredSessionRenderFixtureIds,
  sessionRenderFixtures,
  sessionRenderMatrix,
  sessionRenderMatrixRowFor,
  sessionRenderMatrixRows,
} from "./render-matrix.ts";
import type { SessionStructuredEventKind } from "./types.ts";

const eventKinds = [
  "message",
  "tool_call",
  "tool_output",
  "patch",
  "lifecycle",
  "usage",
  "goal",
  "search",
  "subagent",
  "question",
  "mcp",
  "compaction",
  "rollback",
  "unknown",
] as const satisfies readonly SessionStructuredEventKind[];

test("session render matrix has one row for every structured event kind", () => {
  assert.deepEqual(Object.keys(sessionRenderMatrix).sort(), [...eventKinds].sort());
  assert.equal(sessionRenderMatrixRows.length, eventKinds.length);
  for (const eventKind of eventKinds) {
    assert.equal(sessionRenderMatrixRowFor(eventKind).eventKind, eventKind);
  }
});

test("session render matrix rows define bounded states, disclosure modes, localization keys, and expansion routes", () => {
  for (const row of sessionRenderMatrixRows) {
    assert.ok(row.collapsed.length > 0, `${row.eventKind} needs collapsed state`);
    assert.ok(row.active.length > 0, `${row.eventKind} needs active state`);
    assert.ok(row.expanded.length > 0, `${row.eventKind} needs expanded state`);
    assert.ok(row.everyday.length > 0, `${row.eventKind} needs everyday disclosure`);
    assert.ok(row.coding.length > 0, `${row.eventKind} needs coding disclosure`);
    assert.ok(row.payloadSchema.length > 0, `${row.eventKind} needs payload schema`);
    assert.ok(row.producer.length > 0, `${row.eventKind} needs producer`);
    assert.ok(row.maxPreviewChars > 0 && row.maxPreviewChars <= 500, `${row.eventKind} preview must be capped`);
    assert.ok(row.maxDetailBytes > 0 && row.maxDetailBytes <= 64 * 1024, `${row.eventKind} detail must be capped`);
    assert.ok(row.expansionRoute.includes(":sessionId"), `${row.eventKind} expansion route needs session id`);
    assert.ok(row.expansionRoute.includes(":turnId"), `${row.eventKind} expansion route needs turn id`);
    assert.ok(row.expansionRoute.includes(":eventKind"), `${row.eventKind} expansion route needs event kind`);
    assert.ok(row.outcomes.includes("unknown_fallback"), `${row.eventKind} needs unknown fallback outcome`);
    assert.ok(row.localizationKeys.length >= 6, `${row.eventKind} needs localization keys`);
    for (const key of row.localizationKeys) {
      assert.match(key, /^sessions\.render\.[a-z_]+\.[a-z_]+$/u);
      assert.equal(key.includes(row.eventKind), true, `${row.eventKind} localization key should include event kind`);
    }
  }
});

test("session render matrix has fixtures for every row and required disclosure scenario", () => {
  const fixtureIds = new Set(sessionRenderFixtures.map((fixture) => fixture.id));
  for (const fixtureId of requiredSessionRenderFixtureIds) {
    assert.equal(fixtureIds.has(fixtureId), true, `missing required render fixture ${fixtureId}`);
  }

  for (const row of sessionRenderMatrixRows) {
    assert.ok(row.fixtures.length > 0, `${row.eventKind} needs at least one fixture`);
    for (const fixtureId of row.fixtures) {
      const fixture = sessionRenderFixtures.find((candidate) => candidate.id === fixtureId);
      assert.ok(fixture, `${row.eventKind} references missing fixture ${fixtureId}`);
      assert.equal(fixture.eventKind, row.eventKind, `${fixtureId} must point back to ${row.eventKind}`);
      assert.equal(row.outcomes.includes(fixture.outcome), true, `${fixtureId} outcome must be supported by ${row.eventKind}`);
    }
  }
});

test("unknown events render through a visible bounded fallback", () => {
  const row = sessionRenderMatrixRowFor("unknown");
  assert.equal(row.outcomes.includes("unknown_fallback"), true);
  assert.equal(row.fixtures.includes("unknown_event"), true);
  assert.ok(row.collapsed.includes("unknown"));
  assert.ok(row.everyday.includes("unsupported"));
  assert.ok(row.maxDetailBytes <= 16 * 1024);
});
