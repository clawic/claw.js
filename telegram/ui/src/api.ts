export interface BotSummary {
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

export interface BotsResponse {
  workspace: string;
  bots: BotSummary[];
}

export interface CliResult<T = unknown> {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  json: T | null;
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let detail: string = text;
    try { detail = JSON.parse(text).error ?? text; } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${response.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function fetchBots(): Promise<BotsResponse> {
  return jsonOrThrow(await fetch("/v1/bots", { headers: { accept: "application/json" } }));
}

export async function fetchBotStatus(id: string): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/status`));
}

export async function startPolling(id: string, payload: { limit?: number; timeoutSeconds?: number; dropPendingUpdates?: boolean } = {}): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/polling/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function stopPolling(id: string): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/polling/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }));
}

export async function setWebhook(id: string, payload: { url: string; secretToken?: string; allowedUpdates?: string[]; maxConnections?: number; ipAddress?: string; dropPendingUpdates?: boolean }): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function clearWebhook(id: string, dropPendingUpdates = false): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/webhook`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dropPendingUpdates }),
  }));
}

export async function fetchCommands(id: string): Promise<CliResult<Array<{ command: string; description: string }>>> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/commands`));
}

export async function setCommands(id: string, commands: Array<{ command: string; description: string }>): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commands }),
  }));
}

export async function fetchChats(id: string, query?: string): Promise<CliResult<Array<{ id: string; type?: string; title?: string; username?: string; firstName?: string }>>> {
  const url = `/v1/bots/${encodeURIComponent(id)}/chats${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  return jsonOrThrow(await fetch(url));
}

export async function sendMessage(id: string, payload: {
  chatId: string;
  text?: string;
  media?: string;
  mediaType?: "photo" | "video" | "document" | "audio" | "animation";
  caption?: string;
  parseMode?: "MarkdownV2" | "HTML";
  replyToMessageId?: number;
  messageThreadId?: number;
}): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function fetchCodexStatus(id: string): Promise<CliResult> {
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/codex/status`));
}

export async function codexAction(id: string, action: "start" | "stop" | "repair" | "commands-sync"): Promise<CliResult> {
  const path = action === "commands-sync" ? "commands-sync" : action;
  return jsonOrThrow(await fetch(`/v1/bots/${encodeURIComponent(id)}/codex/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }));
}
