import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

function parseCliJsonError(output: string): { error: { code: string; status: string; message: string } } {
  const payload = JSON.parse(output) as { ok?: boolean; error?: { code?: string; status?: string; message?: string } };
  assert.equal(payload.ok, false);
  assert.equal(typeof payload.error?.code, "string");
  assert.equal(payload.error?.status, "USAGE");
  assert.equal(typeof payload.error?.message, "string");
  return payload as { error: { code: string; status: string; message: string } };
}

test("mcp upsert requires command or url before writing config", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-mcp-upsert-transport-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const configPath = path.join(workspaceRoot, "config.toml");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const result = await runCliCapture(["mcp", "upsert", "srv", "--config", configPath, "--json"], workspaceRoot);

    assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
    const payload = parseCliJsonError(result.stdout);
    assert.equal(payload.error.code, "missing_mcp_server_transport");
    assert.match(payload.error.message, /--command CMD\|--url URL/);
    assert.equal(fs.existsSync(configPath), false);
  });
});

test("sheets workbook upsert rejects unsafe ids before writing outside workbook root", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-sheets-unsafe-id-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const workbooksRoot = resolveClawPersistentSurfacePath("claw.workspace.sheets", workspaceRoot, "workbooks");
  const escapedPath = path.resolve(workbooksRoot, "../escaped.json");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const result = await runCliCapture(["sheets", "workbook", "upsert", "../escaped", "--workspace", workspaceRoot, "--json"], workspaceRoot);

    assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
    const payload = parseCliJsonError(result.stdout);
    assert.equal(payload.error.code, "invalid_sheets_workbook_id");
    assert.match(payload.error.message, /safe local identifier/);
    assert.equal(fs.existsSync(escapedPath), false);
    assert.equal(fs.existsSync(workbooksRoot), false);
  });
});

test("sheets workbook upsert rejects corrupt file JSON before writing workbook", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-sheets-bad-json-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const badFile = path.join(workspaceRoot, "bad.json");
  const workbooksRoot = resolveClawPersistentSurfacePath("claw.workspace.sheets", workspaceRoot, "workbooks");
  const workbookPath = path.join(workbooksRoot, "book.json");
  fs.writeFileSync(badFile, "{bad json", "utf8");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const result = await runCliCapture(["sheets", "workbook", "upsert", "book", "--file", badFile, "--workspace", workspaceRoot, "--json"], workspaceRoot);

    assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
    const payload = parseCliJsonError(result.stdout);
    assert.equal(payload.error.code, "invalid_sheets_workbook_file_json");
    assert.match(payload.error.message, /--file/);
    assert.equal(fs.existsSync(workbookPath), false);
    assert.equal(fs.existsSync(workbooksRoot), false);
  });
});
