import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload, withPatchedEnv } from "./index-test-utils.ts";

test("document and media downloads require export review metadata", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-download-review-"));
  const clawHome = path.join(workspaceRoot, ".claw-home");
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  const documentOutput = path.join(workspaceRoot, "downloaded-document.txt");
  const mediaOutput = path.join(workspaceRoot, "downloaded-media.txt");
  const dataRoot = path.join(workspaceRoot, "claw-data");
  fs.writeFileSync(sourceFile, "alpha notes for document search");
  fs.mkdirSync(clawHome, { recursive: true });

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    CLAW_DATABASE_FILES_DIR: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
  const uploadStdout = captureStream();
  assert.equal(await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--file", sourceFile,
    "--json",
  ], {
    stdout: uploadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const uploaded = parseCliJsonPayload<{ documentId: string }>(uploadStdout.getOutput());

  assert.equal(await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--document-id", uploaded.documentId,
    "--out", documentOutput,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_FAILURE);

  assert.equal(await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--document-id", uploaded.documentId,
    "--out", documentOutput,
    "--confirm",
    "--approval-id", "approval_document_download",
    "--legal-label", "Document download - human reviewed",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(fs.readFileSync(documentOutput, "utf8"), "alpha notes for document search");
  const documentLegal = JSON.parse(fs.readFileSync(`${documentOutput}.claw-legal.json`, "utf8")) as {
    approvalId: string;
    legalLabel: string;
    kind: string;
    policy: { decision: string; reasonCodes: string[]; requirements: string[]; outputLabels: string[] };
  };
  assert.equal(documentLegal.kind, "claw.documents.download.legal");
  assert.equal(documentLegal.approvalId, "approval_document_download");
  assert.equal(documentLegal.legalLabel, "Document download - human reviewed");
  assert.equal(documentLegal.policy.decision, "allow");
  assert.ok(documentLegal.policy.reasonCodes.includes("sensitive_export_review_required"));
  assert.ok(documentLegal.policy.requirements.includes("human_review"));
  assert.ok(documentLegal.policy.outputLabels.includes("regulated_domain:identity"));

  const mediaListStdout = captureStream();
  assert.equal(await runCli([
    "media",
    "list",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--json",
  ], {
    stdout: mediaListStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const media = parseCliJsonPayload<Array<{ mediaId: string }>>(mediaListStdout.getOutput());
  assert.ok(media[0]?.mediaId);

  assert.equal(await runCli([
    "media",
    "download",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--media-id", media[0].mediaId,
    "--out", mediaOutput,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_FAILURE);

  assert.equal(await runCli([
    "media",
    "download",
    "--workspace", workspaceRoot,
    "--claw-home", clawHome,
    "--media-id", media[0].mediaId,
    "--out", mediaOutput,
    "--confirm",
    "--approval-id", "approval_media_download",
    "--legal-label", "Media download - human reviewed",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(fs.readFileSync(mediaOutput, "utf8"), "alpha notes for document search");
  const mediaLegal = JSON.parse(fs.readFileSync(`${mediaOutput}.claw-legal.json`, "utf8")) as {
    approvalId: string;
    legalLabel: string;
    kind: string;
    policy: { decision: string; reasonCodes: string[]; requirements: string[]; outputLabels: string[] };
  };
  assert.equal(mediaLegal.kind, "claw.media.download.legal");
  assert.equal(mediaLegal.approvalId, "approval_media_download");
  assert.equal(mediaLegal.legalLabel, "Media download - human reviewed");
  assert.equal(mediaLegal.policy.decision, "allow");
  assert.ok(mediaLegal.policy.reasonCodes.includes("sensitive_export_review_required"));
  assert.ok(mediaLegal.policy.requirements.includes("output_label"));
  assert.ok(mediaLegal.policy.outputLabels.includes("regulated_domain:identity"));
  });
});
