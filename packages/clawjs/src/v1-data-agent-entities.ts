import { AgentStoreFS, defaultAgent, type Agent, type Connection, type Personality, type SkillCollection } from "@clawjs/agents";
import type { DatabaseServiceStore } from "@clawjs/database";

import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  nowIso,
  parseCsvOrJson,
  parseMaybeJson,
  truthy,
  usage,
  usageError,
  writeUnredactedSuccess,
  writeSuccess,
} from "./v1-data-core.ts";
import type { JsonRecord, V1DataCliInput } from "./v1-data-core.ts";

export function runAgentsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listAgents();
    syncAgentsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw agents get AGENT_ID [--json]");
    const agent = agentStore.readAgent(id);
    writeAgentEntitySuccess(input, agent);
    return agent ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const agent = agentFromInput(input, agentStore);
    if (!agent) return usageError(input, "Usage: claw agents upsert ID --name NAME [--record JSON] [--json]");
    agentStore.writeAgent(agent);
    syncAgentProjection(store, agent);
    writeAgentEntitySuccess(input, agent);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw agents delete AGENT_ID [--json]");
    agentStore.deleteAgent(id);
    const changes = store.sqlite.prepare("DELETE FROM agents WHERE id = ?").run(id).changes;
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "agents"));
}

export function runPersonalitiesCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listPersonalities();
    syncPersonalitiesProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw personalities get PERSONALITY_ID [--json]");
    const personality = agentStore.readPersonality(id);
    writeAgentEntitySuccess(input, personality);
    return personality ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const personality = personalityFromInput(input);
    if (!personality) return usageError(input, "Usage: claw personalities upsert ID --name NAME [--prompt TEXT] [--json]");
    agentStore.writePersonality(personality);
    syncPersonalityProjection(store, personality);
    writeAgentEntitySuccess(input, personality);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw personalities delete PERSONALITY_ID [--json]");
    agentStore.deletePersonality(id);
    const changes = store.sqlite.prepare("DELETE FROM personalities WHERE id = ?").run(id).changes;
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "personalities"));
}

export function runSkillCollectionsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listCollections();
    syncCollectionsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw skill-collections get COLLECTION_ID [--json]");
    const collection = agentStore.readCollection(id);
    writeAgentEntitySuccess(input, collection);
    return collection ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const collection = collectionFromInput(input);
    if (!collection) return usageError(input, "Usage: claw skill-collections upsert ID --name NAME [--tags a,b] [--json]");
    agentStore.writeCollection(collection);
    syncCollectionProjection(store, collection);
    writeAgentEntitySuccess(input, collection);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw skill-collections delete COLLECTION_ID [--json]");
    agentStore.deleteCollection(id);
    const changes = store.sqlite.prepare("DELETE FROM skill_collections WHERE id = ?").run(id).changes;
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "skill-collections"));
}

export function runConnectionsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listConnections();
    syncConnectionsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw connections get CONNECTION_ID [--json]");
    const connection = agentStore.readConnection(id);
    writeAgentEntitySuccess(input, connection);
    return connection ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const connection = connectionFromInput(input);
    if (!connection) return usageError(input, "Usage: claw connections upsert ID --provider PROVIDER --label LABEL --secret-ref REF [--json]");
    agentStore.writeConnection(connection);
    syncConnectionProjection(store, connection);
    writeAgentEntitySuccess(input, connection);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw connections delete CONNECTION_ID [--json]");
    agentStore.deleteConnection(id);
    const changes = store.sqlite.prepare("DELETE FROM connections WHERE id = ?").run(id).changes;
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "connections"));
}

function recordFlag<T>(input: V1DataCliInput): T | null {
  const raw = input.flags.record || input.flags.jsonRecord || input.flags["json-record"];
  if (!raw) return null;
  return parseMaybeJson(raw) as T;
}

function writeAgentEntitySuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.flags["for-host"] === "true") {
    writeUnredactedSuccess(input, payload);
    return;
  }
  writeSuccess(input, payload);
}

function agentFromInput(input: V1DataCliInput, agentStore: AgentStoreFS): Agent | null {
  const record = recordFlag<Agent>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const existing = id ? agentStore.readAgent(id) : null;
  const name = input.flags.name || input.positionals.slice(3).join(" ") || existing?.name || id;
  if (!id || !name) return null;
  return defaultAgent({
    ...existing,
    id,
    name,
    role: input.flags.role ?? existing?.role,
    runtime: (input.flags.runtime ?? existing?.runtime) as Agent["runtime"] | undefined,
    model: input.flags.model ?? existing?.model,
    instructionsFreeText: input.flags.instructions ?? existing?.instructionsFreeText,
    personalityIds: parseCsvOrJson(input.flags.personalities) ?? existing?.personalityIds,
    skillAllowlist: parseCsvOrJson(input.flags.skills) ?? existing?.skillAllowlist,
    skillCollectionIds: parseCsvOrJson(input.flags.collections) ?? existing?.skillCollectionIds,
    secretAllowlist: parseCsvOrJson(input.flags["secret-refs"] || input.flags["secret-ref"]) ?? existing?.secretAllowlist,
    projectIds: parseCsvOrJson(input.flags.projects) ?? existing?.projectIds,
    isBuiltin: input.flags.builtin === undefined ? existing?.isBuiltin : truthy(input.flags.builtin),
    updatedAt: nowIso(),
  });
}

function personalityFromInput(input: V1DataCliInput): Personality | null {
  const record = recordFlag<Personality>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const name = input.flags.name || input.positionals.slice(3).join(" ") || id;
  if (!id || !name) return null;
  const now = nowIso();
  return {
    id,
    name,
    description: input.flags.description || "",
    promptMarkdown: input.flags.prompt || input.flags.body || "",
    version: Number(input.flags.version ?? 1),
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function collectionFromInput(input: V1DataCliInput): SkillCollection | null {
  const record = recordFlag<SkillCollection>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const name = input.flags.name || input.positionals.slice(3).join(" ") || id;
  if (!id || !name) return null;
  const now = nowIso();
  return {
    id,
    name,
    description: input.flags.description || "",
    includedTags: parseCsvOrJson(input.flags.tags) ?? [],
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function connectionFromInput(input: V1DataCliInput): Connection | null {
  const record = recordFlag<Connection>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const provider = input.flags.provider || input.flags.service || input.positionals[3];
  const label = input.flags.label || id;
  if (!id || !provider || !label) return null;
  const now = nowIso();
  return {
    id,
    service: provider as Connection["service"],
    label,
    scopes: parseCsvOrJson(input.flags.scopes) ?? [],
    secretRef: input.flags["secret-ref"] || undefined,
    lastSyncAt: input.flags["last-sync-at"] || undefined,
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function syncAgentsProjection(store: DatabaseServiceStore, agents: Agent[]) {
  for (const agent of agents) syncAgentProjection(store, agent);
}

function syncAgentProjection(store: DatabaseServiceStore, agent: Agent) {
  store.sqlite.prepare(`
    INSERT INTO agents (id, kind, name, runtime, model, builtin, secret_ref, config_json, export_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name,
      runtime = excluded.runtime, model = excluded.model, builtin = excluded.builtin,
      secret_ref = excluded.secret_ref, config_json = excluded.config_json,
      export_path = excluded.export_path, updated_at = excluded.updated_at
  `).run(
    agent.id,
    "agent",
    agent.name,
    agent.runtime,
    agent.model,
    agent.isBuiltin ? 1 : 0,
    agent.secretAllowlist[0] ?? null,
    JSON.stringify(agent),
    `agents/${agent.id}`,
    agent.createdAt,
    agent.updatedAt,
  );
}

function syncPersonalitiesProjection(store: DatabaseServiceStore, personalities: Personality[]) {
  for (const personality of personalities) syncPersonalityProjection(store, personality);
}

function syncPersonalityProjection(store: DatabaseServiceStore, personality: Personality) {
  store.sqlite.prepare(`
    INSERT INTO personalities (id, name, description, prompt, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      prompt = excluded.prompt, version = excluded.version, updated_at = excluded.updated_at
  `).run(personality.id, personality.name, personality.description, personality.promptMarkdown, personality.version, personality.createdAt, personality.updatedAt);
}

function syncCollectionsProjection(store: DatabaseServiceStore, collections: SkillCollection[]) {
  for (const collection of collections) syncCollectionProjection(store, collection);
}

function syncCollectionProjection(store: DatabaseServiceStore, collection: SkillCollection) {
  store.sqlite.prepare(`
    INSERT INTO skill_collections (id, name, description, skills_json, metadata_json, export_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      skills_json = excluded.skills_json, metadata_json = excluded.metadata_json,
      export_path = excluded.export_path, updated_at = excluded.updated_at
  `).run(
    collection.id,
    collection.name,
    collection.description,
    JSON.stringify([]),
    JSON.stringify({ includedTags: collection.includedTags }),
    `skill-collections/${collection.id}`,
    collection.createdAt,
    collection.updatedAt,
  );
}

function syncConnectionsProjection(store: DatabaseServiceStore, connections: Connection[]) {
  for (const connection of connections) syncConnectionProjection(store, connection);
}

function syncConnectionProjection(store: DatabaseServiceStore, connection: Connection) {
  const metadata: JsonRecord = {
    scopes: connection.scopes,
    ...(connection.lastSyncAt ? { lastSyncAt: connection.lastSyncAt } : {}),
  };
  store.sqlite.prepare(`
    INSERT INTO connections (id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, label = excluded.label,
      secret_ref = excluded.secret_ref, config_json = excluded.config_json,
      metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(connection.id, connection.service, connection.label, connection.secretRef ?? null, JSON.stringify(connection), JSON.stringify(metadata), connection.createdAt, connection.updatedAt);
}
