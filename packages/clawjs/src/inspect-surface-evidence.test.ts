import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCli } from "./index.ts";

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

function parseCliJson<T>(stdout: string): { ok: boolean; data: T; meta: { schemaVersion: number; canonicalCommand: string; subcommand?: string } } {
  return JSON.parse(stdout);
}

test("inspect show returns surface evidence for route-connected nodes", async () => {
  const show = await runCliCapture(["inspect", "show", "claw.relay", "--json"], process.cwd());

  assert.equal(show.code, CLI_EXIT_OK);
  const showPayload = parseCliJson<{
    id: string;
    evidence: {
      declaration: { file: string };
      docs: string[];
      tests: string[];
      inspectCommands: string[];
      searchCommands: string[];
      changePolicy: { guards: string[]; routeIds: string[] };
    };
  }>(show.stdout).data;
  assert.equal(showPayload.id, "claw.relay");
  assert.equal(showPayload.evidence.declaration.file, "packages/clawjs-core/src/surface-registry.ts");
  assert.equal(showPayload.evidence.docs.includes("docs/adr/0049-surface-route-graph.md"), true);
  assert.equal(showPayload.evidence.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);
  assert.equal(showPayload.evidence.inspectCommands.some((command) => command.includes("inspect show claw.relay --json")), true);
  assert.equal(showPayload.evidence.searchCommands.some((command) => command.includes("search query \"claw.relay\" --domains surfaces --json")), true);
  assert.equal(showPayload.evidence.changePolicy.guards.includes("scripts/surface-evidence-guard.mjs"), true);
  assert.equal(showPayload.evidence.changePolicy.routeIds.includes("chat.remoteRelay"), true);
});
