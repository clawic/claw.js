import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
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

test("runCli exposes critical capability fiches through inspect", async () => {
  const list = await runCliCapture(["inspect", "capabilities", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listEnvelope = parseCliJson<Array<{
    id: string;
    system: string;
    routes: string[];
    touchedResources: string[];
    permissions: string[];
    cliApiMcpRelay: { cli: string[]; serviceApi: string[]; mcp: string[]; relay: string[]; hostBridge: string[] };
    errorStates: string[];
    fixtures: string[];
    limits: string[];
    validation: string[];
  }>>(list.stdout);
  assert.equal(listEnvelope.meta.subcommand, "capabilities");
  const fiches = listEnvelope.data;
  assert.equal(fiches.some((fiche) => fiche.id === "chat.localDesktop"), true);
  assert.equal(fiches.some((fiche) => fiche.id === "remote.searchGateway"), true);
  assert.equal(fiches.some((fiche) => fiche.id === "sync.sqliteResources"), true);
  assert.equal(fiches.some((fiche) => fiche.id === "mac.action.plan"), true);
  assert.equal(fiches.some((fiche) => fiche.id === "system.telemetry.history"), true);
  assert.equal(fiches.some((fiche) => fiche.id === "secrets.broker"), true);

  const routeFiltered = await runCliCapture(["inspect", "capabilities", "remote.searchGateway", "--json"], process.cwd());
  assert.equal(routeFiltered.code, CLI_EXIT_OK);
  const routeFilteredPayload = parseCliJson<Array<{ id: string }>>(routeFiltered.stdout).data;
  assert.deepEqual(routeFilteredPayload.map((fiche) => fiche.id), ["remote.searchGateway", "search.query"]);

  const localChat = await runCliCapture(["inspect", "capability", "chat.localDesktop", "--json"], process.cwd());
  assert.equal(localChat.code, CLI_EXIT_OK);
  const localChatFiche = parseCliJson<{
    id: string;
    routes: string[];
    touchedResources: string[];
    storage: string[];
    errorStates: string[];
    fixtures: string[];
  }>(localChat.stdout).data;
  assert.equal(localChatFiche.id, "chat.localDesktop");
  assert.deepEqual(localChatFiche.routes, ["chat.localDesktop"]);
  assert.equal(localChatFiche.touchedResources.includes("clawix.bridge.local"), true);
  assert.equal(localChatFiche.storage.includes("claw.database.sessions"), true);
  assert.equal(localChatFiche.errorStates.length > 0, true);
  assert.equal(localChatFiche.fixtures.includes("packages/clawjs/src/inspect-cli.test.ts"), true);

  const text = await runCliCapture(["inspect", "capability", "remote.searchGateway"], process.cwd());
  assert.equal(text.code, CLI_EXIT_OK);
  assert.match(text.stdout, /remote\.searchGateway\tremote\tRemote search gateway/);

  const missing = await runCliCapture(["inspect", "capability", "missing.capability", "--json"], process.cwd());
  assert.equal(missing.code, CLI_EXIT_USAGE);
  assert.match(missing.stdout, /inspect_not_found/);
});

test("inspect markdown render includes capability fiches as derived output", async () => {
  const markdown = await runCliCapture(["inspect", "render", "--format", "markdown"], process.cwd());

  assert.equal(markdown.code, CLI_EXIT_OK);
  assert.match(markdown.stdout, /## Capability Fiches/);
  assert.match(markdown.stdout, /`chat.localDesktop`/);
  assert.match(markdown.stdout, /`remote.searchGateway`/);
});
