import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { clawCliCommandRegistry, listClawCliAliases } from "@clawjs/core";
import {
  DEFAULT_SEARCH_BUDGETS,
  LOCAL_TEXT_EMBEDDING_DIMENSIONS,
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_PROFILES,
  SearchStore,
  createSearchActionExecutionPlan,
  createLocalTextEmbedding,
  listSearchEntrypointContracts,
  type SearchAuditEventType,
  type SearchProfileId,
  type SearchQueryInput,
  type SearchQueryOutput,
  type SearchResult,
  type SearchSourceState,
} from "@clawjs/search";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface SearchMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface SearchMcpServerOptions {
  dbPath?: string;
  dataDir?: string;
}

export function createSearchMcpTools(store: SearchStore): SearchMcpToolDef[] {
  return [
    {
      name: "search.query",
      description: "Query the local @clawjs/search sidecar index.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          shards: { type: "array", items: { type: "string" } },
          strategy: { type: "string", enum: ["lexical", "semantic", "hybrid"] },
          embeddingModel: { type: "string" },
          localEmbedding: { type: "boolean" },
          embedding: {
            type: "object",
            required: ["model", "vector"],
            properties: {
              model: { type: "string" },
              vector: { type: "array", items: { type: "number" } },
            },
          },
          profile: { type: "string", enum: ["framework", "full"] },
          limit: { type: "integer" },
          agentBudget: {
            type: "object",
            properties: {
              maxResults: { type: "integer" },
              maxResultsPerSource: { type: "integer" },
              maxResultsPerDomain: { type: "integer" },
            },
          },
          filters: { type: "object" },
          explain: { type: "boolean" },
          actor: { type: "string" },
          surface: { type: "string" },
        },
      },
      handler: (p) => handleSearchQueryTool(store, p),
    },
    {
      name: "search.embeddings.create",
      description: "Create a deterministic local Search embedding vector.",
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string" },
          model: { type: "string" },
          dimensions: { type: "integer" },
        },
      },
      handler: (p) => createLocalTextEmbedding(requiredString(p, "text"), {
        model: localEmbeddingModel(p.model),
        dimensions: numberParam(p.dimensions) ?? LOCAL_TEXT_EMBEDDING_DIMENSIONS,
      }),
    },
    {
      name: "search.embeddings.index",
      description: "Backfill deterministic local Search embedding vectors for already indexed semantic-capable sources.",
      inputSchema: {
        type: "object",
        properties: {
          sources: { type: "array", items: { type: "string" } },
          domains: { type: "array", items: { type: "string" } },
          shards: { type: "array", items: { type: "string" } },
          limit: { type: "integer" },
          model: { type: "string" },
        },
      },
      handler: (p) => store.indexLocalEmbeddings({
        sources: stringArrayParam(p.sources),
        domains: stringArrayParam(p.domains),
        shards: stringArrayParam(p.shards),
        limit: numberParam(p.limit),
        model: localEmbeddingModel(p.model),
      }),
    },
    {
      name: "search.embeddings.status",
      description: "List deterministic local Search embedding vector coverage.",
      inputSchema: {
        type: "object",
        properties: {
          sources: { type: "array", items: { type: "string" } },
          domains: { type: "array", items: { type: "string" } },
          shards: { type: "array", items: { type: "string" } },
          model: { type: "string" },
        },
      },
      handler: (p) => store.listEmbeddingStatus({
        sources: stringArrayParam(p.sources),
        domains: stringArrayParam(p.domains),
        shards: stringArrayParam(p.shards),
        model: stringParam(p.model),
      }),
    },
    { name: "search.sources.list", description: "List Search source manifests.", inputSchema: { type: "object", properties: { profile: { type: "string", enum: ["framework", "full"] } } }, handler: (p) => store.listSources(searchProfile(p.profile)) },
    {
      name: "search.sources.set_state",
      description: "Set a Search source state for Search Index style admin controls.",
      inputSchema: {
        type: "object",
        required: ["source", "state"],
        properties: {
          source: { type: "string" },
          state: { type: "string", enum: ["enabled", "disabled", "paused", "excluded", "backfilling", "degraded", "external_pending", "error"] },
          backlog: { type: "integer" },
          error: { type: "string" },
          lastIndexedAt: { type: "string" },
        },
      },
      handler: (p) => {
        const source = requiredString(p, "source");
        const state = requiredSearchSourceState(p.state);
        if (!store.sourceStatus().some((row) => row.source === source)) {
          throw new Error(`Search source not found: ${source}`);
        }
        store.setSourceState(source, state, {
          backlog: numberParam(p.backlog),
          error: stringParam(p.error) ?? null,
          lastIndexedAt: stringParam(p.lastIndexedAt),
        });
        return store.sourceStatus().find((row) => row.source === source) ?? null;
      },
    },
    { name: "search.status", description: "List Search source status rows.", inputSchema: { type: "object", properties: {} }, handler: () => store.sourceStatus() },
    {
      name: "search.cursors.list",
      description: "List Search source/shard checkpoint cursors, watermarks, checksums, and metadata.",
      inputSchema: { type: "object", properties: { source: { type: "string" }, shard: { type: "string" } } },
      handler: (p) => {
        const source = stringParam(p.source);
        const shard = stringParam(p.shard);
        const cursors = store.listCursors(source).filter((cursor) => !shard || cursor.shard === shard);
        return { state: cursors.length ? "ready" : "empty", cursors };
      },
    },
    {
      name: "search.shards.list",
      description: "List Search shard catalog rows for Search Index administration.",
      inputSchema: { type: "object", properties: { source: { type: "string" }, domain: { type: "string" } } },
      handler: (p) => {
        const shards = store.listShards({ source: stringParam(p.source), domain: stringParam(p.domain) });
        return { state: shards.length ? "ready" : "empty", shards };
      },
    },
    { name: "search.profiles.list", description: "List Search profiles and default enablement.", inputSchema: { type: "object", properties: {} }, handler: () => ({ profiles: SEARCH_PROFILES }) },
    {
      name: "search.entrypoints.list",
      description: "List Root Search, Search Index, and chat search entrypoint contracts.",
      inputSchema: { type: "object", properties: {} },
      handler: () => {
        const entrypoints = listSearchEntrypointContracts().map((entrypoint) => {
          const { hotkey, ...publicEntrypoint } = entrypoint;
          return { ...publicEntrypoint, shortcut: hotkey };
        });
        return {
          entrypoints,
          rootSearchShortcutState: entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.shortcut.state ?? "external_pending",
          chatSearchIsolation: entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.queryScope === "conversations_only",
        };
      },
    },
    {
      name: "search.aliases.list",
      description: "List launcher aliases exposed to Root Search automation.",
      inputSchema: { type: "object", properties: {} },
      handler: () => {
        const commandNames = new Set(clawCliCommandRegistry.commands.map((entry) => entry.name));
        const aliases = listClawCliAliases().map((alias) => ({
          ...alias,
          source: alias.source === "collection" ? "collection" : "command",
          searchDomain: "commands",
          resultId: commandNames.has(alias.canonicalName) ? `commands:${alias.canonicalName}` : null,
        }));
        return {
          aliases,
          count: aliases.length,
          rootSearchShortcutState: listSearchEntrypointContracts().find((entrypoint) => entrypoint.id === "root-search")?.hotkey.state ?? "external_pending",
          chatSearchIsolation: true,
        };
      },
    },
    {
      name: "search.explain",
      description: "Explain Search query planning, matching, ranking, and timeout policy.",
      inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, profile: { type: "string", enum: ["framework", "full"] } } },
      handler: (p) => ({
        query: requiredString(p, "query"),
        profile: searchProfile(p.profile),
        budgets: DEFAULT_SEARCH_BUDGETS,
        matching: ["exact", "prefix", "fuzzy", "fts"],
        semantic: "optional per source with caller-supplied local embeddings",
        partialResults: "slow sources are omitted instead of blocking fast paths",
        ranking: ["central score", "source hints", "local frecency", "scope", "actor", "surface"],
      }),
    },
    { name: "search.actions.list", description: "List actions attached to one Search result.", inputSchema: { type: "object", required: ["resultId"], properties: { resultId: { type: "string" } } }, handler: (p) => store.actionsForResult(requiredString(p, "resultId")) },
    {
      name: "search.actions.execute",
      description: "Plan or record a brokered Search result action execution through host grants/approvals.",
      inputSchema: {
        type: "object",
        required: ["resultId", "actionId"],
        properties: {
          resultId: { type: "string" },
          actionId: { type: "string" },
          dryRun: { type: "boolean" },
          hostApprovalId: { type: "string" },
          actor: { type: "string" },
          surface: { type: "string" },
        },
      },
      handler: (p) => {
        const resultId = requiredString(p, "resultId");
        const actionId = requiredString(p, "actionId");
        const result = store.resultForId(resultId);
        const action = store.actionsForResult(resultId).find((candidate) => candidate.id === actionId);
        const actor = stringParam(p.actor);
        const surface = stringParam(p.surface);
        if (!result || !action) {
          store.recordAuditEvent({
            type: "action",
            actor,
            surface,
            resultId,
            actionId,
            status: "not_found",
            reason: "search_action_not_found",
          });
          throw new Error(`Search action not found: ${resultId} ${actionId}`);
        }
        const dryRun = typeof p.dryRun === "boolean" ? p.dryRun : false;
        const hostApprovalId = stringParam(p.hostApprovalId);
        const plan = createSearchActionExecutionPlan({ result, action, dryRun, hostApprovalId, actor, surface });
        store.recordAuditEvent({
          type: "action",
          actor,
          surface,
          source: result.source,
          domain: result.domain,
          resultId,
          actionId,
          status: plan.status,
          risk: plan.risk,
          grant: plan.grant,
          reason: plan.reasons.join(","),
          metadata: { dryRun, requiresApproval: plan.requiresApproval, hostApprovalId: hostApprovalId ?? null },
        });
        if (!dryRun && plan.status !== "blocked") {
          store.recordInteraction({
            resultId,
            actor,
            surface,
            actionId,
            kind: action.kind === "open" || action.kind === "copy" ? action.kind : "action",
            metadata: { status: plan.status, risk: plan.risk, grant: plan.grant },
          });
        }
        return {
          plan,
          brokered: true,
          blocked: plan.status === "blocked",
        };
      },
    },
    { name: "search.saved.list", description: "List saved searches.", inputSchema: { type: "object", properties: {} }, handler: () => store.listSavedSearches() },
    {
      name: "search.saved.delete",
      description: "Delete a saved search and any monitors attached to it.",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      handler: (p) => {
        const id = requiredString(p, "id");
        const deleted = store.deleteSavedSearch(id);
        return { id, deleted, items: store.listSavedSearches(), state: deleted ? "ready" : "missing" };
      },
    },
    {
      name: "search.saved.create",
      description: "Create or update a saved search.",
      inputSchema: {
        type: "object",
        required: ["id", "query"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          query: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          shards: { type: "array", items: { type: "string" } },
          strategy: { type: "string", enum: ["lexical", "semantic", "hybrid"] },
          embeddingModel: { type: "string" },
          localEmbedding: { type: "boolean" },
          embedding: {
            type: "object",
            required: ["model", "vector"],
            properties: {
              model: { type: "string" },
              vector: { type: "array", items: { type: "number" } },
            },
          },
          profile: { type: "string", enum: ["framework", "full"] },
          limit: { type: "integer" },
          agentBudget: {
            type: "object",
            properties: {
              maxResults: { type: "integer" },
              maxResultsPerSource: { type: "integer" },
              maxResultsPerDomain: { type: "integer" },
            },
          },
          filters: { type: "object" },
          explain: { type: "boolean" },
          actor: { type: "string" },
          surface: { type: "string" },
        },
      },
      handler: (p) => {
        const id = requiredString(p, "id");
        store.saveSearch({ id, name: stringParam(p.name) ?? id, query: searchQueryFromParams(p) });
        return store.listSavedSearches().find((item) => item.id === id) ?? null;
      },
    },
    { name: "search.monitors.list", description: "List Search monitors.", inputSchema: { type: "object", properties: {} }, handler: () => store.listMonitors() },
    {
      name: "search.monitors.delete",
      description: "Delete a Search monitor.",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      handler: (p) => {
        const id = requiredString(p, "id");
        const deleted = store.deleteMonitor(id);
        return { id, deleted, items: store.listMonitors(), state: deleted ? "ready" : "missing" };
      },
    },
    {
      name: "search.monitors.create",
      description: "Create or update a Search monitor for a saved search.",
      inputSchema: { type: "object", required: ["id", "savedSearchId"], properties: { id: { type: "string" }, savedSearchId: { type: "string" }, name: { type: "string" }, cadence: { type: "string" }, enabled: { type: "boolean" } } },
      handler: (p) => {
        const id = requiredString(p, "id");
        store.saveMonitor({ id, savedSearchId: requiredString(p, "savedSearchId"), name: stringParam(p.name), cadence: stringParam(p.cadence), enabled: typeof p.enabled === "boolean" ? p.enabled : true });
        return store.listMonitors().find((item) => item.id === id) ?? null;
      },
    },
    {
      name: "search.monitors.evaluate",
      description: "Evaluate enabled Search monitors or one selected monitor.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          monitorId: { type: "string" },
          includeDisabled: { type: "boolean" },
          all: { type: "boolean" },
          limit: { type: "integer" },
        },
      },
      handler: (p) => evaluateSearchMonitors(store, {
        id: stringParam(p.id) ?? stringParam(p.monitorId),
        includeDisabled: p.includeDisabled === true || p.all === true,
        limit: numberParam(p.limit),
      }),
    },
    { name: "search.audit.list", description: "List Search audit events for actions and sensitive queries.", inputSchema: { type: "object", properties: { limit: { type: "integer" }, type: { type: "string", enum: ["action", "sensitive_query"] } } }, handler: (p) => store.listAuditEvents({ limit: numberParam(p.limit), type: searchAuditType(p.type) }) },
    { name: "search.jobs.list", description: "List local Search indexing jobs.", inputSchema: { type: "object", properties: { limit: { type: "integer" }, status: { type: "string", enum: ["queued", "leased", "done", "failed"] }, source: { type: "string" } } }, handler: (p) => store.listIndexJobs({ limit: numberParam(p.limit), status: searchJobStatus(p.status), source: stringParam(p.source) }) },
    {
      name: "search.jobs.enqueue",
      description: "Enqueue source/shard Search indexing work.",
      inputSchema: { type: "object", required: ["source", "operation"], properties: { id: { type: "string" }, source: { type: "string" }, shard: { type: "string" }, operation: { type: "string", enum: ["upsert", "delete", "backfill", "rebuild", "embed"] }, resourceId: { type: "string" }, priority: { type: "integer" }, scheduledAt: { type: "string" }, payload: { type: "object" } } },
      handler: (p) => store.enqueueIndexJob({ id: stringParam(p.id), source: requiredString(p, "source"), shard: stringParam(p.shard), operation: requiredSearchJobOperation(p.operation), resourceId: stringParam(p.resourceId), priority: numberParam(p.priority), scheduledAt: stringParam(p.scheduledAt), payload: recordParam(p.payload) }),
    },
    {
      name: "search.jobs.schedule",
      description: "Schedule compacted event-driven Search indexing work for one changed resource.",
      inputSchema: {
        type: "object",
        required: ["source", "operation", "resourceId"],
        properties: {
          source: { type: "string" },
          shard: { type: "string" },
          operation: { type: "string", enum: ["upsert", "delete"] },
          resourceId: { type: "string" },
          priority: { type: "integer" },
          scheduledAt: { type: "string" },
          observedAt: { type: "string" },
          payload: { type: "object" },
        },
      },
      handler: (p) => store.scheduleIndexEvent({
        source: requiredString(p, "source"),
        shard: stringParam(p.shard),
        operation: requiredSearchEventOperation(p.operation),
        resourceId: requiredString(p, "resourceId"),
        priority: numberParam(p.priority),
        scheduledAt: stringParam(p.scheduledAt),
        observedAt: stringParam(p.observedAt),
        payload: recordParam(p.payload),
      }),
    },
    { name: "search.jobs.claim", description: "Claim Search indexing jobs with bounded leases.", inputSchema: { type: "object", properties: { limit: { type: "integer" }, now: { type: "string" }, leaseMs: { type: "integer" }, sources: { type: "array", items: { type: "string" } }, shards: { type: "array", items: { type: "string" } } } }, handler: (p) => store.claimIndexJobs({ limit: numberParam(p.limit), now: stringParam(p.now), leaseMs: numberParam(p.leaseMs), sources: stringArrayParam(p.sources), shards: stringArrayParam(p.shards) }) },
    { name: "search.jobs.complete", description: "Mark a Search indexing job done.", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } }, handler: (p) => store.completeIndexJob(requiredString(p, "id")) },
    { name: "search.jobs.fail", description: "Fail or retry a Search indexing job.", inputSchema: { type: "object", required: ["id", "error"], properties: { id: { type: "string" }, error: { type: "string" }, retry: { type: "boolean" }, scheduledAt: { type: "string" } } }, handler: (p) => store.failIndexJob(requiredString(p, "id"), { error: requiredString(p, "error"), retry: typeof p.retry === "boolean" ? p.retry : false, scheduledAt: stringParam(p.scheduledAt) }) },
  ];
}

function send(out: Writable, message: JsonRpcResponse | JsonRpcRequest): void {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  out.write(header + payload);
}

export function runSearchMcpServer(opts: SearchMcpServerOptions = {}) {
  const store = new SearchStore(resolveSearchDbPath(opts));
  const tools = createSearchMcpTools(store);
  const toolMap = new Map(tools.map((tool) => [tool.name, tool] as const));

  const respond = (id: JsonRpcRequest["id"], result?: unknown, error?: JsonRpcResponse["error"]) => {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: id ?? null };
    if (error) response.error = error; else response.result = result ?? null;
    send(process.stdout, response);
  };

  const handle = async (req: JsonRpcRequest) => {
    try {
      if (req.method === "initialize") {
        respond(req.id, { serverInfo: { name: "@clawjs/search-mcp", version: "0.1.2" }, protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } } });
        return;
      }
      if (req.method === "tools/list") {
        respond(req.id, { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) });
        return;
      }
      if (req.method === "tools/call") {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const tool = params.name ? toolMap.get(params.name) : null;
        if (!tool) { respond(req.id, undefined, { code: -32601, message: `unknown tool ${params.name}` }); return; }
        const result = await tool.handler(params.arguments ?? {});
        respond(req.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
        return;
      }
      if (req.method === "notifications/initialized") return;
      respond(req.id, undefined, { code: -32601, message: `method ${req.method} not supported` });
    } catch (error) {
      respond(req.id, undefined, { code: -32000, message: error instanceof Error ? error.message : String(error) });
    }
  };

  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buffer.subarray(0, headerEnd).toString();
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buffer = buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const total = headerEnd + 4 + length;
      if (buffer.length < total) break;
      const body = buffer.subarray(headerEnd + 4, total).toString("utf8");
      buffer = buffer.subarray(total);
      try { handle(JSON.parse(body) as JsonRpcRequest).catch(() => undefined); } catch { /* ignore */ }
    }
  });

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.startsWith("{")) return;
    try { handle(JSON.parse(line) as JsonRpcRequest).catch(() => undefined); } catch { /* ignore */ }
  });
}

export default function runDefaultSearchMcpServer(opts: SearchMcpServerOptions = {}): void {
  runSearchMcpServer(opts);
}

function resolveSearchDbPath(opts: SearchMcpServerOptions): string {
  if (opts.dbPath) return path.resolve(opts.dbPath);
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  const dataDir = opts.dataDir ?? process.env.CLAW_DATA_DIR ?? path.join(os.homedir(), ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "search.sqlite");
}

function searchQueryFromParams(params: Record<string, unknown>): SearchQueryInput {
  const query = requiredString(params, "query");
  return {
    query,
    domains: stringArrayParam(params.domains),
    sources: stringArrayParam(params.sources),
    shards: stringArrayParam(params.shards),
    strategy: searchStrategy(params.strategy),
    embedding: searchEmbeddingFromParams(params, query),
    profile: searchProfile(params.profile),
    limit: numberParam(params.limit),
    agentBudget: searchAgentBudget(params.agentBudget),
    explain: typeof params.explain === "boolean" ? params.explain : undefined,
    actor: stringParam(params.actor),
    surface: stringParam(params.surface),
    filters: recordParam(params.filters),
  };
}

function handleSearchQueryTool(store: SearchStore, params: Record<string, unknown>): SearchQueryOutput {
  const input = searchQueryFromParams(params);
  const output = store.query(input);
  if (searchQueryRequiresAudit(input.query, output.results, input.filters)) {
    store.recordAuditEvent({
      type: "sensitive_query",
      actor: input.actor,
      surface: input.surface,
      query: input.query,
      reason: "sensitive_query_or_redacted_result",
      metadata: {
        profile: input.profile ?? "framework",
        domains: input.domains ?? [],
        sources: input.sources ?? [],
        shards: input.shards ?? [],
        strategy: input.strategy ?? "lexical",
        embeddingModel: input.embedding?.model,
        resultCount: output.results.length,
        redactedResultCount: output.results.filter((result) => result.permissions?.redacted).length,
      },
    });
  }
  return output;
}

function evaluateSearchMonitors(
  store: SearchStore,
  input: { id?: string; includeDisabled?: boolean; limit?: number } = {},
): {
  action: "evaluate";
  items: Array<{
    monitorId: string;
    savedSearchId: string;
    name?: string;
    cadence?: string;
    enabled: boolean;
    query?: SearchQueryInput;
    state: "ready" | "missing_saved_search";
    resultCount: number;
    partial: boolean;
    omittedSources: SearchQueryOutput["omittedSources"];
    results: SearchResult[];
    evaluatedAt: string;
  }>;
  state: string;
} {
  const savedSearches = new Map(store.listSavedSearches().map((saved) => [saved.id, saved]));
  const monitors = store.listMonitors().filter((monitor) => {
    if (input.id) return monitor.id === input.id;
    return input.includeDisabled || monitor.enabled;
  });
  const evaluatedAt = new Date().toISOString();
  const items = monitors.map((monitor) => {
    const saved = savedSearches.get(monitor.savedSearchId);
    if (!saved) {
      return {
        monitorId: monitor.id,
        savedSearchId: monitor.savedSearchId,
        ...(monitor.name ? { name: monitor.name } : {}),
        ...(monitor.cadence ? { cadence: monitor.cadence } : {}),
        enabled: monitor.enabled,
        state: "missing_saved_search" as const,
        resultCount: 0,
        partial: true,
        omittedSources: [{
          source: "saved_searches",
          reason: "error" as const,
          message: `Saved search '${monitor.savedSearchId}' was not found.`,
        }],
        results: [],
        evaluatedAt,
      };
    }
    const query = { ...saved.query, ...(input.limit === undefined ? {} : { limit: input.limit }) };
    const output = store.query(query);
    return {
      monitorId: monitor.id,
      savedSearchId: monitor.savedSearchId,
      name: monitor.name ?? saved.name,
      ...(monitor.cadence ? { cadence: monitor.cadence } : {}),
      enabled: monitor.enabled,
      query,
      state: "ready" as const,
      resultCount: output.results.length,
      partial: output.partial,
      omittedSources: output.omittedSources,
      results: output.results,
      evaluatedAt,
    };
  });
  const state = items.length === 0 ? "empty" : items.some((item) => item.partial) ? "partial" : "ready";
  return { action: "evaluate", items, state };
}

function searchProfile(value: unknown): SearchProfileId {
  return value === "full" ? "full" : "framework";
}

function searchStrategy(value: unknown): SearchQueryInput["strategy"] {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

function searchEmbedding(value: unknown): SearchQueryInput["embedding"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { model?: unknown; vector?: unknown };
  if (typeof record.model !== "string" || !Array.isArray(record.vector)) return undefined;
  const vector = record.vector.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  return vector.length === record.vector.length && vector.length ? { model: record.model, vector } : undefined;
}

function searchEmbeddingFromParams(params: Record<string, unknown>, query: string): SearchQueryInput["embedding"] {
  const explicit = searchEmbedding(params.embedding);
  if (explicit) return explicit;
  const model = stringParam(params.embeddingModel);
  const requested = model === LOCAL_TEXT_EMBEDDING_MODEL || params.localEmbedding === true;
  if (!requested) return undefined;
  return createLocalTextEmbedding(query, { model: model ?? LOCAL_TEXT_EMBEDDING_MODEL });
}

function searchAgentBudget(value: unknown): SearchQueryInput["agentBudget"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const maxResults = numberParam(record.maxResults);
  const maxResultsPerSource = numberParam(record.maxResultsPerSource);
  const maxResultsPerDomain = numberParam(record.maxResultsPerDomain);
  if (maxResults === undefined && maxResultsPerSource === undefined && maxResultsPerDomain === undefined) return undefined;
  return {
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(maxResultsPerSource === undefined ? {} : { maxResultsPerSource }),
    ...(maxResultsPerDomain === undefined ? {} : { maxResultsPerDomain }),
  };
}

function searchAuditType(value: unknown): SearchAuditEventType | undefined {
  return value === "action" || value === "sensitive_query" ? value : undefined;
}

function searchJobStatus(value: unknown): "queued" | "leased" | "done" | "failed" | undefined {
  return value === "queued" || value === "leased" || value === "done" || value === "failed" ? value : undefined;
}

function requiredSearchSourceState(value: unknown): SearchSourceState {
  if (
    value === "enabled" ||
    value === "disabled" ||
    value === "paused" ||
    value === "excluded" ||
    value === "backfilling" ||
    value === "degraded" ||
    value === "external_pending" ||
    value === "error"
  ) {
    return value;
  }
  throw new Error("state is required");
}

function requiredSearchJobOperation(value: unknown): "upsert" | "delete" | "backfill" | "rebuild" | "embed" {
  if (value === "upsert" || value === "delete" || value === "backfill" || value === "rebuild" || value === "embed") return value;
  throw new Error("operation is required");
}

function requiredSearchEventOperation(value: unknown): "upsert" | "delete" {
  if (value === "upsert" || value === "delete") return value;
  throw new Error("operation must be upsert or delete");
}

function localEmbeddingModel(value: unknown): string {
  const model = stringParam(value);
  if (!model || model === LOCAL_TEXT_EMBEDDING_MODEL) return LOCAL_TEXT_EMBEDDING_MODEL;
  throw new Error(`Search local embedding indexing only supports ${LOCAL_TEXT_EMBEDDING_MODEL}; provider-backed embedding workers are EXTERNAL PENDING.`);
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = stringParam(params[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayParam(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  return entries.length ? entries : undefined;
}

function recordParam(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function searchQueryRequiresAudit(query: string, results: SearchResult[], filters: Record<string, unknown> | undefined): boolean {
  if (results.some((result) => result.permissions?.redacted)) return true;
  if (filters?.redacted === true || filters?.canPreview === false) return true;
  return /\b(secret|private|restricted|sensitive|token|password|credential)\b/i.test(query);
}
