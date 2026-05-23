import os from "node:os";
import path from "node:path";

import {
  SearchStore,
  createBuiltinSearchSourceManifests,
  type SearchIndexJob,
  type SearchProfileId,
  type SearchSourceManifest,
  type SearchSourceState,
  type SearchSourceStatus,
} from "@clawjs/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isE2EEnabled(): boolean {
  return process.env.CLAW_E2E === "1";
}

type SearchIndexAction = "enable" | "pause" | "exclude" | "resume" | "rebuild" | "onboard";
type SearchSourceSetupKind = "ready" | "local_root" | "web_cache" | "provider_cache" | "signed_host";

interface SearchIndexSourceView {
  id: string;
  name: string;
  domain: string;
  profile: SearchProfileId;
  state: SearchSourceState;
  defaultState: "on" | "off";
  fastPath: boolean;
  semantic: SearchSourceManifest["capabilities"]["semantic"];
  contentDepth: SearchSourceManifest["indexing"]["contentDepth"];
  freshness: SearchSourceManifest["indexing"]["freshness"];
  resultTypes: string[];
  facets: string[];
  permissionDefault: SearchSourceManifest["permissions"]["default"];
  setupKind: SearchSourceSetupKind;
  setupLabel: string;
  setupReady: boolean;
  backlog: number;
  lastIndexedAt?: string;
  error?: string;
  externalPending: boolean;
}

interface SearchIndexOnboarding {
  firstRun: boolean;
  defaultSelectedSourceIds: string[];
  readySourceIds: string[];
  setupRequiredSourceIds: string[];
  externalPendingSourceIds: string[];
}

interface SearchIndexSnapshot {
  profile: SearchProfileId;
  storage: { index: string; indexRebuildable: true };
  summary: {
    sources: number;
    enabled: number;
    queuedJobs: number;
    externalPending: number;
  };
  onboarding: SearchIndexOnboarding;
  sources: SearchIndexSourceView[];
  jobs: SearchIndexJob[];
}

const SOURCE_SETUP: Record<string, { kind: SearchSourceSetupKind; label: string }> = {
  "local.files": { kind: "local_root", label: "Choose local root" },
  "native.system": { kind: "signed_host", label: "Signed host required" },
  "web.ingested": { kind: "web_cache", label: "Choose web cache" },
  "external.cache": { kind: "provider_cache", label: "Choose provider cache" },
};

export async function GET(request: Request) {
  const profile = readProfile(new URL(request.url).searchParams.get("profile"));
  if (isE2EEnabled()) return Response.json(createE2ESnapshot(profile));
  return Response.json(readSearchIndexSnapshot(profile));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source : "";
  const sources = Array.isArray(body.sources) ? body.sources.filter((entry: unknown): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
  const action = isSearchIndexAction(body.action) ? body.action : null;
  const profile = readProfile(typeof body.profile === "string" ? body.profile : undefined);
  if (!action || (action !== "onboard" && !source) || (action === "onboard" && sources.length === 0)) {
    return Response.json({ error: "source and action are required" }, { status: 400 });
  }
  if (isE2EEnabled()) return Response.json(createE2ESnapshot(profile));

  const store = openSearchStore();
  try {
    const known = new Set(store.listSources("full").map((manifest) => manifest.id));
    const selectedSources = action === "onboard" ? Array.from(new Set(sources)) : [source];
    for (const selectedSource of selectedSources) {
      if (!known.has(selectedSource)) return Response.json({ error: `Unknown search source: ${selectedSource}` }, { status: 404 });
    }

    const statuses = new Map(store.sourceStatus().map((status) => [status.source, status]));
    switch (action) {
      case "enable":
      case "resume":
        {
          const current = statuses.get(source);
          store.setSourceState(source, "enabled", { backlog: current?.backlog ?? 0, error: null });
        }
        break;
      case "onboard":
        for (const selectedSource of selectedSources) {
          const current = statuses.get(selectedSource);
          store.setSourceState(selectedSource, "enabled", { backlog: current?.backlog ?? 0, error: null });
          if (body.rebuild === true) enqueueRebuild(store, selectedSource, (current?.backlog ?? 0) + 1);
        }
        break;
      case "pause":
        {
          const current = statuses.get(source);
          store.setSourceState(source, "paused", { backlog: current?.backlog ?? 0, error: null });
        }
        break;
      case "exclude":
        store.setSourceState(source, "excluded", { backlog: 0, error: null });
        break;
      case "rebuild":
        {
          const current = statuses.get(source);
          enqueueRebuild(store, source, (current?.backlog ?? 0) + 1, current?.state ?? "enabled");
        }
        break;
    }
  } finally {
    store.close();
  }

  return Response.json(readSearchIndexSnapshot(profile));
}

function enqueueRebuild(store: SearchStore, source: string, backlog: number, state?: SearchSourceState): void {
  store.enqueueIndexJob({
    source,
    operation: "rebuild",
    shard: "default",
    priority: source.startsWith("sessions.") ? 20 : 10,
    payload: { requestedBy: "showcase.search-index" },
  });
  store.setSourceState(source, state ?? "enabled", {
    backlog,
    error: null,
  });
}

function openSearchStore(): SearchStore {
  const store = new SearchStore(resolveSearchDbPath());
  for (const manifest of createBuiltinSearchSourceManifests()) {
    store.registerSource(manifest);
  }
  return store;
}

function readSearchIndexSnapshot(profile: SearchProfileId): SearchIndexSnapshot {
  const store = openSearchStore();
  try {
    const manifests = store.listSources(profile);
    const statuses = new Map(store.sourceStatus().map((status) => [status.source, status]));
    const jobs = store.listIndexJobs({ limit: 50 });
    return buildSnapshot(profile, manifests, statuses, jobs);
  } finally {
    store.close();
  }
}

function buildSnapshot(
  profile: SearchProfileId,
  manifests: SearchSourceManifest[],
  statuses: Map<string, SearchSourceStatus>,
  jobs: SearchIndexJob[],
): SearchIndexSnapshot {
  const sources = manifests.map((manifest) => sourceView(manifest, statuses.get(manifest.id)));
  const queuedJobs = jobs.filter((job) => job.status === "queued" || job.status === "leased").length;
  return {
    profile,
    storage: { index: "search.sqlite", indexRebuildable: true },
    summary: {
      sources: sources.length,
      enabled: sources.filter((source) => source.state === "enabled" || source.state === "backfilling").length,
      queuedJobs,
      externalPending: sources.filter((source) => source.externalPending).length,
    },
    onboarding: onboardingView(sources, jobs),
    sources,
    jobs,
  };
}

function sourceView(manifest: SearchSourceManifest, status?: SearchSourceStatus): SearchIndexSourceView {
  const setup = SOURCE_SETUP[manifest.id] ?? { kind: "ready" as const, label: "Ready" };
  return {
    id: manifest.id,
    name: manifest.name,
    domain: manifest.domain,
    profile: manifest.profile,
    state: status?.state ?? (manifest.indexing.defaultState === "on" ? "enabled" : "disabled"),
    defaultState: manifest.indexing.defaultState,
    fastPath: manifest.capabilities.fastPath,
    semantic: manifest.capabilities.semantic,
    contentDepth: manifest.indexing.contentDepth,
    freshness: manifest.indexing.freshness,
    resultTypes: manifest.resultTypes,
    facets: manifest.facets?.map((facet) => facet.id) ?? [],
    permissionDefault: manifest.permissions.default,
    setupKind: setup.kind,
    setupLabel: setup.label,
    setupReady: setup.kind === "ready",
    backlog: status?.backlog ?? 0,
    ...(status?.lastIndexedAt ? { lastIndexedAt: status.lastIndexedAt } : {}),
    ...(status?.error ? { error: status.error } : {}),
    externalPending: setup.kind === "signed_host",
  };
}

function onboardingView(sources: SearchIndexSourceView[], jobs: SearchIndexJob[]): SearchIndexOnboarding {
  const candidates = sources.filter((source) => source.state !== "enabled" && source.state !== "backfilling");
  const ready = candidates.filter((source) => source.setupReady);
  const setupRequired = candidates.filter((source) => !source.setupReady && !source.externalPending);
  const externalPending = candidates.filter((source) => source.externalPending);
  return {
    firstRun: !sources.some((source) => source.lastIndexedAt) && !jobs.some((job) => job.status === "done"),
    defaultSelectedSourceIds: ready.map((source) => source.id),
    readySourceIds: ready.map((source) => source.id),
    setupRequiredSourceIds: setupRequired.map((source) => source.id),
    externalPendingSourceIds: externalPending.map((source) => source.id),
  };
}

function createE2ESnapshot(profile: SearchProfileId): SearchIndexSnapshot {
  const manifests = createBuiltinSearchSourceManifests().filter((manifest) => profile === "full" || manifest.profile === "framework");
  const statuses = new Map<string, SearchSourceStatus>();
  for (const manifest of manifests) {
    statuses.set(manifest.id, {
      source: manifest.id,
      domain: manifest.domain,
      state: manifest.indexing.defaultState === "on" ? "enabled" : "disabled",
      backlog: manifest.profile === "full" ? 0 : manifest.id === "sessions.chats" ? 1 : 0,
      ...(manifest.profile === "framework" ? { lastIndexedAt: "2026-05-17T10:00:00.000Z" } : {}),
    });
  }
  const jobs: SearchIndexJob[] = [
    {
      id: "e2e:sessions.chats:default:rebuild",
      source: "sessions.chats",
      shard: "default",
      operation: "rebuild",
      payload: {},
      status: "queued",
      attempts: 0,
      priority: 20,
      scheduledAt: "2026-05-17T10:00:00.000Z",
      createdAt: "2026-05-17T10:00:00.000Z",
      updatedAt: "2026-05-17T10:00:00.000Z",
    },
  ];
  return buildSnapshot(profile, manifests, statuses, jobs);
}

function resolveSearchDbPath(): string {
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  if (process.env.CLAW_DATA_DIR) return path.join(path.resolve(process.env.CLAW_DATA_DIR), "search.sqlite");
  if (process.env.CLAW_HOME) return path.join(path.resolve(process.env.CLAW_HOME), "data", "search.sqlite");
  return path.join(os.homedir(), ".claw", "data", "search.sqlite");
}

function readProfile(value: string | null | undefined): SearchProfileId {
  return value === "full" ? "full" : "framework";
}

function isSearchIndexAction(value: unknown): value is SearchIndexAction {
  return value === "enable" || value === "pause" || value === "exclude" || value === "resume" || value === "rebuild" || value === "onboard";
}
