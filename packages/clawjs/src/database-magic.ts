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
} from "@clawjs/core";
import fs from "fs";
import path from "path";
import { CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { scheduleDatabaseRecordSearchEvent, scheduleDocumentBlocksSearchEvent, scheduleElnRecordsSearchEvent, scheduleFinanceRecordsSearchEvent, scheduleWorkItemsSearchEvent } from "./cli-search-events.ts";
import { openMainDataStore } from "./v1-data.ts";

const DB_EXIT_OK = 0;
const DB_EXIT_FAILURE = 1;
const DB_EXIT_DEGRADED = 2;
const DB_EXIT_USAGE = 64;

type Writable = NodeJS.WritableStream;

const FINANCE_SEARCH_COLLECTIONS = new Set([
  "financial_accounts",
  "transactions",
  "invoices",
  "payment_intents",
  "accounting_entries",
  "accounting_lines",
]);

const ELN_SEARCH_COLLECTIONS = new Set([
  "lab_notebooks",
  "notebook_entries",
  "protocol_runs",
  "experiment_observations",
]);

const WORK_SEARCH_COLLECTIONS = new Set([
  "tasks",
  "projects",
  "goals",
  "people",
  "inbox_threads",
  "inbox_messages",
  "events",
  "reminders",
  "deadlines",
  "blockers",
  "decisions",
  "assignments",
  "handoffs",
  "approvals",
  "work_sessions",
  "artifacts",
]);
type DbAction = "list" | "get" | "create" | "update" | "delete" | "schema" | "query";

const DB_ACTIONS = new Set<DbAction>(["list", "get", "create", "update", "delete", "schema", "query"]);

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
  listRecords(namespaceId: string, collectionName: string, options?: { filter?: Record<string, unknown> }): Promise<{ total: number; items: RecordEnvelope[] }>;
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
    const dataDir = localDatabaseDataDir(workspaceRoot);
    fs.mkdirSync(dataDir, { recursive: true });
    const previousDataDir = process.env.CLAW_DATA_DIR;
    process.env.CLAW_DATA_DIR = dataDir;
    try {
      this.store = openMainDataStore({
        ...process.env,
        CLAW_DATA_DIR: dataDir,
      });
    } finally {
      if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
      else process.env.CLAW_DATA_DIR = previousDataDir;
    }
  }

  async ensureNamespace(namespaceId: string): Promise<void> {
    this.store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  }

  async getCollection(namespaceId: string, collectionName: string): Promise<CollectionDefinition | null> {
    return this.store.getCollection(namespaceId, collectionName);
  }

  async listRecords(namespaceId: string, collectionName: string, options: { filter?: Record<string, unknown> } = {}): Promise<{ total: number; items: RecordEnvelope[] }> {
    return this.store.listRecords(namespaceId, collectionName, options);
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

function localDatabaseDataDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".claw", "data");
}

function scheduleLocalSearchEventsForRecord(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  collectionName: string;
  record: Record<string, unknown>;
  dataDir: string;
  flags: Record<string, string>;
}): void {
  const recordId = typeof input.record.id === "string" ? input.record.id : undefined;
  if (!recordId) return;
  scheduleDatabaseRecordSearchEvent({
    operation: input.operation,
    namespaceId: input.namespaceId,
    collectionName: input.collectionName,
    recordId,
    dataDir: input.dataDir,
    flags: input.flags,
  });
  if (FINANCE_SEARCH_COLLECTIONS.has(input.collectionName)) {
    scheduleFinanceRecordsSearchEvent({
      operation: input.operation,
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId,
      dataDir: input.dataDir,
      flags: input.flags,
    });
  }
  if (ELN_SEARCH_COLLECTIONS.has(input.collectionName)) {
    scheduleElnRecordsSearchEvent({
      operation: input.operation,
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId,
      dataDir: input.dataDir,
      flags: input.flags,
    });
  }
  if (WORK_SEARCH_COLLECTIONS.has(input.collectionName)) {
    scheduleWorkItemsSearchEvent({
      operation: input.operation,
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId,
      dataDir: input.dataDir,
      flags: input.flags,
    });
  }
  const documentEvent = documentBlocksSearchEventForRecord(input.operation, input.namespaceId, input.collectionName, input.record);
  if (!documentEvent) return;
  scheduleDocumentBlocksSearchEvent({
    ...documentEvent,
    dataDir: input.dataDir,
    flags: input.flags,
  });
}

function documentBlocksSearchEventForRecord(
  operation: "upsert" | "delete",
  namespaceId: string,
  collectionName: string,
  record: Record<string, unknown>,
): {
  operation: "upsert" | "delete";
  namespaceId: string;
  documentId: string;
  collectionName: "documents" | "document_blocks";
  recordId: string;
} | null {
  const recordId = typeof record.id === "string" ? record.id : undefined;
  if (!recordId) return null;
  if (collectionName === "documents") {
    return { operation, namespaceId, documentId: recordId, collectionName, recordId };
  }
  if (collectionName !== "document_blocks") return null;
  const documentId = typeof record.documentId === "string" ? record.documentId : undefined;
  if (!documentId) return null;
  return { operation: "upsert", namespaceId, documentId, collectionName, recordId };
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

  async listRecords(namespaceId: string, collectionName: string, options: { filter?: Record<string, unknown> } = {}): Promise<{ total: number; items: RecordEnvelope[] }> {
    return await this.client.listRecords(namespaceId, collectionName, {
      filter: options.filter ? JSON.stringify(options.filter) : undefined,
    }) as { total: number; items: RecordEnvelope[] };
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

function dbJsonMeta(input: {
  positionals: string[];
}, collectionName?: string, action?: string): Record<string, unknown> {
  const invokedCommand = input.positionals[0] ?? "db";
  const subcommand = [collectionName ?? input.positionals[1], action ?? input.positionals[2]].filter(Boolean).join(" ");
  return {
    invokedCommand,
    ...(subcommand ? { subcommand } : {}),
    ...(collectionName ? { collection: collectionName } : {}),
    ...(action ? { action } : {}),
  };
}

function writeDbJson(stdout: Writable, data: unknown, meta: Record<string, unknown>): void {
  writeCommandJsonOk(stdout, "database", data, meta);
}

function writeDbError(input: {
  positionals: string[];
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
}, code: string, message: string, exitCode: number, meta: Record<string, unknown> = dbJsonMeta(input)): void {
  if (input.wantsJson) {
    writeCommandJsonError(input.stdout, "database", new CliHandledError(code, message, exitCode), meta);
  } else {
    input.stderr.write(`${message}\n`);
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

function parseOptionalJsonObject(value: string | undefined, flagName: string): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  try {
    return parseJsonObject(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`--${flagName}: ${message}`);
  }
}

function resolveCollectionName(rawCollection: string): string {
  const normalized = rawCollection.trim().toLowerCase();
  const productivityMatch = PRODUCTIVITY_COLLECTION_ALIASES[normalized];
  if (productivityMatch) return productivityMatch;
  const builtinAlias = BUILTIN_COLLECTIONS_BY_ALIAS.get(normalized);
  if (builtinAlias) return builtinAlias;
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
    `  ${binName} db <collection> query <text>`,
    `  ${binName} db <collection> get <id>`,
    `  ${binName} db <collection> update <id> [title] [--set key=value ...] [--data JSON]`,
    `  ${binName} db <collection> delete <id>`,
    `  ${binName} db <collection> schema`,
    "",
    "Examples:",
    `  ${binName} db task "Ship CLI"`,
    `  ${binName} db tasks list`,
    `  ${binName} database collection create --namespace main --name leads --fields '[{"name":"title","type":"text"},{"name":"metadata","type":"json"}]'`,
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
    case "participants":
    case "learners":
      return "displayName";
    case "samples":
    case "organisms":
    case "evidence_sources":
    case "quality_gaps":
      return "label";
    case "symptom_logs":
      return "symptom";
    case "invoices":
      return "number";
    case "transactions":
      return "description";
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
    case "encounters":
      payload.status ??= "planned";
      payload.encounterType ??= "visit";
      break;
    case "symptom_logs":
      payload.loggedAt ??= new Date().toISOString();
      break;
    case "deals":
      payload.status ??= "open";
      break;
    case "invoices":
      payload.status ??= "draft";
      break;
    case "payment_intents":
      payload.status ??= "requires_payment_method";
      break;
    case "products_catalog":
      payload.active ??= true;
      break;
    case "legal_cases":
      payload.status ??= "open";
      break;
    case "legal_clients":
      payload.status ??= "active";
      payload.role ??= "client";
      payload.conflictStatus ??= "unknown";
      break;
    case "services":
      payload.status ??= "active";
      break;
    case "incidents":
      payload.status ??= "open";
      payload.severity ??= "sev3";
      break;
    case "studies":
      payload.status ??= "planned";
      break;
    case "participants":
      payload.status ??= "screening";
      payload.consentStatus ??= "unknown";
      break;
    case "samples":
      payload.status ??= "collected";
      break;
    case "organisms":
      payload.status ??= "active";
      break;
    case "biology_experiments":
      payload.status ??= "planned";
      break;
    case "lab_notebooks":
      payload.status ??= "active";
      payload.openedAt ??= new Date().toISOString();
      break;
    case "notebook_entries":
      payload.status ??= "draft";
      payload.entryType ??= "note";
      payload.authoredAt ??= new Date().toISOString();
      break;
    case "protocol_runs":
      payload.status ??= "planned";
      break;
    case "experiment_observations":
      payload.status ??= "recorded";
      payload.quality ??= "unknown";
      payload.observedAt ??= new Date().toISOString();
      break;
    case "assays":
      payload.status ??= "ordered";
      break;
    case "learners":
      payload.status ??= "active";
      break;
    case "courses":
      payload.status ??= "enrolled";
      break;
    case "employees":
      payload.status ??= "active";
      break;
    case "time_off_requests":
      payload.status ??= "pending";
      payload.kind ??= "vacation";
      break;
    case "performance_reviews":
      payload.status ??= "draft";
      break;
    case "payroll_runs":
      payload.status ??= "draft";
      break;
    case "property_listings":
      payload.status ??= "draft";
      break;
    case "property_visits":
      payload.visitedAt ??= new Date().toISOString();
      break;
    case "property_offers":
      payload.status ??= "pending";
      payload.offeredAt ??= new Date().toISOString();
      break;
    case "property_inspections":
      payload.inspectedAt ??= new Date().toISOString();
      break;
    case "vehicle_maintenance":
    case "appliance_maintenance":
      payload.performedAt ??= new Date().toISOString();
      break;
    case "suppliers":
      payload.status ??= "active";
      break;
    case "purchase_orders":
      payload.status ??= "draft";
      payload.orderedAt ??= new Date().toISOString();
      break;
    case "purchase_order_line_items":
      payload.status ??= "ordered";
      break;
    case "warehouses":
      payload.status ??= "active";
      break;
    case "inventory_items":
      payload.status ??= "in_stock";
      payload.quantityOnHand ??= 0;
      break;
    case "stock_movements":
      payload.movementType ??= "adjusted";
      payload.occurredAt ??= new Date().toISOString();
      break;
    case "supply_plans":
      payload.status ??= "draft";
      break;
    case "supply_plan_items":
      payload.status ??= "planned";
      payload.priority ??= "normal";
      break;
    case "supply_risks":
      payload.status ??= "open";
      payload.severity ??= "medium";
      payload.identifiedAt ??= new Date().toISOString();
      break;
    case "compliance_controls":
      payload.status ??= "draft";
      payload.controlType ??= "governance";
      break;
    case "compliance_obligations":
      payload.status ??= "under_review";
      break;
    case "control_assessments":
      payload.status ??= "planned";
      payload.result ??= "not_tested";
      payload.assessedAt ??= new Date().toISOString();
      break;
    case "compliance_findings":
      payload.status ??= "open";
      payload.severity ??= "medium";
      payload.identifiedAt ??= new Date().toISOString();
      break;
    case "iot_things":
      payload.status ??= "active";
      payload.kind ??= "unknown";
      break;
    case "iot_devices":
      payload.status ??= "unknown";
      payload.protocol ??= "unknown";
      break;
    case "sensor_readings":
      payload.quality ??= "unknown";
      payload.observedAt ??= new Date().toISOString();
      break;
    case "device_commands":
      payload.status ??= "draft";
      payload.commandType ??= "custom";
      payload.requestedAt ??= new Date().toISOString();
      break;
    case "construction_projects":
      payload.status ??= "planning";
      break;
    case "construction_sites":
      payload.status ??= "planned";
      break;
    case "construction_rfis":
      payload.status ??= "open";
      payload.requestedAt ??= new Date().toISOString();
      break;
    case "construction_change_orders":
      payload.status ??= "draft";
      payload.submittedAt ??= new Date().toISOString();
      break;
    case "assets":
      payload.status ??= "active";
      break;
    case "work_orders":
      payload.status ??= "planned";
      break;
    case "transactions":
      payload.postedAt ??= new Date().toISOString();
      payload.currency ??= "USD";
      break;
    case "domain_systems":
      payload.wave ??= "custom";
      payload.status ??= "active";
      break;
    case "domain_packs":
    case "semantic_views":
      payload.status ??= "draft";
      break;
    case "domain_profiles":
      payload.status ??= "active";
      break;
    case "quality_gaps":
      payload.status ??= "open";
      payload.severity ??= "medium";
      break;
    case "canonical_operations":
      payload.status ??= "partial";
      break;
    case "vocabularies":
    case "concepts":
      payload.status ??= "active";
      break;
    case "provenance_events":
    case "instrument_responses":
      payload.occurredAt ??= collectionName === "provenance_events" ? new Date().toISOString() : payload.occurredAt;
      payload.recordedAt ??= collectionName === "instrument_responses" ? new Date().toISOString() : payload.recordedAt;
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

function mergeInputPayload(
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
    "filter",
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

function buildExplicitCollectionHint(collectionName: string, binName = "claw"): string {
  const template = defaultCustomCollection(collectionName);
  const fields = JSON.stringify(template.fields);
  const indexes = JSON.stringify(template.indexes);
  return [
    "Create the collection explicitly first:",
    `${binName} database collection create --namespace main --name ${collectionName} --fields '${fields}' --indexes '${indexes}'`,
  ].join(" ");
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
    writeDbError(input, "usage_error", "Use `claw knowledge memories search <query>` for memory search.", DB_EXIT_USAGE, dbJsonMeta(input, rawCollection, rawAction));
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

  const collection = await runtime.getCollection(namespaceId, collectionName);

  if (action === "schema") {
    const schema = collection ?? buildCustomCollectionPreview(namespaceId, collectionName);
    if (wantsJson) {
      writeDbJson(stdout, {
        exists: Boolean(collection),
        collection: schema,
        autoCreateOnWrite: false,
        explicitCreateRequired: !collection,
        createHint: collection ? null : buildExplicitCollectionHint(collectionName, binName),
      }, dbJsonMeta(input, collectionName, action));
    } else {
      stdout.write(`${renderSchemaDetail(schema, Boolean(collection))}${collection ? "" : `\n${buildExplicitCollectionHint(collectionName, binName)}`}\n`);
    }
    return DB_EXIT_OK;
  }

  if (!collection && action === "list") {
    if (wantsJson) writeDbJson(stdout, [], dbJsonMeta(input, collectionName, action));
    else stdout.write(`Collection ${collectionName} does not exist.\n${buildExplicitCollectionHint(collectionName, binName)}\n`);
    return DB_EXIT_OK;
  }

  if (!collection) {
    writeDbError(input, "not_found", `Collection ${collectionName} does not exist. ${buildExplicitCollectionHint(collectionName, binName)}`, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
    return DB_EXIT_FAILURE;
  }

  if (action === "list") {
    let filter: Record<string, unknown> | undefined;
    try {
      filter = parseOptionalJsonObject(flags.filter, "filter");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeDbError(input, "invalid_json", message, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_FAILURE;
    }
    const records = await runtime.listRecords(namespaceId, collectionName, { filter });
    const items = readBooleanFlag(argv, flags, "include-archived", false)
      ? records.items
      : records.items.filter((record) => !record.archivedAt);
    if (wantsJson) writeDbJson(stdout, items, dbJsonMeta(input, collectionName, action));
    else if (items.length === 0) stdout.write(`No ${collectionName} yet\n${buildCreateHint(collectionName, binName)}\n`);
    else stdout.write(`${renderRecordTable(items, collectionName)}\n`);
    return DB_EXIT_OK;
  }

  if (action === "query") {
    const query = (flags.query || positionals.slice(3).join(" ")).trim().toLowerCase();
    if (!query) {
      writeDbError(input, "usage_error", "Usage: claw db <collection> query <text>", DB_EXIT_USAGE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_USAGE;
    }
    let filter: Record<string, unknown> | undefined;
    try {
      filter = parseOptionalJsonObject(flags.filter, "filter");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeDbError(input, "invalid_json", message, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_FAILURE;
    }
    const records = await runtime.listRecords(namespaceId, collectionName, { filter });
    const items = records.items
      .filter((record) => readBooleanFlag(argv, flags, "include-archived", false) || !record.archivedAt)
      .filter((record) => JSON.stringify(record).toLowerCase().includes(query));
    if (wantsJson) writeDbJson(stdout, items, dbJsonMeta(input, collectionName, action));
    else if (items.length === 0) stdout.write(`No ${collectionName} match "${query}"\n`);
    else stdout.write(`${renderRecordTable(items, collectionName)}\n`);
    return items.length > 0 ? DB_EXIT_OK : DB_EXIT_DEGRADED;
  }

  if (action === "get") {
    const recordId = positionals[3] || flags.id;
    if (!recordId) {
      writeDbError(input, "usage_error", "Usage: claw db <collection> get <id>", DB_EXIT_USAGE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_USAGE;
    }
    const record = await runtime.getRecord(namespaceId, collectionName, recordId);
    if (!record) {
      writeDbError(input, "not_found", `${collectionName} record not found: ${recordId}`, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_FAILURE;
    }
    if (wantsJson) writeDbJson(stdout, record, dbJsonMeta(input, collectionName, action));
    else stdout.write(`${renderRecordDetail(record)}\n`);
    return DB_EXIT_OK;
  }

  if (action === "delete") {
    const recordId = positionals[3] || flags.id;
    if (!recordId) {
      writeDbError(input, "usage_error", "Usage: claw db <collection> delete <id>", DB_EXIT_USAGE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_USAGE;
    }
    const deletedRecord = mode === "local" ? await runtime.getRecord(namespaceId, collectionName, recordId) : null;
    const removed = await runtime.deleteRecord(namespaceId, collectionName, recordId);
    if (!removed) {
      writeDbError(input, "not_found", `${collectionName} record not found: ${recordId}`, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
      return DB_EXIT_FAILURE;
    }
    if (mode === "local") {
      scheduleLocalSearchEventsForRecord({
        operation: "delete",
        namespaceId,
        collectionName,
        record: (deletedRecord ?? { id: recordId }) as Record<string, unknown>,
        dataDir: localDatabaseDataDir(workspaceRoot),
        flags,
      });
    }
    if (wantsJson) writeDbJson(stdout, { deleted: true, id: recordId }, dbJsonMeta(input, collectionName, action));
    else stdout.write(`Deleted ${singularCollectionLabel(collectionName)} ${recordId}\n`);
    return DB_EXIT_OK;
  }

  try {
    const { recordId, payload: rawPayload } = mergeInputPayload(collectionName, action, positionals, flags, argv);
    const { payload, warnings } = normalizePayload(collectionName, collection, rawPayload, action);
    if (!wantsJson) writeWarnings(stderr, warnings);
    const record = action === "create"
      ? await runtime.createRecord(namespaceId, collectionName, payload)
      : await runtime.updateRecord(namespaceId, collectionName, recordId!, payload);
    if (mode === "local") {
      scheduleLocalSearchEventsForRecord({
        operation: "upsert",
        namespaceId,
        collectionName,
        record: record as Record<string, unknown>,
        dataDir: localDatabaseDataDir(workspaceRoot),
        flags,
      });
    }
    if (wantsJson) writeDbJson(stdout, record, dbJsonMeta(input, collectionName, action));
    else {
      const label = pickDisplayField(record, collectionName);
      if (action === "create") stdout.write(`Created ${singularCollectionLabel(collectionName)} ${record.id} "${label}"\n`);
      else stdout.write(`Updated ${singularCollectionLabel(collectionName)} ${record.id}\n`);
    }
    return DB_EXIT_OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeDbError(input, message.includes("JSON") ? "invalid_json" : "internal_error", message, DB_EXIT_FAILURE, dbJsonMeta(input, collectionName, action));
    return DB_EXIT_FAILURE;
  }
}
