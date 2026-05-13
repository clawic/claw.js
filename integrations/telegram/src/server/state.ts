import fs from "node:fs";
import path from "node:path";

export interface TelegramBotSummary {
  id: string;
  accountId: string;
  label: string;
  enabled: boolean;
  status: string;
  username?: string;
  firstName?: string;
  maskedCredential?: string | null;
  webhookUrl?: string | null;
  pollingActive?: boolean;
  recentErrors?: string[];
  knownChats?: number;
  updatedAt?: string;
  workspace: string;
}

interface ChannelsStateFile {
  accounts?: Array<{
    id?: unknown;
    provider?: unknown;
    accountId?: unknown;
    label?: unknown;
    enabled?: unknown;
    status?: unknown;
    maskedCredential?: unknown;
    profile?: Record<string, unknown> | null;
    transport?: Record<string, unknown> | null;
    updatedAt?: unknown;
  }>;
  details?: {
    telegram?: {
      transport?: { polling?: { active?: boolean }; webhook?: { url?: string } };
      knownChats?: unknown[];
      recentErrors?: unknown[];
      botProfile?: { username?: unknown; firstName?: unknown; first_name?: unknown };
    };
  };
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readTelegramBotsForWorkspace(workspaceDir: string): TelegramBotSummary[] {
  const channelsFile = path.join(workspaceDir, ".clawjs", "observed", "channels.json");
  const data = safeReadJson<ChannelsStateFile>(channelsFile);
  if (!data || !Array.isArray(data.accounts)) return [];

  const telegramDetails = data.details?.telegram ?? {};
  const polling = telegramDetails.transport?.polling?.active === true;
  const webhookUrl = typeof telegramDetails.transport?.webhook?.url === "string"
    ? telegramDetails.transport.webhook.url
    : null;
  const recentErrors = Array.isArray(telegramDetails.recentErrors)
    ? telegramDetails.recentErrors.filter((value): value is string => typeof value === "string")
    : [];
  const knownChats = Array.isArray(telegramDetails.knownChats) ? telegramDetails.knownChats.length : 0;
  const botUsername = typeof telegramDetails.botProfile?.username === "string"
    ? telegramDetails.botProfile.username
    : undefined;
  const botFirstName = typeof telegramDetails.botProfile?.firstName === "string"
    ? telegramDetails.botProfile.firstName
    : typeof telegramDetails.botProfile?.first_name === "string"
      ? telegramDetails.botProfile.first_name
      : undefined;

  const out: TelegramBotSummary[] = [];
  for (const raw of data.accounts) {
    if (raw.provider !== "telegram") continue;
    const id = typeof raw.id === "string" ? raw.id : "";
    const accountId = typeof raw.accountId === "string" ? raw.accountId : id;
    if (!id) continue;
    const profile = (raw.profile ?? {}) as Record<string, unknown>;
    const profileUsername = typeof profile.username === "string" ? profile.username as string : undefined;
    const profileFirstName = typeof profile.firstName === "string"
      ? profile.firstName as string
      : typeof profile.first_name === "string" ? profile.first_name as string : undefined;
    out.push({
      id,
      accountId,
      label: typeof raw.label === "string" ? raw.label : accountId,
      enabled: raw.enabled !== false,
      status: typeof raw.status === "string" ? raw.status : "unknown",
      username: profileUsername ?? botUsername,
      firstName: profileFirstName ?? botFirstName,
      maskedCredential: typeof raw.maskedCredential === "string" ? raw.maskedCredential : null,
      webhookUrl,
      pollingActive: polling,
      recentErrors,
      knownChats,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
      workspace: workspaceDir,
    });
  }
  return out;
}
