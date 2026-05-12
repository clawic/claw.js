"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Play, RefreshCw, Save, Search, Trash2, Unplug } from "lucide-react";

type ConnectorKind = "action" | "source" | "all";

interface CatalogSummary {
  apps: number;
  versionedApps: number;
  actions: number;
  sources: number;
  fields: number;
  authFields: number;
  managedFields: number;
  defaults: number;
  options: number;
  hiddenFields: number;
  disabledFields: number;
  reloadFields: number;
  boundedFields: number;
  placeholderFields: number;
  queryFields: number;
  labelFields: number;
  alertFields: number;
  readAccessFields: number;
  writeAccessFields: number;
  syncedFields: number;
  customResponseFields: number;
  propDefinitionFields: number;
  contextualPropFields: number;
  annotatedOperations: number;
  destructiveOperations: number;
  readOnlyOperations: number;
  openWorldOperations: number;
  runnableOperations: number;
  hookSources: number;
  dedupedSources: number;
  pollingSources: number;
  webhookSources: number;
  hybridSources: number;
  statefulSources: number;
  sampleEventSources: number;
  eventSummarySources: number;
  eventSummaryTemplates: number;
  dynamicPropOperations: number;
  dynamicPropFields: number;
  dynamicOptionFields: number;
  methodOperations: number;
}

interface CatalogField {
  name: string;
  type: string;
  label?: string;
  description?: string;
  alertType?: string;
  content?: string;
  optional: boolean;
  default?: unknown;
  options?: Array<{ label?: string; value: string | number | boolean; description?: string }>;
  propDefinition?: {
    fieldName: string;
    contextKeys: string[];
    dependsOn: string[];
  };
  dynamicOptions?: {
    paginated: boolean;
    usesPreviousContext: boolean;
    contextKeys: string[];
  };
  hidden?: boolean;
  disabled?: boolean;
  reloadProps?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  useQuery?: boolean;
  withLabel?: boolean;
  accessMode?: "read" | "write";
  sync?: boolean;
  customResponse?: boolean;
  secret?: boolean;
  managed?: boolean;
}

interface CatalogOperation {
  id: string;
  appId: string;
  kind: "action" | "source";
  name: string;
  description?: string;
  fields: CatalogField[];
  authFieldNames: string[];
  annotations?: {
    destructiveHint?: boolean;
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
  };
  runtime?: {
    hasRun: boolean;
    hasHooks: boolean;
    hookNames?: string[];
    hasAdditionalProps: boolean;
    additionalProps?: {
      mode: "object" | "function";
      fieldNames: string[];
      contextKeys: string[];
      usesPreviousProps: boolean;
      usesThis: boolean;
    };
    hasMethods: boolean;
    methodNames?: string[];
    dedupe?: string;
  };
  source?: {
    delivery: "polling" | "webhook" | "hybrid" | "manual";
    usesTimer: boolean;
    usesHttp: boolean;
    usesServiceDb: boolean;
  };
  sampleEvent?: {
    shape: "object" | "array" | "string" | "unknown";
    keys: string[];
  };
  eventSummary?: {
    count: number;
    templates: string[];
    dynamic: boolean;
  };
}

interface CatalogEntry {
  app: { id: string; name: string; description?: string };
  operation: CatalogOperation;
}

interface CatalogResponse {
  configured: boolean;
  path: string;
  error?: string;
  summary: CatalogSummary;
  entries: CatalogEntry[];
}

interface SourceSubscription {
  id: string;
  status: "ready" | "blocked" | "disabled";
  operationId: string;
  appId: string;
  delivery: "polling" | "webhook" | "hybrid" | "manual";
  blockReasons: string[];
  missingFields: string[];
  missingSecrets: string[];
  updatedAt: string;
}

export default function ConnectorsPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ConnectorKind>("all");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [valuesJson, setValuesJson] = useState("{}");
  const [secretRefsJson, setSecretRefsJson] = useState("{}");
  const [preview, setPreview] = useState<unknown>(null);
  const [subscriptions, setSubscriptions] = useState<SourceSubscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (query.trim()) params.set("q", query.trim());
      if (kind !== "all") params.set("kind", kind);
      const res = await fetch(`/api/connectors/catalog?${params.toString()}`, { cache: "no-store" });
      const data = await res.json() as CatalogResponse;
      setCatalog(data);
      setSelected((current) => {
        if (current && data.entries.some((entry) => entry.operation.id === current.operation.id)) return current;
        return data.entries[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, [kind, query]);

  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/subscriptions", { cache: "no-store" });
      const data = await res.json() as { subscriptions?: SourceSubscription[] };
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadCatalog(); }, 200);
    return () => clearTimeout(timer);
  }, [loadCatalog]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const requiredFields = useMemo(() => (
    selected?.operation.fields.filter((field) => !field.optional && !field.secret && !field.managed) ?? []
  ), [selected]);

  const selectedSubscriptions = useMemo(() => (
    selected
      ? subscriptions.filter((subscription) => subscription.operationId === selected.operation.id)
      : []
  ), [selected, subscriptions]);

  useEffect(() => {
    if (!selected) {
      setValuesJson("{}");
      setSecretRefsJson("{}");
      setPreview(null);
      return;
    }
    setValuesJson(JSON.stringify(buildValuesTemplate(selected.operation), null, 2));
    setSecretRefsJson(JSON.stringify(buildSecretRefsTemplate(selected), null, 2));
    setPreview(null);
  }, [selected?.operation.id]);

  const dryRun = useCallback(async () => {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setPreview(null);
    try {
      const values = JSON.parse(valuesJson || "{}");
      const secretRefs = JSON.parse(secretRefsJson || "{}");
      const res = await fetch("/api/connectors/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: selected.operation.id, values, secretRefs }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Dry-run failed");
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRunning(false);
  }, [secretRefsJson, selected, valuesJson]);

  const saveSubscription = useCallback(async () => {
    if (!selected || selected.operation.kind !== "source") return;
    setSavingSubscription(true);
    setError(null);
    try {
      const values = JSON.parse(valuesJson || "{}");
      const secretRefs = JSON.parse(secretRefsJson || "{}");
      const res = await fetch("/api/connectors/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: selected.operation.id, values, secretRefs, enabled: true }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Subscription save failed");
      setSubscriptions(data.subscriptions ?? []);
      setPreview(data.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSavingSubscription(false);
  }, [secretRefsJson, selected, valuesJson]);

  const setSubscriptionEnabled = useCallback(async (subscription: SourceSubscription, enabled: boolean) => {
    setUpdatingSubscriptionId(subscription.id);
    setError(null);
    try {
      const res = await fetch("/api/connectors/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subscription.id, enabled }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Subscription update failed");
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setUpdatingSubscriptionId(null);
  }, []);

  const deleteSubscription = useCallback(async (subscription: SourceSubscription) => {
    setUpdatingSubscriptionId(subscription.id);
    setError(null);
    try {
      const res = await fetch("/api/connectors/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subscription.id }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Subscription delete failed");
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setUpdatingSubscriptionId(null);
  }, []);

  return (
    <div className="h-full overflow-y-auto" data-testid="connectors-page">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Unplug className="w-5 h-5 text-muted-foreground" />
              Connectors
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Browse local connector operations and prepare safe dry-runs.</p>
          </div>
          <button onClick={loadCatalog} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Refresh connectors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>

        {error ? (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        ) : null}

        <div className="mb-5 bg-card border border-border rounded-xl p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                data-testid="connectors-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps and operations..."
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
              />
            </div>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as ConnectorKind)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
            >
              <option value="all">All</option>
              <option value="action">Actions</option>
              <option value="source">Sources</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{catalog?.summary.apps ?? 0} apps</span>
            <span>{catalog?.summary.actions ?? 0} actions</span>
            <span>{catalog?.summary.sources ?? 0} sources</span>
            <span>{catalog?.summary.fields ?? 0} fields</span>
            <span>{catalog?.summary.managedFields ?? 0} managed</span>
            <span>{catalog?.summary.defaults ?? 0} defaults</span>
            <span>{catalog?.summary.options ?? 0} option sets</span>
            <span>{catalog?.summary.hiddenFields ?? 0} hidden</span>
            <span>{catalog?.summary.disabledFields ?? 0} disabled</span>
            <span>{catalog?.summary.reloadFields ?? 0} reload</span>
            <span>{catalog?.summary.boundedFields ?? 0} bounded</span>
            <span>{catalog?.summary.placeholderFields ?? 0} placeholders</span>
            <span>{catalog?.summary.queryFields ?? 0} query</span>
            <span>{catalog?.summary.labelFields ?? 0} labels</span>
            <span>{catalog?.summary.alertFields ?? 0} alerts</span>
            <span>{catalog?.summary.readAccessFields ?? 0} read access</span>
            <span>{catalog?.summary.writeAccessFields ?? 0} write access</span>
            <span>{catalog?.summary.syncedFields ?? 0} synced</span>
            <span>{catalog?.summary.customResponseFields ?? 0} custom responses</span>
            <span>{catalog?.summary.propDefinitionFields ?? 0} prop defs</span>
            <span>{catalog?.summary.contextualPropFields ?? 0} contextual</span>
            <span>{catalog?.summary.annotatedOperations ?? 0} annotated</span>
            <span>{catalog?.summary.destructiveOperations ?? 0} destructive</span>
            <span>{catalog?.summary.runnableOperations ?? 0} runnable</span>
            <span>{catalog?.summary.hookSources ?? 0} hooks</span>
            <span>{catalog?.summary.pollingSources ?? 0} polling</span>
            <span>{catalog?.summary.webhookSources ?? 0} webhooks</span>
            <span>{catalog?.summary.statefulSources ?? 0} stateful</span>
            <span>{catalog?.summary.sampleEventSources ?? 0} samples</span>
            <span>{catalog?.summary.eventSummarySources ?? 0} summaries</span>
            <span>{catalog?.summary.dynamicPropOperations ?? 0} dynamic props</span>
            <span>{catalog?.summary.dynamicPropFields ?? 0} dynamic fields</span>
            <span>{catalog?.summary.dynamicOptionFields ?? 0} dynamic options</span>
          </div>
          {catalog && !catalog.configured ? (
            <p className="text-[11px] text-muted-foreground mt-2 font-mono">Catalog not found at {catalog.path}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border min-h-[320px]">
            {loading && !catalog ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 text-muted-foreground mx-auto animate-spin" /></div>
            ) : catalog?.entries.length ? (
              catalog.entries.map((entry) => {
                const active = selected?.operation.id === entry.operation.id;
                return (
                  <button
                    key={entry.operation.id}
                    type="button"
                    data-testid="connector-operation"
                    onClick={() => {
                      setSelected(entry);
                      setPreview(null);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors ${active ? "bg-muted/70" : "hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground truncate">{entry.operation.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">{entry.operation.kind}</span>
                      {entry.operation.annotations?.readOnlyHint ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">read</span>
                      ) : null}
                      {entry.operation.annotations?.destructiveHint ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-mono">destructive</span>
                      ) : null}
                      {entry.operation.runtime?.hasRun ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">run</span>
                      ) : null}
                      {entry.operation.runtime?.hasHooks ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">hooks</span>
                      ) : null}
                      {entry.operation.source ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">{entry.operation.source.delivery}</span>
                      ) : null}
                      {entry.operation.sampleEvent ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">sample</span>
                      ) : null}
                      {entry.operation.eventSummary ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">summary</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.app.name}</div>
                    {entry.operation.description ? (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{entry.operation.description}</p>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center">
                <Unplug className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">No connector operations</p>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4 h-fit">
            {selected ? (
              <>
                <div className="mb-3">
                  <div className="text-[13px] font-medium text-foreground">{selected.operation.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{selected.app.name}</div>
                  {selected.operation.annotations ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span>readOnly={String(selected.operation.annotations.readOnlyHint ?? false)}</span>
                      <span>destructive={String(selected.operation.annotations.destructiveHint ?? false)}</span>
                      <span>openWorld={String(selected.operation.annotations.openWorldHint ?? false)}</span>
                    </div>
                  ) : null}
                  {selected.operation.runtime ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span>run={String(selected.operation.runtime.hasRun)}</span>
                      <span>hooks={selected.operation.runtime.hookNames?.length || String(selected.operation.runtime.hasHooks)}</span>
                      <span>dynamicProps={selected.operation.runtime.additionalProps?.fieldNames.length || String(selected.operation.runtime.hasAdditionalProps)}</span>
                      <span>methods={selected.operation.runtime.methodNames?.length || String(selected.operation.runtime.hasMethods)}</span>
                      {selected.operation.runtime.dedupe ? <span>dedupe={selected.operation.runtime.dedupe}</span> : null}
                    </div>
                  ) : null}
                  {selected.operation.source ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span>delivery={selected.operation.source.delivery}</span>
                      <span>timer={String(selected.operation.source.usesTimer)}</span>
                      <span>http={String(selected.operation.source.usesHttp)}</span>
                      <span>customResponse={String(selected.operation.fields.some((field) => field.customResponse))}</span>
                      <span>state={String(selected.operation.source.usesServiceDb)}</span>
                      {selected.operation.sampleEvent ? <span>sample={selected.operation.sampleEvent.shape}:{selected.operation.sampleEvent.keys.length}</span> : null}
                      {selected.operation.eventSummary ? <span>summary={selected.operation.eventSummary.count}:{selected.operation.eventSummary.templates.length}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className="mb-4">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Required fields</div>
                  {requiredFields.length ? (
                    <div className="space-y-1">
                      {requiredFields.map((field) => (
                        <div key={field.name} className="flex items-center justify-between text-[12px]">
                          <span className="text-foreground">{field.label ?? field.name}</span>
                          <span className="text-muted-foreground font-mono">
                            {field.type}{field.default === undefined ? "" : " = default"}{field.options?.length ? ` · ${field.options.length} opts` : ""}
                            {field.propDefinition ? ` · prop:${field.propDefinition.fieldName}` : ""}
                            {field.propDefinition?.dependsOn.length ? ` · depends:${field.propDefinition.dependsOn.join(",")}` : ""}
                            {field.dynamicOptions ? " · dynamic" : ""}
                            {field.reloadProps ? " · reload" : ""}
                            {field.hidden ? " · hidden" : ""}
                            {field.disabled ? " · disabled" : ""}
                            {field.min !== undefined || field.max !== undefined ? ` · ${field.min ?? ""}..${field.max ?? ""}` : ""}
                            {field.placeholder ? " · placeholder" : ""}
                            {field.useQuery ? " · query" : ""}
                            {field.withLabel ? " · label" : ""}
                            {field.alertType ? ` · ${field.alertType}` : field.content ? " · alert" : ""}
                            {field.accessMode ? ` · ${field.accessMode}` : ""}
                            {field.sync ? " · sync" : ""}
                            {field.customResponse ? " · custom response" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">None</p>
                  )}
                </div>
                <label className="block mb-3">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Values JSON</span>
                  <textarea
                    value={valuesJson}
                    onChange={(event) => setValuesJson(event.target.value)}
                    rows={9}
                    className="mt-1 w-full font-mono text-[12px] px-2 py-2 bg-background border border-border rounded-lg outline-none focus:border-muted-foreground"
                  />
                </label>
                <label className="block mb-4">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Secret refs JSON</span>
                  <textarea
                    value={secretRefsJson}
                    onChange={(event) => setSecretRefsJson(event.target.value)}
                    rows={4}
                    className="mt-1 w-full font-mono text-[12px] px-2 py-2 bg-background border border-border rounded-lg outline-none focus:border-muted-foreground"
                  />
                </label>
                <button
                  data-testid="connector-dry-run"
                  onClick={dryRun}
                  disabled={running}
                  className="w-full px-4 py-2 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                >
                  {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Dry-run
                </button>
                {selected.operation.kind === "source" ? (
                  <button
                    data-testid="connector-save-subscription"
                    onClick={saveSubscription}
                    disabled={savingSubscription}
                    className="mt-2 w-full px-4 py-2 bg-background border border-border text-[12px] font-medium rounded-lg hover:bg-muted disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {savingSubscription ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save subscription
                  </button>
                ) : null}
                {preview ? (
                  <pre className="mt-4 max-h-64 overflow-auto text-[11px] bg-background border border-border rounded-lg p-3 text-muted-foreground">{JSON.stringify(preview, null, 2)}</pre>
                ) : null}
                {selected.operation.kind === "source" ? (
                  <div className="mt-4">
                    <div className="text-[11px] font-medium text-muted-foreground mb-2">Source subscriptions</div>
                    {selectedSubscriptions.length ? (
                      <div className="space-y-2">
                        {selectedSubscriptions.map((subscription) => {
                          const busy = updatingSubscriptionId === subscription.id;
                          return (
                            <div key={subscription.id} className="bg-background border border-border rounded-lg p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[12px] font-mono text-foreground truncate">{subscription.id}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                    {subscription.status} · {subscription.delivery}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void setSubscriptionEnabled(subscription, subscription.status === "disabled")}
                                    className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
                                  >
                                    {subscription.status === "disabled" ? "Enable" : "Disable"}
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Delete subscription"
                                    disabled={busy}
                                    onClick={() => void deleteSubscription(subscription)}
                                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                                  >
                                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              {subscription.blockReasons.length ? (
                                <div className="text-[10px] text-muted-foreground mt-2 font-mono">
                                  {subscription.blockReasons.join(", ")}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">None</p>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">Select an operation to prepare a dry-run.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildValuesTemplate(operation: CatalogOperation): Record<string, unknown> {
  return Object.fromEntries(
    operation.fields
      .filter((field) => !field.secret && (!field.optional || field.default !== undefined || field.options?.length))
      .filter((field) => !field.managed)
      .map((field) => [field.name, sampleValue(field)]),
  );
}

function buildSecretRefsTemplate(entry: CatalogEntry): Record<string, string> {
  return Object.fromEntries(
    entry.operation.authFieldNames.map((fieldName) => [
      fieldName,
      `vault://connections/${entry.app.id}/${fieldName}`,
    ]),
  );
}

function sampleValue(field: CatalogField): unknown {
  if (field.default !== undefined) return field.default;
  if (field.options?.length) return field.options[0].value;
  if (field.type.includes("[]") || field.type === "string[]" || field.type === "integer[]") return [];
  if (field.type === "object") return {};
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return 0;
  return "";
}
