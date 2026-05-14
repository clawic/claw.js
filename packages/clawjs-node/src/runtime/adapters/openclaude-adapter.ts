// OpenClaude runtime adapter. Mirrors the `Gitlawb/openclaco` lite
// router: the agent's config lives under `~/.openclaude/`, the
// active routing table at `~/.openclaude.json`, and a single CLI
// (`openclaude`) accepts `-p <prompt>` for one-shot prompts.
//
// The Clawix macOS app drives this adapter via `Agent.runtime ==
// "openclaude"`; the daemon resolves the system prompt by composing
// the agent's plugged-in personalities with its free-text
// instructions before invoking `conversationCli`. The actual prompt
// stream lands back on the bridge via the standard
// `RuntimeSessionAdapter` plumbing the simple-adapter factory wires
// up. No mock / shim — we rely on the binary being installed and
// surface a helpful "OpenClaude CLI not found" via the existing
// runtime status probe when it isn't.

import fs from "fs";
import path from "path";

import type {
  ChannelDescriptor,
  MemoryDescriptor,
  ProviderDescriptor,
  RuntimeFileDescriptor,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";

const OPENCLAUDE_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "AGENT", path: "AGENT.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: false, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: false, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const OPENCLAUDE_PROVIDERS: ProviderDescriptor[] = [
  { id: "anthropic", label: "Anthropic", envVars: ["ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openai", label: "OpenAI", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "openrouter", label: "OpenRouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

function readOpenClaudeDirectory(dirPath: string | undefined): fs.Dirent[] {
  if (!dirPath) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listOpenClaudeMemory(homeDir: string | undefined): MemoryDescriptor[] {
  const memoryFile = homeDir ? path.join(homeDir, "memory.md") : undefined;
  const memoryDir = homeDir ? path.join(homeDir, "memories") : undefined;
  const entries = readOpenClaudeDirectory(memoryDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      id: `openclaude-memory-${entry.name.replace(/\.[^.]+$/, "").toLowerCase()}`,
      label: entry.name.replace(/\.[^.]+$/, ""),
      kind: "knowledge" as const,
      path: memoryDir ? path.join(memoryDir, entry.name) : undefined,
    }));
  if (entries.length > 0) return entries;
  return [{
    id: "openclaude-memory",
    label: "OpenClaude Memory",
    kind: "index",
    path: memoryFile,
    summary: "OpenClaude reads memories from ~/.openclaude/memory.md and ~/.openclaude/memories/.",
  }];
}

function listOpenClaudeSkills(homeDir: string | undefined): SkillDescriptor[] {
  const skillsDir = homeDir ? path.join(homeDir, "skills") : undefined;
  return readOpenClaudeDirectory(skillsDir)
    .filter((entry) => entry.isDirectory() || entry.name.endsWith(".md"))
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: entry.name.replace(/\.[^.]+$/, ""),
      enabled: true,
      scope: "runtime" as const,
      path: skillsDir ? path.join(skillsDir, entry.name) : undefined,
    }));
}

function listOpenClaudeChannels(): ChannelDescriptor[] {
  return [
    { id: "stdio", label: "Stdio", kind: "chat", status: "configured" },
    { id: "telegram", label: "Telegram", kind: "chat", status: "configured" },
  ];
}

function listOpenClaudeSchedulers(): SchedulerDescriptor[] {
  return [{
    id: "openclaude-scheduler",
    label: "OpenClaude Scheduler",
    enabled: false,
    status: "idle",
    kind: "cron",
  }];
}

export const openClaudeAdapter = createSimpleRuntimeAdapter({
  id: "openclaude",
  runtimeName: "OpenClaude",
  stability: "experimental",
  supportLevel: "experimental",
  binary: "openclaude",
  workspaceFiles: OPENCLAUDE_WORKSPACE_FILES,
  homeDirName: ".openclaude",
  configFileName: "config.json",
  authFileName: "auth.json",
  providerCatalog: OPENCLAUDE_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  modelListCommand: ["models", "list", "--json"],
  setDefaultModelArgs: (model) => ["model", model],
  loginArgs: (provider) => ["auth", "login", "--provider", provider],
  setupCommand: () => ({ command: "openclaude", args: ["init"] }),
  probeCommands: {
    skills: ["skills", "list"],
    scheduler: ["cron", "list"],
    channels: ["channels", "list"],
  },
  gatewaySupport: true,
  gatewayKind: "openai-chat-completions",
  conversationDetails: (_options, locations) => ({
    primaryTransport: "cli",
    fallbackTransport: "gateway",
    sessionPersistence: "runtime",
    streamingMode: "cli",
    sessionPath: locations.homeDir ? path.join(locations.homeDir, "sessions") : undefined,
  }),
  capabilityDeclarations: {
    runtime: { supported: true, status: "ready", strategy: "cli" },
    auth: { supported: true, status: "ready", strategy: "config" },
    models: { supported: true, status: "ready", strategy: "cli" },
    memory: { supported: true, status: "ready", strategy: "native" },
    skills: { supported: true, status: "ready", strategy: "native" },
    channels: { supported: true, status: "degraded", strategy: "native" },
    scheduler: { supported: true, status: "degraded", strategy: "native" },
  },
  resourceLoaders: {
    async listMemory(_runner, _options, locations) {
      return listOpenClaudeMemory(locations.homeDir);
    },
    async listSkills(_runner, _options, locations) {
      return listOpenClaudeSkills(locations.homeDir);
    },
    async listChannels() {
      return listOpenClaudeChannels();
    },
    async listSchedulers() {
      return listOpenClaudeSchedulers();
    },
  },
  defaultMemory: (locations) => listOpenClaudeMemory(locations.homeDir),
  defaultSkills: (locations) => listOpenClaudeSkills(locations.homeDir),
  defaultChannels: listOpenClaudeChannels(),
  defaultSchedulers: listOpenClaudeSchedulers(),
  conversationCli: (input) => ({
    command: "openclaude",
    args: input.model ? ["-p", input.prompt, "--model", input.model] : ["-p", input.prompt],
    timeoutMs: 120_000,
    parser: "stdout-text",
  }),
});
