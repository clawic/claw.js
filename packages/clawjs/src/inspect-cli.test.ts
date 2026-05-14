import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";
import assert from "node:assert/strict";
import { clawEventsPath } from "@clawjs/core";

import { runCli } from "./index.ts";
import { CLI_EXIT_OK } from "./cli-errors.ts";

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

test("runCli exposes the generated stable surface inspection CLI", async () => {
  const allHelp = await runCliCapture(["--help", "--all"], process.cwd());
  assert.equal(allHelp.code, CLI_EXIT_OK);
  assert.match(allHelp.stdout, /^\s+inspect\s+canonical/m);

  const tree = await runCliCapture(["inspect", "tree", "--json"], process.cwd());
  assert.equal(tree.code, CLI_EXIT_OK);
  const treePayload = JSON.parse(tree.stdout);
  assert.equal(treePayload.version, 1);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.database.core"), true);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.contracts"), true);

  const show = await runCliCapture(["inspect", "show", "/database/core", "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const coreDatabase = JSON.parse(show.stdout);
  assert.equal(coreDatabase.id, "claw.database.core");
  assert.equal(coreDatabase.path, "~/.claw/data/core.sqlite");

  const markdown = await runCliCapture(["inspect", "render", "--format", "markdown"], process.cwd());
  assert.equal(markdown.code, CLI_EXIT_OK);
  assert.match(markdown.stdout, /Generated from `claw inspect render --format markdown`/);
  assert.match(markdown.stdout, /# Claw stable surface/);
  assert.match(markdown.stdout, /```mermaid/);

  const mermaid = await runCliCapture(["inspect", "render", "--format", "mermaid"], process.cwd());
  assert.equal(mermaid.code, CLI_EXIT_OK);
  assert.match(mermaid.stdout, /^flowchart TD/);
  assert.match(mermaid.stdout, /claw_database_core/);
});

test("runCli filters stable compatibility surface categories", async () => {
  const apis = await runCliCapture(["inspect", "apis", "--json"], process.cwd());
  assert.equal(apis.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(apis.stdout).some((node: { id: string; route?: string }) => node.id === "claw.api.events" && node.route === clawEventsPath), true);

  const protocols = await runCliCapture(["inspect", "protocols", "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(protocols.stdout).some((node: { id: string; kind: string }) => node.id === "claw.protocol.hostCommand.v1" && node.kind === "protocol"), true);

  const ids = await runCliCapture(["inspect", "ids", "--json"], process.cwd());
  assert.equal(ids.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(ids.stdout).some((node: { id: string; key?: string }) => node.id === "claw.id.session" && node.key === "sessionId"), true);

  const cli = await runCliCapture(["inspect", "cli", "--json"], process.cwd());
  assert.equal(cli.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(cli.stdout).some((node: { id: string; value?: string }) => node.id === "claw.cli.command.inspect" && node.value === "inspect"), true);
});

test("runCli fuses static inspect manifests from other language builders", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-manifest-"));
  const manifestPath = path.join(tempRoot, "clawix-persistent-surface.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    nodes: [
      {
        id: "clawix.database.local",
        kind: "database",
        owner: "clawix",
        repo: "Clawix",
        project: "macos",
        language: "swift",
        name: "Clawix local database",
        path: "~/Library/Application Support/Clawix/clawix.sqlite",
        storageClass: "nativeAppData",
        canonicality: "hostOnly",
        privacy: "userData",
        lifecycle: "durable",
      },
      {
        id: "clawix.database.local.table.projects",
        kind: "table",
        owner: "clawix",
        repo: "Clawix",
        project: "macos",
        language: "swift",
        name: "projects",
        databaseId: "clawix.database.local",
        parentId: "clawix.database.local",
        storageClass: "nativeAppData",
        canonicality: "hostOnly",
        privacy: "userData",
        lifecycle: "durable",
      },
      {
        id: "clawix.protocol.bridge",
        kind: "protocol",
        owner: "clawix",
        repo: "Clawix",
        project: "core",
        language: "swift",
        name: "Clawix bridge protocol",
        value: "bridge-protocol",
        storageClass: "external",
        canonicality: "hostOnly",
        privacy: "public",
        lifecycle: "durable",
        surfaceClass: "protocol",
        stability: "v1",
      },
    ],
  }, null, 2));

  const show = await runCliCapture(["inspect", "show", "clawix.database.local", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const payload = JSON.parse(show.stdout);
  assert.equal(payload.language, "swift");
  assert.equal(payload.path, "~/Library/Application Support/Clawix/clawix.sqlite");

  const listed = await runCliCapture(["inspect", "list", "clawix.database.local", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(listed.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(listed.stdout)[0].id, "clawix.database.local.table.projects");

  const protocols = await runCliCapture(["inspect", "protocols", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(protocols.stdout).some((node: { id: string }) => node.id === "clawix.protocol.bridge"), true);
});
