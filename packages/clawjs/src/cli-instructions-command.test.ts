import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runInstructionsCli } from "./cli-instructions-command.ts";

interface CapturedStreams {
  stdout: { write: (chunk: string) => boolean; flushed: string[] };
  stderr: { write: (chunk: string) => boolean; flushed: string[] };
}

function makeStreams(): CapturedStreams {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: {
      flushed: stdout,
      write(chunk: string) {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      flushed: stderr,
      write(chunk: string) {
        stderr.push(chunk);
        return true;
      },
    },
  };
}

function makeIsolatedEnv(tmp: string): void {
  process.env.CLAW_DB_PATH = path.join(tmp, "core.sqlite");
  process.env.CLAW_FILES_DIR = path.join(tmp, "files");
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-instructions-cli-"));
}

async function callCli(positionals: string[], flags: Record<string, string>, wantsJson: boolean, cwd = process.cwd()) {
  const streams = makeStreams();
  const status = await runInstructionsCli({
    positionals,
    flags,
    context: {
      stdout: streams.stdout as unknown as NodeJS.WritableStream,
      stderr: streams.stderr as unknown as NodeJS.WritableStream,
      cwd,
    },
    wantsJson,
    binName: "claw",
  });
  return { status, stdout: streams.stdout.flushed.join(""), stderr: streams.stderr.flushed.join("") };
}

test("instructions add → list → show → edit → approve → rm round-trip via CLI", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      activation: "on",
      severity: "warn",
      priority: "80",
      "use-when": "Created via CLI test.",
      "write-policy": "Tasks must be doable in under 10 minutes.",
    }, true);
    assert.equal(add.status, 0, add.stderr);
    const addEnvelope = JSON.parse(add.stdout);
    assert.equal(addEnvelope.ok, true);
    const id = addEnvelope.data.id as string;
    assert.equal(typeof id, "string");
    assert.equal(id.length > 0, true);
    assert.equal(addEnvelope.data.provenance, "user");
    assert.equal(addEnvelope.data.state, "active");

    const list = await callCli(["instructions", "list"], { "target.command": "tasks" }, true);
    assert.equal(list.status, 0, list.stderr);
    const listEnvelope = JSON.parse(list.stdout);
    assert.equal(listEnvelope.data.total >= 1, true);
    assert.equal(listEnvelope.data.items.some((row: { id: string }) => row.id === id), true);

    const show = await callCli(["instructions", "show", id], {}, true);
    const showEnvelope = JSON.parse(show.stdout);
    assert.equal(showEnvelope.data.id, id);
    assert.equal(showEnvelope.data.useWhen, "Created via CLI test.");

    const edit = await callCli(["instructions", "edit", id], { "use-when": "Edited via CLI test." }, true);
    assert.equal(edit.status, 0, edit.stderr);
    const editEnvelope = JSON.parse(edit.stdout);
    assert.equal(editEnvelope.data.useWhen, "Edited via CLI test.");

    const rm = await callCli(["instructions", "rm", id], {}, true);
    assert.equal(rm.status, 0, rm.stderr);
    const rmEnvelope = JSON.parse(rm.stdout);
    assert.equal(rmEnvelope.data.deleted, true);

    const showAfter = await callCli(["instructions", "show", id], {}, true);
    assert.equal(showAfter.status, 1);
    const showAfterEnvelope = JSON.parse(showAfter.stdout);
    assert.equal(showAfterEnvelope.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions propose → approve workflow", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const propose = await callCli(["instructions", "propose"], {
      "target.command": "notes",
      "target.action": "write",
      trigger: "surface-action",
      severity: "info",
      from: "corr_test_001",
      notes: "Agent observed the user prefers shorter notes.",
    }, true);
    assert.equal(propose.status, 0, propose.stderr);
    const proposed = JSON.parse(propose.stdout);
    assert.equal(proposed.data.state, "proposed");
    assert.equal(proposed.data.provenance, "agent");
    assert.equal(proposed.data.proposedFrom, "corr_test_001");

    const list = await callCli(["instructions", "list"], { state: "proposed" }, true);
    assert.equal(JSON.parse(list.stdout).data.total, 1);

    const approve = await callCli(["instructions", "approve", proposed.data.id], {}, true);
    assert.equal(approve.status, 0, approve.stderr);
    const approved = JSON.parse(approve.stdout);
    assert.equal(approved.data.state, "active");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions where merges shipped seeds with overrides", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      severity: "warn",
      priority: "95",
      "use-when": "Override from CLI test.",
    }, true);
    assert.equal(add.status, 0, add.stderr);

    const where = await callCli(["instructions", "where", "tasks", "write"], {}, true);
    assert.equal(where.status, 0, where.stderr);
    const envelope = JSON.parse(where.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.appliedCount >= 2, true, "override + at least one seed should be applied");
    const sources = envelope.data.rules.map((rule: { source: string | null; id: string }) => rule.source ?? rule.id);
    assert.equal(sources.some((source: string) => typeof source === "string" && source.startsWith("catalog:tasks")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions add rejects body fields exceeding caps", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      severity: "info",
      "use-when": "x".repeat(300),
    }, true);
    assert.equal(add.status, 64, add.stdout);
    const envelope = JSON.parse(add.stdout);
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /useWhen exceeds cap/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions without subcommand prints usage on stderr", async () => {
  const result = await callCli(["instructions"], {}, false);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Usage: claw instructions <list\|show\|search\|read\|docs\|graph\|add\|edit\|rm\|approve\|propose\|where\|reconcile>/);
});

test("instructions search returns unified candidates across rules, guidance, docs, cli instructions, and agent files", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  const prevRules = process.env.CLAW_RULES_DIR;
  const prevGuidance = process.env.CLAW_GUIDANCE_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  process.env.CLAW_RULES_DIR = path.join(root, "rules");
  process.env.CLAW_GUIDANCE_DIR = path.join(root, "guidance");
  try {
    fs.mkdirSync(process.env.CLAW_RULES_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.CLAW_RULES_DIR, "rules.json"), `${JSON.stringify({
      schemaVersion: 1,
      scopes: [{ id: "global", kind: "user", name: "Global", aliases: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      rules: [{
        id: "billing-no-vpn",
        title: "Never use VPN for billing portal",
        kind: "directive",
        status: "active",
        scopeId: "global",
        content: "Never use VPN for billing portal access.",
        applyWhen: { services: ["billing"] },
        aliases: [],
        priority: 95,
        references: [{ kind: "asset", ref: "instruction:billing-refunds", label: "Billing refunds" }],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2)}\n`);
    fs.mkdirSync(process.env.CLAW_GUIDANCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.CLAW_GUIDANCE_DIR, "guidance.json"), `${JSON.stringify({
      schemaVersion: 1,
      records: [{
        schemaVersion: 1,
        id: "billing-runbook",
        status: "active",
        title: "Billing runbook",
        capsule: "Read billing instructions before refunds.",
        severity: "warning",
        priority: 90,
        applyWhen: { services: ["billing"] },
        resourceIds: [],
        commands: ["claw instructions read doc:billing-refunds --summary --json"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Billing project\n\nRead billing rules before refund work.\n");

    const add = await callCli(["instructions", "add"], {
      "target.command": "billing",
      "target.action": "write",
      "use-when": "Billing refund work.",
      notes: "Billing compact CLI instruction.",
    }, true, root);
    assert.equal(add.status, 0, add.stderr);

    const create = await callCli(["instructions", "docs", "create"], {
      id: "billing-refunds",
      title: "Billing refunds",
      summary: "Refund workflow for billing.",
      tags: "billing,refunds",
      "applies-when": "Before issuing billing refunds.",
      content: "# Refunds\n\nUse the dashboard carefully.",
      "related-rules": "billing-no-vpn",
      "related-guidance": "billing-runbook",
      "requires-read": "doc:billing-risk",
    }, true, root);
    assert.equal(create.status, 0, create.stderr);

    const search = await callCli(["instructions", "search", "billing"], { limit: "20" }, true, root);
    assert.equal(search.status, 0, search.stderr);
    const payload = JSON.parse(search.stdout);
    const kinds = new Set(payload.data.items.map((item: { kind: string }) => item.kind));
    assert.equal(kinds.has("rule"), true);
    assert.equal(kinds.has("guidance"), true);
    assert.equal(kinds.has("instruction_document"), true);
    assert.equal(kinds.has("cli_instruction"), true);
    assert.equal(kinds.has("agent_file"), true);
    assert.equal(payload.data.insertion, "recommend_only");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
    if (prevRules === undefined) delete process.env.CLAW_RULES_DIR; else process.env.CLAW_RULES_DIR = prevRules;
    if (prevGuidance === undefined) delete process.env.CLAW_GUIDANCE_DIR; else process.env.CLAW_GUIDANCE_DIR = prevGuidance;
  }
});

test("instructions docs create edit versions and read summary section full", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  try {
    const create = await callCli(["instructions", "docs", "create"], {
      id: "namecheap-dns",
      title: "Namecheap DNS",
      summary: "Namecheap DNS update checklist.",
      tags: "namecheap,dns",
      "applies-when": "Before editing Namecheap DNS records.",
      content: "# Checklist\n\nConfirm the target zone.\n\n# Rollback\n\nKeep previous values.",
    }, true, root);
    assert.equal(create.status, 0, create.stderr);
    const created = JSON.parse(create.stdout);
    assert.equal(created.data.document.id, "namecheap-dns");
    assert.equal(fs.existsSync(created.data.document.path), true);
    assert.equal(fs.existsSync(created.data.versionPath), true);

    const summary = await callCli(["instructions", "read", "doc:namecheap-dns"], { summary: "true" }, true, root);
    assert.equal(summary.status, 0, summary.stderr);
    const summaryPayload = JSON.parse(summary.stdout);
    assert.equal(summaryPayload.data.summary, "Namecheap DNS update checklist.");
    assert.equal(Object.prototype.hasOwnProperty.call(summaryPayload.data, "body"), false);
    assert.deepEqual(summaryPayload.data.availableSections, ["Checklist", "Rollback"]);

    const section = await callCli(["instructions", "read", "doc:namecheap-dns"], { section: "Rollback" }, true, root);
    assert.equal(section.status, 0, section.stderr);
    assert.match(JSON.parse(section.stdout).data.content, /Keep previous values/);

    const full = await callCli(["instructions", "read", "doc:namecheap-dns"], { full: "true" }, true, root);
    assert.equal(full.status, 0, full.stderr);
    assert.match(JSON.parse(full.stdout).data.body, /Confirm the target zone/);

    const edit = await callCli(["instructions", "docs", "edit", "namecheap-dns"], {
      summary: "Updated Namecheap DNS checklist.",
      content: "# Checklist\n\nConfirm principal approval.",
    }, true, root);
    assert.equal(edit.status, 0, edit.stderr);

    const versions = await callCli(["instructions", "docs", "versions", "namecheap-dns"], {}, true, root);
    assert.equal(versions.status, 0, versions.stderr);
    assert.equal(JSON.parse(versions.stdout).data.versions.length >= 2, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
  }
});

test("instructions graph exposes related rule and guidance density for managed docs", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  try {
    const create = await callCli(["instructions", "docs", "create"], {
      id: "hetzner-secure",
      title: "Hetzner secure server",
      summary: "Server hardening router.",
      tags: "hetzner,server",
      "related-rules": "hetzner-root-login",
      "related-guidance": "hetzner-runbook",
      "requires-read": "doc:ssh-hardening,doc:firewall",
      content: "# Router\n\nRead the hardening docs.",
    }, true, root);
    assert.equal(create.status, 0, create.stderr);

    const graph = await callCli(["instructions", "graph", "doc:hetzner-secure"], {}, true, root);
    assert.equal(graph.status, 0, graph.stderr);
    const payload = JSON.parse(graph.stdout);
    assert.deepEqual(payload.data.relatedRules, ["hetzner-root-login"]);
    assert.deepEqual(payload.data.relatedGuidance, ["hetzner-runbook"]);
    assert.deepEqual(payload.data.requiresRead, ["doc:ssh-hardening", "doc:firewall"]);
    assert.equal(payload.data.density.relationCount, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
  }
});

function writeManifest(root: string, body: string): void {
  const dir = path.join(root, "instructions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.yaml"), body);
}

function manifestWith(ids: string[]): string {
  const entries = ids.map((id) => [
    `  - id: ${id}`,
    "    target:",
    "      command: tasks",
    "      action: write",
    "    trigger: surface-action",
    "    activation: on",
    "    priority: 82",
    "    severity: warn",
    `    useWhen: ${id} from manifest`,
  ].join("\n"));
  return ["schemaVersion: 1", "instructions:", ...entries].join("\n");
}

test("instructions reconcile round-trips manifest rows and is idempotent", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  try {
    writeManifest(root, manifestWith(["manifest.tasks.write"]));
    const reconcile = await callCli(["instructions", "reconcile"], {}, true);
    assert.equal(reconcile.status, 0, reconcile.stderr);
    const envelope = JSON.parse(reconcile.stdout);
    assert.deepEqual(envelope.data.counts, { added: 1, updated: 0, archived: 0, unchanged: 0 });

    const show = await callCli(["instructions", "show", "manifest.tasks.write"], {}, true);
    assert.equal(show.status, 0, show.stderr);
    const shown = JSON.parse(show.stdout);
    assert.equal(shown.data.provenance, "user");
    assert.equal(shown.data.source, "manifest:manifest.tasks.write");
    assert.equal(shown.data.useWhen, "manifest.tasks.write from manifest");

    const second = await callCli(["instructions", "reconcile"], {}, true);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(second.stdout).data.counts, { added: 0, updated: 0, archived: 0, unchanged: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
  }
});

test("instructions reconcile rejects invalid manifests", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  try {
    writeManifest(root, [
      "schemaVersion: 1",
      "instructions:",
      "  - id: invalid",
      "    target:",
      "      command: Tasks",
      "    severity: warn",
    ].join("\n"));
    const reconcile = await callCli(["instructions", "reconcile"], {}, true);
    assert.equal(reconcile.status, 64);
    const envelope = JSON.parse(reconcile.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "invalid_manifest");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
  }
});

test("instructions reconcile archives manifest-managed rows omitted from manifest", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  const prevData = process.env.CLAW_DATA_DIR;
  makeIsolatedEnv(root);
  process.env.CLAW_DATA_DIR = root;
  try {
    writeManifest(root, manifestWith(["manifest.keep", "manifest.omit"]));
    assert.equal((await callCli(["instructions", "reconcile"], {}, true)).status, 0);
    writeManifest(root, manifestWith(["manifest.keep"]));
    const reconcile = await callCli(["instructions", "reconcile"], {}, true);
    assert.equal(reconcile.status, 0, reconcile.stderr);
    assert.deepEqual(JSON.parse(reconcile.stdout).data.counts, { added: 0, updated: 0, archived: 1, unchanged: 1 });

    const omitted = await callCli(["instructions", "show", "manifest.omit"], {}, true);
    assert.equal(omitted.status, 0, omitted.stderr);
    assert.equal(JSON.parse(omitted.stdout).data.state, "archived");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
    if (prevData === undefined) delete process.env.CLAW_DATA_DIR; else process.env.CLAW_DATA_DIR = prevData;
  }
});

test("instructions where merges plugin-provided seeds from openclaw manifests", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const fixtureRoot = path.resolve("packages/clawjs/tests/fixtures/instructions-plugin/happy");
    const where = await callCli(["instructions", "where", "fixture-tool", "write"], {}, true, fixtureRoot);
    assert.equal(where.status, 0, where.stderr);
    const envelope = JSON.parse(where.stdout);
    assert.equal(envelope.data.rules.some((rule: { source: string | null }) => rule.source === "plugin:fixture-instructions:0"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions where rejects invalid plugin instruction seeds", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const fixtureRoot = path.resolve("packages/clawjs/tests/fixtures/instructions-plugin/invalid");
    const where = await callCli(["instructions", "where", "fixture-tool", "write"], {}, true, fixtureRoot);
    assert.equal(where.status, 64);
    const envelope = JSON.parse(where.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "plugin_instructions_invalid");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});
