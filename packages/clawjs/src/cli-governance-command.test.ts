import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_OK, runCli } from "./index.ts";

function captureStream() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WritableStream,
    getOutput() {
      return output;
    },
  };
}

async function runCliCapture(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runCli(args, { stdout: stdout.stream, stderr: stderr.stream, cwd });
  return { code, stdout: stdout.getOutput(), stderr: stderr.getOutput() };
}

function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createGovernanceFixture(): { tempRoot: string; overlayRoot: string; clawjsRoot: string; clawixRoot: string } {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-governance-doctor-"));
  const overlayRoot = path.join(tempRoot, "Clawix");
  const clawjsRoot = path.join(tempRoot, "clawjs");
  const clawixRoot = path.join(overlayRoot, "clawix");

  fs.mkdirSync(path.join(clawjsRoot, "packages", "clawjs-core"), { recursive: true });
  writeFixtureFile(clawjsRoot, "package.json", JSON.stringify({ name: "@clawjs/fixture", scripts: { test: `node -e "require('fs').writeFileSync('executed','1')"` } }, null, 2));
  writeFixtureFile(clawjsRoot, "AGENTS.md", "Use docs/decision-map.md and docs/agent-rules/index.md.\n");
  writeFixtureFile(clawjsRoot, "CONSTITUTION.md", "# Constitution\n");
  writeFixtureFile(clawjsRoot, "docs/decision-map.md", "| Decision | Canonical document | Guardrail or validation |\n| --- | --- | --- |\n| System telemetry closure depends on external validation. | docs/governance/system-telemetry/external-validation.manifest.json | completion requires closure evidence. |\n");
  writeFixtureFile(clawjsRoot, "docs/discoverability.registry.json", JSON.stringify({ version: 1, entries: [] }, null, 2));
  writeFixtureFile(clawjsRoot, "docs/agent-rules/index.md", "# Agent rules\n");
  writeFixtureFile(clawjsRoot, "docs/cli.md", "# CLI\n");
  writeFixtureFile(clawjsRoot, "docs/debt-ledger.md", "# Debt ledger\n");
  writeFixtureFile(clawjsRoot, "docs/adr/0017-discoverability-and-meta-code-routing.md", "# Discoverability\n");
  writeFixtureFile(clawjsRoot, "docs/adr/0027-governance-identity-scope-model.md", "# Governance identity\n");
  writeFixtureFile(clawjsRoot, "docs/adr/0028-workspace-project-folder-manifest.md", "# Workspace projects\n");
  writeFixtureFile(clawjsRoot, "skills/cli-agent-surface-work/SKILL.md", "---\nname: cli-agent-surface-work\ndescription: CLI\nkeywords: [cli]\n---\n");
  writeFixtureFile(clawjsRoot, "skills/decision-map-maintenance/SKILL.md", "---\nname: decision-map-maintenance\ndescription: Maps\nkeywords: [docs]\n---\n");
  writeFixtureFile(clawjsRoot, "docs/source-size-baseline.json", JSON.stringify({
    version: 1,
    files: {
      "packages/clawjs/src/large.ts": {
        lines: 5001,
        reason: "Split before expanding.",
        blockGrowth: true,
      },
    },
  }, null, 2));
  writeFixtureFile(clawjsRoot, "docs/governance/system-telemetry/external-validation.manifest.json", JSON.stringify({
    schemaVersion: 1,
    completionAudit: {
      statusSummary: {
        externalPendingRowIds: ["STA-016"],
      },
    },
    externalValidationRunbook: {
      externalPendingRowIds: ["SYS-TEL-EXT-001"],
    },
  }, null, 2));

  fs.mkdirSync(path.join(clawixRoot, "macos"), { recursive: true });
  writeFixtureFile(overlayRoot, "AGENTS.md", "Private overlay; public canon lives in clawix/ and sibling clawjs.\n");
  writeFixtureFile(clawixRoot, "AGENTS.md", "Clawix agent router.\n");
  writeFixtureFile(clawixRoot, "STYLE.md", "# Style\n");
  writeFixtureFile(clawixRoot, "docs/decision-map.md", "External lanes require signed-host validation before completion.\n");
  writeFixtureFile(clawixRoot, "docs/discoverability.registry.json", JSON.stringify({ version: 1, entries: [] }, null, 2));
  writeFixtureFile(clawixRoot, "docs/agent-rules/index.md", "# Agent rules\n");
  writeFixtureFile(clawixRoot, "docs/host-" + "owner" + "ship.md", "# Host boundary\n");
  writeFixtureFile(clawixRoot, "docs/adr/0010-interface-governance.md", "# Interface governance\n");
  writeFixtureFile(clawixRoot, "docs/ui/README.md", "# UI\n");
  writeFixtureFile(clawixRoot, "docs/discoverability-baseline.json", JSON.stringify({ version: 1, entries: [] }, null, 2));
  writeFixtureFile(clawixRoot, "docs/ui/debt.baseline.json", JSON.stringify({ entries: [] }, null, 2));
  writeFixtureFile(clawixRoot, "docs/persistent-surface-clawix.manifest.json", JSON.stringify({ entries: [] }, null, 2));
  writeFixtureFile(clawixRoot, "skills/ui-canon-review/SKILL.md", "---\nname: ui-canon-review\ndescription: UI canon\nkeywords: [ui]\n---\n");

  return { tempRoot, overlayRoot, clawjsRoot, clawixRoot };
}

test("governance doctor returns compact read-only envelope", async () => {
  const fixture = createGovernanceFixture();
  const result = await runCliCapture(["governance", "doctor", "--root", fixture.clawjsRoot, "--json", "--now", "2026-05-20T00:00:00.000Z"], fixture.clawjsRoot);
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    data: {
      schemaVersion: number;
      scope: { mode: string; crossRepo: boolean; repositories: Array<{ repo: string; rootDir: string }> };
      reads: Array<{ repo: string; path: string; priority: string }>;
      skills: Array<{ repo: string; id: string }>;
      checks: Array<{ repo: string; command: string; requirement: string }>;
      externalPending: Array<{ repo: string; id: string; blocker: boolean }>;
      staleDocs: Array<{ repo: string; path: string; status: string }>;
    };
    meta: { schemaVersion: string; command: string; mode: string; jsonSchemaId: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.schemaVersion, 1);
  assert.equal(payload.meta.schemaVersion, "claw.governance.doctor.v1");
  assert.equal(payload.meta.command, "governance doctor");
  assert.equal(payload.meta.mode, "plan-only");
  assert.equal(payload.meta.jsonSchemaId, "claw.cli.governance.v1");
  assert.equal(payload.data.scope.crossRepo, true);
  assert.deepEqual(payload.data.scope.repositories.map((repo) => repo.repo), ["clawjs", "clawix"]);
  assert.equal(payload.data.reads.some((read) => read.repo === "clawjs" && read.path === "docs/decision-map.md" && read.priority === "required"), true);
  assert.equal(payload.data.skills.some((skill) => skill.repo === "clawix" && skill.id === "ui-canon-review"), true);
  assert.equal(payload.data.checks.some((check) => check.repo === "clawjs" && check.command === "npm run test:docs" && check.requirement === "local_only"), true);
  assert.equal(payload.data.externalPending.some((entry) => entry.repo === "clawjs" && entry.blocker), true);
  assert.equal(payload.data.staleDocs.some((entry) => entry.repo === "clawjs" && entry.path === "docs/source-size-baseline.json" && entry.status === "stale_risk"), true);
  assert.equal(result.stdout.includes("/Users/trabajo"), false);
  assert.equal(fs.existsSync(path.join(fixture.clawjsRoot, "executed")), false);
});

test("governance doctor federates public repos from a Clawix overlay cwd", async () => {
  const fixture = createGovernanceFixture();
  const result = await runCliCapture(["governance", "doctor", "--json", "--now", "2026-05-20T00:00:00.000Z"], fixture.overlayRoot);
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    data: {
      scope: { crossRepo: boolean; repositories: Array<{ repo: string; rootDir: string; detectedBy: string }> };
      checks: Array<{ repo: string; cwd: string }>;
    };
  };
  assert.equal(payload.data.scope.crossRepo, true);
  assert.deepEqual(payload.data.scope.repositories.map((repo) => repo.repo), ["clawjs", "clawix"]);
  assert.equal(payload.data.scope.repositories.some((repo) => repo.repo === "clawix" && repo.detectedBy === "nested"), true);
  assert.equal(payload.data.scope.repositories.some((repo) => repo.detectedBy === "fallback"), false);
  assert.equal(payload.data.checks.some((check) => check.cwd === fixture.overlayRoot), false);
});

test("governance command is discoverable through help, inspect, and search", async () => {
  const help = await runCliCapture(["--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /governance\s+canonical\s+Read-only governance doctor/);

  const inspect = await runCliCapture(["inspect", "commands", "--json"], process.cwd());
  assert.equal(inspect.code, CLI_EXIT_OK);
  const inspected = JSON.parse(inspect.stdout) as { data: { commands: Array<{ name: string; usage?: string; source?: { file?: string } }> } };
  const command = inspected.data.commands.find((entry) => entry.name === "governance");
  assert.equal(command?.usage, "governance doctor --json [--root PATH]");
  assert.equal(command?.source?.file, "packages/clawjs/src/cli-governance-command.ts");

  const search = await runCliCapture(["search", "governance doctor", "--json"], process.cwd());
  assert.equal(search.code, CLI_EXIT_OK);
  const searched = JSON.parse(search.stdout) as { data: { results: Array<{ type: string; name: string; command?: { usage?: string } }> } };
  assert.equal(searched.data.results.some((entry) => entry.type === "command" && entry.name === "governance" && entry.command?.usage === "governance doctor --json [--root PATH]"), true);
});
