"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckSquare2,
  CirclePause,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Zap,
} from "lucide-react";

type SearchProfileId = "framework" | "full";
type SearchSourceState = "enabled" | "disabled" | "paused" | "excluded" | "backfilling" | "degraded" | "error";
type SearchIndexAction = "enable" | "pause" | "exclude" | "resume" | "rebuild" | "onboard";

interface SearchIndexSourceView {
  id: string;
  name: string;
  domain: string;
  profile: SearchProfileId;
  state: SearchSourceState;
  defaultState: "on" | "off";
  fastPath: boolean;
  semantic: "unsupported" | "optional" | "required";
  contentDepth: string;
  freshness: string;
  resultTypes: string[];
  facets: string[];
  permissionDefault: string;
  backlog: number;
  lastIndexedAt?: string;
  error?: string;
  externalPending: boolean;
}

interface SearchIndexJobView {
  id: string;
  source: string;
  shard: string;
  operation: string;
  status: string;
  priority: number;
  scheduledAt: string;
  updatedAt: string;
  error?: string;
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
  sources: SearchIndexSourceView[];
  jobs: SearchIndexJobView[];
}

const STATE_STYLES: Record<SearchSourceState, string> = {
  enabled: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  disabled: "bg-muted text-muted-foreground",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  excluded: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  backfilling: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  degraded: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  error: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export default function SearchIndexPage() {
  const [profile, setProfile] = useState<SearchProfileId>("framework");
  const [snapshot, setSnapshot] = useState<SearchIndexSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [rebuildOnboard, setRebuildOnboard] = useState(false);

  const load = useCallback(async (selectedProfile: SearchProfileId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search/index?profile=${selectedProfile}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load search index");
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load search index");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(profile);
  }, [load, profile]);

  useEffect(() => {
    if (!snapshot) return;
    setSelectedSources(snapshot.sources
      .filter((source) => source.state === "disabled" || source.state === "paused" || source.state === "excluded")
      .map((source) => source.id));
  }, [snapshot?.profile, snapshot?.sources]);

  const runAction = async (source: string, action: SearchIndexAction) => {
    const key = `${source}:${action}`;
    setBusyAction(key);
    setError(null);
    try {
      const res = await fetch("/api/search/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, action, profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update search source");
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update search source");
    } finally {
      setBusyAction(null);
    }
  };

  const runOnboarding = async () => {
    const sources = selectedSources.filter(Boolean);
    if (!sources.length) return;
    setBusyAction("onboard");
    setError(null);
    try {
      const res = await fetch("/api/search/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboard", sources, rebuild: rebuildOnboard, profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update search sources");
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update search sources");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSources((current) => current.includes(sourceId)
      ? current.filter((id) => id !== sourceId)
      : [...current, sourceId]);
  };

  const jobRows = useMemo(() => snapshot?.jobs.slice(0, 8) ?? [], [snapshot]);
  const onboardingSources = useMemo(() => snapshot?.sources.filter((source) => source.state !== "enabled" && source.state !== "backfilling") ?? [], [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6" data-testid="search-index-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Search className="h-6 w-6" />
          Search Index
        </h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted p-1" data-testid="search-index-profile-tabs">
            {(["framework", "full"] as SearchProfileId[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setProfile(item)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  profile === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`search-index-profile-${item}`}
              >
                {item === "framework" ? "Framework" : "Full"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load(profile)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={<SlidersHorizontal className="h-4 w-4" />} label="Sources" value={snapshot.summary.sources} />
            <Metric icon={<Zap className="h-4 w-4" />} label="Enabled" value={snapshot.summary.enabled} />
            <Metric icon={<RefreshCw className="h-4 w-4" />} label="Queued" value={snapshot.summary.queuedJobs} />
            <Metric icon={<Shield className="h-4 w-4" />} label="External pending" value={snapshot.summary.externalPending} />
          </div>

          <div className="rounded-lg border border-border bg-card" data-testid="search-source-onboarding">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckSquare2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Source Onboarding</h2>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{selectedSources.length} selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rebuildOnboard}
                    onChange={(event) => setRebuildOnboard(event.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                  Rebuild
                </label>
                <button
                  type="button"
                  onClick={runOnboarding}
                  disabled={!selectedSources.length || busyAction === "onboard"}
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="search-source-onboard-selected"
                >
                  {busyAction === "onboard" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Enable selected
                </button>
              </div>
            </div>
            {onboardingSources.length ? (
              <div className="divide-y divide-border overflow-x-auto">
                {onboardingSources.map((source) => (
                  <label key={source.id} className="grid min-w-[620px] cursor-pointer grid-cols-[24px_minmax(180px,1fr)_110px_110px_120px] items-center gap-3 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(source.id)}
                      onChange={() => toggleSource(source.id)}
                      className="h-4 w-4 accent-foreground"
                      data-testid={`search-source-onboard-${source.id}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{source.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{source.id}</span>
                    </span>
                    <span className={`w-fit rounded px-2 py-1 text-xs font-medium ${STATE_STYLES[source.state]}`}>{source.state}</span>
                    <span className="truncate text-muted-foreground">{source.profile}</span>
                    <span className="truncate text-muted-foreground">{source.externalPending ? "external pending" : source.freshness}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-muted-foreground">No pending sources</div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <div className="grid min-w-[1020px] grid-cols-[minmax(220px,1.5fr)_110px_110px_120px_120px_100px_150px] items-center gap-3 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Source</span>
              <span>State</span>
              <span>Domain</span>
              <span>Depth</span>
              <span>Types</span>
              <span>Backlog</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {snapshot.sources.map((source) => (
                <div
                  key={source.id}
                  className="grid min-w-[1020px] grid-cols-[minmax(220px,1.5fr)_110px_110px_120px_120px_100px_150px] items-center gap-3 px-4 py-3 text-sm"
                  data-testid={`search-index-source-${source.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">{source.name}</span>
                      {source.fastPath && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          fast
                        </span>
                      )}
                      {source.externalPending && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          pending
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{source.id}</div>
                  </div>
                  <span className={`w-fit rounded px-2 py-1 text-xs font-medium ${STATE_STYLES[source.state]}`}>{source.state}</span>
                  <span className="truncate text-muted-foreground">{source.domain}</span>
                  <span className="truncate text-muted-foreground">{source.contentDepth.replace("_", " ")}</span>
                  <span className="truncate text-muted-foreground" title={source.resultTypes.join(", ")}>
                    {source.resultTypes.slice(0, 2).join(", ")}
                    {source.resultTypes.length > 2 ? ` +${source.resultTypes.length - 2}` : ""}
                  </span>
                  <span className="font-mono text-sm text-foreground">{source.backlog}</span>
                  <div className="flex justify-end gap-1">
                    <IconAction
                      title={source.state === "paused" || source.state === "disabled" ? "Enable" : "Resume"}
                      busy={busyAction === `${source.id}:enable` || busyAction === `${source.id}:resume`}
                      onClick={() => runAction(source.id, source.state === "paused" || source.state === "disabled" ? "enable" : "resume")}
                    >
                      <Play className="h-4 w-4" />
                    </IconAction>
                    <IconAction title="Pause" busy={busyAction === `${source.id}:pause`} onClick={() => runAction(source.id, "pause")}>
                      <CirclePause className="h-4 w-4" />
                    </IconAction>
                    <IconAction title="Exclude" busy={busyAction === `${source.id}:exclude`} onClick={() => runAction(source.id, "exclude")}>
                      <Ban className="h-4 w-4" />
                    </IconAction>
                    <IconAction title="Rebuild" busy={busyAction === `${source.id}:rebuild`} onClick={() => runAction(source.id, "rebuild")}>
                      <RefreshCw className="h-4 w-4" />
                    </IconAction>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Index Jobs</h2>
            </div>
            {jobRows.length ? (
              <div className="divide-y divide-border">
                {jobRows.map((job) => (
                  <div key={job.id} className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_100px_90px_90px_160px] gap-3 px-4 py-3 text-sm">
                    <span className="truncate text-foreground">{job.source}</span>
                    <span className="text-muted-foreground">{job.operation}</span>
                    <span className="text-muted-foreground">{job.shard}</span>
                    <span className="text-muted-foreground">{job.status}</span>
                    <span className="truncate text-right text-muted-foreground">{formatCompactDate(job.updatedAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">No queued jobs</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function IconAction({ title, busy, onClick, children }: { title: string; busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function formatCompactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
