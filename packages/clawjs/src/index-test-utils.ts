import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { once } from "events";

import { clawPublicApiPrefix } from "@clawjs/core";

import { CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runV1DataCli } from "./v1-data.ts";

export function captureStream() {
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

export function parseCliJsonPayload<T>(text: string): T {
  const payload = JSON.parse(text) as T | { data: T };
  return typeof payload === "object" && payload !== null && "data" in payload ? payload.data : payload;
}

export function runCommand(command: string, args: string[], options: { cwd: string }): string {
  const executable = command === "npm" ? "/bin/zsh" : command;
  const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const resolvedArgs = command === "npm"
    ? ["-lc", ["npm", ...args].map(shellQuote).join(" ")]
    : args;
  const execOptions = {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  } as const;
  try {
    return execFileSync(executable, resolvedArgs, execOptions);
  } catch (error) {
    if (command !== "npm" || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return execFileSync("/bin/bash", resolvedArgs, execOptions);
  }
}

export function packWorkspacePackage(packageDir: string, packDir: string): string {
  const tarballName = runCommand("npm", ["pack", "--pack-destination", packDir], { cwd: packageDir }).trim().split("\n").pop() ?? "";
  return path.join(packDir, tarballName);
}

export function assertCliPackageBinSurface(packageDir: string): void {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
  };
  assert.deepEqual(packageJson.bin, { claw: "bin/claw.mjs" });
  assert.equal(fs.existsSync(path.join(packageDir, "bin", "claw.mjs")), true);
  assert.equal(fs.existsSync(path.join(packageDir, "bin", "clawjs.mjs")), false);
}

export function runInstalledClaw(binPath: string, cwd: string, args: string[]): string {
  return execFileSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

export function runInstalledClawProcess(binPath: string, cwd: string, args: string[]): { stdout: string; stderr: string } {
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

export async function runCliCapture(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runCli(args, {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd,
    binName: "claw",
  });
  return { code, stdout: stdout.getOutput(), stderr: stderr.getOutput() };
}

function parseTestFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function extractTestPositionals(args: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith("--")) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) index += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

export async function runInternalV1Cli(args: string[], options: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream; cwd: string }): Promise<number> {
  const result = await runV1DataCli({
    argv: args,
    positionals: extractTestPositionals(args),
    flags: parseTestFlags(args),
    stdout: options.stdout,
    stderr: options.stderr,
    wantsJson: args.includes("--json"),
    binName: "claw",
    cwd: options.cwd,
    homeDir: os.homedir(),
  });
  return result ?? CLI_EXIT_USAGE;
}

export async function startDelegationPlaneTestServer(workspaceRoot: string): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = 18_000 + Math.floor(Math.random() * 1_000);
  const url = `http://127.0.0.1:${port}`;
  const delegationTsxBin = path.join(process.cwd(), "delegation", "node_modules", ".bin", "tsx");
  const rootTsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const homeTsxBin = path.join(os.homedir(), "node_modules", ".bin", "tsx");
  const tsxBin = fs.existsSync(delegationTsxBin) ? delegationTsxBin : fs.existsSync(rootTsxBin) ? rootTsxBin : homeTsxBin;
  const child = spawn(tsxBin, [path.join(process.cwd(), "delegation", "src", "bin", "server.ts")], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: {
      ...process.env,
      DELEGATION_PLANE_HOST: "127.0.0.1",
      DELEGATION_PLANE_PORT: String(port),
      DELEGATION_PLANE_DATA_DIR: path.join(workspaceRoot, "delegation-data"),
      DELEGATION_PLANE_DATABASE_FILE: path.join(workspaceRoot, "delegation-data", "runtime.sqlite"),
      DELEGATION_PLANE_SCHEDULER: "0",
    },
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8_000) {
    try {
      const response = await fetch(`${url}/v1/health`);
      if (response.ok) {
        return {
          url,
          stop: async () => {
            child.kill("SIGTERM");
            await Promise.race([
              once(child, "exit"),
              new Promise((resolve) => setTimeout(resolve, 1_000)),
            ]);
          },
        };
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill("SIGTERM");
  throw new Error("Delegation test server did not start.");
}

export async function createFakeSecretsCliServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === `${clawPublicApiPrefix}/secret-types`) {
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
    if (url.pathname === `${clawPublicApiPrefix}/tenants/demo-tenant/secrets`) {
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
    if (url.pathname === `${clawPublicApiPrefix}/tenants/demo-tenant/secrets/npm_token_main/capabilities`) {
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

export const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7KJcsAAAAASUVORK5CYII=";

export async function createFakeOpenAIImageCliServer() {
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

export function createFakeOpenClawToolchain(): { binDir: string; openclawLog: string; npmLog: string } {
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
  method=""
  for arg in "$@"; do
    method="$arg"
  done
  if [ "$method" = "sessions.list" ]; then
    printf "%s\n" '{"sessions":[{"sessionKey":"alpha","title":"Native Alpha","updatedAt":"2026-04-08T10:00:00.000Z"}]}'
    exit 0
  fi
  if [ "$method" = "sessions.preview" ]; then
    printf "%s\n" '{"sessionKey":"alpha","title":"Native Alpha","preview":"hello from native"}'
    exit 0
  fi
  if [ "$method" = "sessions.resolve" ]; then
    printf "%s\n" '{"sessionKey":"alpha","found":true,"title":"Native Alpha"}'
    exit 0
  fi
  if [ "$method" = "chat.history" ]; then
    printf "%s\n" '{"sessionKey":"alpha","messages":[{"role":"assistant","content":"hello from native"}]}'
    exit 0
  fi
  if [ "$method" = "chat.send" ]; then
    printf "%s\n" '{"accepted":true,"sessionKey":"alpha","runId":"run-alpha"}'
    exit 0
  fi
  if [ "$method" = "chat.inject" ]; then
    printf "%s\n" '{"accepted":true,"sessionKey":"alpha","messageId":"msg-alpha"}'
    exit 0
  fi
  if [ "$method" = "chat.abort" ]; then
    printf "%s\n" '{"accepted":true,"sessionKey":"alpha","runId":"run-alpha"}'
    exit 0
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

export function createFakeSkillSourceToolchain(): { binDir: string; clawhubLog: string; npxLog: string } {
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

export function createFakeTelegramSecretsProxy(): { proxyPath: string; statePath: string } {
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

export function createFakeGenerationScript(): string {
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

export function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
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

export async function withPatchedEnv<TValue>(
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

export function useIsolatedClawDataRoot(t: { after(fn: () => void): void }, workspaceRoot: string): string {
  const previous = new Map([
    ["CLAW_DATA_DIR", process.env.CLAW_DATA_DIR],
    ["CLAW_DB_PATH", process.env.CLAW_DB_PATH],
    ["CLAW_DATABASE_DB_PATH", process.env.CLAW_DATABASE_DB_PATH],
    ["CLAW_DATABASE_FILES_DIR", process.env.CLAW_DATABASE_FILES_DIR],
    ["DATABASE_DB_PATH", process.env.DATABASE_DB_PATH],
    ["DATABASE_FILES_DIR", process.env.DATABASE_FILES_DIR],
  ]);
  const dataRoot = path.join(workspaceRoot, "claw-data");
  process.env.CLAW_DATA_DIR = dataRoot;
  delete process.env.CLAW_DB_PATH;
  delete process.env.CLAW_DATABASE_DB_PATH;
  delete process.env.CLAW_DATABASE_FILES_DIR;
  delete process.env.DATABASE_DB_PATH;
  delete process.env.DATABASE_FILES_DIR;
  t.after(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return dataRoot;
}

export async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local test server address");
  }
  return address.port;
}
