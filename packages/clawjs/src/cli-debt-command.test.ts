import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
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

test("debt list honors explicit false needs-action flags", async () => {
  const all = await runCliCapture(["debt", "list", "--json"], process.cwd());
  assert.equal(all.code, CLI_EXIT_OK);
  const allPayload = JSON.parse(all.stdout) as { data: { entries: Array<{ id: string }> } };

  const explicitFalse = await runCliCapture(["debt", "list", "--needs-action", "false", "--json"], process.cwd());
  assert.equal(explicitFalse.code, CLI_EXIT_OK);
  const falsePayload = JSON.parse(explicitFalse.stdout) as { data: { entries: Array<{ id: string }> } };
  assert.deepEqual(falsePayload.data.entries.map((entry) => entry.id), allPayload.data.entries.map((entry) => entry.id));

  const invalid = await runCliCapture(["debt", "list", "--needs-action", "sometimes", "--json"], process.cwd());
  assert.equal(invalid.code, CLI_EXIT_USAGE);
  const invalidPayload = JSON.parse(invalid.stdout) as { ok: boolean; error: { code: string; status: string } };
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, "invalid_boolean_flag");
  assert.equal(invalidPayload.error.status, "USAGE");
});

test("debt list filters by strict debt control severity and release effect", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-debt-filter-"));
  writeFixtureFile(root, "docs/code-hygiene-baseline.json", JSON.stringify({
    schemaVersion: 1,
    entries: [{
      id: "release-blocking-control",
      ownerArea: "runtime",
      reason: "Runtime debt blocks release until reduced.",
      findingTypes: ["runtime"],
      expiresAt: "2099-01-01",
      debtControl: {
        ownerArea: "runtime",
        expiresAt: "2099-01-01",
        severity: "P1",
        budget: {
          metric: "runtime_debt",
          unit: "item",
          current: 2,
          maxAllowed: 2,
          nextMaxAllowed: 1,
          target: 0,
          cadence: "release",
        },
        releaseEffect: {
          mode: "blocks_release",
          targets: ["macos-release"],
          gate: "node scripts/runtime-check.mjs",
          reason: "P1 runtime debt must block release until it shrinks.",
        },
      },
    }],
  }));

  const list = await runCliCapture(["debt", "list", "--root", root, "--severity", "P1", "--release-effect", "blocks_release", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const payload = JSON.parse(list.stdout) as { data: { entries: Array<{ id: string; debtControl: { severity: string; releaseEffect: { mode: string } } }> } };
  assert.equal(payload.data.entries.length, 1);
  assert.equal(payload.data.entries[0]?.id, "release-blocking-control");
  assert.equal(payload.data.entries[0]?.debtControl.severity, "P1");
  assert.equal(payload.data.entries[0]?.debtControl.releaseEffect.mode, "blocks_release");
});

test("debt audit --strict exits non-zero when debt control cannot reduce debt", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-debt-strict-"));
  writeFixtureFile(root, "docs/code-hygiene-baseline.json", JSON.stringify({
    schemaVersion: 1,
    entries: [{
      id: "flat-budget-control",
      ownerArea: "runtime",
      reason: "Runtime debt has a non-decreasing budget.",
      findingTypes: ["runtime"],
      expiresAt: "2099-01-01",
      debtControl: {
        ownerArea: "runtime",
        expiresAt: "2099-01-01",
        severity: "P1",
        budget: {
          metric: "runtime_debt",
          unit: "item",
          current: 1,
          maxAllowed: 1,
          nextMaxAllowed: 1,
          target: 0,
          cadence: "release",
        },
        releaseEffect: {
          mode: "report_only",
          targets: [],
          gate: "node scripts/runtime-check.mjs",
          reason: "This fixture intentionally violates strict mode.",
        },
      },
    }],
  }));

  const audit = await runCliCapture(["debt", "audit", "--root", root, "--strict", "--json"], process.cwd());
  assert.equal(audit.code, CLI_EXIT_FAILURE);
  const payload = JSON.parse(audit.stdout) as { data: { strict: boolean; audit: { strictFailures: Array<{ id: string; reason: string }> } } };
  assert.equal(payload.data.strict, true);
  assert.equal(payload.data.audit.strictFailures.some((failure) => failure.id === "flat-budget-control" && failure.reason.includes("nextMaxAllowed")), true);
});

test("debt audit honors explicit false strict flags and rejects ambiguous values", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-debt-strict-flag-"));
  writeFixtureFile(root, "docs/code-hygiene-baseline.json", JSON.stringify({
    schemaVersion: 1,
    entries: [{
      id: "flat-budget-control",
      ownerArea: "runtime",
      reason: "Runtime debt has a non-decreasing budget.",
      findingTypes: ["runtime"],
      expiresAt: "2099-01-01",
      debtControl: {
        ownerArea: "runtime",
        expiresAt: "2099-01-01",
        severity: "P1",
        budget: {
          metric: "runtime_debt",
          unit: "item",
          current: 1,
          maxAllowed: 1,
          nextMaxAllowed: 1,
          target: 0,
          cadence: "release",
        },
        releaseEffect: {
          mode: "report_only",
          targets: [],
          gate: "node scripts/runtime-check.mjs",
          reason: "This fixture intentionally violates strict mode.",
        },
      },
    }],
  }));

  const explicitFalse = await runCliCapture(["debt", "audit", "--root", root, "--strict", "false", "--json"], process.cwd());
  assert.equal(explicitFalse.code, CLI_EXIT_OK);
  const falsePayload = JSON.parse(explicitFalse.stdout) as { data: { strict: boolean; audit: { strictFailures: unknown[] } } };
  assert.equal(falsePayload.data.strict, false);
  assert.equal(falsePayload.data.audit.strictFailures.length > 0, true);

  const ambiguous = await runCliCapture(["debt", "audit", "--root", root, "--strict", "sometimes", "--json"], process.cwd());
  assert.equal(ambiguous.code, CLI_EXIT_USAGE);
  const ambiguousPayload = JSON.parse(ambiguous.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(ambiguousPayload.ok, false);
  assert.equal(ambiguousPayload.error.code, "invalid_debt_strict");
});
