// @clawjs-persistent-surface-ddl-source
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import {
  clawNetworkControlPlaneRegistry,
  createNetworkEvent,
  createNetworkRuleSuggestion,
  evaluateGatewayNetworkAccess,
  evaluateNetworkPolicy,
  listNetworkAccessManifests,
  listNetworkAdapters,
  listNetworkDefaultRules,
  listNetworkPolicyProfiles,
  networkEndpointSchema,
  networkRuleSchema,
  networkSubjectSchema,
  redactNetworkEvent,
  resolveClawPersistentSurfacePath,
  type NetworkEvent,
  type NetworkRule,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

type NetworkControlState = {
  schemaVersion: 1;
  updatedAt: string;
  rules: NetworkRule[];
  deletedRuleIds: string[];
  detailOptIn: boolean;
};

type NetworkEventRow = {
  id: string;
  observed_at: string;
  subject_json: string;
  endpoint_json: string;
  direction: NetworkEvent["direction"];
  adapter_id: string;
  decision: NetworkEvent["decision"];
  matched_rule_ids: string;
  bytes_in: number;
  bytes_out: number;
  redaction_json: string;
};

const NETWORK_MONITOR_SCHEMA_SQL = String.raw`
  CREATE TABLE IF NOT EXISTS network_events (
    id TEXT PRIMARY KEY,
    observed_at TEXT NOT NULL,
    subject_json TEXT NOT NULL,
    endpoint_json TEXT NOT NULL,
    direction TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    matched_rule_ids TEXT NOT NULL DEFAULT '[]',
    bytes_in INTEGER NOT NULL DEFAULT 0,
    bytes_out INTEGER NOT NULL DEFAULT 0,
    redaction_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_network_events_observed
    ON network_events(observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_network_events_decision
    ON network_events(decision, observed_at DESC);

  CREATE TABLE IF NOT EXISTS network_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_ms INTEGER NOT NULL,
    bucket_start_at INTEGER NOT NULL,
    adapter_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    count INTEGER NOT NULL,
    bytes_in INTEGER NOT NULL,
    bytes_out INTEGER NOT NULL,
    UNIQUE(bucket_ms, bucket_start_at, adapter_id, decision)
  );
`;

const NETWORK_ROLLUP_BUCKET_MS = 60_000;

export type NetworkCliInput = {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function networkStatePath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "network-control-state.json");
}

function monitorDatabasePath(flags: Record<string, string>): string {
  if (flags["monitor-db"]) return expandHome(flags["monitor-db"]);
  if (process.env.CLAW_MONITOR_DB_PATH) return expandHome(process.env.CLAW_MONITOR_DB_PATH);
  if (process.env.CLAW_MONITOR_DATA_DIR) return path.join(expandHome(process.env.CLAW_MONITOR_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_DATA_DIR) return path.join(expandHome(process.env.CLAW_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data", "monitor.sqlite");
  return expandHome(resolveClawPersistentSurfacePath("claw.database.monitor"));
}

function openMonitorDatabase(flags: Record<string, string>): { db: Database.Database; dbPath: string } {
  const dbPath = monitorDatabasePath(flags);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(NETWORK_MONITOR_SCHEMA_SQL);
  return { db, dbPath };
}

function emptyState(): NetworkControlState {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), rules: [], deletedRuleIds: [], detailOptIn: false };
}

function readState(workspaceRoot: string): NetworkControlState {
  const file = networkStatePath(workspaceRoot);
  if (!fs.existsSync(file)) return emptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<NetworkControlState>;
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      rules: Array.isArray(parsed.rules) ? parsed.rules.map((rule) => networkRuleSchema.safeParse(rule)).filter((result) => result.success).map((result) => result.data) : [],
      deletedRuleIds: Array.isArray(parsed.deletedRuleIds) ? parsed.deletedRuleIds.filter((id): id is string => typeof id === "string") : [],
      detailOptIn: parsed.detailOptIn === true,
    };
  } catch {
    return emptyState();
  }
}

function writeState(workspaceRoot: string, state: NetworkControlState): void {
  const file = networkStatePath(workspaceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2)}\n`);
}

function mergedRules(state: NetworkControlState): NetworkRule[] {
  const deleted = new Set(state.deletedRuleIds);
  const byId = new Map(listNetworkDefaultRules().filter((rule) => !deleted.has(rule.id)).map((rule) => [rule.id, rule]));
  for (const rule of state.rules) byId.set(rule.id, rule);
  return [...byId.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new CliHandledError("invalid_boolean", `Invalid boolean value: ${value}`, CLI_EXIT_USAGE);
}

function upsertRule(state: NetworkControlState, flags: Record<string, string>, id: string): NetworkControlState {
  const existing = mergedRules(state).find((rule) => rule.id === id);
  const now = nowIso();
  const rule = networkRuleSchema.parse({
    schemaVersion: 1,
    id,
    action: flags.action ?? existing?.action ?? "ask",
    subject: {
      kind: flags["subject-kind"] ?? existing?.subject?.kind,
      id: flags["subject-id"] ?? existing?.subject?.id,
    },
    endpoint: {
      kind: flags["endpoint-kind"] ?? existing?.endpoint?.kind,
      value: flags.endpoint ?? flags["endpoint-value"] ?? existing?.endpoint?.value,
      protocol: flags.protocol ?? existing?.endpoint?.protocol ?? "unknown",
      ...(flags.port ? { port: Number(flags.port) } : existing?.endpoint?.port ? { port: existing.endpoint.port } : {}),
    },
    networkPolicyProfileId: flags["network-policy"] ?? existing?.networkPolicyProfileId ?? "default",
    priority: flags.priority === undefined ? existing?.priority ?? 0 : Number(flags.priority),
    enabled: parseBoolean(flags.enabled, existing?.enabled ?? true),
    lifetime: flags.lifetime ?? existing?.lifetime ?? "permanent",
    ruleSteward: { kind: "human", id: flags["rule-steward"] ?? "local" },
    source: flags.source ?? existing?.source ?? "human",
    notes: flags.notes ?? existing?.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return {
    ...state,
    rules: [...state.rules.filter((entry) => entry.id !== id), rule],
    deletedRuleIds: state.deletedRuleIds.filter((entry) => entry !== id),
  };
}

function eventFromRow(row: NetworkEventRow, detailOptIn: boolean): NetworkEvent {
  const event = createNetworkEvent({
    id: row.id,
    observedAt: row.observed_at,
    subject: networkSubjectSchema.parse(JSON.parse(row.subject_json)),
    endpoint: networkEndpointSchema.parse(JSON.parse(row.endpoint_json)),
    direction: row.direction,
    adapterId: row.adapter_id,
    evaluation: {
      schemaVersion: 1,
      decision: row.decision,
      matchedRuleIds: JSON.parse(row.matched_rule_ids) as string[],
      adapterId: row.adapter_id,
      explanation: "Loaded from Monitor network_events.",
      requiresReview: row.decision === "ask",
      redaction: { level: detailOptIn ? "process_domain_opt_in" : "aggregate", detailOptInRequired: !detailOptIn },
    },
    bytesIn: row.bytes_in,
    bytesOut: row.bytes_out,
    detailOptIn,
  });
  return detailOptIn ? event : redactNetworkEvent(event, false);
}

function recordEvent(event: NetworkEvent, flags: Record<string, string>): { store: "monitor.sqlite"; dbPath: string; eventId: string } {
  const { db, dbPath } = openMonitorDatabase(flags);
  try {
    const observedMs = Date.parse(event.observedAt);
    const bucketStartAt = Math.floor(observedMs / NETWORK_ROLLUP_BUCKET_MS) * NETWORK_ROLLUP_BUCKET_MS;
    db.prepare(`
      INSERT OR REPLACE INTO network_events
        (id, observed_at, subject_json, endpoint_json, direction, adapter_id, decision, matched_rule_ids, bytes_in, bytes_out, redaction_json)
      VALUES
        (@id, @observedAt, @subjectJson, @endpointJson, @direction, @adapterId, @decision, @matchedRuleIds, @bytesIn, @bytesOut, @redactionJson)
    `).run({
      id: event.id,
      observedAt: event.observedAt,
      subjectJson: JSON.stringify(event.subject),
      endpointJson: JSON.stringify(event.endpoint),
      direction: event.direction,
      adapterId: event.adapterId,
      decision: event.decision,
      matchedRuleIds: JSON.stringify(event.matchedRuleIds),
      bytesIn: event.bytesIn,
      bytesOut: event.bytesOut,
      redactionJson: JSON.stringify(event.redaction),
    });
    db.prepare(`
      INSERT INTO network_rollups (bucket_ms, bucket_start_at, adapter_id, decision, count, bytes_in, bytes_out)
      VALUES (@bucketMs, @bucketStartAt, @adapterId, @decision, 1, @bytesIn, @bytesOut)
      ON CONFLICT(bucket_ms, bucket_start_at, adapter_id, decision) DO UPDATE SET
        count = count + 1,
        bytes_in = bytes_in + excluded.bytes_in,
        bytes_out = bytes_out + excluded.bytes_out
    `).run({
      bucketMs: NETWORK_ROLLUP_BUCKET_MS,
      bucketStartAt,
      adapterId: event.adapterId,
      decision: event.decision,
      bytesIn: event.bytesIn,
      bytesOut: event.bytesOut,
    });
    return { store: "monitor.sqlite", dbPath, eventId: event.id };
  } finally {
    db.close();
  }
}

function readEvents(flags: Record<string, string>, detailOptIn: boolean, limit = 20): { dbPath: string; events: NetworkEvent[] } {
  const { db, dbPath } = openMonitorDatabase(flags);
  try {
    const rows = db.prepare("SELECT * FROM network_events ORDER BY observed_at DESC LIMIT ?").all(limit) as NetworkEventRow[];
    return { dbPath, events: rows.map((row) => eventFromRow(row, detailOptIn)) };
  } finally {
    db.close();
  }
}

function writeHuman(context: CliContext, payload: unknown): void {
  context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function runNetworkCli(input: NetworkCliInput): Promise<number> {
  const [, command, subcommand] = input.positionals;
  const state = readState(input.workspaceRoot);
  const detailOptIn = parseBoolean(input.flags["detail-opt-in"], state.detailOptIn);

  if (!command || command === "help") {
    input.context.stdout.write(`Usage: ${input.binName} network status|events|rules|policy-profiles|lists|manifests|routes|adapters|suggestions|explain|doctor [options]\n`);
    return CLI_EXIT_OK;
  }

  if (command === "status") {
    const events = readEvents(input.flags, detailOptIn, 5);
    const payload = {
      registry: clawNetworkControlPlaneRegistry,
      statePath: networkStatePath(input.workspaceRoot),
      monitor: { store: "monitor.sqlite", dbPath: events.dbPath, recentEvents: events.events.length },
      privacy: { detailOptIn, defaultRedaction: detailOptIn ? "process_domain_opt_in" : "aggregate" },
      enforcement: { clawRuntime: "ready", gateway: "ready", nativeMac: "external_pending" },
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "status" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "adapters") {
    const payload = { adapters: listNetworkAdapters() };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "adapters" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "policy-profiles") {
    const payload = { networkPolicyProfiles: listNetworkPolicyProfiles(), activeNetworkPolicyProfileId: "default", detailOptIn };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "policy-profiles" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "manifests") {
    const payload = { manifests: listNetworkAccessManifests() };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "manifests" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "rules") {
    if (!subcommand || subcommand === "list") {
      const payload = { rules: mergedRules(state), statePath: networkStatePath(input.workspaceRoot), agentSuggestionsApplyAutomatically: false };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "rules list" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "upsert") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} network rules upsert <id> --action allow|deny|ask --subject-kind gateway --endpoint-kind gateway_route --endpoint remote.chatGateway`, CLI_EXIT_USAGE);
      const next = upsertRule(state, input.flags, id);
      writeState(input.workspaceRoot, next);
      const payload = { rule: mergedRules(next).find((rule) => rule.id === id), statePath: networkStatePath(input.workspaceRoot), mutatesNativeState: false };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "rules upsert" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "delete") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} network rules delete <id>`, CLI_EXIT_USAGE);
      const next = {
        ...state,
        rules: state.rules.filter((rule) => rule.id !== id),
        deletedRuleIds: [...new Set([...state.deletedRuleIds, id])],
      };
      writeState(input.workspaceRoot, next);
      const payload = { deleted: id, rules: mergedRules(next), statePath: networkStatePath(input.workspaceRoot), mutatesNativeState: false };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "rules delete" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    throw new CliHandledError("usage_error", `Usage: ${input.binName} network rules list|upsert|delete`, CLI_EXIT_USAGE);
  }

  if (command === "events") {
    if (subcommand === "record") {
      const subject = networkSubjectSchema.parse({
        kind: input.flags["subject-kind"] ?? "gateway",
        id: input.flags["subject-id"] ?? input.flags["agent-id"] ?? "gateway",
        claw: {
          agentId: input.flags["agent-id"],
          gatewayId: input.flags["gateway-id"] ?? "gateway",
          routeId: input.flags["route-id"],
        },
      });
      const endpoint = networkEndpointSchema.parse({
        kind: input.flags["endpoint-kind"] ?? "gateway_route",
        value: input.flags.endpoint ?? input.flags["route-id"] ?? "remote.chatGateway",
        protocol: input.flags.protocol ?? "unknown",
      });
      const evaluation = evaluateNetworkPolicy({
        subject,
        endpoint,
        rules: mergedRules(state),
        adapterId: input.flags["adapter-id"] ?? "network.adapter.gateway",
        networkPolicyProfile: { ...listNetworkPolicyProfiles()[0], detailOptIn },
      });
      const event = createNetworkEvent({
        id: input.flags.id ?? `network_event_${Date.now()}`,
        subject,
        endpoint,
        adapterId: evaluation.adapterId,
        evaluation,
        bytesIn: Number(input.flags["bytes-in"] ?? 0),
        bytesOut: Number(input.flags["bytes-out"] ?? 0),
        detailOptIn,
      });
      const recorded = recordEvent(event, input.flags);
      const payload = { event: detailOptIn ? event : redactNetworkEvent(event, false), recorded };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "events record" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    const limit = Number(input.flags.limit ?? 20);
    const history = readEvents(input.flags, detailOptIn, Number.isFinite(limit) ? limit : 20);
    const payload = { store: "monitor.sqlite", dbPath: history.dbPath, detailOptIn, events: history.events };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "events list" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "explain") {
    const routeId = input.flags["route-id"] ?? input.positionals[2] ?? "remote.chatGateway";
    const evaluation = evaluateGatewayNetworkAccess({
      routeId,
      agentId: input.flags["agent-id"],
      endpoint: input.flags.endpoint,
      rules: mergedRules(state),
    });
    const payload = { routeId, evaluation, appliesNativeState: false };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "explain" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "routes") {
    const routeId = input.flags["route-id"] ?? input.positionals[2] ?? "remote.chatGateway";
    const evaluation = evaluateGatewayNetworkAccess({
      routeId,
      agentId: input.flags["agent-id"],
      endpoint: input.flags.endpoint,
      rules: mergedRules(state),
    });
    const payload = {
      routes: [{
        routeId,
        adapterId: "network.adapter.gateway",
        policy: evaluation,
        enforcement: evaluation.decision === "deny" ? "blocked" : evaluation.decision === "ask" ? "review_required" : "allowed",
      }],
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "routes" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "suggestions") {
    const history = readEvents(input.flags, true, Number(input.flags.limit ?? 10));
    const suggestions = history.events
      .filter((event) => event.decision === "ask" || event.decision === "deny")
      .map((event) => createNetworkRuleSuggestion({ event, ruleStewardAgentId: input.flags["agent-id"] }));
    const payload = { suggestions, autoApply: false, note: "Agents propose rules only; human or explicit grant applies them." };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: "suggestions" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "doctor" || command === "lists") {
    const adapters = listNetworkAdapters();
    const payload = {
      status: adapters.some((adapter) => adapter.status === "ready") ? "ready_with_external_pending" : "external_pending",
      adapters,
      blocklists: { defaultSubscriptionsEnabled: false, mode: "opt_in" },
      externalPending: adapters.filter((adapter) => adapter.externalPending),
      directBlockers: [],
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "network", payload, { subcommand: command });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  throw new CliHandledError("usage_error", `Usage: ${input.binName} network status|events|rules|policy-profiles|lists|manifests|routes|adapters|suggestions|explain|doctor`, CLI_EXIT_USAGE);
}
