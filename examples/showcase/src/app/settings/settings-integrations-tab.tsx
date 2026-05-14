// @ts-nocheck
"use client";

import { ALL_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import { AlertCircle, Check, Hash } from "lucide-react";
import { IntegrationConfigModal, IntegrationRow, MultiSelectChips, SelectInput, SettingField, TagsInput, TextInput, Toggle, resolveSelectedCalendarIds, resolveSelectedEmailIds } from "./settings-components";

export function SettingsIntegrationsTab(props: any) {
  const {
    messages,
    config,
    updateConfig,
    toolStatus,
    whatsappEnabled,
    whatsappReady,
    whatsappStatus,
    whatsAppState,
    whatsAppQrText,
    whatsAppQrImage,
    whatsappSyncing,
    showWhatsAppQrModal,
    setShowWhatsAppQrModal,
    showWhatsAppConfigModal,
    setShowWhatsAppConfigModal,
    openWhatsAppConfigModal,
    waChats,
    waChatsLoading,
    handleWhatsAppToggle,
    showWhatsAppDisconnectModal,
    setShowWhatsAppDisconnectModal,
    whatsAppDisconnecting,
    whatsAppUninstallCli,
    setWhatsAppUninstallCli,
    handleWhatsAppDisable,
    emailEnabled,
    emailStatus,
    emailOptions,
    selectedEmailIds,
    allEmailSelected,
    showEmailAccountsModal,
    setShowEmailAccountsModal,
    calendarEnabled,
    calendarStatus,
    calendarOptions,
    selectedCalendarIds,
    allCalendarSelected,
    showCalendarConfigModal,
    setShowCalendarConfigModal,
    transcriptionEnabled,
    transcriptionStatus,
    transcriptionWhisperReady,
    showTranscriptionConfigModal,
    setShowTranscriptionConfigModal,
    selectedTtsProviderId,
    selectedTtsProvider,
    ttsProviderLabel,
    ttsProviderOptions,
    ttsConfigMissingApiKey,
    showTtsConfigModal,
    setShowTtsConfigModal,
    renderTtsField,
    telegramEnabled,
    telegramConnected,
    telegramStatus,
    handleTelegramToggle,
    showTelegramConfigModal,
    setShowTelegramConfigModal,
    showTelegramDisconnectModal,
    setShowTelegramDisconnectModal,
    telegramDisconnecting,
    telegramTesting,
    telegramTestError,
    setTelegramTestError,
    telegramBotTokenInput,
    setTelegramBotTokenInput,
    telegramBotInfo,
    handleTelegramTestConnection,
    handleTelegramDisable,
    slackEnabled,
    slackStatus,
    handleSlackToggle,
    showSlackConfigModal,
    setShowSlackConfigModal,
    showSlackDisconnectModal,
    setShowSlackDisconnectModal,
    slackDisconnecting,
    slackTesting,
    slackTestError,
    setSlackTestError,
    slackBotTokenInput,
    setSlackBotTokenInput,
    slackBotInfo,
    handleSlackTestConnection,
    handleSlackDisable,
  } = props;

  return (

  <div className="space-y-3">
    <p className="text-xs text-muted-foreground mb-4">
      {messages.settings.integrations.intro}
    </p>

    {/* Unified integrations card */}
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* WhatsApp */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>}
        title={messages.settings.integrations.whatsapp.title}
        description={messages.settings.integrations.whatsapp.description}
        enabled={whatsappEnabled}
        onToggle={handleWhatsAppToggle}
        status={whatsappStatus}
        detail={whatsappStatus === "connected" && (config.excludedChats.length > 0 || config.excludeGroups)
          ? [
              config.excludedChats.length > 0 ? `${config.excludedChats.length} ${messages.settings.integrations.whatsapp.chatsToExclude.toLowerCase()}` : "",
              config.excludeGroups ? messages.settings.integrations.whatsapp.excludeGroups.toLowerCase() : "",
            ].filter(Boolean).join(", ")
          : undefined}
        onRowClick={whatsappStatus === "connected" || whatsappStatus === "syncing" ? openWhatsAppConfigModal : undefined}
        toggleDisabled={whatsAppState === "connecting" || whatsAppState === "installing"}
        isFirst
        testId="whatsapp-integration"
      />

      {/* Email */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>}
        title={messages.settings.integrations.email.title}
        description={messages.settings.integrations.email.description}
        enabled={emailEnabled}
        onToggle={(v) => updateConfig((c) => ({
          ...c,
          emailAccounts: v ? [ALL_EMAIL_ACCOUNTS_ID] : [],
        }))}
        status={emailStatus}
        detail={emailStatus === "connected"
          ? allEmailSelected
            ? messages.settings.integrations.email.allAccounts
            : selectedEmailIds.length === 0
              ? undefined
              : emailOptions
                  .filter((a) => selectedEmailIds.includes(a.id))
                  .map((a) => a.displayName || a.email || a.id)
                  .join(", ")
          : undefined}
        onRowClick={emailStatus === "connected" ? () => setShowEmailAccountsModal(true) : undefined}
        testId="email-integration"
      />

      {/* Telegram */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>}
        title={messages.settings.integrations.telegram.title}
        description={messages.settings.integrations.telegram.description}
        enabled={telegramEnabled}
        onToggle={handleTelegramToggle}
        status={telegramStatus}
        detail={telegramStatus === "connected" ? telegramBotInfo ? `@${telegramBotInfo.username}` : messages.settings.integrations.telegram.connected : undefined}
        onRowClick={telegramEnabled ? () => {
          setTelegramBotTokenInput("");
          setTelegramTestError(false);
          setShowTelegramConfigModal(true);
        } : undefined}
        testId="telegram-integration"
      />

      {/* Slack */}
      <IntegrationRow
        icon={<Hash className="w-[17px] h-[17px]" />}
        title={messages.settings.integrations.slack.title}
        description={messages.settings.integrations.slack.description}
        enabled={slackEnabled}
        onToggle={handleSlackToggle}
        status={slackStatus}
        detail={slackStatus === "connected" ? slackBotInfo ? slackBotInfo.teamName : messages.settings.integrations.slack.connected : undefined}
        onRowClick={slackEnabled ? () => {
          setSlackBotTokenInput("");
          setSlackTestError(false);
          setShowSlackConfigModal(true);
        } : undefined}
        testId="slack-integration"
      />

      {/* Calendar */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>}
        title={messages.settings.integrations.calendar.title}
        description={messages.settings.integrations.calendar.description}
        enabled={calendarEnabled}
        onToggle={(v) => updateConfig((c) => ({
          ...c,
          calendarAccounts: v ? [ALL_CALENDARS_ID] : [],
        }))}
        status={calendarStatus}
        detail={calendarStatus === "connected"
          ? allCalendarSelected
            ? messages.settings.integrations.calendar.allCalendars
            : selectedCalendarIds.length === 0
              ? undefined
              : calendarOptions
                  .filter((c) => selectedCalendarIds.includes(c.id))
                  .map((c) => c.title)
                  .join(", ")
          : undefined}
        onRowClick={calendarStatus === "connected" ? () => setShowCalendarConfigModal(true) : undefined}
        testId="calendar-integration"
      />

      {/* Contacts */}
      <IntegrationRow
        icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        title="Contacts"
        description="Access contacts from macOS Contacts.app"
        enabled={!!config.contactsEnabled}
        onToggle={(v) => updateConfig((c) => ({
          ...c,
          contactsEnabled: v,
        }))}
        status={!config.contactsEnabled ? "disabled"
          : toolStatus?.contacts?.available ? "connected" : "waiting"}
        detail={config.contactsEnabled && toolStatus?.contacts?.available
          ? `${toolStatus.contacts.contactCount} contacts`
          : undefined}
        isLast
        testId="contacts-integration"
      />
    </div>

    {/* ── WhatsApp error (only shown when there's a real error) ── */}
    {whatsappEnabled && toolStatus?.whatsapp.lastError && whatsappStatus !== "connected" && (
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
        {toolStatus.whatsapp.lastError}
      </div>
    )}

    {/* ── WhatsApp QR modal ── */}
    {showWhatsAppQrModal && whatsAppQrText && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowWhatsAppQrModal(false)}>
        <div className="bg-card rounded-2xl shadow-xl border border-border p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-sm font-medium text-foreground">{messages.settings.integrations.whatsapp.title}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={whatsAppQrImage}
              alt={messages.settings.integrations.whatsapp.qrAlt}
              className="w-56 h-56 rounded-lg border border-border bg-card p-2"
            />
            <p className="text-center text-xs text-muted-foreground">
              {messages.settings.integrations.whatsapp.qrHint}
            </p>
            {toolStatus?.whatsapp.lastError && (
              <div className="w-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400">
                {toolStatus.whatsapp.lastError}
              </div>
            )}
            <button
              onClick={() => setShowWhatsAppQrModal(false)}
              className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              {messages.common.hide}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── WhatsApp disconnect modal ── */}
    {showWhatsAppDisconnectModal && (
      <>
        <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !whatsAppDisconnecting && (setShowWhatsAppDisconnectModal(false), setWhatsAppUninstallCli(false))} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !whatsAppDisconnecting && (setShowWhatsAppDisconnectModal(false), setWhatsAppUninstallCli(false))}>
          <div
            data-testid="whatsapp-disconnect-modal"
            className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
              {messages.settings.integrations.whatsapp.disconnect.title}
            </h3>
            <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
              {messages.settings.integrations.whatsapp.disconnect.description}
            </p>

            <div className="space-y-2.5 mb-5">
              {/* Option: just disable */}
              <button
                type="button"
                disabled={!!whatsAppDisconnecting}
                onClick={() => handleWhatsAppDisable(false, false)}
                data-testid="whatsapp-disconnect-keep"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  {whatsAppDisconnecting === "keep" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">
                    {messages.settings.integrations.whatsapp.disconnect.keepData}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {messages.settings.integrations.whatsapp.disconnect.keepDataHint}
                </p>
              </button>

              {/* Option: delete data */}
              <button
                type="button"
                disabled={!!whatsAppDisconnecting}
                onClick={() => handleWhatsAppDisable(true, whatsAppUninstallCli)}
                data-testid="whatsapp-disconnect-delete"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  {whatsAppDisconnecting === "delete" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">
                    {messages.settings.integrations.whatsapp.disconnect.deleteData}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {messages.settings.integrations.whatsapp.disconnect.deleteDataHint}
                </p>
              </button>
            </div>

            {/* Checkbox: also uninstall CLI */}
            <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                whatsAppUninstallCli ? "border-foreground bg-foreground" : "border-muted-foreground"
              }`} onClick={() => setWhatsAppUninstallCli((v) => !v)}>
                {whatsAppUninstallCli && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
              <span className="text-[11px] text-strong-foreground">
                {messages.settings.integrations.whatsapp.disconnect.uninstallCli}
              </span>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!!whatsAppDisconnecting}
                onClick={() => { setShowWhatsAppDisconnectModal(false); setWhatsAppUninstallCli(false); }}
                data-testid="whatsapp-disconnect-cancel"
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                {messages.settings.integrations.whatsapp.disconnect.cancel}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {/* ── WhatsApp config modal ── */}
    {showWhatsAppConfigModal && (() => {
      const waGroups = waChats.filter((c) => c.isGroup);
      const waContacts = waChats.filter((c) => !c.isGroup);
      const excludedSet = new Set(config.excludedChats.map((n) => n.toLowerCase()));
      const isExcluded = (name: string) => {
        const lower = name.toLowerCase();
        for (const n of excludedSet) {
          if (lower.includes(n)) return true;
        }
        return false;
      };
      const toggleChat = (chatName: string) => {
        const lower = chatName.toLowerCase();
        if (isExcluded(chatName)) {
          updateConfig((c) => ({
            ...c,
            excludedChats: c.excludedChats.filter((n) => !lower.includes(n)),
          }));
        } else {
          updateConfig((c) => ({
            ...c,
            excludedChats: [...c.excludedChats, lower],
          }));
        }
      };

      const ChatRow = ({ chat }: { chat: { name: string; isGroup: boolean; messageCount: number } }) => {
        const excluded = config.excludeGroups && chat.isGroup ? true : isExcluded(chat.name);
        const disabledByGroupToggle = config.excludeGroups && chat.isGroup;
        return (
          <button
            type="button"
            onClick={() => !disabledByGroupToggle && toggleChat(chat.name)}
            disabled={disabledByGroupToggle}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors ${disabledByGroupToggle ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              !excluded
                ? "border-foreground bg-foreground"
                : "border-muted-foreground"
            }`}>
              {!excluded && (
                <Check className="h-3 w-3 text-primary-foreground" />
              )}
            </span>
            <span className={`flex-1 truncate ${excluded ? "text-muted-foreground" : "text-foreground"}`}>
              {chat.name}
            </span>
          </button>
        );
      };

      return (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowWhatsAppConfigModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsAppConfigModal(false)}>
            <div
              data-testid="whatsapp-config-modal"
              className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.whatsapp.title}</h3>
                  {whatsappSyncing ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-sky-600 mt-0.5">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      {messages.settings.integrations.whatsapp.syncing}
                    </div>
                  ) : whatsappReady ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {messages.settings.status.connected}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowWhatsAppConfigModal(false)}
                  className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Voice note transcription toggle */}
              <div className="flex items-center justify-between px-6 pt-3">
                <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.whatsapp.autoTranscribe}</span>
                <Toggle
                  enabled={!!config.whatsappAutoTranscribe}
                  onChange={(v) => {
                    if (v && !config.transcription?.provider) {
                      setShowWhatsAppConfigModal(false);
                      setTab("tools");
                      setTimeout(() => setShowTranscriptionConfigModal(true), 200);
                      return;
                    }
                    updateConfig((c) => ({ ...c, whatsappAutoTranscribe: v }));
                  }}
                  testId="whatsapp-auto-transcribe-toggle"
                />
              </div>

              {/* Send messages toggle */}
              <div className="flex items-center justify-between px-6 pt-3">
                <div>
                  <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.whatsapp.sendMessages}</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{messages.settings.integrations.whatsapp.sendMessagesHint}</p>
                </div>
                <Toggle
                  enabled={!!config.whatsappBot?.enabled}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    whatsappBot: { ...c.whatsappBot, enabled: v, mode: v ? (c.whatsappBot?.mode || "wacli") : c.whatsappBot?.mode },
                  }))}
                  testId="whatsapp-send-messages-toggle"
                />
              </div>

              {config.whatsappBot?.enabled && (
                <div className="px-6 pt-2 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateConfig((c) => ({ ...c, whatsappBot: { ...c.whatsappBot, enabled: true, mode: "wacli" } }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[11px] text-left transition-colors ${
                        config.whatsappBot?.mode !== "business-api"
                          ? "border-foreground bg-foreground/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      <div className="font-medium">{messages.settings.integrations.whatsapp.modeWacli}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{messages.settings.integrations.whatsapp.modeWacliHint}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfig((c) => ({ ...c, whatsappBot: { ...c.whatsappBot, enabled: true, mode: "business-api" } }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[11px] text-left transition-colors ${
                        config.whatsappBot?.mode === "business-api"
                          ? "border-foreground bg-foreground/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      <div className="font-medium">{messages.settings.integrations.whatsapp.modeBusinessApi}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{messages.settings.integrations.whatsapp.modeBusinessApiHint}</div>
                    </button>
                  </div>
                </div>
              )}

              <div className="h-px bg-muted mx-6 mt-3" />

              <p className="text-[11px] text-muted-foreground px-6 pt-3">
                {messages.settings.integrations.whatsapp.chatsToExcludeHint}
              </p>

              {/* Syncing banner */}
              {whatsappSyncing && (
                <div className="mx-6 mt-2.5 flex items-center gap-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 px-3 py-2">
                  <svg className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-[11px] text-sky-700">{messages.settings.integrations.whatsapp.syncingHint}</span>
                </div>
              )}

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
                {waChatsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8">
                    <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : waChats.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">{messages.settings.integrations.whatsapp.noChatsFound}</p>
                ) : (
                  <>
                    {/* Contacts section (first) */}
                    {waContacts.length > 0 && (
                      <div className="mb-1">
                        <div className="flex items-center justify-between px-3 pt-2 pb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {messages.settings.integrations.whatsapp.contacts} ({waContacts.length})
                          </span>
                        </div>
                        {waContacts.map((chat, index) => (
                          <ChatRow key={`${chat.name}-${index}`} chat={chat} />
                        ))}
                      </div>
                    )}

                    {/* Groups section (second) */}
                    {waGroups.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between px-3 pt-2 pb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {messages.settings.integrations.whatsapp.groups} ({waGroups.length})
                          </span>
                          <Toggle
                            enabled={!config.excludeGroups}
                            onChange={(v) => updateConfig((c) => ({ ...c, excludeGroups: !v }))}
                          />
                        </div>
                        {!config.excludeGroups ? (
                          <p className="text-[11px] text-muted-foreground px-3 py-2">{messages.settings.integrations.whatsapp.excluded}</p>
                        ) : (
                          waGroups.map((chat, index) => (
                            <ChatRow key={`${chat.name}-${index}`} chat={chat} />
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppConfigModal(false)}
                  data-testid="whatsapp-config-done"
                  className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                >
                  {messages.settings.integrations.email.done}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Telegram disconnect modal ── */}
    {showTelegramDisconnectModal && (
      <>
        <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !telegramDisconnecting && setShowTelegramDisconnectModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !telegramDisconnecting && setShowTelegramDisconnectModal(false)}>
          <div
            data-testid="telegram-disconnect-modal"
            className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
              {messages.settings.integrations.telegram.disconnect.title}
            </h3>
            <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
              {messages.settings.integrations.telegram.disconnect.description}
            </p>

            <div className="space-y-2.5 mb-5">
              <button
                type="button"
                disabled={!!telegramDisconnecting}
                onClick={() => handleTelegramDisable(false)}
                data-testid="telegram-disconnect-keep"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  {telegramDisconnecting === "keep" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">
                    {messages.settings.integrations.telegram.disconnect.keepData}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {messages.settings.integrations.telegram.disconnect.keepDataHint}
                </p>
              </button>

              <button
                type="button"
                disabled={!!telegramDisconnecting}
                onClick={() => handleTelegramDisable(true)}
                data-testid="telegram-disconnect-delete"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  {telegramDisconnecting === "delete" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">
                    {messages.settings.integrations.telegram.disconnect.deleteData}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {messages.settings.integrations.telegram.disconnect.deleteDataHint}
                </p>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!!telegramDisconnecting}
                onClick={() => setShowTelegramDisconnectModal(false)}
                data-testid="telegram-disconnect-cancel"
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                {messages.settings.integrations.telegram.disconnect.cancel}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {/* ── Telegram config modal ── */}
    {showTelegramConfigModal && (() => {
      const hasBotToken = telegramConnected;
      const botInfo = telegramBotInfo;

      return (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowTelegramConfigModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTelegramConfigModal(false)}>
            <div
              data-testid="telegram-config-modal"
              className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.telegram.title}</h3>
                  {hasBotToken ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {messages.settings.integrations.telegram.connected}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                      {messages.settings.integrations.telegram.disconnected}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowTelegramConfigModal(false)}
                  className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4">

                {/* ── State A: no token yet → setup flow ── */}
                {!hasBotToken && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-3">{messages.settings.integrations.telegram.botTokenHint}</p>

                    {/* Token input + connect button */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={telegramBotTokenInput}
                        onChange={(e) => { setTelegramBotTokenInput(e.target.value); setTelegramTestError(false); }}
                        placeholder={messages.settings.integrations.telegram.botTokenPlaceholder}
                        autoComplete="off"
                        autoFocus
                        data-testid="telegram-token-input"
                        className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors font-mono"
                      />
                    </div>

                    {telegramTestError && (
                      <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-600">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {messages.settings.integrations.telegram.testFailed}
                      </div>
                    )}

                    {/* Connect button (full width below) */}
                    <button
                      type="button"
                      disabled={!telegramBotTokenInput.trim() || telegramTesting}
                      onClick={() => handleTelegramTestConnection(telegramBotTokenInput.trim())}
                      data-testid="telegram-test-connection"
                      className={`w-full mt-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                        !telegramBotTokenInput.trim() || telegramTesting
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
                      }`}
                    >
                      {telegramTesting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          {messages.settings.integrations.telegram.connecting}
                        </span>
                      ) : messages.settings.integrations.telegram.testConnection}
                    </button>
                  </div>
                )}

                {/* ── State B: token saved → bot info + configuration ── */}
                {hasBotToken && (
                  <>
                    {/* Bot info card */}
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        {botInfo ? (
                          <>
                            <div className="text-[13px] font-medium text-foreground truncate">{botInfo.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">@{botInfo.username}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-[13px] font-medium text-foreground">{messages.settings.integrations.telegram.connected}</div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate">••••••••••</div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="h-px bg-muted" />

                    {/* Sync messages toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.telegram.syncMessages}</span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.telegram.syncMessagesHint}</p>
                      </div>
                      <Toggle
                        enabled={!!config.telegram?.syncMessages}
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          telegram: { ...c.telegram, enabled: true, syncMessages: v },
                        }))}
                        testId="telegram-sync-toggle"
                      />
                    </div>

                    <div className="h-px bg-muted" />

                    {/* Allowed chat IDs */}
                    <div>
                      <label className="block text-[12px] font-medium text-strong-foreground mb-1">{messages.settings.integrations.telegram.allowedChats}</label>
                      <p className="text-[11px] text-muted-foreground mb-2">{messages.settings.integrations.telegram.allowedChatsHint}</p>
                      <TagsInput
                        value={config.telegram?.allowedChatIds || []}
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          telegram: { ...c.telegram, enabled: true, allowedChatIds: v },
                        }))}
                        placeholder={messages.settings.integrations.telegram.allowedChatsPlaceholder}
                      />
                    </div>

                    {/* Webhook URL (read-only info) */}
                    {toolStatus?.telegram?.webhookUrl && (
                      <>
                        <div className="h-px bg-muted" />
                        <div>
                          <label className="block text-[12px] font-medium text-strong-foreground mb-1">{messages.settings.integrations.telegram.webhookUrl}</label>
                          <p className="text-[11px] text-muted-foreground mb-1.5">{messages.settings.integrations.telegram.webhookUrlHint}</p>
                          <div className="bg-muted rounded-lg px-3 py-2 text-xs text-strong-foreground font-mono break-all">
                            {toolStatus.telegram.webhookUrl}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowTelegramConfigModal(false)}
                  data-testid="telegram-config-done"
                  className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                >
                  {messages.settings.integrations.email.done}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Slack disconnect modal ── */}
    {showSlackDisconnectModal && (
      <>
        <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !slackDisconnecting && setShowSlackDisconnectModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !slackDisconnecting && setShowSlackDisconnectModal(false)}>
          <div
            data-testid="slack-disconnect-modal"
            className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
              {messages.settings.integrations.slack.disconnect.title}
            </h3>
            <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
              {messages.settings.integrations.slack.disconnect.description}
            </p>
            <div className="space-y-2.5 mb-5">
              <button type="button" disabled={!!slackDisconnecting} onClick={() => handleSlackDisable(false)}
                data-testid="slack-disconnect-keep"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50">
                <div className="flex items-center gap-2">
                  {slackDisconnecting === "keep" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">{messages.settings.integrations.slack.disconnect.keepData}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.slack.disconnect.keepDataHint}</p>
              </button>
              <button type="button" disabled={!!slackDisconnecting} onClick={() => handleSlackDisable(true)}
                data-testid="slack-disconnect-delete"
                className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50">
                <div className="flex items-center gap-2">
                  {slackDisconnecting === "delete" && (
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-[13px] font-medium text-foreground">{messages.settings.integrations.slack.disconnect.deleteData}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.slack.disconnect.deleteDataHint}</p>
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={!!slackDisconnecting} onClick={() => setShowSlackDisconnectModal(false)}
                data-testid="slack-disconnect-cancel"
                className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50">
                {messages.settings.integrations.slack.disconnect.cancel}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {/* ── Slack config modal ── */}
    {showSlackConfigModal && (() => {
      const hasBotToken = !!toolStatus?.slack.botConnected;
      const botInfo = slackBotInfo;
      return (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowSlackConfigModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSlackConfigModal(false)}>
            <div
              data-testid="slack-config-modal"
              className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                  <Hash className="w-[18px] h-[18px]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.slack.title}</h3>
                  {hasBotToken ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {messages.settings.integrations.slack.connected}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                      {messages.settings.integrations.slack.disconnected}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowSlackConfigModal(false)}
                  className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4">
                {!hasBotToken && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-3">{messages.settings.integrations.slack.botTokenHint}</p>
                    <div className="flex gap-2">
                      <input type="text" value={slackBotTokenInput}
                        onChange={(e) => { setSlackBotTokenInput(e.target.value); setSlackTestError(false); }}
                        placeholder={messages.settings.integrations.slack.botTokenPlaceholder}
                        autoComplete="off" autoFocus
                        data-testid="slack-token-input"
                        className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors font-mono" />
                    </div>
                    {slackTestError && (
                      <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-600">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {messages.settings.integrations.slack.testFailed}
                      </div>
                    )}
                    <button type="button" disabled={!slackBotTokenInput.trim() || slackTesting}
                      onClick={() => handleSlackTestConnection(slackBotTokenInput.trim())}
                      data-testid="slack-test-connection"
                      className={`w-full mt-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                        !slackBotTokenInput.trim() || slackTesting
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
                      }`}>
                      {slackTesting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          {messages.settings.integrations.slack.connecting}
                        </span>
                      ) : messages.settings.integrations.slack.testConnection}
                    </button>
                  </div>
                )}
                {hasBotToken && (
                  <>
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center shrink-0">
                        <Hash className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {botInfo ? (
                          <>
                            <div data-testid="slack-bot-username" className="text-[13px] font-medium text-foreground truncate">{botInfo.username}</div>
                            <div data-testid="slack-team-name" className="text-[11px] text-muted-foreground truncate">{botInfo.teamName}</div>
                          </>
                        ) : (
                          <div className="text-[13px] text-muted-foreground">{messages.settings.integrations.slack.connected}</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                <button type="button" onClick={() => setShowSlackConfigModal(false)}
                  data-testid="slack-config-done"
                  className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors">
                  {messages.settings.integrations.email.done}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Email config modal ── */}
    {showEmailAccountsModal && (
      <>
        <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowEmailAccountsModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEmailAccountsModal(false)}>
          <div
            data-testid="email-config-modal"
            className="mx-4 flex w-full max-w-[420px] max-h-[min(480px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
              <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.email.title}</h3>
                {emailStatus === "connected" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {messages.settings.status.connected}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowEmailAccountsModal(false)}
                className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground px-6 pt-2">
              {messages.settings.integrations.email.description}
            </p>

            <div className="flex items-center justify-end px-6 pt-3">
              <button
                type="button"
                onClick={() => {
                  if (allEmailSelected) {
                    updateConfig((c) => ({ ...c, emailAccounts: emailOptions.map(() => NONE_EMAIL_ACCOUNTS_ID) }));
                  } else {
                    updateConfig((c) => ({ ...c, emailAccounts: [ALL_EMAIL_ACCOUNTS_ID] }));
                  }
                }}
                className="text-xs text-strong-foreground hover:text-foreground transition-colors"
              >
                {allEmailSelected
                  ? messages.settings.integrations.email.deselectAll
                  : messages.settings.integrations.email.selectAll}
              </button>
            </div>

            {/* Account list */}
            <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
              {emailOptions.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              ) : (
                emailOptions.map((account) => {
                  const selected = selectedEmailIds.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      data-testid={`email-integration-account-${account.id}`}
                      onClick={() => updateConfig((current) => {
                        const currentSelectedIds = resolveSelectedEmailIds(current.emailAccounts, emailOptions);
                        const nextSelectedIds = new Set(currentSelectedIds);
                        if (selected) {
                          nextSelectedIds.delete(account.id);
                        } else {
                          nextSelectedIds.add(account.id);
                        }
                        const nextIds = Array.from(nextSelectedIds);
                        return {
                          ...current,
                          emailAccounts: nextIds.length === 0
                            ? [NONE_EMAIL_ACCOUNTS_ID]
                            : nextIds.length === emailOptions.length
                              ? [ALL_EMAIL_ACCOUNTS_ID]
                              : nextIds,
                        };
                      })}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground"
                      }`}>
                        {selected && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </span>
                      <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                        {account.displayName || account.email || account.id}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
              <button
                type="button"
                onClick={() => setShowEmailAccountsModal(false)}
                data-testid="email-config-done"
                className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
              >
                {messages.settings.integrations.email.done}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

    {/* ── Calendar config modal ── */}
    {showCalendarConfigModal && (
      <>
        <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowCalendarConfigModal(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarConfigModal(false)}>
          <div
            data-testid="calendar-config-modal"
            className="mx-4 flex w-full max-w-[420px] max-h-[min(480px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
              <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.calendar.title}</h3>
                {calendarStatus === "connected" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {messages.settings.status.connected}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCalendarConfigModal(false)}
                className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground px-6 pt-2">
              {messages.settings.integrations.calendar.description}
            </p>

            <div className="flex items-center justify-end px-6 pt-3">
              <button
                type="button"
                onClick={() => {
                  if (allCalendarSelected) {
                    updateConfig((c) => ({ ...c, calendarAccounts: calendarOptions.map(() => NONE_CALENDARS_ID) }));
                  } else {
                    updateConfig((c) => ({ ...c, calendarAccounts: [ALL_CALENDARS_ID] }));
                  }
                }}
                className="text-xs text-strong-foreground hover:text-foreground transition-colors"
              >
                {allCalendarSelected
                  ? messages.settings.integrations.calendar.deselectAll
                  : messages.settings.integrations.calendar.selectAll}
              </button>
            </div>

            {/* Calendar list */}
            <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
              {calendarOptions.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              ) : (
                calendarOptions.map((calendar) => {
                  const selected = selectedCalendarIds.includes(calendar.id);
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      data-testid={`calendar-integration-calendar-${calendar.id}`}
                      onClick={() => updateConfig((current) => {
                        const currentSelectedIds = resolveSelectedCalendarIds(current.calendarAccounts || [], calendarOptions);
                        const nextSelectedIds = new Set(currentSelectedIds);
                        if (selected) {
                          nextSelectedIds.delete(calendar.id);
                        } else {
                          nextSelectedIds.add(calendar.id);
                        }
                        const nextIds = Array.from(nextSelectedIds);
                        return {
                          ...current,
                          calendarAccounts: nextIds.length === 0
                            ? [NONE_CALENDARS_ID]
                            : nextIds.length === calendarOptions.length
                              ? [ALL_CALENDARS_ID]
                              : nextIds,
                        };
                      })}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground"
                      }`}>
                        {selected && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </span>
                      <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                        {calendar.title}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
              <button
                type="button"
                onClick={() => setShowCalendarConfigModal(false)}
                data-testid="calendar-config-done"
                className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
              >
                {messages.settings.integrations.calendar.done}
              </button>
            </div>
          </div>
        </div>
      </>
    )}

  </div>

  );
}
