import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test("debt list and audit expose the report-only public ledger", async () => {
  const list = await runCliCapture(["debt", "list", "--classification", "external_pending", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = JSON.parse(list.stdout) as {
    ok: boolean;
    meta: { canonicalCommand: string; subcommand: string };
    data: { mode: string; entries: Array<{ classification: string; privacy: string; summary: string; risk: string }> };
  };
  assert.equal(listPayload.ok, true);
  assert.equal(listPayload.meta.canonicalCommand, "debt");
  assert.equal(listPayload.meta.subcommand, "list");
  assert.equal(listPayload.data.mode, "report_only");
  assert.equal(listPayload.data.entries.every((entry) => entry.classification === "external_pending"), true);
  assert.equal(listPayload.data.entries.some((entry) => entry.privacy !== "private"), true);
  assert.equal(listPayload.data.entries.some((entry) => entry.summary.includes("/Users/") || entry.risk.includes("/Users/")), false);

  const audit = await runCliCapture(["debt", "audit", "--json"], process.cwd());
  assert.equal(audit.code, CLI_EXIT_OK);
  const auditPayload = JSON.parse(audit.stdout) as {
    data: { audit: { ok: boolean; mode: string; unindexedCandidates: unknown[]; privateSummary: { included: boolean } } };
  };
  assert.equal(auditPayload.data.audit.ok, true);
  assert.equal(auditPayload.data.audit.mode, "report_only");
  assert.equal(Array.isArray(auditPayload.data.audit.unindexedCandidates), true);
  assert.equal(auditPayload.data.audit.privateSummary.included, false);
});

test("debt sources federate Clawix and ClawJS public repos from an overlay cwd", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-debt-overlay-"));
  const overlayRoot = path.join(tempRoot, "Clawix");
  const clawixRoot = path.join(overlayRoot, "clawix");
  const clawjsRoot = path.join(tempRoot, "clawjs");

  writeFixtureFile(overlayRoot, "AGENTS.md", "Private overlay; public debt is projected from public repos only.\n");
  writeFixtureFile(clawixRoot, "AGENTS.md", "Clawix public entrypoint.\n");
  writeFixtureFile(clawixRoot, "docs/decision-map.md", "Clawix public decision map.\n");
  writeFixtureFile(clawixRoot, "docs/code-hygiene-baseline.json", JSON.stringify({ schemaVersion: 1, entries: [] }));

  writeFixtureFile(clawjsRoot, "package.json", JSON.stringify({ name: "@clawjs/debt-fixture", type: "module" }));
  fs.mkdirSync(path.join(clawjsRoot, "packages", "clawjs-core"), { recursive: true });
  writeFixtureFile(clawjsRoot, "docs/decision-map.md", "ClawJS public decision map.\n");
  writeFixtureFile(clawjsRoot, "docs/code-hygiene-baseline.json", JSON.stringify({ schemaVersion: 1, entries: [] }));

  const sources = await runCliCapture(["debt", "sources", "--json"], overlayRoot);
  assert.equal(sources.code, CLI_EXIT_OK);
  const payload = JSON.parse(sources.stdout) as { data: { sources: Array<{ repo: string; path: string }> } };
  assert.equal(payload.data.sources.some((source) => source.repo === "clawjs" && source.path === "docs/code-hygiene-baseline.json"), true);
  assert.equal(payload.data.sources.some((source) => source.repo === "clawix" && source.path === "docs/code-hygiene-baseline.json"), true);
  assert.equal(payload.data.sources.filter((source) => source.path === "docs/code-hygiene-baseline.json").length, 2);
});

test("debt sources, show, inspect, and search expose stable discovery", async () => {
  const sources = await runCliCapture(["debt", "sources", "--json"], process.cwd());
  assert.equal(sources.code, CLI_EXIT_OK);
  const sourcesPayload = JSON.parse(sources.stdout) as { data: { sources: Array<{ path: string; status: string }> } };
  assert.equal(sourcesPayload.data.sources.some((source) => source.path === "docs/code-hygiene-baseline.json"), true);

  const list = await runCliCapture(["debt", "list", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = JSON.parse(list.stdout) as { data: { entries: Array<{ id: string }> } };
  const first = listPayload.data.entries[0];
  assert.ok(first);

  const show = await runCliCapture(["debt", "show", first.id, "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const showPayload = JSON.parse(show.stdout) as { data: { entry: { id: string } } };
  assert.equal(showPayload.data.entry.id, first.id);

  const inspect = await runCliCapture(["inspect", "debt-ledger", "--json"], process.cwd());
  assert.equal(inspect.code, CLI_EXIT_OK);
  const inspectPayload = JSON.parse(inspect.stdout) as { ok: boolean; data: { schemaVersion: number; entries: unknown[] } };
  assert.equal(inspectPayload.ok, true);
  assert.equal(inspectPayload.data.schemaVersion, 1);
  assert.equal(Array.isArray(inspectPayload.data.entries), true);

  const search = await runCliCapture(["search", "debt", "pending", "ledger", "external", "pending", "lateral_debt", "--json"], process.cwd());
  assert.equal(search.code, CLI_EXIT_OK);
  const searchPayload = JSON.parse(search.stdout) as { data: { results: Array<{ path: string }> } };
  assert.equal(searchPayload.data.results.some((result) => result.path === "docs/debt-ledger.md"), true);
});

test("debt list accepts needs-action filter", async () => {
  const list = await runCliCapture(["debt", "list", "--needs-action", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const payload = JSON.parse(list.stdout) as { data: { entries: unknown[]; summary: { missingActionability?: number; aliasHits?: number } } };
  assert.equal(Array.isArray(payload.data.entries), true);
  assert.equal(typeof payload.data.summary.missingActionability, "number");
  assert.equal(typeof payload.data.summary.aliasHits, "number");
});
