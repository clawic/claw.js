import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload } from "./index-test-utils.ts";

test("document and media downloads require export review metadata", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-download-review-"));
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  const documentOutput = path.join(workspaceRoot, "downloaded-document.txt");
  const mediaOutput = path.join(workspaceRoot, "downloaded-media.txt");
  fs.writeFileSync(sourceFile, "alpha notes for document search");

  const uploadStdout = captureStream();
  assert.equal(await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
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
  const documentLegal = JSON.parse(fs.readFileSync(`${documentOutput}.claw-legal.json`, "utf8")) as { approvalId: string; legalLabel: string; kind: string };
  assert.equal(documentLegal.kind, "claw.documents.download.legal");
  assert.equal(documentLegal.approvalId, "approval_document_download");
  assert.equal(documentLegal.legalLabel, "Document download - human reviewed");

  const mediaListStdout = captureStream();
  assert.equal(await runCli([
    "media",
    "list",
    "--workspace", workspaceRoot,
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
  const mediaLegal = JSON.parse(fs.readFileSync(`${mediaOutput}.claw-legal.json`, "utf8")) as { approvalId: string; legalLabel: string; kind: string };
  assert.equal(mediaLegal.kind, "claw.media.download.legal");
  assert.equal(mediaLegal.approvalId, "approval_media_download");
  assert.equal(mediaLegal.legalLabel, "Media download - human reviewed");
});
