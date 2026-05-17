import fs from "fs";
import os from "os";
import path from "path";

export function createFakeSecretsProxy(): { proxyPath: string; statePath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-telegram-proxy-bin-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "telegram-proxy-state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    webhookUrl: "",
    webhookSecretToken: null,
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
const url = readFlag("--url") || "";
const body = readFlag("--body") || "{}";
const method = url.split("/").pop();
const tokenMatch = url.match(/\\/bot([^/]+)\\//);
const token = tokenMatch ? tokenMatch[1] : "";
const payload = JSON.parse(body);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let result;
switch (method) {
  case "getMe":
    result = {
      id: 42,
      is_bot: true,
      username: "claw_support_bot",
      first_name: "Claw Support",
      can_join_groups: true,
      can_read_all_group_messages: false,
    };
    break;
  case "setWebhook":
    state.webhookUrl = payload.url || "";
    state.webhookSecretToken = payload.secret_token || null;
    result = true;
    break;
  case "getWebhookInfo":
    result = {
      url: state.webhookUrl || "",
      pending_update_count: Array.isArray(state.updates) ? state.updates.length : 0,
      max_connections: 40,
    };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    state.webhookSecretToken = null;
    if (payload.drop_pending_updates) {
      state.updates = [];
    }
    result = true;
    break;
  case "setMyCommands":
    state.commands = Array.isArray(payload.commands) ? payload.commands : [];
    result = true;
    break;
  case "getMyCommands":
    result = state.commands || [];
    break;
  case "sendMessage":
    state.lastSend = payload;
    state.lastSendToken = token;
    result = {
      message_id: 99,
      chat: { id: payload.chat_id, type: "private" },
      text: payload.text,
    };
    break;
  case "sendPhoto":
    state.lastSend = payload;
    state.lastSendToken = token;
    result = {
      message_id: 100,
      chat: { id: payload.chat_id, type: "private" },
      photo: [{ file_id: payload.photo }],
    };
    break;
  case "getUpdates": {
    const offset = typeof payload.offset === "number" ? payload.offset : 0;
    const updates = (state.updates || []).filter((entry) => entry.update_id >= offset);
    const limited = typeof payload.limit === "number" ? updates.slice(0, payload.limit) : updates;
    state.updates = (state.updates || []).filter((entry) => !limited.some((selected) => selected.update_id === entry.update_id));
    result = limited;
    break;
  }
  case "getChat":
    result = {
      id: payload.chat_id,
      type: "private",
      username: "alice",
      first_name: "Alice",
    };
    break;
  case "getChatAdministrators":
    result = [{
      status: "administrator",
      can_be_edited: true,
      can_manage_chat: true,
      user: {
        id: 7,
        is_bot: false,
        username: "admin",
        first_name: "Admin",
      },
    }];
    break;
  case "getChatMember":
    result = {
      status: "member",
      user: {
        id: payload.user_id,
        is_bot: false,
        username: "member",
        first_name: "Member",
      },
    };
    break;
  case "setChatPermissions":
  case "banChatMember":
  case "unbanChatMember":
  case "restrictChatMember":
    result = true;
    break;
  case "createChatInviteLink":
    result = {
      invite_link: "https://t.me/+invite",
      creates_join_request: !!payload.creates_join_request,
    };
    break;
  case "revokeChatInviteLink":
    result = {
      invite_link: payload.invite_link,
      is_revoked: true,
    };
    break;
  default:
    process.stdout.write(JSON.stringify({ ok: false, description: "unsupported method: " + method }));
    process.exit(0);
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

export function createFakeOpenClawMemoryToolchain(): { binDir: string; openclawLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-memory-bin-"));
  const openclawLog = path.join(binDir, "openclaw.log");
  const openclawPath = path.join(binDir, "openclaw");

  fs.writeFileSync(openclawPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "memory" ]; then
  if [ -n "$FAKE_OPENCLAW_MEMORY_SEARCH_FILE" ] && [ -f "$FAKE_OPENCLAW_MEMORY_SEARCH_FILE" ]; then
    cat "$FAKE_OPENCLAW_MEMORY_SEARCH_FILE"
    exit 0
  fi
  if [ -n "$FAKE_OPENCLAW_MEMORY_SEARCH" ]; then
    printf "%s\n" "$FAKE_OPENCLAW_MEMORY_SEARCH"
  else
    printf "%s\n" '{"results":[]}'
  fi
  exit 0
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binDir, openclawLog };
}

export function createExplicitOpenClawToolchain(): { binaryPath: string; openclawLog: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-explicit-runtime-"));
  const openclawLog = path.join(rootDir, "openclaw.log");
  const binaryPath = path.join(rootDir, "custom-openclaw");

  fs.writeFileSync(binaryPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "--version" ]; then
  echo "openclaw 3.2.1"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[],"diagnostics":[]}'
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  exit 1
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binaryPath, openclawLog };
}

export function createOpenClawAuthReadyToolchain(statusJson: unknown): { binaryPath: string; openclawLog: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-auth-ready-"));
  const openclawLog = path.join(rootDir, "openclaw.log");
  const binaryPath = path.join(rootDir, "openclaw");
  const encodedStatus = JSON.stringify(JSON.stringify(statusJson));

  fs.writeFileSync(binaryPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "--version" ]; then
  echo "openclaw 3.2.1"
  exit 0
fi
if [ "$1" = "models" ]; then
  echo ${encodedStatus}
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[],"diagnostics":[]}'
  exit 0
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binaryPath, openclawLog };
}

export function createFakeOpenClawChannelsToolchain(): { binDir: string; configPath: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-channels-"));
  const binDir = path.join(rootDir, "bin");
  const stateDir = path.join(rootDir, "state");
  const configPath = path.join(stateDir, "openclaw.json");
  const openclawPath = path.join(binDir, "openclaw");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18789,
      auth: { token: "test-token" },
    },
    plugins: {
      entries: {
        whatsapp: { enabled: true },
      },
    },
  }, null, 2));
  fs.writeFileSync(openclawPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 1.2.3"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[],"diagnostics":[]}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  printf "%s\\n" "$FAKE_OPENCLAW_CHANNELS_STATUS"
  exit 0
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binDir, configPath };
}

export function createFakeOpenClawPluginToolchain(): {
  binDir: string;
  configPath: string;
  statePath: string;
  openclawLog: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-plugin-bin-"));
  const binDir = path.join(root, "bin");
  const statePath = path.join(root, "openclaw-state.json");
  const configPath = path.join(root, "openclaw.json");
  const openclawLog = path.join(root, "openclaw.log");
  const openclawPath = path.join(binDir, "openclaw");

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    plugins: {},
    gatewayRestarts: 0,
    gatewayCalls: [],
  }, null, 2));
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18789,
      auth: {
        token: "plugin-test-token",
      },
    },
    plugins: {
      slots: {
        contextEngine: "runtime-default",
      },
    },
  }, null, 2));

  fs.writeFileSync(openclawPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const statePath = ${JSON.stringify(statePath)};
const configPath = ${JSON.stringify(configPath)};
const logPath = ${JSON.stringify(openclawLog)};

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function json(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function pluginIdFromSpec(spec) {
  return spec.includes("context") ? "clawjs-context" : "clawjs";
}

fs.appendFileSync(logPath, args.join(" ") + "\\n");
const state = readState();

if (args[0] === "--version") {
  process.stdout.write("openclaw 2026.3.13\\n");
  process.exit(0);
}

if (args[0] === "models" && args[1] === "status") {
  json({});
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "list") {
  json([]);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "list" && args[2] === "--json") {
  json({
    workspaceDir: "/tmp/demo",
    plugins: Object.values(state.plugins),
    diagnostics: [],
  });
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "doctor") {
  process.stdout.write("Plugin doctor: ok\\n");
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "install") {
  const spec = args[2] || "";
  const id = pluginIdFromSpec(spec);
  state.plugins[id] = {
    id,
    name: id,
    version: "0.1.0",
    source: "npm",
    origin: spec,
    enabled: false,
    status: "installed",
    gatewayMethods: id === "clawjs" ? [
      "clawjs.status",
      "clawjs.events.list",
      "clawjs.sessions.inspect",
      "clawjs.subagent.run",
      "clawjs.subagent.wait",
      "clawjs.subagent.messages",
      "clawjs.hooks.status",
      "clawjs.context.status",
      "clawjs.doctor",
    ] : [],
  };
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "enable") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].enabled = true;
    state.plugins[id].status = "loaded";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "disable") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].enabled = false;
    state.plugins[id].status = "installed";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "update") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].version = "0.1.0";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "hooks" && args[1] === "list" && args[2] === "--json") {
  json({
    workspaceDir: "/tmp/demo",
    managedHooksDir: "/tmp/demo/.openclaw/hooks",
    hooks: [{
      name: "session_start",
      managedByPlugin: true,
      source: "clawjs",
      events: ["session_start"],
    }],
  });
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "restart") {
  state.gatewayRestarts += 1;
  writeState(state);
  process.stdout.write("ok\\n");
  process.exit(0);
}

if (args[0] === "gateway" && (args[1] === "start" || args[1] === "stop" || args[1] === "install")) {
  process.stdout.write("ok\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
  const method = args[args.length - 1];
  const params = JSON.parse(readFlag("--params") || "{}");
  state.gatewayCalls.push({ method, params });
  writeState(state);
  const config = readConfig();

  switch (method) {
    case "channels.status":
      json({ ok: true, provider: "test" });
      break;
    case "clawjs.status":
      json({
        pluginId: "clawjs",
        version: "0.1.0",
        health: {
          eventCount: state.gatewayCalls.length,
        },
        features: {
          observability: true,
        },
      });
      break;
    case "clawjs.events.list":
      json({
        items: [{
          kind: params.kind || "session",
          name: "session_start",
          sessionKey: params.sessionKey || null,
        }],
        limit: params.limit || 50,
      });
      break;
    case "clawjs.sessions.inspect":
      json({
        found: true,
        session: {
          sessionKey: params.sessionKey,
          metrics: {
            eventCount: state.gatewayCalls.length,
          },
        },
      });
      break;
    case "clawjs.subagent.run":
      json({ runId: "run:" + params.sessionKey, accepted: true });
      break;
    case "clawjs.subagent.wait":
      json({ runId: params.runId, status: "completed" });
      break;
    case "clawjs.subagent.messages":
      json({ messages: [{ role: "assistant", content: "bridge:" + params.sessionKey }] });
      break;
    case "clawjs.hooks.status":
      json({ allowPromptInjection: false, hooks: ["session_start"] });
      break;
    case "clawjs.context.status":
      json({
        installed: !!state.plugins["clawjs-context"],
        selected: config.plugins && config.plugins.slots && config.plugins.slots.contextEngine === "clawjs-context",
      });
      break;
    case "clawjs.doctor":
      json({ ok: true, issues: [] });
      break;
    case "sessions.list":
      json({
        sessions: [{
          sessionKey: "alpha",
          title: "Native Alpha",
          updatedAt: "2026-04-08T10:00:00.000Z",
        }],
      });
      break;
    case "sessions.preview":
      json({
        sessionKey: params.sessionKey || "alpha",
        title: "Native Alpha",
        preview: "hello from native",
      });
      break;
    case "sessions.resolve":
      json({
        sessionKey: params.sessionKey || "alpha",
        found: true,
      });
      break;
    case "chat.history":
      json({
        sessionKey: params.sessionKey || "alpha",
        messages: [{ role: "assistant", content: "hello from native" }],
      });
      break;
    case "chat.send":
      json({
        accepted: true,
        sessionKey: params.sessionKey || "alpha",
      });
      break;
    case "chat.inject":
      json({
        injected: true,
        sessionKey: params.sessionKey || "alpha",
      });
      break;
    case "chat.abort":
      json({
        aborted: true,
        sessionKey: params.sessionKey || "alpha",
      });
      break;
    default:
      json({ method, params });
      break;
  }
  process.exit(0);
}

process.stdout.write("{}\\n");
process.exit(0);
`, { mode: 0o755 });

  return { binDir, configPath, statePath, openclawLog };
}

export function createFakeSkillSourceToolchain(): { binDir: string; clawhubLog: string; npxLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skill-sources-bin-"));
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

export function createFakeGenerationCommand(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generation-command-bin-"));
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
fs.writeFileSync(outputPath, "generated");
`, { mode: 0o755 });
  return scriptPath;
}

export function withPatchedEnv<TValue>(patch: NodeJS.ProcessEnv, fn: () => Promise<TValue>): Promise<TValue> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

export function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-image-skill-"));
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
const outDir = outDirIndex === -1 ? "" : args[outDirIndex + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "001-generated.png"), "generated-from-openclaw-skill");
`, { mode: 0o755 });
  return { skillsDir, binDir };
}
