// @ts-nocheck
"use client";

import { IntegrationConfigModal, IntegrationRow, SelectInput, SettingField, Toggle } from "./settings-components";

export function SettingsToolsTab(props: any) {
  const {
    messages,
    config,
    updateConfig,
    imageBackends,
    transcriptionEnabled,
    transcriptionStatus,
    transcriptionWhisperReady,
    showTranscriptionConfigModal,
    setShowTranscriptionConfigModal,
    refreshToolStatus,
    selectedTtsProviderId,
    selectedTtsProvider,
    ttsProviderLabel,
    ttsProviderOptions,
    ttsConfigMissingApiKey,
    showTtsConfigModal,
    setShowTtsConfigModal,
    renderTtsField,
    showImageGenConfigModal,
    setShowImageGenConfigModal,
  } = props;

  const DEFAULT_PATHS = {
    transcription: "~/.claw/transcription.sqlite",
  };

  return (

  <div className="space-y-3">
    <p className="text-xs text-muted-foreground mb-4">
      {messages.settings.tools.intro}
    </p>

    {/* Audio section header */}
    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{messages.settings.tools.audioSection}</h3>

    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Transcription */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>}
        title={messages.settings.tools.transcription.title}
        description={messages.settings.tools.transcription.description}
        enabled={transcriptionEnabled}
        onToggle={(v) => {
          updateConfig((c) => ({
            ...c,
            dataSources: {
              ...c.dataSources,
              transcriptionDbPath: v ? DEFAULT_PATHS.transcription : "",
            },
          }));
          if (v && !transcriptionWhisperReady) {
            fetch("/api/integrations/setup", { method: "POST" })
              .then(() => refreshToolStatus())
              .catch(() => {});
          }
        }}
        status={transcriptionStatus}
        detail={transcriptionEnabled
          ? (config.transcription?.provider === "groq" ? "Groq"
            : config.transcription?.provider === "openai" ? "OpenAI"
            : messages.settings.tools.transcription.providerLocal)
          : undefined}
        onRowClick={() => setShowTranscriptionConfigModal(true)}
        isFirst
        testId="transcription-tool"
      />

      {/* Text to Speech */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
        title={messages.settings.tools.tts.title}
        description={messages.settings.tools.tts.description}
        enabled={config.tts?.enabled !== false}
        onToggle={(v) => updateConfig((c) => ({
          ...c,
          tts: { ...c.tts, provider: c.tts?.provider || "local", enabled: v },
        }))}
        status={config.tts?.enabled !== false ? "connected" : "disabled"}
        detail={config.tts?.enabled !== false
          ? ttsProviderLabel
          : undefined}
        onRowClick={config.tts?.enabled !== false ? () => setShowTtsConfigModal(true) : undefined}
        isLast
        testId="tts-tool"
      />
    </div>

    {/* ── Transcription config modal ── */}
    <IntegrationConfigModal
      open={showTranscriptionConfigModal}
      onClose={() => setShowTranscriptionConfigModal(false)}
      icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>}
      title={messages.settings.tools.transcription.title}
      statusLabel={transcriptionStatus === "connected" ? messages.settings.status.connected : undefined}
    >
      <SettingField label={messages.settings.tools.transcription.provider}>
        <SelectInput
          value={config.transcription?.provider || "local"}
          onChange={(v) => updateConfig((c) => ({
            ...c,
            transcription: {
              ...c.transcription,
              provider: v as "local" | "groq" | "openai",
            },
          }))}
          options={[
            { value: "local", label: messages.settings.tools.transcription.providerLocal },
            { value: "groq", label: messages.settings.tools.transcription.providerGroq },
            { value: "openai", label: messages.settings.tools.transcription.providerOpenai },
          ]}
        />
      </SettingField>
      {(config.transcription?.provider === "groq" || config.transcription?.provider === "openai") && (
        <SettingField label={messages.settings.tools.transcription.apiKey}>
          <input
            type="password"
            value={config.transcription?.apiKey || ""}
            onChange={(e) => updateConfig((c) => ({
              ...c,
              transcription: {
                ...c.transcription,
                provider: c.transcription?.provider || "local",
                apiKey: e.target.value,
              },
            }))}
            placeholder={messages.settings.tools.transcription.apiKeyPlaceholder}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
          />
        </SettingField>
      )}
      {(!config.transcription?.provider || config.transcription?.provider === "local") && (
        <SettingField label={messages.settings.tools.transcription.whisperModel}>
          <SelectInput
            value={config.transcription?.model || "base"}
            onChange={(v) => updateConfig((c) => ({
              ...c,
              transcription: {
                ...c.transcription,
                provider: c.transcription?.provider || "local",
                model: v,
              },
            }))}
            options={[
              { value: "tiny", label: "Tiny" },
              { value: "base", label: "Base" },
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </SettingField>
      )}
    </IntegrationConfigModal>

    {/* ── TTS config modal ── */}
    <IntegrationConfigModal
      open={showTtsConfigModal}
      onClose={() => {
        if (ttsConfigMissingApiKey) {
          updateConfig((c) => ({
            ...c,
            tts: { ...c.tts, provider: "local" },
          }));
        }
        setShowTtsConfigModal(false);
      }}
      icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
      title={messages.settings.tools.tts.title}
      doneDisabled={ttsConfigMissingApiKey}
    >
      <SettingField label={messages.settings.tools.tts.provider}>
        <SelectInput
          value={selectedTtsProviderId}
          onChange={(v) => updateConfig((c) => ({
            ...c,
            tts: {
              ...c.tts,
              provider: v as TtsProvider,
            },
          }))}
          options={ttsProviderOptions}
          disabled={ttsProviderOptions.length === 0}
        />
      </SettingField>
      {!selectedTtsProvider && (
        <div className="text-sm text-muted-foreground py-2">{messages.common.loading}</div>
      )}
      {selectedTtsProvider?.fields.map((field) => renderTtsField(selectedTtsProvider, field))}
      <div className="flex items-center justify-between py-1">
        <div>
          <div className="text-xs font-medium text-strong-foreground">{messages.settings.tools.tts.autoRead}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.tools.tts.autoReadHint}</div>
        </div>
        <Toggle
          enabled={config.tts?.autoRead === true}
          onChange={(v) => updateConfig((c) => ({
            ...c,
            tts: { ...c.tts, provider: c.tts?.provider || "local", autoRead: v },
          }))}
        />
      </div>
    </IntegrationConfigModal>

    {/* ── Image Generation section ──────────────────────────── */}
    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-6">{messages.settings.tools.imageSection}</h3>

    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
        title={messages.settings.tools.imageGeneration.title}
        description={messages.settings.tools.imageGeneration.description}
        enabled={config.imageGeneration?.enabled !== false}
        onToggle={(v) => updateConfig((c) => ({
          ...c,
          imageGeneration: { ...c.imageGeneration, enabled: v },
        }))}
        status={(() => {
          if (config.imageGeneration?.enabled === false) return "disabled" as const;
          const avail = imageBackends.filter((b) => b.available);
          return avail.length > 0 ? "connected" as const : "disabled" as const;
        })()}
        detail={config.imageGeneration?.enabled !== false
          ? (() => {
              const selectedId = config.imageGeneration?.defaultBackendId;
              if (selectedId) {
                const found = imageBackends.find((b) => b.id === selectedId);
                if (found) return found.label;
              }
              const avail = imageBackends.filter((b) => b.available);
              return avail[0]?.label;
            })()
          : undefined}
        onRowClick={config.imageGeneration?.enabled !== false ? () => setShowImageGenConfigModal(true) : undefined}
        isFirst
        isLast
        testId="image-generation-tool"
      />
    </div>

    {/* ── Image Generation config modal ── */}
    <IntegrationConfigModal
      open={showImageGenConfigModal}
      onClose={() => setShowImageGenConfigModal(false)}
      icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
      title={messages.settings.tools.imageGeneration.title}
      statusLabel={(() => {
        const avail = imageBackends.filter((b) => b.available);
        return avail.length > 0 ? `${avail.length} ${messages.settings.tools.imageGeneration.backendAvailable.toLowerCase()}` : undefined;
      })()}
    >
      {/* Default backend selector — always show a proper dropdown */}
      <SettingField label={messages.settings.tools.imageGeneration.backend}>
        {imageBackends.length === 0 ? (
          <p className="text-xs text-muted-foreground">{messages.settings.tools.imageGeneration.noBackends}</p>
        ) : (
          <SelectInput
            value={config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id || ""}
            onChange={(v) => updateConfig((c) => ({
              ...c,
              imageGeneration: { ...c.imageGeneration, defaultBackendId: v || undefined, model: undefined, metadata: undefined },
            }))}
            placeholder={messages.settings.tools.imageGeneration.selectBackend}
            options={imageBackends.map((b) => ({
              value: b.id,
              label: `${b.label}${!b.available ? ` (${messages.settings.tools.imageGeneration.backendUnavailable.toLowerCase()})` : ""}`,
            }))}
          />
        )}
      </SettingField>

      {/* Model selector — dropdown when backend has supportedModels, text input fallback */}
      {(() => {
        const selectedBackendId = config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id;
        const selectedBackend = imageBackends.find((b) => b.id === selectedBackendId);
        const models = selectedBackend?.supportedModels;
        if (!selectedBackend) return null;
        return (
          <SettingField label={messages.settings.tools.imageGeneration.model}>
            {models && models.length > 0 ? (
              <SelectInput
                value={config.imageGeneration?.model || models.find((m) => m.default)?.id || models[0].id}
                onChange={(v) => updateConfig((c) => ({
                  ...c,
                  imageGeneration: { ...c.imageGeneration, model: v || undefined },
                }))}
                placeholder={messages.settings.tools.imageGeneration.selectModel}
                options={models.map((m) => ({
                  value: m.id,
                  label: m.default ? `${m.label} (${messages.settings.tools.imageGeneration.modelDefault})` : m.label,
                }))}
              />
            ) : (
              <input
                type="text"
                value={config.imageGeneration?.model || ""}
                onChange={(e) => updateConfig((c) => ({
                  ...c,
                  imageGeneration: { ...c.imageGeneration, model: e.target.value || undefined },
                }))}
                placeholder="model-id"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
              />
            )}
          </SettingField>
        );
      })()}

      {/* Metadata options — rendered dynamically from the selected backend's metadataSchema */}
      {(() => {
        const selectedBackendId = config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id;
        const selectedBackend = imageBackends.find((b) => b.id === selectedBackendId);
        const schema = selectedBackend?.metadataSchema;
        if (!schema || schema.length === 0) return null;
        return (
          <>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">{messages.settings.tools.imageGeneration.options}</h4>
            {schema.map((field) => (
              <SettingField key={field.key} label={field.label}>
                {field.type === "select" && field.options ? (
                  <SelectInput
                    value={config.imageGeneration?.metadata?.[field.key] || field.default || ""}
                    onChange={(v) => updateConfig((c) => ({
                      ...c,
                      imageGeneration: {
                        ...c.imageGeneration,
                        metadata: { ...c.imageGeneration?.metadata, ...(v ? { [field.key]: v } : {}) },
                      },
                    }))}
                    placeholder={field.label}
                    options={field.options.map((o) => ({ value: o.value, label: o.label }))}
                  />
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={config.imageGeneration?.metadata?.[field.key] || ""}
                    onChange={(e) => updateConfig((c) => ({
                      ...c,
                      imageGeneration: {
                        ...c.imageGeneration,
                        metadata: { ...c.imageGeneration?.metadata, ...(e.target.value ? { [field.key]: e.target.value } : {}) },
                      },
                    }))}
                    placeholder={field.placeholder || field.default || ""}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  />
                )}
              </SettingField>
            ))}
          </>
        );
      })()}

      {/* Backend availability list */}
      {imageBackends.length > 0 && (
        <>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-3">{messages.settings.tools.imageGeneration.backendsStatus}</h4>
          <div className="space-y-1.5">
            {imageBackends.map((backend) => (
              <div key={backend.id} className="flex items-center justify-between py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-strong-foreground truncate">{backend.label}</div>
                  {!backend.available && backend.reason && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{backend.reason}</div>
                  )}
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                  backend.available
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                }`}>
                  {backend.available
                    ? messages.settings.tools.imageGeneration.backendAvailable
                    : messages.settings.tools.imageGeneration.backendUnavailable}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </IntegrationConfigModal>

  </div>

  );
}
