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

export type SearchActionKind = "open" | "copy" | "run" | "rebuild" | "custom";

export type SearchActionRisk = "read" | "write" | "destructive" | "cost" | "system";

export interface SearchBudgets {
  hotMs: number;
  globalFirstBatchMs: number;
  sourceTimeoutMs: number;
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
  };
  explanation?: SearchResultExplanation;
  metadata?: Record<string, unknown>;
}

export interface SearchResultExplanation {
  sourceScore?: number;
  rankingHints?: Record<string, number>;
  scoreBreakdown?: {
    lexical: number;
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
  profile?: SearchProfileId;
  actor?: string;
  surface?: string;
  limit?: number;
  explain?: boolean;
  filters?: Record<string, unknown>;
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
          const results = await withTimeout(
            Promise.resolve(source.query(input, { budgets, startedAt })),
            budgets.sourceTimeoutMs,
          );
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
      const results = settled
        .flatMap((entry) => entry.results.map((result) => normalizeSearchResult(result, entry.source.manifest)))
        .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
        .slice(0, Math.max(1, input.limit ?? 20));
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

export function scoreLexicalMatch(query: string, text: string): { score: number; matchedBy: SearchMatchKind[] } {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedText = text.toLowerCase();
  if (!normalizedQuery || !normalizedText) return { score: 0, matchedBy: [] };
  if (normalizedText === normalizedQuery) return { score: 100, matchedBy: ["exact"] };
  if (normalizedText.startsWith(normalizedQuery)) return { score: 85, matchedBy: ["prefix"] };
  if (normalizedText.includes(normalizedQuery)) return { score: 70, matchedBy: ["fts"] };
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const hits = terms.filter((term) => normalizedText.includes(term)).length;
  if (hits === 0) return { score: 0, matchedBy: [] };
  return { score: 30 + hits * 10, matchedBy: ["fuzzy"] };
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

class SearchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`search source timed out after ${timeoutMs}ms`);
    this.name = "SearchTimeoutError";
  }
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
