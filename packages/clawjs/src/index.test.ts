import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { createClaw, saveAuthStore } from "@clawjs/claw";
import { createPortableArchiveManifestFixture, resolveClawPersistentSurfacePath } from "@clawjs/core";
import { buildTimeApp } from "../../../time/src/server/app.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CLI_USAGE, runCli } from "./index.ts";
import {
  ONE_PIXEL_PNG,
  captureStream,
  createFakeGenerationScript,
  createFakeOpenAIImageCliServer,
  createFakeOpenClawImageSkillEnv,
  createFakeOpenClawToolchain,
  createFakeSecretsCliServer,
  parseCliJsonPayload,
  runCliCapture,
  useIsolatedClawDataRoot,
  withPatchedEnv,
} from "./index-test-utils.ts";

const OPENAI_API_PREFIX = "/v" + "1";
test("runCli prints usage for unsupported commands", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["unknown"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_USAGE);
  assert.match(stderr.getOutput(), /Usage/);
});

test("runCli prints help and exits successfully", async () => {
  const stdout = captureStream();
  const exitCode = await runCli(["--help"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CLI_USAGE);
  assert.match(stdout.getOutput(), /Primary commands and portals:/);
  assert.match(stdout.getOutput(), /host\s+canonical/);
  assert.match(stdout.getOutput(), /db\s+alias/);
  assert.doesNotMatch(stdout.getOutput(), /data doctor\|backup\|restore\|reset/);
});

test("runCli rejects removed public pre-v1 namespaces before V1 routing", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-prev1-negative-"));
  for (const args of [
    ["data", "doctor"],
    ["app-state", "snapshot"],
    ["ops", "list"],
    ["infra", "list"],
    ["runtime", "queue"],
    ["content", "upsert"],
    ["business", "upsert"],
    ["social", "list"],
    ["monitor", "event"],
    ["workspace-search", "query", "x"],
    ["workspace-index", "rebuild"],
    ["export", "snapshot.json"],
    ["import", "snapshot.json"],
    ["backup", "backups"],
  ]) {
    const stderr = captureStream();
    assert.equal(await runCli(args, {
      stdout: captureStream().stream,
      stderr: stderr.stream,
      cwd,
    }), CLI_EXIT_USAGE, args.join(" "));
    assert.match(stderr.getOutput(), /not part of the public Claw CLI surface|Usage:/);
  }
});

test("slides add rejects invalid table rows JSON as usage", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-slides-rows-json-"));

  const created = await runCliCapture(["slides", "create", "Rows Deck", "--theme", "executive", "--json"], cwd);
  assert.equal(created.code, CLI_EXIT_OK);
  const createdPayload = parseCliJsonPayload<{ deck: { id: string } }>(created.stdout);

  const invalidRows = await runCliCapture([
    "slides",
    "add",
    createdPayload.deck.id,
    "--layout",
    "table-lite",
    "--heading",
    "Revenue table",
    "--rows-json",
    "[1]",
    "--json",
  ], cwd);
  assert.equal(invalidRows.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(invalidRows.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_slides_rows_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--rows-json/);
});

test("slides render rejects external deck ids that escape the output root", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-slides-safe-id-workspace-"));
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-slides-safe-id-external-"));
  const manifestPath = path.join(externalRoot, "external-deck.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    id: "../outside",
    title: "External traversal deck",
    theme: "executive",
    author: {},
    slides: [
      {
        id: "slide-1",
        layout: "title",
        title: "External deck",
      },
    ],
    metadata: {},
    outputs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");

  const rendered = await runCliCapture([
    "slides",
    "render",
    manifestPath,
    "--workspace",
    workspaceRoot,
    "--format",
    "pdf",
    "--json",
  ], externalRoot);
  assert.equal(rendered.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(rendered.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_slide_deck_id");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /safe local identifier/);

  const slidesRoot = path.join(workspaceRoot, ".claw", "slides");
  const outputRoot = path.join(slidesRoot, "outputs");
  assert.equal(fs.existsSync(outputRoot), false);
  assert.deepEqual(fs.existsSync(slidesRoot) ? fs.readdirSync(slidesRoot) : [], []);
});

test("runCli supports non-mutating database collection discovery aliases", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-db-readonly-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const collectionsHelpStdout = captureStream();
  assert.equal(await runCli(["collections", "--help"], {
    stdout: collectionsHelpStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(collectionsHelpStdout.getOutput(), /collections list\|schema <collection>\|<collection> list\|get\|schema/);

  const recordsHelpStdout = captureStream();
  assert.equal(await runCli(["records", "--help"], {
    stdout: recordsHelpStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(recordsHelpStdout.getOutput(), /records <collection> list\|get\|create\|update\|delete\|schema\|query/);

  const dbListStdout = captureStream();
  assert.equal(await runCli(["db", "list", "--json"], {
    stdout: dbListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const dbList = parseCliJsonPayload<{ collections: Array<{ name: string }>; visibility: string }>(dbListStdout.getOutput());
  assert.equal(dbList.collections.some((collection) => collection.name === "tasks"), true);
  assert.equal(dbList.visibility, "active");

  const explicitActiveStdout = captureStream();
  assert.equal(await runCli(["collections", "list", "--available", "false", "--json"], {
    stdout: explicitActiveStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const explicitActive = parseCliJsonPayload<{ collections: Array<{ state: string }>; visibility: string }>(explicitActiveStdout.getOutput());
  assert.equal(explicitActive.visibility, "active");
  assert.equal(explicitActive.collections.every((collection) => collection.state === "enabled"), true);

  const commandFirstSchemaStdout = captureStream();
  assert.equal(await runCli(["collections", "schema", "tasks", "--json"], {
    stdout: commandFirstSchemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const commandFirstSchema = parseCliJsonPayload<{ collection: { name: string } }>(commandFirstSchemaStdout.getOutput());
  assert.equal(commandFirstSchema.collection.name, "tasks");
});

test("runCli exposes portable archive governance and signed-host gates", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-archive-cli-"));
  const archivePath = path.join(cwd, "local.clawbackup");

  const unknownArchiveStdout = captureStream();
  const unknownArchiveStderr = captureStream();
  assert.equal(await runCli(["archive", "definitely_missing", "--json"], {
    stdout: unknownArchiveStdout.stream,
    stderr: unknownArchiveStderr.stream,
    cwd,
  }), CLI_EXIT_USAGE);
  assert.equal(unknownArchiveStderr.getOutput(), "");
  const unknownArchive = JSON.parse(unknownArchiveStdout.getOutput()) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: { received?: string; validSubcommands?: string[] };
    };
  };
  assert.equal(unknownArchive.ok, false);
  assert.equal(unknownArchive.error.code, "unknown_archive_subcommand");
  assert.equal(unknownArchive.error.status, "USAGE");
  assert.equal(unknownArchive.error.location, "cli.archive.subcommand");
  assert.equal(unknownArchive.error.details?.received, "definitely_missing");
  assert.deepEqual(unknownArchive.error.details?.validSubcommands, ["plan", "export", "verify", "inspect", "import", "restore", "doctor"]);
  assert.match(unknownArchive.error.safeNextStep, /archive plan --json/);
  assert.match(unknownArchive.error.safeNextStep, /help archive --json/);

  const planStdout = captureStream();
  assert.equal(await runCli(["archive", "plan", "--include-secrets", "--json"], {
    stdout: planStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const plan = parseCliJsonPayload<{ status: string; requiresSignedHost: boolean; expectedManifest: { format: string; manifestPath: string } }>(planStdout.getOutput());
  assert.equal(plan.status, "requires_signed_host");
  assert.equal(plan.requiresSignedHost, true);
  assert.equal(plan.expectedManifest.format, ".clawbackup");
  assert.equal(plan.expectedManifest.manifestPath, "manifest.json");

  const invalidCheckedAtStdout = captureStream();
  assert.equal(await runCli(["archive", "plan", "--checked-at", "nope", "--json"], {
    stdout: invalidCheckedAtStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_USAGE);
  const invalidCheckedAt = JSON.parse(invalidCheckedAtStdout.getOutput()) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(invalidCheckedAt.ok, false);
  assert.equal(invalidCheckedAt.error.code, "invalid_archive_checked_at");
  assert.equal(invalidCheckedAt.error.status, "USAGE");
  assert.match(invalidCheckedAt.error.message, /--checked-at/);

  const verifyStdout = captureStream();
  assert.equal(await runCli(["archive", "verify", "--json"], {
    stdout: verifyStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const verification = parseCliJsonPayload<{ status: string; counts: { entries: number; plaintextSecretFindings: number } }>(verifyStdout.getOutput());
  assert.equal(verification.status, "ok");
  assert.equal(verification.counts.plaintextSecretFindings, 0);
  assert.ok(verification.counts.entries > 0);

  const exportStdout = captureStream();
  assert.equal(await runCli(["archive", "export", "--output", archivePath, "--json"], {
    stdout: exportStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const exported = parseCliJsonPayload<{ status: string; dryRun: boolean; archivePath: string; manifestPath: string; verification: { status: string } }>(exportStdout.getOutput());
  assert.equal(exported.status, "ready");
  assert.equal(exported.dryRun, false);
  assert.equal(exported.archivePath, archivePath);
  assert.equal(exported.verification.status, "ok");
  assert.equal(fs.existsSync(path.join(archivePath, "manifest.json")), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(archivePath, "manifest.json"), "utf8")) as { receipts: { entries: Array<{ receiptPath: string }> } };
  const receiptPath = path.join(archivePath, manifest.receipts.entries[0].receiptPath);
  assert.equal(fs.existsSync(receiptPath), true);

  const localVerifyStdout = captureStream();
  assert.equal(await runCli(["archive", "verify", "--archive", archivePath, "--json"], {
    stdout: localVerifyStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const localVerification = parseCliJsonPayload<{ status: string; issues: Array<{ code: string }> }>(localVerifyStdout.getOutput());
  assert.equal(localVerification.status, "ok");

  const previewStdout = captureStream();
  assert.equal(await runCli(["archive", "import", "--archive", archivePath, "--target", path.join(cwd, "restore-target"), "--json"], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ status: string; canRestore: boolean; mappedCounts: { records: number } }>(previewStdout.getOutput());
  assert.equal(preview.status, "ready");
  assert.equal(preview.canRestore, true);
  assert.ok(preview.mappedCounts.records > 0);

  fs.writeFileSync(receiptPath, "tampered receipt\n", "utf8");
  const corruptReceiptStdout = captureStream();
  assert.equal(await runCli(["archive", "verify", "--archive", archivePath, "--json"], {
    stdout: corruptReceiptStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const corruptReceiptVerification = parseCliJsonPayload<{ status: string; issues: Array<{ code: string }> }>(corruptReceiptStdout.getOutput());
  assert.equal(corruptReceiptVerification.status, "failed");
  assert.equal(corruptReceiptVerification.issues.some((issue) => issue.code === "receipt_hash_mismatch"), true);

  fs.writeFileSync(path.join(archivePath, "data", "core.sqlite"), "tampered\n", "utf8");
  const corruptVerifyStdout = captureStream();
  assert.equal(await runCli(["archive", "verify", "--archive", archivePath, "--json"], {
    stdout: corruptVerifyStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const corruptVerification = parseCliJsonPayload<{ status: string; issues: Array<{ code: string }> }>(corruptVerifyStdout.getOutput());
  assert.equal(corruptVerification.status, "failed");
  assert.equal(corruptVerification.issues.some((issue) => issue.code === "hash_mismatch"), true);

  const restoreStdout = captureStream();
  assert.equal(await runCli(["archive", "restore", "--include-secrets", "--json"], {
    stdout: restoreStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const restore = parseCliJsonPayload<{ dryRun: boolean; report: { status: string; blockedReasons: string[] } }>(restoreStdout.getOutput());
  assert.equal(restore.dryRun, true);
  assert.equal(restore.report.status, "requires_signed_host");
  assert.ok(restore.report.blockedReasons.includes("requires_signed_host"));

  const missingConfirmationStdout = captureStream();
  assert.equal(await runCli(["archive", "restore", "--target", path.join(cwd, "restore-target"), "--approve", "--json"], {
    stdout: missingConfirmationStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const missingConfirmation = parseCliJsonPayload<{ dryRun: boolean; report: { status: string; blockedReasons: string[] } }>(missingConfirmationStdout.getOutput());
  assert.equal(missingConfirmation.dryRun, true);
  assert.equal(missingConfirmation.report.status, "requires_approval");
  assert.ok(missingConfirmation.report.blockedReasons.includes("restore_confirmation_required"));
});

test("runCli rejects standalone portable archive manifests before import or restore", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-archive-standalone-"));
  const archiveManifestPath = path.join(cwd, "standalone.json");
  const targetRoot = path.join(cwd, "restore-target");
  const manifest = createPortableArchiveManifestFixture({ includeSecrets: false, requestedAt: "2026-05-21T00:00:00.000Z" });
  fs.writeFileSync(archiveManifestPath, `${JSON.stringify({
    ...manifest,
    counts: { inventoryEntries: 0, canonicalEntries: 0, externalReferences: 0, rebuildableExcluded: 0, secretsEnvelopes: 0 },
    inventory: [],
    restoreGraph: [],
    externalSources: [],
    secrets: { mode: "none", requiresIndependentPassphrase: false, requiresSignedHost: false, forbiddenPlaintext: [] },
    receipts: { redaction: "redacted", entries: [] },
  }, null, 2)}\n`, "utf8");

  const importStdout = captureStream();
  assert.equal(await runCli(["archive", "import", "--archive", archiveManifestPath, "--target", targetRoot, "--json"], {
    stdout: importStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ status: string; canRestore: boolean; verification: { issues: Array<{ code: string }> } }>(importStdout.getOutput());
  assert.equal(preview.status, "verification_failed");
  assert.equal(preview.canRestore, false);
  assert.equal(preview.verification.issues.some((issue) => issue.code === "invalid_archive_format"), true);

  const restoreStdout = captureStream();
  assert.equal(await runCli(["archive", "restore", "--archive", archiveManifestPath, "--target", targetRoot, "--approve", "--confirm-restore", targetRoot, "--json"], {
    stdout: restoreStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const restore = parseCliJsonPayload<{ dryRun: boolean; report: { status: string; blockedReasons: string[] } }>(restoreStdout.getOutput());
  assert.equal(restore.dryRun, true);
  assert.equal(restore.report.status, "verification_failed");
  assert.ok(restore.report.blockedReasons.includes("verification_failed"));
});

test("runCli exposes Search source registry, profiles, status and explain admin commands", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-cli-"));

  const sourcesStdout = captureStream();
  assert.equal(await runCli(["search", "sources", "--json"], {
    stdout: sourcesStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const sources = parseCliJsonPayload<{ sources: Array<{ id: string; domain: string; fastPath: boolean }> }>(sourcesStdout.getOutput());
  assert.equal(sources.sources.some((source) => source.id === "sessions.chats" && source.fastPath), true);
  assert.equal(sources.sources.some((source) => source.id === "commands"), true);

  const profilesStdout = captureStream();
  assert.equal(await runCli(["search", "profiles", "--json"], {
    stdout: profilesStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const profiles = parseCliJsonPayload<{ profiles: Array<{ id: string; defaultEnabled: boolean }> }>(profilesStdout.getOutput());
  assert.deepEqual(profiles.profiles.map((profile) => profile.id), ["framework", "full"]);
  assert.equal(profiles.profiles.find((profile) => profile.id === "framework")?.defaultEnabled, true);

  const statusStdout = captureStream();
  assert.equal(await runCli(["search", "status", "--json"], {
    stdout: statusStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const status = parseCliJsonPayload<{ storage: { canonical: string; index: string }; budgets: { hotMs: number; globalFirstBatchMs: number } }>(statusStdout.getOutput());
  assert.deepEqual(status.storage, { canonical: "core.sqlite", index: "search.sqlite", indexRebuildable: true });
  assert.equal(status.budgets.hotMs, 50);
  assert.equal(status.budgets.globalFirstBatchMs, 200);

  const explainStdout = captureStream();
  assert.equal(await runCli(["search", "explain", "alpha", "--json"], {
    stdout: explainStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const explain = parseCliJsonPayload<{ query: string; partialResults: string }>(explainStdout.getOutput());
  assert.equal(explain.query, "alpha");
  assert.match(explain.partialResults, /omitted/);
});

test("runCli prints db-specific help and database admin help", async () => {
  const dbStdout = captureStream();
  assert.equal(await runCli(["db", "--help"], {
    stdout: dbStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(dbStdout.getOutput(), /Usage: claw db <collection>/);
  assert.match(dbStdout.getOutput(), /alias: Exact alias/);

  const adminStdout = captureStream();
  assert.equal(await runCli(["database", "--help"], {
    stdout: adminStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(adminStdout.getOutput(), /Usage: claw database serve\|login/);
  assert.match(adminStdout.getOutput(), /canonical: Local database admin surface/);
});

test("runCli keeps public help short and gates the advanced surface behind --all", async () => {
  const help = await runCliCapture(["--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /Usage: claw <command> \[options\]/);
  assert.match(help.stdout, /Run `claw --help --all` for advanced commands\./);
  assert.doesNotMatch(help.stdout, /^\s+context\s+canonical/m);
  assert.doesNotMatch(help.stdout, /^\s+compat\s+canonical/m);

  const allHelp = await runCliCapture(["--help", "--all"], process.cwd());
  assert.equal(allHelp.code, CLI_EXIT_OK);
  assert.match(allHelp.stdout, /Advanced commands:/);
  assert.match(allHelp.stdout, /^\s+context\s+canonical/m);
  assert.match(allHelp.stdout, /^\s+compat\s+canonical/m);

  const hostHelp = await runCliCapture(["host", "--help"], process.cwd());
  assert.equal(hostHelp.code, CLI_EXIT_OK);
  assert.match(hostHelp.stdout, /Usage: claw host/);
  assert.match(hostHelp.stdout, /services/);
  assert.match(hostHelp.stdout, /capabilities/);
  assert.match(hostHelp.stdout, /Support: host_required/);
  assert.match(hostHelp.stdout, /Security: signed_host_broker/);

  const systemCapabilitiesHelp = await runCliCapture(["system", "capabilities", "--help"], process.cwd());
  assert.equal(systemCapabilitiesHelp.code, CLI_EXIT_OK);
  assert.match(systemCapabilitiesHelp.stdout, /capabilities/);

  const systemHelp = await runCliCapture(["system", "--help"], process.cwd());
  assert.equal(systemHelp.code, CLI_EXIT_OK);
  assert.match(systemHelp.stdout, /Usage: claw system snapshot/);
});

test("runCli exposes the evolution operator surface", async () => {
  const help = await runCliCapture(["evolution", "--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /Usage: claw evolution list\|show\|diff/);
  assert.match(help.stdout, /Compatibility evolution ledger/);

  const verify = await runCliCapture(["evolution", "verify", "--json"], process.cwd());
  assert.equal(verify.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    status: string;
    policy: { sourceOfTruth: string; postV1Migration: string; rescueCore: string };
    surfaceBaseline: { status: string; changed: number; uncovered: number };
    migrationLab: { status: string; fixtureCount: number; versionChain: Array<{ fromVersion: string; toVersion: string; status: string }>; checks: Array<{ id: string; status: string }> };
    checks: string[];
  }>(verify.stdout);
  assert.equal(payload.status, "ok");
  assert.equal(payload.policy.sourceOfTruth, "clawjs");
  assert.equal(payload.policy.postV1Migration, "step_by_step_all_public_versions");
  assert.equal(payload.policy.rescueCore, "launch_chat_repair");
  assert.equal(payload.surfaceBaseline.status, "unchanged");
  assert.equal(payload.surfaceBaseline.uncovered, 0);
  assert.equal(payload.migrationLab.status, "pass");
  assert.equal(payload.migrationLab.fixtureCount >= 1, true);
  assert.equal(payload.migrationLab.versionChain.some((entry) => entry.fromVersion === "foundation" && entry.toVersion === "v1" && entry.status === "pass"), true);
  assert.equal(payload.migrationLab.checks.some((check) => check.id === "required_surface_kinds" && check.status === "pass"), true);
  assert.equal(payload.migrationLab.checks.some((check) => check.id === "version_chain_complete" && check.status === "pass"), true);
  assert.equal(payload.checks.includes("rescue_core_declared"), true);
  assert.equal(payload.checks.includes("public_surface_baseline_covered"), true);
  assert.equal(payload.checks.includes("migration_lab_foundation_fixture_passed"), true);

  const verifyFromOutsideRepo = await runCliCapture(["evolution", "verify", "--root", process.cwd(), "--json"], os.tmpdir());
  assert.equal(verifyFromOutsideRepo.code, CLI_EXIT_OK);
  const outsideRepoPayload = parseCliJsonPayload<{ status: string; policy: { sourceOfTruth: string } }>(verifyFromOutsideRepo.stdout);
  assert.equal(outsideRepoPayload.status, "ok");
  assert.equal(outsideRepoPayload.policy.sourceOfTruth, "clawjs");

  const diff = await runCliCapture(["evolution", "diff", "--json"], process.cwd());
  assert.equal(diff.code, CLI_EXIT_OK);
  const diffPayload = parseCliJsonPayload<{ status: string; requiredRecord: boolean; summary: { changed: number; uncovered: number } }>(diff.stdout);
  assert.equal(diffPayload.status, "unchanged");
  assert.equal(diffPayload.requiredRecord, false);
  assert.deepEqual(diffPayload.summary, { changed: 0, uncovered: 0 });

  const repair = await runCliCapture(["evolution", "repair", "--json"], process.cwd());
  assert.equal(repair.code, CLI_EXIT_OK);
  const repairPayload = parseCliJsonPayload<{
    status: string;
    requiresApproval: boolean;
    mutates: boolean;
    rescueCore: string;
    steps: Array<{ id: string; status: string }>;
    backupPolicies: Array<{ strategy: string; requiresApproval: boolean }>;
    migrationLab: { status: string; fixtureIds: string[] };
    repairReport: {
      status: string;
      patch: { format: string; status: string; redacted: boolean; diff: string };
      safeActions: Array<{ id: string; command?: string }>;
      approvalRequiredActions: Array<{ id: string }>;
      receipt: { redaction: { promptsIncluded: boolean; secretsIncluded: boolean; fullLocalPathsIncluded: boolean } };
      redaction: { externalSubmission: string };
    };
  }>(repair.stdout);
  assert.equal(repairPayload.status, "approval_gated_plan");
  assert.equal(repairPayload.requiresApproval, true);
  assert.equal(repairPayload.mutates, true);
  assert.equal(repairPayload.rescueCore, "launch_chat_repair");
  assert.equal(repairPayload.steps.some((step) => step.id === "preserve_launch_chat_repair"), true);
  assert.equal(repairPayload.steps.find((step) => step.id === "prepare_best_effort_backup")?.status, "approval_gated");
  assert.equal(repairPayload.backupPolicies.every((policy) => policy.requiresApproval), true);
  assert.equal(repairPayload.migrationLab.status, "pass");
  assert.equal(repairPayload.migrationLab.fixtureIds.includes("evo_fixture_v1_foundation"), true);
  assert.equal(repairPayload.repairReport.status, "needs_approval");
  assert.equal(repairPayload.repairReport.patch.format, "unified_diff");
  assert.equal(repairPayload.repairReport.patch.redacted, true);
  assert.match(repairPayload.repairReport.patch.diff, /Evolution Repair Report/);
  assert.equal(repairPayload.repairReport.safeActions.some((action) => action.command === "claw evolution doctor --json"), true);
  assert.equal(repairPayload.repairReport.approvalRequiredActions.some((action) => action.id === "mutate_local_state"), true);
  assert.equal(repairPayload.repairReport.receipt.redaction.promptsIncluded, false);
  assert.equal(repairPayload.repairReport.receipt.redaction.secretsIncluded, false);
  assert.equal(repairPayload.repairReport.receipt.redaction.fullLocalPathsIncluded, false);
  assert.equal(repairPayload.repairReport.redaction.externalSubmission, "explicit_approval_only");

  const report = await runCliCapture(["evolution", "report", "--json"], process.cwd());
  assert.equal(report.code, CLI_EXIT_OK);
  const reportPayload = parseCliJsonPayload<{
    repairReport: {
      status: string;
      approvalRequiredActions: Array<{ id: string }>;
      redaction: { externalSubmission: string };
    };
  }>(report.stdout);
  assert.equal(reportPayload.repairReport.status, "needs_approval");
  assert.equal(reportPayload.repairReport.approvalRequiredActions.some((action) => action.id === "submit_external_report"), true);
  assert.equal(reportPayload.repairReport.redaction.externalSubmission, "explicit_approval_only");

  const dryRun = await runCliCapture(["evolution", "dry-run", "--json"], process.cwd());
  assert.equal(dryRun.code, CLI_EXIT_OK);
  const dryRunPayload = parseCliJsonPayload<{ status: string; mutates: boolean; requiresApproval: boolean; migrationLab: { status: string } }>(dryRun.stdout);
  assert.equal(dryRunPayload.status, "dry_run_ready");
  assert.equal(dryRunPayload.mutates, false);
  assert.equal(dryRunPayload.requiresApproval, false);
  assert.equal(dryRunPayload.migrationLab.status, "pass");

  const rollback = await runCliCapture(["evolution", "rollback", "--json"], process.cwd());
  assert.equal(rollback.code, CLI_EXIT_OK);
  const rollbackPayload = parseCliJsonPayload<{
    status: string;
    requiresApproval: boolean;
    rollbackReport: {
      status: string;
      restorePoint: {
        reversibility: string;
        universalRollbackPromised: boolean;
        retentionDays: number;
        maxBytesBeforeOverride: number;
        maxFilesBeforeOverride: number;
      };
      forwardRepair: { required: boolean; command: string };
      approvalRequiredActions: Array<{ id: string }>;
      redaction: { promptsIncluded: boolean; secretsIncluded: boolean; fullLocalPathsIncluded: boolean };
    };
  }>(rollback.stdout);
  assert.equal(rollbackPayload.status, "approval_gated_plan");
  assert.equal(rollbackPayload.requiresApproval, true);
  assert.equal(rollbackPayload.rollbackReport.status, "needs_approval");
  assert.equal(rollbackPayload.rollbackReport.restorePoint.reversibility, "best_effort_forward_repair");
  assert.equal(rollbackPayload.rollbackReport.restorePoint.universalRollbackPromised, false);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.retentionDays, 30);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.maxBytesBeforeOverride, 1_073_741_824);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.maxFilesBeforeOverride, 10_000);
  assert.equal(rollbackPayload.rollbackReport.forwardRepair.required, true);
  assert.equal(rollbackPayload.rollbackReport.forwardRepair.command, "claw evolution repair --json");
  assert.equal(rollbackPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "create_restore_point"), true);
  assert.equal(rollbackPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "forward_repair_after_rollback"), true);
  assert.equal(rollbackPayload.rollbackReport.redaction.promptsIncluded, false);
  assert.equal(rollbackPayload.rollbackReport.redaction.secretsIncluded, false);
  assert.equal(rollbackPayload.rollbackReport.redaction.fullLocalPathsIncluded, false);

  const backup = await runCliCapture(["evolution", "backup", "--json"], process.cwd());
  assert.equal(backup.code, CLI_EXIT_OK);
  const backupPayload = parseCliJsonPayload<{
    rollbackReport: {
      restorePoint: {
        reversibility: string;
        universalRollbackPromised: boolean;
        retentionDays: number;
      };
      approvalRequiredActions: Array<{ id: string }>;
    };
  }>(backup.stdout);
  assert.equal(backupPayload.rollbackReport.restorePoint.reversibility, "best_effort_forward_repair");
  assert.equal(backupPayload.rollbackReport.restorePoint.universalRollbackPromised, false);
  assert.equal(backupPayload.rollbackReport.restorePoint.retentionDays, 30);
  assert.equal(backupPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "create_restore_point"), true);

  const receipt = await runCliCapture(["evolution", "receipt", "--json"], process.cwd());
  assert.equal(receipt.code, CLI_EXIT_OK);
  const receiptPayload = parseCliJsonPayload<{ migrationLab: { status: string }; receipt: { redaction: { externalSubmission: string }; notes: string[] } }>(receipt.stdout);
  assert.equal(receiptPayload.migrationLab.status, "pass");
  assert.equal(receiptPayload.receipt.redaction.externalSubmission, "explicit_approval_only");
  assert.equal(receiptPayload.receipt.notes.some((note) => note.includes("/Users/") || note.includes("prompt:")), false);
});

test("runCli reports malformed evolution ledger JSON as usage", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-evolution-invalid-json-"));
  fs.mkdirSync(path.join(cwd, "docs", "evolution"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "docs", "evolution", "baseline.json"), "{");

  const result = await runCliCapture(["evolution", "verify", "--root", cwd, "--json"], cwd);
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_evolution_ledger_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /docs\/evolution\/baseline\.json/);
});

test("runCli rejects invalid evolution version flags before writing operator JSON", async () => {
  for (const args of [
    ["evolution", "repair", "--from=v1 --json", "--json"],
    ["evolution", "repair", "--to=", "--json"],
  ]) {
    const result = await runCliCapture(args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, args.join(" "));
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; status: string; message: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "invalid_evolution_version");
    assert.equal(payload.error.status, "USAGE");
    assert.match(payload.error.message, /single evolution version token/);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /claw evolution dry-run --from v1 --json/);
  }
});

test("runCli exposes system telemetry snapshot, metrics, history, rules, widgets, providers and controls", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-cli-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const snapshot = await runCliCapture(["system", "snapshot", "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    policy: { defaultAgentAccess: string; controlsRequireSignedHostBroker: boolean };
    samples: Array<{ key: string; availability: string }>;
    unavailableMetrics: string[];
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.policy.defaultAgentAccess, "safe_read");
  assert.equal(snapshotPayload.policy.controlsRequireSignedHostBroker, true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.used" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.cpu.load5" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.free" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.pressure" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.cpu.load5"), false);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.memory.free"), false);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.sensor.temperature"), true);

  const metrics = await runCliCapture(["system", "metrics", "list", "--json"], process.cwd());
  assert.equal(metrics.code, CLI_EXIT_OK);
  const metricsPayload = parseCliJsonPayload<{ metrics: Array<{ key: string; family: string; privacyTier: string }> }>(metrics.stdout);
  assert.equal(metricsPayload.metrics.some((metric) => metric.key === "system.sensor.fan_speed" && metric.family === "sensor"), true);
  assert.equal(metricsPayload.metrics.some((metric) => metric.family === "weather_context"), true);

  const history = await runCliCapture(["system", "history", "system.cpu.load1", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{ retention: { store: string; dbPath: string; status: string; rawPolicy: string; rollups: boolean }; samples: unknown[]; chart: { kind: string; source: string; empty: boolean; points: unknown[] } }>(history.stdout);
  assert.equal(historyPayload.retention.store, "monitor.sqlite");
  assert.equal(historyPayload.retention.dbPath, monitorDb);
  assert.equal(historyPayload.retention.status, "empty");
  assert.equal(historyPayload.retention.rawPolicy, "short_local");
  assert.equal(historyPayload.retention.rollups, true);
  assert.deepEqual(historyPayload.samples, []);
  assert.deepEqual(historyPayload.chart, { kind: "line", source: "empty", empty: true, points: [], metricKey: "system.cpu.load1", unit: "count" });
  assert.equal(fs.existsSync(monitorDb), false);

  const invalidHistoryRange = await runCliCapture(["system", "history", "system.cpu.load1", "--range", "0m", "--json"], process.cwd());
  assert.equal(invalidHistoryRange.code, CLI_EXIT_USAGE);
  const invalidHistoryRangePayload = JSON.parse(invalidHistoryRange.stdout) as { ok: boolean; error: { code: string; status: string } };
  assert.equal(invalidHistoryRangePayload.ok, false);
  assert.equal(invalidHistoryRangePayload.error.code, "invalid_range");
  assert.equal(invalidHistoryRangePayload.error.status, "USAGE");

  const rules = await runCliCapture(["system", "rules", "list", "--json"], process.cwd());
  assert.equal(rules.code, CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<{ rules: unknown[] }>(rules.stdout).rules.length > 0, true);

  const widgets = await runCliCapture(["system", "widgets", "list", "--json"], process.cwd());
  assert.equal(widgets.code, CLI_EXIT_OK);
  const widgetPayload = parseCliJsonPayload<{ widgets: Array<{ placement: string }> }>(widgets.stdout);
  assert.equal(widgetPayload.widgets.some((widget) => widget.placement === "menubar"), true);
  assert.equal(widgetPayload.widgets.some((widget) => widget.placement === "combined_panel" || widget.placement === "both"), true);

  const providers = await runCliCapture(["system", "providers", "list", "--json"], process.cwd());
  assert.equal(providers.code, CLI_EXIT_OK);
  const providerPayload = parseCliJsonPayload<{ providers: Array<{ id: string; kind: string; mode: string; status: string; metrics?: string[]; adapterContract?: { input: { credentialRef: string; networkAccess: string }; output: { metrics?: string[]; monitorWriteRequired: boolean }; audit: { receiptRequired: boolean }; executionPolicy: { failClosed: boolean } } }> }>(providers.stdout);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "weather" && provider.mode === "mock" && provider.status === "ready"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "weather" && provider.mode === "live" && provider.status === "external_pending"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "hardware_sensor" && provider.id === "system.sensors.signed" && provider.status === "external_pending"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "agent_run" && provider.id === "context.agent-runs.offline" && provider.metrics?.includes("context.agent_runs.active")), true);
  const liveWeatherProvider = providerPayload.providers.find((provider) => provider.id === "context.weather.live");
  assert.equal(liveWeatherProvider?.adapterContract?.input.credentialRef, "required_redacted");
  assert.equal(liveWeatherProvider?.adapterContract?.input.networkAccess, "blocked_until_granted");
  assert.equal(liveWeatherProvider?.adapterContract?.output.metrics?.includes("context.weather.temperature"), true);
  assert.equal(liveWeatherProvider?.adapterContract?.output.monitorWriteRequired, true);
  assert.equal(liveWeatherProvider?.adapterContract?.audit.receiptRequired, true);
  assert.equal(liveWeatherProvider?.adapterContract?.executionPolicy.failClosed, true);

  const providerPlan = await runCliCapture(["system", "providers", "plan", "context.weather.live", "--reason", "test-plan", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(providerPlan.code, CLI_EXIT_OK);
  const providerPlanPayload = parseCliJsonPayload<{
    status: string;
    willConnect: boolean;
    provider: { id: string; mode: string; metrics?: string[]; metricKeys?: unknown; adapterContract?: { providerId: string; input: { credentialRef: string }; output: { metrics?: string[]; monitorWriteRequired: boolean }; audit: { durableReceiptSource: string } } };
    broker: { status: string; failClosed: boolean };
    policy: { requiredGrants: string[]; credentialRefRequired: boolean; networkAccess: string };
    steps: Array<{ id: string; status: string; owner: string }>;
    receipt: { status: string; auditEvent: string; auditStatus: string; auditId: string };
    auditPlan: { status: string; durable: boolean; outcome: string; receiptStatus: string; redaction: { credentialRefRedacted: boolean; preciseLocationRedacted: boolean } };
    audit: { status: string; storageRef: string; auditPath?: string; outcome: string; durable: boolean };
    externalPending: boolean;
  }>(providerPlan.stdout);
  assert.equal(providerPlanPayload.status, "planned");
  assert.equal(providerPlanPayload.willConnect, false);
  assert.equal(providerPlanPayload.provider.id, "context.weather.live");
  assert.equal(providerPlanPayload.provider.mode, "live");
  assert.equal(providerPlanPayload.provider.metrics?.includes("context.weather.temperature"), true);
  assert.equal(Array.isArray(providerPlanPayload.provider.metricKeys), false);
  assert.equal(providerPlanPayload.provider.adapterContract?.providerId, "context.weather.live");
  assert.equal(providerPlanPayload.provider.adapterContract?.input.credentialRef, "required_redacted");
  assert.equal(providerPlanPayload.provider.adapterContract?.output.metrics?.includes("context.weather.temperature"), true);
  assert.equal(providerPlanPayload.provider.adapterContract?.output.monitorWriteRequired, true);
  assert.equal(providerPlanPayload.provider.adapterContract?.audit.durableReceiptSource, "provider_broker_or_signed_host");
  assert.equal(providerPlanPayload.broker.status, "external_pending");
  assert.equal(providerPlanPayload.broker.failClosed, true);
  assert.equal(providerPlanPayload.policy.requiredGrants.includes("weather.location.read"), true);
  assert.equal(providerPlanPayload.policy.credentialRefRequired, true);
  assert.equal(providerPlanPayload.policy.networkAccess, "blocked_until_granted");
  assert.equal(providerPlanPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "blocked" && step.owner === "provider_broker"), true);
  assert.equal(providerPlanPayload.steps.some((step) => step.id === "connect_provider" && step.status === "blocked" && step.owner === "provider_broker"), true);
  assert.equal(providerPlanPayload.receipt.status, "not_issued");
  assert.equal(providerPlanPayload.receipt.auditEvent, "system.telemetry.provider.weather.live");
  assert.equal(providerPlanPayload.auditPlan.status, "planned");
  assert.equal(providerPlanPayload.auditPlan.durable, false);
  assert.equal(providerPlanPayload.auditPlan.outcome, "blocked");
  assert.equal(providerPlanPayload.auditPlan.receiptStatus, "not_issued");
  assert.equal(providerPlanPayload.auditPlan.redaction.credentialRefRedacted, true);
  assert.equal(providerPlanPayload.auditPlan.redaction.preciseLocationRedacted, true);
  assert.equal(providerPlanPayload.receipt.auditStatus, "recorded");
  assert.equal(providerPlanPayload.audit.status, "recorded");
  assert.equal(providerPlanPayload.audit.outcome, "blocked");
  assert.equal(providerPlanPayload.audit.durable, true);
  assert.equal(providerPlanPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(providerPlanPayload.audit.auditPath, undefined);
  const providerPlanAuditPath = path.join(workspaceRoot, ".claw", "data", "system-telemetry-audit.jsonl");
  const providerPlanAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(providerPlanAudit.includes("\"providerId\":\"context.weather.live\""), true);
  assert.equal(providerPlanAudit.includes("\"credentialRefRedacted\":false"), true);
  assert.equal(providerPlanAudit.includes("\"outcome\":\"blocked\""), true);
  assert.equal(providerPlanPayload.externalPending, true);

  const providerPlanWithCredential = await runCliCapture([
    "system", "providers", "plan", "context.weather.live",
    "--credential-ref", "credential-lease:weather-local",
    "--reason", "credential-test",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(providerPlanWithCredential.code, CLI_EXIT_OK);
  const providerPlanWithCredentialPayload = parseCliJsonPayload<{
    request: { credentialRef: string | null; reason: string };
    steps: Array<{ id: string; status: string }>;
    audit: { storageRef: string; auditPath?: string };
  }>(providerPlanWithCredential.stdout);
  assert.equal(providerPlanWithCredentialPayload.request.credentialRef, "provided_redacted");
  assert.equal(providerPlanWithCredentialPayload.request.reason, "credential-test");
  assert.equal(providerPlanWithCredentialPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "pending"), true);
  assert.equal(providerPlanWithCredential.stdout.includes("credential-lease:weather-local"), false);
  assert.equal(providerPlanWithCredentialPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(providerPlanWithCredentialPayload.audit.auditPath, undefined);
  const providerPlanWithCredentialAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(providerPlanWithCredentialAudit.includes("\"credentialRefRedacted\":true"), true);
  assert.equal(providerPlanWithCredentialAudit.includes("credential-lease:weather-local"), false);

  const providerPlanWithUnsafeCredential = await runCliCapture([
    "system", "providers", "plan", "context.weather.live",
    "--credential-ref", "secret://weather/local",
    "--reason", "unsafe-credential-test",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(providerPlanWithUnsafeCredential.code, CLI_EXIT_USAGE);
  const unsafeCredentialPayload = JSON.parse(providerPlanWithUnsafeCredential.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(unsafeCredentialPayload.ok, false);
  assert.equal(unsafeCredentialPayload.error.code, "unsafe_credential_ref");
  assert.match(unsafeCredentialPayload.error.message, /public credential lease reference/);

  const sensorProviderPlan = await runCliCapture(["system", "providers", "plan", "system.sensors.signed", "--reason", "sensor-validation", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sensorProviderPlan.code, CLI_EXIT_OK);
  const sensorProviderPlanPayload = parseCliJsonPayload<{
    willConnect: boolean;
    provider: { id: string; kind: string; metrics?: string[]; metricKeys?: unknown };
    policy: { requiredGrants: string[]; credentialRefRequired: boolean };
    steps: Array<{ id: string; status: string }>;
    receipt: { auditEvent: string; auditStatus: string };
    auditPlan: { event: string; receiptStatus: string };
    audit: { status: string; storageRef: string; auditPath?: string };
  }>(sensorProviderPlan.stdout);
  assert.equal(sensorProviderPlanPayload.willConnect, false);
  assert.equal(sensorProviderPlanPayload.provider.id, "system.sensors.signed");
  assert.equal(sensorProviderPlanPayload.provider.kind, "hardware_sensor");
  assert.equal(sensorProviderPlanPayload.provider.metrics?.includes("system.sensor.temperature"), true);
  assert.equal(sensorProviderPlanPayload.provider.metrics?.includes("system.sensor.fan_speed"), true);
  assert.equal(Array.isArray(sensorProviderPlanPayload.provider.metricKeys), false);
  assert.equal(sensorProviderPlanPayload.policy.requiredGrants.includes("system.sensor.read"), true);
  assert.equal(sensorProviderPlanPayload.policy.credentialRefRequired, false);
  assert.equal(sensorProviderPlanPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "skipped"), true);
  assert.equal(sensorProviderPlanPayload.steps.some((step) => step.id === "connect_provider" && step.status === "blocked"), true);
  assert.equal(sensorProviderPlanPayload.receipt.auditEvent, "system.telemetry.provider.hardware_sensor.live");
  assert.equal(sensorProviderPlanPayload.auditPlan.event, "system.telemetry.provider.hardware_sensor.live");
  assert.equal(sensorProviderPlanPayload.auditPlan.receiptStatus, "not_issued");
  assert.equal(sensorProviderPlanPayload.receipt.auditStatus, "recorded");
  assert.equal(sensorProviderPlanPayload.audit.status, "recorded");
  assert.equal(sensorProviderPlanPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(sensorProviderPlanPayload.audit.auditPath, undefined);
  const sensorProviderPlanAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(sensorProviderPlanAudit.includes("\"providerId\":\"system.sensors.signed\""), true);
  assert.equal(sensorProviderPlanAudit.includes("system.sensor.read"), true);

  const controls = await runCliCapture(["system", "controls", "list", "--json"], process.cwd());
  assert.equal(controls.code, CLI_EXIT_OK);
  const controlsPayload = parseCliJsonPayload<{ controls: Array<{ id: string; family: string; requiresSignedHostBroker: boolean; requiredGrants: string[] }>; mutatesHardware: boolean }>(controls.stdout);
  assert.equal(controlsPayload.mutatesHardware, false);
  assert.equal(controlsPayload.controls.some((control) => control.id === "system.fan.set_speed" && control.requiresSignedHostBroker), true);
  assert.equal(controlsPayload.controls.some((control) => control.family === "audio" && control.requiredGrants.includes("system.audio.control")), true);

  const watch = await runCliCapture(["system", "watch", "--interval", "1", "--count", "2", "--jsonl"], process.cwd());
  assert.equal(watch.code, CLI_EXIT_OK);
  const watchLines = watch.stdout.trim().split("\n").map((line) => JSON.parse(line) as { ok: boolean; data: { samples: Array<{ key: string }> }; meta: { intervalMs: number; format: string } });
  assert.equal(watchLines.length, 2);
  assert.equal(watchLines.every((line) => line.ok && line.meta.intervalMs === 1 && line.meta.format === "jsonl"), true);
  assert.equal(watchLines.every((line) => line.data.samples.some((sample) => sample.key === "system.memory.used")), true);
});

test("runCli rejects unknown system snapshot sources", async () => {
  const result = await runCliCapture(["system", "snapshot", "--source", "signed", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_snapshot_source");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--source local or --source host/);
});

test("runCli plans system controls without executing hardware mutations", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-control-plan-"));
  const plan = await runCliCapture([
    "system", "controls", "plan", "system.display.set_brightness",
    "--target", "main",
    "--value", "70",
    "--reason", "test-plan",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(plan.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    status: string;
    willExecute: boolean;
    action: { id: string; requiresSignedHostBroker: boolean; requiresConfirmation: boolean };
    request: { target: string | null; value: string | null; reason: string };
    broker: { required: boolean; status: string; failClosed: boolean };
    policy: { requiredGrants: string[]; sensitiveDetailRedacted: boolean };
    steps: Array<{ id: string; status: string; owner: string }>;
    receipt: { required: boolean; status: string; auditEvent: string; auditStatus: string };
    auditPlan: { status: string; outcome: string; receiptStatus: string; redaction: { targetRedacted: boolean; valueRedacted: boolean; sensitiveDetailRedacted: boolean } };
    audit: { status: string; storageRef: string; auditPath?: string; outcome: string; durable: boolean };
    externalPending: boolean;
  }>(plan.stdout);
  assert.equal(payload.status, "planned");
  assert.equal(payload.willExecute, false);
  assert.equal(payload.action.id, "system.display.set_brightness");
  assert.equal(payload.action.requiresSignedHostBroker, true);
  assert.equal(payload.action.requiresConfirmation, false);
  assert.deepEqual(payload.request, { target: "main", value: "70", reason: "test-plan" });
  assert.equal(payload.broker.required, true);
  assert.equal(payload.broker.status, "external_pending");
  assert.equal(payload.broker.failClosed, true);
  assert.equal(payload.policy.requiredGrants.includes("system.display.control"), true);
  assert.equal(payload.policy.sensitiveDetailRedacted, true);
  assert.equal(payload.steps.some((step) => step.id === "execute_native_action" && step.status === "blocked" && step.owner === "signed_host_broker"), true);
  assert.equal(payload.receipt.required, true);
  assert.equal(payload.receipt.status, "not_issued");
  assert.equal(payload.receipt.auditEvent, "system.telemetry.control.display.set_brightness");
  assert.equal(payload.auditPlan.status, "planned");
  assert.equal(payload.auditPlan.outcome, "blocked");
  assert.equal(payload.auditPlan.receiptStatus, "not_issued");
  assert.equal(payload.auditPlan.redaction.targetRedacted, true);
  assert.equal(payload.auditPlan.redaction.valueRedacted, true);
  assert.equal(payload.auditPlan.redaction.sensitiveDetailRedacted, true);
  assert.equal(payload.receipt.auditStatus, "recorded");
  assert.equal(payload.audit.status, "recorded");
  assert.equal(payload.audit.outcome, "blocked");
  assert.equal(payload.audit.durable, true);
  assert.equal(payload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(payload.audit.auditPath, undefined);
  const controlPlanAudit = fs.readFileSync(path.join(workspaceRoot, ".claw", "data", "system-telemetry-audit.jsonl"), "utf8");
  assert.equal(controlPlanAudit.includes("\"controlId\":\"system.display.set_brightness\""), true);
  assert.equal(controlPlanAudit.includes("\"valueRedacted\":true"), true);
  assert.equal(payload.externalPending, true);
});

test("runCli executes system controls through configured signed host", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-control-host-"));
  const hostCommand = path.join(workspaceRoot, "host-control.js");
  fs.writeFileSync(hostCommand, `#!/usr/bin/env node
const args = process.argv.slice(2);
const value = args[args.indexOf("--value") + 1];
const controlId = args[args.indexOf("--control-id") + 1];
const dryRun = args.includes("--dry-run") && args[args.indexOf("--dry-run") + 1] === "true";
console.log(JSON.stringify({
  ok: true,
  data: {
    schema_version: 1,
    status: dryRun ? "planned" : "executed",
    will_execute: !dryRun,
    external_pending: false,
    action: { id: controlId, family: "audio", audit_event: "system.telemetry.control.audio.set_output_volume" },
    request: { target: "default", value, reason: "test-execute" },
    broker: {
      required: true,
      status: dryRun ? "planned" : "executed",
      mode: "signed_host_plan_first",
      fail_closed: true,
      capability_id: "mac.audio.volume"
    },
    receipt: {
      required: true,
      status: "issued",
      audit_event: "system.telemetry.control.audio.set_output_volume",
      mac_receipt_id: "macact_test",
      mac_audit_id: "macaudit_test",
      result: dryRun ? "planned" : "ok"
    }
  },
  meta: { adapter: "system-telemetry-control", source: "local_cli", capabilityId: controlId, riskLevel: "low" }
}));
`);
  fs.chmodSync(hostCommand, 0o755);

  const executed = await runCliCapture([
    "system", "controls", "execute", "system.audio.set_output_volume",
    "--target", "default",
    "--value", "35",
    "--dry-run", "true",
    "--reason", "test-execute",
    "--host-command", hostCommand,
    "--json",
  ], process.cwd());
  assert.equal(executed.code, CLI_EXIT_OK, executed.stderr);
  const payload = parseCliJsonPayload<{
    control: { id: string; requiresSignedHostBroker: boolean };
    response: {
      ok: boolean;
      data: {
        status: string;
        will_execute: boolean;
        broker: { capability_id: string; fail_closed: boolean };
        receipt: { status: string; result: string; mac_receipt_id: string };
      };
    };
  }>(executed.stdout);
  assert.equal(payload.control.id, "system.audio.set_output_volume");
  assert.equal(payload.control.requiresSignedHostBroker, true);
  assert.equal(payload.response.ok, true);
  assert.equal(payload.response.data.status, "planned");
  assert.equal(payload.response.data.will_execute, false);
  assert.equal(payload.response.data.broker.capability_id, "mac.audio.volume");
  assert.equal(payload.response.data.broker.fail_closed, true);
  assert.equal(payload.response.data.receipt.status, "issued");
  assert.equal(payload.response.data.receipt.result, "planned");
  assert.equal(payload.response.data.receipt.mac_receipt_id, "macact_test");
});

test("runCli blocks non-dry-run system control execution before invoking the host without exact approval", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-control-approval-"));
  const hostCommand = path.join(workspaceRoot, "host-control.js");
  const markerPath = path.join(workspaceRoot, "invoked.txt");
  fs.writeFileSync(hostCommand, `#!/usr/bin/env node
require("fs").writeFileSync(${JSON.stringify(markerPath)}, "invoked");
console.log(JSON.stringify({ ok: true, data: { status: "executed" } }));
`);
  fs.chmodSync(hostCommand, 0o755);

  const result = await runCliCapture([
    "system", "controls", "execute", "system.audio.set_output_volume",
    "--target", "default",
    "--value", "35",
    "--reason", "missing-approval",
    "--host-command", hostCommand,
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "approval_required");
  assert.match(payload.error.message, /--host-approval-id|--approval-id/);
  assert.equal(fs.existsSync(markerPath), false);
});

test("runCli records local context provider samples into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-context-provider-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const weatherFile = path.join(workspaceRoot, "weather.json");
  fs.writeFileSync(weatherFile, JSON.stringify({ "context.weather.temperature": 21.5 }));

  await withPatchedEnv({
    CLAW_CONTEXT_WEATHER_FILE: weatherFile,
    CLAW_CONTEXT_BUILD_STATUS: "passed",
    CLAW_CONTEXT_SERVICE_HEALTH: "degraded",
    CLAW_CONTEXT_AGENT_RUNS_ACTIVE: "2",
    CLAW_CONTEXT_CUSTOM_METRIC: "desk-ready",
  }, async () => {
    const snapshot = await runCliCapture([
      "system", "snapshot",
      "--record", "true",
      "--workspace", workspaceRoot,
      "--monitor-db", monitorDb,
      "--json",
    ], process.cwd());
    assert.equal(snapshot.code, CLI_EXIT_OK, snapshot.stderr);
    const payload = parseCliJsonPayload<{
      samples: Array<{
        key: string;
        value: number | string;
        unit: string;
        source: { adapter: string; confidence: string; detail?: string };
        tags?: Record<string, string>;
      }>;
      unavailableMetrics: string[];
      recorded: { sampleCount: number; sourceId: string };
    }>(snapshot.stdout);
    const weather = payload.samples.find((entry) => entry.key === "context.weather.temperature");
    assert.equal(weather?.value, 21.5);
    assert.equal(weather?.unit, "celsius");
    assert.equal(weather?.source.adapter, "provider");
    assert.equal(weather?.source.confidence, "provider");
    assert.equal(weather?.source.detail, "local_fixture");
    assert.equal(weather?.tags?.location, "redacted");
    assert.equal(payload.samples.some((entry) => entry.key === "context.build.status" && entry.value === 0), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.service.health" && entry.value === 1), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.agent_runs.active" && entry.value === 2), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.custom.metric" && entry.value === "desk-ready"), true);
    assert.equal(payload.unavailableMetrics.includes("context.weather.temperature"), false);
    assert.equal(payload.recorded.sourceId, "system.telemetry.local");
    assert.equal(payload.recorded.sampleCount >= 8, true);

    const history = await runCliCapture([
      "system", "history", "context.weather.temperature",
      "--range", "1h",
      "--monitor-db", monitorDb,
      "--json",
    ], process.cwd());
    assert.equal(history.code, CLI_EXIT_OK, history.stderr);
    const historyPayload = parseCliJsonPayload<{
      retention: { status: string };
      samples: Array<{ metricKey: string; value: number; tags: Record<string, string> }>;
      chart: { source: string; points: Array<{ value: number }> };
      render: { source: string; empty: boolean; line: string };
    }>(history.stdout);
    assert.equal(historyPayload.retention.status, "recorded");
    assert.equal(historyPayload.samples.some((entry) => entry.metricKey === "context.weather.temperature" && entry.value === 21.5 && entry.tags.location === "redacted"), true);
    assert.equal(historyPayload.chart.source, "metric_samples");
    assert.equal(historyPayload.chart.points.some((entry) => entry.value === 21.5), true);
    assert.equal(historyPayload.render.source, "metric_samples");
    assert.equal(historyPayload.render.empty, false);
  });
});

test("runCli records system telemetry snapshots into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-history-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "memory-any",
    "--metric-key", "system.memory.used",
    "--operator", "gt",
    "--threshold", "0",
    "--severity", "warning",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);

  const snapshot = await runCliCapture(["system", "snapshot", "--record", "true", "--workspace", workspaceRoot, "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    recorded: { store: string; dbPath: string; sourceId: string; sampleCount: number; rollupCount: number; incidentCount: number; purged: { samples: number; rollups: number; incidents: number } };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.recorded.store, "monitor.sqlite");
  assert.equal(snapshotPayload.recorded.dbPath, monitorDb);
  assert.equal(snapshotPayload.recorded.sourceId, "system.telemetry.local");
  assert.equal(snapshotPayload.recorded.sampleCount >= 3, true);
  assert.equal(snapshotPayload.recorded.rollupCount >= 3, true);
  assert.equal(snapshotPayload.recorded.incidentCount >= 1, true);
  assert.deepEqual(snapshotPayload.recorded.purged, { samples: 0, rollups: 0, incidents: 0 });
  assert.equal(fs.existsSync(monitorDb), true);

  const history = await runCliCapture(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{
    retention: { status: string; rollupBucketMs: number };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: number }>;
    rollups: Array<{ metricKey: string; bucketMs: number; count: number }>;
    incidents: Array<{ ruleId: string; metricKey: string; severity: string; status: string; sampleValue: number }>;
    chart: { kind: string; source: string; empty: boolean; points: Array<{ value: number; sourceId: string }> };
    render: { kind: string; source: string; empty: boolean; line: string; min: number | null; max: number | null };
  }>(history.stdout);
  assert.equal(historyPayload.retention.status, "recorded");
  assert.equal(historyPayload.retention.rollupBucketMs, 60_000);
  assert.equal(historyPayload.samples.some((sample) => sample.metricKey === "system.memory.used" && sample.sourceId === "system.telemetry.local" && sample.valueType === "number" && sample.unit === "bytes"), true);
  assert.equal(historyPayload.rollups.some((rollup) => rollup.metricKey === "system.memory.used" && rollup.bucketMs === 60_000 && rollup.count >= 1), true);
  assert.equal(historyPayload.incidents.some((incident) => incident.ruleId === "memory-any" && incident.metricKey === "system.memory.used" && incident.severity === "warning" && incident.status === "open"), true);
  assert.equal(historyPayload.chart.kind, "line");
  assert.equal(historyPayload.chart.source, "metric_samples");
  assert.equal(historyPayload.chart.empty, false);
  assert.equal(historyPayload.chart.points.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), true);

  const dayHistory = await runCliCapture(["system", "history", "system.memory.used", "--range", "24h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(dayHistory.code, CLI_EXIT_OK);
  const dayHistoryPayload = parseCliJsonPayload<{
    rangeMs: number;
    retention: { status: string };
    chart: { source: string; points: Array<{ value: number; sourceId: string }> };
    render: { kind: string; source: string; line: string };
  }>(dayHistory.stdout);
  assert.equal(dayHistoryPayload.rangeMs, 86_400_000);
  assert.equal(dayHistoryPayload.retention.status, "recorded");
  assert.equal(dayHistoryPayload.chart.source, "metric_samples");
  assert.equal(dayHistoryPayload.chart.points.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), true);
  assert.equal(dayHistoryPayload.render.kind, "ascii_sparkline");
  assert.equal(dayHistoryPayload.render.source, "metric_samples");
  assert.equal(dayHistoryPayload.render.line.length > 0, true);
  assert.equal(historyPayload.render.kind, "ascii_sparkline");
  assert.equal(historyPayload.render.source, "metric_samples");
  assert.equal(historyPayload.render.empty, false);
  assert.equal(historyPayload.render.line.length > 0, true);
  assert.equal(typeof historyPayload.render.min, "number");
  assert.equal(typeof historyPayload.render.max, "number");
});

test("runCli records signed host system telemetry snapshots into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-host-history-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const hostCommand = path.join(workspaceRoot, "host-snapshot.js");
  fs.writeFileSync(hostCommand, `#!/usr/bin/env node
const capturedAt = new Date().toISOString();
console.log(JSON.stringify({
  ok: true,
  data: {
    schema_version: 1,
    captured_at: capturedAt,
    host: { platform: "macos", hostname: "test-host", processor_count: 12 },
    samples: [
      { metric_key: "system.gpu.utilization", value: 42, unit: "percent", captured_at: capturedAt, source: "macos_host", confidence: "experimental" },
      { metric_key: "system.memory.used", value: 2048, unit: "bytes", captured_at: capturedAt, source: "macos_host", confidence: "observed" },
      { metric_key: "system.focus.mode", value: "work", unit: "string", captured_at: capturedAt, source: "context_provider", confidence: "provider" }
    ],
    unavailable_metrics: [{ metric_key: "system.sensor.temperature" }]
  }
}));
`);
  fs.chmodSync(hostCommand, 0o755);

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "focus-work",
    "--metric-key", "system.focus.mode",
    "--operator", "eq",
    "--threshold", "work",
    "--severity", "info",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);

  const snapshot = await runCliCapture([
    "system", "snapshot",
    "--source", "host",
    "--host-command", hostCommand,
    "--record", "true",
    "--workspace", workspaceRoot,
    "--monitor-db", monitorDb,
    "--json",
  ], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK, snapshot.stderr);
  const snapshotPayload = parseCliJsonPayload<{
    samples: Array<{ key: string; value: number | string; source: { adapter: string; confidence: string } }>;
    unavailableMetrics: string[];
    recorded: { sampleCount: number; sourceId: string };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.samples.some((sample) => sample.key === "system.gpu.utilization" && sample.source.adapter === "signed_host" && sample.source.confidence === "experimental"), true);
  assert.equal(snapshotPayload.samples.some((sample) => sample.key === "system.focus.mode" && sample.value === "work" && sample.source.adapter === "signed_host" && sample.source.confidence === "provider"), true);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.sensor.temperature"), true);
  assert.equal(snapshotPayload.recorded.sourceId, "system.telemetry.local");
  assert.equal(snapshotPayload.recorded.sampleCount, 3);

  const history = await runCliCapture(["system", "history", "system.gpu.utilization", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{
    retention: { status: string };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: number }>;
    chart: { source: string; points: Array<{ value: number }> };
  }>(history.stdout);
  assert.equal(historyPayload.retention.status, "recorded");
  assert.equal(historyPayload.samples.some((sample) => sample.metricKey === "system.gpu.utilization" && sample.sourceId === "system.telemetry.local" && sample.valueType === "number" && sample.unit === "percent" && sample.value === 42), true);
  assert.equal(historyPayload.chart.source, "metric_samples");
  assert.equal(historyPayload.chart.points.some((point) => point.value === 42), true);

  const focusHistory = await runCliCapture(["system", "history", "system.focus.mode", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(focusHistory.code, CLI_EXIT_OK);
  const focusHistoryPayload = parseCliJsonPayload<{
    retention: { status: string };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: string }>;
    rollups: Array<{ metricKey: string; lastValue: string; minValue: number | null; maxValue: number | null; avgValue: number | null }>;
    incidents: Array<{ ruleId: string; metricKey: string; severity: string; operator: string; threshold: string; sampleValue: string; unit: string }>;
  }>(focusHistory.stdout);
  assert.equal(focusHistoryPayload.retention.status, "recorded");
  assert.equal(focusHistoryPayload.samples.some((sample) => sample.metricKey === "system.focus.mode" && sample.sourceId === "system.telemetry.local" && sample.valueType === "string" && sample.unit === "string" && sample.value === "work"), true);
  assert.equal(focusHistoryPayload.rollups.some((rollup) => rollup.metricKey === "system.focus.mode" && rollup.lastValue === "work" && rollup.minValue === null && rollup.maxValue === null && rollup.avgValue === null), true);
  assert.equal(focusHistoryPayload.incidents.some((incident) => incident.ruleId === "focus-work" && incident.metricKey === "system.focus.mode" && incident.severity === "info" && incident.operator === "eq" && incident.threshold === "work" && incident.sampleValue === "work" && incident.unit === "string"), true);
});

test("runCli applies short local retention to system telemetry samples without purging Monitor health events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-retention-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const sqlite = new Database(monitorDb);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  sqlite.prepare(`
    INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("health-heartbeat", "health_check", "info", "Worker alive", new Date().toISOString(), "{}");
  sqlite.close();

  const snapshot = await runCliCapture(["system", "snapshot", "--record", "true", "--raw-retention", "0m", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    recorded: { sampleCount: number; purged: { samples: number; rollups: number; incidents: number } };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.recorded.sampleCount >= 3, true);
  assert.equal(snapshotPayload.recorded.purged.samples >= 1, true);

  const retained = new Database(monitorDb, { readonly: true });
  try {
    const event = retained.prepare("SELECT id, kind, message FROM operational_events WHERE id = ?").get("health-heartbeat") as { id: string; kind: string; message: string } | undefined;
    const rollupCount = (retained.prepare("SELECT COUNT(*) AS count FROM metric_rollups WHERE metric_key = ?").get("system.memory.used") as { count: number }).count;
    assert.deepEqual(event, { id: "health-heartbeat", kind: "health_check", message: "Worker alive" });
    assert.equal(rollupCount >= 1, true);
  } finally {
    retained.close();
  }

  const history = await runCliCapture(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{ retention: { status: string }; samples: unknown[]; rollups: Array<{ metricKey: string }>; chart: { source: string; points: Array<{ value: number; count: number }> } }>(history.stdout);
  assert.equal(historyPayload.retention.status, "empty");
  assert.deepEqual(historyPayload.samples, []);
  assert.equal(historyPayload.rollups.some((rollup) => rollup.metricKey === "system.memory.used"), true);
  assert.equal(historyPayload.chart.source, "metric_rollups");
  assert.equal(historyPayload.chart.points.some((point) => typeof point.value === "number" && point.count >= 1), true);
});

test("runCli persists system telemetry rules and widgets in workspace state", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-state-"));

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "memory-high",
    "--metric-key", "system.memory.used",
    "--operator", "gt",
    "--threshold", "1024",
    "--severity", "critical",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);
  const rulePayload = parseCliJsonPayload<{ rule: { id: string; metricKey: string; severity: string }; statePath: string; mutatesHardware: boolean }>(upsertRule.stdout);
  assert.equal(rulePayload.rule.id, "memory-high");
  assert.equal(rulePayload.rule.metricKey, "system.memory.used");
  assert.equal(rulePayload.rule.severity, "critical");
  assert.equal(rulePayload.mutatesHardware, false);
  assert.equal(fs.existsSync(rulePayload.statePath), true);

  const listRules = await runCliCapture(["system", "rules", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  const rulesPayload = parseCliJsonPayload<{ rules: Array<{ id: string }> }>(listRules.stdout);
  assert.equal(rulesPayload.rules.some((rule) => rule.id === "memory-high"), true);

  const deleteRule = await runCliCapture(["system", "rules", "delete", "memory-high", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(deleteRule.code, CLI_EXIT_OK);
  const deletedRulesPayload = parseCliJsonPayload<{ deleted: string; rules: Array<{ id: string }>; mutatesHardware: boolean }>(deleteRule.stdout);
  assert.equal(deletedRulesPayload.deleted, "memory-high");
  assert.equal(deletedRulesPayload.mutatesHardware, false);
  assert.equal(deletedRulesPayload.rules.some((rule) => rule.id === "memory-high"), false);

  const upsertWidget = await runCliCapture([
    "system", "widgets", "upsert", "battery-text",
    "--metric-key", "system.power.uptime",
    "--title", "Uptime",
    "--presentation", "text",
    "--placement", "menubar",
    "--enabled", "true",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertWidget.code, CLI_EXIT_OK);
  const widgetPayload = parseCliJsonPayload<{ widget: { id: string; placement: string; presentation: string }; statePath: string; hostSpecific: boolean }>(upsertWidget.stdout);
  assert.equal(widgetPayload.widget.id, "battery-text");
  assert.equal(widgetPayload.widget.placement, "menubar");
  assert.equal(widgetPayload.widget.presentation, "text");
  assert.equal(widgetPayload.hostSpecific, true);
  assert.equal(fs.existsSync(widgetPayload.statePath), true);

  const deleteWidget = await runCliCapture(["system", "widgets", "delete", "battery-text", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(deleteWidget.code, CLI_EXIT_OK);
  const deletedWidgetPayload = parseCliJsonPayload<{ deleted: string; widgets: Array<{ id: string }>; hostSpecific: boolean }>(deleteWidget.stdout);
  assert.equal(deletedWidgetPayload.deleted, "battery-text");
  assert.equal(deletedWidgetPayload.hostSpecific, true);
  assert.equal(deletedWidgetPayload.widgets.some((widget) => widget.id === "battery-text"), false);
});

test("runCli supports implicit db create, schema inspection, human output, and alias parity", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-magic-db-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const createStdout = captureStream();
  const createStderr = captureStream();
  assert.equal(await runCli(["db", "task", "Comprar leche"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(createStderr.getOutput(), /Using local database for this project/);
  assert.match(createStdout.getOutput(), /Created task (\S+) "Comprar leche"/);
  const taskId = createStdout.getOutput().match(/Created task (\S+) "Comprar leche"/)?.[1] ?? "";
  assert.ok(taskId);

  const listStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "list"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(taskId));

  const getStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "get", taskId], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(getStdout.getOutput(), /title: Comprar leche/);
  assert.match(getStdout.getOutput(), /status: todo/);

  const collectionsStdout = captureStream();
  assert.equal(await runCli(["collections", "tasks", "list", "--json"], {
    stdout: collectionsStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(collectionsStdout.getOutput(), new RegExp(taskId));

  const recordsStdout = captureStream();
  assert.equal(await runCli(["records", "tasks", "get", taskId, "--json"], {
    stdout: recordsStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<{ id: string }>(recordsStdout.getOutput()).id, taskId);

  const updateStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "update", taskId, "--set", "priority=urgent", "--set", "estimateMinutes=15", "--json"], {
    stdout: updateStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const updatedTask = parseCliJsonPayload<{ priority?: string; estimateMinutes?: number }>(updateStdout.getOutput());
  assert.equal(updatedTask.priority, "urgent");
  assert.equal(updatedTask.estimateMinutes, 15);

  const queryStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "query", "Comprar", "--json"], {
    stdout: queryStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<Array<{ id: string }>>(queryStdout.getOutput()).some((item) => item.id === taskId), true);

  const invalidFieldStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "update", taskId, "--set", "priority=never", "--json"], {
    stdout: invalidFieldStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_USAGE);
  const invalidField = JSON.parse(invalidFieldStdout.getOutput()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(invalidField.ok, false);
  assert.equal(invalidField.error.code, "invalid_field_value");
  assert.match(invalidField.error.message, /low, medium, high, urgent/);

  const aliasStdout = captureStream();
  assert.equal(await runCli(["tasks", "create", "Alias task"], {
    stdout: aliasStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(aliasStdout.getOutput(), /\S+/);
  const emptyStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "list"], {
    stdout: emptyStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(emptyStdout.getOutput(), /No leads yet/);
  assert.match(emptyStdout.getOutput(), /Try: claw db lead "First lead"/);

  const leadStdout = captureStream();
  const leadStderr = captureStream();
  assert.equal(await runCli(["db", "leads", "--set", "name=Ada", "--set", "website=https://ada.dev", "--set", "companyId=company_ada"], {
    stdout: leadStdout.stream,
    stderr: leadStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(leadStderr.getOutput(), /Mapped "name" to "title"/);
  assert.match(leadStdout.getOutput(), /Created lead \S+ "Ada"/);

  const schemaStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "schema"], {
    stdout: schemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(schemaStdout.getOutput(), /collection: leads/);
  assert.match(schemaStdout.getOutput(), /protected: yes/);

  const taskSchemaStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "schema", "--json"], {
    stdout: taskSchemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const taskSchema = parseCliJsonPayload<{ collection: { fields: Array<{ name: string; type: string; options?: string[] }> } }>(taskSchemaStdout.getOutput());
  assert.equal(taskSchema.collection.fields.some((field) => field.name === "priority" && field.options?.includes("urgent")), true);
  assert.equal(taskSchema.collection.fields.some((field) => field.name === "estimateMinutes" && field.type === "number"), true);

});

test("runCli magic db list and query honor explicit include-archived false", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-magic-db-archived-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const createStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "create", "--set", "name=Archived lead", "--set", "companyId=company-archived", "--json"], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const created = parseCliJsonPayload<{ id: string }>(createStdout.getOutput());

  const sqlite = new Database(resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "core.sqlite"));
  t.onTestFinished(() => sqlite.close());
  const row = sqlite.prepare("SELECT data_json FROM records WHERE namespace_id = ? AND collection_name = ? AND id = ?")
    .get("main", "leads", created.id) as { data_json: string };
  sqlite.prepare("UPDATE records SET data_json = ? WHERE namespace_id = ? AND collection_name = ? AND id = ?").run(
    JSON.stringify({ ...JSON.parse(row.data_json) as Record<string, unknown>, archivedAt: "2026-01-01T00:00:00.000Z" }),
    "main",
    "leads",
    created.id,
  );

  const listFalseStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "list", "--include-archived", "false", "--json"], {
    stdout: listFalseStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<Array<{ id: string }>>(listFalseStdout.getOutput()).some((item) => item.id === created.id), false);

  const queryFalseStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "query", "Archived", "--include-archived", "false", "--json"], {
    stdout: queryFalseStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_DEGRADED);
  assert.equal(parseCliJsonPayload<Array<{ id: string }>>(queryFalseStdout.getOutput()).some((item) => item.id === created.id), false);

  const listTrueStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "list", "--include-archived", "true", "--json"], {
    stdout: listTrueStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<Array<{ id: string }>>(listTrueStdout.getOutput()).some((item) => item.id === created.id), true);
});

test("runCli can scaffold a workspace-first project with the new command surface", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-workspace-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "workspace", "demo-workspace", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"type": "workspace"/);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-workspace");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.type, "workspace");
  assert.equal(projectConfig.directories.skills, "claw/skills");
});

test("runCli scaffolds npm-safe package names from common title separators", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-safe-name-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "workspace", "_Demo Workspace_", "--dir", "demo-workspace", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"name": "demo-workspace"/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(tempRoot, "demo-workspace", "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-workspace");
});

test("runCli scaffolds agent skills where the generated project looks for them", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-agent-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "agent", "support-agent", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"type": "agent"/);

  const projectRoot = path.join(tempRoot, "support-agent");
  assert.equal(fs.existsSync(path.join(projectRoot, "skills", "README.md")), true);

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.directories.skills, "skills");
});

test("runCli can manage command-backed generations end to end", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generations-"));
  useIsolatedClawDataRoot(t, workspaceDir);
  const scriptPath = createFakeGenerationScript();

  const registerStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "register-command",
    "--workspace", workspaceDir,
    "--id", "fake-image",
    "--label", "Fake Image",
    "--kinds", "image",
    "--command", scriptPath,
    "--args-json", "[\"--out\",\"{outputPath}\"]",
    "--ext", "png",
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"id": "fake-image"/);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "create",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--backend", "fake-image",
    "--prompt", "sunset over water",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  const created = parseCliJsonPayload<{ id: string; output?: { filePath?: string } }>(createStdout.getOutput());
  assert.match(created.id, /^gen-/);
  assert.equal(fs.existsSync(created.output?.filePath || ""), true);

  const listStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "list",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"kind": "image"/);

  const readStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "read",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), new RegExp(created.id));

  const deleteStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "delete",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(deleteStdout.getOutput(), /"removed": true/);
});

test("runCli can create and list images through the image alias and an auto-detected OpenClaw skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-generations-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const backendsStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "backends",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: backendsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(backendsStdout.getOutput(), /openclaw-skill:openai-image-gen/);

    const createStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "generate",
      "--workspace", workspaceDir,
      "--prompt", "editorial lobster portrait",
      "--model", "gpt-image-1.5",
      "--output-format", "webp",
      "--json",
    ], {
      stdout: createStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);

    const created = parseCliJsonPayload<{ backendId: string; output?: { filePath?: string } }>(createStdout.getOutput());
    assert.equal(created.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(fs.existsSync(created.output?.filePath || ""), true);
    assert.match(fs.readFileSync(created.output?.filePath || "", "utf8"), /cli-openclaw:gpt-image-1.5/);

    const listStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "list",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"backendId": "openclaw-skill:openai-image-gen"/);
  });
});

test("runCli supports native image create, edit, import, list, and show", async () => {
  const server = await createFakeOpenAIImageCliServer();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-workspace-"));
  const imageLibrary = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-library-"));
  const codexImagePath = path.join(workspaceDir, "codex.png");
  fs.writeFileSync(codexImagePath, Buffer.from(ONE_PIXEL_PNG, "base64"));

  try {
    await withPatchedEnv({ OPENAI_API_KEY: "test-key" }, async () => {
      const createStdout = captureStream();
      const createStderr = captureStream();
      assert.equal(await runCli([
        "image",
        "create",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--prompt", "library logo",
        "--type", "logo",
        "--tags", "brand,library",
        "--json",
      ], {
        stdout: createStdout.stream,
        stderr: createStderr.stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK, `${createStdout.getOutput()}\n${createStderr.getOutput()}`);
      const created = parseCliJsonPayload<{ id: string; operation: string; imageType: string }>(createStdout.getOutput());
      assert.equal(created.operation, "create");
      assert.equal(created.imageType, "logo");

      const editStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "edit",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--id", created.id,
        "--prompt", "make the logo monochrome",
        "--json",
      ], {
        stdout: editStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const edited = parseCliJsonPayload<{ id: string; parentId: string; editDepth: number }>(editStdout.getOutput());
      assert.equal(edited.parentId, created.id);
      assert.equal(edited.editDepth, 1);

      const importStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "import",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--file", codexImagePath,
        "--prompt", "Codex generated brand variant",
        "--provenance", "imported-codex",
        "--external-generator", "codex",
        "--type", "logo",
        "--parent-id", edited.id,
        "--tags", "codex,brand",
        "--json",
      ], {
        stdout: importStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const imported = parseCliJsonPayload<{ id: string; provenance: string; parentId: string }>(importStdout.getOutput());
      assert.equal(imported.provenance, "imported-codex");
      assert.equal(imported.parentId, edited.id);

      const listStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "list",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--query", "codex",
        "--json",
      ], {
        stdout: listStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(listStdout.getOutput(), /imported-codex/);

      const pluralListStdout = captureStream();
      assert.equal(await runCli([
        "images",
        "list",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--query", "codex",
        "--json",
      ], {
        stdout: pluralListStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(pluralListStdout.getOutput(), /imported-codex/);

      const showStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "show",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--id", imported.id,
        "--json",
      ], {
        stdout: showStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(showStdout.getOutput(), /Codex generated brand variant/);
    });
    assert.deepEqual(server.requests.map((entry) => entry.pathname), [`${OPENAI_API_PREFIX}/images/generations`, `${OPENAI_API_PREFIX}/images/edits`]);
  } finally {
    await server.close();
  }
});
