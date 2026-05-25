import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createPortableArchiveImportPreview,
  createPortableArchiveManifestFixture,
  createPortableArchivePlan,
  createPortableArchiveRestoreReport,
  portableArchiveImportPreviewSchema,
  portableArchiveManifestV1Schema,
  portableArchivePlanSchema,
  portableArchiveRestoreReportSchema,
  portableArchiveVerificationReportSchema,
  verifyPortableArchiveManifest,
  type PortableArchiveManifestV1,
} from "./index.ts";

test("portable archive contract exposes a readable full backup manifest", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: true });

  assert.doesNotThrow(() => portableArchiveManifestV1Schema.parse(manifest));
  assert.equal(manifest.format, ".clawbackup");
  assert.equal(manifest.manifestPath, "manifest.json");
  assert.equal(manifest.secrets.mode, "encrypted_clawsecrets");
  assert.equal(manifest.secrets.requiresIndependentPassphrase, true);
  assert.equal(manifest.secrets.requiresSignedHost, true);
  assert.equal(manifest.inventory.some((entry) => entry.kind === "core_database" && entry.format === "jsonl"), true);
  assert.equal(manifest.inventory.some((entry) => entry.notes === "rebuildable_no_canonical_backup"), true);
  assert.equal(manifest.externalSources.every((source) => source.copied === false), true);
});

test("portable archive plan gates encrypted secrets through a signed host", () => {
  const plan = createPortableArchivePlan({ sourceRoot: "/tmp/claw-home", includeSecrets: true });

  assert.doesNotThrow(() => portableArchivePlanSchema.parse(plan));
  assert.equal(plan.status, "requires_signed_host");
  assert.equal(plan.requiresSignedHost, true);
  assert.equal(plan.steps.find((step) => step.id === "secrets")?.status, "requires_signed_host");
});

test("portable archive verification blocks plaintext secret material and copied external sources", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: true });
  const tampered: PortableArchiveManifestV1 = {
    ...manifest,
    inventory: [
      ...manifest.inventory,
      {
        id: "bad-secret",
        kind: "file_blob",
        storageClass: "framework_global",
        sourcePath: "secrets/plaintext.txt",
        portablePath: "secrets/plaintext.txt",
        format: "text",
        canonical: true,
        hash: { algorithm: "sha256", value: "1".repeat(64) },
        restoreStrategy: "restore_file",
        secretHandling: "none",
        notes: "contains plaintext secret value",
      },
    ],
    externalSources: [{ ...manifest.externalSources[0], copied: true }],
  };

  const report = verifyPortableArchiveManifest(tampered);

  assert.doesNotThrow(() => portableArchiveVerificationReportSchema.parse(report));
  assert.equal(report.status, "failed");
  assert.equal(report.counts.plaintextSecretFindings, 1);
  assert.equal(report.counts.externalCopyViolations, 1);
});

test("portable archive verification fails closed on manifest count drift", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: true });
  const tampered: PortableArchiveManifestV1 = {
    ...manifest,
    counts: {
      ...manifest.counts,
      inventoryEntries: 0,
      canonicalEntries: 0,
      externalReferences: 0,
      rebuildableExcluded: 0,
      secretsEnvelopes: 0,
    },
  };

  const report = verifyPortableArchiveManifest(tampered);
  const preview = createPortableArchiveImportPreview({ manifest: tampered, targetRoot: "/tmp/restore", signedHostAvailable: true });
  const restore = createPortableArchiveRestoreReport({ preview, approved: true });

  assert.equal(report.status, "failed");
  assert.equal(report.issues.some((issue) => issue.code === "manifest_count_mismatch"), true);
  assert.equal(preview.status, "verification_failed");
  assert.equal(preview.canRestore, false);
  assert.equal(preview.mappedCounts.secretsEnvelopes, 1);
  assert.equal(restore.status, "verification_failed");
});

test("portable archive verification fails closed when encrypted secrets drop host gates", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: true });
  const tampered: PortableArchiveManifestV1 = {
    ...manifest,
    secrets: {
      ...manifest.secrets,
      requiresIndependentPassphrase: false,
      requiresSignedHost: false,
    },
  };

  const report = verifyPortableArchiveManifest(tampered);
  const preview = createPortableArchiveImportPreview({ manifest: tampered, targetRoot: "/tmp/restore", signedHostAvailable: true });
  const restore = createPortableArchiveRestoreReport({ preview, approved: true });

  assert.equal(report.status, "failed");
  assert.equal(report.issues.some((issue) => issue.code === "secrets_policy_mismatch"), true);
  assert.equal(preview.status, "verification_failed");
  assert.equal(preview.canRestore, false);
  assert.equal(restore.status, "verification_failed");
  assert.equal(restore.restoredCounts.secretsEnvelopes, 0);
});

test("portable archive restore is two phase and approval gated", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: true });
  const blockedPreview = createPortableArchiveImportPreview({ manifest, targetRoot: "/tmp/restore", signedHostAvailable: false });

  assert.doesNotThrow(() => portableArchiveImportPreviewSchema.parse(blockedPreview));
  assert.equal(blockedPreview.status, "requires_signed_host");
  assert.equal(blockedPreview.canRestore, false);

  const readyPreview = createPortableArchiveImportPreview({ manifest, targetRoot: "/tmp/restore", signedHostAvailable: true });
  const unapprovedReport = createPortableArchiveRestoreReport({ preview: readyPreview, approved: false });
  assert.equal(unapprovedReport.status, "requires_approval");
  assert.equal(unapprovedReport.restoredCounts.records, 0);

  const approvedReport = createPortableArchiveRestoreReport({ preview: readyPreview, approved: true });
  assert.doesNotThrow(() => portableArchiveRestoreReportSchema.parse(approvedReport));
  assert.equal(approvedReport.status, "restore_complete");
  assert.equal(approvedReport.restoredCounts.grants, 2);
  assert.equal(approvedReport.restoredCounts.policies, 2);
  assert.equal(approvedReport.restoredCounts.secretsEnvelopes, 1);
});

test("portable archive restore report keeps corrupt previews blocked by verification", () => {
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: false });
  const tampered: PortableArchiveManifestV1 = {
    ...manifest,
    inventory: manifest.inventory.map((entry) => entry.id === "core.sqlite" ? { ...entry, hash: undefined } : entry),
  };
  const preview = createPortableArchiveImportPreview({ manifest: tampered, targetRoot: "/tmp/restore", signedHostAvailable: true });
  const report = createPortableArchiveRestoreReport({ preview, approved: false });

  assert.equal(preview.status, "verification_failed");
  assert.equal(report.status, "verification_failed");
  assert.ok(report.blockedReasons.includes("verification_failed"));
});
