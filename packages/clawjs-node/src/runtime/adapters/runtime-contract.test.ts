import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import type { CommandRunner } from "../contracts.ts";
import { getRuntimeSessionDescriptor, getRuntimeResourceCatalogs, getRuntimeStatusReport } from "../engines.ts";
import { clawAdapter } from "./claw-adapter.ts";
import { codexAdapter } from "./codex-adapter.ts";
import { hermesAdapter } from "./hermes-adapter.ts";
import { nanobotAdapter } from "./nanobot-adapter.ts";
import { openclawAdapter } from "./openclaw-adapter.ts";

class FakeRunner implements CommandRunner {
  private readonly handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>;
  readonly calls: string[] = [];

  constructor(handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>) {
    this.handlers = handlers;
  }

  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const key = `${command} ${args.join(" ")}`.trim();
    this.calls.push(key);
    const handler = this.handlers[key];
    if (!handler) {
      throw new Error(`missing handler for ${key}`);
    }
    if (handler.fail) {
      throw new Error(handler.stderr || "failed");
    }
    return {
      stdout: handler.stdout || "",
      stderr: handler.stderr || "",
      exitCode: 0,
    };
  }
}

test("openclaw adapter preserves its transport and capability-map contract", async () => {
  const runner = new FakeRunner({
    "which openclaw": { stdout: "/usr/local/bin/openclaw\n" },
    "openclaw --version": { stdout: "openclaw 1.2.3\n" },
    "openclaw models status --json": { stdout: "{}" },
    "openclaw agents list --json": { stdout: "[]" },
    "openclaw gateway call --json --timeout 1000 --params {\"probe\":true} channels.status": { stdout: "{\"channels\":{}}" },
    "openclaw plugins list --json": { stdout: "{\"plugins\":[]}" },
  });

  const status = await openclawAdapter.getStatus(runner, {
    adapter: "openclaw",
    gateway: { url: "http://127.0.0.1:4100" },
  });
  assert.equal(status.capabilityMap.channels.strategy, "gateway");
  assert.equal(status.capabilityMap.channels.status, "ready");
  assert.deepEqual(status.capabilityMap.memory.limitations, ["OpenClaw memory is workspace-file based in ClawJS."]);
  assert.deepEqual(status.capabilityMap.scheduler.limitations, ["Heartbeat-based scheduling only."]);

  const conversation = getRuntimeSessionDescriptor(openclawAdapter, {
    adapter: "openclaw",
    gateway: { url: "http://127.0.0.1:4100" },
  });
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.transport.gatewayKind, "openai-responses");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
});

test("codex adapter exposes primary-agent-tool status, auth, and hybrid transport", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-codex-"));
  fs.mkdirSync(path.join(homeDir, "skills", "review"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, "config.toml"), 'model = "gpt-5.3-codex"\n');

  const runner = new FakeRunner({
    "custom-codex --version": { stdout: "codex-cli 0.122.0-alpha.13\n" },
    "custom-codex login status": { stdout: "Logged in using ChatGPT\n" },
    "custom-codex app-server --help": { stdout: "Usage: codex app-server\n" },
  });

  const options = {
    adapter: "codex" as const,
    binaryPath: "custom-codex",
    homeDir,
    workspacePath: path.join(homeDir, "workspace"),
  };
  const status = await getRuntimeStatusReport(codexAdapter, runner, options);
  assert.equal(status.version, "0.122.0-alpha.13");
  assert.equal(status.capabilityMap.auth.status, "ready");
  assert.equal(status.capabilityMap.session_gateway.status, "ready");
  assert.equal(status.capabilityMap.channels.supported, false);

  const auth = await codexAdapter.getProviderAuth(runner, options);
  assert.equal(auth["openai-codex"]?.hasAuth, true);

  const resources = await getRuntimeResourceCatalogs(codexAdapter, runner, options);
  assert.equal(resources.models.defaultModel?.modelId, "gpt-5.3-codex");
  assert.equal(resources.skills.skills.some((entry) => entry.id === "review"), true);

  const conversation = getRuntimeSessionDescriptor(codexAdapter, options);
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.transport.gatewayKind, "codex-app-server");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
  assert.equal(conversation.buildCliInvocation({
    sessionId: "session-1",
    prompt: "hello",
  }).parser, "codex-jsonl");
});

test("codex adapter treats Codex config as read-only", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-codex-readonly-"));
  const configPath = path.join(homeDir, "config.toml");
  fs.writeFileSync(configPath, 'model = "gpt-5.3-codex"\n');
  const runner = new FakeRunner({});

  await assert.rejects(
    () => codexAdapter.setDefaultModel("gpt-5.4", runner, { adapter: "codex", homeDir }),
    /Codex config is an external read-only source/
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), 'model = "gpt-5.3-codex"\n');
});

test("claw adapter rejects corrupt config when setting default model", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-claw-corrupt-config-"));
  const configPath = path.join(homeDir, "config.json");
  fs.writeFileSync(configPath, "{bad", "utf8");
  const runner = new FakeRunner({});

  await assert.rejects(
    () => clawAdapter.setDefaultModel("openai/gpt-5-mini", runner, { adapter: "claw", homeDir }),
    /Invalid Claw Runtime config JSON/
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), "{bad");
});

test("hermes adapter exposes structured capabilities, resources, and transport metadata", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-"));
  fs.mkdirSync(path.join(homeDir, ".hermes", "memories"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "skills", "checks"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "cron"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "plugins", "memory-provider"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".hermes", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".hermes", "mcp", "github.json"), "{}\n");
  fs.writeFileSync(path.join(homeDir, ".hermes", "config.yaml"), [
    "model: anthropic/claude-sonnet-4",
    "provider: anthropic",
    "terminal:",
    "  backend: docker",
    "channels:",
    "  slack:",
    "    enabled: true",
    "plugins:",
    "  disabled:",
    "    memory-provider: false",
  ].join("\n"));
  fs.writeFileSync(path.join(homeDir, ".hermes", "auth.json"), JSON.stringify({
    providers: {
      anthropic: { apiKey: "fixture-redacted-anthropic-key" },
    },
  }, null, 2));
  fs.writeFileSync(path.join(homeDir, ".hermes", "memories", "MEMORY.md"), "remember this\n");
  fs.writeFileSync(path.join(homeDir, ".hermes", "cron", "daily.yaml"), "schedule: daily\n");

  const runner = new FakeRunner({
    "which hermes": { stdout: "/usr/local/bin/hermes\n" },
    "hermes --version": { stdout: "hermes 0.9.0\n" },
    "hermes auth": { fail: true, stderr: "interactive" },
    "hermes cron status": { stdout: "{}" },
    "hermes gateway status": { stdout: "{}" },
    "hermes skills list": { stdout: "[]" },
    "hermes memory status": { stdout: "{}" },
    "hermes plugins list": { stdout: "[]" },
    "hermes tools --summary": { stdout: "{}" },
    "hermes status --all": { stdout: "{}" },
  });

  const options = {
    adapter: "hermes" as const,
    homeDir,
    gateway: { url: "http://127.0.0.1:4100" },
  };
  const status = await getRuntimeStatusReport(hermesAdapter, runner, options);
  assert.equal(status.capabilityMap.scheduler.supported, true);
  assert.equal(status.capabilityMap.sandbox.supported, true);
  assert.equal(status.capabilityMap.sandbox.status, "degraded");
  assert.equal(status.capabilityMap.plugins.supported, true);
  assert.equal(status.capabilityMap.configuration.supported, true);
  assert.equal(status.capabilityMap.configuration.strategy, "config");

  const resources = await getRuntimeResourceCatalogs(hermesAdapter, runner, options);
  assert.equal(resources.models.defaultModel?.modelId, "anthropic/claude-sonnet-4");
  assert.equal(resources.models.models.some((entry) => entry.id === "anthropic/claude-sonnet-4" && entry.source === "config"), true);
  assert.equal(resources.auth.providers.anthropic?.hasAuth, true);
  assert.equal(resources.auth.providers.anthropic?.maskedCredential?.includes("fixture-redacted-anthropic-key"), false);
  assert.equal(resources.memory.memory.some((entry) => entry.path?.endsWith("MEMORY.md")), true);
  assert.equal(resources.memory.memory.some((entry) => entry.summary?.includes("not exposed by default")), true);
  assert.equal(resources.skills.skills.some((entry) => entry.id === "checks"), true);
  assert.equal(resources.schedulers.schedulers.some((entry) => entry.id === "daily"), true);
  assert.equal(resources.channels.channels.some((entry) => entry.id === "slack" && entry.status === "configured"), true);
  assert.equal(resources.channels.channels.some((entry) => JSON.stringify(entry).includes("secret")), false);
  assert.equal(resources.plugins.plugins.some((entry) => entry.id === "memory-provider" && entry.metadata?.kind === "plugin"), true);
  assert.equal(resources.plugins.plugins.some((entry) => entry.id === "mcp-github" && entry.metadata?.kind === "mcp_server"), true);

  const conversation = getRuntimeSessionDescriptor(hermesAdapter, options);
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
  assert.equal(conversation.sessionPersistence, "runtime");
  assert.equal(conversation.sessionPath?.endsWith(path.join(".hermes", "sessions")), true);
  assert.equal(conversation.sessionStorageContract, "sqlite_with_gateway_transcripts");
  assert.equal(conversation.sessionDatabasePath?.endsWith(path.join(".hermes", "state.db")), true);
  assert.equal(conversation.sessionTranscriptPath?.endsWith(path.join(".hermes", "sessions")), true);
  assert.equal(conversation.sessionIndexPath?.endsWith(path.join(".hermes", "sessions", "sessions.json")), true);
});

test("hermes adapter honors an explicit binary path for runtime probes", async () => {
  const runner = new FakeRunner({
    "custom-hermes --version": { stdout: "hermes 2.0.0\n" },
    "custom-hermes auth": { fail: true, stderr: "interactive" },
    "custom-hermes cron status": { stdout: "{}" },
    "custom-hermes gateway status": { stdout: "{}" },
    "custom-hermes skills list": { stdout: "[]" },
    "custom-hermes memory status": { stdout: "{}" },
    "custom-hermes plugins list": { stdout: "[]" },
    "custom-hermes tools --summary": { stdout: "{}" },
    "custom-hermes status --all": { stdout: "{}" },
  });

  const status = await getRuntimeStatusReport(hermesAdapter, runner, {
    adapter: "hermes",
    binaryPath: "custom-hermes",
  });

  assert.equal(status.cliAvailable, true);
  assert.equal(status.version, "hermes 2.0.0");
  assert.equal(runner.calls.includes("which hermes"), false);
  assert.equal(runner.calls.every((call) => call === "custom-hermes --version" || call.startsWith("custom-hermes ")), true);

  const conversation = getRuntimeSessionDescriptor(hermesAdapter, {
    adapter: "hermes",
    binaryPath: "custom-hermes",
  });
  assert.equal(conversation.buildCliInvocation({
    sessionId: "session-1",
    prompt: "hello",
  }).command, "custom-hermes");
});

test("hermes adapter honors explicit config, auth store, and workspace paths", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-overrides-"));
  const runtimeHome = path.join(homeDir, ".hermes");
  const configPath = path.join(homeDir, "profiles", "project-hermes.yaml");
  const authStorePath = path.join(homeDir, "secrets", "hermes-auth.json");
  const workspacePath = path.join(homeDir, "workspaces", "project-a");
  fs.mkdirSync(runtimeHome, { recursive: true });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.dirname(authStorePath), { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(runtimeHome, "config.yaml"), [
    "model: anthropic/wrong-default",
    "channels:",
    "  slack:",
    "    enabled: true",
  ].join("\n"));
  fs.writeFileSync(configPath, [
    "model: openai/project-model",
    "provider: openai",
    "channels:",
    "  whatsapp:",
    "    enabled: true",
  ].join("\n"));
  fs.writeFileSync(authStorePath, JSON.stringify({
    providers: {
      openai: { apiKey: "fixture-redacted-openai-key" },
    },
  }, null, 2));

  const options = {
    adapter: "hermes" as const,
    homeDir,
    configPath,
    authStorePath,
    workspacePath,
    env: {},
  };
  const locations = hermesAdapter.resolveLocations(options);
  assert.equal(locations.homeDir, runtimeHome);
  assert.equal(locations.configPath, configPath);
  assert.equal(locations.authStorePath, authStorePath);
  assert.equal(locations.workspacePath, workspacePath);

  const resources = await getRuntimeResourceCatalogs(hermesAdapter, new FakeRunner({}), options);
  assert.equal(resources.models.defaultModel?.modelId, "openai/project-model");
  assert.equal(resources.models.models.some((entry) => entry.id === "anthropic/wrong-default"), false);
  assert.equal(resources.auth.providers.openai?.hasAuth, true);
  assert.equal(resources.auth.providers.openai?.source, "runtime");
  assert.equal(resources.auth.providers.openai?.maskedCredential?.includes("fixture-redacted-openai-key"), false);
  assert.equal(resources.channels.channels.some((entry) => entry.id === "whatsapp" && entry.status === "configured"), true);
  assert.equal(resources.channels.channels.some((entry) => entry.id === "slack"), false);
});

test("hermes adapter does not duplicate an already resolved runtime home", async () => {
  const parentHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-home-"));
  const hermesHome = path.join(parentHome, ".hermes");
  fs.mkdirSync(path.join(hermesHome, "memories"), { recursive: true });
  fs.writeFileSync(path.join(hermesHome, "memories", "MEMORY.md"), "memory\n");

  const runner = new FakeRunner({
    "which hermes": { fail: true, stderr: "missing" },
  });

  const status = await getRuntimeStatusReport(hermesAdapter, runner, {
    adapter: "hermes",
    homeDir: hermesHome,
  });
  assert.equal((status.diagnostics.locations as { homeDir?: string }).homeDir, hermesHome);

  const resources = await getRuntimeResourceCatalogs(hermesAdapter, runner, {
    adapter: "hermes",
    homeDir: hermesHome,
  });
  assert.equal(resources.memory.memory[0]?.path?.includes(`${path.sep}.hermes${path.sep}.hermes`), false);
});

test("hermes adapter does not treat provider config as authentication", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-auth-config-"));
  const hermesHome = path.join(homeDir, ".hermes");
  fs.mkdirSync(hermesHome, { recursive: true });
  fs.writeFileSync(path.join(hermesHome, "config.yaml"), [
    "model: anthropic/claude-sonnet-4",
    "provider: anthropic",
  ].join("\n"));

  const auth = await hermesAdapter.getProviderAuth(new FakeRunner({}), {
    adapter: "hermes",
    homeDir,
    env: {},
  });

  assert.equal(auth.anthropic?.hasAuth, false);
  assert.equal(auth.anthropic?.hasApiKey, false);
  assert.equal(auth.anthropic?.authType, null);
  assert.equal(auth.anthropic?.source, "missing");
});

test("hermes adapter redacts config and auth secrets from resource catalogs", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-secret-catalogs-"));
  const hermesHome = path.join(homeDir, ".hermes");
  const authStorePath = path.join(hermesHome, "auth.json");
  fs.mkdirSync(hermesHome, { recursive: true });
  const secretValues = [
    "hermes-provider-api-key-secret-123456",
    "hermes-provider-token-secret-123456",
    "hermes-auth-store-token-secret-123456",
    "hermes-slack-bot-token-secret-123456",
    "hermes-slack-signing-secret-123456",
    "hermes-plugin-token-secret-123456",
    "hermes-mcp-api-key-secret-123456",
    "hermes-env-openrouter-secret-123456",
    "sk-hermes-model-secret-123456",
    "sk-hermes-provider-secret-123456",
  ];
  fs.writeFileSync(path.join(hermesHome, "config.yaml"), [
    "model: project-model",
    "fallback_model: sk-hermes-model-secret-123456",
    "provider: sk-hermes-provider-secret-123456",
    "providers:",
    "  local-agent:",
    "    api_key: hermes-provider-api-key-secret-123456",
    "    token: hermes-provider-token-secret-123456",
    "channels:",
    "  slack:",
    "    enabled: true",
    "    bot_token: hermes-slack-bot-token-secret-123456",
    "    signing_secret: hermes-slack-signing-secret-123456",
    "plugins:",
    "  github:",
    "    enabled: true",
    "    token: hermes-plugin-token-secret-123456",
    "mcp_servers:",
    "  linear:",
    "    api_key: hermes-mcp-api-key-secret-123456",
  ].join("\n"));
  fs.writeFileSync(authStorePath, JSON.stringify({
    providers: {
      openai: { access_token: "hermes-auth-store-token-secret-123456" },
    },
  }, null, 2));

  const resources = await getRuntimeResourceCatalogs(hermesAdapter, new FakeRunner({}), {
    adapter: "hermes",
    homeDir,
    env: {
      OPENROUTER_API_KEY: "hermes-env-openrouter-secret-123456",
    },
  });
  const serialized = JSON.stringify(resources);
  for (const secret of secretValues) {
    assert.equal(serialized.includes(secret), false, `resource catalogs leaked ${secret}`);
  }

  const providerIds = resources.providers.providers.map((provider) => provider.id);
  assert.equal(providerIds.includes("local-agent"), true);
  assert.equal(providerIds.some((id) => id.includes(".api_key") || id.includes(".token")), false);
  assert.equal(providerIds.includes("sk-hermes-provider-secret-123456"), false);
  assert.equal(resources.models.defaultModel?.provider, undefined);
  assert.equal(resources.models.models.find((model) => model.id === "project-model")?.provider, "default");
  assert.equal(resources.models.models.some((model) => model.id === "sk-hermes-model-secret-123456"), false);
  assert.equal(resources.auth.providers["local-agent"]?.hasAuth, true);
  assert.equal(resources.auth.providers.openai?.maskedCredential?.includes("hermes-auth-store-token-secret-123456"), false);
  assert.equal(resources.channels.channels.find((channel) => channel.id === "slack")?.metadata?.configKeys?.includes("channels.slack.bot_token"), false);
  assert.equal(resources.plugins.plugins.some((plugin) => plugin.id.includes("token") || plugin.id.includes("api-key")), false);
});

test("nanobot adapter exposes normalized channels, memory, and sandbox limitations", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-nanobot-"));
  const runtimeHome = path.join(homeDir, ".nanobot");
  const workspacePath = path.join(runtimeHome, "workspace");
  fs.mkdirSync(path.join(workspacePath, "skills"), { recursive: true });
  fs.writeFileSync(path.join(runtimeHome, "config.json"), JSON.stringify({
    channels: {
      telegram: { enabled: true },
      slack: { enabled: false },
      whatsapp: { enabled: true },
    },
  }, null, 2));
  fs.writeFileSync(path.join(workspacePath, "MEMORY.md"), "durable memory\n");
  fs.writeFileSync(path.join(workspacePath, "skills", "review.md"), "skill\n");

  const runner = new FakeRunner({
    "which nanobot": { stdout: "/usr/local/bin/nanobot\n" },
    "nanobot --version": { stdout: "nanobot 0.1.5\n" },
    "nanobot models list --json": { stdout: "[\"openai/gpt-4.1\"]" },
    "nanobot auth login --provider test-provider": { fail: true, stderr: "interactive" },
    "nanobot jobs list": { stdout: "[]" },
    "nanobot channels list": { stdout: "[]" },
  });

  const options = {
    adapter: "nanobot" as const,
    homeDir,
    gateway: { url: "http://127.0.0.1:4200" },
  };
  const status = await getRuntimeStatusReport(nanobotAdapter, runner, options);
  assert.equal(status.capabilityMap.channels.supported, true);
  assert.equal(status.capabilityMap.sandbox.supported, true);
  assert.equal(status.capabilityMap.sandbox.status, "degraded");

  const resources = await getRuntimeResourceCatalogs(nanobotAdapter, runner, options);
  assert.deepEqual(resources.channels.channels.map((entry) => entry.id), ["telegram", "whatsapp"]);
  assert.equal(resources.memory.memory.some((entry) => entry.path?.endsWith("MEMORY.md")), true);
  assert.equal(resources.skills.skills.some((entry) => entry.id === "review"), true);

  const conversation = getRuntimeSessionDescriptor(nanobotAdapter, options);
  assert.equal(conversation.transport.kind, "hybrid");
  assert.equal(conversation.primaryTransport, "gateway");
  assert.equal(conversation.fallbackTransport, "cli");
});
