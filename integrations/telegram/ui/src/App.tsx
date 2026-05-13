import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBots,
  fetchChats,
  fetchCodexStatus,
  fetchCommands,
  sendMessage,
  setCommands,
  setWebhook,
  clearWebhook,
  startPolling,
  stopPolling,
  codexAction,
  type BotSummary,
  type CliResult,
} from "./api";

type TabId = "overview" | "transport" | "commands" | "chats" | "compose" | "codex";

interface AppState {
  loading: boolean;
  bots: BotSummary[];
  workspace: string | null;
  selectedId: string | null;
  error: string | null;
  lastRefreshed: string | null;
}

const initialState: AppState = {
  loading: true,
  bots: [],
  workspace: null,
  selectedId: null,
  error: null,
  lastRefreshed: null,
};

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [tab, setTab] = useState<TabId>("overview");

  const refresh = useCallback(async (preserveSelection = true) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchBots();
      setState((prev) => {
        const keep = preserveSelection && prev.selectedId && data.bots.some((b) => b.id === prev.selectedId);
        return {
          loading: false,
          bots: data.bots,
          workspace: data.workspace,
          selectedId: keep ? prev.selectedId : (data.bots[0]?.id ?? null),
          error: null,
          lastRefreshed: new Date().toISOString(),
        };
      });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  useEffect(() => { void refresh(false); }, [refresh]);

  const selectedBot = useMemo(
    () => state.bots.find((b) => b.id === state.selectedId) ?? null,
    [state.bots, state.selectedId],
  );

  return (
    <div className="app-shell">
      <Sidebar
        bots={state.bots}
        workspace={state.workspace}
        selectedId={state.selectedId}
        onSelect={(id) => setState((s) => ({ ...s, selectedId: id }))}
        onRefresh={() => void refresh()}
        loading={state.loading}
        lastRefreshed={state.lastRefreshed}
      />
      <main className="workspace">
        {selectedBot ? (
          <BotPanel bot={selectedBot} tab={tab} onTab={setTab} onRefresh={() => void refresh()} />
        ) : state.error ? (
          <div className="no-bot">
            <div>
              <h2>Could not load bots</h2>
              <p>{state.error}</p>
              <button className="btn-secondary" onClick={() => void refresh(false)}>Retry</button>
            </div>
          </div>
        ) : (
          <div className="no-bot">
            <div>
              <h2>No bots yet</h2>
              <p>Run <code className="mono">claw channels telegram setup</code> in this workspace to register one.</p>
              {state.workspace ? <p className="mono" style={{ color: "var(--text-tertiary)" }}>{state.workspace}</p> : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function initials(label: string, fallback: string): string {
  const source = label || fallback;
  const parts = source.replace(/^@/, "").split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function Sidebar(props: {
  bots: BotSummary[];
  workspace: string | null;
  selectedId: string | null;
  loading: boolean;
  lastRefreshed: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="dot" />
        <div>
          <strong>ClawJS</strong>
          <small>Telegram surface</small>
        </div>
      </div>

      <div className="sidebar-section-label">
        <span>Bots</span>
        <span className="count">{props.bots.length}</span>
      </div>
      {props.bots.length === 0 ? (
        <div className="sidebar-empty">
          No telegram bots in this workspace yet.
        </div>
      ) : (
        <ul className="bot-list">
          {props.bots.map((bot) => (
            <li key={bot.id}>
              <button
                className={`bot-row ${props.selectedId === bot.id ? "active" : ""}`}
                onClick={() => props.onSelect(bot.id)}
              >
                <span className="avatar">{initials(bot.username || bot.label, bot.accountId)}</span>
                <span className="meta">
                  <span className="name">{bot.label}</span>
                  <span className="handle">{bot.username ? `@${bot.username}` : bot.accountId}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="sidebar-footer">
        <span className="label">Workspace</span>
        <span className="value" title={props.workspace ?? undefined}>{props.workspace ?? "(unknown)"}</span>
        <button onClick={props.onRefresh} disabled={props.loading}>
          {props.loading ? "Refreshing." : "Refresh"}
        </button>
        {props.lastRefreshed ? (
          <span className="label" style={{ textAlign: "center" }}>Updated {new Date(props.lastRefreshed).toLocaleTimeString()}</span>
        ) : null}
      </div>
    </aside>
  );
}

function BotPanel(props: { bot: BotSummary; tab: TabId; onTab: (t: TabId) => void; onRefresh: () => void }) {
  const { bot } = props;
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "transport", label: "Webhook & Polling" },
    { id: "commands", label: "Commands" },
    { id: "chats", label: "Chats" },
    { id: "compose", label: "Compose" },
    { id: "codex", label: "Codex bridge" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{bot.label}</h1>
          <p className="subtitle">{bot.username ? `@${bot.username}` : bot.accountId}</p>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${bot.status} large`}>{bot.status}</span>
          <button className="btn-secondary" onClick={props.onRefresh}>Reload</button>
        </div>
      </div>
      <div className="tab-bar">
        {tabs.map((t) => (
          <button key={t.id} className={props.tab === t.id ? "active" : ""} onClick={() => props.onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="workspace-body">
        <div className="tab-content">
          {props.tab === "overview" ? <OverviewTab bot={bot} /> : null}
          {props.tab === "transport" ? <TransportTab bot={bot} onChanged={props.onRefresh} /> : null}
          {props.tab === "commands" ? <CommandsTab bot={bot} /> : null}
          {props.tab === "chats" ? <ChatsTab bot={bot} /> : null}
          {props.tab === "compose" ? <ComposeTab bot={bot} /> : null}
          {props.tab === "codex" ? <CodexTab bot={bot} /> : null}
        </div>
      </div>
    </>
  );
}

function OverviewTab({ bot }: { bot: BotSummary }) {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Connection</h2>
          <span className={`pill ${bot.status}`}>{bot.status}</span>
        </div>
        <div className="card-body">
          <div className="meta-grid">
            <Field label="Account id" value={bot.accountId} mono />
            <Field label="Bot label" value={bot.label} />
            <Field label="Username" value={bot.username ? `@${bot.username}` : "—"} mono />
            <Field label="Bot first name" value={bot.firstName ?? "—"} />
            <Field label="Enabled" value={bot.enabled ? "yes" : "no"} />
            <Field label="Updated" value={bot.updatedAt ? new Date(bot.updatedAt).toLocaleString() : "never"} muted={!bot.updatedAt} />
            <Field label="Credential" value={bot.maskedCredential ?? "—"} mono />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Transport</h2>
          <span className={`pill ${bot.pollingActive ? "active" : "disconnected"}`}>
            {bot.pollingActive ? "polling active" : bot.webhookUrl ? "webhook" : "idle"}
          </span>
        </div>
        <div className="card-body">
          <div className="meta-grid">
            <Field label="Polling" value={bot.pollingActive ? "active" : "stopped"} />
            <Field label="Webhook URL" value={bot.webhookUrl || "off"} mono />
            <Field label="Known chats" value={String(bot.knownChats ?? 0)} />
          </div>
        </div>
      </div>
      {bot.recentErrors && bot.recentErrors.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h2>Recent errors</h2>
            <span className="hint">last {bot.recentErrors.length}</span>
          </div>
          <div className="card-body">
            <ul className="error-list">
              {bot.recentErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, value, mono, muted }: { label: string; value: string; mono?: boolean; muted?: boolean }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <span className={`value ${mono ? "mono" : ""} ${muted ? "muted" : ""}`}>{value}</span>
    </div>
  );
}

function TransportTab({ bot, onChanged }: { bot: BotSummary; onChanged: () => void }) {
  const [webhookUrl, setWebhookUrl] = useState(bot.webhookUrl ?? "");
  const [secretToken, setSecretToken] = useState("");
  const [maxConnections, setMaxConnections] = useState<string>("");
  const [dropPending, setDropPending] = useState(false);
  const [allowedUpdatesText, setAllowedUpdatesText] = useState("");
  const [pollingLimit, setPollingLimit] = useState("");
  const [pollingTimeout, setPollingTimeout] = useState("");
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; message: string; raw?: CliResult } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run<T>(label: string, fn: () => Promise<CliResult<T>>) {
    setBusy(label);
    setOutcome(null);
    try {
      const result = await fn();
      setOutcome(result.ok
        ? { kind: "ok", message: `${label}: ok`, raw: result }
        : { kind: "err", message: `${label}: ${result.stderr || `exit ${result.exitCode}`}`, raw: result });
      onChanged();
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  function parseAllowedUpdates(): string[] | undefined {
    const trimmed = allowedUpdatesText.trim();
    if (!trimmed) return undefined;
    return trimmed.split(/[\s,]+/).filter(Boolean);
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Long polling</h2>
          <span className={`pill ${bot.pollingActive ? "active" : "disconnected"}`}>{bot.pollingActive ? "active" : "stopped"}</span>
        </div>
        <div className="card-body">
          <div className="form-grid-2">
            <div className="form-row">
              <label htmlFor="poll-limit">Limit</label>
              <input id="poll-limit" inputMode="numeric" placeholder="e.g. 100" value={pollingLimit} onChange={(e) => setPollingLimit(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="poll-timeout">Long-poll timeout (s)</label>
              <input id="poll-timeout" inputMode="numeric" placeholder="e.g. 30" value={pollingTimeout} onChange={(e) => setPollingTimeout(e.target.value)} />
            </div>
          </div>
          <div className="form-row checkbox">
            <input id="poll-drop" type="checkbox" checked={dropPending} onChange={(e) => setDropPending(e.target.checked)} />
            <label htmlFor="poll-drop">Drop pending updates on (re)start</label>
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={busy !== null}
              onClick={() => run("polling start", () => startPolling(bot.id, {
                limit: pollingLimit ? Number(pollingLimit) : undefined,
                timeoutSeconds: pollingTimeout ? Number(pollingTimeout) : undefined,
                dropPendingUpdates: dropPending,
              }))}
            >
              {busy === "polling start" ? "Starting." : "Start polling"}
            </button>
            <button
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => run("polling stop", () => stopPolling(bot.id))}
            >
              {busy === "polling stop" ? "Stopping." : "Stop polling"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Webhook</h2>
          <span className={`pill ${bot.webhookUrl ? "active" : "disconnected"}`}>{bot.webhookUrl ? "configured" : "off"}</span>
        </div>
        <div className="card-body">
          <div className="form-row">
            <label htmlFor="hook-url">URL</label>
            <input id="hook-url" placeholder="https://example.com/telegram/webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            <span className="hint">Telegram will POST updates here. Must be HTTPS.</span>
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label htmlFor="hook-secret">Secret token (optional)</label>
              <input id="hook-secret" placeholder="X-Telegram-Bot-Api-Secret-Token" value={secretToken} onChange={(e) => setSecretToken(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="hook-max">Max connections (optional)</label>
              <input id="hook-max" inputMode="numeric" placeholder="40" value={maxConnections} onChange={(e) => setMaxConnections(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="hook-allowed">Allowed updates (comma-separated, optional)</label>
            <input id="hook-allowed" placeholder="message, callback_query, chat_member" value={allowedUpdatesText} onChange={(e) => setAllowedUpdatesText(e.target.value)} />
          </div>
          <div className="form-row checkbox">
            <input id="hook-drop" type="checkbox" checked={dropPending} onChange={(e) => setDropPending(e.target.checked)} />
            <label htmlFor="hook-drop">Drop pending updates</label>
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={busy !== null || !webhookUrl.trim()}
              onClick={() => run("webhook set", () => setWebhook(bot.id, {
                url: webhookUrl.trim(),
                secretToken: secretToken.trim() || undefined,
                maxConnections: maxConnections ? Number(maxConnections) : undefined,
                allowedUpdates: parseAllowedUpdates(),
                dropPendingUpdates: dropPending,
              }))}
            >
              {busy === "webhook set" ? "Configuring." : "Set webhook"}
            </button>
            <button
              className="btn-danger"
              disabled={busy !== null}
              onClick={() => run("webhook clear", () => clearWebhook(bot.id, dropPending))}
            >
              {busy === "webhook clear" ? "Clearing." : "Clear webhook"}
            </button>
          </div>
        </div>
      </div>

      {outcome ? <Outcome outcome={outcome} /> : null}
    </>
  );
}

function CommandsTab({ bot }: { bot: BotSummary }) {
  const [commands, setCommandsState] = useState<Array<{ command: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; message: string; raw?: CliResult } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCommands(bot.id);
      const list = Array.isArray(result.json) ? result.json : [];
      setCommandsState(list);
      if (!result.ok && !Array.isArray(result.json)) {
        setOutcome({ kind: "err", message: result.stderr || `exit ${result.exitCode}`, raw: result });
      } else {
        setOutcome(null);
      }
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => { void load(); }, [load]);

  function update(idx: number, patch: Partial<{ command: string; description: string }>) {
    setCommandsState((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function remove(idx: number) {
    setCommandsState((prev) => prev.filter((_, i) => i !== idx));
  }
  function add() {
    setCommandsState((prev) => [...prev, { command: "", description: "" }]);
  }

  async function save() {
    setBusy(true);
    setOutcome(null);
    try {
      const cleaned = commands
        .map((c) => ({ command: c.command.replace(/^\//, "").trim(), description: c.description.trim() }))
        .filter((c) => c.command && c.description);
      const result = await setCommands(bot.id, cleaned);
      setOutcome(result.ok
        ? { kind: "ok", message: `Saved ${cleaned.length} command${cleaned.length === 1 ? "" : "s"}.`, raw: result }
        : { kind: "err", message: result.stderr || `exit ${result.exitCode}`, raw: result });
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Slash commands</h2>
        <span className="hint">Synced to BotFather via setMyCommands</span>
      </div>
      <div className="card-body">
        {loading ? (
          <p style={{ color: "var(--text-tertiary)" }}>Loading.</p>
        ) : (
          <>
            {commands.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)" }}>No commands yet. Add one to expose a slash command in Telegram.</p>
            ) : (
              <div>
                {commands.map((c, idx) => (
                  <div className="command-editor" key={idx}>
                    <input className="command" placeholder="start" value={c.command} onChange={(e) => update(idx, { command: e.target.value })} />
                    <input placeholder="Short description" value={c.description} onChange={(e) => update(idx, { description: e.target.value })} />
                    <button className="btn-ghost" onClick={() => remove(idx)} title="Remove">remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="btn-secondary" onClick={add}>Add command</button>
              <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving." : "Save commands"}</button>
              <button className="btn-ghost" onClick={() => void load()} disabled={busy || loading}>Reload</button>
            </div>
            {outcome ? <Outcome outcome={outcome} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function ChatsTab({ bot }: { bot: BotSummary }) {
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Array<{ id: string; type?: string; title?: string; username?: string; firstName?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; message: string; raw?: CliResult } | null>(null);

  async function load(q?: string) {
    setLoading(true);
    setOutcome(null);
    try {
      const result = await fetchChats(bot.id, q);
      const list = Array.isArray(result.json) ? result.json : [];
      setChats(list);
      if (!result.ok && !Array.isArray(result.json)) {
        setOutcome({ kind: "err", message: result.stderr || `exit ${result.exitCode}`, raw: result });
      }
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [bot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="card-head">
        <h2>Known chats</h2>
        <span className="hint">From the bot's recent updates</span>
      </div>
      <div className="card-body">
        <div className="form-row" style={{ marginBottom: "0.85rem" }}>
          <label htmlFor="chat-search">Search</label>
          <input id="chat-search" placeholder="title or username" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(query); }} />
        </div>
        <div className="form-actions" style={{ marginBottom: "0.85rem" }}>
          <button className="btn-primary" onClick={() => void load(query)} disabled={loading}>Search</button>
          <button className="btn-secondary" onClick={() => { setQuery(""); void load(); }} disabled={loading}>Clear</button>
        </div>
        {loading ? (
          <p style={{ color: "var(--text-tertiary)" }}>Loading.</p>
        ) : chats.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)" }}>No chats yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Chat id</th><th>Type</th><th>Title / Handle</th></tr>
            </thead>
            <tbody>
              {chats.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td>{c.type ?? "—"}</td>
                  <td>{c.title ?? (c.username ? `@${c.username}` : c.firstName ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {outcome ? <Outcome outcome={outcome} /> : null}
      </div>
    </div>
  );
}

function ComposeTab({ bot }: { bot: BotSummary }) {
  const [chatId, setChatId] = useState("");
  const [text, setText] = useState("");
  const [media, setMedia] = useState("");
  const [mediaType, setMediaType] = useState<"photo" | "video" | "document" | "audio" | "animation">("photo");
  const [caption, setCaption] = useState("");
  const [parseMode, setParseMode] = useState<"" | "MarkdownV2" | "HTML">("");
  const [replyTo, setReplyTo] = useState("");
  const [thread, setThread] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; message: string; raw?: CliResult } | null>(null);

  async function send() {
    setBusy(true);
    setOutcome(null);
    try {
      const payload = {
        chatId: chatId.trim(),
        ...(media.trim() ? { media: media.trim(), mediaType, caption: caption.trim() || undefined } : { text }),
        parseMode: parseMode || undefined,
        replyToMessageId: replyTo ? Number(replyTo) : undefined,
        messageThreadId: thread ? Number(thread) : undefined,
      };
      const result = await sendMessage(bot.id, payload);
      setOutcome(result.ok
        ? { kind: "ok", message: "Message sent.", raw: result }
        : { kind: "err", message: result.stderr || `exit ${result.exitCode}`, raw: result });
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Send a message</h2>
        <span className="hint">Bot API: sendMessage / sendPhoto / etc.</span>
      </div>
      <div className="card-body">
        <div className="form-grid-2">
          <div className="form-row">
            <label htmlFor="msg-chat">Chat id</label>
            <input id="msg-chat" placeholder="-1001234567890 or @channel_username" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="msg-thread">Thread / topic id (optional)</label>
            <input id="msg-thread" inputMode="numeric" placeholder="e.g. 23" value={thread} onChange={(e) => setThread(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="msg-text">Text</label>
          <textarea id="msg-text" placeholder="Type your message." value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="form-grid-2">
          <div className="form-row">
            <label htmlFor="msg-media">Media (URL, file id, or local path) — optional</label>
            <input id="msg-media" placeholder="https://. or file_id" value={media} onChange={(e) => setMedia(e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="msg-media-type">Media type</label>
            <select id="msg-media-type" value={mediaType} onChange={(e) => setMediaType(e.target.value as typeof mediaType)} disabled={!media.trim()}>
              <option value="photo">photo</option>
              <option value="video">video</option>
              <option value="document">document</option>
              <option value="audio">audio</option>
              <option value="animation">animation</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="msg-caption">Caption (when media is set)</label>
          <input id="msg-caption" placeholder="Optional caption" value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!media.trim()} />
        </div>
        <div className="form-grid-2">
          <div className="form-row">
            <label htmlFor="msg-parse">Parse mode</label>
            <select id="msg-parse" value={parseMode} onChange={(e) => setParseMode(e.target.value as "" | "MarkdownV2" | "HTML")}>
              <option value="">(plain text)</option>
              <option value="MarkdownV2">MarkdownV2</option>
              <option value="HTML">HTML</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="msg-reply">Reply to message id</label>
            <input id="msg-reply" inputMode="numeric" placeholder="e.g. 123" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn-primary" onClick={send} disabled={busy || !chatId.trim() || (!text.trim() && !media.trim())}>
            {busy ? "Sending." : "Send"}
          </button>
        </div>
        {outcome ? <Outcome outcome={outcome} /> : null}
      </div>
    </div>
  );
}

function CodexTab({ bot }: { bot: BotSummary }) {
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; message: string; raw?: CliResult } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<CliResult | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const result = await fetchCodexStatus(bot.id);
      setStatus(result);
    } catch (error) {
      setStatus({ ok: false, exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : String(error), json: null });
    }
  }, [bot.id]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  async function run(label: string, action: "start" | "stop" | "repair" | "commands-sync") {
    setBusy(label);
    setOutcome(null);
    try {
      const result = await codexAction(bot.id, action);
      setOutcome(result.ok
        ? { kind: "ok", message: `${label}: ok`, raw: result }
        : { kind: "err", message: result.stderr || `exit ${result.exitCode}`, raw: result });
      void refreshStatus();
    } catch (error) {
      setOutcome({ kind: "err", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Telegram ↔ Codex bridge</h2>
          <span className="hint">channels telegram codex …</span>
        </div>
        <div className="card-body">
          <div className="form-actions">
            <button className="btn-primary" disabled={busy !== null} onClick={() => void run("Start bridge", "start")}>{busy === "Start bridge" ? "Starting." : "Start"}</button>
            <button className="btn-secondary" disabled={busy !== null} onClick={() => void run("Stop bridge", "stop")}>{busy === "Stop bridge" ? "Stopping." : "Stop"}</button>
            <button className="btn-secondary" disabled={busy !== null} onClick={() => void run("Repair bridge", "repair")}>{busy === "Repair bridge" ? "Repairing." : "Repair"}</button>
            <button className="btn-ghost" disabled={busy !== null} onClick={() => void run("Sync commands", "commands-sync")}>{busy === "Sync commands" ? "Syncing." : "Sync commands"}</button>
            <button className="btn-ghost" onClick={() => void refreshStatus()}>Refresh status</button>
          </div>
          {status ? (
            <div style={{ marginTop: "0.85rem" }}>
              <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.4rem 0", color: "var(--text-secondary)" }}>Latest status output</h3>
              <pre className="cli-output">{status.stdout || status.stderr || "(no output)"}</pre>
            </div>
          ) : null}
          {outcome ? <Outcome outcome={outcome} /> : null}
        </div>
      </div>
    </>
  );
}

function Outcome({ outcome }: { outcome: { kind: "ok" | "err"; message: string; raw?: CliResult } }) {
  return (
    <div className={`alert ${outcome.kind === "ok" ? "success" : "error"}`} style={{ marginTop: "0.85rem" }}>
      <div style={{ flex: 1 }}>
        <strong>{outcome.kind === "ok" ? "Success" : "Failed"}</strong>
        <div style={{ marginTop: 2 }}>{outcome.message}</div>
        {outcome.raw && (outcome.raw.stdout || outcome.raw.stderr) ? (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.78rem" }}>Show CLI output</summary>
            <pre className="cli-output" style={{ marginTop: 6 }}>
              {outcome.raw.stdout ? `[stdout]\n${outcome.raw.stdout}\n` : ""}
              {outcome.raw.stderr ? `[stderr]\n${outcome.raw.stderr}\n` : ""}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
