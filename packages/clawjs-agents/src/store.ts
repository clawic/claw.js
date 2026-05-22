import { expandClawHomePath, resolveClawGlobalDataDir } from "@clawjs/core";
// Filesystem-backed store for agent / personality / skill-collection /
// connection records. Mirrors `AgentStore.swift` so both the daemon and
// the macOS app read/write the same bytes when running side by side.
//
// Layout (under `home`, default `~/.claw`):
//
// ```
// agents/<id>/
//   agent.yaml + instructions.md + personalities.yaml + skills.yaml +
//   secrets.yaml + projects.yaml + integrations.yaml +
//   permissions.yaml + delegation.yaml + audit.log
// personalities/<id>/personality.yaml + prompt.md
// skill-collections/<id>/collection.yaml
// connections/<id>/connection.yaml
// ```

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  Agent,
  AgentAuditEntry,
  AgentAutonomyLevel,
  AgentAvatarKind,
  AgentDelegation,
  AgentIntegrationBinding,
  AgentAutonomyOverride,
  Connection,
  ConnectionService,
  DEFAULT_CODEX_AGENT_ID,
  Personality,
  SkillCollection,
  defaultAgent,
} from "./schemas.js";
import {
  emitSimpleYaml,
  parseSimpleYaml,
  type SimpleYamlValue,
  yamlBool,
  yamlInt,
  yamlString,
  yamlStringArray,
} from "./yaml.js";

export interface AgentStoreOptions {
  /** Override `~/.claw/` (used by tests and the daemon test rig). */
  home?: string;
}

export function resolveAgentStoreHome(input: { home?: string; clawHome?: string; homeDir?: string } = {}): string {
  const homeDir = input.homeDir ?? homedir();
  if (input.home) return expandClawHomePath(input.home, homeDir);
  if (input.clawHome) return expandClawHomePath(input.clawHome, homeDir);
  return resolveClawGlobalDataDir({ homeDir });
}

export class AgentStoreFS {
  private readonly home: string;

  constructor(opts: AgentStoreOptions = {}) {
    this.home = resolveAgentStoreHome({ home: opts.home, clawHome: process.env.CLAW_HOME });
    this.ensureDirs();
    this.ensureBuiltins();
  }

  // -- layout ---------------------------------------------------------------

  private dir(...parts: string[]): string { return join(this.home, ...parts); }
  private agentsDir() { return this.dir("agents"); }
  private personalitiesDir() { return this.dir("personalities"); }
  private collectionsDir() { return this.dir("skill-collections"); }
  private connectionsDir() { return this.dir("connections"); }
  private presetsDir() { return this.dir("presets"); }
  private publicMemoryDir() { return this.dir("memory"); }

  private agentDir(id: string) { return join(this.agentsDir(), id); }
  private personalityDir(id: string) { return join(this.personalitiesDir(), id); }
  private collectionDir(id: string) { return join(this.collectionsDir(), id); }
  private connectionDir(id: string) { return join(this.connectionsDir(), id); }

  private ensureDirs() {
    for (const d of [
      this.agentsDir(),
      this.personalitiesDir(),
      this.collectionsDir(),
      this.connectionsDir(),
      this.presetsDir(),
      this.publicMemoryDir(),
    ]) {
      mkdirSync(d, { recursive: true });
    }
  }

  private ensureBuiltins() {
    const builtinAgent = this.agentDir(DEFAULT_CODEX_AGENT_ID);
    if (!existsSync(join(builtinAgent, "agent.yaml"))) {
      mkdirSync(builtinAgent, { recursive: true });
      this.writeAgent(
        defaultAgent({
          id: DEFAULT_CODEX_AGENT_ID,
          name: "Codex",
          role: "Default coding agent",
          runtime: "codex",
          model: "gpt-5.1",
          isBuiltin: true,
        }),
      );
    }
    this.ensureBuiltinPersonality({
      id: "personality.terse-pragma",
      name: "Terse Pragma",
      description: "Drops pleasantries, leads with the answer.",
      promptMarkdown:
        "Reply in the smallest number of tokens that carry the meaning. Lead with the answer. No preamble, no apology, no \"sure thing\".",
    });
    this.ensureBuiltinPersonality({
      id: "personality.ironic-mentor",
      name: "Ironic Mentor",
      description: "Senior engineer voice with dry humor.",
      promptMarkdown:
        "Speak like a senior engineer reviewing a junior teammate's PR. Concise, never condescending, dry humor only when it helps the lesson stick.",
    });
    this.ensureBuiltinCollection({
      id: "collection.research",
      name: "Research",
      description: "Web search, summarisation, evidence-finding skills.",
      includedTags: ["research", "web", "summarize"],
    });
    this.ensureBuiltinCollection({
      id: "collection.engineering",
      name: "Engineering",
      description: "Codebase navigation, refactoring, test-running skills.",
      includedTags: ["engineering", "refactor", "test"],
    });
  }

  private ensureBuiltinPersonality(p: Omit<Personality, "version" | "createdAt" | "updatedAt"> & Partial<Personality>) {
    if (existsSync(join(this.personalityDir(p.id), "personality.yaml"))) return;
    const now = new Date().toISOString();
    this.writePersonality({
      ...p,
      description: p.description ?? "",
      promptMarkdown: p.promptMarkdown ?? "",
      version: p.version ?? 1,
      createdAt: p.createdAt ?? now,
      updatedAt: p.updatedAt ?? now,
    });
  }

  private ensureBuiltinCollection(c: Omit<SkillCollection, "createdAt" | "updatedAt"> & Partial<SkillCollection>) {
    if (existsSync(join(this.collectionDir(c.id), "collection.yaml"))) return;
    const now = new Date().toISOString();
    this.writeCollection({
      ...c,
      description: c.description ?? "",
      includedTags: c.includedTags ?? [],
      createdAt: c.createdAt ?? now,
      updatedAt: c.updatedAt ?? now,
    });
  }

  // -- list APIs ------------------------------------------------------------

  listAgents(): Agent[] {
    const ids = this.safeReaddir(this.agentsDir());
    const result: Agent[] = [];
    for (const id of ids) {
      const a = this.readAgent(id);
      if (a) result.push(a);
    }
    result.sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }

  listPersonalities(): Personality[] {
    const ids = this.safeReaddir(this.personalitiesDir());
    return ids
      .map((id) => this.readPersonality(id))
      .filter((p): p is Personality => p != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listCollections(): SkillCollection[] {
    const ids = this.safeReaddir(this.collectionsDir());
    return ids
      .map((id) => this.readCollection(id))
      .filter((c): c is SkillCollection => c != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listConnections(): Connection[] {
    const ids = this.safeReaddir(this.connectionsDir());
    return ids
      .map((id) => this.readConnection(id))
      .filter((c): c is Connection => c != null)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // -- single record APIs ---------------------------------------------------

  readAgent(id: string): Agent | null {
    const folder = this.agentDir(id);
    const yamlPath = join(folder, "agent.yaml");
    if (!existsSync(yamlPath)) return null;
    const yaml = parseSimpleYaml(readFileSync(yamlPath, "utf8"));
    const instructions = this.safeReadText(join(folder, "instructions.md"));
    const personalityYaml = parseSimpleYaml(this.safeReadText(join(folder, "personalities.yaml")));
    const skillsYaml = parseSimpleYaml(this.safeReadText(join(folder, "skills.yaml")));
    const secretsYaml = parseSimpleYaml(this.safeReadText(join(folder, "secrets.yaml")));
    const projectsYaml = parseSimpleYaml(this.safeReadText(join(folder, "projects.yaml")));
    const bindings: AgentIntegrationBinding[] =
      this.safeReadJson(join(folder, "integrations.yaml")) ?? [];
    const overrides: AgentAutonomyOverride[] =
      this.safeReadJson(join(folder, "permissions.yaml")) ?? [];
    const delegation: AgentDelegation =
      this.safeReadJson(join(folder, "delegation.yaml")) ?? {
        allowedSubagents: [],
        scopeInherits: false,
      };

    return {
      id: yamlString(yaml, "id", id),
      name: yamlString(yaml, "name", "Unnamed agent"),
      role: yamlString(yaml, "role"),
      runtime: (yamlString(yaml, "runtime", "codex") as Agent["runtime"]),
      model: yamlString(yaml, "model", "gpt-5.1"),
      avatar: {
        kind: (yamlString(yaml, "avatarKind", "logoTint") as AgentAvatarKind),
        tintHex: yamlString(yaml, "avatarTintHex", "#7C9CFF"),
        imageRelativePath: yamlString(yaml, "avatarImage") || undefined,
      },
      instructionsFreeText: instructions,
      personalityIds: yamlStringArray(personalityYaml, "personalities"),
      skillAllowlist: yamlStringArray(skillsYaml, "allowlist"),
      skillCollectionIds: yamlStringArray(skillsYaml, "collections"),
      secretAllowlist: yamlStringArray(secretsYaml, "allowlist"),
      secretTags: yamlStringArray(secretsYaml, "tags"),
      projectIds: yamlStringArray(projectsYaml, "projects"),
      integrationBindings: bindings,
      autonomyLevel: (yamlString(yaml, "autonomyLevel", "act_limited") as AgentAutonomyLevel),
      autonomyOverrides: overrides,
      delegation,
      createdAt: yamlString(yaml, "createdAt", new Date(0).toISOString()),
      updatedAt: yamlString(yaml, "updatedAt", new Date(0).toISOString()),
      isBuiltin: yamlBool(yaml, "isBuiltin"),
    };
  }

  writeAgent(agent: Agent) {
    const folder = this.agentDir(agent.id);
    mkdirSync(folder, { recursive: true });
    const yaml = emitSimpleYaml([
      ["id", { kind: "string", value: agent.id }],
      ["name", { kind: "string", value: agent.name }],
      ["role", { kind: "string", value: agent.role }],
      ["runtime", { kind: "string", value: agent.runtime }],
      ["model", { kind: "string", value: agent.model }],
      ["avatarKind", { kind: "string", value: agent.avatar.kind }],
      ["avatarTintHex", { kind: "string", value: agent.avatar.tintHex }],
      ["avatarImage", { kind: "string", value: agent.avatar.imageRelativePath ?? "" }],
      ["autonomyLevel", { kind: "string", value: agent.autonomyLevel }],
      ["isBuiltin", { kind: "bool", value: agent.isBuiltin }],
      ["createdAt", { kind: "string", value: agent.createdAt }],
      ["updatedAt", { kind: "string", value: agent.updatedAt }],
    ]);
    writeFileSync(join(folder, "agent.yaml"), yaml);
    writeFileSync(join(folder, "instructions.md"), agent.instructionsFreeText);
    writeFileSync(
      join(folder, "personalities.yaml"),
      emitSimpleYaml([
        ["personalities", { kind: "array", values: agent.personalityIds.map((v) => ({ kind: "string", value: v })) }],
      ]),
    );
    writeFileSync(
      join(folder, "skills.yaml"),
      emitSimpleYaml([
        ["allowlist", { kind: "array", values: agent.skillAllowlist.map((v) => ({ kind: "string", value: v })) }],
        ["collections", { kind: "array", values: agent.skillCollectionIds.map((v) => ({ kind: "string", value: v })) }],
      ]),
    );
    writeFileSync(
      join(folder, "secrets.yaml"),
      emitSimpleYaml([
        ["allowlist", { kind: "array", values: agent.secretAllowlist.map((v) => ({ kind: "string", value: v })) }],
        ["tags", { kind: "array", values: agent.secretTags.map((v) => ({ kind: "string", value: v })) }],
      ]),
    );
    writeFileSync(
      join(folder, "projects.yaml"),
      emitSimpleYaml([
        ["projects", { kind: "array", values: agent.projectIds.map((v) => ({ kind: "string", value: v })) }],
      ]),
    );
    writeFileSync(join(folder, "integrations.yaml"), JSON.stringify(agent.integrationBindings, null, 2));
    writeFileSync(join(folder, "permissions.yaml"), JSON.stringify(agent.autonomyOverrides, null, 2));
    writeFileSync(join(folder, "delegation.yaml"), JSON.stringify(agent.delegation, null, 2));
  }

  deleteAgent(id: string) {
    const agent = this.readAgent(id);
    if (!agent || agent.isBuiltin) return;
    rmSync(this.agentDir(id), { recursive: true, force: true });
  }

  readPersonality(id: string): Personality | null {
    const folder = this.personalityDir(id);
    const yamlPath = join(folder, "personality.yaml");
    if (!existsSync(yamlPath)) return null;
    const yaml = parseSimpleYaml(readFileSync(yamlPath, "utf8"));
    const prompt = this.safeReadText(join(folder, "prompt.md"));
    return {
      id: yamlString(yaml, "id", id),
      name: yamlString(yaml, "name", "Unnamed personality"),
      description: yamlString(yaml, "description"),
      promptMarkdown: prompt,
      version: yamlInt(yaml, "version", 1),
      createdAt: yamlString(yaml, "createdAt", new Date(0).toISOString()),
      updatedAt: yamlString(yaml, "updatedAt", new Date(0).toISOString()),
    };
  }

  writePersonality(p: Personality) {
    const folder = this.personalityDir(p.id);
    mkdirSync(folder, { recursive: true });
    const yaml = emitSimpleYaml([
      ["id", { kind: "string", value: p.id }],
      ["name", { kind: "string", value: p.name }],
      ["description", { kind: "string", value: p.description }],
      ["version", { kind: "int", value: p.version }],
      ["createdAt", { kind: "string", value: p.createdAt }],
      ["updatedAt", { kind: "string", value: p.updatedAt }],
    ]);
    writeFileSync(join(folder, "personality.yaml"), yaml);
    writeFileSync(join(folder, "prompt.md"), p.promptMarkdown);
  }

  deletePersonality(id: string) {
    rmSync(this.personalityDir(id), { recursive: true, force: true });
  }

  readCollection(id: string): SkillCollection | null {
    const folder = this.collectionDir(id);
    const yamlPath = join(folder, "collection.yaml");
    if (!existsSync(yamlPath)) return null;
    const yaml = parseSimpleYaml(readFileSync(yamlPath, "utf8"));
    return {
      id: yamlString(yaml, "id", id),
      name: yamlString(yaml, "name", "Unnamed collection"),
      description: yamlString(yaml, "description"),
      includedTags: yamlStringArray(yaml, "tags"),
      createdAt: yamlString(yaml, "createdAt", new Date(0).toISOString()),
      updatedAt: yamlString(yaml, "updatedAt", new Date(0).toISOString()),
    };
  }

  writeCollection(c: SkillCollection) {
    const folder = this.collectionDir(c.id);
    mkdirSync(folder, { recursive: true });
    const yaml = emitSimpleYaml([
      ["id", { kind: "string", value: c.id }],
      ["name", { kind: "string", value: c.name }],
      ["description", { kind: "string", value: c.description }],
      ["tags", { kind: "array", values: c.includedTags.map((v) => ({ kind: "string", value: v })) }],
      ["createdAt", { kind: "string", value: c.createdAt }],
      ["updatedAt", { kind: "string", value: c.updatedAt }],
    ]);
    writeFileSync(join(folder, "collection.yaml"), yaml);
  }

  deleteCollection(id: string) {
    rmSync(this.collectionDir(id), { recursive: true, force: true });
  }

  readConnection(id: string): Connection | null {
    const folder = this.connectionDir(id);
    const yamlPath = join(folder, "connection.yaml");
    if (!existsSync(yamlPath)) return null;
    const yaml = parseSimpleYaml(readFileSync(yamlPath, "utf8"));
    const lastSync = yamlString(yaml, "lastSyncAt");
    return {
      id: yamlString(yaml, "id", id),
      service: (yamlString(yaml, "service", "telegram") as ConnectionService),
      label: yamlString(yaml, "label", "Connection"),
      scopes: yamlStringArray(yaml, "scopes"),
      secretRef: yamlString(yaml, "secretRef") || undefined,
      lastSyncAt: lastSync || undefined,
      createdAt: yamlString(yaml, "createdAt", new Date(0).toISOString()),
      updatedAt: yamlString(yaml, "updatedAt", new Date(0).toISOString()),
    };
  }

  writeConnection(c: Connection) {
    const folder = this.connectionDir(c.id);
    mkdirSync(folder, { recursive: true });
    const pairs: Array<[string, SimpleYamlValue]> = [
      ["id", toStr(c.id)],
      ["service", toStr(c.service)],
      ["label", toStr(c.label)],
      ["scopes", { kind: "array", values: c.scopes.map((v) => ({ kind: "string", value: v })) }],
      ["createdAt", toStr(c.createdAt)],
      ["updatedAt", toStr(c.updatedAt)],
    ];
    if (c.secretRef) pairs.push(["secretRef", toStr(c.secretRef)]);
    if (c.lastSyncAt) pairs.push(["lastSyncAt", toStr(c.lastSyncAt)]);
    writeFileSync(join(folder, "connection.yaml"), emitSimpleYaml(pairs));
    rmSync(join(folder, "auth.encrypted"), { force: true });
  }

  deleteConnection(id: string) {
    rmSync(this.connectionDir(id), { recursive: true, force: true });
  }

  writeConnectionSecretRef(connectionId: string, secretRef: string) {
    const current = this.readConnection(connectionId);
    const now = new Date().toISOString();
    this.writeConnection({
      id: connectionId,
      service: current?.service ?? "custom",
      label: current?.label ?? connectionId,
      scopes: current?.scopes ?? [],
      secretRef,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
  }

  readConnectionSecretRef(connectionId: string): string | null {
    return this.readConnection(connectionId)?.secretRef ?? null;
  }

  /** Legacy plaintext auth storage is intentionally disabled. Connection
   * credentials must live in the canonical Secrets vault and be referenced via
   * `secretRef`; agents and integrations cannot resolve plaintext locally. */
  writeConnectionAuth(_connectionId: string, _secret: string) {
    throw new Error("Connection auth plaintext storage is disabled; use writeConnectionSecretRef");
  }

  readConnectionAuth(connectionId: string): string | null {
    rmSync(join(this.connectionDir(connectionId), "auth.encrypted"), { force: true });
    return null;
  }

  appendAudit(agentId: string, entry: AgentAuditEntry) {
    const folder = this.agentDir(agentId);
    mkdirSync(folder, { recursive: true });
    appendFileSync(join(folder, "audit.log"), JSON.stringify(entry) + "\n");
  }

  /** Resolves the system-prompt fragment for `agent` by concatenating
   * each plugged-in personality's `prompt.md` (in order) and appending
   * the agent's free-text instructions at the bottom. */
  resolveSystemPrompt(agent: Agent): string {
    const parts: string[] = [];
    for (const pid of agent.personalityIds) {
      const p = this.readPersonality(pid);
      if (p) parts.push(p.promptMarkdown);
    }
    if (agent.instructionsFreeText.length > 0) {
      parts.push(agent.instructionsFreeText);
    }
    return parts.join("\n\n---\n\n");
  }

  // -- helpers --------------------------------------------------------------

  private safeReaddir(path: string): string[] {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  }

  private safeReadText(path: string): string {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  }

  private safeReadJson<T>(path: string): T | null {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return null;
    }
  }
}

function toStr(value: string) {
  return { kind: "string" as const, value };
}
