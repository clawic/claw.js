import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
  HardDrive,
  Hash,
  Link as LinkIcon,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  type ApiError,
  createShare,
  deleteObject,
  fetchObject,
  fetchOwnerToken,
  listBuckets,
  listObjects,
  putObject,
  revokeShare,
} from "./lib/api";
import {
  formatBytes,
  formatTime,
  isAudio,
  isImage,
  isPdf,
  isTextLike,
  isVideo,
  shortHash,
} from "./lib/format";
import { breadcrumbs, buildEntries, type Entry } from "./lib/tree";
import type { StorageObject, StorageShare } from "./lib/types";

const TOKEN_KEY = "storageAccessToken";
const BUCKET_KEY = "storageBucket";
const DEFAULT_BUCKET = "workspace";
const PREVIEW_TEXT_LIMIT = 256 * 1024;

function readLaunchSession() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim() || sessionStorage.getItem(TOKEN_KEY);
  const bucket = params.get("bucket")?.trim() || sessionStorage.getItem(BUCKET_KEY) || DEFAULT_BUCKET;
  if (params.has("token") || params.has("bucket")) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(BUCKET_KEY, bucket);
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  }
  return { token, bucket };
}

interface PreviewState {
  url: string;
  blob: Blob;
  contentType: string;
  text?: string;
  truncated?: boolean;
}

export function App() {
  const launchSession = useMemo(() => readLaunchSession(), []);
  const [token, setToken] = useState<string | null>(() => launchSession.token);
  const [isOwnerSession, setIsOwnerSession] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [bucket, setBucket] = useState<string>(
    () => launchSession.bucket,
  );
  const [bucketInput, setBucketInput] = useState(bucket);
  const [knownBuckets, setKnownBuckets] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [selected, setSelected] = useState<StorageObject | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [shares, setShares] = useState<StorageShare[]>([]);
  const [shareLabel, setShareLabel] = useState("Storage share");
  const [shareTtl, setShareTtl] = useState<string>("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const entries = useMemo(() => buildEntries(objects, prefix), [objects, prefix]);
  const trail = useMemo(() => breadcrumbs(prefix), [prefix]);

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => releasePreview(), [releasePreview]);

  useEffect(() => {
    if (autoLoginAttempted) return;
    if (token) {
      setIsOwnerSession(token.startsWith("stg_owner_"));
      setAutoLoginAttempted(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const ownerToken = await fetchOwnerToken().catch(() => null);
      if (cancelled) return;
      if (ownerToken) {
        sessionStorage.setItem(TOKEN_KEY, ownerToken);
        setToken(ownerToken);
        setIsOwnerSession(true);
        setStatus("Signed in as owner");
      }
      setAutoLoginAttempted(true);
    })();
    return () => { cancelled = true; };
  }, [token, autoLoginAttempted]);

  useEffect(() => {
    if (!token) {
      setKnownBuckets([]);
      return;
    }
    let cancelled = false;
    listBuckets(token)
      .then((buckets) => { if (!cancelled) setKnownBuckets(buckets); })
      .catch(() => { if (!cancelled) setKnownBuckets([]); });
    return () => { cancelled = true; };
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const items = await listObjects(token, { bucket, limit: 1000 });
      setObjects(items);
      setError("");
      setStatus(`Loaded ${items.length} object${items.length === 1 ? "" : "s"}`);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message);
      if (apiError.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    } finally {
      setBusy(false);
    }
  }, [token, bucket]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError("Token required");
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, trimmed);
    sessionStorage.setItem(BUCKET_KEY, bucketInput || DEFAULT_BUCKET);
    setBucket(bucketInput || DEFAULT_BUCKET);
    setToken(trimmed);
    setIsOwnerSession(trimmed.startsWith("stg_owner_"));
    setTokenInput("");
    setError("");
    setStatus("Signed in");
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setIsOwnerSession(false);
    setObjects([]);
    setSelected(null);
    releasePreview();
    setPreview(null);
    setShares([]);
    setStatus("Signed out");
  }

  function changeBucket(next: string) {
    const value = next.trim() || DEFAULT_BUCKET;
    sessionStorage.setItem(BUCKET_KEY, value);
    setBucket(value);
    setPrefix("");
    setSelected(null);
    releasePreview();
    setPreview(null);
    setShares([]);
  }

  async function openEntry(entry: Entry) {
    if (entry.kind === "folder") {
      setPrefix(entry.prefix);
      setSelected(null);
      releasePreview();
      setPreview(null);
      return;
    }
    setSelected(entry.object);
    setShares([]);
    if (!token) return;
    setPreviewLoading(true);
    releasePreview();
    setPreview(null);
    try {
      const result = await fetchObject(token, entry.object.bucket, entry.object.key);
      const url = URL.createObjectURL(result.blob);
      previewUrlRef.current = url;
      let text: string | undefined;
      let truncated = false;
      if (isTextLike(result.contentType)) {
        const slice = result.blob.slice(0, PREVIEW_TEXT_LIMIT);
        text = await slice.text();
        truncated = result.blob.size > PREVIEW_TEXT_LIMIT;
      }
      setPreview({ url, blob: result.blob, contentType: result.contentType, text, truncated });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  function goUp() {
    if (!prefix) return;
    const parts = prefix.split("/").filter(Boolean);
    parts.pop();
    setPrefix(parts.length ? `${parts.join("/")}/` : "");
    setSelected(null);
    releasePreview();
    setPreview(null);
  }

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !token) return;
    setBusy(true);
    try {
      const key = `${prefix}${file.name}`;
      await putObject(token, {
        bucket,
        key,
        data: file,
        contentType: file.type || "application/octet-stream",
      });
      setStatus(`Uploaded ${file.name}`);
      await refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!token || !selected) return;
    if (!window.confirm(`Delete ${selected.key}?`)) return;
    setBusy(true);
    try {
      await deleteObject(token, selected.bucket, selected.key);
      setStatus(`Deleted ${selected.key}`);
      setSelected(null);
      releasePreview();
      setPreview(null);
      await refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadPreview() {
    if (!preview || !selected) return;
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = selected.key.split("/").pop() ?? "object";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function makeShare() {
    if (!token || !selected) return;
    setBusy(true);
    try {
      const ttlMs = shareTtl ? Number(shareTtl) * 60_000 : undefined;
      const share = await createShare(token, {
        bucket: selected.bucket,
        key: selected.key,
        label: shareLabel || "Storage share",
        ttlMs,
      });
      setShares((current) => [share, ...current]);
      try {
        const absolute = new URL(share.url, window.location.origin).toString();
        await navigator.clipboard.writeText(absolute);
        setStatus("Share link copied to clipboard");
      } catch {
        setStatus("Share created");
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function dropShare(share: StorageShare) {
    if (!token) return;
    setBusy(true);
    try {
      await revokeShare(token, share.id);
      setShares((current) =>
        current.map((entry) =>
          entry.id === share.id
            ? { ...entry, revokedAt: new Date().toISOString() }
            : entry,
        ),
      );
      setStatus("Share revoked");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!autoLoginAttempted) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ alignItems: "center", textAlign: "center" }}>
          <HardDrive size={32} color="var(--accent)" />
          <p className="lede">Looking for an owner session…</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={signIn}>
          <div className="brand-lockup">
            <HardDrive size={32} />
            <div>
              <p className="eyebrow">Local-first workspace</p>
              <h1>Storage</h1>
            </div>
          </div>
          <p className="lede">
            Owner session not found on this host. Paste a scoped storage token to continue, or run
            {" "}<code>npm --prefix storage run dev</code> on this machine to expose the owner endpoint.
          </p>
          <label>
            Bucket
            <input
              value={bucketInput}
              onChange={(event) => setBucketInput(event.target.value)}
              placeholder={DEFAULT_BUCKET}
            />
          </label>
          <label>
            Token
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="stg_…"
              autoFocus
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn-primary" type="submit">Open storage</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <HardDrive size={24} />
          <div>
            <span>Claw</span>
            <strong>Storage</strong>
          </div>
          {isOwnerSession ? <span className="owner-badge" title="Owner session">owner</span> : null}
        </div>

        <div className="bucket-rail">
          <span className="section-label">Bucket</span>
          <div className="bucket-row">
            <input
              value={bucketInput}
              onChange={(event) => setBucketInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") changeBucket(bucketInput);
              }}
              placeholder={DEFAULT_BUCKET}
              list="known-buckets"
            />
            <button
              className="btn-ghost"
              onClick={() => changeBucket(bucketInput)}
              title="Switch bucket"
            >
              <FolderOpen size={14} />
            </button>
          </div>
          {knownBuckets.length > 0 ? (
            <datalist id="known-buckets">
              {knownBuckets.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          ) : null}
          {knownBuckets.length > 0 ? (
            <div className="bucket-list">
              {knownBuckets.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={entry === bucket ? "active" : ""}
                  onClick={() => {
                    setBucketInput(entry);
                    changeBucket(entry);
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
          ) : null}
          <p className="bucket-current">Active: <strong>{bucket}</strong></p>
        </div>

        <div className="action-rail">
          <button
            className="btn-secondary"
            onClick={() => uploadRef.current?.click()}
            disabled={busy}
          >
            <Upload size={14} /> Upload here
          </button>
          <button className="btn-ghost" onClick={refresh} disabled={busy}>
            <RefreshCw size={14} /> Refresh
          </button>
          <input
            ref={uploadRef}
            hidden
            type="file"
            onChange={onUpload}
          />
        </div>

        <div className="sidebar-footer">
          <p className="status-text" title={status}>{busy ? "Working…" : status}</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button onClick={() => setPrefix("")}>
              <FolderOpen size={14} /> {bucket}
            </button>
            {trail.map((entry) => (
              <span key={entry.prefix}>
                <ChevronRight size={12} className="separator" />
                <button onClick={() => setPrefix(entry.prefix)}>{entry.label}</button>
              </span>
            ))}
          </div>
          <div className="topbar-actions">
            {prefix ? (
              <button className="btn-ghost" onClick={goUp} title="Up">
                <ArrowUp size={14} /> Up
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="banner error-banner">
            <span>{error}</span>
            <button onClick={() => setError("")}><X size={14} /></button>
          </div>
        ) : null}

        <div className="workspace-body">
          <div className="list-pane">
            {entries.length === 0 ? (
              <div className="empty-list">
                <Folder size={32} />
                <p>No objects under this prefix.</p>
              </div>
            ) : (
              <table className="object-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Type</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isSelected = entry.kind === "file" && selected?.key === entry.object.key;
                    return (
                      <tr
                        key={entry.kind === "folder" ? entry.prefix : entry.object.key}
                        className={isSelected ? "selected" : ""}
                        onClick={() => openEntry(entry)}
                      >
                        <td>
                          <span className={`row-icon ${entry.kind}`}>
                            {entry.kind === "folder" ? <Folder size={14} /> : <FileIcon size={14} />}
                          </span>
                          <span className="row-name">{entry.name}</span>
                          {entry.kind === "folder" ? (
                            <span className="row-meta">{entry.childCount} item{entry.childCount === 1 ? "" : "s"}</span>
                          ) : null}
                        </td>
                        <td>{entry.kind === "file" ? formatBytes(entry.object.sizeBytes) : ""}</td>
                        <td>{entry.kind === "file" ? entry.object.contentType : "folder"}</td>
                        <td>{entry.kind === "file" ? formatTime(entry.object.updatedAt) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <aside className="detail-pane">
            {selected ? (
              <>
                <div className="detail-header">
                  <p className="eyebrow">object</p>
                  <h2 title={selected.key}>{selected.key.split("/").pop()}</h2>
                  <p className="detail-key">{selected.key}</p>
                </div>

                <div className="detail-actions">
                  <button className="btn-ghost" onClick={downloadPreview} disabled={!preview}>
                    <Download size={14} /> Download
                  </button>
                  <button className="btn-ghost danger" onClick={onDelete} disabled={busy}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>

                <div className="meta-grid">
                  <div><span>Size</span><strong>{formatBytes(selected.sizeBytes)}</strong></div>
                  <div><span>Type</span><strong>{selected.contentType}</strong></div>
                  <div><span>Visibility</span><strong>{selected.visibility}</strong></div>
                  <div><span>Updated</span><strong>{formatTime(selected.updatedAt)}</strong></div>
                  <div><span>Created</span><strong>{formatTime(selected.createdAt)}</strong></div>
                  <div className="span-2"><span>Owner</span><strong>{selected.createdByAgentId}</strong></div>
                  <div className="span-2"><span><Hash size={11} /> SHA-256</span><strong className="mono">{shortHash(selected.sha256)}</strong></div>
                </div>

                <div className="preview-pane">
                  {previewLoading ? (
                    <div className="preview-loading">Loading…</div>
                  ) : preview ? (
                    <PreviewBody preview={preview} />
                  ) : (
                    <div className="preview-loading">Select an object to preview.</div>
                  )}
                </div>

                {Object.keys(selected.metadata).length > 0 ? (
                  <div className="detail-section">
                    <div className="detail-section-header"><h3>Metadata</h3></div>
                    <pre className="metadata-block">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </div>
                ) : null}

                <div className="detail-section">
                  <div className="detail-section-header"><h3><LinkIcon size={12} /> Shares</h3></div>
                  <div className="share-controls">
                    <input
                      value={shareLabel}
                      onChange={(event) => setShareLabel(event.target.value)}
                      placeholder="Share label"
                    />
                    <input
                      value={shareTtl}
                      onChange={(event) => setShareTtl(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="TTL (min)"
                    />
                    <button className="btn-secondary" onClick={makeShare} disabled={busy}>
                      <Share2 size={14} /> Create
                    </button>
                  </div>
                  <p className="hint">
                    Shares created in this session appear below. Listing existing shares is not exposed by the storage HTTP API.
                  </p>
                  <div className="share-list">
                    {shares.length === 0 ? (
                      <p className="empty-share">No shares created here yet.</p>
                    ) : (
                      shares.map((share) => (
                        <article key={share.id} className="mini-card">
                          <div className="share-row">
                            <strong>{share.label}</strong>
                            <span className={`share-badge ${share.revokedAt ? "revoked" : "active"}`}>
                              {share.revokedAt ? "revoked" : "active"}
                            </span>
                          </div>
                          <div className="share-row">
                            <code className="mono share-url" title={share.url}>{share.url}</code>
                            <button
                              className="btn-ghost"
                              title="Copy"
                              onClick={() => {
                                const absolute = new URL(share.url, window.location.origin).toString();
                                navigator.clipboard.writeText(absolute).catch(() => undefined);
                                setStatus("Share URL copied");
                              }}
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                          {share.expiresAt ? (
                            <p className="hint">Expires {formatTime(share.expiresAt)}</p>
                          ) : null}
                          {!share.revokedAt ? (
                            <button className="btn-ghost danger" onClick={() => dropShare(share)}>
                              Revoke
                            </button>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-detail">
                <FileIcon size={32} />
                <h2>No object selected</h2>
                <p>Pick an object on the left to inspect, preview, or share.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function PreviewBody({ preview }: { preview: PreviewState }) {
  if (isImage(preview.contentType)) {
    return <img src={preview.url} alt="preview" />;
  }
  if (isPdf(preview.contentType)) {
    return <iframe title="preview" src={preview.url} />;
  }
  if (isAudio(preview.contentType)) {
    return <audio controls src={preview.url} />;
  }
  if (isVideo(preview.contentType)) {
    return <video controls src={preview.url} />;
  }
  if (preview.text !== undefined) {
    return (
      <>
        <pre className="text-preview">{preview.text}</pre>
        {preview.truncated ? (
          <p className="hint">Preview truncated. Download to see the full object.</p>
        ) : null}
      </>
    );
  }
  return (
    <div className="preview-loading">
      <p>Binary content. Use Download to retrieve.</p>
    </div>
  );
}
