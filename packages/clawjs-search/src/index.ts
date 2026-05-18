export type SearchProfileId = "framework" | "full";

export type SearchAclLevel = "domain" | "source" | "agent";

export type SearchSourceDefaultPermission = "opt_in" | "always";

export type SearchSourceState =
  | "enabled"
  | "disabled"
  | "paused"
  | "excluded"
  | "backfilling"
  | "degraded"
  | "error";

export type SearchSourceProfile = "framework" | "full";

export type SearchMatchKind = "exact" | "prefix" | "fuzzy" | "fts" | "semantic";

export type SearchQueryStrategy = "lexical" | "semantic" | "hybrid";

export type SearchActionKind = "open" | "copy" | "run" | "rebuild" | "custom";

export type SearchActionRisk = "read" | "write" | "destructive" | "cost" | "system";

export interface SearchBudgets {
  hotMs: number;
  globalFirstBatchMs: number;
  sourceTimeoutMs: number;
}

export type SearchEntrypointId = "root-search" | "search-index" | "chat-search";

export interface SearchHotkeyContract {
  bindingId: string;
  state: "ready" | "external_pending" | "not_applicable";
  owner: "framework" | "signed_host" | "host_ui";
  defaultChord?: string;
  reservedChord?: string;
  notes: string[];
}

export interface SearchEntrypointContract {
  id: SearchEntrypointId;
  label: string;
  scope: "root" | "admin" | "chat";
  route?: string;
  command?: string;
  defaultProfile: SearchProfileId;
  queryScope: "framework" | "technical_admin" | "conversations_only";
  hotkey: SearchHotkeyContract;
  preservesConversationSearchIsolation: boolean;
}

export type SearchEngineId = "sqlite" | (string & {});

export interface SearchEngineDescriptor {
  id: SearchEngineId;
  label: string;
  version: number;
  storage: {
    kind: "sidecar" | "external";
    defaultFileName?: string;
    rebuildable: boolean;
    ownsCanonicalData: boolean;
    shardModel: "logical" | "physical" | "external";
  };
  capabilities: {
    fts: boolean;
    fragments: boolean;
    actions: boolean;
    sourceControls: boolean;
    cursors: boolean;
    tombstones: boolean;
    jobQueue: boolean;
    savedSearches: boolean;
    monitors: boolean;
    audit: boolean;
    vectors: boolean;
    rankingCache: boolean;
    transactions: boolean;
  };
  query: {
    strategies: SearchQueryStrategy[];
    filters: boolean;
    acl: boolean;
    agentBudgets: boolean;
  };
}

export interface SearchSourceCapabilities {
  fastPath: boolean;
  fragments: boolean;
  actions: boolean;
  facets: boolean;
  semantic: "unsupported" | "optional" | "required";
}

export interface SearchSourceIndexingPolicy {
  strategy: "event_driven_backfill";
  freshness: "near_immediate" | "async" | "manual";
  contentDepth: "metadata" | "metadata_content" | "derived_text";
  defaultState: "on" | "off";
  heavyExtraction: "none" | "async_throttled";
  limits?: SearchSourceIndexingLimits;
}

export interface SearchSourceIndexingLimits {
  maxBodyBytes: number;
  maxFragments: number;
  maxFragmentBytes: number;
}

export interface SearchSourcePermissionPolicy {
  default: SearchSourceDefaultPermission;
  acl: SearchAclLevel[];
  redactSensitivePreviews: boolean;
  audit: Array<"actions" | "sensitive_queries">;
}

export interface SearchFacetDeclaration {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "enum";
  values?: string[];
}

export interface SearchSourceManifest {
  id: string;
  domain: string;
  name: string;
  version: number;
  profile: SearchSourceProfile;
  resultTypes: string[];
  capabilities: SearchSourceCapabilities;
  indexing: SearchSourceIndexingPolicy;
  permissions: SearchSourcePermissionPolicy;
  facets?: SearchFacetDeclaration[];
}

export const LOCAL_TEXT_EMBEDDING_MODEL = "local-text-v1";
export const LOCAL_TEXT_EMBEDDING_DIMENSIONS = 64;

export interface LocalTextEmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export function createLocalTextEmbedding(text: string, options: LocalTextEmbeddingOptions = {}): { model: string; vector: number[] } {
  const dimensions = Math.max(8, Math.min(1024, Math.floor(options.dimensions ?? LOCAL_TEXT_EMBEDDING_DIMENSIONS)));
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = localTextEmbeddingTokens(text);
  if (!tokens.length) {
    vector[0] = 1;
    return { model: options.model ?? LOCAL_TEXT_EMBEDDING_MODEL, vector };
  }
  for (const token of tokens) {
    const hash = localTextEmbeddingHash(token);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign / Math.sqrt(tokens.length);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return {
    model: options.model ?? LOCAL_TEXT_EMBEDDING_MODEL,
    vector: magnitude ? vector.map((value) => value / magnitude) : vector,
  };
}

export interface SearchAction {
  id: string;
  kind: SearchActionKind;
  label: string;
  requiresApproval?: boolean;
  grant?: string;
  risk?: SearchActionRisk;
}

export interface SearchActionExecutionPlan {
  id: string;
  resultId: string;
  actionId: string;
  actionKind: SearchActionKind;
  source: string;
  domain: string;
  resourceId?: string;
  actor?: string;
  surface?: string;
  grant: string;
  risk: SearchActionRisk;
  requiresApproval: boolean;
  hostApprovalId?: string;
  dryRun: boolean;
  status: "planned" | "blocked" | "brokered";
  reasons: string[];
  broker: {
    system: "host grants/approvals";
    operation: "search.action.execute";
    sideEffects: "none" | "host_brokered";
  };
}

export interface SearchInteractionInput {
  resultId: string;
  actor?: string;
  surface?: string;
  actionId?: string;
  kind?: "open" | "copy" | "action" | "preview" | "custom";
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface SearchInteraction {
  resultId: string;
  source: string;
  domain: string;
  shard?: string;
  actor?: string;
  surface?: string;
  actionId?: string;
  kind: "open" | "copy" | "action" | "preview" | "custom";
  count: number;
  lastInteractedAt: string;
  metadata: Record<string, unknown>;
}

export interface SearchFragment {
  id: string;
  title?: string;
  snippet?: string;
  score?: number;
  highlights?: string[];
}

export interface SearchResult {
  id: string;
  source: string;
  shard?: string;
  domain: string;
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  highlights?: string[];
  score: number;
  updatedAt?: string;
  resourceId?: string;
  path?: string;
  fragments?: SearchFragment[];
  actions?: SearchAction[];
  permissions?: {
    canOpen?: boolean;
    canPreview?: boolean;
    redacted?: boolean;
    allowedActors?: string[];
    allowedAgents?: string[];
    requiredScopes?: string[];
  };
  explanation?: SearchResultExplanation;
  metadata?: Record<string, unknown>;
}

export interface SearchResultExplanation {
  sourceScore?: number;
  rankingHints?: Record<string, number>;
  scoreBreakdown?: {
    lexical: number;
    semantic?: number;
    base: number;
    hints: number;
    frecency: number;
    context: number;
  };
  matchedBy?: SearchMatchKind[];
  omitted?: string[];
}

export interface SearchQueryInput {
  query: string;
  domains?: string[];
  sources?: string[];
  shards?: string[];
  profile?: SearchProfileId;
  actor?: string;
  surface?: string;
  limit?: number;
  explain?: boolean;
  filters?: Record<string, unknown>;
  strategy?: SearchQueryStrategy;
  agentBudget?: SearchAgentResultBudget;
  embedding?: {
    model: string;
    vector: number[];
  };
}

export interface SearchAgentResultBudget {
  maxResults?: number;
  maxResultsPerSource?: number;
  maxResultsPerDomain?: number;
}

export interface SearchQueryOutput {
  query: string;
  profile: SearchProfileId;
  results: SearchResult[];
  facets?: SearchFacetDeclaration[];
  partial: boolean;
  omittedSources: Array<{
    source: string;
    reason: "timeout" | "disabled" | "profile" | "error";
    message?: string;
  }>;
  elapsedMs: number;
}

export interface SearchSourceStatus {
  source: string;
  domain: string;
  state: SearchSourceState;
  backlog: number;
  lastIndexedAt?: string;
  error?: string;
}

export interface SearchSourceAdapter {
  manifest: SearchSourceManifest;
  query(input: SearchQueryInput, context: SearchQueryContext): Promise<SearchResult[]> | SearchResult[];
  status?(): Promise<SearchSourceStatus> | SearchSourceStatus;
  rebuild?(): Promise<{ reindexed: number }> | { reindexed: number };
  actions?(result: SearchResult): Promise<SearchAction[]> | SearchAction[];
}

export interface SearchQueryContext {
  budgets: SearchBudgets;
  startedAt: number;
}

export interface SearchRegistry {
  register(source: SearchSourceAdapter): void;
  listSources(profile?: SearchProfileId): SearchSourceManifest[];
  status(): Promise<SearchSourceStatus[]>;
  query(input: SearchQueryInput): Promise<SearchQueryOutput>;
}

export interface RootSearchFederator extends SearchRegistry {
  readonly budgets: SearchBudgets;
}

export interface RootSearchFederatorOptions {
  budgets?: Partial<SearchBudgets>;
}

export const SEARCH_PROFILES: Array<{ id: SearchProfileId; label: string; defaultEnabled: boolean }> = [
  { id: "framework", label: "Framework", defaultEnabled: true },
  { id: "full", label: "Full", defaultEnabled: false },
];

export const DEFAULT_SEARCH_BUDGETS: SearchBudgets = {
  hotMs: 50,
  globalFirstBatchMs: 200,
  sourceTimeoutMs: 75,
};

export const SEARCH_ENTRYPOINT_CONTRACTS: SearchEntrypointContract[] = [
  {
    id: "root-search",
    label: "Root Search",
    scope: "root",
    route: "/search",
    command: "claw search query",
    defaultProfile: "framework",
    queryScope: "framework",
    hotkey: {
      bindingId: "search.root.global",
      state: "external_pending",
      owner: "signed_host",
      notes: [
        "Requires a signed host/global shortcut broker before native binding can be validated.",
        "Must stay separate from the conversations-only chat search shortcut.",
      ],
    },
    preservesConversationSearchIsolation: true,
  },
  {
    id: "search-index",
    label: "Search Index",
    scope: "admin",
    route: "/search-index",
    command: "claw search sources",
    defaultProfile: "framework",
    queryScope: "technical_admin",
    hotkey: {
      bindingId: "search.index.admin",
      state: "not_applicable",
      owner: "framework",
      notes: ["Technical/admin surface; no global native shortcut is required."],
    },
    preservesConversationSearchIsolation: true,
  },
  {
    id: "chat-search",
    label: "Chat Search",
    scope: "chat",
    defaultProfile: "framework",
    queryScope: "conversations_only",
    hotkey: {
      bindingId: "search.chat.current",
      state: "ready",
      owner: "host_ui",
      reservedChord: "Command-G",
      notes: ["Existing Clawix Mac search remains conversations-only and must not show Root Search results."],
    },
    preservesConversationSearchIsolation: true,
  },
];

export const DEFAULT_SEARCH_ENGINE_ID = "sqlite";

export const SEARCH_SQLITE_ENGINE = defineSearchEngine({
  id: DEFAULT_SEARCH_ENGINE_ID,
  label: "SQLite Search sidecar",
  version: 1,
  storage: {
    kind: "sidecar",
    defaultFileName: "search.sqlite",
    rebuildable: true,
    ownsCanonicalData: false,
    shardModel: "physical",
  },
  capabilities: {
    fts: true,
    fragments: true,
    actions: true,
    sourceControls: true,
    cursors: true,
    tombstones: true,
    jobQueue: true,
    savedSearches: true,
    monitors: true,
    audit: true,
    vectors: true,
    rankingCache: true,
    transactions: true,
  },
  query: {
    strategies: ["lexical", "semantic", "hybrid"],
    filters: true,
    acl: true,
    agentBudgets: true,
  },
});

export function defineSearchEngine(descriptor: SearchEngineDescriptor): SearchEngineDescriptor {
  validateSearchEngineDescriptor(descriptor);
  return descriptor;
}

export function defineSearchSource(manifest: SearchSourceManifest): SearchSourceManifest {
  validateSearchSourceManifest(manifest);
  return manifest;
}

export function createRootSearchFederator(options: RootSearchFederatorOptions = {}): RootSearchFederator {
  const budgets = { ...DEFAULT_SEARCH_BUDGETS, ...options.budgets };
  const sources = new Map<string, SearchSourceAdapter>();

  return {
    budgets,
    register(source) {
      validateSearchSourceManifest(source.manifest);
      if (sources.has(source.manifest.id)) {
        throw new Error(`duplicate search source: ${source.manifest.id}`);
      }
      sources.set(source.manifest.id, source);
    },
    listSources(profile = "framework") {
      return [...sources.values()]
        .map((source) => source.manifest)
        .filter((manifest) => profile === "full" || manifest.profile === "framework")
        .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id));
    },
    async status() {
      const rows: SearchSourceStatus[] = [];
      for (const source of sources.values()) {
        if (source.status) {
          rows.push(await source.status());
        } else {
          rows.push({
            source: source.manifest.id,
            domain: source.manifest.domain,
            state: source.manifest.indexing.defaultState === "on" ? "enabled" : "disabled",
            backlog: 0,
          });
        }
      }
      return rows.sort((left, right) => left.domain.localeCompare(right.domain) || left.source.localeCompare(right.source));
    },
    async query(input) {
      const startedAt = Date.now();
      const profile = input.profile ?? "framework";
      const selected = [...sources.values()].filter((source) => {
        if (profile !== "full" && source.manifest.profile !== "framework") return false;
        if (input.sources?.length && !input.sources.includes(source.manifest.id)) return false;
        if (input.domains?.length && !input.domains.includes(source.manifest.domain)) return false;
        return true;
      });
      const omittedSources: SearchQueryOutput["omittedSources"] = [];
      const settled = await Promise.all(selected.map(async (source) => {
        try {
          const sourceBudgetMs = searchSourceDeadlineMs(budgets, startedAt);
          const { status, results } = await withTimeout((async () => {
            const currentStatus = source.status
              ? await Promise.resolve(source.status())
              : defaultSourceStatus(source.manifest);
            if (currentStatus.state === "disabled" || currentStatus.state === "paused" || currentStatus.state === "excluded") {
              return { status: currentStatus, results: [] };
            }
            const sourceResults = await Promise.resolve(source.query(input, { budgets, startedAt }));
            return { status: currentStatus, results: sourceResults };
          })(), sourceBudgetMs);
          if (status.state === "disabled" || status.state === "paused" || status.state === "excluded") {
            omittedSources.push({
              source: source.manifest.id,
              reason: "disabled",
              message: `source is ${status.state}`,
            });
            return { source, results: [] };
          }
          return { source, results };
        } catch (error) {
          omittedSources.push({
            source: source.manifest.id,
            reason: error instanceof SearchTimeoutError ? "timeout" : "error",
            message: error instanceof Error ? error.message : String(error),
          });
          return { source, results: [] };
        }
      }));
      const rankedResults = settled
        .flatMap((entry) => entry.results.map((result) => normalizeSearchResult(result, entry.source.manifest)))
        .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
      const results = applyAgentResultBudget(rankedResults, input);
      return {
        query: input.query,
        profile,
        results,
        partial: omittedSources.length > 0,
        omittedSources,
        elapsedMs: Date.now() - startedAt,
      };
    },
  };
}

export function createSearchRegistry(options: RootSearchFederatorOptions = {}): SearchRegistry {
  return createRootSearchFederator(options);
}

export function listSearchEntrypointContracts(): SearchEntrypointContract[] {
  return SEARCH_ENTRYPOINT_CONTRACTS.map((entrypoint) => ({
    ...entrypoint,
    hotkey: {
      ...entrypoint.hotkey,
      notes: [...entrypoint.hotkey.notes],
    },
  }));
}

export function createSearchActionExecutionPlan(input: {
  result: SearchResult;
  action: SearchAction;
  dryRun: boolean;
  hostApprovalId?: string;
  actor?: string;
  surface?: string;
}): SearchActionExecutionPlan {
  const grant = input.action.grant ?? `search.${input.result.domain}.${input.action.kind}`;
  const risk = input.action.risk ?? (input.action.kind === "open" || input.action.kind === "copy" ? "read" : "system");
  const requiresApproval = input.action.requiresApproval ?? input.action.kind !== "copy";
  const status = input.dryRun
    ? "planned"
    : requiresApproval && !input.hostApprovalId
      ? "blocked"
      : "brokered";
  const reasons = [
    ...(requiresApproval ? ["host_approval_required"] : []),
    ...(status === "brokered" ? ["host_broker_receipt_only"] : []),
  ];
  return {
    id: `search-action:${input.result.id}:${input.action.id}`,
    resultId: input.result.id,
    actionId: input.action.id,
    actionKind: input.action.kind,
    source: input.result.source,
    domain: input.result.domain,
    ...(input.result.resourceId ? { resourceId: input.result.resourceId } : {}),
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.surface ? { surface: input.surface } : {}),
    grant,
    risk,
    requiresApproval,
    ...(input.hostApprovalId ? { hostApprovalId: input.hostApprovalId } : {}),
    dryRun: input.dryRun,
    status,
    reasons,
    broker: {
      system: "host grants/approvals",
      operation: "search.action.execute",
      sideEffects: input.dryRun ? "none" : "host_brokered",
    },
  };
}

export function createFrameworkSearchSourceManifest(input: {
  id: string;
  domain: string;
  name: string;
  resultTypes: string[];
  facets?: SearchFacetDeclaration[];
}): SearchSourceManifest {
  return defineSearchSource({
    id: input.id,
    domain: input.domain,
    name: input.name,
    version: 1,
    profile: "framework",
    resultTypes: input.resultTypes,
    facets: input.facets,
    capabilities: {
      fastPath: true,
      fragments: true,
      actions: true,
      facets: Boolean(input.facets?.length),
      semantic: "optional",
    },
    indexing: {
      strategy: "event_driven_backfill",
      freshness: "near_immediate",
      contentDepth: "metadata_content",
      defaultState: "on",
      heavyExtraction: "async_throttled",
      limits: {
        maxBodyBytes: 64 * 1024,
        maxFragments: 50,
        maxFragmentBytes: 8 * 1024,
      },
    },
    permissions: {
      default: "opt_in",
      acl: ["domain", "source", "agent"],
      redactSensitivePreviews: true,
      audit: ["actions", "sensitive_queries"],
    },
  });
}

export function createFullSearchSourceManifest(input: {
  id: string;
  domain: string;
  name: string;
  resultTypes: string[];
  facets?: SearchFacetDeclaration[];
  contentDepth?: SearchSourceIndexingPolicy["contentDepth"];
  heavyExtraction?: SearchSourceIndexingPolicy["heavyExtraction"];
}): SearchSourceManifest {
  return defineSearchSource({
    id: input.id,
    domain: input.domain,
    name: input.name,
    version: 1,
    profile: "full",
    resultTypes: input.resultTypes,
    facets: input.facets,
    capabilities: {
      fastPath: false,
      fragments: true,
      actions: true,
      facets: Boolean(input.facets?.length),
      semantic: "optional",
    },
    indexing: {
      strategy: "event_driven_backfill",
      freshness: "manual",
      contentDepth: input.contentDepth ?? "metadata",
      defaultState: "off",
      heavyExtraction: input.heavyExtraction ?? "async_throttled",
      limits: {
        maxBodyBytes: 32 * 1024,
        maxFragments: 20,
        maxFragmentBytes: 4 * 1024,
      },
    },
    permissions: {
      default: "opt_in",
      acl: ["domain", "source", "agent"],
      redactSensitivePreviews: true,
      audit: ["actions", "sensitive_queries"],
    },
  });
}

export function createCommandSearchSourceManifest(): SearchSourceManifest {
  return defineSearchSource({
    id: "commands",
    domain: "commands",
    name: "Commands",
    version: 1,
    profile: "framework",
    resultTypes: ["command"],
    capabilities: {
      fastPath: true,
      fragments: false,
      actions: true,
      facets: true,
      semantic: "unsupported",
    },
    indexing: {
      strategy: "event_driven_backfill",
      freshness: "near_immediate",
      contentDepth: "metadata",
      defaultState: "on",
      heavyExtraction: "none",
      limits: {
        maxBodyBytes: 16 * 1024,
        maxFragments: 20,
        maxFragmentBytes: 4 * 1024,
      },
    },
    permissions: {
      default: "opt_in",
      acl: ["domain", "source", "agent"],
      redactSensitivePreviews: true,
      audit: ["actions", "sensitive_queries"],
    },
    facets: [{ id: "kind", label: "Kind", type: "enum", values: ["canonical", "portal", "alias"] }],
  });
}

export function createBuiltinSearchSourceManifests(): SearchSourceManifest[] {
  return [
    createFrameworkSearchSourceManifest({
      id: "sessions.chats",
      domain: "sessions",
      name: "Chats",
      resultTypes: ["chat", "message"],
    }),
    createFrameworkSearchSourceManifest({
      id: "database.records",
      domain: "database",
      name: "Database records",
      resultTypes: ["record", "fragment"],
      facets: [
        { id: "namespaceId", label: "Namespace", type: "string" },
        { id: "collection", label: "Collection", type: "string" },
        { id: "sensitive", label: "Sensitive", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "work.items",
      domain: "work",
      name: "Work items",
      resultTypes: ["task", "project", "goal", "person", "inbox_thread", "event", "work_item"],
      facets: [
        { id: "collection", label: "Collection", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "priority", label: "Priority", type: "string" },
        { id: "projectId", label: "Project", type: "string" },
        { id: "assigneeActorId", label: "Assignee", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document", "block"],
      facets: [
        { id: "namespaceId", label: "Namespace", type: "string" },
        { id: "scopeKind", label: "Scope", type: "string" },
        { id: "accessLevel", label: "Access", type: "string" },
        { id: "blockType", label: "Block type", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "notes.pages",
      domain: "notes",
      name: "Notes",
      resultTypes: ["note", "page", "block"],
      facets: [
        { id: "space", label: "Space", type: "string" },
        { id: "surface", label: "Surface", type: "string" },
        { id: "visibility", label: "Visibility", type: "string" },
        { id: "sensitivity", label: "Sensitivity", type: "string" },
        { id: "tag", label: "Tag", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "knowledge.graph",
      domain: "knowledge",
      name: "Knowledge",
      resultTypes: ["entity", "fact"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "type", label: "Type", type: "string" },
        { id: "predicate", label: "Predicate", type: "string" },
        { id: "source", label: "Source", type: "string" },
        { id: "sensitivity", label: "Sensitivity", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "signals.observations",
      domain: "signals",
      name: "Signals",
      resultTypes: ["vertical", "variable", "observation"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "verticalId", label: "Vertical", type: "string" },
        { id: "variableId", label: "Variable", type: "string" },
        { id: "unit", label: "Unit", type: "string" },
        { id: "sensitive", label: "Sensitive", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "calendar.events",
      domain: "calendar",
      name: "Calendar events",
      resultTypes: ["event"],
      facets: [
        { id: "calendarId", label: "Calendar", type: "string" },
        { id: "source", label: "Source", type: "string" },
        { id: "hasPage", label: "Has page", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "finance.records",
      domain: "finance",
      name: "Finance records",
      resultTypes: ["transaction", "finance_record"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "accountId", label: "Account", type: "string" },
        { id: "currency", label: "Currency", type: "string" },
        { id: "category", label: "Category", type: "string" },
        { id: "sensitive", label: "Sensitive", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "eln.records",
      domain: "eln",
      name: "ELN records",
      resultTypes: ["lab_notebook", "notebook_entry", "protocol_run", "experiment_observation"],
      facets: [
        { id: "collection", label: "Collection", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "notebookId", label: "Notebook", type: "string" },
        { id: "studyId", label: "Study", type: "string" },
        { id: "sampleId", label: "Sample", type: "string" },
        { id: "assayId", label: "Assay", type: "string" },
        { id: "sensitive", label: "Sensitive", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "images.derived",
      domain: "images",
      name: "Images",
      resultTypes: ["image", "ocr", "label"],
      facets: [
        { id: "imageType", label: "Image type", type: "string" },
        { id: "provenance", label: "Provenance", type: "string" },
        { id: "operation", label: "Operation", type: "string" },
        { id: "project", label: "Project", type: "string" },
        { id: "tag", label: "Tag", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "media.assets",
      domain: "media",
      name: "Media assets",
      resultTypes: ["image", "audio", "video", "document", "animation", "asset"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "origin", label: "Origin", type: "string" },
        { id: "direction", label: "Direction", type: "string" },
        { id: "project", label: "Project", type: "string" },
        { id: "provider", label: "Provider", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "slides.decks",
      domain: "slides",
      name: "Slide decks",
      resultTypes: ["deck", "slide"],
      facets: [
        { id: "theme", label: "Theme", type: "string" },
        { id: "layout", label: "Slide layout", type: "string" },
        { id: "authorAgentId", label: "Author agent", type: "string" },
        { id: "outputFormat", label: "Output format", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "sheets.workbooks",
      domain: "sheets",
      name: "Workbooks",
      resultTypes: ["workbook", "sheet", "table", "cell"],
      facets: [
        { id: "sheetName", label: "Sheet", type: "string" },
        { id: "authorAgentId", label: "Author agent", type: "string" },
        { id: "outputFormat", label: "Output format", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "generations.artifacts",
      domain: "generations",
      name: "Generated artifacts",
      resultTypes: ["generation", "artifact", "image", "audio", "video", "document"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "backendId", label: "Backend", type: "string" },
        { id: "backendSource", label: "Backend source", type: "string" },
        { id: "model", label: "Model", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "code.symbols",
      domain: "code",
      name: "Code",
      resultTypes: ["project", "file", "symbol", "doc"],
      facets: [
        { id: "language", label: "Language", type: "string" },
        { id: "extension", label: "Extension", type: "string" },
        { id: "relativePath", label: "Path", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "skills.registry",
      domain: "skills",
      name: "Skills",
      resultTypes: ["skill", "procedure", "instruction", "bundle"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "scopeKind", label: "Scope", type: "string" },
        { id: "requiresProtectedRefs", label: "Requires protected refs", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "providers.routing",
      domain: "providers",
      name: "Provider routing",
      resultTypes: ["routing_rule", "provider_setting"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "feature", label: "Feature", type: "string" },
        { id: "capability", label: "Capability", type: "string" },
        { id: "provider", label: "Provider", type: "string" },
        { id: "enabled", label: "Enabled", type: "boolean" },
        { id: "hasAccountRef", label: "Has account ref", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "snippets.library",
      domain: "snippets",
      name: "Snippets",
      resultTypes: ["snippet", "prompt", "template", "slash"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "shortcut", label: "Shortcut", type: "string" },
        { id: "scopeKind", label: "Scope", type: "string" },
        { id: "skillRef", label: "Skill reference", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "agents.catalog",
      domain: "agents",
      name: "Agents",
      resultTypes: ["agent", "personality", "skill_collection", "connection"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "runtime", label: "Runtime", type: "string" },
        { id: "model", label: "Model", type: "string" },
        { id: "provider", label: "Provider", type: "string" },
        { id: "builtin", label: "Built in", type: "boolean" },
        { id: "hasProtectedRef", label: "Has protected ref", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "marketplace.choices",
      domain: "marketplace",
      name: "Marketplace choices",
      resultTypes: ["choice", "selection", "preference"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "target", label: "Target", type: "string" },
        { id: "choice", label: "Choice", type: "string" },
        { id: "status", label: "Status", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "content.items",
      domain: "content",
      name: "Content",
      resultTypes: ["entry", "campaign_item", "asset"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "brandId", label: "Brand", type: "string" },
        { id: "campaignId", label: "Campaign", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "business.records",
      domain: "business",
      name: "Business",
      resultTypes: ["record", "company", "customer", "vendor"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "status", label: "Status", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "social.posts",
      domain: "social",
      name: "Social",
      resultTypes: ["post", "draft", "publication"],
      facets: [
        { id: "status", label: "Status", type: "string" },
        { id: "channel", label: "Channel", type: "string" },
        { id: "scheduled", label: "Scheduled", type: "boolean" },
        { id: "published", label: "Published", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "iot.config",
      domain: "iot",
      name: "IoT config",
      resultTypes: ["device", "room", "automation", "config"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "enabled", label: "Enabled", type: "boolean" },
        { id: "hasProtectedRef", label: "Has protected ref", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "connectors.catalog",
      domain: "connectors",
      name: "Connectors",
      resultTypes: ["operation", "provider", "capability"],
      facets: [
        { id: "provider", label: "Provider", type: "string" },
        { id: "runtimeKind", label: "Runtime", type: "string" },
        { id: "support", label: "Support", type: "string" },
        { id: "requiresApproval", label: "Requires approval", type: "boolean" },
        { id: "costRisk", label: "Cost risk", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "mcp.servers",
      domain: "mcp",
      name: "MCP servers",
      resultTypes: ["server", "tool_server", "config"],
      facets: [
        { id: "transport", label: "Transport", type: "string" },
        { id: "enabled", label: "Enabled", type: "boolean" },
        { id: "hasEnv", label: "Has env", type: "boolean" },
        { id: "hasHeaders", label: "Has headers", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "apps.catalog",
      domain: "apps",
      name: "Apps",
      resultTypes: ["app", "application", "workspace_app"],
      facets: [
        { id: "slug", label: "Slug", type: "string" },
        { id: "pinned", label: "Pinned", type: "boolean" },
        { id: "createdByChatId", label: "Created by chat", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "design.resources",
      domain: "design",
      name: "Design resources",
      resultTypes: ["resource", "template", "style", "reference", "asset"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "builtin", label: "Built in", type: "boolean" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "runtime.events",
      domain: "runtime",
      name: "Runtime events",
      resultTypes: ["job", "event", "operational_event"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "level", label: "Level", type: "string" },
        { id: "status", label: "Status", type: "string" },
        { id: "sidecar", label: "Sidecar", type: "string" },
      ],
    }),
    createFrameworkSearchSourceManifest({
      id: "surfaces.routes",
      domain: "surfaces",
      name: "Surface routes",
      resultTypes: ["route", "step", "contract"],
      facets: [
        { id: "owner", label: "Owner", type: "string" },
        { id: "visibility", label: "Visibility", type: "string" },
        { id: "fromId", label: "From", type: "string" },
        { id: "toId", label: "To", type: "string" },
        { id: "hasGaps", label: "Has gaps", type: "boolean" },
      ],
    }),
    createFullSearchSourceManifest({
      id: "local.files",
      domain: "files",
      name: "Local files",
      resultTypes: ["file", "folder", "application"],
      contentDepth: "metadata_content",
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "extension", label: "Extension", type: "string" },
        { id: "root", label: "Root", type: "string" },
      ],
    }),
    createFullSearchSourceManifest({
      id: "native.system",
      domain: "native",
      name: "Native system",
      resultTypes: ["application", "preference", "shortcut", "contact"],
      facets: [
        { id: "kind", label: "Kind", type: "string" },
        { id: "permission", label: "Permission", type: "string" },
      ],
    }),
    createFullSearchSourceManifest({
      id: "web.ingested",
      domain: "web",
      name: "Web ingested",
      resultTypes: ["page", "bookmark", "crawl"],
      contentDepth: "derived_text",
      facets: [
        { id: "host", label: "Host", type: "string" },
        { id: "crawlScope", label: "Crawl scope", type: "string" },
      ],
    }),
    createFullSearchSourceManifest({
      id: "external.cache",
      domain: "external",
      name: "External cache",
      resultTypes: ["external_record", "provider_item", "thread"],
      contentDepth: "metadata_content",
      facets: [
        { id: "provider", label: "Provider", type: "string" },
        { id: "app", label: "App", type: "string" },
        { id: "syncMode", label: "Sync mode", type: "string" },
      ],
    }),
    createCommandSearchSourceManifest(),
  ];
}

export function scoreLexicalMatch(query: string, text: string): { score: number; matchedBy: SearchMatchKind[] } {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedText = text.toLowerCase();
  if (!normalizedQuery || !normalizedText) return { score: 0, matchedBy: [] };
  if (normalizedText === normalizedQuery) return { score: 100, matchedBy: ["exact"] };
  if (normalizedText.startsWith(normalizedQuery)) return { score: 85, matchedBy: ["prefix"] };
  if (normalizedText.includes(normalizedQuery)) return { score: 70, matchedBy: ["fts"] };
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const textTerms = normalizedText.split(/[^a-z0-9_]+/u).filter(Boolean);
  const hits = terms.filter((term) => normalizedText.includes(term) || textTerms.some((candidate) => fuzzyTermMatch(term, candidate))).length;
  if (hits === 0) return { score: 0, matchedBy: [] };
  return { score: 30 + hits * 10, matchedBy: ["fuzzy"] };
}

function fuzzyTermMatch(queryTerm: string, candidate: string): boolean {
  if (queryTerm.length < 4 || candidate.length < 4) return false;
  if (/\d/.test(queryTerm) || /\d/.test(candidate)) return false;
  const maxDistance = Math.max(queryTerm.length, candidate.length) >= 5 ? 2 : 1;
  if (Math.abs(queryTerm.length - candidate.length) > maxDistance) return false;
  return boundedEditDistance(queryTerm, candidate, maxDistance) <= maxDistance;
}

function boundedEditDistance(left: string, right: string, maxDistance: number): number {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = current[0] ?? i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? Number.MAX_SAFE_INTEGER) + 1,
        (current[j - 1] ?? Number.MAX_SAFE_INTEGER) + 1,
        (previous[j - 1] ?? Number.MAX_SAFE_INTEGER) + cost,
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length] ?? maxDistance + 1;
}

function validateSearchSourceManifest(manifest: SearchSourceManifest): void {
  if (!manifest.id.trim()) throw new Error("search source id is required");
  if (!manifest.domain.trim()) throw new Error(`search source ${manifest.id} domain is required`);
  if (!manifest.name.trim()) throw new Error(`search source ${manifest.id} name is required`);
  if (!manifest.capabilities.fastPath && manifest.profile === "framework") {
    throw new Error(`framework search source ${manifest.id} must declare a fast path`);
  }
  if (manifest.permissions.default !== "opt_in") {
    throw new Error(`search source ${manifest.id} must be opt-in by default`);
  }
}

function validateSearchEngineDescriptor(descriptor: SearchEngineDescriptor): void {
  if (!descriptor.id.trim()) throw new Error("search engine id is required");
  if (!descriptor.label.trim()) throw new Error(`search engine ${descriptor.id} label is required`);
  if (descriptor.version < 1 || !Number.isInteger(descriptor.version)) {
    throw new Error(`search engine ${descriptor.id} version must be a positive integer`);
  }
  if (descriptor.storage.kind === "sidecar" && !descriptor.storage.defaultFileName?.trim()) {
    throw new Error(`search engine ${descriptor.id} sidecar storage requires a default file name`);
  }
}

function defaultSourceStatus(manifest: SearchSourceManifest): SearchSourceStatus {
  return {
    source: manifest.id,
    domain: manifest.domain,
    state: manifest.indexing.defaultState === "on" ? "enabled" : "disabled",
    backlog: 0,
  };
}

function applyAgentResultBudget(results: SearchResult[], input: SearchQueryInput): SearchResult[] {
  const maxResults = boundedResultBudget(input.agentBudget?.maxResults ?? input.limit ?? 20);
  const maxResultsPerSource = optionalResultBudget(input.agentBudget?.maxResultsPerSource);
  const maxResultsPerDomain = optionalResultBudget(input.agentBudget?.maxResultsPerDomain);
  const sourceCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const filtered: SearchResult[] = [];
  for (const result of results) {
    const sourceCount = sourceCounts.get(result.source) ?? 0;
    if (maxResultsPerSource !== undefined && sourceCount >= maxResultsPerSource) continue;
    const domainCount = domainCounts.get(result.domain) ?? 0;
    if (maxResultsPerDomain !== undefined && domainCount >= maxResultsPerDomain) continue;
    filtered.push(result);
    sourceCounts.set(result.source, sourceCount + 1);
    domainCounts.set(result.domain, domainCount + 1);
    if (filtered.length >= maxResults) break;
  }
  return filtered;
}

function optionalResultBudget(value: number | undefined): number | undefined {
  return value === undefined ? undefined : boundedResultBudget(value);
}

function boundedResultBudget(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(0, Math.floor(value));
}

function normalizeSearchResult(result: SearchResult, manifest: SearchSourceManifest): SearchResult {
  return {
    ...result,
    source: result.source || manifest.id,
    domain: result.domain || manifest.domain,
    permissions: {
      canOpen: true,
      canPreview: true,
      redacted: false,
      ...result.permissions,
    },
  };
}

function localTextEmbeddingTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 512);
}

function localTextEmbeddingHash(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class SearchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`search source timed out after ${timeoutMs}ms`);
    this.name = "SearchTimeoutError";
  }
}

function searchSourceDeadlineMs(budgets: SearchBudgets, startedAt: number): number {
  const elapsed = Date.now() - startedAt;
  const firstBatchRemaining = budgets.globalFirstBatchMs - elapsed;
  return Math.max(1, Math.min(budgets.sourceTimeoutMs, firstBatchRemaining));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SearchTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export * from "./store.ts";
