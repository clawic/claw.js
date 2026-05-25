import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { resolveClawjsMainDbPath } from "./v1-data-core.ts";

test("providers settings rejects invalid enabled values without persisting config", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-settings-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-settings-cwd-"));
    const stderr = captureStream();
    const stdout = captureStream();
    const code = await runInternalV1Cli(["providers", "settings", "set", "openai", "--enabled", "treu", "--json"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd,
    });
    assert.equal(code, CLI_EXIT_USAGE);
    const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string } };
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "usage");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT * FROM provider_settings WHERE provider = ?").all("openai");
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }

    const validStdout = captureStream();
    assert.equal(await runInternalV1Cli(["providers", "settings", "set", "openai", "--enabled", "false", "--json"], {
      stdout: validStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const valid = JSON.parse(validStdout.getOutput()) as { ok: boolean; data: { enabled: boolean } };
    assert.equal(valid.ok, true);
    assert.equal(valid.data.enabled, false);
  });
});

test("providers reject invalid policy and metadata JSON before persistence", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-json-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-json-cwd-"));
    const cases: Array<{ argv: string[]; code: string; table: string; where: string; id: string }> = [
      {
        argv: ["providers", "settings", "set", "openai", "--enabled", "true", "--policy", "{bad", "--json"],
        code: "invalid_provider_settings_policy_json",
        table: "provider_settings",
        where: "provider",
        id: "openai",
      },
      {
        argv: ["providers", "routing", "set", "chat", "--capability", "llm", "--provider", "openai", "--metadata", "{bad", "--json"],
        code: "invalid_provider_routing_metadata_json",
        table: "provider_routing",
        where: "feature",
        id: "chat",
      },
    ];

    for (const testCase of cases) {
      const stdout = captureStream();
      assert.equal(await runInternalV1Cli(testCase.argv, {
        stdout: stdout.stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_USAGE);
      const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
      assert.equal(error.ok, false);
      assert.equal(error.error.code, testCase.code);
      assert.equal(error.error.status, "USAGE");
    }

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      for (const testCase of cases) {
        const rows = sqlite.prepare(`SELECT * FROM ${testCase.table} WHERE ${testCase.where} = ?`).all(testCase.id);
        assert.deepEqual(rows, []);
      }
    } finally {
      sqlite.close();
    }
  });
});

test("snippets reject invalid scope and metadata JSON before persistence", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-json-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-json-cwd-"));
    const cases: Array<{ flag: string; code: string; slug: string }> = [
      { flag: "--scope", code: "invalid_snippet_scope_json", slug: "bad-scope" },
      { flag: "--metadata", code: "invalid_snippet_metadata_json", slug: "bad-metadata" },
    ];

    for (const testCase of cases) {
      const stdout = captureStream();
      assert.equal(await runInternalV1Cli([
        "snippets",
        "upsert",
        testCase.slug,
        "--title",
        "Snippet",
        "--body",
        "Body",
        testCase.flag,
        "{bad",
        "--json",
      ], {
        stdout: stdout.stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_USAGE);
      const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
      assert.equal(error.ok, false);
      assert.equal(error.error.code, testCase.code);
      assert.equal(error.error.status, "USAGE");
    }

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT slug FROM snippets ORDER BY slug").all();
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }
  });
});

test("snippets reject missing file before persistence and accept body or existing file", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-file-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-file-cwd-"));
    const missingStdout = captureStream();
    assert.equal(await runInternalV1Cli([
      "snippets",
      "upsert",
      "missing-file",
      "--title",
      "Missing File",
      "--file",
      "missing.md",
      "--json",
    ], {
      stdout: missingStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);
    const missingError = JSON.parse(missingStdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(missingError.ok, false);
    assert.equal(missingError.error.code, "snippet_file_missing");
    assert.equal(missingError.error.status, "USAGE");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      assert.deepEqual(sqlite.prepare("SELECT slug FROM snippets ORDER BY slug").all(), []);

      const bodyStdout = captureStream();
      assert.equal(await runInternalV1Cli([
        "snippets",
        "upsert",
        "body-snippet",
        "--title",
        "Body Snippet",
        "--body",
        "Body text",
        "--json",
      ], {
        stdout: bodyStdout.stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);

      const snippetPath = path.join(cwd, "snippet.md");
      fs.writeFileSync(snippetPath, "File text", "utf8");
      const fileStdout = captureStream();
      assert.equal(await runInternalV1Cli([
        "snippets",
        "upsert",
        "file-snippet",
        "--title",
        "File Snippet",
        "--file",
        "snippet.md",
        "--json",
      ], {
        stdout: fileStdout.stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);

      const rows = sqlite.prepare("SELECT slug, title, body FROM snippets ORDER BY slug").all();
      assert.deepEqual(rows, [
        { slug: "body-snippet", title: "Body Snippet", body: "Body text" },
        { slug: "file-snippet", title: "File Snippet", body: "File text" },
      ]);
    } finally {
      sqlite.close();
    }
  });
});

test("snippets reject invalid kind values before persistence", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-kind-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-snippet-kind-cwd-"));
    const stdout = captureStream();
    assert.equal(await runInternalV1Cli([
      "snippets",
      "upsert",
      "bad-kind",
      "--title",
      "Bad Kind",
      "--body",
      "Body",
      "--kind",
      "nonsense",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);
    const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "invalid_snippet_kind");
    assert.equal(error.error.status, "USAGE");

    const listStdout = captureStream();
    assert.equal(await runInternalV1Cli(["snippets", "list", "--kind", "nonsense", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);
    const listError = JSON.parse(listStdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(listError.error.code, "invalid_snippet_kind");
    assert.equal(listError.error.status, "USAGE");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT slug, kind FROM snippets ORDER BY slug").all();
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }

    const validStdout = captureStream();
    assert.equal(await runInternalV1Cli([
      "snippets",
      "upsert",
      "template-snippet",
      "--title",
      "Template Snippet",
      "--body",
      "Body",
      "--kind",
      "template",
      "--json",
    ], {
      stdout: validStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const valid = JSON.parse(validStdout.getOutput()) as { ok: boolean; data: { kind: string } };
    assert.equal(valid.ok, true);
    assert.equal(valid.data.kind, "template");
  });
});
