"use client";

import { useAppBootstrap } from "@/components/app-bootstrap-provider";
import { defaultClawJsTranscriptionDbPath } from "@/lib/openclaw-defaults";
import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ALL_CALENDARS_ID, NONE_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID, NONE_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import { useLocale } from "@/components/locale-provider";
import { hasConfirmedOAuthSubscription, type AiAuthSummary } from "@/lib/ai-auth";
import { localized } from "@/lib/i18n/localized";
import type { IntegrationStatus, ProfileSection } from "@/lib/app-bootstrap";
import type { Locale } from "@/lib/i18n/messages";
import type { UserConfig } from "@/lib/user-config";
import type { TtsCatalog, TtsConfigFieldDescriptor, TtsProvider, TtsProviderConfig, TtsProviderDescriptor } from "@clawjs/claw";
import MarkdownEditor from "@/components/markdown-editor";
import { SettingsAdvancedTab } from "./settings-advanced-tab";
import { SettingsProfileTab } from "./settings-profile-tab";
import { SettingsPersonaTab } from "./settings-persona-tab";
import { SettingsOpenClawTab } from "./settings-openclaw-tab";
import { SettingsIntegrationsTab } from "./settings-integrations-tab";
import { SettingsToolsTab } from "./settings-tools-tab";
import { IntegrationConfigModal, IntegrationRow, MultiSelectChips, SectionHeader, SelectInput, SettingField, TagsInput, TextArea, TextInput, Toggle, TripleOptionSelector, resolveSelectedCalendarIds, resolveSelectedEmailIds, terminalQrToDataUri } from "./settings-components";
import { useTheme } from "@/components/theme-provider";
import { Compass, Ear, Scale, Heart, Zap, Check, Brain, Eye, Sparkles, MessageSquare, Clock, Shield, Users, BookOpen, Gauge, Swords, Smile, Target, Feather, AlertCircle, RefreshCw, RotateCcw, FolderOpen, Download, Trash2, Search, Hash } from "lucide-react";

type WhatsAppConnectionState = "idle" | "installing" | "connecting" | "pairing" | "waiting";
type Tab = "general" | "tools" | "integrations" | "profile" | "persona" | "openclaw" | "ai" | "advanced";
type PersonaSubTab = "essentials" | "approach" | "style" | "session" | "safety";
type ProfileSubTab = "basics" | "people" | "context";
type AuthState = "idle" | "launching" | "polling" | "done";
type AuthLaunchMode = "browser" | "terminal" | null;

const DEFAULT_PATHS = {
  wacli: "~/.wacli/wacli.db",
  transcription: defaultClawJsTranscriptionDbPath(),
};

/* ── main page ────────────────────────────────────────────────────── */

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { bootstrapData, ready: bootstrapReady, updateBootstrapData } = useAppBootstrap();
  const { locale, setLocale, languageOptions, messages } = useLocale();
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<UserConfig | null>(bootstrapData?.config ?? null);
  const [profileSections, setProfileSections] = useState<ProfileSection[]>(bootstrapData?.profileSections ?? []);
  const [activeProfileSectionId, setActiveProfileSectionId] = useState("");
  const [toolStatus, setToolStatus] = useState<IntegrationStatus | null>(bootstrapData?.toolStatus ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [resettingWorkspace, setResettingWorkspace] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    sessions: true,
    profile: true,
    contextFiles: true,
    transcriptions: true,
    settings: true,
    whatsappData: true,
    whatsappCli: true,
    emailAccounts: true,
    calendarAccounts: true,
    openClawWorkspace: true,
    openClawUninstall: false,
  });
  const [showEmailAccountsModal, setShowEmailAccountsModal] = useState(false);
  const [showWhatsAppConfigModal, setShowWhatsAppConfigModal] = useState(false);
  const [waChats, setWaChats] = useState<Array<{ name: string; isGroup: boolean; messageCount: number }>>([]);
  const [waChatsLoading, setWaChatsLoading] = useState(false);
  const [showCalendarConfigModal, setShowCalendarConfigModal] = useState(false);
  const [showTranscriptionConfigModal, setShowTranscriptionConfigModal] = useState(false);
  const [showTtsConfigModal, setShowTtsConfigModal] = useState(false);
  const [ttsCatalog, setTtsCatalog] = useState<TtsCatalog | null>(null);

  const [imageBackends, setImageBackends] = useState<Array<{
    id: string;
    label: string;
    available: boolean;
    reason?: string;
    supportedKinds: string[];
    supportedModels?: Array<{ id: string; label: string; default?: boolean }>;
    metadataSchema?: Array<{ key: string; label: string; type: "select" | "text" | "number"; options?: Array<{ value: string; label: string }>; default?: string; placeholder?: string }>;
  }>>([]);
  const [imageBackendsLoaded, setImageBackendsLoaded] = useState(false);
  const [showImageGenConfigModal, setShowImageGenConfigModal] = useState(false);

  const [apiKeyModalProvider, setApiKeyModalProvider] = useState<string | null>(null);
  const [oauthModalProvider, setOauthModalProvider] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "general";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [personaSubTab, setPersonaSubTab] = useState<PersonaSubTab>("essentials");
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>("basics");
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppConnectionState>("idle");
  const [whatsAppQrText, setWhatsAppQrText] = useState("");
  const [whatsAppAutoStarted, setWhatsAppAutoStarted] = useState(false);
  const [showWhatsAppQrModal, setShowWhatsAppQrModal] = useState(false);
  const [whatsAppInstallAttempted, setWhatsAppInstallAttempted] = useState(false);
  const [showWhatsAppDisconnectModal, setShowWhatsAppDisconnectModal] = useState(false);
  const [whatsAppDisconnecting, setWhatsAppDisconnecting] = useState<false | "keep" | "delete">(false);
  const [whatsAppUninstallCli, setWhatsAppUninstallCli] = useState(false);
  const [showTelegramConfigModal, setShowTelegramConfigModal] = useState(false);
  const [showTelegramDisconnectModal, setShowTelegramDisconnectModal] = useState(false);
  const [telegramDisconnecting, setTelegramDisconnecting] = useState<false | "keep" | "delete">(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestError, setTelegramTestError] = useState(false);
  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState("");
  const [telegramBotInfo, setTelegramBotInfo] = useState<{ username: string; name: string } | null>(null);
  const [showSlackConfigModal, setShowSlackConfigModal] = useState(false);
  const [showSlackDisconnectModal, setShowSlackDisconnectModal] = useState(false);
  const [slackDisconnecting, setSlackDisconnecting] = useState<false | "keep" | "delete">(false);
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestError, setSlackTestError] = useState(false);
  const [slackBotTokenInput, setSlackBotTokenInput] = useState("");
  const [slackBotInfo, setSlackBotInfo] = useState<{ username: string; teamName: string } | null>(null);
  const [openClawRefreshing, setOpenClawRefreshing] = useState(false);
  const [openClawRestarting, setOpenClawRestarting] = useState(false);
  const [openClawReinstalling, setOpenClawReinstalling] = useState(false);
  const [openClawUninstalling, setOpenClawUninstalling] = useState(false);
  const [showOpenClawUninstallModal, setShowOpenClawUninstallModal] = useState(false);
  const [showOpenClawUpdateModal, setShowOpenClawUpdateModal] = useState(false);
  const [showOpenClawDisableModal, setShowOpenClawDisableModal] = useState(false);
  const [openClawDisabling, setOpenClawDisabling] = useState(false);
  const [openClawCopied, setOpenClawCopied] = useState<string | null>(null);
  const [adapterBusy, setAdapterBusy] = useState<Record<string, "installing" | "uninstalling">>({});
  const [adapterProgress, setAdapterProgress] = useState<Record<string, { message: string; percent: number }>>({});
  const [openClawEnabled, setOpenClawEnabled] = useState<boolean | undefined>(
    bootstrapData ? bootstrapData.localSettings.openClawEnabled !== false : undefined
  );

  // Fetch WhatsApp chats when modal opens
  const fetchWhatsAppChats = useCallback(() => {
    return fetch("/api/integrations/whatsapp/chats")
      .then((r) => r.json())
      .then((data) => setWaChats(data.chats || []))
      .catch(() => setWaChats([]));
  }, []);

  const openWhatsAppConfigModal = useCallback(() => {
    setShowWhatsAppConfigModal(true);
    setWaChatsLoading(true);
    fetchWhatsAppChats().finally(() => setWaChatsLoading(false));
  }, [fetchWhatsAppChats]);

  // Poll for new chats while modal is open and syncing
  useEffect(() => {
    if (!showWhatsAppConfigModal || !toolStatus?.whatsapp.syncing) return;
    const poll = setInterval(() => { fetchWhatsAppChats(); }, 5000);
    return () => clearInterval(poll);
  }, [showWhatsAppConfigModal, toolStatus?.whatsapp.syncing, fetchWhatsAppChats]);

  // Advanced: workspace files
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ fileName: string; content: string }>>([]);
  const [activeWorkspaceFile, setActiveWorkspaceFile] = useState("");
  const [workspaceFilesSaving, setWorkspaceFilesSaving] = useState<Record<string, boolean>>({});
  const [workspaceFilesSaved, setWorkspaceFilesSaved] = useState<Record<string, boolean>>({});
  const [workspaceFilesLoaded, setWorkspaceFilesLoaded] = useState(false);

  // AI provider auth states, initialised from bootstrap so there's no flash
  const [oauthStates, setOauthStates] = useState<Record<string, AuthState>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    return {
      "openai-codex": hasConfirmedOAuthSubscription(p as Record<string, AiAuthSummary> | undefined, "openai-codex") ? "done" : "idle",
      "google-gemini-cli": hasConfirmedOAuthSubscription(p as Record<string, AiAuthSummary> | undefined, "google-gemini-cli") ? "done" : "idle",
      "kimi-coding": hasConfirmedOAuthSubscription(p as Record<string, AiAuthSummary> | undefined, "kimi-coding") ? "done" : "idle",
      "qwen": hasConfirmedOAuthSubscription(p as Record<string, AiAuthSummary> | undefined, "qwen") ? "done" : "idle",
    };
  });
  const [oauthLaunchModes, setOauthLaunchModes] = useState<Record<string, AuthLaunchMode>>({});
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [apiKeySaved, setApiKeySaved] = useState<Record<string, boolean>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    const saved: Record<string, boolean> = {};
    for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
      if (p?.[k]?.hasProfileApiKey) saved[k] = true;
    }
    return saved;
  });
  const [authTypes, setAuthTypes] = useState<Record<string, string | null>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    const types: Record<string, string | null> = {};
    for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
      types[k] = p?.[k]?.authType ?? null;
    }
    return types;
  });
  const [defaultModel, setDefaultModel] = useState(bootstrapData?.aiAuth?.defaultModel ?? "");
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, []);

  const refreshToolStatus = useCallback(async () => {
    const tools = await fetch("/api/integrations/status").then((r) => r.json()) as IntegrationStatus;
    setToolStatus(tools);
    updateBootstrapData((current) => ({
      ...current,
      toolStatus: tools,
    }));
    return tools;
  }, [updateBootstrapData]);

  useEffect(() => {
    if (bootstrapData) {
      if (!config) {
        setConfig(bootstrapData.config);
        setLocale(bootstrapData.config.locale);
      }
      if (profileSections.length === 0) {
        setProfileSections(bootstrapData.profileSections);
      }
      if (!toolStatus) {
        setToolStatus(bootstrapData.toolStatus);
      }
      if (!ttsCatalog) {
        fetch("/api/tts/providers")
          .then((response) => response.json())
          .then((tts) => setTtsCatalog(tts))
          .catch(() => {});
      }
      if (openClawEnabled === undefined) {
        setOpenClawEnabled(bootstrapData.localSettings.openClawEnabled !== false);
      }
      return;
    }

    if (!bootstrapReady) return;

    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/config/profile").then((r) => r.json()),
      refreshToolStatus(),
      fetch("/api/tts/providers").then((r) => r.json()).catch(() => null),
    ]).then(([cfg, prof, tools, tts]) => {
      setConfig(cfg);
      setLocale(cfg.locale);
      setProfileSections(Array.isArray(prof.sections) ? prof.sections : []);
      setToolStatus(tools);
      setTtsCatalog(tts);
    }).catch(() => setError("Failed to load settings"));
  }, [bootstrapData, bootstrapReady, config, profileSections.length, refreshToolStatus, setLocale, toolStatus, ttsCatalog, openClawEnabled]);

  useEffect(() => {
    if (profileSections.length === 0) return;
    if (!profileSections.some((section) => section.id === activeProfileSectionId)) {
      setActiveProfileSectionId(profileSections[0].id);
    }
  }, [activeProfileSectionId, profileSections]);

  useEffect(() => {
    if (toolStatus?.telegram.botConnected && toolStatus.telegram.botUsername) {
      setTelegramBotInfo({
        username: toolStatus.telegram.botUsername,
        name: config?.telegram?.botName || toolStatus.telegram.botUsername,
      });
    } else if (!toolStatus?.telegram.botConnected) {
      setTelegramBotInfo(null);
    }
  }, [config?.telegram?.botName, toolStatus?.telegram.botConnected, toolStatus?.telegram.botUsername]);

  useEffect(() => {
    if (toolStatus?.slack.botConnected && (toolStatus.slack.botUsername || toolStatus.slack.teamName)) {
      setSlackBotInfo({
        username: toolStatus.slack.botUsername || "configured",
        teamName: toolStatus.slack.teamName || "Connected workspace",
      });
    } else if (!toolStatus?.slack.botConnected) {
      setSlackBotInfo(null);
    }
  }, [toolStatus?.slack.botConnected, toolStatus?.slack.botUsername, toolStatus?.slack.teamName]);

  const loadImageBackends = useCallback(async () => {
    try {
      const res = await fetch("/api/images/backends");
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.backends ?? []).filter((b: { id: string }) => b.id !== "command");
        setImageBackends(filtered);
        // Auto-set default backend to first available if none configured
        if (!config?.imageGeneration?.defaultBackendId) {
          const firstAvailable = filtered.find((b: { available: boolean }) => b.available);
          if (firstAvailable) {
            updateConfig((c) => ({
              ...c,
              imageGeneration: { ...c.imageGeneration, defaultBackendId: firstAvailable.id },
            }));
          }
        }
      }
      setImageBackendsLoaded(true);
    } catch {
      setImageBackendsLoaded(true);
    }
  }, [config?.imageGeneration?.defaultBackendId]);

  // Load image backends when tools tab is opened
  useEffect(() => {
    if (tab === "tools" && !imageBackendsLoaded) {
      loadImageBackends();
    }
  }, [tab, imageBackendsLoaded, loadImageBackends]);

  // Auto-save: debounce 1s on any config or profileSections change
  useEffect(() => {
    if (!config) return;
    // Skip the initial load
    if (!configLoadedRef.current) {
      configLoadedRef.current = true;
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true); setError("");
      try {
        const [profRes, cfgRes] = await Promise.all([
          fetch("/api/config/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profileConfig: {
                displayName: config.displayName,
                profileBasics: config.profileBasics || {
                  age: "",
                  gender: "",
                  location: "",
                  occupation: "",
                },
                profileFile: config.profileFile,
              },
              sections: profileSections.map((section) => ({
                id: section.id,
                content: section.content,
              })),
            }),
          }),
          fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          }),
        ]);
        if (!cfgRes.ok || !profRes.ok) throw new Error("Save failed");
        updateBootstrapData((current) => ({
          ...current,
          config,
          profileSections,
        }));
        flashSaved();
      } catch { setError(messages.settings.errors.save); }
      setSaving(false);
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, profileSections]);

  const updateConfig = useCallback((updater: (c: UserConfig) => UserConfig) => {
    setConfig((prev) => prev ? updater({ ...prev }) : prev);
  }, []);

  const syncLocaleState = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    updateConfig((current) => ({ ...current, locale: nextLocale }));
    updateBootstrapData((current) => ({
      ...current,
      config: {
        ...current.config,
        locale: nextLocale,
      },
    }));
  }, [setLocale, updateBootstrapData, updateConfig]);

  const applyLocale = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale) return;

    const previousLocale = locale;
    setError("");
    syncLocaleState(nextLocale);

    try {
      const response = await fetch("/api/config/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) {
        throw new Error("Failed to save locale");
      }
      flashSaved();
    } catch {
      syncLocaleState(previousLocale);
      setError(messages.settings.errors.save);
    }
  }, [flashSaved, locale, messages.settings.errors.save, syncLocaleState]);

  const resetWorkspace = useCallback(async () => {
    setResettingWorkspace(true);
    setError("");

    try {
      const response = await fetch("/api/config/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetOptions),
      });

      if (!response.ok) {
        throw new Error("Failed to reset workspace");
      }

      window.location.assign("/");
    } catch {
      setResettingWorkspace(false);
      setShowResetModal(false);
      setError(messages.settings.errors.reset);
    }
  }, [messages.settings.errors.reset, resetOptions]);

  // ── AI provider: silent background refresh when entering tab ──
  useEffect(() => {
    if (tab !== "ai") return;
    fetch("/api/integrations/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultModel) setDefaultModel(data.defaultModel);
        setOauthStates((prev) => {
          const next = { ...prev };
          if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "openai-codex")) next["openai-codex"] = prev["openai-codex"] === "idle" ? "done" : prev["openai-codex"];
          if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "google-gemini-cli")) next["google-gemini-cli"] = prev["google-gemini-cli"] === "idle" ? "done" : prev["google-gemini-cli"];
          if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "kimi-coding")) next["kimi-coding"] = prev["kimi-coding"] === "idle" ? "done" : prev["kimi-coding"];
          if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "qwen")) next["qwen"] = prev["qwen"] === "idle" ? "done" : prev["qwen"];
          return next;
        });
        setApiKeySaved((prev) => {
          const next = { ...prev };
          for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
            if (data.providers?.[k]?.hasProfileApiKey) next[k] = true;
          }
          return next;
        });
      })
      .catch(() => {});
  }, [tab]);

  // Clean up auth poll on unmount
  useEffect(() => {
    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
    };
  }, []);

  // ── Advanced: load workspace files ──
  useEffect(() => {
    if (tab !== "advanced" || workspaceFilesLoaded) return;
    fetch("/api/config/workspace-files")
      .then((r) => r.json())
      .then((data: { files?: Array<{ fileName: string; content: string }> }) => {
        if (Array.isArray(data.files)) {
          setWorkspaceFiles(data.files);
          if (data.files.length > 0 && !activeWorkspaceFile) {
            setActiveWorkspaceFile(data.files[0].fileName);
          }
          setWorkspaceFilesLoaded(true);
        }
      })
      .catch(() => {});
  }, [tab, workspaceFilesLoaded, activeWorkspaceFile]);

  const saveWorkspaceFile = useCallback(async (fileName: string, content: string) => {
    setWorkspaceFilesSaving((prev) => ({ ...prev, [fileName]: true }));
    try {
      const res = await fetch("/api/config/workspace-files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, content }),
      });
      if (res.ok) {
        setWorkspaceFilesSaved((prev) => ({ ...prev, [fileName]: true }));
        setTimeout(() => setWorkspaceFilesSaved((prev) => ({ ...prev, [fileName]: false })), 3000);
      }
    } catch { /* ignore */ }
    setWorkspaceFilesSaving((prev) => ({ ...prev, [fileName]: false }));
  }, []);

  // ── OAuth launch handler ──
  const launchOAuth = useCallback(async (provider: string) => {
    setOauthStates((prev) => ({ ...prev, [provider]: "launching" as AuthState }));
    setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "oauth", provider }),
      });
      const data = await res.json();
      if (!data.ok) {
        setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
        setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
        return;
      }

      if (data.connected) {
        setOauthStates((prev) => ({ ...prev, [provider]: "done" as AuthState }));
        setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
        if (data.model) {
          setDefaultModel(data.model);
        }
        await refreshToolStatus();
        return;
      }

      setOauthLaunchModes((prev) => ({ ...prev, [provider]: data.launchMode === "terminal" ? "terminal" : "browser" }));
      setOauthStates((prev) => ({ ...prev, [provider]: "polling" as AuthState }));

      if (authPollRef.current) clearInterval(authPollRef.current);
      let pollCount = 0;
      authPollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > 20) { // ~60s timeout
          if (authPollRef.current) clearInterval(authPollRef.current);
          authPollRef.current = null;
          setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
          setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
          return;
        }
        try {
          const statusRes = await fetch("/api/integrations/auth");
          const statusData = await statusRes.json();
          if (hasConfirmedOAuthSubscription(statusData.providers as Record<string, AiAuthSummary> | undefined, provider)) {
            if (authPollRef.current) clearInterval(authPollRef.current);
            authPollRef.current = null;
            setOauthStates((prev) => ({ ...prev, [provider]: "done" as AuthState }));
            setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
            if (statusData.defaultModel) {
              setDefaultModel(statusData.defaultModel);
            } else {
              // First provider connected, auto-set as default
              try {
                const setRes = await fetch("/api/integrations/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "set-default", model: provider }),
                });
                const setData = await setRes.json();
                if (setData.ok) setDefaultModel(setData.model ?? provider);
              } catch { /* ignore */ }
            }
            await refreshToolStatus();
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
      setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
    }
  }, [refreshToolStatus]);

  // ── API key save handler ──
  const saveApiKey = useCallback(async (provider: string, key: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apikey", provider, key }),
      });
      const data = await res.json();
      if (data.ok) {
        setApiKeySaved((prev) => ({ ...prev, [provider]: true }));
        setApiKeyValues((prev) => ({ ...prev, [provider]: "" }));
        // Auto-set as default if no model is configured yet
        if (!defaultModel) {
          try {
            const setRes = await fetch("/api/integrations/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "set-default", model: provider }),
            });
            const setData = await setRes.json();
            if (setData.ok) setDefaultModel(setData.model ?? provider);
          } catch { /* ignore */ }
        }
        await refreshToolStatus();
        flashSaved();
      }
    } catch { /* ignore */ }
  }, [refreshToolStatus, flashSaved, defaultModel]);

  // ── Remove auth handler ──
  const removeAuth = useCallback(async (provider: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", provider }),
      });
      const data = await res.json();
      if (data.ok) {
        setApiKeySaved((prev) => ({ ...prev, [provider]: false }));
        setApiKeyValues((prev) => ({ ...prev, [provider]: "" }));
        setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
        setOauthLaunchModes((prev) => ({ ...prev, [provider]: null }));
        await refreshToolStatus();
        flashSaved();
      }
    } catch { /* ignore */ }
  }, [refreshToolStatus, flashSaved]);

  // ── Set default model handler ──
  const handleSetDefault = useCallback(async (model: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", model }),
      });
      const data = await res.json();
      if (data.ok) setDefaultModel(data.model ?? model);
    } catch { /* ignore */ }
  }, []);

  const groupedProfileSections = profileSections.reduce<Array<{ group: string; sections: ProfileSection[] }>>((groups, section) => {
    const existing = groups.find((entry) => entry.group === section.group);
    if (existing) {
      existing.sections.push(section);
      return groups;
    }

    groups.push({ group: section.group, sections: [section] });
    return groups;
  }, []);

  const activeProfileSection = profileSections.find((section) => section.id === activeProfileSectionId) || null;

  const installWacli = useCallback(async () => {
    const res = await fetch("/api/integrations/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: "wacli" }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error (${res.status})`);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.output || data.error || "Installation failed");
    await refreshToolStatus();
  }, [refreshToolStatus]);

  const connectWhatsApp = useCallback(async (showSavedState: boolean) => {
    const res = await fetch("/api/integrations/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Connection failed");

    setToolStatus((prev) => prev ? { ...prev, whatsapp: data.integration } : prev);
    setWhatsAppState(data.state === "connected" || data.state === "disabled" ? "idle" : data.state);
    setWhatsAppQrText(data.qrText || "");
    if (showSavedState) {
      flashSaved();
    }
  }, [flashSaved]);

  const handleWhatsAppEnable = useCallback(async () => {
    updateConfig((c) => ({
      ...c,
      dataSources: { ...c.dataSources, wacliDbPath: DEFAULT_PATHS.wacli },
    }));
    setError("");
    setWhatsAppQrText("");
    setWhatsAppAutoStarted(true);

    const needsInstall = !toolStatus?.whatsapp.installed;
    if (needsInstall) {
      setWhatsAppState("installing");
      setWhatsAppInstallAttempted(true);
      try {
        await installWacli();
        await refreshToolStatus();
      } catch {
        setWhatsAppState("idle");
        setError(messages.settings.integrations.whatsapp.installFailed);
        return;
      }
    }
    setWhatsAppState("connecting");
    try {
      await connectWhatsApp(true);
    } catch (e) {
      setWhatsAppState("waiting");
      setWhatsAppQrText("");
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    }
  }, [connectWhatsApp, installWacli, messages.settings.errors.updateWhatsApp, messages.settings.integrations.whatsapp.installFailed, refreshToolStatus, toolStatus, updateConfig]);

  const handleWhatsAppDisable = useCallback(async (deleteData: boolean, uninstallCli: boolean) => {
    setWhatsAppDisconnecting(deleteData ? "delete" : "keep");
    try {
      if (deleteData || uninstallCli) {
        await fetch("/api/integrations/whatsapp/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteData, uninstallCli }),
        });
      } else {
        await fetch("/api/integrations/whatsapp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
      }

      updateConfig((c) => ({
        ...c,
        dataSources: { ...c.dataSources, wacliDbPath: "" },
      }));
      setWhatsAppState("idle");
      setWhatsAppQrText("");
      setWhatsAppAutoStarted(false);
      setWhatsAppInstallAttempted(false);
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    } finally {
      setWhatsAppDisconnecting(false);
      setShowWhatsAppDisconnectModal(false);
      setWhatsAppUninstallCli(false);
    }
  }, [flashSaved, messages.settings.errors.updateWhatsApp, refreshToolStatus, updateConfig]);

  const handleWhatsAppToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      handleWhatsAppEnable();
    } else {
      setShowWhatsAppDisconnectModal(true);
    }
  }, [handleWhatsAppEnable]);

  const handleTelegramToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      updateConfig((c) => ({
        ...c,
        telegram: { ...c.telegram, enabled: true },
      }));
      setTelegramBotTokenInput("");
      setTelegramTestError(false);
      setShowTelegramConfigModal(true);
    } else {
      setShowTelegramDisconnectModal(true);
    }
  }, [updateConfig]);

  const handleTelegramTestConnection = useCallback(async (token: string) => {
    setTelegramTesting(true);
    setTelegramTestError(false);
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.state === "connected") {
        setTelegramBotInfo({ username: data.botUsername, name: data.botName });
        setTelegramBotTokenInput("");
        updateConfig((c) => ({
          ...c,
          telegram: {
            ...c.telegram,
            enabled: true,
            botToken: "",
            botName: data.botName,
            botUsername: data.botUsername,
          },
        }));
        await refreshToolStatus();
      } else {
        setTelegramTestError(true);
      }
    } catch {
      setTelegramTestError(true);
    } finally {
      setTelegramTesting(false);
    }
  }, [refreshToolStatus, updateConfig]);

  const handleTelegramDisable = useCallback(async (deleteToken: boolean) => {
    setTelegramDisconnecting(deleteToken ? "delete" : "keep");
    try {
      await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteToken ? { botToken: null } : { enabled: false }),
      });
      if (deleteToken) {
        updateConfig((c) => ({
          ...c,
          telegram: {
            enabled: false,
            botToken: "",
            botName: "",
            botUsername: "",
            allowedChatIds: [],
            syncMessages: false,
          },
        }));
        setTelegramBotInfo(null);
      } else {
        updateConfig((c) => ({
          ...c,
          telegram: { ...c.telegram, enabled: false },
        }));
      }
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable Telegram");
    } finally {
      setTelegramDisconnecting(false);
      setShowTelegramDisconnectModal(false);
    }
  }, [flashSaved, refreshToolStatus, updateConfig]);

  const handleSlackToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      updateConfig((c) => ({
        ...c,
        slack: { ...c.slack, enabled: true },
      }));
      setSlackBotTokenInput("");
      setSlackTestError(false);
      setShowSlackConfigModal(true);
    } else {
      setShowSlackDisconnectModal(true);
    }
  }, [updateConfig]);

  const handleSlackTestConnection = useCallback(async (token: string) => {
    setSlackTesting(true);
    setSlackTestError(false);
    try {
      const res = await fetch("/api/integrations/slack/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.state === "connected") {
        setSlackBotInfo({ username: data.botUsername, teamName: data.teamName });
        setSlackBotTokenInput("");
        updateConfig((c) => ({
          ...c,
          slack: {
            ...c.slack,
            enabled: true,
            botToken: "",
            botUsername: data.botUsername,
            teamName: data.teamName,
          },
        }));
        await refreshToolStatus();
      } else {
        setSlackTestError(true);
      }
    } catch {
      setSlackTestError(true);
    } finally {
      setSlackTesting(false);
    }
  }, [refreshToolStatus, updateConfig]);

  const handleSlackDisable = useCallback(async (deleteToken: boolean) => {
    setSlackDisconnecting(deleteToken ? "delete" : "keep");
    try {
      await fetch("/api/integrations/slack/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteToken ? { botToken: null } : { enabled: false }),
      });
      if (deleteToken) {
        updateConfig((c) => ({
          ...c,
          slack: {
            enabled: false,
            botToken: "",
            botUsername: "",
            teamName: "",
            allowedChannelIds: [],
            syncMessages: false,
          },
        }));
        setSlackBotInfo(null);
      } else {
        updateConfig((c) => ({
          ...c,
          slack: { ...c.slack, enabled: false },
        }));
      }
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable Slack");
    } finally {
      setSlackDisconnecting(false);
      setShowSlackDisconnectModal(false);
    }
  }, [flashSaved, refreshToolStatus, updateConfig]);

  useEffect(() => {
    if (!config?.dataSources.wacliDbPath || whatsAppState === "connecting" || whatsAppState === "installing") return;

    if (toolStatus?.whatsapp.authenticated) {
      setWhatsAppState("idle");
      setWhatsAppQrText("");
      setShowWhatsAppQrModal(false);
      return;
    }

    if (toolStatus && !toolStatus.whatsapp.installed) {
      if (whatsAppInstallAttempted) return; // Don't retry if install already failed
      // Auto-install instead of showing needs-app
      setWhatsAppInstallAttempted(true);
      setWhatsAppState("installing");
      installWacli()
        .then(() => {
          setWhatsAppState("connecting");
          return connectWhatsApp(false);
        })
        .catch(() => {
          setWhatsAppState("idle");
        });
      return;
    }

    if (toolStatus?.whatsapp.authInProgress) {
      if (toolStatus.whatsapp.qrText) {
        setWhatsAppQrText(toolStatus.whatsapp.qrText);
      }
      setWhatsAppState((whatsAppQrText || toolStatus.whatsapp.qrText) ? "pairing" : "waiting");
    } else if (toolStatus?.whatsapp.lastError) {
      setWhatsAppState("waiting");
    }

    const poll = setInterval(async () => {
      try {
        const tools = await refreshToolStatus();
        if (tools.whatsapp.authenticated) {
          setWhatsAppState("idle");
          setWhatsAppQrText("");
          setShowWhatsAppQrModal(false);
        } else if (tools.whatsapp.authInProgress) {
          if (tools.whatsapp.qrText) {
            setWhatsAppQrText(tools.whatsapp.qrText);
          }
          setWhatsAppState((whatsAppQrText || tools.whatsapp.qrText) ? "pairing" : "waiting");
        } else if (tools.whatsapp.lastError) {
          setWhatsAppState("waiting");
        }
      } catch {
        // Keep the last visible state; polling is best-effort only.
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [config, connectWhatsApp, installWacli, refreshToolStatus, toolStatus, whatsAppInstallAttempted, whatsAppQrText, whatsAppState]);

  useEffect(() => {
    if (!config?.dataSources.wacliDbPath) {
      setWhatsAppAutoStarted(false);
      return;
    }

    const shouldAutoConnect = !toolStatus?.whatsapp.authenticated
      && !whatsAppQrText
      && !whatsAppAutoStarted
      && whatsAppState !== "connecting"
      && whatsAppState !== "installing";

    if (!shouldAutoConnect) return;

    setWhatsAppAutoStarted(true);
    setWhatsAppState("connecting");

    connectWhatsApp(false).catch((e) => {
      setWhatsAppState("waiting");
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    });
  }, [config, connectWhatsApp, messages.settings.errors.updateWhatsApp, toolStatus, whatsAppAutoStarted, whatsAppQrText, whatsAppState]);

  // Auto-open QR modal when QR appears, auto-close when connected
  useEffect(() => {
    if (whatsAppQrText) setShowWhatsAppQrModal(true);
  }, [whatsAppQrText]);

  useEffect(() => {
    if (toolStatus?.whatsapp.authenticated) setShowWhatsAppQrModal(false);
  }, [toolStatus?.whatsapp.authenticated]);

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">{error || messages.common.loading}</div>
      </div>
    );
  }

  /* ── derived integration states ── */

  const whatsappEnabled = !!config.dataSources.wacliDbPath;
  const emailEnabled = config.emailAccounts.length > 0;
  const calendarEnabled = (config.calendarAccounts || []).length > 0 && !(config.calendarAccounts || []).includes(NONE_CALENDARS_ID);
  const transcriptionEnabled = !!config.dataSources.transcriptionDbPath;
  const whatsappReady = !!toolStatus?.whatsapp.authenticated;
  const whatsAppQrImage = terminalQrToDataUri(whatsAppQrText);
  const emailOptions = toolStatus?.email.accounts || [];
  const selectedEmailIds = resolveSelectedEmailIds(config.emailAccounts, emailOptions);
  const allEmailSelected = config.emailAccounts.includes(ALL_EMAIL_ACCOUNTS_ID)
    || (emailOptions.length > 0 && selectedEmailIds.length === emailOptions.length);
  const calendarOptions = toolStatus?.calendar.calendars || [];
  const selectedCalendarIds = resolveSelectedCalendarIds(config.calendarAccounts || [], calendarOptions);
  const allCalendarSelected = (config.calendarAccounts || []).includes(ALL_CALENDARS_ID)
    || (calendarOptions.length > 0 && selectedCalendarIds.length === calendarOptions.length);

  const whatsappSyncing = !!toolStatus?.whatsapp.syncing;
  const whatsappStatus = !whatsappEnabled ? "disabled"
    : whatsAppState === "installing" ? "installing"
    : whatsAppState === "connecting" ? "connecting"
    : whatsappReady && whatsappSyncing ? "syncing"
    : whatsappReady ? "connected"
    : whatsAppQrText || whatsAppState === "pairing" ? "pairing" : "waiting";

  const emailStatus = !emailEnabled ? "disabled"
    : toolStatus?.email.available ? "connected" : "waiting";

  const calendarStatus = !calendarEnabled ? "disabled"
    : toolStatus?.calendar.available ? "connected" : "waiting";

  const transcriptionWhisperReady = !!(toolStatus?.transcription as { whisperCliAvailable?: boolean; whisperAvailable?: boolean })?.whisperCliAvailable
    || !!(toolStatus?.transcription as { whisperCliAvailable?: boolean; whisperAvailable?: boolean })?.whisperAvailable;
  const transcriptionStatus = !transcriptionEnabled ? "disabled"
    : transcriptionWhisperReady ? "connected" : "waiting";
  const selectedTtsProviderId = (config.tts?.provider || "local") as TtsProvider;
  const selectedTtsProvider = ttsCatalog?.providers.find((provider) => provider.id === selectedTtsProviderId) ?? null;
  const ttsProviderLabel = ttsCatalog?.providers.find((provider) => provider.id === selectedTtsProviderId)?.label
    ?? selectedTtsProviderId;
  const ttsConfigMissingApiKey = !!selectedTtsProvider?.requiresApiKey && !config.tts?.apiKey?.trim();
  const ttsProviderOptions = (ttsCatalog?.providers ?? []).map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));

  const telegramEnabled = !!config.telegram?.enabled;
  const telegramConnected = !!toolStatus?.telegram.botConnected;
  const telegramStatus: "connected" | "disabled" | "waiting" = !telegramEnabled ? "disabled"
    : telegramConnected ? "connected" : "waiting";

  const slackEnabled = !!config.slack?.enabled;
  const slackStatus = !slackEnabled ? "disabled" as const
    : toolStatus?.slack.botConnected ? "connected" as const
    : "disabled" as const;

  const m = messages.onboarding.aiProvider;

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: messages.settings.tabs.general },
    { key: "profile", label: messages.settings.tabs.profile },
    { key: "persona", label: messages.settings.tabs.persona },
    { key: "tools", label: messages.settings.tabs.tools },
    { key: "integrations", label: messages.settings.tabs.integrations },
    { key: "openclaw", label: messages.settings.tabs.openclaw },
    { key: "ai", label: messages.settings.tabs.ai },
    { key: "advanced", label: messages.settings.tabs.advanced },
  ];

  const updateTtsConfigField = (
    field: TtsConfigFieldDescriptor,
    rawValue: string | number | boolean,
  ) => {
    updateConfig((current) => {
      const nextTts: TtsProviderConfig = {
        ...(current.tts ?? {}),
        provider: (current.tts?.provider || "local") as TtsProvider,
      };

      if (field.key === "speed" || field.key === "stability" || field.key === "similarityBoost") {
        const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
        nextTts[field.key] = Number.isFinite(parsed) ? parsed : undefined;
      } else if (field.key === "enabled" || field.key === "autoRead") {
        nextTts[field.key] = Boolean(rawValue);
      } else {
        nextTts[field.key] = String(rawValue);
      }

      return {
        ...current,
        tts: nextTts as UserConfig["tts"],
      };
    });
  };

  const renderTtsField = (provider: TtsProviderDescriptor, field: TtsConfigFieldDescriptor) => {
    const rawValue = config.tts?.[field.key];
    const fallbackValue = field.defaultValue;
    const currentValue = rawValue ?? fallbackValue ?? "";
    const key = `${provider.id}-${field.key}`;

    if (field.type === "password" || field.type === "text") {
      return (
        <SettingField key={key} label={field.label}>
          <input
            type={field.type === "password" ? "password" : "text"}
            value={typeof currentValue === "string" ? currentValue : String(currentValue)}
            onChange={(e) => updateTtsConfigField(field, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
          />
        </SettingField>
      );
    }

    if (field.type === "select") {
      return (
        <SettingField key={key} label={field.label}>
          <SelectInput
            value={String(currentValue)}
            onChange={(value) => updateTtsConfigField(field, value)}
            options={(field.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </SettingField>
      );
    }

    if (field.type === "number") {
      return (
        <SettingField key={key} label={field.label}>
          <input
            type="number"
            value={typeof currentValue === "number" ? String(currentValue) : String(currentValue || "")}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => updateTtsConfigField(field, e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
          />
        </SettingField>
      );
    }

    return null;
  };


  return (
    <div className="h-full overflow-y-auto bg-background" style={{ scrollbarGutter: "stable" }} data-testid="settings-page">
      {/* Header area */}
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-2">
        {/* Back + save row */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-tertiary-foreground hover:text-foreground transition-all text-[13px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {messages.nav.back}
          </button>
          <div className="flex items-center gap-3">
            {saving && <span className="text-tertiary-foreground text-xs">{messages.common.saving}</span>}
            {error && <span className="text-amber-600 text-xs">{error}</span>}
          </div>
        </div>

        {/* Large title */}
        <h1
          className="text-3xl font-light text-foreground tracking-tight mb-8"
        >
          {messages.settings.title}
        </h1>

        {/* Segmented pill selector */}
        <div className="inline-flex bg-muted rounded-xl p-1 mb-10">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`settings-tab-${t.key}`}
              className={`px-3 py-1.5 rounded-[10px] text-[12.5px] whitespace-nowrap transition-all ${
                tab === t.key
                  ? "bg-card text-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-tertiary-foreground hover:text-strong-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16">

        {/* ── GENERAL TAB ─────────────────────────────────────────── */}
        {tab === "general" && (
          <div className="space-y-4">
            {/* Language card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="px-4 py-4">
                <SettingField
                  label={messages.settings.language.selectorLabel}
                  hint={messages.settings.language.help}
                >
                  <select
                    value={locale}
                    onChange={(e) => { void applyLocale(e.currentTarget.value as Locale); }}
                    data-testid="settings-locale-select"
                    className="w-full max-w-xs bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </SettingField>
              </div>
            </div>

            {/* Theme card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="px-4 py-4">
                <SettingField
                  label={localized(locale, { en: "Theme", es: "Tema", fr: "Thème", it: "Tema", de: "Design", pt: "Tema" })}
                  hint={localized(locale, { en: "Choose light, dark, or match your system", es: "Elige claro, oscuro, o sigue tu sistema", fr: "Choisissez clair, sombre ou selon votre système", it: "Scegli chiaro, scuro o in base al sistema", de: "Wähle hell, dunkel oder passend zum System", pt: "Escolha claro, escuro ou de acordo com o sistema" })}
                >
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.currentTarget.value as "light" | "dark" | "system")}
                    className="w-full max-w-xs bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  >
                    <option value="system">{localized(locale, { en: "System", es: "Sistema", fr: "Système", it: "Sistema", de: "System", pt: "Sistema" })}</option>
                    <option value="light">{localized(locale, { en: "Light", es: "Claro", fr: "Clair", it: "Chiaro", de: "Hell", pt: "Claro" })}</option>
                    <option value="dark">{localized(locale, { en: "Dark", es: "Oscuro", fr: "Sombre", it: "Scuro", de: "Dunkel", pt: "Escuro" })}</option>
                  </select>
                </SettingField>
              </div>
            </div>

            {/* Reset card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-xs font-medium text-strong-foreground">{messages.settings.general.resetAction}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.general.resetModalDescription}</p>
                </div>
                <button
                  type="button"
                  data-testid="reset-workspace-button"
                  onClick={() => setShowResetModal(true)}
                  className="h-8 shrink-0 rounded-lg border border-border px-3.5 text-xs font-medium text-strong-foreground hover:bg-muted hover:border-border-hover transition-colors"
                >
                  {messages.settings.general.resetAction}
                </button>
              </div>
            </div>

            {showResetModal && (() => {
              // openClawUninstall is opt-in only, excluded from select-all logic
              const { openClawUninstall: _ocu, ...safeOptions } = resetOptions;
              const allSelected = Object.values(safeOptions).every(Boolean);
              const noneSelected = Object.values(resetOptions).every(v => !v);
              const rc = messages.settings.general.resetCategories;
              const categories = [
                { key: "sessions" as const, label: rc.conversations, desc: rc.conversationsDesc },
                { key: "profile" as const, label: rc.profile, desc: rc.profileDesc },
                { key: "contextFiles" as const, label: rc.contextFiles, desc: rc.contextFilesDesc },
                { key: "transcriptions" as const, label: rc.transcriptions, desc: rc.transcriptionsDesc },
                { key: "whatsappData" as const, label: rc.whatsappData, desc: rc.whatsappDataDesc },
                { key: "whatsappCli" as const, label: rc.whatsappCli, desc: rc.whatsappCliDesc },
                { key: "emailAccounts" as const, label: rc.emailAccounts, desc: rc.emailAccountsDesc },
                { key: "calendarAccounts" as const, label: rc.calendarAccounts, desc: rc.calendarAccountsDesc },
                { key: "openClawWorkspace" as const, label: rc.openClawWorkspace, desc: rc.openClawWorkspaceDesc },
                { key: "openClawUninstall" as const, label: rc.openClawUninstall, desc: rc.openClawUninstallDesc },
                { key: "settings" as const, label: rc.settings, desc: rc.settingsDesc },
              ];
              return (
                <>
                  <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !resettingWorkspace && setShowResetModal(false)} />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !resettingWorkspace && setShowResetModal(false)}>
                    <div
                      className="mx-4 w-full max-w-[400px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                      style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-[16px] font-semibold text-foreground mb-1">
                        {messages.settings.general.resetModalTitle}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-tertiary-foreground mb-4">
                        {messages.settings.general.resetModalDescription}
                      </p>

                      <label className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg cursor-pointer hover:bg-background transition-colors">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            const next = !allSelected;
                            setResetOptions(prev => ({ sessions: next, profile: next, contextFiles: next, transcriptions: next, settings: next, whatsappData: next, whatsappCli: next, emailAccounts: next, calendarAccounts: next, openClawWorkspace: next, openClawUninstall: prev.openClawUninstall }));
                          }}
                          className="sr-only"
                        />
                        <div className={`w-[15px] h-[15px] rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                          allSelected ? "bg-foreground border-foreground" : "bg-card border-muted-foreground"
                        }`}>
                          {allSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                        </div>
                        <span className="text-[13px] font-medium text-foreground">{messages.settings.general.resetSelectAll}</span>
                      </label>

                      <div className="border-t border-border mb-1" />

                      <div className="max-h-[340px] overflow-y-auto">
                        {categories.map(({ key, label, desc }) => (
                          <label key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-background transition-colors">
                            <input
                              type="checkbox"
                              checked={resetOptions[key]}
                              onChange={() => setResetOptions(prev => ({ ...prev, [key]: !prev[key] }))}
                              className="sr-only"
                            />
                            <div className={`mt-[3px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                              resetOptions[key] ? "bg-foreground border-foreground" : "bg-card border-muted-foreground"
                            }`}>
                              {resetOptions[key] && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-foreground leading-tight">{label}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
                        {localized(locale, {
                          en: "Data already sent to AI providers during chat sessions cannot be deleted from their systems.",
                          es: "Los datos ya enviados a proveedores de IA durante las sesiones no pueden eliminarse de sus sistemas.",
                          fr: "Les données déjà envoyées aux fournisseurs d'IA pendant les sessions de chat ne peuvent pas être supprimées de leurs systèmes.",
                          it: "I dati già inviati ai fornitori di IA durante le sessioni di chat non possono essere eliminati dai loro sistemi.",
                          de: "Daten, die während Chat-Sitzungen bereits an KI-Anbieter gesendet wurden, können nicht aus deren Systemen gelöscht werden.",
                          pt: "Os dados já enviados a fornecedores de IA durante as sessões de chat não podem ser eliminados dos respetivos sistemas.",
                        })}
                      </p>

                      <div className="flex gap-2.5 justify-end mt-4">
                        <button
                          type="button"
                          onClick={() => setShowResetModal(false)}
                          disabled={resettingWorkspace}
                          data-testid="reset-workspace-cancel"
                          className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                        >
                          {messages.settings.general.resetModalCancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void resetWorkspace(); }}
                          disabled={resettingWorkspace || noneSelected}
                          data-testid="reset-workspace-confirm"
                          className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-50"
                        >
                          {resettingWorkspace
                            ? messages.settings.general.resetBusy
                            : allSelected
                              ? messages.settings.general.resetModalConfirmAll
                              : messages.settings.general.resetModalConfirm}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── OPENCLAW TAB ──────────────────────────────────────── */}
        {tab === "openclaw" && (
          <SettingsOpenClawTab
            toolStatus={toolStatus}
            openClawEnabled={openClawEnabled}
            setOpenClawEnabled={setOpenClawEnabled}
            openClawRefreshing={openClawRefreshing}
            setOpenClawRefreshing={setOpenClawRefreshing}
            openClawRestarting={openClawRestarting}
            setOpenClawRestarting={setOpenClawRestarting}
            openClawReinstalling={openClawReinstalling}
            setOpenClawReinstalling={setOpenClawReinstalling}
            openClawUninstalling={openClawUninstalling}
            setOpenClawUninstalling={setOpenClawUninstalling}
            showOpenClawUninstallModal={showOpenClawUninstallModal}
            setShowOpenClawUninstallModal={setShowOpenClawUninstallModal}
            showOpenClawUpdateModal={showOpenClawUpdateModal}
            setShowOpenClawUpdateModal={setShowOpenClawUpdateModal}
            showOpenClawDisableModal={showOpenClawDisableModal}
            setShowOpenClawDisableModal={setShowOpenClawDisableModal}
            openClawDisabling={openClawDisabling}
            setOpenClawDisabling={setOpenClawDisabling}
            openClawCopied={openClawCopied}
            setOpenClawCopied={setOpenClawCopied}
            adapterBusy={adapterBusy}
            setAdapterBusy={setAdapterBusy}
            adapterProgress={adapterProgress}
            setAdapterProgress={setAdapterProgress}
            bootstrapData={bootstrapData}
            updateBootstrapData={updateBootstrapData}
            refreshToolStatus={refreshToolStatus}
            flashSaved={flashSaved}
            setError={setError}
            messages={messages}
          />
        )}

        {/* ── AI TAB ────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground mb-4">
              {m.subtitle}
            </p>

            {(() => {
              const icons: Record<string, React.ReactNode> = {
                "openai-codex": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
                "google-gemini-cli": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>,
                anthropic: <svg width="17" height="17" viewBox="0 0 248 248" fill="currentColor"><path d="M52.43 162.87l46.35-25.99.77-2.28-.77-1.27h-2.29l-7.77-.47-26.49-.71-22.92-.95-22.29-1.18-5.6-1.18L6.2 121.87l.51-3.43 4.71-3.19 6.75.59 14.9 1.06 22.41 1.54 16.18.94 24.07 2.48h3.82l.51-1.54-1.27-.94-1.02-.95-23.18-15.72-25.09-16.54-13.12-9.57-7-4.84-3.57-4.49-1.53-9.93 6.37-6.99 8.66.59 2.16.59 8.79 6.74 18.72 14.53 24.45 17.96 3.57 2.95 1.44-.97.22-.68-1.66-2.72-13.24-23.99-14.14-24.46-6.37-10.16-1.65-6.03c-.65-2.53-1.02-4.62-1.02-7.2l7.26-9.93 4.07-1.3 9.81 1.3 4.07 3.54 6.12 13.94 9.81 21.86 15.28 29.77 4.46 8.86 2.42 8.15.89 2.48h1.53v-1.42l1.27-16.78 2.3-20.56 2.29-26.47.76-7.44 3.7-8.98 7.38-4.84 5.73 2.72 4.71 6.73-.64 4.37-2.8 18.2-5.48 28.47-3.57 19.14h2.04l2.42-2.48 9.68-12.76 16.17-20.32 7.14-8.04 8.4-8.86 5.35-3.25h10.19l7.39 11.11-3.31 11.46-10.44 13.23-8.66 11.22-12.42 16.64-7.69 13.38.69 1.1 1.86-.16 27.98-6.03 15.16-2.72 18.08-3.07 8.15 3.78.89 3.9-3.18 7.92-19.36 4.73-22.67 4.6-33.76 7.95-.37.3.44.65 15.22 1.38 6.5.35h15.92l29.67 2.25 7.77 5.08 4.58 6.26-.76 4.84-11.97 6.03-16.05-3.78-37.57-8.98-12.86-3.19h-1.78v1.06l10.7 10.52 19.74 17.72 24.58 22.92 1.27 5.67-3.18 4.49-3.31-.47-21.65-16.31-8.4-7.32-18.85-15.95h-1.27v1.65l4.33 6.38 23.05 34.62 1.15 10.63-1.66 3.43-5.98 2.13-6.5-1.18-13.62-19.02-13.88-21.27-11.21-19.14-1.35.85-6.67 71.22-3.06 3.66-7.13 2.72-5.98-4.49-3.18-7.33 3.18-14.53 3.82-18.9 3.06-15.01 2.8-18.67 1.71-6.24.15-.42-1.37.23-14.07 19.3-21.4 28.95-16.93 17.96-4.08 1.65-7-3.66-.64-6.5 3.95-5.79 23.43-29.77 14.14-18.55 9.11-10.65-.09-1.54-.5-.04-62.26 40.59-11.08 1.42-4.84-4.49.64-6.5 2.29-2.36 18.72-15.24Z" /></svg>,
                openai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
                google: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>,
                deepseek: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" /></svg>,
                mistral: <svg width="17" height="17" viewBox="0 0 24 24"><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="currentColor"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="currentColor" opacity=".6"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="currentColor"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="currentColor" opacity=".6"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="currentColor"/></svg>,
                xai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" /></svg>,
                groq: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z" /></svg>,
                openrouter: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z" /></svg>,
                "kimi-coding": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="white"/></svg>,
                qwen: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>,
              };

              const defaultModelProvider = defaultModel.split("/")[0] || "";
              const isProviderDefault = (provider: string, requireAuth = false) => {
                if (defaultModelProvider !== provider) return false;
                if (!requireAuth) return true;
                // For OAuth providers, check subscription state
                const oauthState = oauthStates[provider];
                if (oauthState === "done") return true;
                // For API key providers, check saved state
                if (apiKeySaved[provider]) return true;
                return false;
              };

              /* ── API key validation patterns ── */
              const apiKeyPatterns: Record<string, { test: (k: string) => boolean; placeholder: string }> = {
                anthropic: { test: (k) => k.startsWith("sk-ant-"), placeholder: "sk-ant-api03-..." },
                openai: { test: (k) => k.startsWith("sk-proj-") || (k.startsWith("sk-") && k.length >= 40), placeholder: "sk-proj-..." },
                google: { test: (k) => k.startsWith("AIzaSy") && k.length >= 35, placeholder: "AIzaSy..." },
                deepseek: { test: (k) => k.startsWith("sk-") && k.length >= 30, placeholder: "sk-..." },
                mistral: { test: (k) => k.length >= 20, placeholder: "..." },
                xai: { test: (k) => k.startsWith("xai-"), placeholder: "xai-..." },
                groq: { test: (k) => k.startsWith("gsk_"), placeholder: "gsk_..." },
                openrouter: { test: (k) => k.startsWith("sk-or-"), placeholder: "sk-or-v1-..." },
              };

              /* ── OAuth providers (require interactive Terminal for login) ── */
              const oauthProviders: Array<{ id: string; label: string; hint: string }> = [
                { id: "openai-codex", label: m.chatgptSub, hint: m.chatgptSubHint },
                { id: "google-gemini-cli", label: m.geminiSub, hint: m.geminiSubHint },
                { id: "kimi-coding", label: m.kimiSub, hint: m.kimiSubHint },
                { id: "qwen", label: m.qwenSub, hint: m.qwenSubHint },
              ];
              oauthProviders.sort((a, b) => (isProviderDefault(b.id) ? 1 : 0) - (isProviderDefault(a.id) ? 1 : 0));

              /* ── API key providers ── */
              const apiKeyProviders: Array<{ id: string; label: string }> = [
                { id: "anthropic", label: m.anthropicKey },
                { id: "openai", label: m.openaiKey },
                { id: "google", label: m.googleKey },
                { id: "deepseek", label: m.deepseekKey },
                { id: "mistral", label: m.mistralKey },
                { id: "xai", label: m.xaiKey },
                { id: "groq", label: m.groqKey },
                { id: "openrouter", label: m.openrouterKey },
              ];
              apiKeyProviders.sort((a, b) => (isProviderDefault(b.id) ? 1 : 0) - (isProviderDefault(a.id) ? 1 : 0));

              /* ── API key modal provider data ── */
              const modalProvider = apiKeyModalProvider
                ? apiKeyProviders.find((p) => p.id === apiKeyModalProvider)
                : null;



              /* ── OAuth modal data ── */
              const oauthModalData = oauthModalProvider
                ? oauthProviders.find((p) => p.id === oauthModalProvider)
                : null;
              const oauthModalState = oauthModalProvider ? (oauthStates[oauthModalProvider] ?? "idle") : "idle";
              const oauthModalLaunchMode = oauthModalProvider ? (oauthLaunchModes[oauthModalProvider] ?? null) : null;
              const oauthModalConnected = oauthModalState === "done";
              const oauthModalDef = oauthModalProvider ? isProviderDefault(oauthModalProvider, true) : false;

              return (
                <>
                  {/* ── OAuth section ── */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.oauthSection}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{m.oauthHint}</p>
                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      {oauthProviders.map(({ id, label, hint }, i) => {
                        const authState = oauthStates[id] ?? "idle";
                        const isConnected = authState === "done";
                        const isLoading = authState === "polling" || authState === "launching";
                        return (
                          <IntegrationRow
                            key={id}
                            icon={icons[id] ?? icons.openai}
                            title={label}
                            description={hint}
                            enabled={isConnected}
                            onToggle={(v) => {
                              if (v) {
                                setOauthModalProvider(id);
                              } else {
                                removeAuth(id);
                                setOauthStates((prev) => ({ ...prev, [id]: "idle" as AuthState }));
                              }
                            }}
                            status={isConnected ? "connected" : isLoading ? "connecting" : "disabled"}
                            detail={isConnected && isProviderDefault(id, true) ? m.defaultProvider : undefined}
                            onRowClick={isConnected ? () => setOauthModalProvider(id) : undefined}
                            toggleDisabled={isLoading}
                            isLast={i === oauthProviders.length - 1}
                            testId={`ai-provider-${id}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ── API key section ── */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.apiKeySection}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{m.apiKeyHint}</p>
                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      {apiKeyProviders.map(({ id, label }, i) => {
                        const saved = apiKeySaved[id] ?? false;
                        return (
                          <IntegrationRow
                            key={id}
                            icon={icons[id] ?? icons.openai}
                            title={label}
                            description={m.apiKeyHint}
                            enabled={saved}
                            onToggle={(v) => {
                              if (v) {
                                setApiKeyModalProvider(id);
                              } else {
                                removeAuth(id);
                              }
                            }}
                            status={saved ? "connected" : "disabled"}
                            detail={saved && isProviderDefault(id, true) ? m.defaultProvider : undefined}
                            onRowClick={saved ? () => setApiKeyModalProvider(id) : undefined}
                            isLast={i === apiKeyProviders.length - 1}
                            testId={`ai-provider-${id}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ── OAuth provider modal ── */}
                  {oauthModalProvider && oauthModalData && (
                    <>
                    <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setOauthModalProvider(null)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOauthModalProvider(null)}>
                      <div
                        className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                        style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                              {icons[oauthModalProvider]}
                            </div>
                            {oauthModalConnected && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-emerald-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-[16px] font-semibold text-foreground">{oauthModalData.label}</h3>
                              {oauthModalConnected && oauthModalDef && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[9px] font-medium text-muted-foreground">
                                  {m.defaultProvider}
                                </span>
                              )}
                            </div>
                            {oauthModalConnected && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{m.connected}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setOauthModalProvider(null)}
                            className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors self-start"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        <div className="px-7 pt-4 pb-5 space-y-3">
                          <p className="text-[13px] text-tertiary-foreground">{oauthModalData.hint}</p>
                          {oauthModalConnected && !oauthModalDef && (
                            <button
                              type="button"
                              onClick={() => { handleSetDefault(oauthModalProvider); }}
                              className="w-full h-9 rounded-xl border border-border text-xs text-strong-foreground hover:bg-card transition-colors"
                            >
                              {m.setDefault}
                            </button>
                          )}
                          {!oauthModalConnected && oauthModalState === "launching" && (
                            <div className="flex items-center justify-center gap-2 py-1">
                              <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              <span className="text-[11px] text-muted-foreground">{m.checkingForExistingAuth}</span>
                            </div>
                          )}
                          {!oauthModalConnected && oauthModalState === "polling" && (
                            <div className="flex items-center justify-center gap-2 py-1">
                              <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              <span className="text-[11px] text-muted-foreground">
                                {oauthModalLaunchMode === "terminal" ? m.completeSignInInTerminal : m.completeSignInInBrowser}
                              </span>
                            </div>
                          )}
                          {!oauthModalConnected && oauthModalState !== "polling" && oauthModalState !== "launching" && (
                            <p className="text-[11px] text-muted-foreground">{m.oauthHint}</p>
                          )}
                        </div>
                        <div className="px-7 pb-6 pt-0 flex justify-end gap-2.5">
                          {oauthModalConnected ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  removeAuth(oauthModalProvider);
                                  setOauthStates((prev) => ({ ...prev, [oauthModalProvider]: "idle" as AuthState }));
                                  setOauthModalProvider(null);
                                }}
                                className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                {m.disconnectAccount}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOauthModalProvider(null)}
                                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                              >
                                {messages.settings.integrations.email.done}
                              </button>
                            </>
                          ) : (oauthModalState === "polling" || oauthModalState === "launching") ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (authPollRef.current) { clearInterval(authPollRef.current); authPollRef.current = null; }
                                setOauthStates((prev) => ({ ...prev, [oauthModalProvider]: "idle" as AuthState }));
                                setOauthLaunchModes((prev) => ({ ...prev, [oauthModalProvider]: null }));
                              }}
                              className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors"
                            >
                              {m.retryAuth}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => launchOAuth(oauthModalProvider)}
                              className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                            >
                              {m.connectAccount}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    </>
                  )}

                  {/* ── API key modal ── */}
                  {apiKeyModalProvider && modalProvider && (() => {
                    const currentValue = (apiKeyValues[apiKeyModalProvider] ?? "").trim();
                    const pattern = apiKeyPatterns[apiKeyModalProvider];
                    const isValid = !currentValue || !pattern || pattern.test(currentValue);
                    const saved = apiKeySaved[apiKeyModalProvider];
                    const isDef = isProviderDefault(apiKeyModalProvider, true);
                    const isFromEnv = authTypes[apiKeyModalProvider] === "env";
                    return (
                      <>
                      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setApiKeyModalProvider(null)} />
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setApiKeyModalProvider(null)}>
                        <div
                          className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                          style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
                            <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                              {icons[apiKeyModalProvider] ?? icons.openai}
                            </div>
                            <h3 className="text-[16px] font-semibold text-foreground flex-1">{modalProvider.label}</h3>
                            <button
                              type="button"
                              onClick={() => setApiKeyModalProvider(null)}
                              className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          {saved && (
                            <div className="flex items-center gap-1.5 px-7 pt-3 text-[11px] text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {m.keySaved}
                            </div>
                          )}
                          {saved && isFromEnv && (
                            <p className="px-7 pt-2 text-[11px] text-muted-foreground">{m.keyFromEnv}</p>
                          )}
                          <div className="px-7 pt-4 pb-5 space-y-3">
                            <SettingField label={m.apiKeySection}>
                              <input
                                type="password"
                                value={apiKeyValues[apiKeyModalProvider] ?? ""}
                                onChange={(e) => {
                                  const id = apiKeyModalProvider;
                                  setApiKeyValues((prev) => ({ ...prev, [id]: e.target.value }));
                                  setApiKeySaved((prev) => ({ ...prev, [id]: false }));
                                }}
                                placeholder={pattern?.placeholder ?? m.apiKeyPlaceholder}
                                className={`w-full bg-card border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                                  currentValue && !isValid
                                    ? "border-amber-300 focus:ring-amber-300 focus:border-amber-300"
                                    : "border-border focus:ring-tertiary-foreground focus:border-tertiary-foreground"
                                }`}
                              />
                            </SettingField>
                            {currentValue && !isValid && (
                              <p className="text-[11px] text-amber-600">{m.invalidKeyFormat}</p>
                            )}

                            {saved && !isDef && (
                              <button
                                type="button"
                                onClick={() => handleSetDefault(apiKeyModalProvider)}
                                className="w-full h-9 rounded-xl border border-border text-xs text-strong-foreground hover:bg-card transition-colors"
                              >
                                {m.setDefault}
                              </button>
                            )}

                            {saved && isDef && (
                              <div className="flex items-center justify-center gap-1.5 py-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-foreground/[0.06] text-[10px] text-tertiary-foreground">
                                  {m.defaultProvider}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="px-7 pb-6 pt-0 flex justify-end gap-2.5">
                            {saved && !isFromEnv && !currentValue && (
                              <button
                                type="button"
                                onClick={() => {
                                  removeAuth(apiKeyModalProvider);
                                  setApiKeyModalProvider(null);
                                }}
                                className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                {m.removeKey}
                              </button>
                            )}
                            {currentValue ? (
                              <button
                                type="button"
                                disabled={!isValid}
                                onClick={() => {
                                  saveApiKey(apiKeyModalProvider, apiKeyValues[apiKeyModalProvider] ?? "");
                                }}
                                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {m.saveKey}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setApiKeyModalProvider(null)}
                                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                              >
                                {messages.settings.integrations.email.done}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}

        {/* ── INTEGRATIONS TAB ────────────────────────────────────── */}
        {tab === "integrations" && (
          <SettingsIntegrationsTab
            messages={messages}
            config={config}
            updateConfig={updateConfig}
            toolStatus={toolStatus}
            whatsappEnabled={whatsappEnabled}
            whatsappReady={whatsappReady}
            whatsappStatus={whatsappStatus}
            whatsAppState={whatsAppState}
            whatsAppQrText={whatsAppQrText}
            whatsAppQrImage={whatsAppQrImage}
            whatsappSyncing={whatsappSyncing}
            showWhatsAppQrModal={showWhatsAppQrModal}
            setShowWhatsAppQrModal={setShowWhatsAppQrModal}
            showWhatsAppConfigModal={showWhatsAppConfigModal}
            setShowWhatsAppConfigModal={setShowWhatsAppConfigModal}
            openWhatsAppConfigModal={openWhatsAppConfigModal}
            waChats={waChats}
            waChatsLoading={waChatsLoading}
            handleWhatsAppToggle={handleWhatsAppToggle}
            showWhatsAppDisconnectModal={showWhatsAppDisconnectModal}
            setShowWhatsAppDisconnectModal={setShowWhatsAppDisconnectModal}
            whatsAppDisconnecting={whatsAppDisconnecting}
            whatsAppUninstallCli={whatsAppUninstallCli}
            setWhatsAppUninstallCli={setWhatsAppUninstallCli}
            handleWhatsAppDisable={handleWhatsAppDisable}
            emailEnabled={emailEnabled}
            emailStatus={emailStatus}
            emailOptions={emailOptions}
            selectedEmailIds={selectedEmailIds}
            allEmailSelected={allEmailSelected}
            showEmailAccountsModal={showEmailAccountsModal}
            setShowEmailAccountsModal={setShowEmailAccountsModal}
            calendarEnabled={calendarEnabled}
            calendarStatus={calendarStatus}
            calendarOptions={calendarOptions}
            selectedCalendarIds={selectedCalendarIds}
            allCalendarSelected={allCalendarSelected}
            showCalendarConfigModal={showCalendarConfigModal}
            setShowCalendarConfigModal={setShowCalendarConfigModal}
            transcriptionEnabled={transcriptionEnabled}
            transcriptionStatus={transcriptionStatus}
            transcriptionWhisperReady={transcriptionWhisperReady}
            showTranscriptionConfigModal={showTranscriptionConfigModal}
            setShowTranscriptionConfigModal={setShowTranscriptionConfigModal}
            selectedTtsProviderId={selectedTtsProviderId}
            selectedTtsProvider={selectedTtsProvider}
            ttsProviderLabel={ttsProviderLabel}
            ttsProviderOptions={ttsProviderOptions}
            ttsConfigMissingApiKey={ttsConfigMissingApiKey}
            showTtsConfigModal={showTtsConfigModal}
            setShowTtsConfigModal={setShowTtsConfigModal}
            renderTtsField={renderTtsField}
            telegramEnabled={telegramEnabled}
            telegramConnected={telegramConnected}
            telegramStatus={telegramStatus}
            handleTelegramToggle={handleTelegramToggle}
            showTelegramConfigModal={showTelegramConfigModal}
            setShowTelegramConfigModal={setShowTelegramConfigModal}
            showTelegramDisconnectModal={showTelegramDisconnectModal}
            setShowTelegramDisconnectModal={setShowTelegramDisconnectModal}
            telegramDisconnecting={telegramDisconnecting}
            telegramTesting={telegramTesting}
            telegramTestError={telegramTestError}
            setTelegramTestError={setTelegramTestError}
            telegramBotTokenInput={telegramBotTokenInput}
            setTelegramBotTokenInput={setTelegramBotTokenInput}
            telegramBotInfo={telegramBotInfo}
            handleTelegramTestConnection={handleTelegramTestConnection}
            handleTelegramDisable={handleTelegramDisable}
            slackEnabled={slackEnabled}
            slackStatus={slackStatus}
            handleSlackToggle={handleSlackToggle}
            showSlackConfigModal={showSlackConfigModal}
            setShowSlackConfigModal={setShowSlackConfigModal}
            showSlackDisconnectModal={showSlackDisconnectModal}
            setShowSlackDisconnectModal={setShowSlackDisconnectModal}
            slackDisconnecting={slackDisconnecting}
            slackTesting={slackTesting}
            slackTestError={slackTestError}
            setSlackTestError={setSlackTestError}
            slackBotTokenInput={slackBotTokenInput}
            setSlackBotTokenInput={setSlackBotTokenInput}
            slackBotInfo={slackBotInfo}
            handleSlackTestConnection={handleSlackTestConnection}
            handleSlackDisable={handleSlackDisable}
          />
        )}

        {/* ── TOOLS TAB ───────────────────────────────────────────── */}
        {tab === "tools" && (
          <SettingsToolsTab
            messages={messages}
            config={config}
            updateConfig={updateConfig}
            imageBackends={imageBackends}
            {...{ transcriptionEnabled, transcriptionStatus, transcriptionWhisperReady, showTranscriptionConfigModal, setShowTranscriptionConfigModal, refreshToolStatus }}
            {...{ selectedTtsProviderId, selectedTtsProvider, ttsProviderLabel, ttsProviderOptions, ttsConfigMissingApiKey, showTtsConfigModal, setShowTtsConfigModal, renderTtsField }}
            showImageGenConfigModal={showImageGenConfigModal}
            setShowImageGenConfigModal={setShowImageGenConfigModal}
          />
        )}

        {/* ── PERSONA TAB ─────────────────────────────────────────── */}
        {tab === "persona" && (
          <SettingsPersonaTab
            config={config}
            messages={messages}
            personaSubTab={personaSubTab}
            setPersonaSubTab={setPersonaSubTab}
            updateConfig={updateConfig}
          />
        )}

        {/* ── PROFILE TAB (About me) ────────────────────────────── */}
        {tab === "profile" && (
          <SettingsProfileTab
            config={config}
            messages={messages}
            profileSubTab={profileSubTab}
            setProfileSubTab={setProfileSubTab}
            groupedProfileSections={groupedProfileSections}
            activeProfileSectionId={activeProfileSectionId}
            setActiveProfileSectionId={setActiveProfileSectionId}
            activeProfileSection={activeProfileSection}
            setProfileSections={setProfileSections}
            updateConfig={updateConfig}
          />
        )}

        {/* ── ADVANCED TAB ───────────────────────────────────────── */}
        {tab === "advanced" && (
          <SettingsAdvancedTab
            workspaceFiles={workspaceFiles}
            activeWorkspaceFile={activeWorkspaceFile}
            setActiveWorkspaceFile={setActiveWorkspaceFile}
            workspaceFilesSaving={workspaceFilesSaving}
            setWorkspaceFiles={setWorkspaceFiles}
            workspaceFilesLoaded={workspaceFilesLoaded}
            saveWorkspaceFile={saveWorkspaceFile}
            messages={messages}
          />
        )}
      </div>
    </div>
  );
}
