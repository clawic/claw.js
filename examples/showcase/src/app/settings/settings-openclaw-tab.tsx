"use client";

import { AlertCircle, Check, Download, FolderOpen, RefreshCw, RotateCcw, Swords, Trash2 } from "lucide-react";

export function SettingsOpenClawTab(props: any) {
  const {
    toolStatus,
    openClawEnabled,
    setOpenClawEnabled,
    openClawRefreshing,
    setOpenClawRefreshing,
    openClawRestarting,
    setOpenClawRestarting,
    openClawReinstalling,
    setOpenClawReinstalling,
    openClawUninstalling,
    setOpenClawUninstalling,
    showOpenClawUninstallModal,
    setShowOpenClawUninstallModal,
    showOpenClawUpdateModal,
    setShowOpenClawUpdateModal,
    showOpenClawDisableModal,
    setShowOpenClawDisableModal,
    openClawDisabling,
    setOpenClawDisabling,
    openClawCopied,
    setOpenClawCopied,
    adapterBusy,
    setAdapterBusy,
    adapterProgress,
    setAdapterProgress,
    bootstrapData,
    updateBootstrapData,
    refreshToolStatus,
    flashSaved,
    setError,
    messages,
  } = props;


  const oc = toolStatus?.openClaw;
  const isReady = !!oc?.ready;
  const ocEnabled = openClawEnabled !== false;
  const anyBusy = openClawRefreshing || openClawRestarting || openClawReinstalling || openClawUninstalling;
  const adapterList = toolStatus?.adapters ?? [];
  const adapterMessages = messages.settings.adapters;
  const activeAdapterId = bootstrapData?.localSettings?.activeAdapter || "openclaw";
  return (
  <div className="space-y-3">
    <p className="text-xs text-muted-foreground mb-4">
      {adapterMessages.intro}
    </p>

    {/* ── Unified adapters list (radio selection) ── */}
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {adapterList.map((adapter: any, i: number) => {
        const adapterKey = adapter.id as keyof typeof adapterMessages;
        const meta = (adapterMessages[adapterKey] ?? { name: adapter.runtimeName, hint: "" }) as { name: string; hint: string };
        const isOpenClaw = adapter.id === "openclaw";
        const isClaw = adapter.id === "claw";
        const isCodex = adapter.id === "codex";
        const isInstalled = isOpenClaw ? !!oc?.cliAvailable : adapter.cliAvailable;
        const isSelected = activeAdapterId === adapter.id;
        const isBusy = !!adapterBusy[adapter.id];
        const statusLabel = adapter.recommended ? adapterMessages.recommended : adapterMessages.experimental;
        return (
          <div key={adapter.id} className={i < adapterList.length - 1 ? "border-b border-border" : ""}>
            {/* ── Row: click to select ── */}
            <div
              data-testid={`adapter-${adapter.id}-card`}
              className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
                !isBusy ? "cursor-pointer hover:bg-accent" : ""
              } ${isSelected ? "bg-accent" : ""}`}
              onClick={isBusy ? undefined : async () => {
                if (isSelected) return;
                // Select this adapter
                await fetch("/api/config/local", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ activeAdapter: adapter.id }),
                });
                updateBootstrapData((current: any) => ({
                  ...current,
                  localSettings: { ...current.localSettings, activeAdapter: adapter.id },
                }));
                // If not installed, install runtimes with managed installers. Codex stays explicit because login/install is owned by the Codex CLI.
                if (!isInstalled && !isCodex) {
                  setAdapterBusy((prev: any) => ({ ...prev, [adapter.id]: "installing" }));
                  setAdapterProgress((prev: any) => ({ ...prev, [adapter.id]: { message: adapterMessages.installing, percent: 0 } }));
                  try {
                    const res = await fetch("/api/integrations/install-stream", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ adapter: adapter.id, operation: "install" }),
                    });
                    if (res.body) {
                      const reader = res.body.getReader();
                      const decoder = new TextDecoder();
                      let buf = "";
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split("\n\n");
                        buf = lines.pop() ?? "";
                        for (const line of lines) {
                          const dataLine = line.replace(/^data: /, "").trim();
                          if (!dataLine) continue;
                          try {
                            const ev = JSON.parse(dataLine);
                            setAdapterProgress((prev: any) => ({ ...prev, [adapter.id]: { message: ev.message || "", percent: ev.percent || 0 } }));
                          } catch { /* ignore */ }
                        }
                      }
                    }
                  } finally {
                    setAdapterBusy((prev: any) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                    setAdapterProgress((prev: any) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                  }
                }
                await refreshToolStatus();
                flashSaved();
              }}
            >
              {/* Icon */}
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                  isSelected ? "bg-muted text-muted-foreground" : "bg-muted text-tertiary-foreground"
                }`}>
                  {isOpenClaw
                    ? <svg width="17" height="17" viewBox="0 0 120 120" fill="currentColor"><path d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"/><path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z"/><path d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"/><path d="M45 15Q35 5 30 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M75 15Q85 5 90 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><circle cx="45" cy="35" r="6" fill="currentColor" opacity="0.3"/><circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.3"/></svg>
                    : isClaw
                      ? <Swords className="w-[17px] h-[17px]" strokeWidth={2} />
                    : isCodex
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0z"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4 12h4"/><path d="M16 12h4"/></svg>
                    : <img src={`/runtimes/${adapter.id}.png`} alt={meta.name} width={17} height={17} className="rounded-sm grayscale" />
                  }
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  isBusy ? "bg-sky-500" : isSelected ? "bg-emerald-400" : isInstalled ? "bg-muted-foreground" : "bg-muted"
                }`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[13px] font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>{meta.name}</span>
                  {isSelected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[10px] font-medium text-muted-foreground">
                      {messages.settings.openclaw.statusActive || "Active"}
                    </span>
                  )}
                  {!isSelected && isInstalled && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {adapterMessages.installed}
                    </span>
                  )}
                  {!isInstalled && !isBusy && (
                    <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{meta.hint}</p>
              </div>

              {/* Spinner when busy */}
              {isBusy && (
                <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}

              {/* Radio indicator */}
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                  isSelected ? "border-foreground" : "border-muted"
                }`}>
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-foreground" />}
                </div>
              </div>
            </div>

            {/* ── Progress bar during install/uninstall ── */}
            {adapterBusy[adapter.id] && adapterProgress[adapter.id] && (
              <div className="px-4 py-3 border-t border-border bg-accent">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-muted-foreground">{adapterProgress[adapter.id]!.message}</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(5, adapterProgress[adapter.id]!.percent)}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── OpenClaw inline expanded details ── */}
            {isOpenClaw && isSelected && ocEnabled && (
              <>
                {/* Status chips */}
                <div className="flex flex-wrap gap-1.5 px-4 py-3.5 border-t border-border">
            {[
              { ok: !!oc?.cliAvailable, label: messages.settings.openclaw.cli },
              { ok: !!oc?.agentConfigured, label: messages.settings.openclaw.agent },
              { ok: !!oc?.modelConfigured, label: messages.settings.openclaw.model },
              { ok: !!oc?.authConfigured, label: messages.settings.openclaw.auth },
            ].map((item: any) => (
              <span
                key={item.label}
                data-testid={`openclaw-status-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                data-state={item.ok ? "ready" : "pending"}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                  item.ok
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                {item.ok ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                )}
                {item.label}
              </span>
            ))}
          </div>

          {/* Error if any */}
          {oc?.lastError && (
            <div className="px-4 py-3 border-b border-border bg-amber-50/30 dark:bg-amber-950/30 flex items-start gap-2">
              <AlertCircle size={13} className="text-amber-500 mt-px flex-shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{oc.lastError}</p>
            </div>
          )}

          {/* Metadata */}
          {(oc?.context || oc?.version || oc?.defaultModel) && (
            <div className="border-b border-border">
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{messages.settings.openclaw.details}</span>
              </div>
              {[
                ...(oc?.version ? [{ label: messages.settings.openclaw.version, value: oc.version, copyable: false, mono: false, versionStatus: oc.latestVersion && oc.version !== oc.latestVersion ? "update" as const : oc.latestVersion ? "current" as const : null }] : []),
                ...(oc?.defaultModel ? [{ label: messages.settings.openclaw.defaultModelLabel, value: oc.defaultModel, copyable: false, mono: true }] : []),
                ...(oc?.context ? [
                  { label: messages.settings.openclaw.agentId, value: oc.context.agentName ? `${oc.context.agentName} (${oc.context.agentId})` : oc.context.agentId, copyable: false, mono: true },
                  { label: messages.settings.openclaw.workspace, value: oc.context.workspaceDir, copyable: true, mono: true },
                  { label: messages.settings.openclaw.stateDir, value: oc.context.stateDir, copyable: true, mono: true },
                ] : []),
              ].map((meta: any) => (
                <div
                  key={meta.label}
                  className={`px-4 py-2 flex items-baseline gap-3 ${meta.copyable ? "cursor-pointer hover:bg-background transition-colors" : ""}`}
                  onClick={meta.copyable ? () => {
                    navigator.clipboard.writeText(meta.value);
                    setOpenClawCopied(meta.label);
                    setTimeout(() => setOpenClawCopied(null), 1500);
                  } : undefined}
                >
                  <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{meta.label}</span>
                  {openClawCopied === meta.label ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{messages.settings.openclaw.copied}</span>
                  ) : (
                    <span className={`text-[11px] text-foreground truncate flex-1 ${meta.mono ? "font-mono" : ""} flex items-center gap-2`}>
                      {meta.value}
                      {"versionStatus" in meta && meta.versionStatus === "current" && (
                        <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-full">{messages.settings.openclaw.upToDate}</span>
                      )}
                      {"versionStatus" in meta && meta.versionStatus === "update" && (
                        <button
                          onClick={() => setShowOpenClawUpdateModal(true)}
                          className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors flex items-center gap-1.5"
                        >
                          <Download size={11} />
                          {messages.settings.openclaw.updateAvailable} ({oc?.latestVersion})
                        </button>
                      )}
                    </span>
                  )}
                </div>
              ))}
              <div className="h-1.5" />
            </div>
          )}

          {/* Actions row 1 */}
          <div className="flex gap-2 px-4 pt-3.5 pb-2">
            <button
              disabled={anyBusy}
              onClick={async () => {
                setOpenClawRefreshing(true);
                try {
                  await refreshToolStatus();
                  flashSaved();
                } finally {
                  setOpenClawRefreshing(false);
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={`text-tertiary-foreground ${openClawRefreshing ? "animate-spin" : ""}`} />
              {openClawRefreshing ? messages.settings.openclaw.refreshing : messages.settings.openclaw.refresh}
            </button>
            <button
              disabled={anyBusy}
              onClick={async () => {
                setOpenClawRestarting(true);
                try {
                  await fetch("/api/integrations/setup", { method: "POST" });
                  await refreshToolStatus();
                  flashSaved();
                } finally {
                  setOpenClawRestarting(false);
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
            >
              <RotateCcw size={13} className={`text-tertiary-foreground ${openClawRestarting ? "animate-spin" : ""}`} />
              {openClawRestarting ? messages.settings.openclaw.restarting : messages.settings.openclaw.restart}
            </button>
          </div>

          {/* Actions row 2 */}
          <div className="flex gap-2 px-4 pb-3.5">
            <button
              disabled={!oc?.context?.workspaceDir}
              onClick={() => {
                if (oc?.context?.workspaceDir) {
                  fetch("/api/integrations/reveal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: oc.context.workspaceDir }),
                  });
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
            >
              <FolderOpen size={13} className="text-tertiary-foreground" />
              {messages.settings.openclaw.openWorkspace}
            </button>
            <button
              disabled={anyBusy}
              onClick={() => setShowOpenClawUninstallModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800 rounded-xl text-[12px] font-medium text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              {openClawUninstalling ? messages.settings.openclaw.uninstalling : messages.settings.openclaw.uninstall}
            </button>
          </div>
              </>
            )}

            {/* ── Codex inline expanded details ── */}
            {isCodex && isSelected && (
              <>
                <div className="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border">
                  {[
                    { key: "cli", ok: adapter.cliAvailable, label: "CLI" },
                    { key: "auth", ok: adapter.capabilities.some((item: any) => item.key === "auth" && item.status === "ready"), label: "Login" },
                    { key: "app-server", ok: adapter.capabilities.some((item: any) => item.key === "session_gateway" && item.status === "ready"), label: "App Server" },
                    { key: "model", ok: adapter.capabilities.some((item: any) => item.key === "models" && item.status === "ready"), label: "Model" },
                  ].map((item: any) => (
                    <span
                      key={item.key}
                      data-testid={`adapter-codex-status-${item.key}`}
                      data-state={item.ok ? "ready" : "pending"}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                        item.ok
                          ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                          : "bg-card text-muted-foreground border border-border"
                      }`}
                    >
                      {item.ok ? <Check size={12} strokeWidth={2.5} /> : <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />}
                      {item.label}
                    </span>
                  ))}
                </div>
                <div className="border-t border-border">
                  {!isInstalled && (
                    <div className="px-4 py-3" data-testid="adapter-codex-install-command">
                      <span className="text-[11px] text-muted-foreground block mb-1.5">Install</span>
                      <code className="block text-[11px] text-foreground bg-background border border-border rounded-lg px-2.5 py-2 overflow-x-auto">npm i -g @openai/codex</code>
                    </div>
                  )}
                  {isInstalled && adapter.capabilities.some((item: any) => item.key === "auth" && item.status !== "ready") && (
                    <div className="px-4 py-3" data-testid="adapter-codex-login-command">
                      <span className="text-[11px] text-muted-foreground block mb-1.5">Login</span>
                      <code className="block text-[11px] text-foreground bg-background border border-border rounded-lg px-2.5 py-2 overflow-x-auto">codex login</code>
                    </div>
                  )}
                  {adapter.version && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.versionLabel}</span>
                      <span className="text-[11px] text-foreground font-mono">{adapter.version}</span>
                    </div>
                  )}
                  {adapter.conversation && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">Transport</span>
                      <span data-testid="adapter-codex-session-transport" className="text-[11px] text-foreground font-mono">
                        {adapter.conversation.transport}
                        {adapter.conversation.fallbackTransport ? ` -> ${adapter.conversation.fallbackTransport}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Non-OpenClaw inline expanded details ── */}
            {!isOpenClaw && !isCodex && isSelected && isInstalled && (
              <>
                {/* Capability chips */}
                <div className="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border">
                  {adapter.capabilities.map((item: any) => {
                    const label = item.key
                      .replace(/^conversation_/, "")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (char: string) => char.toUpperCase());
                    const classes = item.status === "ready"
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                      : item.status === "degraded"
                        ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                        : "bg-card border border-border text-muted-foreground";
                    const dotClass = item.status === "ready"
                      ? "bg-emerald-400"
                      : item.status === "degraded"
                        ? "bg-amber-400"
                        : "bg-muted-foreground";
                    return (
                    <span
                      key={item.key}
                      data-testid={`adapter-${adapter.id}-capability-${item.key}`}
                      data-state={item.status}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${classes}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                      {label}
                    </span>
                  )})}
                </div>

                {/* Metadata rows */}
                <div className="border-t border-border">
                  {adapter.version && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.versionLabel}</span>
                      <span className="text-[11px] text-foreground font-mono">{adapter.version}</span>
                    </div>
                  )}
                  {adapter.providers.length > 0 && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.capProviders}</span>
                      <span className="text-[11px] text-foreground">{adapter.providers.map((p: any) => p.label).join(", ")}</span>
                    </div>
                  )}
                  {adapter.channels.length > 0 && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.capChannels}</span>
                      <span className="text-[11px] text-foreground">{adapter.channels.map((c: any) => c.label).join(", ")}</span>
                    </div>
                  )}
                  {adapter.workspaceFiles.length > 0 && (
                    <div className="px-4 py-2 flex items-baseline gap-3">
                      <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.workspaceFiles}</span>
                      <span className="text-[11px] text-foreground font-mono">{adapter.workspaceFiles.join(", ")}</span>
                    </div>
                  )}
                  {adapter.conversation && (
                    <>
                      <div className="px-4 py-2 flex items-baseline gap-3">
                        <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">Transport</span>
                        <span data-testid={`adapter-${adapter.id}-session-transport`} className="text-[11px] text-foreground font-mono">
                          {adapter.conversation.transport}
                          {adapter.conversation.fallbackTransport ? ` -> ${adapter.conversation.fallbackTransport}` : ""}
                        </span>
                      </div>
                      {adapter.conversation.sessionPersistence && (
                        <div className="px-4 py-2 flex items-baseline gap-3">
                          <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">Sessions</span>
                          <span className="text-[11px] text-foreground font-mono">{adapter.conversation.sessionPersistence}</span>
                        </div>
                      )}
                    </>
                  )}
                  {adapter.limitations.length > 0 && (
                    <div className="px-4 py-2" data-testid={`adapter-${adapter.id}-limitations`}>
                      <span className="text-[11px] text-muted-foreground block mb-1.5">Limitations</span>
                      <div className="space-y-1">
                        {adapter.limitations.map((limitation: string) => (
                          <p key={limitation} className="text-[11px] text-muted-foreground leading-relaxed">{limitation}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="h-1" />
                </div>

                {/* Actions */}
                <div className="flex gap-2 px-4 py-3 border-t border-border">
                  <button
                    onClick={async () => {
                      setAdapterBusy((prev: any) => ({ ...prev, [adapter.id]: "installing" }));
                      try { await refreshToolStatus(); flashSaved(); } finally {
                        setAdapterBusy((prev: any) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors"
                  >
                    <RefreshCw size={13} className="text-tertiary-foreground" />
                    {messages.settings.openclaw.refresh}
                  </button>
                  <button
                    disabled={!!adapterBusy[adapter.id]}
                    onClick={async () => {
                      setAdapterBusy((prev: any) => ({ ...prev, [adapter.id]: "uninstalling" }));
                      setAdapterProgress((prev: any) => ({ ...prev, [adapter.id]: { message: adapterMessages.uninstalling, percent: 0 } }));
                      try {
                        const res = await fetch("/api/integrations/install-stream", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ adapter: adapter.id, operation: "uninstall" }),
                        });
                        if (res.body) {
                          const reader = res.body.getReader();
                          const decoder = new TextDecoder();
                          let buf = "";
                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split("\n\n");
                            buf = lines.pop() ?? "";
                            for (const line of lines) {
                              const dataLine = line.replace(/^data: /, "").trim();
                              if (!dataLine) continue;
                              try {
                                const ev = JSON.parse(dataLine);
                                setAdapterProgress((prev: any) => ({ ...prev, [adapter.id]: { message: ev.message || "", percent: ev.percent || 0 } }));
                              } catch { /* ignore */ }
                            }
                          }
                        }
                        await refreshToolStatus();
                        flashSaved();
                      } finally {
                        setAdapterBusy((prev: any) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                        setAdapterProgress((prev: any) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800 rounded-xl text-[12px] font-medium text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    {messages.settings.openclaw.uninstall}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>

    {/* Uninstall confirmation modal */}
    {/* Update confirmation modal */}
    {showOpenClawUpdateModal && (
      <>
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowOpenClawUpdateModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.updateTitle}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
              {messages.settings.openclaw.updateDescription
                .replace("{current}", oc?.version || "?")
                .replace("{latest}", oc?.latestVersion || "?")}
            </p>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowOpenClawUpdateModal(false)}
                disabled={openClawReinstalling}
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                {messages.settings.openclaw.updateCancel}
              </button>
              <button
                disabled={openClawReinstalling}
                onClick={async () => {
                  setOpenClawReinstalling(true);
                  try {
                    await fetch("/api/integrations/install", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ adapter: "openclaw" }),
                    });
                    await fetch("/api/integrations/setup", { method: "POST" });
                    await refreshToolStatus();
                    setShowOpenClawUpdateModal(false);
                    flashSaved();
                  } finally {
                    setOpenClawReinstalling(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-50"
              >
                {openClawReinstalling ? messages.settings.openclaw.reinstalling : messages.settings.openclaw.updateConfirm}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {showOpenClawUninstallModal && (
      <>
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowOpenClawUninstallModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.uninstallTitle}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">{messages.settings.openclaw.uninstallWarning}</p>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowOpenClawUninstallModal(false)}
                disabled={openClawUninstalling}
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                {messages.settings.openclaw.uninstallCancel}
              </button>
              <button
                disabled={openClawUninstalling}
                onClick={async () => {
                  setOpenClawUninstalling(true);
                  try {
                    const res = await fetch("/api/integrations/uninstall", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ adapter: "openclaw" }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      setError(data.error || "Failed to uninstall OpenClaw");
                      setShowOpenClawUninstallModal(false);
                      return;
                    }
                    await refreshToolStatus();
                    setShowOpenClawUninstallModal(false);
                    flashSaved();
                  } catch {
                    setError("Failed to uninstall OpenClaw");
                    setShowOpenClawUninstallModal(false);
                  } finally {
                    setOpenClawUninstalling(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-sm text-primary-foreground hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {openClawUninstalling ? messages.settings.openclaw.uninstalling : messages.settings.openclaw.uninstallConfirm}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {showOpenClawDisableModal && (
      <>
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => !openClawDisabling && setShowOpenClawDisableModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.disableTitle}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">{messages.settings.openclaw.disableWarning}</p>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowOpenClawDisableModal(false)}
                disabled={openClawDisabling}
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                {messages.settings.openclaw.disableCancel}
              </button>
              <button
                disabled={openClawDisabling}
                onClick={async () => {
                  setOpenClawDisabling(true);
                  try {
                    await fetch("/api/integrations/gateway", { method: "DELETE" });
                    setOpenClawEnabled(false);
                    updateBootstrapData((current: any) => ({
                      ...current,
                      localSettings: { ...current.localSettings, openClawEnabled: false },
                    }));
                    await fetch("/api/config/local", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ openClawEnabled: false }),
                    });
                    await refreshToolStatus();
                    setShowOpenClawDisableModal(false);
                    flashSaved();
                  } finally {
                    setOpenClawDisabling(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-sm text-primary-foreground hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {messages.settings.openclaw.disableConfirm}
              </button>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
  );

}
