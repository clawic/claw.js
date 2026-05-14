const STABLE_EVENT_TYPES = {
  browserInput: "browser.input",
} as const;
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Keyboard,
  Lock,
  Monitor,
  MousePointerClick,
  Play,
  RefreshCw,
  Unlock,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/Button";
import { Empty, ErrorMsg, Loading } from "../../components/Empty";

type BrowserSessionSnapshot = {
  workspaceId: string;
  active: boolean;
  status: "idle" | "ready";
  navigation: {
    title: string;
    url: string;
    displayUrl: string;
    isLocalUrl: boolean;
  };
  controller: {
    deviceId: string;
    userId: string;
    email?: string;
    acquiredAt: string;
  } | null;
  viewport: {
    width: number;
    height: number;
  };
  updatedAt: string;
  startedAt?: string;
  lastFrameAt?: string;
};

type BrowserFrameEvent = {
  workspaceId: string;
  seq: number;
  imageBase64: string;
  mimeType: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
};

type BrowserSessionResponse = {
  session: BrowserSessionSnapshot;
  sharePath: string;
  shareUrl: string;
};

/* ------------------------------------------------------------------ */

export function BrowserTab({
  prefix,
  variant = "workspace",
  workspaceHref,
}: {
  prefix: string;
  variant?: "workspace" | "immersive";
  workspaceHref?: string;
}) {
  const { auth } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const [session, setSession] = useState<BrowserSessionSnapshot | null>(null);
  const [frame, setFrame] = useState<BrowserFrameEvent | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [typeInput, setTypeInput] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ---------- initial fetch ---------- */

  const initial = useQuery({
    queryKey: ["browser-session", prefix],
    queryFn: () => api.get<BrowserSessionResponse>(`${prefix}/browser/session`),
    retry: false,
  });

  useEffect(() => {
    if (!initial.data) return;
    setSession((current) => current ?? initial.data.session);
    setShareUrl((current) => current || initial.data.shareUrl);
    setUrlInput((current) => current || initial.data.session.navigation.url || "");
  }, [initial.data]);

  /* ---------- WebSocket ---------- */

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    if (!token) return;
    const wsBase = window.location.origin.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsBase}/v1${prefix}/browser/events?access_token=${encodeURIComponent(token)}`);
    wsRef.current = socket;
    setWsState("connecting");

    socket.onopen = () => setWsState("open");
    socket.onclose = () => setWsState("closed");
    socket.onerror = () => setWsState("closed");
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: string;
          reason?: string;
          session?: BrowserSessionSnapshot;
          frame?: BrowserFrameEvent;
          message?: string;
        };
        if (payload.type === "browser.state" && payload.session) {
          setSession(payload.session);
          setError(null);
          if (payload.session.navigation.url) {
            setUrlInput(payload.session.navigation.url);
          }
          return;
        }
        if (payload.type === "browser.frame" && payload.frame) {
          setFrame(payload.frame);
          setError(null);
          return;
        }
        if (payload.type === "browser.error" && payload.message) {
          setError(payload.message);
        }
      } catch {
        setError("Invalid browser event.");
      }
    };

    return () => {
      wsRef.current = null;
      socket.close();
    };
  }, [prefix]);

  /* ---------- derived ---------- */

  const controllerDeviceId = session?.controller?.deviceId ?? null;
  const canControl = controllerDeviceId === auth?.deviceId;
  const isReady = session?.active === true;

  /* ---------- actions ---------- */

  async function ensureBrowser(initialUrl?: string) {
    setError(null);
    try {
      const result = await api.post<BrowserSessionResponse>(`${prefix}/browser/session`, initialUrl ? { initialUrl } : {});
      setSession(result.session);
      setShareUrl(result.shareUrl);
      if (result.session.navigation.url) {
        setUrlInput(result.session.navigation.url);
      }
    } catch (nextError) {
      setError((nextError as Error).message);
    }
  }

  async function acquireControl() {
    setError(null);
    try {
      const result = await api.post<{ session: BrowserSessionSnapshot }>(`${prefix}/browser/control/acquire`);
      setSession(result.session);
    } catch (nextError) {
      setError((nextError as Error).message);
    }
  }

  async function releaseControl() {
    setError(null);
    try {
      const result = await api.post<{ session: BrowserSessionSnapshot }>(`${prefix}/browser/control/release`);
      setSession(result.session);
    } catch (nextError) {
      setError((nextError as Error).message);
    }
  }

  async function navigate() {
    if (!urlInput.trim()) return;
    setError(null);
    try {
      const result = await api.post<{ session: BrowserSessionSnapshot }>(`${prefix}/browser/navigate`, {
        url: urlInput.trim(),
      });
      setSession(result.session);
    } catch (nextError) {
      setError((nextError as Error).message);
    }
  }

  function sendCommand(command: { type: "click"; x: number; y: number } | { type: "type"; text: string } | { type: "key"; key: string }) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Browser stream is offline.");
      return;
    }
    wsRef.current.send(JSON.stringify({ type: STABLE_EVENT_TYPES.browserInput, command }));
  }

  function handleFrameClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!canControl || !frameRef.current || !session) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const scaleX = session.viewport.width / bounds.width;
    const scaleY = session.viewport.height / bounds.height;
    sendCommand({
      type: "click",
      x: Math.max(0, Math.round((event.clientX - bounds.left) * scaleX)),
      y: Math.max(0, Math.round((event.clientY - bounds.top) * scaleY)),
    });
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1200);
  }

  function handleUrlKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") navigate();
  }

  function handleTypeKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canControl && typeInput.trim()) {
        sendCommand({ type: "type", text: typeInput });
        setTypeInput("");
      }
    }
  }

  /* ---------- connection dot ---------- */

  const dotColor =
    wsState === "open" ? "bg-green" :
    wsState === "connecting" ? "bg-yellow" :
    "bg-red";

  /* =================================================================
     LOADING
     ================================================================= */

  if (initial.isLoading) {
    if (variant === "immersive") {
      return (
        <div className="flex h-screen items-center justify-center bg-bg-panel">
          <div className="text-center text-text-muted text-sm">Loading session...</div>
        </div>
      );
    }
    return <Loading label="Loading browser session..." />;
  }

  /* =================================================================
     IMMERSIVE VARIANT
     ================================================================= */

  if (variant === "immersive") {
    return (
      <div className="flex h-screen flex-col bg-bg-panel" data-testid="immersive-browser-shell">

        {/* ---- top chrome ---- */}
        <header className="flex-none border-b border-border bg-bg">

          {/* row 1: traffic lights + URL bar + actions */}
          <div className="flex items-center gap-3 px-4 py-2.5">

            {/* traffic lights */}
            <div className="flex items-center gap-1.5">
              <span className="block h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
              <span className="block h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
              <span className="block h-[11px] w-[11px] rounded-full bg-[#28c840]" />
            </div>

            {/* URL bar */}
            <div className="relative flex min-w-0 flex-1 items-center rounded border border-border bg-bg-panel">
              <Globe size={13} className="ml-3 flex-none text-text-faint" />
              <input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                onKeyDown={handleUrlKeyDown}
                placeholder="Enter URL..."
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] text-text outline-none placeholder:text-text-faint"
                data-testid="browser-url-input"
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={() => setUrlInput("")}
                  className="mr-1 flex-none rounded p-0.5 text-text-faint hover:text-text"
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={navigate}
                disabled={!isReady}
                className="mr-1 flex-none rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text disabled:opacity-40"
                data-testid="browser-navigate"
              >
                <ExternalLink size={13} />
              </button>
            </div>

            {/* actions */}
            <div className="flex flex-none items-center gap-1">
              {!isReady ? (
                <button
                  type="button"
                  onClick={() => ensureBrowser(urlInput || undefined)}
                  className="inline-flex items-center gap-1.5 rounded bg-text px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:opacity-90"
                  data-testid="browser-start"
                >
                  <Play size={12} /> Start
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => ensureBrowser()}
                  className="rounded p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text"
                  title="Reload session"
                  data-testid="browser-refresh"
                >
                  <RefreshCw size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={copyLink}
                disabled={!shareUrl}
                className="rounded p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text disabled:opacity-40"
                title={linkCopied ? "Copied!" : "Copy share link"}
                data-testid="browser-copy-link"
              >
                <Copy size={14} />
              </button>

              {workspaceHref && (
                <a
                  href={workspaceHref}
                  className="rounded p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text"
                  title="Back to workspace"
                >
                  <Monitor size={14} />
                </a>
              )}
            </div>
          </div>

          {/* row 2: status strip */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-1.5 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5" data-testid="browser-status">
              <span className={`block h-[7px] w-[7px] rounded-full ${dotColor}`} />
              {wsState === "open" ? "Connected" : wsState === "connecting" ? "Connecting..." : "Disconnected"}
            </span>

            <span className="text-border-strong">|</span>

            <span className="truncate" data-testid="browser-display-url">
              {session?.navigation.displayUrl ?? "No page loaded"}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {session?.controller ? (
                <span className="flex items-center gap-1 text-text">
                  <Lock size={10} />
                  {session.controller.email ?? session.controller.deviceId.slice(0, 8)}
                </span>
              ) : (
                <span className="text-text-faint">No controller</span>
              )}

              <span className="text-text-faint">
                {session?.viewport.width ?? 0}&times;{session?.viewport.height ?? 0}
              </span>
            </div>
          </div>
        </header>

        {/* ---- frame area ---- */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#1a1a24] p-2">
          {frame ? (
            <img
              ref={frameRef}
              src={`data:${frame.mimeType};base64,${frame.imageBase64}`}
              alt="Remote browser"
              onClick={handleFrameClick}
              data-testid="browser-frame"
              className={`block max-h-full max-w-full rounded shadow-[0_8px_40px_rgba(0,0,0,0.5)] ${canControl ? "cursor-crosshair" : "cursor-default"}`}
              draggable={false}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06]">
                <Globe size={28} className="text-white/30" />
              </div>
              <div className="text-[17px] font-semibold text-white/80">No live frame</div>
              <div className="mt-1.5 text-[13px] leading-5 text-white/40">
                Start a browser session to begin streaming. Localhost pages stay inside the shared browser and are never exposed as raw ports.
              </div>
              <button
                type="button"
                onClick={() => ensureBrowser(urlInput || undefined)}
                className="mt-5 inline-flex items-center gap-1.5 rounded bg-white/10 px-4 py-2 text-[13px] font-medium text-white/80 transition hover:bg-white/15"
                data-testid="browser-empty-start"
              >
                <Play size={13} /> Start browser
              </button>
            </div>
          )}

          {/* floating error */}
          {(error || initial.isError) && (
            <div className="absolute bottom-14 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4">
              <div className="rounded border border-red/30 bg-red-bg px-3 py-2 text-[12px] text-red shadow-lg">
                {error ?? (initial.error as Error).message}
              </div>
            </div>
          )}
        </div>

        {/* ---- bottom control bar ---- */}
        <footer className="flex-none border-t border-border bg-bg">

          {/* collapsed bar */}
          <div className="flex items-center gap-2 px-4 py-2">
            {/* control toggle */}
            {isReady && (
              session?.controller ? (
                canControl ? (
                  <button
                    type="button"
                    onClick={releaseControl}
                    className="inline-flex items-center gap-1.5 rounded border border-green/30 bg-green-bg px-2.5 py-1 text-[11px] font-medium text-green transition hover:opacity-80"
                    data-testid="browser-release-control"
                  >
                    <Unlock size={11} /> You have control
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[11px] text-text-muted">
                    <Lock size={11} /> {session.controller.email ?? "Someone"} has control
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={acquireControl}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-panel px-2.5 py-1 text-[11px] font-medium text-text transition hover:bg-bg-hover"
                  data-testid="browser-take-control"
                >
                  <MousePointerClick size={11} /> Take control
                </button>
              )
            )}

            <div className="flex-1" />

            {/* quick keys */}
            {canControl && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => sendCommand({ type: "key", key: "Tab" })}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-text-muted transition hover:bg-bg-hover"
                  data-testid="browser-key-tab"
                >
                  Tab
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand({ type: "key", key: "Enter" })}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-text-muted transition hover:bg-bg-hover"
                  data-testid="browser-key-enter"
                >
                  Enter
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand({ type: "key", key: "Escape" })}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-text-muted transition hover:bg-bg-hover"
                  data-testid="browser-key-escape"
                >
                  Esc
                </button>
              </div>
            )}

            {/* drawer toggle */}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="ml-1 inline-flex items-center gap-1 rounded p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text"
              title="Type into focused field"
            >
              <Keyboard size={14} />
              {drawerOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          </div>

          {/* expanded typing drawer */}
          {drawerOpen && (
            <div className="border-t border-border px-4 pb-3 pt-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={typeInput}
                  onChange={(event) => setTypeInput(event.target.value)}
                  onKeyDown={handleTypeKeyDown}
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded border border-border bg-bg-panel px-3 py-2 text-[13px] text-text outline-none placeholder:text-text-faint"
                  placeholder="Type text into the focused field, then press Enter or Send"
                  data-testid="browser-type-input"
                />
                <button
                  type="button"
                  onClick={() => {
                    sendCommand({ type: "type", text: typeInput });
                    setTypeInput("");
                  }}
                  disabled={!canControl || !typeInput.trim()}
                  className="rounded bg-text px-3 py-2 text-[12px] font-medium text-bg transition hover:opacity-90 disabled:opacity-40"
                  data-testid="browser-type-submit"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    );
  }

  /* =================================================================
     WORKSPACE VARIANT
     ================================================================= */

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="flex flex-col gap-3">

        {/* toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex min-w-0 flex-1 items-center rounded-sm border border-border bg-bg">
            <Globe size={13} className="ml-3 flex-none text-text-faint" />
            <input
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="Enter URL..."
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[12px] text-text outline-none placeholder:text-text-faint"
              data-testid="browser-url-input"
            />
            <button
              type="button"
              onClick={navigate}
              disabled={!isReady}
              className="mr-1.5 flex-none rounded p-1 text-text-muted hover:text-text disabled:opacity-40"
              data-testid="browser-navigate"
            >
              <ExternalLink size={12} />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => ensureBrowser(urlInput || undefined)} data-testid="browser-start">
              <Play size={12} /> Start
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ensureBrowser()} data-testid="browser-refresh">
              <RefreshCw size={12} />
            </Button>
            <Button size="sm" variant="ghost" onClick={copyLink} disabled={!shareUrl} data-testid="browser-copy-link">
              <Copy size={12} /> {linkCopied ? "Copied" : "Link"}
            </Button>
          </div>
        </div>

        {/* status line */}
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5" data-testid="browser-status">
            {wsState === "open" ? <Wifi size={11} /> : <WifiOff size={11} />}
            {isReady ? "Ready" : "Idle"}
          </span>
          <span className="truncate" data-testid="browser-display-url">
            {session?.navigation.displayUrl ?? "Not started"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {session?.controller ? (
              <span className="flex items-center gap-1 text-text">
                <Lock size={10} /> {session.controller.email ?? session.controller.deviceId.slice(0, 8)}
              </span>
            ) : null}
          </div>
        </div>

        {/* frame */}
        <div className="rounded-sm border border-border bg-[#1a1a24] p-2 shadow-sm">
          {frame ? (
            <img
              ref={frameRef}
              src={`data:${frame.mimeType};base64,${frame.imageBase64}`}
              alt="Shared browser frame"
              onClick={handleFrameClick}
              data-testid="browser-frame"
              className={`block w-full rounded-sm ${canControl ? "cursor-crosshair" : "cursor-default"}`}
              draggable={false}
            />
          ) : (
            <Empty
              title="No live frame yet"
              description="Start the browser session to stream the shared page."
              action={
                <Button onClick={() => ensureBrowser(urlInput || undefined)} data-testid="browser-empty-start">
                  Start browser
                </Button>
              }
            />
          )}
        </div>

        {/* controls */}
        <div className="rounded-sm border border-border bg-bg p-3 shadow-sm">
          <div className="flex items-center gap-2">
            {isReady && !session?.controller && (
              <Button size="sm" onClick={acquireControl} data-testid="browser-take-control">
                <MousePointerClick size={12} /> Take control
              </Button>
            )}
            {canControl && (
              <Button size="sm" variant="ghost" onClick={releaseControl} data-testid="browser-release-control">
                <Unlock size={12} /> Release
              </Button>
            )}
            {canControl && (
              <>
                <Button size="sm" variant="ghost" onClick={() => sendCommand({ type: "key", key: "Tab" })} data-testid="browser-key-tab">Tab</Button>
                <Button size="sm" variant="ghost" onClick={() => sendCommand({ type: "key", key: "Enter" })} data-testid="browser-key-enter">Enter</Button>
                <Button size="sm" variant="ghost" onClick={() => sendCommand({ type: "key", key: "Escape" })} data-testid="browser-key-escape">Esc</Button>
              </>
            )}
            <span className="ml-auto text-[11px] text-text-faint">
              {session?.viewport.width ?? 0}&times;{session?.viewport.height ?? 0}
            </span>
          </div>

          {canControl && (
            <div className="mt-2 flex items-end gap-2">
              <textarea
                value={typeInput}
                onChange={(event) => setTypeInput(event.target.value)}
                onKeyDown={handleTypeKeyDown}
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-sm border border-border bg-bg-panel px-3 py-2 text-[12px] text-text outline-none placeholder:text-text-faint"
                placeholder="Type into the focused field..."
                data-testid="browser-type-input"
              />
              <Button
                size="sm"
                onClick={() => {
                  sendCommand({ type: "type", text: typeInput });
                  setTypeInput("");
                }}
                disabled={!typeInput.trim()}
                data-testid="browser-type-submit"
              >
                Send
              </Button>
            </div>
          )}
        </div>

        {(error || initial.isError) && (
          <ErrorMsg message={error ?? (initial.error as Error).message} />
        )}
      </div>
    </div>
  );
}
