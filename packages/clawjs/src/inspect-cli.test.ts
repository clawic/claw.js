import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";
import assert from "node:assert/strict";
import { clawEventsPath } from "@clawjs/core";

import { runCli } from "./index.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";

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

test("runCli exposes the generated stable surface inspection CLI", async () => {
  const allHelp = await runCliCapture(["--help", "--all"], process.cwd());
  assert.equal(allHelp.code, CLI_EXIT_OK);
  assert.match(allHelp.stdout, /^\s+inspect\s+canonical/m);

  const tree = await runCliCapture(["inspect", "tree", "--json"], process.cwd());
  assert.equal(tree.code, CLI_EXIT_OK);
  const treeEnvelope = parseCliJson<{ version: number; nodes: Array<{ id: string }> }>(tree.stdout);
  assert.equal(treeEnvelope.ok, true);
  assert.equal(treeEnvelope.meta.canonicalCommand, "inspect");
  assert.equal(treeEnvelope.meta.subcommand, "tree");
  const treePayload = treeEnvelope.data;
  assert.equal(treePayload.version, 1);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.database.core"), true);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.contracts"), true);

  const show = await runCliCapture(["inspect", "show", "/database/core", "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const coreDatabase = parseCliJson<{ id: string; path: string; incomingEdges?: unknown[]; outgoingEdges?: unknown[]; routes?: unknown[] }>(show.stdout).data;
  assert.equal(coreDatabase.id, "claw.database.core");
  assert.equal(coreDatabase.path, "~/.claw/data/core.sqlite");
  assert.equal(Array.isArray(coreDatabase.incomingEdges), true);
  assert.equal(Array.isArray(coreDatabase.outgoingEdges), true);
  assert.equal(Array.isArray(coreDatabase.routes), true);

  const markdown = await runCliCapture(["inspect", "render", "--format", "markdown"], process.cwd());
  assert.equal(markdown.code, CLI_EXIT_OK);
  assert.match(markdown.stdout, /Generated from `claw inspect render --format markdown`/);
  assert.match(markdown.stdout, /# Claw stable surface/);
  assert.match(markdown.stdout, /Human \| Programmatic \| Gaps/);
  assert.match(markdown.stdout, /```mermaid/);

  const mermaid = await runCliCapture(["inspect", "render", "--format", "mermaid"], process.cwd());
  assert.equal(mermaid.code, CLI_EXIT_OK);
  assert.match(mermaid.stdout, /^flowchart TD/);
  assert.match(mermaid.stdout, /claw_database_core/);
  assert.match(mermaid.stdout, /claw_relay/);
});

test("runCli exposes surface graph routes and neighbors through inspect", async () => {
  const relay = await runCliCapture(["inspect", "why", "relay", "--json"], process.cwd());
  assert.equal(relay.code, CLI_EXIT_OK);
  const relayWhy = parseCliJson<{ type: string; id: string; name: string }>(relay.stdout).data;
  assert.equal(relayWhy.type, "surfaceNode");
  assert.equal(relayWhy.id, "claw.relay");
  assert.equal(relayWhy.name, "Relay control plane");

  const show = await runCliCapture(["inspect", "show", "claw.relay", "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const showPayload = parseCliJson<{
    id: string;
    incomingEdges: Array<{ id: string; type: string; fromId: string }>;
    outgoingEdges: Array<{ id: string; type: string; toId: string }>;
    routes: Array<{ id: string }>;
  }>(show.stdout).data;
  assert.equal(showPayload.id, "claw.relay");
  assert.equal(showPayload.incomingEdges.some((edge) => edge.fromId === "claw.remote.client" && edge.type === "consumes"), true);
  assert.equal(showPayload.outgoingEdges.some((edge) => edge.toId === "claw.relay.connector" && edge.type === "brokers"), true);
  assert.equal(showPayload.routes.some((route) => route.id === "chat.remoteRelay"), true);

  const routes = await runCliCapture(["inspect", "routes", "--json"], process.cwd());
  assert.equal(routes.code, CLI_EXIT_OK);
  const routeList = parseCliJson<Array<{ id: string; steps: Array<{ edgeType: string; fromId: string; toId: string }> }>>(routes.stdout).data;
  assert.deepEqual(routeList.map((route) => route.id).sort(), ["chat.companionBridge", "chat.localDesktop", "chat.remoteRelay"]);
  assert.equal(routeList.find((route) => route.id === "chat.localDesktop")?.steps.every((step) => ["owns", "consumes", "exposes", "brokers"].includes(step.edgeType)), true);

  const route = await runCliCapture(["inspect", "route", "chat.remoteRelay", "--json"], process.cwd());
  assert.equal(route.code, CLI_EXIT_OK);
  const remoteRoute = parseCliJson<{ id: string; edges: Array<{ id: string; type: string }>; tests: string[] }>(route.stdout).data;
  assert.equal(remoteRoute.id, "chat.remoteRelay");
  assert.equal(remoteRoute.edges.some((edge) => edge.id === "claw.edge.relay.brokers.connector" && edge.type === "brokers"), true);
  assert.equal(remoteRoute.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);

  const neighbors = await runCliCapture(["inspect", "neighbors", "clawix.bridge.local", "--json"], process.cwd());
  assert.equal(neighbors.code, CLI_EXIT_OK);
  const neighborPayload = parseCliJson<{ neighbors: Array<{ id: string }>; routes: Array<{ id: string }> }>(neighbors.stdout).data;
  assert.equal(neighborPayload.neighbors.some((node) => node.id === "claw.daemon.local"), true);
  assert.equal(neighborPayload.routes.some((entry) => entry.id === "chat.companionBridge"), true);
});

test("runCli filters stable contract surface categories", async () => {
  const apis = await runCliCapture(["inspect", "apis", "--json"], process.cwd());
  assert.equal(apis.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; route?: string }>>(apis.stdout).data.some((node) => node.id === "claw.api.events" && node.route === clawEventsPath), true);

  const privateApis = await runCliCapture(["inspect", "private-apis", "--json"], process.cwd());
  assert.equal(privateApis.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; route?: string }>>(privateApis.stdout).data.some((node) => node.kind === "privateApiRoute" && node.route === "/api/apps/{appId}/dashboard"), true);

  const env = await runCliCapture(["inspect", "env", "--json"], process.cwd());
  assert.equal(env.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.home" && node.value === "CLAW_HOME"), true);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.hostDisableSocketFallback" && node.value === "CLAW_HOST_DISABLE_SOCKET_FALLBACK"), true);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.hostDisableLegacySocketFallback"), false);

  const packages = await runCliCapture(["inspect", "packages", "--json"], process.cwd());
  assert.equal(packages.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(packages.stdout).data.some((node) => node.kind === "packageName" && node.value === "@clawjs/core"), true);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(packages.stdout).data.some((node) => node.kind === "packageBin" && node.value === "claw"), true);

  const native = await runCliCapture(["inspect", "native", "--json"], process.cwd());
  assert.equal(native.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(native.stdout).data.some((node) => node.kind === "nativeIdentity" && node.id === "clawix.native.bridge.service" && node.value === "clawix-bridge"), true);

  const formats = await runCliCapture(["inspect", "formats", "--json"], process.cwd());
  assert.equal(formats.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(formats.stdout).data.some((node) => node.kind === "fileFormat" && node.value === ".clawbackup"), true);

  const protocols = await runCliCapture(["inspect", "protocols", "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string }>>(protocols.stdout).data.some((node) => node.id === "claw.protocol.hostCommand.v1" && node.kind === "protocol"), true);

  const ids = await runCliCapture(["inspect", "ids", "--json"], process.cwd());
  assert.equal(ids.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(ids.stdout).data.some((node) => node.id === "claw.id.session" && node.value === "sessionId"), true);

  const cli = await runCliCapture(["inspect", "cli", "--json"], process.cwd());
  assert.equal(cli.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(cli.stdout).data.some((node) => node.id === "claw.cli.command.inspect" && node.value === "inspect"), true);

  const surfaces = await runCliCapture(["inspect", "surfaces", "--json"], process.cwd());
  assert.equal(surfaces.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; humanSurfaces?: string[]; programmaticSurfaces?: string[] }>>(surfaces.stdout).data.some((node) => node.id === "claw.contracts" && node.humanSurfaces?.includes("humanUi") && node.programmaticSurfaces?.includes("cli")), true);
});

test("runCli exposes CLI aliases and decision sources through inspect", async () => {
  const commands = await runCliCapture(["inspect", "commands", "--json"], process.cwd());
  assert.equal(commands.code, CLI_EXIT_OK);
  const commandPayload = parseCliJson<{ commands: Array<{ name: string; usage?: string; support: { state: string }; securityPolicy: string; source?: { file: string; symbol: string } }> }>(commands.stdout).data;
  assert.equal(commandPayload.commands.some((entry) => entry.name === "host" && entry.support.state === "host_required" && entry.securityPolicy === "signed_host_broker"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "apps" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "design" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "agents" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "personalities" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "skill-collections" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "connections" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "providers" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "mcp" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "snippets" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "audio" && entry.support.state === "supported" && entry.securityPolicy === "local_write"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "calendar" && entry.support.state === "supported" && entry.securityPolicy === "local_write" && entry.usage === "calendar create|list|get|update|delete" && entry.source?.symbol === "runV1DataCli"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "content" && entry.support.state === "supported" && entry.securityPolicy === "local_write" && entry.usage === "content brand|destination|campaign|entry|approval|publish" && entry.source?.symbol === "runDelegatedContentCli"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "marketplace" && entry.support.state === "supported" && entry.securityPolicy === "local_write" && entry.usage === "marketplace choice upsert|list|get|delete" && entry.source?.symbol === "runV1DataCli"), true);
  assert.equal(commandPayload.commands.some((entry) => entry.name === "images" && entry.support.state === "cost_risk"), true);

  const advancedCommands = await runCliCapture(["inspect", "commands", "--all=true", "--json"], process.cwd());
  assert.equal(advancedCommands.code, CLI_EXIT_OK);
  const advancedCommandPayload = parseCliJson<{ commands: Array<{ name: string; usage?: string; support: { state: string }; securityPolicy: string; source?: { file: string; symbol: string } }> }>(advancedCommands.stdout).data;
  assert.equal(advancedCommandPayload.commands.some((entry) => entry.name === "iot" && entry.support.state === "supported" && entry.securityPolicy === "local_write" && entry.usage === "iot config|serve|homes|things|state|lights|climate|scenes|automations|approvals" && entry.source?.symbol === "runDelegatedIotCli"), true);

  const aliases = await runCliCapture(["inspect", "aliases", "--json"], process.cwd());
  assert.equal(aliases.code, CLI_EXIT_OK);
  const aliasPayload = parseCliJson<{ aliases: Array<{ alias: string; canonicalName: string; source: string; shadowedByCommand?: string }> }>(aliases.stdout).data;
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "db" && entry.canonicalName === "database"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "image" && entry.canonicalName === "images"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "lead" && entry.canonicalName === "leads" && entry.source === "collection"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "sessions" && entry.canonicalName === "agent_sessions" && entry.shadowedByCommand === "sessions"), true);

  const why = await runCliCapture(["inspect", "why", "host", "--json"], process.cwd());
  assert.equal(why.code, CLI_EXIT_OK);
  const whyEnvelope = parseCliJson<{ name: string; adrs: string[]; docs: string[]; tests: string[]; source: { file: string } }>(why.stdout);
  assert.equal(whyEnvelope.meta.subcommand, "why");
  const whyPayload = whyEnvelope.data;
  assert.equal(whyPayload.name, "host");
  assert.equal(whyPayload.adrs.includes("docs/adr/0007-cli-agent-interface.md"), true);
  assert.equal(whyPayload.docs.includes("docs/cli.md"), true);
  assert.equal(whyPayload.tests.includes("packages/clawjs/src/index.test.ts"), true);
  assert.equal(whyPayload.source.file, "packages/clawjs/src/cli-host-command.ts");
});

test("runCli exposes the generated codebase manifest through inspect", async () => {
  const codebase = await runCliCapture(["inspect", "codebase", "--json"], process.cwd());
  assert.equal(codebase.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    schemaVersion: number;
    astCoverage: { typescript: string; javascript: string; swift: string };
    summary: { files: number; languages: { typescript: number; javascript: number; swift: number } };
    files: Array<{ path: string; declarations: Array<{ name: string }> }>;
  }>(codebase.stdout).data;
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.astCoverage.typescript, "typescript-compiler-api");
  assert.equal(payload.astCoverage.javascript, "typescript-compiler-api");
  assert.equal(payload.summary.files > 0, true);
  assert.equal(payload.summary.languages.typescript > 0, true);
  assert.equal(payload.files.some((file) => file.path === "packages/clawjs/src/inspect-cli.ts" && file.declarations.some((entry) => entry.name === "runInspectCli")), true);
});

test("runCli can summarize and filter the codebase manifest through inspect", async () => {
  const summary = await runCliCapture(["inspect", "codebase", "--summary", "--json"], process.cwd());
  assert.equal(summary.code, CLI_EXIT_OK);
  const summaryPayload = parseCliJson<{
    summary: { files: number };
    files?: unknown[];
  }>(summary.stdout).data;
  assert.equal(summaryPayload.summary.files > 0, true);
  assert.equal("files" in summaryPayload, false);

  const filtered = await runCliCapture([
    "inspect",
    "codebase",
    "--path-prefix",
    "packages/clawjs/src/",
    "--symbol",
    "runInspectCli",
    "--language",
    "typescript",
    "--tests",
    "false",
    "--limit",
    "5",
    "--json",
  ], process.cwd());
  assert.equal(filtered.code, CLI_EXIT_OK);
  const filteredPayload = parseCliJson<{
    filter: { pathPrefix: string; symbol: string; language: string; tests: boolean; limit: number; totalMatched: number; returned: number };
    files: Array<{ path: string; language: string; test: boolean; declarations: Array<{ name: string }> }>;
  }>(filtered.stdout).data;
  assert.equal(filteredPayload.filter.pathPrefix, "packages/clawjs/src/");
  assert.equal(filteredPayload.filter.symbol, "runInspectCli");
  assert.equal(filteredPayload.filter.language, "typescript");
  assert.equal(filteredPayload.filter.tests, false);
  assert.equal(filteredPayload.filter.limit, 5);
  assert.equal(filteredPayload.files.length <= 5, true);
  assert.equal(filteredPayload.files.some((file) => file.path === "packages/clawjs/src/inspect-cli.ts" && file.declarations.some((entry) => entry.name === "runInspectCli")), true);
  assert.equal(filteredPayload.files.every((file) => file.path.startsWith("packages/clawjs/src/") && file.language === "typescript" && file.test === false), true);
});

test("runCli fuses multiple codebase manifests through inspect", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-codebase-"));
  const frameworkManifestPath = path.join(tempRoot, "clawjs-codebase.json");
  const hostManifestPath = path.join(tempRoot, "clawix-codebase.json");
  fs.writeFileSync(frameworkManifestPath, JSON.stringify({
    schemaVersion: 1,
    repository: "ClawJS",
    root: ".",
    scope: "repository",
    astCoverage: { typescript: "typescript-compiler-api" },
    summary: {
      files: 1,
      tests: 0,
      entrypoints: 1,
      languages: { typescript: 1, javascript: 0, swift: 0 },
    },
    files: [{
      path: "packages/clawjs/src/inspect-cli.ts",
      language: "typescript",
      declarations: [{ kind: "function", name: "runInspectCli", exported: true }],
    }],
  }), "utf8");
  fs.writeFileSync(hostManifestPath, JSON.stringify({
    schemaVersion: 1,
    repository: "Clawix",
    root: ".",
    scope: "repository",
    astCoverage: { swift: "structural-regex" },
    summary: {
      files: 1,
      tests: 1,
      entrypoints: 0,
      languages: { typescript: 0, javascript: 0, swift: 1 },
    },
    files: [{
      path: "macos/Sources/Clawix/AppState.swift",
      language: "swift",
      declarations: [{ kind: "class", name: "AppState", exported: false }],
    }],
  }), "utf8");

  const codebase = await runCliCapture(["inspect", "codebase", "--codebase-manifest", `${frameworkManifestPath},${hostManifestPath}`, "--json"], process.cwd());
  assert.equal(codebase.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    scope: string;
    summary: { files: number; tests: number; entrypoints: number; languages: { typescript: number; swift: number } };
    manifests: Array<{ repository: string; manifestPath: string }>;
    files: Array<{ repository: string; manifestPath: string; path: string }>;
  }>(codebase.stdout).data;
  assert.equal(payload.scope, "workspace");
  assert.deepEqual(payload.summary, {
    files: 2,
    tests: 1,
    entrypoints: 1,
    languages: { typescript: 1, javascript: 0, swift: 1 },
  });
  assert.equal(payload.manifests.some((entry) => entry.repository === "Clawix" && entry.manifestPath === hostManifestPath), true);
  assert.equal(payload.files.some((file) => file.repository === "Clawix" && file.path === "macos/Sources/Clawix/AppState.swift"), true);
});

test("runCli exposes connector catalog support and external schema coverage through inspect", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-connectors-"));
  const catalogPath = path.join(tempRoot, "connectors.json");
  fs.writeFileSync(catalogPath, JSON.stringify({
    version: 1,
    apps: [{
      id: "chat_service",
      name: "Chat Service",
      authFieldNames: ["token"],
      operations: [{
        id: "chat_service.action.send-message",
        kind: "action",
        name: "Send Message",
        authFieldNames: ["token"],
        support: {
          state: "supported",
          reason: "Covered by offline fixtures.",
        },
        externalSchema: {
          status: "complete",
          source: "https://api.example.invalid/openapi.json",
          providerVersion: "2026-05-14",
          evidence: ["packages/clawjs/src/inspect-cli.test.ts"],
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
        executionPolicy: {
          readOnly: false,
          requiresAuth: true,
          requiresHostApproval: false,
          destructive: false,
          costRisk: false,
          dryRunSupported: true,
          auditRequired: true,
        },
        runtime: {
          hasRun: true,
          hasHooks: false,
          hasAdditionalProps: false,
          hasMethods: false,
        },
      }],
    }],
  }), "utf8");

  const connectors = await runCliCapture(["inspect", "connectors", "--connector-catalog", catalogPath, "--json"], process.cwd());
  assert.equal(connectors.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    controlPlane: { publicSurface: string; discoveryAlias: string; pipeline: string[]; blockByDefault: boolean };
    summary: { apps: number; operations: number; supportedOperations: number; completeExternalSchemas: number; authRequiredOperations: number; controlPlaneReadyOperations: number };
    apps: Array<{ id: string; operations: Array<{ id: string; externalSchema: { status: string; hasInputSchema: boolean; hasOutputSchema: boolean }; controlPlane: { state: string; issues: string[] } }> }>;
  }>(connectors.stdout).data;
  assert.deepEqual(payload.summary, {
    apps: 1,
    operations: 1,
    supportedOperations: 1,
    completeExternalSchemas: 1,
    authRequiredOperations: 1,
    hostRequiredOperations: 0,
    costRiskOperations: 0,
    controlPlaneReadyOperations: 1,
    controlPlaneBlockedOperations: 0,
    operationsMissingAuditPolicy: 0,
    operationsMissingCredentialScope: 0,
    operationsMissingRuntimeEvidence: 0,
  });
  assert.equal(payload.controlPlane.publicSurface, "connectors");
  assert.equal(payload.controlPlane.discoveryAlias, "integrations");
  assert.equal(payload.controlPlane.blockByDefault, true);
  assert.equal(payload.controlPlane.pipeline.includes("credential_broker_lease"), true);
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.status, "complete");
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.hasInputSchema, true);
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.hasOutputSchema, true);
  assert.equal(payload.apps[0]?.operations[0]?.controlPlane.state, "ready");
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
        id: "clawix.protocol.bridge.v1",
        kind: "protocol",
        owner: "clawix",
        repo: "Clawix",
        project: "core",
        language: "swift",
        name: "Clawix bridge protocol",
        value: "clawix-bridge-v1",
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
  const payload = parseCliJson<{ language?: string; path?: string }>(show.stdout).data;
  assert.equal(payload.language, "swift");
  assert.equal(payload.path, "~/Library/Application Support/Clawix/clawix.sqlite");

  const listed = await runCliCapture(["inspect", "list", "clawix.database.local", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(listed.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string }>>(listed.stdout).data[0].id, "clawix.database.local.table.projects");

  const protocols = await runCliCapture(["inspect", "protocols", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string }>>(protocols.stdout).data.some((node) => node.id === "clawix.protocol.bridge.v1"), true);
});

test("runCli returns inspect JSON errors in the common envelope", async () => {
  const result = await runCliCapture(["inspect", "show", "missing.surface", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "inspect_not_found");
  assert.equal(payload.meta.canonicalCommand, "inspect");
  assert.equal(payload.meta.subcommand, "show");
});
