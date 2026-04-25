import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { once } from "events";

import Database from "better-sqlite3";
import { createClaw, saveAuthStore } from "@clawjs/claw";
import { buildTimeApp } from "../../../time/src/server/app.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CLI_USAGE, runCli } from "./index.ts";

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

function runCommand(command: string, args: string[], options: { cwd: string }): string {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
}

function packWorkspacePackage(packageDir: string, packDir: string): string {
  const tarballName = runCommand("npm", ["pack", "--pack-destination", packDir], { cwd: packageDir }).trim().split("\n").pop() ?? "";
  return path.join(packDir, tarballName);
}

function runInstalledClaw(binPath: string, cwd: string, args: string[]): string {
  return execFileSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function runInstalledClawProcess(binPath: string, cwd: string, args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(result.status, 0, result.stderr);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function createFakeVaultCliServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/v1/secret-types") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        types: [{
          typeId: "npm.token",
          label: "NPM token",
          description: "Token for npm registry brokered checks.",
          kind: "npm_token",
          defaultAllowedHosts: ["registry.npmjs.org"],
          defaultAllowedHeaderNames: ["Authorization"],
          defaultAllowInURL: false,
          defaultAllowInRequestBody: false,
          defaultAllowLocalNetwork: false,
          defaultReadOnly: true,
          defaultLeaseModes: ["process"],
          defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
          fields: [],
          actions: [{ id: "npm.whoami", label: "Who am I", description: "Call the npm registry identity endpoint.", capability: "broker.http", method: "GET" }],
        }],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secrets: [{
          secretName: "npm_token_main",
          name: "npm_token_main",
          typeId: "npm.token",
          kind: "npm_token",
          allowedHosts: ["registry.npmjs.org"],
          allowedHeaderNames: ["Authorization"],
          readOnly: true,
          allowInURL: false,
          allowInRequestBody: false,
          allowLocalNetwork: false,
          updatedAt: "2026-04-14T00:00:00.000Z",
        }],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets/npm_token_main/capabilities") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secret: { secretName: "npm_token_main", typeId: "npm.token" },
        capabilities: [
          { capability: "metadata.read", allowed: true },
          { capability: "broker.http", allowed: true },
        ],
      }));
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7KJcsAAAAASUVORK5CYII=";

async function createFakeOpenAIImageCliServer() {
  const requests: Array<{ pathname: string; body: Record<string, unknown> }> = [];
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      requests.push({ pathname: url.pathname, body });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: `imgreq-${requests.length}`,
        data: [{ b64_json: ONE_PIXEL_PNG, revised_prompt: String(body.prompt ?? "") }],
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  const info = address as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${info.port}/v1`,
    requests,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function createFakeOpenClawToolchain(): { binDir: string; openclawLog: string; npmLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-bin-"));
  const openclawLog = path.join(binDir, "openclaw.log");
  const npmLog = path.join(binDir, "npm.log");
  const openclawPath = path.join(binDir, "openclaw");
  const npmPath = path.join(binDir, "npm");

  fs.writeFileSync(openclawPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "--version" ]; then
  echo "openclaw ${"${FAKE_OPENCLAW_VERSION:-1.2.3}"}"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "${"${FAKE_OPENCLAW_MODELS_STATUS:-{}}"}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "${"${FAKE_OPENCLAW_AGENTS_LIST:-[]}"}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  echo "ok"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  if [ "${"${FAKE_OPENCLAW_GATEWAY_CALL:-ok}"}" = "fail" ]; then
    echo "gateway unavailable" 1>&2
    exit 1
  fi
  echo "{}"
  exit 0
fi
if [ "$1" = "memory" ]; then
  if [ -n "$FAKE_OPENCLAW_MEMORY_SEARCH" ]; then
    printf "%s\n" "$FAKE_OPENCLAW_MEMORY_SEARCH"
  else
    printf "%s\n" '{"results":[]}'
  fi
  exit 0
fi
if [ "$1" = "agent" ]; then
  echo "{\\"result\\":{\\"payloads\\":[{\\"text\\":\\"${"${FAKE_OPENCLAW_AGENT_TEXT:-hello from cli}"}\\"}]}}"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(npmPath, `#!/bin/sh
echo "$@" >> "${npmLog}"
exit 0
`, { mode: 0o755 });

  return { binDir, openclawLog, npmLog };
}

function createFakeSkillSourceToolchain(): { binDir: string; clawhubLog: string; npxLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-sources-bin-"));
  const clawhubLog = path.join(binDir, "clawhub.log");
  const npxLog = path.join(binDir, "npx.log");
  const clawhubPath = path.join(binDir, "clawhub");
  const npxPath = path.join(binDir, "npx");

  fs.writeFileSync(clawhubPath, `#!/bin/sh
echo "$@" >> "${clawhubLog}"
if [ "$1" = "--help" ]; then
  echo "clawhub"
  exit 0
fi
if [ "$1" = "search" ]; then
  if [ -n "$FAKE_CLAWHUB_SEARCH_JSON" ]; then
    printf "%s\\n" "$FAKE_CLAWHUB_SEARCH_JSON"
  else
    printf "%s\\n" "[]"
  fi
  exit 0
fi
if [ "$1" = "install" ]; then
  slug="$2"
  mkdir -p "$PWD/skills/$slug"
  printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(npxPath, `#!/bin/sh
echo "$@" >> "${npxLog}"
if [ "$1" = "--help" ]; then
  echo "npx"
  exit 0
fi
if [ "$1" = "--yes" ] && [ "$2" = "clawhub" ]; then
  shift 2
  echo "$@" >> "${clawhubLog}"
  if [ "$1" = "search" ]; then
    if [ -n "$FAKE_CLAWHUB_SEARCH_JSON" ]; then
      printf "%s\\n" "$FAKE_CLAWHUB_SEARCH_JSON"
    else
      printf "%s\\n" "[]"
    fi
    exit 0
  fi
  if [ "$1" = "install" ]; then
    slug="$2"
    mkdir -p "$PWD/skills/$slug"
    printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
    exit 0
  fi
  exit 0
fi
if [ "$1" = "--yes" ] && [ "$2" = "skills" ] && [ "$3" = "add" ]; then
  ref="$4"
  if [ "${"${FAKE_SKILLS_ADD_CREATE:-0}"}" = "1" ]; then
    slug=$(basename "$ref")
    slug=${"${slug%.git}"}
    mkdir -p "$PWD/skills/$slug"
    printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
  fi
  echo "ok"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  return { binDir, clawhubLog, npxLog };
}

function createFakeTelegramSecretsProxy(): { proxyPath: string; statePath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-proxy-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    webhookUrl: "",
    commands: [],
    updates: [{
      update_id: 11,
      message: {
        message_id: 21,
        text: "hello telegram",
        chat: {
          id: 1001,
          type: "private",
          username: "alice",
          first_name: "Alice",
        },
      },
    }],
  }, null, 2));
  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const statePath = process.env.FAKE_TELEGRAM_PROXY_STATE;
const secrets = [{
  name: "telegram_support_bot_token",
  allowedHosts: ["api.telegram.org"],
  allowedHeaderNames: [],
  readOnly: false,
  allowInURL: true,
  allowInRequestBody: false,
  allowInsecureTransport: false,
  allowLocalNetwork: false
}];
if (args[0] === "list-secrets") {
  process.stdout.write(JSON.stringify(secrets));
  process.exit(0);
}
if (args[0] === "describe-secret") {
  const name = readFlag("--name");
  process.stdout.write(JSON.stringify(secrets.filter((entry) => entry.name === name)));
  process.exit(0);
}
const url = readFlag("--url") || "";
const body = JSON.parse(readFlag("--body") || "{}");
const method = url.split("/").pop();
const tokenMatch = url.match(/\\/bot([^/]+)\\//);
const token = tokenMatch ? tokenMatch[1] : "";
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let result;
switch (method) {
  case "getMe":
    result = { id: 42, is_bot: true, username: "claw_support_bot", first_name: "Claw Support" };
    break;
  case "setWebhook":
    state.webhookUrl = body.url || "";
    result = true;
    break;
  case "getWebhookInfo":
    result = { url: state.webhookUrl || "", pending_update_count: 0 };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    result = true;
    break;
  case "getUpdates": {
    const offset = typeof body.offset === "number" ? body.offset : 0;
    const updates = (state.updates || []).filter((entry) => entry.update_id >= offset);
    const limited = typeof body.limit === "number" ? updates.slice(0, body.limit) : updates;
    state.updates = (state.updates || []).filter((entry) => !limited.some((selected) => selected.update_id === entry.update_id));
    result = limited;
    break;
  }
  case "sendMessage":
    state.lastSend = body;
    state.lastSendToken = token;
    result = { message_id: 91, chat: { id: body.chat_id, type: "private" }, text: body.text };
    break;
  case "setMyCommands":
    state.commands = body.commands || [];
    result = true;
    break;
  case "getMyCommands":
    result = state.commands || [];
    break;
  default:
    result = true;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

function createFakeGenerationScript(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generation-bin-"));
  const scriptPath = path.join(binDir, "fake-generate");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex === -1 || !args[outIndex + 1]) {
  console.error("missing --out");
  process.exit(1);
}
const outputPath = args[outIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, "cli-artifact");
`, { mode: 0o755 });
  return scriptPath;
}

function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-skill-"));
  const skillsDir = path.join(root, "skills");
  const skillDir = path.join(skillsDir, "openai-image-gen");
  const scriptDir = path.join(skillDir, "scripts");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: openai-image-gen\ndescription: test skill\n---\n");
  fs.writeFileSync(path.join(scriptDir, "gen.py"), "print('stub')\n");
  fs.writeFileSync(path.join(binDir, "python3"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outDirIndex = args.indexOf("--out-dir");
if (outDirIndex === -1 || !args[outDirIndex + 1]) {
  console.error("missing --out-dir");
  process.exit(1);
}
const outDir = args[outDirIndex + 1];
const modelIndex = args.indexOf("--model");
const model = modelIndex === -1 ? "" : args[modelIndex + 1];
const formatIndex = args.indexOf("--output-format");
const format = formatIndex === -1 ? "png" : args[formatIndex + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "001-generated." + format), "cli-openclaw:" + model);
`, { mode: 0o755 });
  return { skillsDir, binDir };
}

async function withPatchedEnv<TValue>(
  patch: NodeJS.ProcessEnv,
  fn: () => Promise<TValue>,
): Promise<TValue> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local test server address");
  }
  return address.port;
}

test("runCli prints usage for unsupported commands", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["unknown"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_USAGE);
  assert.match(stderr.getOutput(), /Usage/);
});

test("runCli prints help and exits successfully", async () => {
  const stdout = captureStream();
  const exitCode = await runCli(["--help"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CLI_USAGE);
  assert.match(stdout.getOutput(), /Primary workflow:/);
  assert.match(stdout.getOutput(), /db <collection> <title>/);
});

test("runCli prints db-specific help and database admin help", async () => {
  const dbStdout = captureStream();
  assert.equal(await runCli(["db", "--help"], {
    stdout: dbStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(dbStdout.getOutput(), /Magic database commands:/);
  assert.match(dbStdout.getOutput(), /db <collection> schema/);

  const adminStdout = captureStream();
  assert.equal(await runCli(["database", "--help"], {
    stdout: adminStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(adminStdout.getOutput(), /Advanced database admin commands:/);
  assert.match(adminStdout.getOutput(), /Use `claw db \.\.\.` for local-first CRUD/);
});

test("runCli supports implicit db create, schema inspection, human output, and alias parity", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-magic-db-"));

  const createStdout = captureStream();
  const createStderr = captureStream();
  assert.equal(await runCli(["db", "task", "Comprar leche"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(createStderr.getOutput(), /Using local database for this project/);
  assert.match(createStdout.getOutput(), /Created task (\S+) "Comprar leche"/);
  const taskId = createStdout.getOutput().match(/Created task (\S+) "Comprar leche"/)?.[1] ?? "";
  assert.ok(taskId);

  const listStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "list"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(taskId));

  const getStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "get", taskId], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(getStdout.getOutput(), /title: Comprar leche/);
  assert.match(getStdout.getOutput(), /status: todo/);

  const emptyStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "list"], {
    stdout: emptyStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(emptyStdout.getOutput(), /No leads yet/);
  assert.match(emptyStdout.getOutput(), /Try: claw db lead "First lead"/);

  const leadStdout = captureStream();
  const leadStderr = captureStream();
  assert.equal(await runCli(["db", "leads", "--set", "name=Ada", "--set", "website=https://ada.dev"], {
    stdout: leadStdout.stream,
    stderr: leadStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(leadStderr.getOutput(), /Created collection "leads"/);
  assert.match(leadStderr.getOutput(), /Mapped "name" to "title"/);
  assert.match(leadStdout.getOutput(), /Created lead \S+ "Ada"/);

  const schemaStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "schema"], {
    stdout: schemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(schemaStdout.getOutput(), /collection: leads/);
  assert.match(schemaStdout.getOutput(), /protected: no/);

  const aliasStdout = captureStream();
  assert.equal(await runCli(["tasks", "create", "Alias task"], {
    stdout: aliasStdout.stream,
    stderr: captureStream().stream,
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-magic-db-alias-")),
  }), CLI_EXIT_OK);
  assert.match(aliasStdout.getOutput(), /\S+/);
});

test("runCli can scaffold a workspace-first project with the new command surface", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-workspace-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "workspace", "demo-workspace", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"type": "workspace"/);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-workspace");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.type, "workspace");
  assert.equal(projectConfig.directories.skills, "claw/skills");
});

test("runCli can manage command-backed generations end to end", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generations-"));
  const scriptPath = createFakeGenerationScript();

  const registerStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "register-command",
    "--workspace", workspaceDir,
    "--id", "fake-image",
    "--label", "Fake Image",
    "--kinds", "image",
    "--command", scriptPath,
    "--args-json", "[\"--out\",\"{outputPath}\"]",
    "--ext", "png",
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"id": "fake-image"/);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "create",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--backend", "fake-image",
    "--prompt", "sunset over water",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  const created = JSON.parse(createStdout.getOutput()) as { id: string; output?: { filePath?: string } };
  assert.match(created.id, /^gen-/);
  assert.equal(fs.existsSync(created.output?.filePath || ""), true);

  const listStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "list",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"kind": "image"/);

  const readStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "read",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), new RegExp(created.id));

  const deleteStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "delete",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(deleteStdout.getOutput(), /"removed": true/);
});

test("runCli can create and list images through the image alias and an auto-detected OpenClaw skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-generations-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const backendsStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "backends",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: backendsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(backendsStdout.getOutput(), /openclaw-skill:openai-image-gen/);

    const createStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "generate",
      "--workspace", workspaceDir,
      "--prompt", "editorial lobster portrait",
      "--model", "gpt-image-1.5",
      "--output-format", "webp",
      "--json",
    ], {
      stdout: createStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);

    const created = JSON.parse(createStdout.getOutput()) as { backendId: string; output?: { filePath?: string } };
    assert.equal(created.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(fs.existsSync(created.output?.filePath || ""), true);
    assert.match(fs.readFileSync(created.output?.filePath || "", "utf8"), /cli-openclaw:gpt-image-1.5/);

    const listStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "list",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"backendId": "openclaw-skill:openai-image-gen"/);
  });
});

test("runCli supports native image create, edit, import, list, and show", async () => {
  const server = await createFakeOpenAIImageCliServer();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-workspace-"));
  const imageLibrary = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-library-"));
  const codexImagePath = path.join(workspaceDir, "codex.png");
  fs.writeFileSync(codexImagePath, Buffer.from(ONE_PIXEL_PNG, "base64"));

  try {
    await withPatchedEnv({ OPENAI_API_KEY: "test-key" }, async () => {
      const createStdout = captureStream();
      const createStderr = captureStream();
      assert.equal(await runCli([
        "image",
        "create",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--prompt", "library logo",
        "--type", "logo",
        "--tags", "brand,library",
        "--json",
      ], {
        stdout: createStdout.stream,
        stderr: createStderr.stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK, `${createStdout.getOutput()}\n${createStderr.getOutput()}`);
      const created = JSON.parse(createStdout.getOutput()) as { id: string; operation: string; imageType: string };
      assert.equal(created.operation, "create");
      assert.equal(created.imageType, "logo");

      const editStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "edit",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--id", created.id,
        "--prompt", "make the logo monochrome",
        "--json",
      ], {
        stdout: editStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const edited = JSON.parse(editStdout.getOutput()) as { id: string; parentId: string; editDepth: number };
      assert.equal(edited.parentId, created.id);
      assert.equal(edited.editDepth, 1);

      const importStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "import",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--file", codexImagePath,
        "--prompt", "Codex generated brand variant",
        "--provenance", "imported-codex",
        "--external-generator", "codex",
        "--type", "logo",
        "--parent-id", edited.id,
        "--tags", "codex,brand",
        "--json",
      ], {
        stdout: importStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const imported = JSON.parse(importStdout.getOutput()) as { id: string; provenance: string; parentId: string };
      assert.equal(imported.provenance, "imported-codex");
      assert.equal(imported.parentId, edited.id);

      const listStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "list",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--query", "codex",
        "--json",
      ], {
        stdout: listStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(listStdout.getOutput(), /imported-codex/);

      const showStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "show",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--id", imported.id,
        "--json",
      ], {
        stdout: showStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(showStdout.getOutput(), /Codex generated brand variant/);
    });
    assert.deepEqual(server.requests.map((entry) => entry.pathname), ["/v1/images/generations", "/v1/images/edits"]);
  } finally {
    await server.close();
  }
});

test("runCli generate, add, and info operate on claw projects", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generate-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");

  const generateStdout = captureStream();
  assert.equal(await runCli(["generate", "skill", "search-intents", "--project", projectRoot, "--json"], {
    stdout: generateStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(generateStdout.getOutput(), /"resource": "skill"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "skills", "search-intents.ts")), true);

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "telegram", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "telegram"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "channels", "telegram.json")), true);

  const infoStdout = captureStream();
  assert.equal(await runCli(["info", "--project", projectRoot, "--json"], {
    stdout: infoStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(infoStdout.getOutput(), /"projectRoot"/);
  assert.match(infoStdout.getOutput(), /"type": "workspace"/);

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.resources.skills[0].id, "search-intents");
  assert.equal(projectConfig.resources.channels[0].id, "telegram");
});

test("runCli add workspace and workspace command groups operate on local productivity data", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const installCalls: string[] = [];

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "workspace", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    runCommand: async (command, args) => {
      installCalls.push(`${command} ${args.join(" ")}`);
    },
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "workspace"/);
  assert.match(installCalls.join("\n"), /@clawjs\/workspace/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.ok(packageJson.dependencies?.["@clawjs/workspace"]);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Ship workspace",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  const createdTask = JSON.parse(createStdout.getOutput()) as { id: string };

  const listStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(createdTask.id));

  const searchStdout = captureStream();
  assert.equal(await runCli([
    "workspace-search",
    "query",
    "workspace",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(searchStdout.getOutput(), /"domain": "tasks"/);
});

test("runCli zero-config productivity commands bootstrap local sqlite in an empty directory", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-productivity-zero-config-"));

  const magicTaskStdout = captureStream();
  const magicTaskStderr = captureStream();
  assert.equal(await runCli([
    "db",
    "task",
    "Ship CLI",
  ], {
    stdout: magicTaskStdout.stream,
    stderr: magicTaskStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(magicTaskStdout.getOutput(), /Created task (\S+) "Ship CLI"/);
  assert.match(magicTaskStderr.getOutput(), /Using local database for this project/);
  const taskId = magicTaskStdout.getOutput().match(/Created task (\S+) "Ship CLI"/)?.[1] ?? "";
  assert.ok(taskId);

  const magicLeadStdout = captureStream();
  assert.equal(await runCli([
    "db",
    "leads",
    "--set", "name=Ada",
    "--set", "website=https://ada.dev",
    "--json",
  ], {
    stdout: magicLeadStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const lead = JSON.parse(magicLeadStdout.getOutput()) as { title: string; metadata?: { website?: string } };
  assert.equal(lead.title, "Ada");
  assert.equal(lead.metadata?.website, "https://ada.dev");

  const magicAliasStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Alias task",
    "--json",
  ], {
    stdout: magicAliasStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const aliasTask = JSON.parse(magicAliasStdout.getOutput()) as { id: string; title: string };
  assert.equal(aliasTask.title, "Alias task");

  const magicTasksListStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--json",
  ], {
    stdout: magicTasksListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const tasksList = JSON.parse(magicTasksListStdout.getOutput()) as Array<{ id: string }>;
  assert.equal(tasksList.some((item) => item.id === taskId), true);
  assert.equal(tasksList.some((item) => item.id === aliasTask.id), true);

  const magicSchemaStdout = captureStream();
  assert.equal(await runCli([
    "db",
    "leads",
    "schema",
    "--json",
  ], {
    stdout: magicSchemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const schema = JSON.parse(magicSchemaStdout.getOutput()) as { exists: boolean; collection: { name: string; fields: Array<{ name: string }> } };
  assert.equal(schema.exists, true);
  assert.equal(schema.collection.name, "leads");
  assert.equal(schema.collection.fields.some((field) => field.name === "title"), true);

  const magicWorkspaceSearchStdout = captureStream();
  assert.equal(await runCli([
    "workspace-search",
    "query",
    "Ship",
    "--domains", "tasks,people,notes,events",
    "--json",
  ], {
    stdout: magicWorkspaceSearchStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(magicWorkspaceSearchStdout.getOutput(), /"domain": "tasks"/);

  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "data", "database.sqlite")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "data", "productivity.sqlite")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "workspace.manifest.json")), false);

  const areaStdout = captureStream();
  assert.equal(await runCli([
    "areas",
    "create",
    "Platform",
    "--status", "active",
    "--json",
  ], {
    stdout: areaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const area = JSON.parse(areaStdout.getOutput()) as { id: string; status?: string };
  assert.equal(area.status, "active");

  const personStdout = captureStream();
  assert.equal(await runCli([
    "people",
    "upsert",
    "Alice Example",
    "--email", "alice@example.com",
    "--json",
  ], {
    stdout: personStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const person = JSON.parse(personStdout.getOutput()) as { id: string };

  const projectStdout = captureStream();
  assert.equal(await runCli([
    "projects",
    "create",
    "Workspace Core",
    "--status", "in_progress",
    "--area-id", area.id,
    "--owner-person-id", person.id,
    "--json",
  ], {
    stdout: projectStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const project = JSON.parse(projectStdout.getOutput()) as { id: string; ownerPersonId?: string; areaId?: string };
  assert.equal(project.ownerPersonId, person.id);
  assert.equal(project.areaId, area.id);

  const goalStdout = captureStream();
  assert.equal(await runCli([
    "goals",
    "create",
    "Ship zero-config productivity",
    "--status", "active",
    "--area-id", area.id,
    "--project-id", project.id,
    "--owner-person-id", person.id,
    "--metric-key", "cli_crud",
    "--review-cadence", "weekly",
    "--target-value", "1",
    "--json",
  ], {
    stdout: goalStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const goal = JSON.parse(goalStdout.getOutput()) as { id: string; projectId?: string; areaId?: string; reviewCadence?: string };
  assert.equal(goal.projectId, project.id);
  assert.equal(goal.areaId, area.id);
  assert.equal(goal.reviewCadence, "weekly");

  const milestoneStdout = captureStream();
  assert.equal(await runCli([
    "milestones",
    "create",
    "CLI beta",
    "--status", "active",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--target-date", "2026-04-18T17:00:00.000Z",
    "--json",
  ], {
    stdout: milestoneStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const milestone = JSON.parse(milestoneStdout.getOutput()) as { id: string; projectId?: string; areaId?: string };
  assert.equal(milestone.projectId, project.id);
  assert.equal(milestone.areaId, area.id);

  const taskStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Ship workspace",
    "--status", "blocked",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--estimate-minutes", "45",
    "--blocked-reason", "waiting on release notes",
    "--checklist-json", '[{"text":"cut release"},{"text":"announce beta","completed":true}]',
    "--json",
  ], {
    stdout: taskStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const task = JSON.parse(taskStdout.getOutput()) as {
    id: string;
    status?: string;
    projectId?: string;
    goalId?: string;
    areaId?: string;
    estimateMinutes?: number;
    blockedReason?: string;
    checklist?: Array<{ text: string }>;
  };
  assert.equal(task.projectId, project.id);
  assert.equal(task.goalId, goal.id);
  assert.equal(task.areaId, area.id);
  assert.equal(task.estimateMinutes, 45);
  assert.equal(task.blockedReason, "waiting on release notes");
  assert.equal(task.checklist?.length, 2);

  const blockerStdout = captureStream();
  assert.equal(await runCli([
    "blockers",
    "create",
    "Need product approval",
    "--kind", "policy_block",
    "--task-id", task.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--owner-agent-id", "reviewer",
    "--json",
  ], {
    stdout: blockerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const blocker = JSON.parse(blockerStdout.getOutput()) as { id: string; taskId?: string; kind?: string };
  assert.equal(blocker.taskId, task.id);
  assert.equal(blocker.kind, "policy_block");

  const artifactStdout = captureStream();
  assert.equal(await runCli([
    "artifacts",
    "create",
    "Final screenshot",
    "--kind", "screenshot",
    "--task-id", task.id,
    "--summary", "Hermetic validation screenshot",
    "--json",
  ], {
    stdout: artifactStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const artifact = JSON.parse(artifactStdout.getOutput()) as { id: string; taskId?: string; kind?: string };
  assert.equal(artifact.taskId, task.id);
  assert.equal(artifact.kind, "screenshot");

  const decisionStdout = captureStream();
  assert.equal(await runCli([
    "decisions",
    "create",
    "Keep rollout local-first",
    "--status", "accepted",
    "--task-id", task.id,
    "--project-id", project.id,
    "--artifact-ids", artifact.id,
    "--alternatives", "remote-only,hybrid",
    "--json",
  ], {
    stdout: decisionStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const decision = JSON.parse(decisionStdout.getOutput()) as { id: string; status?: string; artifactIds?: string[] };
  assert.equal(decision.status, "accepted");
  assert.equal(decision.artifactIds?.includes(artifact.id), true);

  const sessionStdout = captureStream();
  assert.equal(await runCli([
    "work-sessions",
    "create",
    "Focus shipping block",
    "--task-ids", task.id,
    "--blocker-ids", blocker.id,
    "--timebox-minutes", "30",
    "--json",
  ], {
    stdout: sessionStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const workSession = JSON.parse(sessionStdout.getOutput()) as { id: string; taskIds?: string[]; blockerIds?: string[]; status?: string };
  assert.equal(workSession.status, "active");
  assert.equal(workSession.taskIds?.includes(task.id), true);
  assert.equal(workSession.blockerIds?.includes(blocker.id), true);

  const assignmentStdout = captureStream();
  assert.equal(await runCli([
    "assignments",
    "create",
    "Reviewer owns release gate",
    "--task-id", task.id,
    "--assigned-to-agent-id", "reviewer",
    "--assigned-by", "planner",
    "--reviewer-agent-id", "lead",
    "--status", "accepted",
    "--json",
  ], {
    stdout: assignmentStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const assignment = JSON.parse(assignmentStdout.getOutput()) as { id: string; taskId?: string; assignedToAgentId?: string; status?: string };
  assert.equal(assignment.taskId, task.id);
  assert.equal(assignment.assignedToAgentId, "reviewer");
  assert.equal(assignment.status, "accepted");

  const handoffStdout = captureStream();
  assert.equal(await runCli([
    "handoffs",
    "create",
    "Pass release validation to reviewer",
    "--task-id", task.id,
    "--from-agent-id", "planner",
    "--to-agent-id", "reviewer",
    "--artifact-ids", artifact.id,
    "--blocker-ids", blocker.id,
    "--objective", "Finish the release gate",
    "--next-step", "Confirm the last blocker is gone",
    "--json",
  ], {
    stdout: handoffStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const handoff = JSON.parse(handoffStdout.getOutput()) as { id: string; taskId?: string; toAgentId?: string; artifactIds?: string[] };
  assert.equal(handoff.taskId, task.id);
  assert.equal(handoff.toAgentId, "reviewer");
  assert.equal(handoff.artifactIds?.includes(artifact.id), true);

  const approvalStdout = captureStream();
  assert.equal(await runCli([
    "approvals",
    "create",
    "Approve publish",
    "--kind", "publish",
    "--task-id", task.id,
    "--handoff-id", handoff.id,
    "--approver-agent-id", "lead",
    "--requested-by-agent-id", "reviewer",
    "--policy-reason", "Publishing requires reviewer sign-off",
    "--evidence-ids", artifact.id,
    "--decision-ids", decision.id,
    "--json",
  ], {
    stdout: approvalStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const approval = JSON.parse(approvalStdout.getOutput()) as { id: string; taskId?: string; kind?: string; status?: string };
  assert.equal(approval.taskId, task.id);
  assert.equal(approval.kind, "publish");
  assert.equal(approval.status, "pending");

  const capacityStdout = captureStream();
  assert.equal(await runCli([
    "capacity",
    "create",
    "Reviewer capacity",
    "--agent-id", "reviewer",
    "--team-id", "release",
    "--max-wip", "2",
    "--current-wip", "1",
    "--queue-depth", "2",
    "--blocked-count", "1",
    "--overdue-count", "0",
    "--json",
  ], {
    stdout: capacityStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const capacity = JSON.parse(capacityStdout.getOutput()) as { id: string; agentId?: string };
  assert.equal(capacity.agentId, "reviewer");

  const reminderStdout = captureStream();
  assert.equal(await runCli([
    "reminders",
    "create",
    "Follow up",
    "--trigger-at", "2026-04-15T09:00:00.000Z",
    "--anchor-type", "task",
    "--anchor-id", task.id,
    "--json",
  ], {
    stdout: reminderStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const reminder = JSON.parse(reminderStdout.getOutput()) as { id: string; anchorId?: string; status?: string };
  assert.equal(reminder.anchorId, task.id);

  const deadlineStdout = captureStream();
  const deadlineStderr = captureStream();
  const deadlineExitCode = await runCli([
    "deadlines",
    "create",
    "Launch date",
    "--due-at", "2026-04-20T18:00:00.000Z",
    "--anchor-type", "project",
    "--anchor-id", project.id,
    "--json",
  ], {
    stdout: deadlineStdout.stream,
    stderr: deadlineStderr.stream,
    cwd: workspaceRoot,
  });
  assert.equal(deadlineExitCode, CLI_EXIT_OK, `${deadlineStdout.getOutput()}\n${deadlineStderr.getOutput()}`);
  const deadline = JSON.parse(deadlineStdout.getOutput()) as { id: string; anchorId?: string };
  assert.equal(deadline.anchorId, project.id);

  const noteStdout = captureStream();
  assert.equal(await runCli([
    "notes",
    "create",
    "Workspace notes",
    "--content", "Zero-config workspace launch checklist",
    "--tags", "workspace,launch",
    "--json",
  ], {
    stdout: noteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const note = JSON.parse(noteStdout.getOutput()) as { id: string };

  const eventStdout = captureStream();
  assert.equal(await runCli([
    "events",
    "create",
    "Launch review",
    "--starts-at", "2026-04-16T10:00:00.000Z",
    "--attendees", person.id,
    "--json",
  ], {
    stdout: eventStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const event = JSON.parse(eventStdout.getOutput()) as { id: string };
  assert.ok(event.id);

  const inboxStdout = captureStream();
  assert.equal(await runCli([
    "inbox",
    "draft",
    "Need update on workspace core",
    "--channel", "email",
    "--participants", person.id,
    "--json",
  ], {
    stdout: inboxStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const thread = JSON.parse(inboxStdout.getOutput()) as { thread: { id: string } };
  assert.ok(thread.thread.id);

  const inboxProcessStdout = captureStream();
  assert.equal(await runCli([
    "inbox",
    "process",
    thread.thread.id,
    "--task-title", "Reply to workspace core thread",
    "--note-title", "Workspace core thread summary",
    "--reminder-title", "Follow up thread",
    "--trigger-at", "2026-04-16T09:30:00.000Z",
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--json",
  ], {
    stdout: inboxProcessStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const processed = JSON.parse(inboxProcessStdout.getOutput()) as {
    thread: { id: string; linkedTaskIds?: string[]; linkedNoteIds?: string[] };
    task?: { id: string };
    note?: { id: string };
    reminder?: { id: string };
  };
  assert.equal(processed.thread.id, thread.thread.id);
  assert.equal(processed.thread.linkedTaskIds?.includes(processed.task?.id || ""), true);
  assert.equal(processed.thread.linkedNoteIds?.includes(processed.note?.id || ""), true);
  assert.ok(processed.reminder?.id);

  const teamWorkStdout = captureStream();
  assert.equal(await runCli([
    "team-work",
    "--json",
  ], {
    stdout: teamWorkStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(teamWorkStdout.getOutput(), /"pendingApprovals":/);
  assert.match(teamWorkStdout.getOutput(), new RegExp(approval.id));

  const myWorkStdout = captureStream();
  assert.equal(await runCli([
    "my-work",
    "--json",
  ], {
    stdout: myWorkStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(myWorkStdout.getOutput(), /"activeBlockers":/);
  assert.match(myWorkStdout.getOutput(), new RegExp(blocker.id));

  const taskMoveStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "move",
    "--ids", task.id,
    "--area-id", area.id,
    "--project-id", project.id,
    "--goal-id", goal.id,
    "--json",
  ], {
    stdout: taskMoveStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(taskMoveStdout.getOutput(), new RegExp(task.id));

  const completeStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "complete",
    task.id,
    "--json",
  ], {
    stdout: completeStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(completeStdout.getOutput(), /"status": "done"/);

  const blockerResolveStdout = captureStream();
  assert.equal(await runCli([
    "blockers",
    "update",
    blocker.id,
    "--status", "resolved",
    "--json",
  ], {
    stdout: blockerResolveStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(blockerResolveStdout.getOutput(), /"status": "resolved"/);

  const workSessionCompleteStdout = captureStream();
  assert.equal(await runCli([
    "work-sessions",
    "complete",
    workSession.id,
    "--outcome", "Focus loop shipped",
    "--json",
  ], {
    stdout: workSessionCompleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(workSessionCompleteStdout.getOutput(), /"status": "completed"/);

  const reviewStdout = captureStream();
  assert.equal(await runCli([
    "review",
    "daily",
    "--json",
  ], {
    stdout: reviewStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(reviewStdout.getOutput(), /"activeProjects":/);
  assert.match(reviewStdout.getOutput(), /"pendingDecisions":/);

  const remindersListStdout = captureStream();
  assert.equal(await runCli([
    "reminders",
    "list",
    "--after", "2026-04-15T00:00:00.000Z",
    "--before", "2026-04-16T00:00:00.000Z",
    "--json",
  ], {
    stdout: remindersListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(remindersListStdout.getOutput(), new RegExp(reminder.id));

  const deadlinesListStdout = captureStream();
  assert.equal(await runCli([
    "deadlines",
    "list",
    "--after", "2026-04-20T00:00:00.000Z",
    "--before", "2026-04-21T00:00:00.000Z",
    "--json",
  ], {
    stdout: deadlinesListStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(deadlinesListStdout.getOutput(), new RegExp(deadline.id));

  const agendaStdout = captureStream();
  assert.equal(await runCli([
    "agenda",
    "--start", "2026-04-15T00:00:00.000Z",
    "--end", "2026-04-21T00:00:00.000Z",
    "--json",
  ], {
    stdout: agendaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(agendaStdout.getOutput(), /"domain": "milestones"/);
  assert.match(agendaStdout.getOutput(), /"domain": "deadlines"/);

  const activityStdout = captureStream();
  assert.equal(await runCli([
    "activity",
    "list",
    "--task-id", task.id,
    "--json",
  ], {
    stdout: activityStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(activityStdout.getOutput(), /Task created/);

  const workspaceSearchStdout = captureStream();
  assert.equal(await runCli([
    "workspace-search",
    "query",
    "workspace",
    "--domains", "tasks,goals,projects,reminders,deadlines,notes,people,inbox,events",
    "--json",
  ], {
    stdout: workspaceSearchStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(workspaceSearchStdout.getOutput(), /"domain": "tasks"/);
  assert.match(workspaceSearchStdout.getOutput(), /"domain": "notes"/);

  const exportStdout = captureStream();
  assert.equal(await runCli([
    "export",
    "snapshot.json",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: exportStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const exported = JSON.parse(exportStdout.getOutput()) as { path: string };
  assert.equal(fs.existsSync(exported.path), true);

  const backupStdout = captureStream();
  assert.equal(await runCli([
    "backup",
    "backups",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: backupStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const backup = JSON.parse(backupStdout.getOutput()) as { files: string[] };
  assert.equal(backup.files.length > 0, true);

  const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-productivity-import-"));
  const importStdout = captureStream();
  assert.equal(await runCli([
    "import",
    exported.path,
    "--replace",
    "--workspace", importRoot,
    "--json",
  ], {
    stdout: importStdout.stream,
    stderr: captureStream().stream,
    cwd: importRoot,
  }), CLI_EXIT_OK);
  assert.match(importStdout.getOutput(), /"areas": 1/);

  const importedAreasStdout = captureStream();
  assert.equal(await runCli([
    "areas",
    "list",
    "--workspace", importRoot,
    "--json",
  ], {
    stdout: importedAreasStdout.stream,
    stderr: captureStream().stream,
    cwd: importRoot,
  }), CLI_EXIT_OK);
  assert.match(importedAreasStdout.getOutput(), /Platform/);

  const inspectStdout = captureStream();
  assert.equal(await runCli([
    "workspace",
    "inspect",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(inspectStdout.getOutput(), /"schemaVersion": 6/);

  const productivityDbPath = path.join(workspaceRoot, ".clawjs", "data", "productivity.sqlite");
  const corruptionDb = new Database(productivityDbPath);
  const corruptedTaskRow = corruptionDb.prepare("SELECT payload_json FROM workspace_records WHERE collection_name = ? AND record_id = ?").get("tasks", task.id) as { payload_json: string };
  const corruptedTask = JSON.parse(corruptedTaskRow.payload_json) as Record<string, unknown>;
  corruptedTask.areaId = "area-missing";
  corruptedTask.dependsOnTaskIds = ["task-missing"];
  corruptionDb.prepare("UPDATE workspace_records SET payload_json = ? WHERE collection_name = ? AND record_id = ?").run(JSON.stringify(corruptedTask), "tasks", task.id);
  corruptionDb.close();

  const repairStdout = captureStream();
  assert.equal(await runCli([
    "workspace",
    "repair",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: repairStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(repairStdout.getOutput(), /"repairedRecords":/);

  const repairedTaskStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "get",
    task.id,
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: repairedTaskStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const repairedTask = JSON.parse(repairedTaskStdout.getOutput()) as { areaId?: string; dependsOnTaskIds: string[] };
  assert.equal(repairedTask.areaId, undefined);
  assert.deepEqual(repairedTask.dependsOnTaskIds, []);

  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "data", "productivity.sqlite")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "workspace.manifest.json")), false);
  assert.ok(note.id);
});

test("published CLI tarballs install with npm and manage local-first productivity zero-config from the real binary", async () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-packages-"));
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-"));
  const packageRoots = {
    core: path.resolve(process.cwd(), "packages/clawjs-core"),
    claw: path.resolve(process.cwd(), "packages/clawjs-node"),
    workspace: path.resolve(process.cwd(), "packages/clawjs-workspace"),
    database: path.resolve(process.cwd(), "packages/clawjs-database"),
    cli: path.resolve(process.cwd(), "packages/clawjs"),
  };

  const tarballs = [
    packWorkspacePackage(packageRoots.core, packDir),
    packWorkspacePackage(packageRoots.claw, packDir),
    packWorkspacePackage(packageRoots.workspace, packDir),
    packWorkspacePackage(packageRoots.database, packDir),
    packWorkspacePackage(packageRoots.cli, packDir),
  ];

  runCommand("npm", ["init", "-y"], { cwd: installRoot });
  runCommand("npm", ["install", "--prefer-offline", ...tarballs], { cwd: installRoot });

  const binPath = path.join(installRoot, "node_modules", "@clawjs", "cli", "bin", "clawjs.mjs");
  assert.equal(fs.existsSync(binPath), true);

  const magicDbTask = runInstalledClawProcess(binPath, installRoot, [
    "db",
    "task",
    "Magic fallback",
  ]);
  assert.match(magicDbTask.stderr, /Using local database for this project/);
  assert.match(magicDbTask.stdout, /Created task \S+ "Magic fallback"/);

  const magicDbLead = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "leads",
    "--set",
    "name=Ada",
    "--set",
    "website=https://ada.dev",
    "--json",
  ])) as { title: string; metadata?: { website?: string } };
  assert.equal(magicDbLead.title, "Ada");
  assert.equal(magicDbLead.metadata?.website, "https://ada.dev");

  const magicAliasTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "create",
    "Alias task",
    "--json",
  ])) as { id: string; title: string };
  assert.equal(magicAliasTask.title, "Alias task");

  const listedTasks = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "tasks",
    "list",
    "--json",
  ])) as Array<{ id: string; title?: string }>;
  assert.equal(listedTasks.some((item) => item.title === "Alias task"), true);
  assert.equal(listedTasks.some((item) => item.title === "Magic fallback"), true);

  const magicSchema = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "db",
    "leads",
    "schema",
    "--json",
  ])) as { exists: boolean; collection: { name: string } };
  assert.equal(magicSchema.exists, true);
  assert.equal(magicSchema.collection.name, "leads");

  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "data", "database.sqlite")), true);
  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "data", "productivity.sqlite")), true);
  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "workspace.manifest.json")), false);

  const area = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "areas",
    "create",
    "Personal Ops",
    "--status",
    "active",
    "--json",
  ])) as { id: string; status: string; name: string };
  assert.equal(area.status, "active");
  assert.equal(area.name, "Personal Ops");

  const project = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "projects",
    "create",
    "Ship CLI",
    "--area-id",
    area.id,
    "--status",
    "in_progress",
    "--status-category",
    "active",
    "--review-at",
    "2026-04-20T09:00:00.000Z",
    "--json",
  ])) as { id: string; areaId?: string; name: string; statusCategory?: string; reviewAt?: string };
  assert.equal(project.areaId, area.id);
  assert.equal(project.statusCategory, "active");
  assert.equal(project.reviewAt, "2026-04-20T09:00:00.000Z");

  const todayList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "lists",
    "create",
    "Today",
    "--kind",
    "today",
    "--rank",
    "1",
    "--json",
  ])) as { id: string; kind: string; title: string };
  assert.equal(todayList.kind, "today");

  const upcomingList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "lists",
    "create",
    "Upcoming",
    "--kind",
    "upcoming",
    "--json",
  ])) as { id: string; kind: string };
  assert.equal(upcomingList.kind, "upcoming");

  const section = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "sections",
    "create",
    "Next",
    "--list-id",
    todayList.id,
    "--project-id",
    project.id,
    "--rank",
    "10",
    "--json",
  ])) as { id: string; listId?: string; projectId?: string; rank?: number };
  assert.equal(section.listId, todayList.id);
  assert.equal(section.projectId, project.id);
  assert.equal(section.rank, 10);

  const savedView = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "saved-views",
    "create",
    "Due today",
    "--domain",
    "tasks",
    "--query",
    "today",
    "--favorite",
    "true",
    "--json",
  ])) as { id: string; domain: string; favorite?: boolean };
  assert.equal(savedView.domain, "tasks");
  assert.equal(savedView.favorite, true);

  const goal = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "goals",
    "create",
    "CLI daily workflow",
    "--area-id",
    area.id,
    "--project-id",
    project.id,
    "--review-cadence",
    "weekly",
    "--json",
  ])) as { id: string; areaId?: string; projectId?: string };
  assert.equal(goal.areaId, area.id);
  assert.equal(goal.projectId, project.id);

  const milestone = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "milestones",
    "create",
    "Beta ready",
    "--area-id",
    area.id,
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--status",
    "active",
    "--target-date",
    "2026-04-18T17:00:00.000Z",
    "--json",
  ])) as { id: string; projectId?: string };
  assert.equal(milestone.projectId, project.id);

  const task = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "create",
    "Ship CLI",
    "--area-id",
    area.id,
    "--list-id",
    todayList.id,
    "--section-id",
    section.id,
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--type",
    "task",
    "--rank",
    "100",
    "--start-at",
    "2026-04-17T09:00:00.000Z",
    "--due-at",
    "2026-04-17T12:00:00.000Z",
    "--deadline-at",
    "2026-04-18T18:00:00.000Z",
    "--recurrence-rule",
    "FREQ=WEEKLY;BYDAY=FR",
    "--estimate-minutes",
    "30",
    "--story-points",
    "3",
    "--checklist-json",
    '[{"text":"pack tarballs"},{"text":"publish npm"}]',
    "--json",
  ])) as { id: string; areaId?: string; listId?: string; sectionId?: string; projectId?: string; goalId?: string; estimateMinutes?: number; storyPoints?: number; checklist?: Array<{ text: string }>; recurrenceRule?: string };
  assert.equal(task.areaId, area.id);
  assert.equal(task.listId, todayList.id);
  assert.equal(task.sectionId, section.id);
  assert.equal(task.projectId, project.id);
  assert.equal(task.goalId, goal.id);
  assert.equal(task.estimateMinutes, 30);
  assert.equal(task.storyPoints, 3);
  assert.equal(task.recurrenceRule, "FREQ=WEEKLY;BYDAY=FR");
  assert.equal(task.checklist?.length, 2);

  const recurrence = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "recurrences",
    "create",
    "Weekly CLI review",
    "--rule",
    "FREQ=WEEKLY;BYDAY=FR",
    "--anchor-type",
    "task",
    "--anchor-id",
    task.id,
    "--next-run-at",
    "2026-04-24T09:00:00.000Z",
    "--json",
  ])) as { id: string; anchorId?: string; rule: string };
  assert.equal(recurrence.anchorId, task.id);

  const cycle = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "cycles",
    "create",
    "Sprint 17",
    "--status",
    "active",
    "--project-id",
    project.id,
    "--starts-at",
    "2026-04-15T00:00:00.000Z",
    "--ends-at",
    "2026-04-29T00:00:00.000Z",
    "--capacity-points",
    "20",
    "--json",
  ])) as { id: string; status: string; projectId?: string; capacityPoints?: number };
  assert.equal(cycle.status, "active");
  assert.equal(cycle.projectId, project.id);

  const epic = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "epics",
    "create",
    "CLI productivity core",
    "--kind",
    "initiative",
    "--project-id",
    project.id,
    "--goal-id",
    goal.id,
    "--json",
  ])) as { id: string; kind: string; projectId?: string };
  assert.equal(epic.kind, "initiative");

  const typedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--cycle-id",
    cycle.id,
    "--epic-id",
    epic.id,
    "--json",
  ])) as { id: string; cycleId?: string; epicId?: string };
  assert.equal(typedTask.cycleId, cycle.id);
  assert.equal(typedTask.epicId, epic.id);

  const comment = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "comments",
    "create",
    "Ready for review",
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--visibility",
    "internal",
    "--json",
  ])) as { id: string; entityId?: string; body?: string };
  assert.equal(comment.entityId, task.id);

  const attachment = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "attachments",
    "create",
    "CLI screenshot",
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--mime-type",
    "image/png",
    "--uri",
    "file://cli.png",
    "--json",
  ])) as { id: string; entityId?: string; mimeType?: string };
  assert.equal(attachment.entityId, task.id);
  assert.equal(attachment.mimeType, "image/png");

  const annotatedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "update",
    task.id,
    "--comment-ids",
    comment.id,
    "--attachment-ids",
    attachment.id,
    "--json",
  ])) as { id: string; commentIds?: string[]; attachmentIds?: string[] };
  assert.deepEqual(annotatedTask.commentIds, [comment.id]);
  assert.deepEqual(annotatedTask.attachmentIds, [attachment.id]);

  const customField = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "custom-fields",
    "create",
    "Impact",
    "--entity-type",
    "task",
    "--field-type",
    "select",
    "--data",
    '{"options":["low","high"]}',
    "--json",
  ])) as { id: string; name: string; fieldType: string; options?: string[] };
  assert.equal(customField.fieldType, "select");

  const fieldValue = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "field-values",
    "create",
    customField.id,
    "--entity-type",
    "task",
    "--entity-id",
    task.id,
    "--data",
    '{"value":"high"}',
    "--json",
  ])) as { id: string; fieldId: string; entityId: string; value?: string };
  assert.equal(fieldValue.fieldId, customField.id);
  assert.equal(fieldValue.entityId, task.id);
  assert.equal(fieldValue.value, "high");

  const reminder = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "reminders",
    "create",
    "Follow up publish",
    "--trigger-at",
    "2026-04-15T09:00:00.000Z",
    "--anchor-type",
    "task",
    "--anchor-id",
    task.id,
    "--json",
  ])) as { id: string; anchorId?: string };
  assert.equal(reminder.anchorId, task.id);

  const deadline = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "deadlines",
    "create",
    "Release cutoff",
    "--due-at",
    "2026-04-18T18:00:00.000Z",
    "--anchor-type",
    "project",
    "--anchor-id",
    project.id,
    "--json",
  ])) as { id: string; anchorId?: string };
  assert.equal(deadline.anchorId, project.id);

  const event = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "events",
    "create",
    "Release review",
    "--starts-at",
    "2026-04-16T10:00:00.000Z",
    "--json",
  ])) as { id: string };
  assert.ok(event.id);

  const taskList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "list",
    "--section-id",
    section.id,
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(taskList.some((item) => item.id === task.id), true);

  const workspaceSearch = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "workspace-search",
    "query",
    "CLI",
    "--domains",
    "tasks,epics,attachments",
    "--json",
  ])) as Array<{ domain: string; id: string }>;
  assert.equal(workspaceSearch.some((item) => item.domain === "tasks" && item.id === task.id), true);
  assert.equal(workspaceSearch.some((item) => item.domain === "epics" && item.id === epic.id), true);

  const commentSearch = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "workspace-search",
    "query",
    "review",
    "--domains",
    "comments",
    "--json",
  ])) as Array<{ domain: string; id: string }>;
  assert.equal(commentSearch.some((item) => item.domain === "comments" && item.id === comment.id), true);

  const timeline = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "timeline",
    "week",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--project-id",
    project.id,
    "--json",
  ])) as {
    projects: Array<{ projectId?: string; tasks: unknown[]; milestones: unknown[]; deadlines: unknown[]; cycles: unknown[] }>;
    tasks: Array<{ id: string; dependencyState: { ready: boolean } }>;
    milestones: Array<{ id: string }>;
    deadlines: Array<{ id: string }>;
    cycles: Array<{ id: string }>;
    now: { readyTasks: Array<{ id: string }> };
  };
  assert.equal(timeline.projects.some((item) => item.projectId === project.id), true);
  assert.equal(timeline.tasks.some((item) => item.id === task.id && item.dependencyState.ready), true);
  assert.equal(timeline.milestones.some((item) => item.id === milestone.id), true);
  assert.equal(timeline.deadlines.some((item) => item.id === deadline.id), true);
  assert.equal(timeline.cycles.some((item) => item.id === cycle.id), true);
  assert.equal(timeline.now.readyTasks.some((item) => item.id === task.id), true);

  const completedTask = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "tasks",
    "complete",
    task.id,
    "--json",
  ])) as { id: string; status: string };
  assert.equal(completedTask.status, "done");

  const milestoneList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "milestones",
    "list",
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(milestoneList.some((item) => item.id === milestone.id), true);

  const eventList = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "events",
    "list",
    "--json",
  ])) as Array<{ id: string }>;
  assert.equal(eventList.some((item) => item.id === event.id), true);

  const agenda = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "agenda",
    "--start",
    "2026-04-15T00:00:00.000Z",
    "--end",
    "2026-04-19T00:00:00.000Z",
    "--include-completed",
    "--json",
  ])) as { items: Array<{ domain: string; id: string }> };
  assert.equal(agenda.items.some((item) => item.domain === "tasks" && item.id === task.id), true);
  assert.equal(agenda.items.some((item) => item.domain === "deadlines" && item.id === deadline.id), true);

  const exported = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "export",
    "snapshot.json",
    "--json",
  ])) as { path: string };
  assert.equal(fs.existsSync(exported.path), true);
  const snapshot = JSON.parse(fs.readFileSync(exported.path, "utf8")) as { collections?: Record<string, unknown[]> };
  assert.equal(Array.isArray(snapshot.collections?.lists), true);
  assert.equal(Array.isArray(snapshot.collections?.sections), true);
  assert.equal(Array.isArray(snapshot.collections?.comments), true);
  assert.equal(Array.isArray(snapshot.collections?.attachments), true);
  assert.equal(Array.isArray(snapshot.collections?.saved_views), true);
  assert.equal(Array.isArray(snapshot.collections?.recurrences), true);
  assert.equal(Array.isArray(snapshot.collections?.cycles), true);
  assert.equal(Array.isArray(snapshot.collections?.epics), true);
  assert.equal(Array.isArray(snapshot.collections?.custom_fields), true);
  assert.equal(Array.isArray(snapshot.collections?.field_values), true);
  assert.equal(Array.isArray(snapshot.collections?.templates), true);

  const backup = JSON.parse(runInstalledClaw(binPath, installRoot, [
    "backup",
    "backups",
    "--json",
  ])) as { files: string[] };
  assert.equal(backup.files.some((filePath) => filePath.endsWith("productivity.sqlite")), true);

  const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-installed-import-"));
  const imported = JSON.parse(runInstalledClaw(binPath, importRoot, [
    "import",
    exported.path,
    "--replace",
    "--json",
  ])) as { importedCollections?: Record<string, number> };
  assert.equal(imported.importedCollections?.sections, 1);
  assert.equal(imported.importedCollections?.cycles, 1);

  const importedSections = JSON.parse(runInstalledClaw(binPath, importRoot, [
    "sections",
    "list",
    "--json",
  ])) as Array<{ title?: string }>;
  assert.equal(importedSections.some((item) => item.title === "Next"), true);

  const dbTask = runInstalledClawProcess(binPath, installRoot, [
    "db",
    "task",
    "Magic fallback",
  ]);
  assert.match(dbTask.stderr, /Using local database for this project/);
  assert.match(dbTask.stdout, /Created task \S+ "Magic fallback"/);

  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "data", "database.sqlite")), true);
  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "data", "productivity.sqlite")), true);
  assert.equal(fs.existsSync(path.join(installRoot, ".clawjs", "workspace.manifest.json")), false);
});

test("runCli migrates legacy workspace sqlite productivity data into the local database automatically", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-productivity-migration-"));
  const legacyDbPath = path.join(workspaceRoot, ".clawjs", "data", "productivity.sqlite");
  fs.mkdirSync(path.dirname(legacyDbPath), { recursive: true });
  const legacyDb = new Database(legacyDbPath);
  legacyDb.exec(`
    CREATE TABLE workspace_records (
      collection_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT,
      archived_at TEXT,
      PRIMARY KEY (collection_name, record_id)
    );
  `);
  legacyDb.prepare(`
    INSERT INTO workspace_records (collection_name, record_id, payload_json, updated_at, archived_at)
    VALUES (?, ?, ?, ?, ?)
  `).run("tasks", "task-legacy", JSON.stringify({
    id: "task-legacy",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-01T09:00:00.000Z",
    source: { kind: "local" },
    title: "Imported task",
    status: "todo",
    priority: "medium",
    labels: [],
    watcherPersonIds: [],
    childTaskIds: [],
    dependsOnTaskIds: [],
    checklist: [],
  }), "2026-04-01T09:00:00.000Z", null);
  legacyDb.close();

  const listStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /Imported task/);
  assert.equal(fs.existsSync(legacyDbPath), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "data", "productivity.sqlite")), true);
});

test("runCli exposes explicit exit codes for success, degraded, failure, and usage states", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-codes-"));

  const successExitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const degradedExitCode = await runCli(["doctor", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-degraded-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const failureExitCode = await runCli(["workspace", "attach", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-failure-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const usageExitCode = await runCli(["unknown"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(successExitCode, CLI_EXIT_OK);
  assert.equal(degradedExitCode, CLI_EXIT_DEGRADED);
  assert.equal(failureExitCode, CLI_EXIT_FAILURE);
  assert.equal(usageExitCode, CLI_EXIT_USAGE);
});

test("runCli can initialize a workspace in json mode", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));

  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli accepts explicit non-interactive mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-non-interactive-"));
  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--non-interactive", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli can attach to an existing workspace", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-attach-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "attach", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId"/);
});

test("runCli can connect and inspect telegram state through the CLI", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-"));
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAWJS_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const connectStdout = captureStream();
    const connectExitCode = await runCli([
      "telegram",
      "connect",
      "--workspace",
      workspaceRoot,
      "--secret-name",
      "telegram_support_bot_token",
      "--webhook-url",
      "https://example.com/telegram/webhook",
      "--json",
    ], {
      stdout: connectStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "telegram",
      "status",
      "--workspace",
      workspaceRoot,
      "--json",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(connectExitCode, CLI_EXIT_OK);
    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.match(connectStdout.getOutput(), /claw_support_bot/);
    assert.match(statusStdout.getOutput(), /"mode": "webhook"/);
  });
});

test("runCli exposes structured channel accounts and permissions", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-channels-"));
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAWJS_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const addStdout = captureStream();
    const addExitCode = await runCli([
      "channels",
      "accounts",
      "add",
      "telegram",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--secret-name",
      "telegram_support_bot_token",
      "--json",
    ], {
      stdout: addStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const grantStdout = captureStream();
    const grantExitCode = await runCli([
      "channels",
      "permissions",
      "grant",
      "--workspace",
      workspaceRoot,
      "--agent",
      "support-agent",
      "--channel",
      "telegram",
      "--account",
      "support",
      "--target-id",
      "1001",
      "--permissions",
      "read,write,ingest",
      "--json",
    ], {
      stdout: grantStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "channels",
      "accounts",
      "list",
      "--workspace",
      workspaceRoot,
      "--provider",
      "telegram",
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(addExitCode, CLI_EXIT_OK);
    assert.equal(grantExitCode, CLI_EXIT_OK);
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(addStdout.getOutput(), /"id": "telegram:support"/);
    assert.match(grantStdout.getOutput(), /support-agent:telegram:support:1001/);
    assert.match(listStdout.getOutput(), /telegram:support/);
  });
});

test("runCli connects Telegram through channels and runs a processor listener once", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-channels-listener-"));
  const processorPath = path.join(workspaceRoot, "processor.cjs");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(processorPath, `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  process.stdout.write(JSON.stringify({ actions: [{ type: "send_message", targetId: event.targetId, text: "cli reply: " + event.message.text }] }));
});
`);
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAWJS_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const connectExitCode = await runCli([
      "channels",
      "telegram",
      "connect",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--secret-name",
      "telegram_support_bot_token",
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const processorExitCode = await runCli([
      "channels",
      "processors",
      "add",
      "--workspace",
      workspaceRoot,
      "--id",
      "support-router",
      "--command",
      `${process.execPath} ${processorPath}`,
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const grantExitCode = await runCli([
      "channels",
      "permissions",
      "grant",
      "--workspace",
      workspaceRoot,
      "--agent",
      "support-router",
      "--channel",
      "telegram",
      "--account",
      "support",
      "--target-id",
      "1001",
      "--permissions",
      "write",
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const listenStdout = captureStream();
    const listenExitCode = await runCli([
      "channels",
      "listen",
      "start",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--processor",
      "support-router",
      "--once",
      "--timeout",
      "0",
      "--json",
    ], {
      stdout: listenStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string }; lastSendToken?: string };

    assert.equal(connectExitCode, CLI_EXIT_OK);
    assert.equal(processorExitCode, CLI_EXIT_OK);
    assert.equal(grantExitCode, CLI_EXIT_OK);
    assert.equal(listenExitCode, CLI_EXIT_OK);
    assert.match(listenStdout.getOutput(), /"status": "stopped"/);
    assert.equal(proxyState.lastSend?.text, "cli reply: hello telegram");
    assert.equal(proxyState.lastSendToken, "{{telegram_support_bot_token}}");
  });
});

test("runCli can discover workspaces under an explicit root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-discover-"));
  const workspaceA = path.join(tempRoot, "apps", "a");
  const workspaceB = path.join(tempRoot, "apps", "nested", "b");

  await runCli(["workspace", "init", "--workspace", workspaceA, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  await runCli(["workspace", "init", "--workspace", workspaceB, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "discover", "--root", tempRoot, "--max-depth", "6", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId": "a"/);
  assert.match(stdout.getOutput(), /"workspaceId": "b"/);
});

test("runCli doctor reports workspace diagnostics", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-doctor-"));

  const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"workspace"/);
});

test("runCli redacts inline secrets from streamed error payloads in json mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-error-"));
  const sessionStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Error stream", "--json"], {
    stdout: sessionStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const created = JSON.parse(sessionStdout.getOutput()) as { sessionId: string };
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "clawjs-app",
      workspaceId: path.basename(workspaceRoot),
      agentId: path.basename(workspaceRoot),
      rootDir: workspaceRoot,
    },
  });
  claw.sessions.appendMessage(created.sessionId, {
    role: "user",
    content: "hello",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("Authorization: Bearer secret-token-12345678", {
    status: 401,
    statusText: "Unauthorized",
  })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      `--session-id=${created.sessionId}`,
      "--transport=gateway",
      "--gateway-url=http://127.0.0.1:18789",
      "--gateway-token=secret-token-12345678",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_FAILURE);
    assert.equal(stdout.getOutput().includes("secret-token-12345678"), false);
    assert.match(stdout.getOutput(), /Bearer \*{4,}5678/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli compat can refresh and persist a snapshot", async () => {
  const stdout = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-compat-"));

  const exitCode = await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.ok(exitCode === CLI_EXIT_OK || exitCode === CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"compat"/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "runtime-snapshot.json")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "capability-report.json")), true);
});

test("runCli can execute runtime install, uninstall, setup-workspace, and repair against a fake toolchain", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-runtime-real-"));
  const { binDir, openclawLog, npmLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.equal(await runCli(["runtime", "install", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "setup-workspace", "--workspace", workspaceRoot, "--agent-id", "demo-agent", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "repair", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "uninstall", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
  });

  assert.match(fs.readFileSync(npmLog, "utf8"), /install -g openclaw/);
  assert.match(fs.readFileSync(npmLog, "utf8"), /uninstall -g openclaw/);
  const openclawCommands = fs.readFileSync(openclawLog, "utf8");
  assert.match(openclawCommands, /agents add demo-agent --non-interactive --workspace/);
  assert.match(openclawCommands, /gateway install/);
});

test("runCli can complete a compat drift cycle against a fake runtime", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-drift-cycle-"));
  const { binDir } = createFakeOpenClawToolchain();

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "1.2.3",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const driftStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: driftStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_DEGRADED);
  });

  assert.match(driftStdout.getOutput(), /compatDrift/);
  assert.match(driftStdout.getOutput(), /runtime version drifted/i);

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const cleanStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: cleanStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_OK);
  });

  assert.match(cleanStdout.getOutput(), /"ok": true/);
});

test("runCli can create and list sessions", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-"));

  const createStdout = captureStream();
  const createStderr = captureStream();
  const createExitCode = await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Hello", "--json"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(createExitCode, CLI_EXIT_OK);
  assert.match(createStdout.getOutput(), /sessionId/);

  const listStdout = captureStream();
  const listStderr = captureStream();
  const listExitCode = await runCli(["sessions", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: listStdout.stream,
    stderr: listStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /Hello/);
});

test("runCli can read a created session and sync a file block", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-read-"));

  const createStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Read me", "--json"], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const created = JSON.parse(createStdout.getOutput()) as { sessionId: string };

  const syncStdout = captureStream();
  const syncExitCode = await runCli([
    "files", "sync",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--block-id", "tone",
    "--key", "tone",
    "--value", "direct",
    "--json",
  ], {
    stdout: syncStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(syncExitCode, CLI_EXIT_OK);
  assert.match(syncStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli(["sessions", "read", "--workspace", workspaceRoot, `--session-id=${created.sessionId}`, "--json"], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /Read me/);
});

test("runCli can apply a template pack", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-template-"));
  const templatePackPath = path.join(workspaceRoot, "template-pack.json");
  fs.writeFileSync(templatePackPath, JSON.stringify({
    schemaVersion: 1,
    id: "demo-pack",
    name: "Demo Pack",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "seed_if_missing",
        content: "seeded\n",
      },
    ],
  }, null, 2));

  const stdout = captureStream();
  const exitCode = await runCli([
    "files",
    "apply-template-pack",
    "--workspace", workspaceRoot,
    "--template-pack", templatePackPath,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /SOUL\.md/);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, "SOUL.md"), "utf8"), "seeded\n");
});

test("runCli can write, read and inspect workspace files", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-fileio-"));

  const writeStdout = captureStream();
  const writeExitCode = await runCli([
    "files",
    "write",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--value", "before\n\n<!-- CLAWJS:tone:START -->\nkind\n<!-- CLAWJS:tone:END -->\n",
    "--json",
  ], {
    stdout: writeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(writeExitCode, CLI_EXIT_OK);
  assert.match(writeStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "files",
    "read",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /CLAWJS:tone:START/);

  const inspectStdout = captureStream();
  const inspectExitCode = await runCli([
    "files",
    "inspect",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(inspectExitCode, CLI_EXIT_OK);
  assert.match(inspectStdout.getOutput(), /managedBlocks/);
});

test("runCli removes auth profiles with equals-style flags", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-auth-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-agent-"));

  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "sk-12345678" },
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-87654321" },
    },
  });

  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=anthropic", "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"removed": 1/);

  const remaining = JSON.parse(fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8")) as {
    profiles: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(remaining.profiles), ["openai:manual"]);
});

test("runCli supports auth login dry-run and workspace validate", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-validate-"));

  const validateBefore = captureStream();
  const validateBeforeExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateBefore.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateBeforeExitCode, CLI_EXIT_DEGRADED);
  assert.match(validateBefore.getOutput(), /"missingFiles"/);

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const validateAfter = captureStream();
  const validateAfterExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateAfter.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateAfterExitCode, CLI_EXIT_OK);
  assert.match(validateAfter.getOutput(), /"ok": true/);

  const loginStdout = captureStream();
  const loginExitCode = await runCli(["auth", "login", "--workspace", workspaceRoot, "--provider=openai", "--dry-run", "--json"], {
    stdout: loginStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(loginExitCode, CLI_EXIT_OK);
  assert.match(loginStdout.getOutput(), /openai-codex/);

  const codexLoginStdout = captureStream();
  const codexLoginExitCode = await runCli(["auth", "login", "--runtime", "codex", "--workspace", workspaceRoot, "--dry-run", "--json"], {
    stdout: codexLoginStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(codexLoginExitCode, CLI_EXIT_OK);
  assert.match(codexLoginStdout.getOutput(), /openai-codex/);
  assert.match(codexLoginStdout.getOutput(), /"login"/);
});

test("runCli supports forced Codex login by logging out first", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-codex-force-login-"));
  const binDir = path.join(workspaceRoot, "bin");
  const fakeCodex = path.join(binDir, "codex");
  const logPath = path.join(workspaceRoot, "codex.log");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(${JSON.stringify(logPath)}, process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "logout") process.exit(0);
process.exit(0);
`, { mode: 0o755 });

  const previousCodexPath = process.env.CLAWJS_CODEX_PATH;
  process.env.CLAWJS_CODEX_PATH = fakeCodex;
  try {
    const stdout = captureStream();
    const exitCode = await runCli(["auth", "login", "--runtime", "codex", "--force", "--workspace", workspaceRoot, "--dry-run", "--json"], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.doesNotMatch(fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "", /logout/);

    const removeExitCode = await runCli(["auth", "remove", "--runtime", "codex", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(removeExitCode, CLI_EXIT_OK);
    assert.match(fs.readFileSync(logPath, "utf8"), /logout/);
  } finally {
    if (previousCodexPath === undefined) delete process.env.CLAWJS_CODEX_PATH;
    else process.env.CLAWJS_CODEX_PATH = previousCodexPath;
  }
});

test("runCli can repair a workspace and normalize compat snapshots", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-repair-"));
  fs.mkdirSync(path.join(workspaceRoot, ".clawjs", "compat"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, ".clawjs", "compat", "runtime-snapshot.json"), JSON.stringify({
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: false,
    },
  }, null, 2));

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "repair", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /compatSnapshotMigrated/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "runtime-snapshot.json")), true);
});

test("runCli supports workspace reset dry-run and execution results", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-reset-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const previewStdout = captureStream();
  const previewExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--dry-run",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(previewExitCode, CLI_EXIT_OK);
  assert.match(previewStdout.getOutput(), /runtime_file/);

  const resetStdout = captureStream();
  const resetExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--json",
  ], {
    stdout: resetStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(resetExitCode, CLI_EXIT_OK);
  assert.match(resetStdout.getOutput(), /removedPaths/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, "SOUL.md")), false);
});

test("runCli supports runtime install, uninstall, and repair dry-run", async () => {
  const installStdout = captureStream();
  const uninstallStdout = captureStream();
  const repairStdout = captureStream();
  const setupStdout = captureStream();

  const installExitCode = await runCli(["runtime", "install", "--dry-run", "--json"], {
    stdout: installStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const uninstallExitCode = await runCli(["runtime", "uninstall", "--dry-run", "--json"], {
    stdout: uninstallStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const repairExitCode = await runCli(["runtime", "repair", "--dry-run", "--json"], {
    stdout: repairStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const setupExitCode = await runCli(["runtime", "setup-workspace", "--workspace", "/tmp/claw-demo", "--agent-id", "demo", "--dry-run", "--json"], {
    stdout: setupStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(installExitCode, CLI_EXIT_OK);
  assert.equal(uninstallExitCode, CLI_EXIT_OK);
  assert.equal(repairExitCode, CLI_EXIT_OK);
  assert.equal(setupExitCode, CLI_EXIT_OK);
  assert.match(installStdout.getOutput(), /openclaw/);
  assert.match(uninstallStdout.getOutput(), /uninstall|remove/);
  assert.match(repairStdout.getOutput(), /gateway/);
  assert.match(setupStdout.getOutput(), /agents/);
});

test("runCli smokes the required command surface in dry-run or headless mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-agent-"));

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const commands: Array<{ argv: string[]; expected: number[] }> = [
    { argv: ["runtime", "status", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["runtime", "install", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["runtime", "repair", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "attach", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "inspect", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "reset", "--workspace", workspaceRoot, "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["files", "diff", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["files", "sync", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "status", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "login", "--workspace", workspaceRoot, "--provider", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=openai", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["models", "list", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["models", "set-default", "--workspace", workspaceRoot, "--model", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["providers", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["providers", "auth-state", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["sessions", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "search", "--workspace", workspaceRoot, "--query", "hello", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "create", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["documents", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["tts", "providers", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
  ];

  for (const command of commands) {
    const exitCode = await runCli(command.argv, {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(command.expected.includes(exitCode), true, command.argv.join(" "));
  }
});

test("runCli can search sessions through OpenClaw memory search", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-search-"));
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

test("runCli memory lifecycle is local-first and agent-friendly", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-local-"));

  const helpStdout = captureStream();
  assert.equal(await runCli(["memory", "--help"], {
    stdout: helpStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(helpStdout.getOutput(), /First-class memory commands/);
  assert.match(helpStdout.getOutput(), /memory context/);

  const capabilitiesStdout = captureStream();
  assert.equal(await runCli(["memory", "capabilities", "--workspace", workspaceRoot, "--json"], {
    stdout: capabilitiesStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const capabilities = JSON.parse(capabilitiesStdout.getOutput()) as { ok: boolean; data: { write: boolean; defaultSource: string } };
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.data.write, true);
  assert.equal(capabilities.data.defaultSource, "local");

  const saveStdout = captureStream();
  assert.equal(await runCli([
    "memory",
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
  assert.equal(await runCli(["memory", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const listed = JSON.parse(listStdout.getOutput()) as { ok: boolean; results: Array<{ id: string }> };
  assert.equal(listed.ok, true);
  assert.equal(listed.results.some((item) => item.id === saved.data.id), true);

  const getStdout = captureStream();
  assert.equal(await runCli(["memory", "get", saved.data.id, "--workspace", workspaceRoot, "--json"], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(getStdout.getOutput()) as { data: { id: string } }).data.id, saved.data.id);

  const updateStdout = captureStream();
  assert.equal(await runCli(["memory", "update", saved.data.id, "--workspace", workspaceRoot, "--content", "User prefers concise answers with source citations.", "--confidence", "0.9", "--json"], {
    stdout: updateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(updateStdout.getOutput()) as { data: { confidence: number } }).data.confidence, 0.9);

  const searchStdout = captureStream();
  assert.equal(await runCli(["memory", "search", "concise citations", "--workspace", workspaceRoot, "--json"], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const search = JSON.parse(searchStdout.getOutput()) as { ok: boolean; count: number; results: Array<{ id: string; score: number; snippet: string; matchedFields: string[] }> };
  assert.equal(search.ok, true);
  assert.equal(search.count, 1);
  assert.equal(search.results[0]?.id, saved.data.id);
  assert.equal(typeof search.results[0]?.score, "number");
  assert.match(search.results[0]?.snippet ?? "", /concise/);
  assert.equal(search.results[0]?.matchedFields.includes("content"), true);

  const contextStdout = captureStream();
  assert.equal(await runCli(["memory", "context", "--query", "answer style", "--workspace", workspaceRoot, "--json"], {
    stdout: contextStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const context = JSON.parse(contextStdout.getOutput()) as { ok: boolean; data: { memories: Array<{ id: string }>; citations: Array<{ id: string }>; summary: string } };
  assert.equal(context.ok, true);
  assert.equal(context.data.memories.some((item) => item.id === saved.data.id), true);
  assert.equal(context.data.citations.some((item) => item.id === saved.data.id), true);
  assert.match(context.data.summary, /Response preference/);

  await runCli(["memory", "save", "Experimental low confidence memory", "--workspace", workspaceRoot, "--confidence", "0.1", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const lowContextStdout = captureStream();
  assert.equal(await runCli(["memory", "context", "Experimental", "--workspace", workspaceRoot, "--json"], {
    stdout: lowContextStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(lowContextStdout.getOutput()) as { data: { memories: unknown[] } }).data.memories.length, 0);

  const emptyStdout = captureStream();
  assert.equal(await runCli(["memory", "search", "does-not-match", "--workspace", workspaceRoot, "--json"], {
    stdout: emptyStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.deepEqual(JSON.parse(emptyStdout.getOutput()), { ok: true, query: "does-not-match", strategy: "keyword", results: [], count: 0 });

  const missingStdout = captureStream();
  assert.equal(await runCli(["memory", "get", "missing", "--workspace", workspaceRoot, "--json"], {
    stdout: missingStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_FAILURE);
  assert.equal((JSON.parse(missingStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "not_found");

  const deleteStdout = captureStream();
  assert.equal(await runCli(["memory", "delete", saved.data.id, "--workspace", workspaceRoot, "--json"], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(deleteStdout.getOutput()) as { data: { deleted: boolean } }).data.deleted, true);
});

test("runCli memory search keeps workspaces and runtime source separate", async () => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-b-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await runCli(["memory", "save", "Workspace alpha prefers tabs", "--workspace", workspaceA, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const searchAStdout = captureStream();
  assert.equal(await runCli(["memory", "search", "tabs", "--workspace", workspaceA, "--json"], {
    stdout: searchAStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(searchAStdout.getOutput()) as { count: number }).count, 1);

  const searchBStdout = captureStream();
  assert.equal(await runCli(["memory", "search", "tabs", "--workspace", workspaceB, "--json"], {
    stdout: searchBStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal((JSON.parse(searchBStdout.getOutput()) as { count: number }).count, 0);

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  }, async () => {
    const runtimeListStdout = captureStream();
    assert.equal(await runCli([
      "memory",
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
    assert.equal((JSON.parse(runtimeListStdout.getOutput()) as { count: number }).count, 1);

    const runtimeStdout = captureStream();
    const exitCode = await runCli([
      "memory",
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
    assert.deepEqual(JSON.parse(runtimeStdout.getOutput()), { ok: true, query: "unknown", strategy: "keyword", results: [], count: 0 });
    assert.match(fs.readFileSync(openclawLog, "utf8"), /memory search --agent demo-memory-search --query unknown --json/);
  });
});

test("runCli memory JSON errors are parseable and db memory search is not a create alias", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-errors-"));

  const missingQueryStdout = captureStream();
  assert.equal(await runCli(["memory", "search", "--workspace", workspaceRoot, "--json"], {
    stdout: missingQueryStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  assert.equal((JSON.parse(missingQueryStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "usage_error");

  const invalidStdout = captureStream();
  assert.equal(await runCli(["memory", "unknown", "--workspace", workspaceRoot, "--json"], {
    stdout: invalidStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);
  assert.equal((JSON.parse(invalidStdout.getOutput()) as { ok: boolean; error: { code: string } }).error.code, "usage_error");

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
  assert.deepEqual(JSON.parse(dbListStdout.getOutput()), []);
});

test("runCli runtime memory search returns ok for empty results when explicitly requested", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-memory-search-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "memory",
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
    assert.deepEqual(JSON.parse(stdout.getOutput()), { ok: true, query: "unknown", strategy: "keyword", results: [], count: 0 });
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
    if (request.url !== "/v1/chat/completions" && request.url !== "/v1/responses") {
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

test("runCli exposes provider catalog and auth state commands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-providers-"));

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(listExitCode), true);
  assert.match(listStdout.getOutput(), /"id": "openai"/);

  const stateStdout = captureStream();
  const stateExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "auth-state",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: stateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(stateExitCode), true);
  assert.match(stateStdout.getOutput(), /"providers"/);
});

test("runCli exposes vault-backed secrets commands", async () => {
  const vault = await createFakeVaultCliServer();
  try {
    const listStdout = captureStream();
    const listExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "list",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-list-")),
      "--secrets-backend", "vault",
      "--vault-url", vault.baseUrl,
      "--vault-token", "vault-token",
      "--vault-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"npm_token_main"/);

    const typesStdout = captureStream();
    const typesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "types",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-types-")),
      "--secrets-backend", "vault",
      "--vault-url", vault.baseUrl,
      "--vault-token", "vault-token",
      "--vault-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: typesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(typesExitCode, CLI_EXIT_OK);
    assert.match(typesStdout.getOutput(), /"npm.token"/);

    const capabilitiesStdout = captureStream();
    const capabilitiesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "capabilities",
      "--name", "npm_token_main",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-capabilities-")),
      "--secrets-backend", "vault",
      "--vault-url", vault.baseUrl,
      "--vault-token", "vault-token",
      "--vault-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: capabilitiesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(capabilitiesExitCode, CLI_EXIT_OK);
    assert.match(capabilitiesStdout.getOutput(), /"capabilities"/);
  } finally {
    await vault.close();
  }
});

test("runCli can upload, search, read, and download documents", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-documents-"));
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  const downloadFile = path.join(workspaceRoot, "downloaded.txt");
  fs.writeFileSync(sourceFile, "alpha notes for document search");

  const uploadStdout = captureStream();
  const uploadExitCode = await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
    "--file", sourceFile,
    "--json",
  ], {
    stdout: uploadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(uploadExitCode, CLI_EXIT_OK);
  const uploaded = JSON.parse(uploadStdout.getOutput()) as { documentId: string; name: string };
  assert.match(uploaded.documentId, /^[0-9a-f-]{36}$/);
  assert.equal(uploaded.name, "brief.txt");

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "documents",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(uploaded.documentId));

  const searchStdout = captureStream();
  const searchExitCode = await runCli([
    "documents",
    "search",
    "--workspace", workspaceRoot,
    "--query", "alpha",
    "--json",
  ], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(searchExitCode, CLI_EXIT_OK);
  assert.match(searchStdout.getOutput(), /alpha/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "documents",
    "read",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /"name": "brief\.txt"/);

  const downloadStdout = captureStream();
  const downloadExitCode = await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--out", downloadFile,
    "--json",
  ], {
    stdout: downloadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(downloadExitCode, CLI_EXIT_OK);
  assert.equal(fs.readFileSync(downloadFile, "utf8"), "alpha notes for document search");
});

test("runCli can generate text through the inference command", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-inference-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_AGENT_TEXT: "hello from inference",
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "inference",
      "generate-text",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-inference",
      "--agent-id", "demo-inference",
      "--prompt", "Summarize this",
      "--transport", "cli",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /hello from inference/);
  });

  assert.match(fs.readFileSync(openclawLog, "utf8"), /agent --agent demo-inference/);
});

test("runCli can manage TTS config and synthesize audio", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-tts-"));
  const outputPath = path.join(workspaceRoot, "speech.mp3");

  const configStdout = captureStream();
  const configExitCode = await runCli([
    "tts",
    "set-config",
    "--workspace", workspaceRoot,
    "--config-json", JSON.stringify({ provider: "openai", enabled: true, autoRead: true, voice: "nova", model: "tts-1" }),
    "--json",
  ], {
    stdout: configStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(configExitCode, CLI_EXIT_OK);
  assert.match(configStdout.getOutput(), /"provider": "openai"/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(Buffer.from("fake-mp3"), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  })) as typeof fetch;

  try {
    const synthStdout = captureStream();
    const synthExitCode = await runCli([
      "tts",
      "synthesize",
      "--workspace", workspaceRoot,
      "--text", "Hello world",
      "--provider", "openai",
      "--api-key", "test-key",
      "--out", outputPath,
      "--json",
    ], {
      stdout: synthStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(synthExitCode, CLI_EXIT_OK);
    assert.equal(fs.readFileSync(outputPath, "utf8"), "fake-mp3");
    assert.match(synthStdout.getOutput(), /"mimeType": "audio\/mpeg"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli stores and transcribes voice notes locally", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-voice-notes-"));
  const audioPath = path.join(workspaceRoot, "note.ogg");
  const whisperPath = path.join(workspaceRoot, "fake-whisper");
  fs.writeFileSync(audioPath, "fake-audio");
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const outIndex = args.indexOf("-of");
if (outIndex !== -1) fs.writeFileSync(args[outIndex + 1] + ".txt", "hola desde nota de voz");
`, { mode: 0o755 });

  const addStdout = captureStream();
  const addExitCode = await runCli([
    "voice-notes",
    "add",
    "--workspace", workspaceRoot,
    "--file", audioPath,
    "--origin", "telegram",
    "--provider", "telegram",
    "--account", "support",
    "--target-id", "1001",
    "--json",
  ], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(addExitCode, CLI_EXIT_OK);
  const note = JSON.parse(addStdout.getOutput()) as { id: string; status: string };
  assert.equal(note.status, "stored");

  const transcribeStdout = captureStream();
  const transcribeExitCode = await runCli([
    "voice-notes",
    "transcribe",
    note.id,
    "--workspace", workspaceRoot,
    "--binary-path", whisperPath,
    "--model-path", path.join(workspaceRoot, "model.bin"),
    "--json",
  ], {
    stdout: transcribeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(transcribeExitCode, CLI_EXIT_OK);
  assert.match(transcribeStdout.getOutput(), /hola desde nota de voz/);

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "voice-notes",
    "list",
    "--workspace", workspaceRoot,
    "--origin", "telegram",
    "--query", "hola",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"status": "transcribed"/);
});

test("runCli honors --runtime for alternate workspace layouts", async () => {
  const zeroWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-zeroclaw-"));
  const picoWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-picoclaw-"));

  const zeroExitCode = await runCli([
    "--runtime", "zeroclaw",
    "workspace", "init",
    "--workspace", zeroWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const picoExitCode = await runCli([
    "--runtime", "picoclaw",
    "workspace", "init",
    "--workspace", picoWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(zeroExitCode, CLI_EXIT_OK);
  assert.equal(picoExitCode, CLI_EXIT_OK);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "TOOLS.md")), false);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "memory", "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "TOOLS.md")), false);
});

test("runCli browser commands target relay browser routes", async () => {
  const requests: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      auth: req.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      session: {
        workspaceId: "main",
        active: true,
        status: "ready",
        navigation: {
          title: "Login",
          url: "https://example.com/login",
          displayUrl: "https://example.com/login",
          isLocalUrl: false,
        },
        controller: null,
        viewport: { width: 1440, height: 960 },
        updatedAt: new Date().toISOString(),
      },
      sharePath: "/workspace/demo-tenant/demo-agent/main/browser",
      shareUrl: "http://127.0.0.1:4410/workspace/demo-tenant/demo-agent/main/browser",
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const relayUrl = `http://127.0.0.1:${address.port}`;

  try {
    const stdout = captureStream();
    const ensureExitCode = await runCli([
      "browser",
      "ensure",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
      "--url", "http://localhost:4300",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(ensureExitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /workspace\/demo-tenant\/demo-agent\/main\/browser/);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.auth, "Bearer relay-token");
    assert.match(requests[0]?.url ?? "", /\/v1\/tenants\/demo-tenant\/agents\/demo-agent\/workspaces\/main\/browser\/session$/);
    assert.match(requests[0]?.body ?? "", /localhost:4300/);

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "browser",
      "status",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.equal(statusStdout.getOutput().trim(), "ready");
    assert.equal(requests[1]?.method, "GET");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runCli supports time commands and schedule sugar", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-time-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "time.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  try {
    const scheduleStdout = captureStream();
    const scheduleExitCode = await runCli([
      "schedule",
      "at",
      "monday 9am",
      "review PRs",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: scheduleStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(scheduleExitCode, CLI_EXIT_OK);
    assert.match(scheduleStdout.getOutput(), /"kind": "event"/);

    const everyStdout = captureStream();
    const everyExitCode = await runCli([
      "schedule",
      "every",
      "3h",
      "check deployment health",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: everyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(everyExitCode, CLI_EXIT_OK);
    assert.match(everyStdout.getOutput(), /"kind": "routine"/);

    const afterStdout = captureStream();
    const afterExitCode = await runCli([
      "schedule",
      "after",
      "24h",
      "if no reply nudge owner",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--anchor-type", "thread",
      "--anchor-id", "thread-1",
      "--anchor-at", "2026-04-09T08:00:00.000Z",
      "--json",
    ], {
      stdout: afterStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(afterExitCode, CLI_EXIT_OK);
    assert.match(afterStdout.getOutput(), /"kind": "follow_up"/);

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "time",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /review PRs/);
  } finally {
    await built.app.close();
  }
});
