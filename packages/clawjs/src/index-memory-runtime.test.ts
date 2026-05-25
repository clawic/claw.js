import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

import { createClaw } from "@clawjs/claw";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { extractPositionals, parseFlags } from "./cli-flag-parsers.ts";
import { runUserKnowledgeCli } from "./cli-user-knowledge-command.ts";
import {
  captureStream,
  createFakeOpenClawToolchain,
  createFakeSkillSourceToolchain,
  listen,
  useIsolatedClawDataRoot,
  withPatchedEnv,
} from "./index-test-utils.ts";

const OPENAI_API_PREFIX = "/v" + "1";

test("runCli can search sessions through OpenClaw memory search", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-search-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const { binDir } = createFakeOpenClawToolchain();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-session-search",
      agentId: "demo-session-search",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Budget review");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({
      results: [{
        text: "Need to review the quarterly budget with finance",
        path: `/tmp/agents/demo-session-search/sessions/${session.sessionId}.jsonl`,
        score: 0.88,
      }],
    }),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "search",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-session-search",
      "--agent-id", "demo-session-search",
      "--query", "budget finance",
      "--strategy", "openclaw-memory",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), new RegExp(session.sessionId));
    assert.match(stdout.getOutput(), /"strategy": "openclaw-memory"/);
  });
});

test("runCli knowledge memories lifecycle is local-first and agent-friendly", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-local-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const helpStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "--help"], {
    stdout: helpStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(helpStdout.getOutput(), /Usage: claw knowledge/);
  assert.match(helpStdout.getOutput(), /private memory implementation/);

  const capabilitiesStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "capabilities", "--workspace", workspaceRoot, "--json"], {
    stdout: capabilitiesStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const capabilities = JSON.parse(capabilitiesStdout.getOutput()) as { ok: boolean; data: { write: boolean; defaultSource: string }; meta: { canonicalCommand: string; subcommand: string; invokedCommand: string } };
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.meta.canonicalCommand, "knowledge");
  assert.equal(capabilities.meta.subcommand, "capabilities");
  assert.equal(capabilities.meta.invokedCommand, "knowledge");
  assert.equal(capabilities.data.write, true);
  assert.equal(capabilities.data.defaultSource, "local");

  const saveStdout = captureStream();
  assert.equal(await runCli([
    "knowledge",
    "memories",
    "save",
    "User prefers concise answers with citations",
    "--workspace", workspaceRoot,
    "--title", "Response preference",
    "--tags", "preference,style",
    "--json",
  ], {
    stdout: saveStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const saved = JSON.parse(saveStdout.getOutput()) as { ok: boolean; data: { id: string; title: string; confidence: number; importance: number } };
  assert.equal(saved.ok, true);
  assert.equal(saved.data.title, "Response preference");
  assert.equal(saved.data.confidence, 1);
  assert.equal(saved.data.importance, 0.5);

  const listStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const listed = JSON.parse(listStdout.getOutput()) as { ok: boolean; data: { results: Array<{ id: string }> } };
  assert.equal(listed.ok, true);
  assert.equal(listed.data.results.some((item) => item.id === saved.data.id), true);

  const getStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "get", saved.data.id, "--workspace", workspaceRoot, "--json"], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(getStdout.getOutput()) as { data: { id: string } }).data.id, saved.data.id);

  const updateStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "update", saved.data.id, "--workspace", workspaceRoot, "--content", "User prefers concise answers with source citations.", "--confidence", "0.9", "--json"], {
    stdout: updateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(updateStdout.getOutput()) as { data: { confidence: number } }).data.confidence, 0.9);

  const searchStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "search", "concise citations", "--workspace", workspaceRoot, "--json"], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const search = JSON.parse(searchStdout.getOutput()) as { ok: boolean; data: { count: number; results: Array<{ id: string; score: number; snippet: string; matchedFields: string[] }> } };
  assert.equal(search.ok, true);
  assert.equal(search.data.count, 1);
  assert.equal(search.data.results[0]?.id, saved.data.id);
  assert.equal(typeof search.data.results[0]?.score, "number");
  assert.match(search.data.results[0]?.snippet ?? "", /concise/);
  assert.equal(search.data.results[0]?.matchedFields.includes("content"), true);

  const contextStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "context", "--query", "answer style", "--workspace", workspaceRoot, "--json"], {
    stdout: contextStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const context = JSON.parse(contextStdout.getOutput()) as { ok: boolean; data: { memories: Array<{ id: string }>; citations: Array<{ id: string }>; summary: string } };
  assert.equal(context.ok, true);
  assert.equal(context.data.memories.some((item) => item.id === saved.data.id), true);
  assert.equal(context.data.citations.some((item) => item.id === saved.data.id), true);
  assert.match(context.data.summary, /Response preference/);

  await runCli(["knowledge", "memories", "save", "Experimental low confidence memory", "--workspace", workspaceRoot, "--confidence", "0.1", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const lowContextStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "context", "Experimental", "--workspace", workspaceRoot, "--json"], {
    stdout: lowContextStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(lowContextStdout.getOutput()) as { data: { memories: unknown[] } }).data.memories.length, 0);

  const emptyStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "search", "does-not-match", "--workspace", workspaceRoot, "--json"], {
    stdout: emptyStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.deepEqual(JSON.parse(emptyStdout.getOutput()), {
    ok: true,
    data: { query: "does-not-match", strategy: "keyword", results: [], count: 0 },
    meta: {
      schemaVersion: 1,
      canonicalCommand: "knowledge",
      jsonSchemaId: "claw.cli.knowledge.v1",
      subcommand: "search",
      invokedCommand: "knowledge",
    },
  });

  const missingStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "get", "missing", "--workspace", workspaceRoot, "--json"], {
    stdout: missingStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_FAILURE);
  assert.equal((JSON.parse(missingStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "not_found");

  const deleteStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "delete", saved.data.id, "--workspace", workspaceRoot, "--json"], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(deleteStdout.getOutput()) as { data: { deleted: boolean } }).data.deleted, true);
});

test("runCli rules compiles scoped active rules and ignores pending rules", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-rules-workspace-"));
  const rulesDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-rules-"));
  const base = ["--workspace", workspaceRoot, "--rules-dir", rulesDir, "--json"];

  for (const args of [
    ["rules", "scopes", "--id", "northstar", "--kind", "brand", "--name", "Northstar Studio", "--aliases", "NS,North Star", ...base],
    ["rules", "scopes", "--id", "northstar-website", "--kind", "output", "--name", "Website", "--parent", "northstar", "--aliases", "website,site", ...base],
    ["rules", "propose", "--id", "northstar-tone", "--scope", "northstar", "--title", "Northstar tone", "--content", "Use the Northstar tone.", "--status", "active", "--key", "tone", ...base],
    ["rules", "propose", "--id", "northstar-type-default", "--scope", "northstar", "--title", "Typography", "--content", "Use Source Sans generally.", "--status", "active", "--kind", "default", "--key", "typography", ...base],
    ["rules", "propose", "--id", "northstar-type-website", "--scope", "northstar-website", "--title", "Website typography", "--content", "Use Inter on websites.", "--status", "active", "--kind", "default", "--key", "typography", "--output", "website", ...base],
    ["rules", "propose", "--id", "northstar-slides", "--scope", "northstar", "--title", "Slides", "--content", "Use Keynote for slides.", "--status", "active", "--output", "slides,pdf", ...base],
    ["rules", "propose", "--id", "northstar-pending", "--scope", "northstar-website", "--title", "Pending", "--content", "Do not include pending rules.", "--output", "website", ...base],
  ]) {
    assert.equal(await runCli(args, {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
  }

  const stdout = captureStream();
  assert.equal(await runCli(["rules", "compile", "Create a site for NS", "--brand", "North Star", "--output-format", "website", ...base], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const envelope = JSON.parse(stdout.getOutput()) as {
    ok: boolean;
    data: {
      prompt: string;
      overridden: Array<{ rule: { id: string } }>;
      omitted: Array<{ rule: { id: string }; reason: string }>;
    };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(envelope.ok, true);
  assert.equal(envelope.meta.canonicalCommand, "rules");
  assert.equal(envelope.meta.subcommand, "compile");
  const result = envelope.data;
  assert.match(result.prompt, /Northstar tone/);
  assert.match(result.prompt, /Website typography/);
  assert.doesNotMatch(result.prompt, /Keynote/);
  assert.doesNotMatch(result.prompt, /Source Sans/);
  assert.equal(result.overridden.some((entry) => entry.rule.id === "northstar-type-default"), true);
  assert.equal(result.omitted.some((entry) => entry.rule.id === "northstar-pending" && entry.reason === "status:pending"), true);
});

test("runCli knowledge memories search keeps workspaces and runtime source separate", async (t) => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-b-"));
  useIsolatedClawDataRoot(t, workspaceA);
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await runCli(["knowledge", "memories", "save", "Workspace alpha prefers tabs", "--workspace", workspaceA, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const searchAStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "search", "tabs", "--workspace", workspaceA, "--json"], {
    stdout: searchAStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(searchAStdout.getOutput()) as { data: { count: number } }).data.count, 1);

  const searchBStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "search", "tabs", "--workspace", workspaceB, "--json"], {
    stdout: searchBStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(searchBStdout.getOutput()) as { data: { count: number } }).data.count, 0);

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  }, async () => {
    const runtimeListStdout = captureStream();
    assert.equal(await runCli([
      "knowledge",
      "memories",
      "list",
      "--workspace", workspaceA,
      "--runtime", "demo",
      "--source", "runtime",
      "--json",
    ], {
      stdout: runtimeListStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    assert.equal((JSON.parse(runtimeListStdout.getOutput()) as { data: { count: number } }).data.count, 0);

    const runtimeStdout = captureStream();
    const exitCode = await runCli([
      "knowledge",
      "memories",
      "search",
      "--workspace", workspaceA,
      "--workspace-id", "demo-memory-search",
      "--agent-id", "demo-memory-search",
      "--query", "unknown",
      "--source", "runtime",
      "--json",
    ], {
      stdout: runtimeStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.deepEqual(JSON.parse(runtimeStdout.getOutput()), {
      ok: true,
      data: { query: "unknown", strategy: "keyword", results: [], count: 0 },
      meta: {
        schemaVersion: 1,
        canonicalCommand: "knowledge",
        jsonSchemaId: "claw.cli.knowledge.v1",
        subcommand: "search",
        invokedCommand: "knowledge",
      },
    });
    assert.match(fs.readFileSync(openclawLog, "utf8"), /memory search --agent demo-memory-search --query unknown --json/);
  });
});

test("runCli knowledge memories JSON errors are parseable and db memory search is not a create alias", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-errors-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const missingQueryStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "search", "--workspace", workspaceRoot, "--json"], {
    stdout: missingQueryStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  assert.equal((JSON.parse(missingQueryStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "usage_error");

  const invalidStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "unknown", "--workspace", workspaceRoot, "--json"], {
    stdout: invalidStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  assert.equal((JSON.parse(invalidStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "usage_error");

  for (const testCase of [
    { flag: "--confidence", value: "nope", code: "invalid_memory_confidence" },
    { flag: "--importance", value: "1.5", code: "invalid_memory_importance" },
    { flag: "--metadata", value: "{nope", code: "invalid_memory_metadata_json" },
  ]) {
    const invalidNumberStdout = captureStream();
    assert.equal(await runCli([
      "knowledge",
      "memories",
      "save",
      "Invalid numeric memory should not persist",
      "--workspace",
      workspaceRoot,
      testCase.flag,
      testCase.value,
      "--json",
    ], {
      stdout: invalidNumberStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_USAGE);
    const payload = JSON.parse(invalidNumberStdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, testCase.code);
    assert.equal(payload.error.status, "USAGE");
  }

  const afterInvalidMemoryStdout = captureStream();
  assert.equal(await runCli(["knowledge", "memories", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: afterInvalidMemoryStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(afterInvalidMemoryStdout.getOutput()) as { data: { count: number } }).data.count, 0);

  const dbSearchStdout = captureStream();
  assert.equal(await runCli(["db", "memory", "search", "anything", "--workspace", workspaceRoot, "--json"], {
    stdout: dbSearchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  assert.equal((JSON.parse(dbSearchStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "usage_error");

  const dbListStdout = captureStream();
  assert.equal(await runCli(["db", "memory", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: dbListStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.deepEqual(JSON.parse(dbListStdout.getOutput()), {
    ok: true,
    data: [],
    meta: {
      schemaVersion: 1,
      canonicalCommand: "database",
      jsonSchemaId: "claw.cli.database.v1",
      invokedCommand: "db",
      subcommand: "memory_blocks list",
      collection: "memory_blocks",
      action: "list",
    },
  });
});

test("runUserKnowledgeCli rejects invalid confidence before user proposal persistence", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-user-confidence-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const argv = [
    "user",
    "propose",
    "--path", "identity.name",
    "--value", "Ada",
    "--confidence", "nope",
    "--workspace", workspaceRoot,
    "--json",
  ];
  const positionals = extractPositionals(argv);
  const stdout = captureStream();

  assert.equal(await runUserKnowledgeCli({
    group: "user",
    command: "propose",
    subcommand: undefined,
    positionals,
    flags: parseFlags(argv),
    argv,
    context: {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    },
    wantsJson: true,
    workspaceRoot,
    appId: "demo",
    workspaceId: "demo-user-confidence",
    agentId: "demo-user-confidence",
    runtimeAdapterId: "demo",
  }), CLI_EXIT_USAGE);

  const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_user_confidence");
  assert.equal(payload.error.status, "USAGE");

  const listStdout = captureStream();
  assert.equal(await runUserKnowledgeCli({
    group: "user",
    command: "review",
    subcommand: "list",
    positionals: ["user", "review", "list"],
    flags: parseFlags(["user", "review", "list", "--workspace", workspaceRoot, "--json"]),
    argv: ["user", "review", "list", "--workspace", workspaceRoot, "--json"],
    context: {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    },
    wantsJson: true,
    workspaceRoot,
    appId: "demo",
    workspaceId: "demo-user-confidence",
    agentId: "demo-user-confidence",
    runtimeAdapterId: "demo",
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(listStdout.getOutput()) as { data: { proposals: unknown[] } }).data.proposals.length, 0);
});

test("runCli runtime knowledge memories search returns ok for empty results when explicitly requested", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-search-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "knowledge",
      "memories",
      "search",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-memory-search",
      "--agent-id", "demo-memory-search",
      "--query", "unknown",
      "--source", "runtime",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.deepEqual(JSON.parse(stdout.getOutput()), {
      ok: true,
      data: { query: "unknown", strategy: "keyword", results: [], count: 0 },
      meta: {
        schemaVersion: 1,
        canonicalCommand: "knowledge",
        jsonSchemaId: "claw.cli.knowledge.v1",
        subcommand: "search",
        invokedCommand: "knowledge",
      },
    });
    assert.match(fs.readFileSync(openclawLog, "utf8"), /memory search --agent demo-memory-search --query unknown --json/);
  });
});

test("runCli lists external skill sources", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-sources-"));
  const { binDir } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "skills",
      "sources",
      "--workspace", workspaceRoot,
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"id": "clawhub"/);
    assert.match(stdout.getOutput(), /"id": "skills\.sh"/);
  });
});

test("runCli searches skill catalogs and reports omitted sources", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-search-"));
  const { binDir } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_CLAWHUB_SEARCH_JSON: JSON.stringify([
      {
        slug: "support-triage",
        label: "Support Triage",
        summary: "Prioritize incoming support work.",
      },
    ]),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "skills",
      "search",
      "--workspace", workspaceRoot,
      "--query", "support",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"source": "clawhub"/);
    assert.match(stdout.getOutput(), /"omittedSources"/);
    assert.match(stdout.getOutput(), /"skills\.sh"/);
  });
});

test("runCli rejects invalid skills search limits before catalog lookup", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-search-limit-"));
  const { binDir, clawhubLog, npxLog } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "skills",
      "search",
      "--workspace", workspaceRoot,
      "--query", "support",
      "--limit", "nope",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_USAGE);
    const payload = JSON.parse(stdout.getOutput()) as {
      error: { code: string; status: string; location: string; details?: Record<string, unknown> };
      meta: { canonicalCommand: string; subcommand: string };
    };
    assert.equal(payload.error.code, "invalid_skills_search_limit");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, "cli.skills.limit");
    assert.deepEqual(payload.error.details, { flag: "--limit", value: "nope" });
    assert.equal(payload.meta.canonicalCommand, "skills");
    assert.equal(payload.meta.subcommand, "search");
    assert.equal(fs.existsSync(clawhubLog), false);
    assert.equal(fs.existsSync(npxLog), false);
  });
});

test("runCli can resolve exact skills.sh refs and install clawhub skills", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-install-"));
  const { binDir, clawhubLog } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }, async () => {
    const searchStdout = captureStream();
    const searchExitCode = await runCli([
      "skills",
      "search",
      "--workspace", workspaceRoot,
      "--query", "vercel-labs/agent-skills",
      "--source", "skills.sh",
      "--json",
    ], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(searchExitCode, CLI_EXIT_OK);
    assert.match(searchStdout.getOutput(), /"source": "skills\.sh"/);

    const installStdout = captureStream();
    const installExitCode = await runCli([
      "skills",
      "install",
      "support-triage",
      "--workspace", workspaceRoot,
      "--source", "clawhub",
      "--json",
    ], {
      stdout: installStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(installExitCode, CLI_EXIT_OK);
    assert.match(installStdout.getOutput(), /"runtimeVisibility": "runtime"/);
    assert.match(installStdout.getOutput(), /"support-triage"/);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "skills", "support-triage", "SKILL.md")), true);
    assert.match(fs.readFileSync(clawhubLog, "utf8"), /install support-triage/);
  });
});

test("runCli manages the local library and syncs assigned assets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-library-workspace-"));
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-library-store-"));
  const skillSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-library-skill-"));
  fs.writeFileSync(path.join(skillSourceDir, "skill.json"), JSON.stringify({
    id: "namecheap",
    name: "Namecheap",
    version: "0.1.0",
  }, null, 2));

  const stderr = captureStream();
  const createSkill = await runCli([
    "library", "import-skill", "namecheap",
    "--id", "namecheap",
    "--path", skillSourceDir,
    "--library-dir", libraryDir,
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });
  assert.equal(createSkill, CLI_EXIT_OK, stderr.getOutput());

  const createInstruction = await runCli([
    "library", "create", "ceo-soul",
    "--kind", "instruction",
    "--title", "CEO Soul",
    "--content", "Operate like a pragmatic CEO.",
    "--projection", "agents",
    "--library-dir", libraryDir,
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });
  assert.equal(createInstruction, CLI_EXIT_OK, stderr.getOutput());

  for (const asset of ["namecheap", "ceo-soul"]) {
    const assigned = await runCli([
      "library", "assign", asset,
      "--agent", "ada",
      "--library-dir", libraryDir,
      "--workspace", workspaceRoot,
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });
    assert.equal(assigned, CLI_EXIT_OK, stderr.getOutput());
  }

  const syncStdout = captureStream();
  const synced = await runCli([
    "library", "sync",
    "--agent", "ada",
    "--library-dir", libraryDir,
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: syncStdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });
  assert.equal(synced, CLI_EXIT_OK, stderr.getOutput());
  assert.match(syncStdout.getOutput(), /"assetId": "ceo-soul"/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, "skills", "namecheap", "skill.json")), true);
  assert.match(fs.readFileSync(path.join(workspaceRoot, "AGENTS.md"), "utf8"), /Operate like a pragmatic CEO/);
});

test("runCli registers generated skills in the local library by default", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-library-project-"));
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-library-generated-"));

  const created = await runCli([
    "new", "workspace", "workspace",
    "--dir", projectRoot,
    "--skip-install",
    "--library-dir", libraryDir,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(created, CLI_EXIT_OK);

  const generated = await runCli([
    "generate", "skill", "domain-check",
    "--project", projectRoot,
    "--library-dir", libraryDir,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(generated, CLI_EXIT_OK);

  const listStdout = captureStream();
  const listed = await runCli([
    "library", "list",
    "--library-dir", libraryDir,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(listed, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"id": "domain-check"/);
});

test("runCli can stream a session reply through gateway config", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--system-prompt", "Be concise.",
      "--context", "Mode::Friendly.",
      "--transport", "gateway",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /hello world/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli can emit structured stream events in json mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-events-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("boom", { status: 500 });
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--transport", "gateway",
      "--gateway-retries", "1",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"type": "retry"/);
    assert.match(stdout.getOutput(), /"type": "transport"/);
    assert.match(stdout.getOutput(), /"type": "done"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli can use a real local gateway server with retry events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-real-gateway-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  let attempts = 0;
  const server = http.createServer((request, response) => {
    if (request.url !== `${OPENAI_API_PREFIX}/chat/completions` && request.url !== `${OPENAI_API_PREFIX}/responses`) {
      response.writeHead(404).end();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("boom");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n');
    response.write("data: [DONE]\n\n");
    response.end();
  });
  const port = await listen(server);

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--transport", "gateway",
      "--gateway-url", `http://127.0.0.1:${port}`,
      "--gateway-retries", "1",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.equal(attempts, 2);
    assert.match(stdout.getOutput(), /"type": "retry"/);
    assert.match(stdout.getOutput(), /"type": "done"/);
  } finally {
    server.close();
  }
});

test("runCli falls back from a real local gateway server to the fake CLI runtime", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-fallback-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  const server = http.createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("gateway down");
  });
  const port = await listen(server);

  try {
    await withPatchedEnv({
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FAKE_OPENCLAW_AGENT_TEXT: "hello from cli",
    }, async () => {
      const stdout = captureStream();
      const exitCode = await runCli([
        "sessions",
        "stream",
        "--workspace", workspaceRoot,
        "--session-id", session.sessionId,
        "--transport", "auto",
        "--gateway-url", `http://127.0.0.1:${port}`,
        "--events",
        "--json",
      ], {
        stdout: stdout.stream,
        stderr: captureStream().stream,
        cwd: process.cwd(),
      });

      assert.equal(exitCode, CLI_EXIT_OK);
      assert.match(stdout.getOutput(), /"transport": "gateway"/);
      assert.match(stdout.getOutput(), /"transport": "cli"/);
      assert.match(stdout.getOutput(), /hello from cli/);
    });
  } finally {
    server.close();
  }

  assert.match(fs.readFileSync(openclawLog, "utf8"), new RegExp(`agent --agent ${path.basename(workspaceRoot)} --session-id`));
});

test("runCli can generate a session title through gateway config", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-title-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "I want to talk about anxiety at work",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: "Work anxiety" } }],
  }), { status: 200 })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "generate-title",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--transport", "gateway",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /Work anxiety/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
