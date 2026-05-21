import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildClawDebtLedger,
  clawDebtLedgerEntrySchema,
  detectDebtLedgerRepositories,
} from "./debt-ledger.ts";

test("debt ledger normalizes baselines, external pending rows, and dedupes fingerprints", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-debt-ledger-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "code-hygiene-baseline.json"), JSON.stringify({
    schemaVersion: 1,
    entries: [{
      id: "baseline-one",
      ownerArea: "code",
      reason: "Retain public exports until API consumers are audited.",
      findingTypes: ["exports"],
      expiresAt: "2099-01-01",
    }, {
      id: "baseline-one-duplicate",
      ownerArea: "code",
      reason: "Retain public exports until API consumers are audited.",
      findingTypes: ["exports"],
      expiresAt: "2099-01-01",
    }],
  }));
  fs.writeFileSync(path.join(root, "docs", "surface-evidence-baseline.json"), JSON.stringify({
    version: 1,
    entries: [{
      id: "route-contract-gap",
      classification: "lateral_debt",
      owner: "runtime",
      reason: "Route contract needs standalone fiche.",
      risk: "Inspection works but source node is incomplete.",
      expires: "2099-01-01",
      nodeIds: ["claw.route.contract"],
      reentryCondition: "route change",
    }],
  }));
  fs.mkdirSync(path.join(root, "docs", "governance", "system-telemetry"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "system-telemetry", "external-validation.manifest.json"), JSON.stringify({
    schemaVersion: 1,
    completionAudit: { statusSummary: { externalPendingRowIds: ["STA-001"] } },
    externalValidationRunbook: { externalPendingRowIds: ["EXT-001"] },
    rows: [{
      id: "EXT-001",
      status: "EXTERNAL PENDING",
      linkedPromiseIds: ["STA-001"],
      reentryCommand: "claw system providers plan context.weather.live --json",
    }],
  }));
  fs.writeFileSync(path.join(root, "docs", "decision-map.md"), "EXTERNAL PENDING appears here as report-only candidate. La deuda lateral queda pendiente.");

  const ledger = buildClawDebtLedger({ rootDir: root, repositories: [{ repo: "sample", rootDir: root }], generatedAt: "2026-05-20T00:00:00.000Z" });
  assert.equal(ledger.mode, "report_only");
  assert.equal(ledger.entries.some((entry) => entry.id === "baseline-one" && entry.classification === "baseline_exception"), true);
  assert.equal(ledger.entries.some((entry) => entry.classification === "external_pending" && entry.summary.includes("STA-001") && entry.reentryCommand === "claw system providers plan context.weather.live --json"), true);
  assert.equal(ledger.entries.some((entry) => entry.classification === "external_pending" && entry.summary.includes("EXT-001") && entry.reentryCommand === "claw system providers plan context.weather.live --json"), true);
  assert.equal(ledger.entries.some((entry) => entry.classification === "lateral_debt"), true);
  assert.equal(ledger.audit.missingActionability.some((entry) => entry.missing.includes("reviewBy_or_expires")), true);
  assert.equal(ledger.audit.aliasHits.some((entry) => entry.term === "EXTERNAL PENDING" && entry.normalizedClassification === "external_pending"), true);
  assert.equal(ledger.audit.aliasHits.some((entry) => entry.term === "deuda lateral" && entry.normalizedClassification === "lateral_debt"), true);
  assert.equal(ledger.audit.duplicateFingerprints.length, 1);
  assert.equal(ledger.audit.unindexedCandidates.some((entry) => entry.path === "docs/decision-map.md"), true);
  for (const entry of ledger.entries) clawDebtLedgerEntrySchema.parse(entry);
});

test("public debt ledger redacts private paths from redacted entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-debt-ledger-redact-"));
  fs.mkdirSync(path.join(root, "docs", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "ui", "debt.baseline.json"), JSON.stringify({
    schemaVersion: 1,
    reviewAfter: "2099-01-01",
    entries: [{
      id: "private-path-ui",
      owner: "ui",
      reason: "Captured near /Users/person/Desktop/private-screenshot.png",
      allowedAction: "Do not publish /Users/person/.codex/session.jsonl",
    }],
  }));

  const ledger = buildClawDebtLedger({ rootDir: root, repositories: [{ repo: "clawix", rootDir: root }] });
  const entry = ledger.entries.find((candidate) => candidate.id === "private-path-ui");
  assert.ok(entry);
  assert.equal(entry.summary.includes("/Users/"), false);
  assert.equal(entry.risk.includes("/Users/"), false);
});

test("debt ledger repository detection routes Clawix overlays to public sibling repos", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-debt-overlay-"));
  const overlayRoot = path.join(tempRoot, "Clawix");
  const clawixRoot = path.join(overlayRoot, "clawix");
  const clawjsRoot = path.join(tempRoot, "clawjs");

  fs.mkdirSync(path.join(clawixRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(overlayRoot, "AGENTS.md"), "Private overlay.\n");
  fs.writeFileSync(path.join(clawixRoot, "AGENTS.md"), "Public Clawix.\n");
  fs.writeFileSync(path.join(clawixRoot, "docs", "decision-map.md"), "Clawix decisions.\n");

  fs.mkdirSync(path.join(clawjsRoot, "packages", "clawjs-core"), { recursive: true });
  fs.mkdirSync(path.join(clawjsRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(clawjsRoot, "package.json"), JSON.stringify({ name: "@clawjs/debt-overlay-fixture" }));
  fs.writeFileSync(path.join(clawjsRoot, "docs", "decision-map.md"), "ClawJS decisions.\n");

  const repositories = detectDebtLedgerRepositories(overlayRoot);
  assert.deepEqual(repositories.map((repo) => repo.repo), ["clawjs", "clawix"]);
  assert.deepEqual(repositories.map((repo) => repo.rootDir), [clawjsRoot, clawixRoot]);
});
