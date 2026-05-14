import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runCliCapture, useIsolatedMainData } from "./index-test-utils.ts";

test("runCli returns structured related matches for unknown JSON commands", async () => {
  const result = await runCliCapture(["peopel", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { related: Array<{ canonicalCommand?: string }> } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_command");
  assert.equal(payload.meta.related.some((entry) => entry.canonicalCommand === "people"), true);
});

test("runCli searches the registered CLI discovery surface", async () => {
  const result = await runCliCapture(["search", "system capabilities", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { results: Array<{ canonicalName?: string }> }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "search");
  assert.equal(payload.data.results.some((entry) => entry.canonicalName === "host"), true);

  const collection = await runCliCapture(["search", "lead", "--json"], process.cwd());
  assert.equal(collection.code, CLI_EXIT_OK);
  const collectionPayload = JSON.parse(collection.stdout) as { data: { results: Array<{ canonicalName?: string; source?: string }> } };
  assert.equal(collectionPayload.data.results.some((entry) => entry.canonicalName === "leads" && entry.source === "collection"), true);
});

test("runCli returns open list JSON in the common envelope", async () => {
  const result = await runCliCapture(["open", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { dashboards: Array<{ surface: string }> }; meta: { canonicalCommand: string; jsonSchemaId: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "open");
  assert.equal(payload.meta.jsonSchemaId, "claw.cli.open.v1");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(payload.data.dashboards.some((entry) => entry.surface === "database"), true);
});

test("runCli returns registry help JSON when a command needs a subcommand", async () => {
  for (const command of ["database", "sessions", "search", "templates", "mcp", "plan", "erp"]) {
    const result = await runCliCapture([command, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, command);
    const payload = JSON.parse(result.stdout) as { ok: boolean; data: { command: string; help: string }; meta: { canonicalCommand: string; invokedCommand: string } };
    const canonical = command === "templates" ? "templates" : command;
    assert.equal(payload.ok, true);
    assert.equal(payload.data.command, canonical);
    assert.equal(payload.data.help.includes(`claw ${canonical}`), true);
    assert.equal(payload.meta.canonicalCommand, canonical);
    assert.equal(payload.meta.invokedCommand, command === "templates" ? "template" : command);
  }
});

test("runCli returns agents codex JSON in the common envelope", async () => {
  const result = await runCliCapture(["agents", "codex", "status", "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { agentId: string; runtime: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.agentId, "codex");
  assert.equal(payload.data.runtime, "demo");
  assert.equal(payload.meta.canonicalCommand, "agents");
  assert.equal(payload.meta.subcommand, "codex.status");
});

test("runCli returns chat and provider JSON in the common envelope", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-chat-json-"));
  const chat = await runCliCapture(["chat", "list", "--home-dir", homeDir, "--json"], process.cwd());
  assert.equal(chat.code, CLI_EXIT_OK);
  const chatPayload = JSON.parse(chat.stdout) as { ok: boolean; data: { sessions: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(chatPayload.ok, true);
  assert.equal(chatPayload.meta.canonicalCommand, "sessions");
  assert.equal(chatPayload.meta.invokedCommand, "chat");
  assert.equal(chatPayload.meta.subcommand, "list");
  assert.deepEqual(chatPayload.data.sessions, []);

  const provider = await runCliCapture(["provider", "models", "deepseek", "--json"], process.cwd());
  assert.equal(provider.code, CLI_EXIT_OK);
  const providerPayload = JSON.parse(provider.stdout) as { ok: boolean; data: { models: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(providerPayload.ok, true);
  assert.equal(providerPayload.meta.canonicalCommand, "providers");
  assert.equal(providerPayload.meta.invokedCommand, "provider");
  assert.equal(providerPayload.meta.subcommand, "models");
  assert.equal(providerPayload.data.models.length > 0, true);
});

test("runCli returns code JSON in the common envelope", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-json-"));
  const result = await runCliCapture(["code", "projects", "list", "--code-home", codeHome, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { projects: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string; operation: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "code");
  assert.equal(payload.meta.invokedCommand, "code");
  assert.equal(payload.meta.subcommand, "projects");
  assert.equal(payload.meta.operation, "list");
  assert.deepEqual(payload.data.projects, []);
});

test("runCli returns temporal JSON in the common envelope", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-json-"));
  const result = await runCliCapture(["calendar", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { items: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "calendar");
  assert.equal(payload.meta.invokedCommand, "calendar");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data.items, []);
});

test("runCli returns rules JSON in the common envelope", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-rules-json-"));
  const result = await runCliCapture(["rules", "compile", "test request", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "rules");
  assert.equal(payload.meta.invokedCommand, "rules");
  assert.equal(payload.meta.subcommand, "compile");
});

test("runCli hard-blocks standalone user and memory legacy commands", async () => {
  const user = await runCliCapture(["user", "list", "--json"], process.cwd());
  assert.equal(user.code, CLI_EXIT_USAGE);
  const userPayload = JSON.parse(user.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; invokedCommand: string; related: Array<{ canonicalCommand?: string }> } };
  assert.equal(userPayload.ok, false);
  assert.equal(userPayload.error.code, "removed_public_command");
  assert.equal(userPayload.meta.canonicalCommand, "user");
  assert.equal(userPayload.meta.invokedCommand, "user");
  assert.equal(userPayload.meta.related.some((entry) => entry.canonicalCommand === "profile"), true);

  const memory = await runCliCapture(["memory", "search", "x", "--json"], process.cwd());
  assert.equal(memory.code, CLI_EXIT_USAGE);
  const memoryPayload = JSON.parse(memory.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; invokedCommand: string; related: Array<{ canonicalCommand?: string }> } };
  assert.equal(memoryPayload.ok, false);
  assert.equal(memoryPayload.error.code, "removed_public_command");
  assert.equal(memoryPayload.meta.canonicalCommand, "memory");
  assert.equal(memoryPayload.meta.invokedCommand, "memory");
  assert.equal(memoryPayload.meta.related.some((entry) => entry.canonicalCommand === "knowledge"), true);
});

test("runCli returns removed legacy namespace JSON in the common envelope", async () => {
  for (const args of [
    ["data", "doctor", "--json"],
    ["app-state", "snapshot", "--json"],
    ["runtime", "queue", "--json"],
    ["content", "upsert", "--json"],
    ["business", "upsert", "--json"],
    ["social", "list", "--json"],
    ["infra", "event", "--json"],
    ["ops", "list", "--json"],
  ]) {
    const result = await runCliCapture(args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, args.join(" "));
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { invokedCommand: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "removed_public_command");
    assert.equal(payload.meta.invokedCommand, args[0]);
  }
});

test("runCli returns primary productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-productivity-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["tasks", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "tasks");
  assert.equal(payload.meta.invokedCommand, "tasks");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(Array.isArray(payload.data), true);
});

test("runCli returns productivity database JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-db-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["db", "tasks", "schema", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { collection: { name: string } }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.invokedCommand, "db");
  assert.equal(payload.meta.collection, "tasks");
  assert.equal(payload.meta.subcommand, "schema");
  assert.equal(payload.data.collection.name, "tasks");

  const canonicalResult = await runCliCapture(["tasks", "schema", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(canonicalResult.code, CLI_EXIT_OK);
  const canonicalPayload = JSON.parse(canonicalResult.stdout) as { ok: boolean; data: { collection: { name: string } }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(canonicalPayload.ok, true);
  assert.equal(canonicalPayload.meta.canonicalCommand, "tasks");
  assert.equal(canonicalPayload.meta.invokedCommand, "tasks");
  assert.equal(canonicalPayload.meta.collection, "tasks");
  assert.equal(canonicalPayload.meta.subcommand, "schema");
  assert.equal(canonicalPayload.data.collection.name, "tasks");

  assert.equal((await runCliCapture(["tasks", "create", "Canonical query task", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd())).code, CLI_EXIT_OK);
  const queryResult = await runCliCapture(["tasks", "query", "Canonical", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(queryResult.code, CLI_EXIT_OK);
  const queryPayload = JSON.parse(queryResult.stdout) as { ok: boolean; data: Array<{ title: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(queryPayload.ok, true);
  assert.equal(queryPayload.meta.canonicalCommand, "tasks");
  assert.equal(queryPayload.meta.invokedCommand, "tasks");
  assert.equal(queryPayload.meta.collection, "tasks");
  assert.equal(queryPayload.meta.subcommand, "query");
  assert.equal(queryPayload.data.some((item) => item.title === "Canonical query task"), true);
});

test("runCli routes unique built-in collection aliases through database CRUD", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-collection-alias-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["lead", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; meta: { canonicalCommand: string; collection: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.collection, "leads");
  assert.equal(payload.meta.subcommand, "leads list");
});

test("runCli returns advanced productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-outcomes-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["outcomes", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { outcomes: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "outcomes");
  assert.equal(payload.meta.invokedCommand, "outcomes");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data.outcomes, []);
});

test("runCli returns media generation JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["image", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "images");
  assert.equal(payload.meta.invokedCommand, "image");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli routes media portal children to canonical media commands", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-portal-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["media", "images", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "images");
  assert.equal(payload.meta.invokedCommand, "image");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli returns channel JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-channels-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["channels", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "channels");
  assert.equal(payload.meta.invokedCommand, "channels");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(Array.isArray(payload.data), true);
});

test("runCli returns extended productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-extended-productivity-json-"));
  useIsolatedMainData(t, workspaceRoot);
  const result = await runCliCapture(["blockers", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "blockers");
  assert.equal(payload.meta.invokedCommand, "blockers");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli exposes help-only portals through JSON", async () => {
  for (const command of ["logs", "monitor"]) {
    const result = await runCliCapture([command, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK);
    const payload = JSON.parse(result.stdout) as { ok: boolean; data: { command: string; help: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: null } };
    assert.equal(payload.ok, true);
    assert.equal(payload.data.command, command);
    assert.match(payload.data.help, new RegExp(`Usage: claw ${command}`));
    assert.equal(payload.meta.canonicalCommand, command);
    assert.equal(payload.meta.invokedCommand, command);
    assert.equal(payload.meta.subcommand, null);
  }
});

test("runCli routes content portals and envelopes unavailable services", async () => {
  const result = await runCliCapture(["posts", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_FAILURE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string; operation: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "content_service_unavailable");
  assert.equal(payload.meta.canonicalCommand, "content");
  assert.equal(payload.meta.invokedCommand, "content");
  assert.equal(payload.meta.subcommand, "entry");
  assert.equal(payload.meta.operation, "list");
});

test("runCli returns root router JSON in the common envelope", async () => {
  const result = await runCliCapture(["runtime", "status", "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { adapter: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "runtime");
  assert.equal(payload.meta.invokedCommand, "runtime");
  assert.equal(payload.meta.subcommand, "status");
  assert.equal(payload.data.adapter, "demo");
});

test("runCli searches registered local docs and ADR contents", async () => {
  const result = await runCliCapture(["search", "Stable JSON output uses", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { data: { results: Array<{ type: string; path?: string; summary: string }> } };
  assert.equal(payload.data.results.some((entry) => entry.type === "adr" && entry.path === "docs/adr/0007-cli-agent-interface.md" && /Stable JSON output uses/.test(entry.summary)), true);
});

test("runCli prints related matches for unknown human commands", async () => {
  const result = await runCliCapture(["peopel"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.match(result.stderr, /Related:/);
  assert.match(result.stderr, /people/);
});

test("runCli can show deterministic search help without workspace access", async () => {
  const stdout = { value: "", stream: { write(chunk: string) { stdout.value += chunk; return true; } } as unknown as NodeJS.WritableStream };
  const stderr = { value: "", stream: { write(chunk: string) { stderr.value += chunk; return true; } } as unknown as NodeJS.WritableStream };
  const code = await runCli(["search"], { stdout: stdout.stream, stderr: stderr.stream, cwd: process.cwd() });
  assert.equal(code, CLI_EXIT_OK);
  assert.match(stdout.value, /deterministic local discovery/i);
});
