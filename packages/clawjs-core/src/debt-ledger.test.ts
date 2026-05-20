import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildClawDebtLedger,
  clawDebtLedgerEntrySchema,
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
    externalValidationRunbook: { externalPendingRowIds: ["STA-001"] },
  }));
  fs.writeFileSync(path.join(root, "docs", "decision-map.md"), "EXTERNAL PENDING appears here as report-only candidate.");

  const ledger = buildClawDebtLedger({ rootDir: root, repositories: [{ repo: "sample", rootDir: root }], generatedAt: "2026-05-20T00:00:00.000Z" });
  assert.equal(ledger.mode, "report_only");
  assert.equal(ledger.entries.some((entry) => entry.id === "baseline-one" && entry.classification === "baseline_exception"), true);
  assert.equal(ledger.entries.some((entry) => entry.classification === "external_pending" && entry.summary.includes("STA-001")), true);
  assert.equal(ledger.entries.some((entry) => entry.classification === "lateral_debt"), true);
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
