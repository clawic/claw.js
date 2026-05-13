import { NextResponse } from "next/server";

import { existsSync } from "fs";
import { getCalendarIntegrationStatus } from "@/lib/calendar";
import { getContactsIntegrationStatus } from "@/lib/contacts-native";
import { getMailIntegrationStatus } from "@/lib/email";
import {
  getClawJSOpenClawStatus,
  getClawJSOpenClawContext,
  reconcileClawJSOpenClawDefaultModelWithAvailableAuth,
} from "@/lib/openclaw-agent";
import { getUserConfig, resolvePath } from "@/lib/user-config";
import { getWacliAuthStatus } from "@/lib/wacli-runtime";
import { hasBinary } from "@/lib/platform";
import { getClaw } from "@/lib/claw";
import { getAllAdapterStatuses } from "@/lib/runtime-adapters";
import { ensureE2ESeeded, getE2EIntegrationStatus, isE2EEnabled } from "@/lib/e2e";

interface ToolStatus {
  installed: boolean;
  dbExists: boolean;
  authenticated?: boolean;
  authInProgress?: boolean;
  syncing?: boolean;
  qrText?: string;
  lastError?: string | null;
  wacliAvailable?: boolean;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const DISABLED_EMAIL_STATUS = {
  installed: false,
  available: false,
  backend: "unsupported" as const,
  accounts: [],
  selectedAccountsValid: false,
  message: null,
};

const DISABLED_CALENDAR_STATUS = {
  installed: false,
  available: false,
  needsPermission: false,
  backend: "unsupported" as const,
  calendars: [],
  selectedCalendarValid: false,
  message: null,
};

export async function GET(request: Request) {
  if (isE2EEnabled()) {
    ensureE2ESeeded();
    return NextResponse.json(getE2EIntegrationStatus(), { headers: NO_STORE_HEADERS });
  }

  const config = getUserConfig();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const bootstrapScope = scope === "bootstrap";

  const contactsEnabled = !!config.contactsEnabled;
  const emailEnabled = (config.emailAccounts ?? []).filter(Boolean).length > 0;
  const calendarEnabled = (config.calendarAccounts ?? []).filter(Boolean).length > 0;
  const adapterStatusesPromise = bootstrapScope ? Promise.resolve([]) : getAllAdapterStatuses();
  const emailStatusPromise = bootstrapScope && !emailEnabled
    ? Promise.resolve(DISABLED_EMAIL_STATUS)
    : getMailIntegrationStatus(config.emailAccounts);
  const calendarStatusPromise = bootstrapScope && !calendarEnabled
    ? Promise.resolve(DISABLED_CALENDAR_STATUS)
    : getCalendarIntegrationStatus(config.calendarAccounts?.[0] || undefined);

  let [wacliStatus, calendarStatus, contactsStatus, emailStatus, openClawStatus, adapterStatuses] = await Promise.all([
    getWacliAuthStatus(),
    calendarStatusPromise,
    contactsEnabled
      ? getContactsIntegrationStatus().catch(() => ({
          installed: false, available: false, needsPermission: false,
          backend: "unsupported" as const, contactCount: 0,
          message: "Failed to check Contacts.app status.",
        }))
      : Promise.resolve({
          installed: false, available: false, needsPermission: false,
          backend: "unsupported" as const, contactCount: 0,
          message: null,
        }),
    emailStatusPromise,
    getClawJSOpenClawStatus({ includeLatestVersion: !bootstrapScope }),
    adapterStatusesPromise,
  ]);

  if (openClawStatus.cliAvailable && openClawStatus.agentConfigured && !openClawStatus.authConfigured) {
    await reconcileClawJSOpenClawDefaultModelWithAvailableAuth().catch(() => null);
    openClawStatus = await getClawJSOpenClawStatus({ includeLatestVersion: !bootstrapScope });
  }

  const wacliDbExists = config.dataSources.wacliDbPath
    ? existsSync(resolvePath(config.dataSources.wacliDbPath))
    : false;

  const transcriptionDbExists = config.dataSources.transcriptionDbPath
    ? existsSync(resolvePath(config.dataSources.transcriptionDbPath))
    : false;

  const openClawCtx = getClawJSOpenClawContext();
  return NextResponse.json({
    adapters: adapterStatuses,
    openClaw: {
      ...openClawStatus,
      context: openClawStatus.cliAvailable ? {
        agentId: openClawCtx.agentId,
        workspaceDir: openClawCtx.workspaceDir,
        stateDir: openClawCtx.stateDir,
        agentDir: openClawCtx.agentDir,
        agentName: openClawCtx.configuredAgent?.name,
      } : undefined,
    },
    whatsapp: {
      installed: wacliStatus.cliAvailable,
      dbExists: wacliDbExists,
      authenticated: wacliStatus.authenticated,
      authInProgress: wacliStatus.authInProgress,
      syncing: wacliStatus.syncing,
      qrText: wacliStatus.qrText,
      lastError: wacliStatus.lastError,
      wacliAvailable: wacliStatus.cliAvailable,
    } satisfies ToolStatus,
    email: { ...emailStatus, enabled: emailEnabled },
    calendar: { ...calendarStatus, enabled: calendarEnabled },
    contacts: { ...contactsStatus, enabled: !!config.contactsEnabled },
    transcription: {
      dbExists: transcriptionDbExists,
      whisperCliAvailable: await hasBinary("whisper-cli"),
      whisperAvailable: await hasBinary("whisper"),
    },
    telegram: await (async () => {
      if (!config.telegram?.enabled) {
        return {
          enabled: false,
          botConnected: false,
          botUsername: undefined as string | undefined,
          webhookUrl: undefined as string | undefined,
          lastError: null as string | null,
        };
      }
      try {
        const claw = await getClaw();
        const status = await claw.telegram.status();
        return {
          enabled: true,
          botConnected: status.connected,
          botUsername: status.botProfile?.username ?? config.telegram?.botUsername,
          webhookUrl: status.transport.webhook?.url,
          lastError: status.recentErrors[0] ?? null,
        };
      } catch {
        return {
          enabled: true,
          botConnected: !!config.telegram?.botUsername,
          botUsername: config.telegram?.botUsername,
          webhookUrl: undefined as string | undefined,
          lastError: null as string | null,
        };
      }
    })(),
    slack: {
      enabled: !!config.slack?.enabled,
      botConnected: !!config.slack?.botUsername || !!config.slack?.teamName,
      botUsername: config.slack?.botUsername,
      teamName: config.slack?.teamName,
      lastError: null as string | null,
    },
  }, { headers: NO_STORE_HEADERS });
}
