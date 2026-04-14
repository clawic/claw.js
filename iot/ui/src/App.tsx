import { useEffect, useState } from "react";

type StatePayload = {
  snapshot: {
    home: { id: string; label: string };
    things: Array<{
      id: string;
      label: string;
      kind: string;
      risk: string;
      capabilities: Array<{ key: string; observedValue: unknown; unit?: string }>;
    }>;
  };
};

type ScenePayload = {
  scenes: Array<{ id: string; label: string; description?: string }>;
};

type ApprovalPayload = {
  approvals: Array<{ id: string; status: string; reason: string }>;
};

type EventPayload = {
  events: Array<{ id: string; type: string; createdAt: string; payload: Record<string, unknown> }>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return await response.json() as T;
}

const NAV_ITEMS = [
  { id: "things", icon: "ri-cpu-line", label: "Things" },
  { id: "scenes", icon: "ri-sparkling-2-line", label: "Scenes" },
  { id: "approvals", icon: "ri-shield-check-line", label: "Approvals" },
  { id: "timeline", icon: "ri-time-line", label: "Timeline" },
] as const;

export default function App() {
  const [state, setState] = useState<StatePayload | null>(null);
  const [scenes, setScenes] = useState<ScenePayload | null>(null);
  const [approvals, setApprovals] = useState<ApprovalPayload | null>(null);
  const [events, setEvents] = useState<EventPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [statePayload, scenePayload, approvalPayload, eventPayload] = await Promise.all([
      fetchJson<StatePayload>("/v1/state"),
      fetchJson<ScenePayload>("/v1/scenes"),
      fetchJson<ApprovalPayload>("/v1/approvals"),
      fetchJson<EventPayload>("/v1/events?limit=8"),
    ]);
    setState(statePayload);
    setScenes(scenePayload);
    setApprovals(approvalPayload);
    setEvents(eventPayload);
  };

  useEffect(() => {
    void load();
  }, []);

  const activateScene = async (sceneId: string) => {
    setBusy(sceneId);
    await fetch(`/v1/scenes/${sceneId}/activate`, { method: "POST" });
    await load();
    setBusy(null);
  };

  const approve = async (approvalId: string) => {
    setBusy(approvalId);
    await fetch(`/v1/approvals/${approvalId}/approve`, { method: "POST" });
    await load();
    setBusy(null);
  };

  const pendingCount = approvals?.approvals.filter((a) => a.status === "pending").length ?? 0;

  return (
    <main className="app-shell" data-testid="iot-console">
      {/* ---- Sidebar rail ---- */}
      <aside className="rail" aria-label="Primary">
        <div className="rail-logo">
          <a className="hero-brand" href="/" title="IoT Console">
            <img src="/brand/logo.png" alt="ClawJS" />
          </a>
        </div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rail-item active"
              title={item.label}
              aria-label={item.label}
            >
              <i className={item.icon} />
              {item.id === "approvals" && pendingCount > 0 && (
                <span className="badge">{pendingCount}</span>
              )}
            </a>
          ))}
        </nav>
      </aside>

      {/* ---- Main content ---- */}
      <div className="main">
        <header className="page-header">
          <div className="header-info">
            <h1>{state?.snapshot.home.label ?? "IoT Home"}</h1>
            <p className="subtitle">Control plane for devices, scenes, approvals and timelines</p>
          </div>
          <div className="header-actions">
            <span className="status-pill">
              <span className="dot" />
              Live
            </span>
          </div>
        </header>

        <section className="dashboard">
          {/* ---- Things ---- */}
          <article className="panel" data-testid="iot-things-panel">
            <div className="panel-header">
              <h2><i className="ri-cpu-line" /> Things</h2>
              <span className="panel-count">{state?.snapshot.things.length ?? 0}</span>
            </div>
            <div className="panel-body">
              {state?.snapshot.things.map((thing) => (
                <div className="thing-card" key={thing.id} data-testid={`iot-thing-${thing.id}`}>
                  <div className="thing-meta">
                    <strong>{thing.label}</strong>
                    <p>{thing.kind} · {thing.risk}</p>
                  </div>
                  <ul className="thing-caps">
                    {thing.capabilities.map((cap) => (
                      <li key={cap.key}>
                        <span className="cap-key">{cap.key}</span>
                        <span className="cap-value">
                          {String(cap.observedValue)}{cap.unit ? ` ${cap.unit}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          {/* ---- Scenes ---- */}
          <article className="panel" data-testid="iot-scenes-panel">
            <div className="panel-header">
              <h2><i className="ri-sparkling-2-line" /> Scenes</h2>
              <span className="panel-count">{scenes?.scenes.length ?? 0}</span>
            </div>
            <div className="panel-body">
              <div className="scene-list">
                {scenes?.scenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    className="scene-button"
                    data-testid={`iot-scene-${scene.id}`}
                    disabled={busy === scene.id}
                    onClick={() => void activateScene(scene.id)}
                  >
                    <span className="scene-icon">
                      <i className="ri-sparkling-2-line" />
                    </span>
                    <span className="scene-info">
                      <strong>{scene.label}</strong>
                      <span>{scene.description ?? "Run scene"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </article>

          {/* ---- Approvals ---- */}
          <article className="panel" data-testid="iot-approvals-panel">
            <div className="panel-header">
              <h2><i className="ri-shield-check-line" /> Approvals</h2>
              <span className="panel-count">{pendingCount}</span>
            </div>
            <div className="panel-body">
              <div className="approval-list">
                {approvals?.approvals.length ? approvals.approvals.map((approval) => (
                  <div
                    className="approval-card"
                    key={approval.id}
                    data-testid={`iot-approval-${approval.id}`}
                  >
                    <span className={`approval-status ${approval.status}`}>
                      <i className={
                        approval.status === "pending"
                          ? "ri-time-line"
                          : "ri-check-line"
                      } />
                    </span>
                    <div className="approval-meta">
                      <strong>{approval.status}</strong>
                      <p>{approval.reason}</p>
                    </div>
                    {approval.status === "pending" ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void approve(approval.id)}
                        disabled={busy === approval.id}
                      >
                        Approve
                      </button>
                    ) : null}
                  </div>
                )) : <p className="empty">No approvals pending.</p>}
              </div>
            </div>
          </article>

          {/* ---- Timeline ---- */}
          <article className="panel" data-testid="iot-events-panel">
            <div className="panel-header">
              <h2><i className="ri-time-line" /> Timeline</h2>
              <span className="panel-count">{events?.events.length ?? 0}</span>
            </div>
            <div className="panel-body">
              <div className="event-list">
                {events?.events.map((event) => (
                  <div className="event-row" key={event.id}>
                    <span className="event-type">
                      <i className="ri-flashlight-line" />
                      {event.type}
                    </span>
                    <span className="event-time">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
