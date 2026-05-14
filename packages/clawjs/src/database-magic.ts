import fs from "node:fs";

import {
  DatabaseApiClient,
  DatabaseServiceStore,
  type CollectionDefinition,
  type FieldDefinition,
  type IndexDefinition,
  type RecordEnvelope,
} from "@clawjs/database";
import {
  BUILTIN_COLLECTIONS_BY_ALIAS,
  BUILTIN_COLLECTIONS_BY_NAME,
  resolveClawPersistentSurfacePath,
} from "@clawjs/core";
import { openMainDataStore } from "./v1-data.ts";

export const DB_EXIT_OK = 0;
export const DB_EXIT_FAILURE = 1;
export const DB_EXIT_DEGRADED = 2;
export const DB_EXIT_USAGE = 64;

type Writable = NodeJS.WritableStream;
type DbAction = "list" | "get" | "create" | "update" | "delete" | "schema";

const DB_ACTIONS = new Set<DbAction>(["list", "get", "create", "update", "delete", "schema"]);

const PRODUCTIVITY_COLLECTION_ALIASES: Record<string, string> = {
  task: "tasks",
  tasks: "tasks",
  goal: "goals",
  goals: "goals",
  project: "projects",
  projects: "projects",
  reminder: "reminders",
  reminders: "reminders",
  deadline: "deadlines",
  deadlines: "deadlines",
  note: "notes",
  notes: "notes",
  person: "people",
  people: "people",
  event: "events",
  events: "events",
  thread: "inbox_threads",
  threads: "inbox_threads",
  message: "inbox_messages",
  messages: "inbox_messages",
};

function builtinB2cCollectionAlias(input: string): string | undefined {
  return BUILTIN_COLLECTIONS_BY_ALIAS.get(input);
}

const CUSTOM_COLLECTION_FIELDS: FieldDefinition[] = [
  { name: "title", type: "text" },
  { name: "description", type: "text" },
  { name: "status", type: "text" },
  { name: "tags", type: "json" },
  { name: "metadata", type: "json" },
];

const CUSTOM_COLLECTION_INDEXES: IndexDefinition[] = [
  { name: "title_idx", fields: ["title"] },
  { name: "status_idx", fields: ["status"] },
];

interface DbRuntime {
  ensureNamespace(namespaceId: string): Promise<void>;
  getCollection(namespaceId: string, collectionName: string): Promise<CollectionDefinition | null>;
  ensureCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): Promise<CollectionDefinition>;
  listRecords(namespaceId: string, collectionName: string): Promise<{ total: number; items: RecordEnvelope[] }>;
  getRecord(namespaceId: string, collectionName: string, recordId: string): Promise<RecordEnvelope | null>;
  createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<RecordEnvelope>;
  updateRecord(namespaceId: string, collectionName: string, recordId: string, payload: Record<string, unknown>): Promise<RecordEnvelope>;
  deleteRecord(namespaceId: string, collectionName: string, recordId: string): Promise<boolean>;
}

interface DbRuntimeBundle {
  runtime: DbRuntime;
  mode: "local" | "remote";
  baseUrl?: string;
}

class LocalDbRuntime implements DbRuntime {
  readonly store: DatabaseServiceStore;
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.store = openMainDataStore();
  }

  async ensureNamespace(namespaceId: string): Promise<void> {
    this.store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  }

  async getCollection(namespaceId: string, collectionName: string): Promise<CollectionDefinition | null> {
    return this.store.getCollection(namespaceId, collectionName);
  }

  async ensureCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): Promise<CollectionDefinition> {
    return this.store.ensureCollection(namespaceId, input);
  }

  async listRecords(namespaceId: string, collectionName: string): Promise<{ total: number; items: RecordEnvelope[] }> {
    return this.store.listRecords(namespaceId, collectionName);
  }

  async getRecord(namespaceId: string, collectionName: string, recordId: string): Promise<RecordEnvelope | null> {
    return this.store.getRecord(namespaceId, collectionName, recordId);
  }

  async createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<RecordEnvelope> {
    return this.store.createRecord(namespaceId, collectionName, payload);
  }

  async updateRecord(namespaceId: string, collectionName: string, recordId: string, payload: Record<string, unknown>): Promise<RecordEnvelope> {
    return this.store.updateRecord(namespaceId, collectionName, recordId, payload);
  }

  async deleteRecord(namespaceId: string, collectionName: string, recordId: string): Promise<boolean> {
    return this.store.deleteRecord(namespaceId, collectionName, recordId);
  }
}

class RemoteDbRuntime implements DbRuntime {
  readonly client: DatabaseApiClient;

  constructor(baseUrl: string, token?: string) {
    this.client = new DatabaseApiClient({ baseUrl, token });
  }

  async ensureNamespace(_namespaceId: string): Promise<void> {
    // The remote service seeds `main` already. Custom namespace bootstrap
    // remains an operator concern behind the low-level surface.
  }

  async getCollection(namespaceId: string, collectionName: string): Promise<CollectionDefinition | null> {
    try {
      return await this.client.getCollection(namespaceId, collectionName) as unknown as CollectionDefinition;
    } catch {
      return null;
    }
  }

  async ensureCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): Promise<CollectionDefinition> {
    const current = await this.getCollection(namespaceId, input.name);
    if (current) return current;
    return await this.client.createCollection(namespaceId, input) as unknown as CollectionDefinition;
  }

  async listRecords(namespaceId: string, collectionName: string): Promise<{ total: number; items: RecordEnvelope[] }> {
    return await this.client.listRecords(namespaceId, collectionName) as { total: number; items: RecordEnvelope[] };
  }

  async getRecord(namespaceId: string, collectionName: string, recordId: string): Promise<RecordEnvelope | null> {
    try {
      return await this.client.getRecord(namespaceId, collectionName, recordId) as RecordEnvelope;
    } catch {
      return null;
    }
  }

  async createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<RecordEnvelope> {
    return await this.client.createRecord(namespaceId, collectionName, payload) as RecordEnvelope;
  }

  async updateRecord(namespaceId: string, collectionName: string, recordId: string, payload: Record<string, unknown>): Promise<RecordEnvelope> {
    return await this.client.updateRecord(namespaceId, collectionName, recordId, payload) as RecordEnvelope;
  }

  async deleteRecord(namespaceId: string, collectionName: string, recordId: string): Promise<boolean> {
    const result = await this.client.deleteRecord(namespaceId, collectionName, recordId) as { ok?: boolean };
    return Boolean(result.ok);
  }
}

function writeJson(stream: Writable, payload: unknown): void {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeDbError(stdout: Writable, stderr: Writable, wantsJson: boolean, code: string, message: string): void {
  if (wantsJson) {
    writeJson(stdout, { ok: false, error: { code, message } });
  } else {
    stderr.write(`${message}\n`);
  }
}

function writeWarnings(stream: Writable, warnings: string[]): void {
  if (warnings.length === 0) return;
  for (const warning of warnings) {
    stream.write(`${warning}\n`);
  }
}

function writeHumanAdvisory(stream: Writable, wantsJson: boolean, message: string): void {
  if (wantsJson) return;
  stream.write(`${message}\n`);
}

function readBooleanFlag(argv: string[], flags: Record<string, string>, name: string, fallback = false): boolean {
  if (argv.includes(`--${name}`)) return true;
  const value = flags[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function parseSetFlags(argv: string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") continue;
    const pair = argv[index + 1];
    if (!pair || pair.startsWith("--")) continue;
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = pair.slice(0, equalsIndex).trim();
    const rawValue = pair.slice(equalsIndex + 1).trim();
    if (!key) continue;
    values[key] = parseLooseValue(rawValue);
    index += 1;
  }
  return values;
}

function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) index += 1;
  }
  return positionals;
}

function parseLooseValue(rawValue: string): unknown {
  if (!rawValue.length) return "";
  if ((rawValue.startsWith("{") && rawValue.endsWith("}")) || (rawValue.startsWith("[") && rawValue.endsWith("]"))) {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch {
      return rawValue;
    }
  }
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  return rawValue;
}

function camelCaseFlag(flag: string): string {
  return flag.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("`--data` must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function resolveCollectionName(rawCollection: string): string {
  const normalized = rawCollection.trim().toLowerCase();
  const productivityMatch = PRODUCTIVITY_COLLECTION_ALIASES[normalized];
  if (productivityMatch) return productivityMatch;
  const builtinB2c = builtinB2cCollectionAlias(normalized);
  if (builtinB2c) return builtinB2c;
  return normalized.replace(/[^a-z0-9_]/g, "_");
}

function isKnownDbAction(value: string | undefined): value is DbAction {
  return Boolean(value && DB_ACTIONS.has(value as DbAction));
}

function titleCaseCollection(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function singularCollectionLabel(collectionName: string): string {
  switch (collectionName) {
    case "tasks":
      return "task";
    case "goals":
      return "goal";
    case "projects":
      return "project";
    case "reminders":
      return "reminder";
    case "deadlines":
      return "deadline";
    case "notes":
      return "note";
    case "people":
      return "person";
    case "events":
      return "event";
    case "inbox_threads":
      return "thread";
    case "inbox_messages":
      return "message";
    default:
      return collectionName.endsWith("s") ? collectionName.slice(0, -1) : collectionName;
  }
}

function buildMagicDbUsage(binName = "claw"): string {
  return [
    "Magic database commands:",
    `  ${binName} db <collection> <title>`,
    `  ${binName} db <collection> create [title] [--set key=value ...] [--data JSON]`,
    `  ${binName} db <collection> list`,
    `  ${binName} db <collection> get <id>`,
    `  ${binName} db <collection> update <id> [title] [--set key=value ...] [--data JSON]`,
    `  ${binName} db <collection> delete <id>`,
    `  ${binName} db <collection> schema`,
    "",
    "Examples:",
    `  ${binName} db task "Ship CLI"`,
    `  ${binName} db tasks list`,
    `  ${binName} db leads create --set name=Ada --set website=https://ada.dev`,
    `  ${binName} db leads list --url http://127.0.0.1:4510 --token <token>`,
    `  ${binName} db leads schema`,
  ].join("\n");
}

function getPrimaryField(collectionName: string): string {
  switch (collectionName) {
    case "people":
      return "displayName";
    case "projects":
      return "name";
  }
  const builtinDef = BUILTIN_COLLECTIONS_BY_NAME.get(collectionName);
  if (builtinDef) {
    const fieldNames = new Set(builtinDef.fields.map((f) => f.name));
    if (fieldNames.has("title")) return "title";
    if (fieldNames.has("name")) return "name";
    if (fieldNames.has("displayName")) return "displayName";
    const firstRequired = builtinDef.fields.find((f) => f.required);
    if (firstRequired) return firstRequired.name;
  }
  return "title";
}

function applyDefaults(collectionName: string, payload: Record<string, unknown>, mode: "create" | "update"): void {
  if (mode !== "create") return;
  switch (collectionName) {
    case "tasks":
      payload.status ??= "todo";
      break;
    case "goals":
      payload.status ??= "active";
      break;
    case "projects":
      payload.status ??= "draft";
      break;
    case "reminders":
    case "deadlines":
      payload.status ??= "active";
      break;
    case "people":
      payload.kind ??= "human";
      break;
    default:
      break;
  }
}

function ensureObjectMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return { ...(input as Record<string, unknown>) };
}

function normalizePayload(
  collectionName: string,
  collection: CollectionDefinition,
  input: Record<string, unknown>,
  mode: "create" | "update",
): { payload: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const payload: Record<string, unknown> = { ...input };
  const primaryField = getPrimaryField(collectionName);
  const allowed = new Set(collection.fields.map((field) => field.name));
  const jsonFields = new Set(collection.fields.filter((field) => field.type === "json").map((field) => field.name));
  const rawInput: Record<string, unknown> = {};
  const aliasMap: Record<string, string | undefined> = {
    name: primaryField,
    label: primaryField,
    subject: primaryField,
    body: allowed.has("description") ? "description" : collectionName === "notes" ? "searchText" : undefined,
    content: allowed.has("description") ? "description" : collectionName === "notes" ? "searchText" : undefined,
    notes: allowed.has("description") ? "description" : collectionName === "notes" ? "searchText" : undefined,
    labels: allowed.has("tags") ? "tags" : allowed.has("labels") ? "labels" : undefined,
  };

  for (const [key, destination] of Object.entries(aliasMap)) {
    if (!destination || !(key in payload) || key === destination) continue;
    const value = payload[key];
    if (payload[destination] !== undefined) {
      rawInput[key] = value;
      warnings.push(`Kept "${destination}" and preserved the extra "${key}" value in metadata.`);
      delete payload[key];
      continue;
    }
    warnings.push(`Mapped "${key}" to "${destination}"`);
    payload[destination] = value;
    delete payload[key];
  }

  switch (collectionName) {
    case "notes": {
      const textCandidate = typeof payload.searchText === "string"
        ? payload.searchText
        : typeof payload.description === "string"
          ? payload.description
          : undefined;
      if (textCandidate && payload.searchText === undefined) {
        payload.searchText = textCandidate;
      }
      if (typeof textCandidate === "string" && payload.blocks === undefined) {
        payload.blocks = [{ type: "paragraph", text: textCandidate }];
      }
      break;
    }
    case "people":
      if (payload.displayName === undefined && typeof payload.title === "string") {
        payload.displayName = payload.title;
        delete payload.title;
      }
      break;
    case "projects":
      if (payload.name === undefined && typeof payload.title === "string") {
        payload.name = payload.title;
        delete payload.title;
      }
      break;
    default:
      break;
  }

  applyDefaults(collectionName, payload, mode);

  for (const fieldName of jsonFields) {
    const value = payload[fieldName];
    if (typeof value !== "string") continue;
    if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
      try {
        payload[fieldName] = JSON.parse(value) as unknown;
        continue;
      } catch {
        // Fall through to CSV coercion.
      }
    }
    if (value.includes(",")) {
      payload[fieldName] = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }

  const metadata = ensureObjectMetadata(payload.metadata);
  if (Object.keys(rawInput).length > 0) {
    metadata._rawInput = {
      ...(metadata._rawInput && typeof metadata._rawInput === "object" && !Array.isArray(metadata._rawInput)
        ? metadata._rawInput as Record<string, unknown>
        : {}),
      ...rawInput,
    };
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.has(key)) {
      extras[key] = value;
      delete payload[key];
    }
  }
  if (Object.keys(extras).length > 0) {
    Object.assign(metadata, extras);
  }
  if (Object.keys(metadata).length > 0 && allowed.has("metadata")) {
    payload.metadata = metadata;
  }

  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  return { payload, warnings };
}

function defaultCustomCollection(name: string): {
  name: string;
  displayName: string;
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
} {
  return {
    name,
    displayName: titleCaseCollection(name),
    fields: CUSTOM_COLLECTION_FIELDS,
    indexes: CUSTOM_COLLECTION_INDEXES.map((index) => ({
      ...index,
      name: `${name}_${index.name}`,
    })),
  };
}

function buildCustomCollectionPreview(namespaceId: string, name: string): CollectionDefinition {
  const template = defaultCustomCollection(name);
  const now = new Date(0).toISOString();
  return {
    namespaceId,
    name: template.name,
    displayName: template.displayName,
    fields: template.fields,
    indexes: template.indexes,
    builtin: false,
    protected: false,
    coreFieldNames: template.fields.map((field) => field.name),
    createdAt: now,
    updatedAt: now,
  };
}

function mergeInputData(
  collectionName: string,
  action: "create" | "update",
  positionals: string[],
  flags: Record<string, string>,
  argv: string[],
): { recordId?: string; payload: Record<string, unknown> } {
  const primaryField = getPrimaryField(collectionName);
  const data = parseJsonObject(flags.data);
  const setValues = parseSetFlags(argv);
  const payload: Record<string, unknown> = {
    ...data,
    ...setValues,
  };
  const reservedFlags = new Set([
    "app-id",
    "workspace",
    "workspace-id",
    "agent-id",
    "runtime",
    "url",
    "token",
    "namespace",
    "json",
    "id",
    "data",
    "set",
    "limit",
    "include-archived",
  ]);

  for (const [flag, value] of Object.entries(flags)) {
    if (reservedFlags.has(flag)) continue;
    payload[camelCaseFlag(flag)] ??= parseLooseValue(value);
  }

  if (action === "create") {
    const firstValue = positionals[3];
    if (firstValue && payload[primaryField] === undefined) {
      payload[primaryField] = firstValue;
    }
    return { payload };
  }

  const recordId = positionals[3] || flags.id;
  if (!recordId) {
    throw new Error("record id is required");
  }
  const trailingValue = positionals[4];
  if (trailingValue && payload[primaryField] === undefined) {
    payload[primaryField] = trailingValue;
  }
  return { recordId, payload };
}

function pickDisplayField(record: RecordEnvelope, collectionName: string): string {
  const primaryField = getPrimaryField(collectionName);
  const value = record[primaryField];
  if (typeof value === "string" && value.trim()) return value;
  return record.id;
}

function localMigrationKey(namespaceId: string): string {
  return `legacy_productivity_imported_at:${namespaceId}`;
}

function migrateLegacyWorkspaceData(runtime: LocalDbRuntime, namespaceId: string): void {
  const migrationKey = localMigrationKey(namespaceId);
  if (runtime.store.getMeta(migrationKey)) return;

  const legacyPath = resolveClawPersistentSurfacePath(
    "claw.database.legacy_productivity",
    runtime.workspaceRoot,
  );
  if (!fs.existsSync(legacyPath)) {
    runtime.store.setMeta(migrationKey, new Date().toISOString());
    return;
  }

  try {
    runtime.store.sqlite.prepare("ATTACH DATABASE ? AS legacy_productivity").run(legacyPath);
    const rows = runtime.store.sqlite.prepare(`
      SELECT collection_name, record_id, payload_json
      FROM legacy_productivity.workspace_records
      WHERE collection_name IN (
        'tasks', 'goals', 'projects', 'reminders', 'deadlines',
        'notes', 'people', 'events', 'inbox_threads', 'inbox_messages'
      )
      ORDER BY collection_name ASC, record_id ASC
    `).all() as Array<{ collection_name: string; record_id: string; payload_json: string }>;

    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const collection = runtime.store.getCollection(namespaceId, row.collection_name);
      if (!collection) continue;
      const normalized = normalizePayload(row.collection_name, collection, payload, "create").payload;
      runtime.store.putRecord({
        namespaceId,
        collectionName: row.collection_name,
        recordId: row.record_id,
        payload: normalized,
        createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
      });
    }
  } catch {
    // Ignore broken legacy stores and keep the new database authoritative.
  } finally {
    try {
      runtime.store.sqlite.exec("DETACH DATABASE legacy_productivity");
    } catch {
      // noop
    }
    runtime.store.setMeta(migrationKey, new Date().toISOString());
  }
}

async function createRuntime(workspaceRoot: string, flags: Record<string, string>, namespaceId: string): Promise<DbRuntimeBundle> {
  if (flags.url) {
    return {
      runtime: new RemoteDbRuntime(flags.url, flags.token),
      mode: "remote",
      baseUrl: flags.url,
    };
  }
  const runtime = new LocalDbRuntime(workspaceRoot);
  await runtime.ensureNamespace(namespaceId);
  migrateLegacyWorkspaceData(runtime, namespaceId);
  return {
    runtime,
    mode: "local",
  };
}

function formatHumanValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function truncateCell(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

function renderRecordTable(items: RecordEnvelope[], collectionName: string): string {
  const rows = items.map((record) => ({
    id: record.id,
    label: pickDisplayField(record, collectionName),
    status: typeof record.status === "string" ? record.status : "",
    updated: typeof record.updatedAt === "string" ? record.updatedAt : "",
  }));
  const widths = {
    id: Math.max(2, ...rows.map((row) => row.id.length)),
    label: Math.min(36, Math.max(5, ...rows.map((row) => row.label.length))),
    status: Math.max(6, ...rows.map((row) => row.status.length)),
    updated: Math.max(7, ...rows.map((row) => row.updated.length)),
  };
  const formatRow = (row: { id: string; label: string; status: string; updated: string }) => [
    truncateCell(row.id, widths.id).padEnd(widths.id),
    truncateCell(row.label, widths.label).padEnd(widths.label),
    truncateCell(row.status, widths.status).padEnd(widths.status),
    truncateCell(row.updated, widths.updated),
  ].join("  ").trimEnd();

  return [
    formatRow({ id: "ID", label: "LABEL", status: "STATUS", updated: "UPDATED" }),
    ...rows.map(formatRow),
  ].join("\n");
}

function renderRecordDetail(record: RecordEnvelope): string {
  const preferredOrder = ["id", "title", "name", "displayName", "status", "description", "createdAt", "updatedAt", "archivedAt"];
  const seen = new Set<string>();
  const keys = [
    ...preferredOrder.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !preferredOrder.includes(key)).sort(),
  ];
  return keys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => `${key}: ${formatHumanValue(record[key])}`)
    .join("\n");
}

function renderSchemaDetail(collection: CollectionDefinition, exists: boolean): string {
  const lines = [
    `collection: ${collection.name}`,
    `displayName: ${collection.displayName}`,
    `protected: ${collection.protected ? "yes" : "no"}`,
    `exists: ${exists ? "yes" : "template"}`,
    "fields:",
    ...collection.fields.map((field) => {
      const suffix: string[] = [];
      suffix.push(field.type);
      if (field.required) suffix.push("required");
      if (field.relation?.collectionName) suffix.push(`-> ${field.relation.collectionName}`);
      if (field.options?.length) suffix.push(field.options.join("|"));
      return `  - ${field.name}: ${suffix.join(", ")}`;
    }),
  ];
  if (collection.indexes.length > 0) {
    lines.push("indexes:");
    lines.push(...collection.indexes.map((index) => `  - ${index.name}: ${index.fields.join(", ")}`));
  }
  return lines.join("\n");
}

function buildCreateHint(collectionName: string, binName = "claw"): string {
  const singular = singularCollectionLabel(collectionName);
  return `Try: ${binName} db ${singular} "First ${singular}"`;
}

export async function runMagicDbCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
  binName?: string;
}): Promise<number> {
  const { argv, flags, workspaceRoot, stdout, stderr, wantsJson } = input;
  let { positionals } = input;
  const binName = input.binName ?? "claw";
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const rawCollection = positionals[1];
  const rawAction = positionals[2];
  const action = isKnownDbAction(rawAction) ? rawAction : rawCollection ? "create" : undefined;

  if (wantsHelp) {
    stdout.write(`${buildMagicDbUsage(binName)}\n`);
    return DB_EXIT_OK;
  }

  if (!rawCollection || !action) {
    stdout.write(`${buildMagicDbUsage(binName)}\n`);
    return DB_EXIT_USAGE;
  }

  if (rawCollection === "memory" && rawAction === "search") {
    writeDbError(stdout, stderr, wantsJson, "usage_error", "Use `claw memory search <query>` for memory search.");
    return DB_EXIT_USAGE;
  }

  if (!isKnownDbAction(rawAction)) {
    positionals = [positionals[0], positionals[1], "create", ...positionals.slice(2)];
  }

  const namespaceId = flags.namespace ?? "main";
  const collectionName = resolveCollectionName(rawCollection);
  const { runtime, mode, baseUrl } = await createRuntime(workspaceRoot, flags, namespaceId);
  await runtime.ensureNamespace(namespaceId);
  writeHumanAdvisory(stderr, wantsJson, mode === "remote"
    ? `Using remote database at ${baseUrl}`
    : "Using local database for this project");

  let collection = await runtime.getCollection(namespaceId, collectionName);
  let collectionCreated = false;
  if (!collection && (action === "create" || action === "update")) {
    collection = await runtime.ensureCollection(namespaceId, defaultCustomCollection(collectionName));
    collectionCreated = !collection.builtin;
  }

  if (action === "schema") {
    const schema = collection ?? buildCustomCollectionPreview(namespaceId, collectionName);
    if (wantsJson) {
      writeJson(stdout, {
        exists: Boolean(collection),
        collection: schema,
        autoCreateOnWrite: !schema.builtin,
      });
    } else {
      stdout.write(`${renderSchemaDetail(schema, Boolean(collection))}\n`);
    }
    return DB_EXIT_OK;
  }

  if (!collection && action === "list") {
    if (wantsJson) writeJson(stdout, []);
    else stdout.write(`No ${collectionName} yet\n${buildCreateHint(collectionName, binName)}\n`);
    return DB_EXIT_OK;
  }

  if (!collection) {
    writeDbError(stdout, stderr, wantsJson, "not_found", `Collection ${collectionName} does not exist.`);
    return DB_EXIT_FAILURE;
  }

  if (action === "list") {
    const records = await runtime.listRecords(namespaceId, collectionName);
    const items = readBooleanFlag(argv, flags, "include-archived", false)
      ? records.items
      : records.items.filter((record) => !record.archivedAt);
    if (wantsJson) writeJson(stdout, items);
    else if (items.length === 0) stdout.write(`No ${collectionName} yet\n${buildCreateHint(collectionName, binName)}\n`);
    else stdout.write(`${renderRecordTable(items, collectionName)}\n`);
    return DB_EXIT_OK;
  }

  if (action === "get") {
    const recordId = positionals[3] || flags.id;
    if (!recordId) {
      writeDbError(stdout, stderr, wantsJson, "usage_error", "Usage: claw db <collection> get <id>");
      return DB_EXIT_USAGE;
    }
    const record = await runtime.getRecord(namespaceId, collectionName, recordId);
    if (!record) {
      writeDbError(stdout, stderr, wantsJson, "not_found", `${collectionName} record not found: ${recordId}`);
      return DB_EXIT_FAILURE;
    }
    if (wantsJson) writeJson(stdout, record);
    else stdout.write(`${renderRecordDetail(record)}\n`);
    return DB_EXIT_OK;
  }

  if (action === "delete") {
    const recordId = positionals[3] || flags.id;
    if (!recordId) {
      writeDbError(stdout, stderr, wantsJson, "usage_error", "Usage: claw db <collection> delete <id>");
      return DB_EXIT_USAGE;
    }
    const removed = await runtime.deleteRecord(namespaceId, collectionName, recordId);
    if (!removed) {
      writeDbError(stdout, stderr, wantsJson, "not_found", `${collectionName} record not found: ${recordId}`);
      return DB_EXIT_FAILURE;
    }
    if (wantsJson) writeJson(stdout, { ok: true });
    else stdout.write(`Deleted ${singularCollectionLabel(collectionName)} ${recordId}\n`);
    return DB_EXIT_OK;
  }

  try {
    const { recordId, payload: rawPayload } = mergeInputData(collectionName, action, positionals, flags, argv);
    const { payload, warnings } = normalizePayload(collectionName, collection, rawPayload, action);
    if (!wantsJson) writeWarnings(stderr, warnings);
    const record = action === "create"
      ? await runtime.createRecord(namespaceId, collectionName, payload)
      : await runtime.updateRecord(namespaceId, collectionName, recordId!, payload);
    if (wantsJson) writeJson(stdout, record);
    else {
      if (collectionCreated) {
        writeHumanAdvisory(stderr, wantsJson, `Created collection "${collectionName}"`);
      }
      const label = pickDisplayField(record, collectionName);
      if (action === "create") stdout.write(`Created ${singularCollectionLabel(collectionName)} ${record.id} "${label}"\n`);
      else stdout.write(`Updated ${singularCollectionLabel(collectionName)} ${record.id}\n`);
    }
    return DB_EXIT_OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeDbError(stdout, stderr, wantsJson, message.includes("JSON") ? "invalid_json" : "internal_error", message);
    return DB_EXIT_FAILURE;
  }
}

function translateProductivityArgs(group: string, command: string, subcommand: string | undefined, flags: Record<string, string>, argv: string[]): string[] | null {
  switch (group) {
    case "tasks":
      if (command === "complete") {
        const id = subcommand || flags.id;
        return id ? ["db", "tasks", "update", id, "--set", "status=done"] : null;
      }
      break;
    case "reminders":
    case "deadlines":
      if (command === "pause" || command === "resume") {
        const id = subcommand || flags.id;
        const status = command === "pause" ? "paused" : "active";
        return id ? ["db", group, "update", id, "--set", `status=${status}`] : null;
      }
      break;
    case "people":
      if (command === "upsert") {
        return subcommand ? ["db", "people", "create", subcommand] : ["db", "people", "create"];
      }
      break;
    default:
      break;
  }

  if (!["list", "get", "create", "update", "delete"].includes(command)) return null;
  const args = ["db", group, command];
  if (subcommand) args.push(subcommand);

  for (const [flag, value] of Object.entries(flags)) {
    if (flag === "json") continue;
    if (flag === "workspace" || flag === "workspace-id" || flag === "agent-id" || flag === "app-id") continue;
    args.push(`--${flag}`, value);
  }

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") continue;
    const pair = argv[index + 1];
    if (!pair) continue;
    args.push("--set", pair);
    index += 1;
  }
  return args;
}

export async function runProductivityDbAlias(input: {
  group: string;
  command: string;
  subcommand?: string;
  argv: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
}): Promise<number | null> {
  const translated = translateProductivityArgs(input.group, input.command, input.subcommand, input.flags, input.argv);
  if (!translated) return null;
  return await runMagicDbCli({
    argv: translated,
    positionals: extractPositionals(translated),
    flags: input.flags,
    workspaceRoot: input.workspaceRoot,
    stdout: input.stdout,
    stderr: input.stderr,
    wantsJson: input.wantsJson,
    binName: "claw",
  });
}

export function isProductivityDbAliasGroup(group: string): boolean {
  return [
    "tasks",
    "goals",
    "projects",
    "reminders",
    "deadlines",
    "notes",
    "people",
    "events",
  ].includes(group);
}

export function productivityDbAliasSupports(group: string, command: string): boolean {
  if (group === "tasks" && command === "complete") return true;
  if ((group === "reminders" || group === "deadlines") && (command === "pause" || command === "resume")) return true;
  if (group === "people" && command === "upsert") return true;
  return ["list", "get", "create", "update", "delete"].includes(command);
}

export function isDbMagicIncludeArchived(argv: string[], flags: Record<string, string>): boolean {
  return readBooleanFlag(argv, flags, "include-archived", false);
}

export async function runMagicWorkspaceSearch(input: {
  argv: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
}): Promise<number> {
  const query = input.flags.query || input.argv[2];
  if (!query) {
    input.stderr.write("Usage: claw workspace-search query <query> [--domains tasks,notes,...]\n");
    return DB_EXIT_USAGE;
  }

  const namespaceId = input.flags.namespace ?? "main";
  const { runtime } = await createRuntime(input.workspaceRoot, input.flags, namespaceId);
  const includeArchived = readBooleanFlag(input.argv, input.flags, "include-archived", false);
  const domains = (input.flags.domains ?? "tasks,goals,projects,reminders,deadlines,notes,people,inbox,events")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const collectionNames = domains.flatMap((domain) => {
    if (domain === "inbox") return ["inbox_threads"];
    return [resolveCollectionName(domain)];
  });

  const normalizedQuery = query.toLowerCase();
  const results: Array<{
    domain: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
    strategy: "keyword";
    matchedFields: string[];
    updatedAt: string;
  }> = [];

  for (const collectionName of collectionNames) {
    const collection = await runtime.getCollection(namespaceId, collectionName);
    if (!collection) continue;
    const listed = await runtime.listRecords(namespaceId, collectionName);
    for (const record of listed.items) {
      if (!includeArchived && record.archivedAt) continue;
      const haystack = JSON.stringify(record).toLowerCase();
      if (!haystack.includes(normalizedQuery)) continue;
      results.push({
        domain: collectionName.startsWith("inbox_") ? "inbox" : collectionName,
        id: record.id,
        title: pickDisplayField(record, collectionName),
        snippet: typeof record.searchText === "string"
          ? record.searchText
          : typeof record.description === "string"
            ? record.description
            : JSON.stringify(record).slice(0, 160),
        score: normalizedQuery.length * 10,
        strategy: "keyword",
        matchedFields: ["text"],
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
      });
    }
  }

  if (input.wantsJson) writeJson(input.stdout, results);
  else input.stdout.write(`${results.map((result) => `${result.domain} ${result.id} ${result.title}`).join("\n")}\n`);
  return results.length > 0 ? DB_EXIT_OK : DB_EXIT_DEGRADED;
}
