import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

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
