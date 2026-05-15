import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import { clawDataFiles, resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_OK, runCli } from "./index.ts";
import { resolveClawjsDataRoot, resolveClawjsFilesDir, resolveClawjsMainDbPath } from "./v1-data.ts";
import { captureStream, runInternalV1Cli, useIsolatedMainData, withPatchedEnv } from "./index-test-utils.ts";

function parseCliData<T>(output: string): T {
  const parsed = JSON.parse(output) as { ok?: boolean; data?: unknown; meta?: Record<string, unknown> };
  assert.equal(parsed.ok, true);
  assert.equal(typeof parsed.meta?.canonicalCommand, "string");
  assert.equal(parsed.meta?.schemaVersion, 1);
  return parsed.data as T;
}

test("V2 main data paths default to the Claw home data namespace", () => {
  assert.equal(resolveClawjsDataRoot({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length)));
  assert.equal(resolveClawjsMainDbPath({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length), "core.sqlite"));
  assert.equal(resolveClawjsFilesDir({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length), "files"));

  const explicit = path.join(os.tmpdir(), "clawjs-explicit-root");
  assert.equal(resolveClawjsDataRoot({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), explicit);
  assert.equal(resolveClawjsMainDbPath({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), path.join(explicit, "core.sqlite"));
  assert.equal(
    resolveClawjsDataRoot({
      CLAW_HOME: path.join(os.tmpdir(), "claw-home"),
      CLAW_DATA_DIR: explicit,
    } as NodeJS.ProcessEnv),
    explicit,
  );
  assert.equal(
    resolveClawjsDataRoot({ CLAW_HOME: path.join(os.tmpdir(), "claw-home") } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "claw-home", "data"),
  );
  assert.equal(
    resolveClawjsMainDbPath({
      CLAW_DATA_DIR: explicit,
      CLAW_DB_PATH: path.join(os.tmpdir(), "custom-core.sqlite"),
    } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "custom-core.sqlite"),
  );
});

test("app-state projects persist opaque resource ids alongside paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-"));
  let restoreEnv: (() => void) | undefined;
  const dataRoot = useIsolatedMainData({ after: (fn) => { restoreEnv = fn; } }, workspaceRoot);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-cwd-"));
  const stdout = captureStream();
  assert.equal(await runInternalV1Cli(["app-state", "project", "upsert", "proj-local", "--resource-id", "res_projectxyz", "--name", "Project", "--path", cwd, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const project = parseCliData(stdout.getOutput()) as { id: string; resourceId: string; path: string };
  assert.equal(project.resourceId, "res_projectxyz");
  const sqlitePath = path.join(dataRoot, clawDataFiles.mainDatabase);
  const sqlite = new Database(sqlitePath);
  try {
    assert.deepEqual(sqlite.prepare("SELECT resource_id, path FROM app_projects WHERE id = ?").get("proj-local"), { resource_id: "res_projectxyz", path: cwd });
  } finally {
    sqlite.close();
    restoreEnv?.();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("runCli manages V2 knowledge, notes, profile, business, and search domains in the main sqlite", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-data-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-data-cwd-"));
    const notesStdout = captureStream();
    assert.equal(await runCli(["notes", "record-note", "Server runbook", "--body", "Deploy from the release branch", "--tags", "ops,runbook", "--json"], {
      stdout: notesStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const page = parseCliData(notesStdout.getOutput()) as { id: string; title: string; tags: string[]; blocks: Array<{ text: string }> };
    assert.equal(page.title, "Server runbook");
    assert.deepEqual(page.tags, ["ops", "runbook"]);
    assert.equal(page.blocks[0]?.text, "Deploy from the release branch");

    const journalStdout = captureStream();
    assert.equal(await runCli(["notes", "create", "Private journal", "--body", "Therapy reflection stays private", "--space", "journal", "--sensitivity", "sensitive", "--json"], {
      stdout: journalStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const journal = parseCliData(journalStdout.getOutput()) as { id: string; space: string; sensitivity: string };
    assert.equal(journal.space, "journal");
    assert.equal(journal.sensitivity, "sensitive");

    const notesSearchStdout = captureStream();
    assert.equal(await runCli(["notes", "search", "Therapy reflection", "--json"], {
      stdout: notesSearchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const notesSearch = parseCliData(notesSearchStdout.getOutput()) as { items: Array<{ id: string }> };
    assert.deepEqual(notesSearch.items.map((item) => item.id), [journal.id]);

    const wikiStdout = captureStream();
    assert.equal(await runCli(["wiki", "create", "Ops handbook", "--body", "Runbooks live as wiki pages backed by Notes", "--json"], {
      stdout: wikiStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const wikiPage = parseCliData(wikiStdout.getOutput()) as { id: string; space: string; surface: string };
    assert.equal(wikiPage.space, "wiki");
    assert.equal(wikiPage.surface, "wiki_page");
    const wikiSearchStdout = captureStream();
    assert.equal(await runCli(["wiki", "search", "Runbooks", "--json"], {
      stdout: wikiSearchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const wikiSearch = parseCliData(wikiSearchStdout.getOutput()) as { items: Array<{ id: string; space: string }> };
    assert.deepEqual(wikiSearch.items.map((item) => item.id), [wikiPage.id]);
    assert.deepEqual(wikiSearch.items.map((item) => item.space), ["wiki"]);

    const exportStdout = captureStream();
    assert.equal(await runCli(["notes", "export", page.id, "--json"], {
      stdout: exportStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.match((parseCliData(exportStdout.getOutput()) as { markdown: string }).markdown, /# Server runbook/);

    assert.equal(await runCli(["knowledge", "fact", "--predicate", "prefers_response_style", "--value", "direct", "--confidence", "0.9", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const profileStdout = captureStream();
    assert.equal(await runCli(["profile", "get", "--json"], {
      stdout: profileStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const profile = parseCliData(profileStdout.getOutput()) as { items: Array<{ section: string; contentText: string }> };
    assert.deepEqual(profile.items.map((item) => item.section), ["prefers_response_style"]);
    assert.equal(profile.items[0]?.contentText, "direct");
    assert.equal(profile.items.some((item) => /Therapy reflection/.test(item.contentText)), false);

    const businessStdout = captureStream();
    assert.equal(await runInternalV1Cli(["business", "upsert", "--id", "customer-1", "--kind", "customer", "--name", "Acme", "--notes", "Primary account", "--json"], {
      stdout: businessStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(businessStdout.getOutput()) as { pageId: string }).pageId, "page-customer-1");

    const financeStdout = captureStream();
    assert.equal(await runInternalV1Cli(["finance", "upsert", "--id", "txn-1", "--amount", "-19.99", "--currency", "USD", "--merchant", "Coffee", "--category", "food", "--json"], {
      stdout: financeStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const finance = parseCliData(financeStdout.getOutput()) as { id: string; amount: number; merchant: string; category: string };
    assert.equal(finance.id, "txn-1");
    assert.equal(finance.amount, -19.99);
    assert.equal(finance.merchant, "Coffee");
    assert.equal(finance.category, "food");

    const ledgerEntryStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ledger", "entry", "upsert", "--id", "invoice-1", "--description", "Invoice paid", "--date", "2026-05-13", "--json"], {
      stdout: ledgerEntryStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(ledgerEntryStdout.getOutput()) as { id: string; entryDate: string }).entryDate, "2026-05-13");

    const ledgerLineStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ledger", "line", "add", "--entry-id", "invoice-1", "--account-code", "1010", "--amount", "1200", "--currency", "USD", "--json"], {
      stdout: ledgerLineStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const ledgerLine = parseCliData(ledgerLineStdout.getOutput()) as { entryId: string; accountCode: string; amountCents: number; side: string };
    assert.equal(ledgerLine.entryId, "invoice-1");
    assert.equal(ledgerLine.accountCode, "1010");
    assert.equal(ledgerLine.amountCents, 120000);
    assert.equal(ledgerLine.side, "debit");

    const agentStdout = captureStream();
    assert.equal(await runCli(["agents", "upsert", "agent-ops", "--name", "Ops", "--secret-ref", "vault://agents/ops", "--json"], {
      stdout: agentStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.match((parseCliData(agentStdout.getOutput()) as { secretRef: string }).secretRef, /^\*+\/ops$/);

    const skillStdout = captureStream();
    assert.equal(await runCli(["skills", "upsert", "deploy", "--name", "Deploy", "--body", "Use deployment APIs by reference", "--secret-refs", "vault://skills/deploy-token", "--json"], {
      stdout: skillStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(skillStdout.getOutput()) as { secretRefs: unknown }).secretRefs, "[REDACTED]");

    const connectionStdout = captureStream();
    assert.equal(await runCli(["connections", "upsert", "github", "--provider", "github", "--label", "GitHub", "--secret-ref", "vault://connections/github", "--json"], {
      stdout: connectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.match((parseCliData(connectionStdout.getOutput()) as { secretRef: string }).secretRef, /^\*+thub$/);

    const iotStdout = captureStream();
    assert.equal(await runCli(["iot", "config", "set", "thermostat", "--name", "Hall thermostat", "--kind", "climate", "--secret-ref", "vault://iot/thermostat", "--json"], {
      stdout: iotStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const iot = parseCliData(iotStdout.getOutput()) as { id: string; kind: string; secretRef: string };
    assert.equal(iot.id, "thermostat");
    assert.equal(iot.kind, "climate");
    assert.match(iot.secretRef, /^\*+stat$/);

    const marketplaceStdout = captureStream();
    assert.equal(await runCli(["marketplace", "choice", "upsert", "--target", "default-ai-provider", "--choice", "openai", "--kind", "provider", "--json"], {
      stdout: marketplaceStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const marketplace = parseCliData(marketplaceStdout.getOutput()) as { target: string; choice: string; kind: string };
    assert.equal(marketplace.target, "default-ai-provider");
    assert.equal(marketplace.choice, "openai");
    assert.equal(marketplace.kind, "provider");

    const mcpConfig = path.join(cwd, "config.toml");
    fs.writeFileSync(mcpConfig, "model = \"gpt\"\n\n[mcp_servers.old]\ncommand = \"old\"\n");
    const mcpUpsertStdout = captureStream();
    assert.equal(await runCli([
      "mcp", "upsert", "browser",
      "--command", "npx",
      "--args", "@modelcontextprotocol/server-browser",
      "--cwd", "/tmp/browser",
      "--env-passthrough", "PATH,HOME",
      "--config", mcpConfig,
      "--json",
    ], {
      stdout: mcpUpsertStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpHttpStdout = captureStream();
    assert.equal(await runCli([
      "mcp", "upsert", "api",
      "--url", "https://example.invalid/mcp",
      "--bearer-token-env-var", "API_TOKEN",
      "--headers", "{\"X-Test\":\"1\"}",
      "--headers-from-env", "{\"Authorization\":\"API_AUTH_HEADER\"}",
      "--enabled", "false",
      "--config", mcpConfig,
      "--json",
    ], {
      stdout: mcpHttpStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpListStdout = captureStream();
    assert.equal(await runCli(["mcp", "list", "--config", mcpConfig, "--json"], {
      stdout: mcpListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpList = parseCliData(mcpListStdout.getOutput()) as { items: Array<{ id: string; command?: string; url?: string; args?: string[]; cwd?: string; env_passthrough?: string[]; bearer_token_env_var?: string; headers?: Record<string, string>; headers_from_env?: Record<string, string>; enabled?: boolean }> };
    assert.deepEqual(mcpList.items.map((server) => server.id), ["old", "browser", "api"]);
    const mcpPathStdout = captureStream();
    assert.equal(await runCli(["mcp", "config-path", "--config", mcpConfig, "--json"], {
      stdout: mcpPathStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpPath = parseCliData(mcpPathStdout.getOutput()) as { configPath: string; exists: boolean };
    assert.equal(mcpPath.configPath, mcpConfig);
    assert.equal(mcpPath.exists, true);
    const browserServer = mcpList.items.find((server) => server.id === "browser");
    assert.equal(browserServer?.command, "npx");
    assert.deepEqual(browserServer?.args, ["@modelcontextprotocol/server-browser"]);
    assert.equal(browserServer?.cwd, "/tmp/browser");
    assert.deepEqual(browserServer?.env_passthrough, ["PATH", "HOME"]);
    const apiServer = mcpList.items.find((server) => server.id === "api");
    assert.equal(apiServer?.url, "https://example.invalid/mcp");
    assert.equal(apiServer?.bearer_token_env_var, "API_TOKEN");
    assert.deepEqual(apiServer?.headers, { "X-Test": "1" });
    assert.deepEqual(apiServer?.headers_from_env, { Authorization: "API_AUTH_HEADER" });
    assert.equal(apiServer?.enabled, false);
    assert.match(fs.readFileSync(mcpConfig, "utf8"), /^model = "gpt"/);
    assert.match(fs.readFileSync(mcpConfig, "utf8"), /enabled = false/);

    const main = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv), { readonly: true });
    try {
      assert.equal((main.prepare("SELECT secret_ref FROM agents WHERE id = ?").get("agent-ops") as { secret_ref: string }).secret_ref, "vault://agents/ops");
      assert.deepEqual(JSON.parse((main.prepare("SELECT secret_refs_json FROM skills WHERE slug = ?").get("deploy") as { secret_refs_json: string }).secret_refs_json), ["vault://skills/deploy-token"]);
      assert.equal((main.prepare("SELECT secret_ref FROM connections WHERE id = ?").get("github") as { secret_ref: string }).secret_ref, "vault://connections/github");
      assert.equal((main.prepare("SELECT secret_ref FROM iot_config WHERE id = ?").get("thermostat") as { secret_ref: string }).secret_ref, "vault://iot/thermostat");
      assert.equal((main.prepare("SELECT choice FROM marketplace_choices WHERE target = ?").get("default-ai-provider") as { choice: string }).choice, "openai");
    } finally {
      main.close();
    }

    assert.equal(await runInternalV1Cli(["search", "rebuild", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searchStdout = captureStream();
    assert.equal(await runInternalV1Cli(["search", "query", "release branch", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const search = parseCliData(searchStdout.getOutput()) as { pages: Array<{ id: string }> };
    assert.deepEqual(search.pages.map((item) => item.id), [page.id]);

    const doctorStdout = captureStream();
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: doctorStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const doctor = parseCliData(doctorStdout.getOutput()) as { version: number; logicalDomains: { mainDb: string[]; sidecars: string[] }; registry: Array<{ domain: string; id: string }> };
    assert.equal(doctor.version, 2);
    assert.ok(doctor.logicalDomains.mainDb.includes("knowledge"));
    assert.ok(doctor.logicalDomains.sidecars.includes("conversation-artifacts"));
    assert.ok(doctor.registry.some((entry) => entry.domain === "conversation-artifacts" && entry.id === "audio"));
  });
});

test("runCli indexes external Codex session artifacts without owning their raw bodies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v1-sessions-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: path.join(tempRoot, "data"),
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v1-sessions-cwd-"));
    const sessionsRoot = path.join(tempRoot, "codex-sessions");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "11111111-2222-4333-8444-555555555555";
    const artifactPath = path.join(sessionsRoot, `rollout-${sessionId}.jsonl`);
    fs.writeFileSync(artifactPath, [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd, timestamp: "2026-05-12T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Index the large rollout and preserve raw JSONL outside sqlite" } }),
      "",
    ].join("\n"));

    const indexStdout = captureStream();
    assert.equal(await runCli(["sessions", "index", "--root", sessionsRoot, "--json"], {
      stdout: indexStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(indexStdout.getOutput()) as { indexed: number }).indexed, 1);

    const getStdout = captureStream();
    assert.equal(await runCli(["sessions", "get", sessionId, "--json"], {
      stdout: getStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const row = parseCliData(getStdout.getOutput()) as { artifactPath: string; source: string; snippet: string; metadata: { artifactKind: string } };
    assert.equal(row.artifactPath, artifactPath);
    assert.equal(row.source, "codex");
    assert.match(row.snippet, /preserve raw JSONL outside sqlite/);
    assert.equal(row.metadata.artifactKind, "codex-rollout");

    const listStdout = captureStream();
    assert.equal(await runCli(["sessions", "list", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const listed = parseCliData(listStdout.getOutput()) as { items: Array<{ sessionId: string }> };
    assert.deepEqual(listed.items.map((item) => item.sessionId), [sessionId]);

    const searchStdout = captureStream();
    assert.equal(await runCli(["sessions", "search", "--query", "large rollout", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searched = parseCliData(searchStdout.getOutput()) as { items: Array<{ sessionId: string }> };
    assert.deepEqual(searched.items.map((item) => item.sessionId), [sessionId]);

    const sidecarPath = path.join(tempRoot, "data", "sessions.sqlite");
    const sidecar = new Database(sidecarPath, { readonly: true });
    try {
      const sidecarSession = sidecar.prepare("SELECT session_id, artifact_path FROM conversation_sessions WHERE session_id = ?").get(sessionId) as { session_id: string; artifact_path: string };
      assert.equal(sidecarSession.artifact_path, artifactPath);
      const sidecarMessages = sidecar.prepare("SELECT role, text FROM conversation_messages WHERE session_id = ?").all(sessionId) as Array<{ role: string; text: string }>;
      assert.equal(sidecarMessages[0]?.role, "user");
      assert.match(sidecarMessages[0]?.text ?? "", /large rollout/);
    } finally {
      sidecar.close();
    }
  });
});

test("runCli manages V2 conversation artifact sidecars for audio, drive, runtime, search, and backup reset", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecars-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: path.join(tempRoot, "data"),
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecars-cwd-"));
    const audioPath = path.join(cwd, "voice.wav");
    const drivePath = path.join(cwd, "brief.md");
    fs.writeFileSync(audioPath, "fake audio bytes");
    fs.writeFileSync(drivePath, "# Launch brief\n\nAttachment content");

    const audioStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "index", "--file", audioPath, "--session-id", "session-1", "--transcript", "voice note about launch timing", "--json"], {
      stdout: audioStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const audio = parseCliData(audioStdout.getOutput()) as { id: string; sidecar: string };
    assert.equal(audio.sidecar, "audio.sqlite");

    const driveStdout = captureStream();
    assert.equal(await runInternalV1Cli(["drive", "index", "--file", drivePath, "--session-id", "session-1", "--json"], {
      stdout: driveStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const drive = parseCliData(driveStdout.getOutput()) as { id: string; sidecar: string };
    assert.equal(drive.sidecar, "drive.sqlite");

    const runtimeStdout = captureStream();
    assert.equal(await runInternalV1Cli(["runtime", "queue", "Distill conversation", "--kind", "distillation", "--json"], {
      stdout: runtimeStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(runtimeStdout.getOutput()) as { status: string }).status, "queued");

    const notifyStdout = captureStream();
    assert.equal(await runInternalV1Cli(["notify", "event", "--kind", "delivery", "--message", "Webhook delivered", "--json"], {
      stdout: notifyStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(notifyStdout.getOutput()) as { sidecar: string }).sidecar, "notify.sqlite");

    const monitorStdout = captureStream();
    assert.equal(await runInternalV1Cli(["monitor", "event", "--kind", "heartbeat", "--message", "Worker alive", "--json"], {
      stdout: monitorStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(monitorStdout.getOutput()) as { sidecar: string }).sidecar, "monitor.sqlite");

    const infraStdout = captureStream();
    assert.equal(await runInternalV1Cli(["infra", "event", "--kind", "provider-cache", "--message", "Cache refresh", "--json"], {
      stdout: infraStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(infraStdout.getOutput()) as { sidecar: string }).sidecar, "infra.sqlite");

    const opsStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "metric", "--kind", "api-latency", "--metadata", "{\"p95Ms\":42}", "--json"], {
      stdout: opsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(opsStdout.getOutput()) as { sidecar: string }).sidecar, "ops.sqlite");

    const opsListStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--kind", "api-latency", "--json"], {
      stdout: opsListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const opsList = parseCliData(opsListStdout.getOutput()) as { items: Array<{ kind: string; metadata: { p95Ms: number } }> };
    assert.equal(opsList.items[0]?.kind, "api-latency");
    assert.equal(opsList.items[0]?.metadata.p95Ms, 42);

    assert.equal(await runInternalV1Cli(["search", "rebuild", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searchStdout = captureStream();
    assert.equal(await runInternalV1Cli(["search", "query", "launch timing", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const search = parseCliData(searchStdout.getOutput()) as { global: Array<{ domain: string; sourceId: string }> };
    assert.ok(search.global.some((item) => item.domain === "audio" && item.sourceId === audio.id));

    const backupDir = path.join(tempRoot, "backup");
    const backupStdout = captureStream();
    assert.equal(await runInternalV1Cli(["data", "backup", "--out", backupDir, "--json"], {
      stdout: backupStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const backup = parseCliData(backupStdout.getOutput()) as { copied: string[] };
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/audio.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/drive.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/runtime.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/notify.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/monitor.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/infra.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/ops.sqlite")));

    assert.equal(await runInternalV1Cli(["data", "reset", "--domain", "conversation-artifacts", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const audioListStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "artifact", "list", "--json"], {
      stdout: audioListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliData(audioListStdout.getOutput()) as { items: unknown[] }).items, []);

    assert.equal(await runInternalV1Cli(["data", "reset", "--domain", "ops", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const opsAfterResetStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--json"], {
      stdout: opsAfterResetStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliData(opsAfterResetStdout.getOutput()) as { items: unknown[] }).items, []);

    assert.equal(await runInternalV1Cli(["data", "restore", "--from", backupDir, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const restoredAudioStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "artifact", "list", "--session-id", "session-1", "--json"], {
      stdout: restoredAudioStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(restoredAudioStdout.getOutput()) as { items: unknown[] }).items.length, 1);
    const restoredOpsStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--kind", "api-latency", "--json"], {
      stdout: restoredOpsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliData(restoredOpsStdout.getOutput()) as { items: unknown[] }).items.length, 1);
  });
});

test("runCli reset covers V2 main DB legacy service tables when present", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-reset-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-reset-cwd-"));
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const tables = [
      "user_profile_items",
      "user_profile_meta",
      "user_profile_history",
      "system_variables",
      "user_variables",
      "observations",
      "sessions",
      "healthkit_sync_state",
      "hidden_system_variables",
      "temporal_items",
      "temporal_executions",
      "temporal_run_log",
      "temporal_projections",
      "wiki_spaces",
    ];
    const primaryCorePath = path.join(tempRoot, "core.sqlite");
    const db = new Database(primaryCorePath);
    try {
      for (const table of tables) {
        db.exec(["CREATE", "TABLE IF NOT EXISTS", table, "(id TEXT PRIMARY KEY)"].join(" "));
        db.prepare(`INSERT OR REPLACE INTO ${table} (id) VALUES (?)`).run(`${table}-1`);
      }
      db.prepare(`
        INSERT OR REPLACE INTO pages (id, title, space, surface, tags_json, properties_json, created_at, updated_at)
        VALUES ('wiki-page-1', 'Wiki page', 'main', 'wiki', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `).run();
    } finally {
      db.close();
    }

    for (const domain of ["user-model", "signals", "time", "wiki"]) {
      assert.equal(await runInternalV1Cli(["data", "reset", "--domain", domain, "--json"], {
        stdout: captureStream().stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);
    }

    const readonlyCorePath = path.join(tempRoot, "core.sqlite");
    const readonly = new Database(readonlyCorePath, { readonly: true });
    try {
      for (const table of tables) {
        assert.equal((readonly.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0, table);
      }
      assert.equal((readonly.prepare("SELECT COUNT(*) AS count FROM pages WHERE surface = 'wiki'").get() as { count: number }).count, 0, "wiki pages");
    } finally {
      readonly.close();
    }
  });
});

test("runCli reset clears V2 sidecar service tables when present", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecar-reset-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecar-reset-cwd-"));
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const sidecars = [
      { filename: "audio.sqlite", domain: "audio", table: "voice_tts_runs" },
      { filename: "drive.sqlite", domain: "drive", table: "storage_objects" },
      { filename: "runtime.sqlite", domain: "runtime", table: "sandbox_runs" },
    ];
    for (const sidecar of sidecars) {
      const writableSidecarDbPath = path.join(tempRoot, sidecar.filename);
      const db = new Database(writableSidecarDbPath);
      try {
        db.exec(["CREATE", "TABLE IF NOT EXISTS", sidecar.table, "(id TEXT PRIMARY KEY)"].join(" "));
        db.prepare(`INSERT OR REPLACE INTO ${sidecar.table} (id) VALUES (?)`).run(`${sidecar.table}-1`);
      } finally {
        db.close();
      }
      assert.equal(await runInternalV1Cli(["data", "reset", "--domain", sidecar.domain, "--json"], {
        stdout: captureStream().stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);
      const readonlySidecarPath = path.join(tempRoot, sidecar.filename);
      const readonly = new Database(readonlySidecarPath, { readonly: true });
      try {
        assert.equal((readonly.prepare(`SELECT COUNT(*) AS count FROM ${sidecar.table}`).get() as { count: number }).count, 0, sidecar.table);
      } finally {
        readonly.close();
      }
    }
  });
});

test("runCli mirrors local memory into V2 knowledge and profile projection", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-memory-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-memory-workspace-"));
    const saveStdout = captureStream();
    assert.equal(await runCli([
      "knowledge",
      "memories",
      "save",
      "User prefers concise answers with citations",
      "--workspace", workspaceRoot,
      "--title", "Response preference",
      "--tags", "preference,style",
      "--confidence", "0.8",
      "--json",
    ], {
      stdout: saveStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const saved = parseCliData(saveStdout.getOutput()) as { id: string };

    const factsStdout = captureStream();
    assert.equal(await runCli(["knowledge", "list", "--json"], {
      stdout: factsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    const facts = parseCliData(factsStdout.getOutput()) as { items: Array<{ id: string; predicate: string; objectValue: { content: string } }> };
    assert.equal(facts.items[0]?.id, `memory:${saved.id}`);
    assert.equal(facts.items[0]?.predicate, "preference");
    assert.match(facts.items[0]?.objectValue.content ?? "", /concise answers/);

    const profileStdout = captureStream();
    assert.equal(await runCli(["profile", "get", "--json"], {
      stdout: profileStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    const profile = parseCliData(profileStdout.getOutput()) as { items: Array<{ section: string; contentText: string }> };
    assert.equal(profile.items[0]?.section, "preference");
    assert.match(profile.items[0]?.contentText ?? "", /concise answers/);

    assert.equal(await runCli(["knowledge", "memories", "delete", saved.id, "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const afterDeleteStdout = captureStream();
    assert.equal(await runCli(["knowledge", "list", "--json"], {
      stdout: afterDeleteStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliData(afterDeleteStdout.getOutput()) as { items: unknown[] }).items, []);
  });
});
