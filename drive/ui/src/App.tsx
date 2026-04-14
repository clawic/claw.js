import {
  type ChangeEvent,
  type FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Grid3x3,
  LayoutTemplate,
  List,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  Clock,
  History,
  Link,
  Users,
} from "lucide-react";

import type {
  DriveComment,
  DriveDocBlock,
  DriveDocContent,
  DriveItem,
  DriveItemDetail,
  DriveRevision,
  DriveShareRecord,
  DriveSheetContent,
  DriveSlideContent,
  DriveView,
  DriveViewCounts,
} from "../../src/shared/types";

type ListResponse = {
  items: DriveItem[];
  counts: DriveViewCounts;
  breadcrumbs: Array<{ id: string; name: string }>;
};

type ApiError = Error & { status?: number; body?: unknown };

const defaultCounts: DriveViewCounts = {
  myDrive: 0,
  recent: 0,
  starred: 0,
  shared: 0,
  trash: 0,
};

function itemIcon(kind: DriveItem["kind"]) {
  switch (kind) {
    case "folder":
      return <Folder size={16} />;
    case "doc":
      return <FileText size={16} />;
    case "sheet":
      return <FileSpreadsheet size={16} />;
    case "slide":
      return <LayoutTemplate size={16} />;
    default:
      return <File size={16} />;
  }
}

function iconClass(kind: DriveItem["kind"]) {
  switch (kind) {
    case "folder": return "folder";
    case "doc": return "doc";
    case "sheet": return "sheet";
    case "slide": return "slide";
    default: return "upload";
  }
}

const navItems: Array<{ view: DriveView; label: string; icon: typeof Folder; countKey: keyof DriveViewCounts }> = [
  { view: "my-drive", label: "My Drive", icon: FolderOpen, countKey: "myDrive" },
  { view: "recent", label: "Recent", icon: Clock, countKey: "recent" },
  { view: "starred", label: "Starred", icon: Star, countKey: "starred" },
  { view: "shared", label: "Shared", icon: Users, countKey: "shared" },
  { view: "trash", label: "Trash", icon: Trash2, countKey: "trash" },
];

function request<T>(token: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(path, { ...init, headers }).then(async (response) => {
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text();
    if (!response.ok) {
      const error = new Error(
        (body as { message?: string; error?: string } | null)?.message
        || (body as { message?: string; error?: string } | null)?.error
        || `HTTP ${response.status}`,
      ) as ApiError;
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body as T;
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function evaluateCell(rows: string[][], rowIndex: number, colIndex: number, stack = new Set<string>()): string {
  const raw = rows[rowIndex]?.[colIndex] ?? "";
  if (!raw.startsWith("=")) return raw;
  const expression = raw.slice(1).replace(/[A-Z]+\d+/g, (reference) => {
    const columnLabel = reference.match(/[A-Z]+/)?.[0] ?? "A";
    const rowLabel = Number(reference.match(/\d+/)?.[0] ?? "1") - 1;
    let column = 0;
    for (const char of columnLabel) {
      column = column * 26 + (char.charCodeAt(0) - 64);
    }
    const key = `${rowLabel}:${column - 1}`;
    if (stack.has(key)) return "0";
    stack.add(key);
    const nested = evaluateCell(rows, rowLabel, column - 1, stack);
    stack.delete(key);
    const numeric = Number(nested);
    return Number.isFinite(numeric) ? String(numeric) : "0";
  });
  const parts = expression.split("+").map((piece) => piece.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const total = parts.reduce((sum, piece) => sum + (Number(piece) || 0), 0);
  return String(total);
}

export function App() {
  const shareToken = new URLSearchParams(window.location.search).get("share");
  const shareItemId = new URLSearchParams(window.location.search).get("item");

  const [token, setToken] = useState<string | null>(() => shareToken || sessionStorage.getItem("driveAccessToken"));
  const [email, setEmail] = useState<string>(() => sessionStorage.getItem("driveEmail") ?? "admin@localhost");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("Ready");
  const [view, setView] = useState<DriveView>("my-drive");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [counts, setCounts] = useState<DriveViewCounts>(defaultCounts);
  const [selectedItem, setSelectedItem] = useState<DriveItemDetail | null>(null);
  const [comments, setComments] = useState<DriveComment[]>([]);
  const [revisions, setRevisions] = useState<DriveRevision[]>([]);
  const [shares, setShares] = useState<DriveShareRecord[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [docDraft, setDocDraft] = useState<DriveDocContent | null>(null);
  const [sheetDraft, setSheetDraft] = useState<DriveSheetContent | null>(null);
  const [slideDraft, setSlideDraft] = useState<DriveSlideContent | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [commentBody, setCommentBody] = useState("");
  const [shareLabel, setShareLabel] = useState("Agent review link");
  const [conflictRevisionId, setConflictRevisionId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  async function refreshList(nextSelectedId?: string | null) {
    if (!token) return;
    const query = deferredSearch.trim();
    const response = await request<ListResponse>(token, `/v1/items?view=${encodeURIComponent(query ? "my-drive" : view)}${currentFolderId ? `&parentId=${encodeURIComponent(currentFolderId)}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
    setItems(response.items);
    setCounts(response.counts);
    setBreadcrumbs(response.breadcrumbs);
    if (nextSelectedId) {
      const next = response.items.find((item) => item.id === nextSelectedId);
      if (!next) {
        setSelectedItem(null);
      }
    }
  }

  async function loadDetail(itemId: string) {
    if (!token) return;
    await request(token, `/v1/items/${itemId}/view`, { method: "POST" });
    const [detail, commentRes, revisionRes, shareRes] = await Promise.all([
      request<DriveItemDetail>(token, `/v1/items/${itemId}`),
      request<{ items: DriveComment[] }>(token, `/v1/items/${itemId}/comments`),
      request<{ items: DriveRevision[] }>(token, `/v1/items/${itemId}/revisions`),
      request<{ items: DriveShareRecord[] }>(token, `/v1/items/${itemId}/shares`).catch(() => ({ items: [] })),
    ]);
    setSelectedItem(detail);
    setComments(commentRes.items);
    setRevisions(revisionRes.items);
    setShares(shareRes.items);
    setConflictRevisionId(null);
    if (detail.content?.kind === "doc") setDocDraft(clone(detail.content));
    if (detail.content?.kind === "sheet") setSheetDraft(clone(detail.content));
    if (detail.content?.kind === "slide") setSlideDraft(clone(detail.content));
    setStatus(`Opened ${detail.name}`);
    refreshList(itemId).catch(() => undefined);
  }

  useEffect(() => {
    if (!token) return;
    if (shareToken && shareItemId) {
      loadDetail(shareItemId).catch((loadError: ApiError) => setError(loadError.message));
      return;
    }
    refreshList().catch((loadError: ApiError) => setError(loadError.message));
  }, [token, view, currentFolderId, deferredSearch]);

  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await request<{ accessToken: string; email: string }>(null, "/v1/auth/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("driveAccessToken", response.accessToken);
      sessionStorage.setItem("driveEmail", response.email);
      setToken(response.accessToken);
      setError("");
      setStatus("Signed in");
    } catch (loginError) {
      setError((loginError as Error).message);
    }
  }

  function logout() {
    sessionStorage.removeItem("driveAccessToken");
    sessionStorage.removeItem("driveEmail");
    setToken(null);
    setSelectedItem(null);
    setItems([]);
    setComments([]);
    setRevisions([]);
    setShares([]);
    setSearchInput("");
    setStatus("Signed out");
  }

  async function createItem(kind: "folder" | "doc" | "sheet" | "slide") {
    if (!token) return;
    const response = await request<DriveItemDetail>(token, "/v1/items", {
      method: "POST",
      body: JSON.stringify({
        kind,
        name: kind === "folder" ? "Untitled folder" : `Untitled ${kind}`,
        parentId: currentFolderId,
      }),
    });
    setStatus(`Created ${response.name}`);
    await refreshList(response.id);
    await loadDetail(response.id);
  }

  async function toggleStar(item: DriveItem) {
    if (!token) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ starred: !item.starred }),
    });
    setStatus(response.starred ? `Starred ${response.name}` : `Unstarred ${response.name}`);
    await refreshList(response.id);
    if (selectedItem?.id === response.id) setSelectedItem(response);
  }

  async function renameSelected(name: string) {
    if (!token || !selectedItem) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    setSelectedItem({ ...selectedItem, name: response.name });
    setStatus(`Renamed to ${response.name}`);
    await refreshList(response.id);
  }

  async function trashSelected() {
    if (!token || !selectedItem) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/trash`, { method: "POST" });
    setStatus(`Moved ${response.name} to trash`);
    setSelectedItem(null);
    await refreshList();
  }

  async function restoreSelected() {
    if (!token || !selectedItem) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/restore`, { method: "POST" });
    setSelectedItem(response);
    setStatus(`Restored ${response.name}`);
    await refreshList(response.id);
  }

  async function deleteSelectedForever() {
    if (!token || !selectedItem) return;
    await request(token, `/v1/items/${selectedItem.id}`, { method: "DELETE" });
    setSelectedItem(null);
    setStatus("Deleted permanently");
    await refreshList();
  }

  async function copySelected() {
    if (!token || !selectedItem) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/copy`, { method: "POST", body: JSON.stringify({ parentId: currentFolderId }) });
    setStatus(`Copied to ${response.name}`);
    await refreshList(response.id);
  }

  async function addComment() {
    if (!token || !selectedItem || !commentBody.trim()) return;
    await request<DriveComment>(token, `/v1/items/${selectedItem.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: commentBody }),
    });
    setCommentBody("");
    await loadDetail(selectedItem.id);
  }

  async function createShare() {
    if (!token || !selectedItem) return;
    const response = await request<{ share: DriveShareRecord; token: string; url: string }>(token, `/v1/items/${selectedItem.id}/shares`, {
      method: "POST",
      body: JSON.stringify({ label: shareLabel }),
    });
    setStatus(`Created share link`);
    await navigator.clipboard.writeText(response.url).catch(() => undefined);
    await loadDetail(selectedItem.id);
  }

  async function restoreRevision(revisionId: string) {
    if (!token || !selectedItem) return;
    const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/revisions/${revisionId}/restore`, { method: "POST" });
    setStatus(`Restored revision for ${response.name}`);
    await loadDetail(response.id);
  }

  async function saveCurrentContent() {
    if (!token || !selectedItem) return;
    const content = selectedItem.kind === "doc"
      ? docDraft
      : selectedItem.kind === "sheet"
        ? sheetDraft
        : selectedItem.kind === "slide"
          ? slideDraft
          : null;
    if (!content) return;
    try {
      const response = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/content`, {
        method: "POST",
        body: JSON.stringify({
          baseRevisionId: selectedItem.currentRevisionId,
          content,
          summary: "Saved from Drive UI",
        }),
      });
      setSelectedItem(response);
      setConflictRevisionId(null);
      setStatus(`Saved ${response.name}`);
      await loadDetail(response.id);
    } catch (saveError) {
      const apiError = saveError as ApiError;
      if (apiError.status === 409) {
        setConflictRevisionId((apiError.body as { currentRevisionId?: string } | null)?.currentRevisionId ?? null);
        setStatus("Revision conflict detected");
        return;
      }
      setError(apiError.message);
    }
  }

  async function saveAsDuplicate() {
    if (!token || !selectedItem) return;
    const duplicated = await request<DriveItemDetail>(token, `/v1/items/${selectedItem.id}/copy`, {
      method: "POST",
      body: JSON.stringify({ parentId: selectedItem.parentId }),
    });
    setSelectedItem(duplicated);
    const content = selectedItem.kind === "doc"
      ? docDraft
      : selectedItem.kind === "sheet"
        ? sheetDraft
        : slideDraft;
    if (content) {
      await request<DriveItemDetail>(token, `/v1/items/${duplicated.id}/content`, {
        method: "POST",
        body: JSON.stringify({ baseRevisionId: duplicated.currentRevisionId, content, summary: "Saved as duplicate after conflict" }),
      });
    }
    await loadDetail(duplicated.id);
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    if (!token || !event.target.files?.[0]) return;
    const form = new FormData();
    form.set("file", event.target.files[0]);
    if (currentFolderId) form.set("parentId", currentFolderId);
    const response = await request<DriveItemDetail>(token, "/v1/uploads", {
      method: "POST",
      body: form,
    });
    setStatus(`Uploaded ${response.name}`);
    event.target.value = "";
    await refreshList(response.id);
    await loadDetail(response.id);
  }

  async function exportSelected(format: string) {
    if (!selectedItem) return;
    window.open(`/v1/items/${selectedItem.id}/export?format=${encodeURIComponent(format)}`, "_blank", "noopener,noreferrer");
  }

  async function openItem(item: DriveItem) {
    if (item.kind === "folder") {
      startTransition(() => {
        setCurrentFolderId(item.id);
        setSelectedItem(null);
      });
      return;
    }
    await loadDetail(item.id);
  }

  const sheetPreviewRows = useMemo(() => {
    if (!sheetDraft) return [];
    const activeTab = sheetDraft.tabs[0];
    return (activeTab?.rows ?? []).map((row, rowIndex) =>
      row.map((_, colIndex) => evaluateCell(activeTab.rows, rowIndex, colIndex)),
    );
  }, [sheetDraft]);

  /* ── login ── */
  if (!token) {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={login}>
          <div className="brand-lockup">
            <img src="/brand/logo.png" alt="ClawJS" />
            <div>
              <p className="eyebrow">Local-first workspace</p>
              <h1>Drive</h1>
            </div>
          </div>
          <p className="lede">Docs, sheets, slides, uploads, and revision control in one local service.</p>
          <label>
            Email
            <input data-testid="login-email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input data-testid="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn-primary" data-testid="login-submit" type="submit">Sign in</button>
        </form>
      </div>
    );
  }

  /* ── main app ── */
  return (
    <div className="app-shell" data-testid="drive-console">
      {/* sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/brand/logo.png" alt="ClawJS" />
          <div>
            <span>Claw</span>
            <strong>Drive</strong>
          </div>
        </div>

        <div className="create-rail">
          <div className="create-grid">
            <button data-testid="create-folder" onClick={() => createItem("folder")}><Folder size={14} /> Folder</button>
            <button data-testid="create-doc" onClick={() => createItem("doc")}><FileText size={14} /> Doc</button>
            <button data-testid="create-sheet" onClick={() => createItem("sheet")}><FileSpreadsheet size={14} /> Sheet</button>
            <button data-testid="create-slide" onClick={() => createItem("slide")}><LayoutTemplate size={14} /> Slide</button>
            <button data-testid="trigger-upload" onClick={() => uploadRef.current?.click()}><Upload size={14} /> Upload</button>
          </div>
          <input ref={uploadRef} hidden type="file" onChange={uploadFile} data-testid="upload-input" />
        </div>

        <nav className="nav-groups">
          <span className="section-label">Browse</span>
          {navItems.map(({ view: navView, label, icon: Icon, countKey }) => (
            <button
              key={navView}
              data-testid={`nav-${navView}`}
              className={view === navView ? "active" : ""}
              onClick={() => {
                setView(navView);
                setCurrentFolderId(null);
                setSelectedItem(null);
              }}
            >
              <Icon size={16} />
              <span className="nav-label">{label}</span>
              {counts[countKey] > 0 ? <span className="nav-count">{counts[countKey]}</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="status-text">{status}</p>
          <button onClick={logout}><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      {/* workspace */}
      <section className="workspace">
        <header className="topbar">
          <div className="search-box">
            <Search size={15} />
            <input
              data-testid="drive-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search files..."
            />
          </div>
          <div className="topbar-actions">
            <button
              className="btn-ghost"
              onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              title={viewMode === "list" ? "Grid view" : "List view"}
            >
              {viewMode === "list" ? <Grid3x3 size={16} /> : <List size={16} />}
            </button>
            {selectedItem ? (
              <button className="btn-ghost" onClick={() => renameSelected(`${selectedItem.name} updated`)}>
                Quick rename
              </button>
            ) : null}
          </div>
        </header>

        <div className="breadcrumbs">
          <button onClick={() => { setCurrentFolderId(null); setBreadcrumbs([]); }}>
            <FolderOpen size={14} /> Root
          </button>
          {breadcrumbs.map((entry) => (
            <span key={entry.id}>
              <ChevronRight size={12} className="separator" />
              <button onClick={() => setCurrentFolderId(entry.id)}>{entry.name}</button>
            </span>
          ))}
          {currentFolderId && selectedItem?.kind !== "folder" && selectedItem ? (
            <>
              <ChevronRight size={12} className="separator" />
              <span className="current-name">{selectedItem.name}</span>
            </>
          ) : null}
        </div>

        {conflictRevisionId ? (
          <div className="conflict-banner" data-testid="conflict-banner">
            <span>Conflict: a newer revision exists.</span>
            <button className="btn-ghost" onClick={() => selectedItem && loadDetail(selectedItem.id)}><RefreshCw size={14} /> Reload</button>
            <button className="btn-ghost" onClick={saveAsDuplicate}><Copy size={14} /> Save as copy</button>
            <span>Rev: {conflictRevisionId.slice(0, 8)}</span>
          </div>
        ) : null}

        <div className="workspace-body">
          {/* file list */}
          <div className="list-pane">
            {items.length === 0 ? (
              <div className="empty-list">
                <Folder size={32} />
                <p>No items here yet</p>
              </div>
            ) : (
              <div className={viewMode === "list" ? "item-list" : "item-grid"} data-testid="drive-home">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className={`item-card ${selectedItem?.id === item.id ? "selected" : ""}`}
                    onClick={() => openItem(item)}
                    data-testid={`item-${item.id}`}
                  >
                    <div className={`item-icon ${iconClass(item.kind)}`}>{itemIcon(item.kind)}</div>
                    <div className="item-copy">
                      <h3>{item.name}</h3>
                      <p>{item.previewText || item.kind}</p>
                    </div>
                    <div className="item-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleStar(item);
                        }}
                        title={item.starred ? "Unstar" : "Star"}
                      >
                        <Star size={14} className={item.starred ? "filled" : ""} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* editor */}
          <div className="editor-pane">
            {selectedItem ? (
              <>
                <div className="editor-header">
                  <div className="editor-title">
                    <p className="eyebrow">{selectedItem.kind}</p>
                    <h2>{selectedItem.name}</h2>
                  </div>
                  <div className="editor-actions">
                    <button className="btn-ghost" onClick={copySelected} title="Copy"><Copy size={15} /></button>
                    {selectedItem.trashedAt ? (
                      <>
                        <button className="btn-ghost" onClick={restoreSelected} title="Restore"><ArrowLeft size={15} /></button>
                        <button className="btn-ghost danger" onClick={deleteSelectedForever} title="Delete forever"><Trash2 size={15} /></button>
                      </>
                    ) : (
                      <button className="btn-ghost danger" onClick={trashSelected} title="Trash"><Trash2 size={15} /></button>
                    )}
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        selectedItem.kind === "upload"
                          ? window.open(`/v1/items/${selectedItem.id}/download`, "_blank", "noopener,noreferrer")
                          : exportSelected(selectedItem.kind === "doc" ? "md" : selectedItem.kind === "sheet" ? "csv" : "json")
                      }
                      title="Export"
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </div>

                {/* doc editor */}
                {selectedItem.kind === "doc" && docDraft ? (
                  <section className="native-editor" data-testid="doc-editor">
                    <div className="toolbar-inline">
                      <button className="btn-ghost" onClick={() => setDocDraft({ ...docDraft, blocks: [...docDraft.blocks, { id: crypto.randomUUID(), type: "paragraph", text: "" }] })}>
                        <Plus size={14} /> Paragraph
                      </button>
                      <button className="btn-ghost" onClick={() => setDocDraft({ ...docDraft, blocks: [...docDraft.blocks, { id: crypto.randomUUID(), type: "heading", text: "" }] })}>
                        <Plus size={14} /> Heading
                      </button>
                      <button className="btn-ghost" onClick={() => setDocDraft({ ...docDraft, blocks: [...docDraft.blocks, { id: crypto.randomUUID(), type: "bullet", text: "" }] })}>
                        <Plus size={14} /> Bullet
                      </button>
                      <span className="toolbar-divider" />
                      <button className="btn-primary" data-testid="save-doc" onClick={saveCurrentContent}>Save</button>
                    </div>
                    {docDraft.blocks.map((block, index) => (
                      <div key={block.id} className="block-card">
                        <select
                          value={block.type}
                          onChange={(event) => {
                            const next = clone(docDraft);
                            next.blocks[index].type = event.target.value as DriveDocBlock["type"];
                            setDocDraft(next);
                          }}
                        >
                          <option value="heading">H</option>
                          <option value="paragraph">P</option>
                          <option value="bullet">Li</option>
                          <option value="table">Tbl</option>
                        </select>
                        {block.type === "table" ? (
                          <textarea
                            value={(block.cells ?? [[""]]).map((row) => row.join(" | ")).join("\n")}
                            onChange={(event) => {
                              const next = clone(docDraft);
                              next.blocks[index].cells = event.target.value.split("\n").map((row) => row.split("|").map((cell) => cell.trim()));
                              setDocDraft(next);
                            }}
                          />
                        ) : (
                          <textarea
                            value={block.text ?? ""}
                            onChange={(event) => {
                              const next = clone(docDraft);
                              next.blocks[index].text = event.target.value;
                              setDocDraft(next);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </section>
                ) : null}

                {/* sheet editor */}
                {selectedItem.kind === "sheet" && sheetDraft ? (
                  <section className="native-editor" data-testid="sheet-editor">
                    <div className="toolbar-inline">
                      <button className="btn-ghost" onClick={() => setSheetDraft({ ...sheetDraft, tabs: [...sheetDraft.tabs, { id: crypto.randomUUID(), name: `Sheet ${sheetDraft.tabs.length + 1}`, freeze: { row: 1, col: 1 }, rows: [["", "", "", ""]] }] })}>
                        <Plus size={14} /> Tab
                      </button>
                      <span className="toolbar-divider" />
                      <button className="btn-primary" data-testid="save-sheet" onClick={saveCurrentContent}>Save</button>
                    </div>
                    <table className="sheet-grid">
                      <tbody>
                        {sheetDraft.tabs[0].rows.map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`}>
                            {row.map((cell, colIndex) => (
                              <td key={`cell-${rowIndex}-${colIndex}`}>
                                <input
                                  data-testid={rowIndex === 1 && colIndex === 1 ? "sheet-cell-b2" : undefined}
                                  value={cell}
                                  onChange={(event) => {
                                    const next = clone(sheetDraft);
                                    next.tabs[0].rows[rowIndex][colIndex] = event.target.value;
                                    setSheetDraft(next);
                                  }}
                                />
                                <small>{sheetPreviewRows[rowIndex]?.[colIndex] ?? ""}</small>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ) : null}

                {/* slide editor */}
                {selectedItem.kind === "slide" && slideDraft ? (
                  <section className="native-editor slide-editor" data-testid="slide-editor">
                    <div className="slide-sidebar">
                      {slideDraft.slides.map((slide, index) => (
                        <button
                          key={slide.id}
                          className={activeSlideIndex === index ? "active" : ""}
                          onClick={() => setActiveSlideIndex(index)}
                        >
                          {slide.title || `Slide ${index + 1}`}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          const next = clone(slideDraft);
                          next.slides.push({
                            id: crypto.randomUUID(),
                            title: `Slide ${next.slides.length + 1}`,
                            body: "",
                            notes: "",
                            background: "paper",
                          });
                          setSlideDraft(next);
                          setActiveSlideIndex(next.slides.length - 1);
                        }}
                      >
                        <Plus size={14} /> Add slide
                      </button>
                      <button className="btn-primary" data-testid="save-slide" onClick={saveCurrentContent}>Save</button>
                    </div>
                    <div className="slide-canvas">
                      <input
                        value={slideDraft.slides[activeSlideIndex]?.title ?? ""}
                        placeholder="Slide title"
                        onChange={(event) => {
                          const next = clone(slideDraft);
                          next.slides[activeSlideIndex].title = event.target.value;
                          setSlideDraft(next);
                        }}
                      />
                      <textarea
                        value={slideDraft.slides[activeSlideIndex]?.body ?? ""}
                        placeholder="Content"
                        onChange={(event) => {
                          const next = clone(slideDraft);
                          next.slides[activeSlideIndex].body = event.target.value;
                          setSlideDraft(next);
                        }}
                      />
                      <textarea
                        value={slideDraft.slides[activeSlideIndex]?.notes ?? ""}
                        placeholder="Speaker notes"
                        onChange={(event) => {
                          const next = clone(slideDraft);
                          next.slides[activeSlideIndex].notes = event.target.value;
                          setSlideDraft(next);
                        }}
                      />
                      <div className={`slide-preview ${slideDraft.slides[activeSlideIndex]?.background}`}>
                        <h3>{slideDraft.slides[activeSlideIndex]?.title}</h3>
                        <p>{slideDraft.slides[activeSlideIndex]?.body}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* upload preview */}
                {selectedItem.kind === "upload" && selectedItem.content?.kind === "upload" ? (
                  <section className="preview-pane" data-testid="upload-preview">
                    {selectedItem.content.previewKind === "image" && selectedItem.content.sourceUrl ? (
                      <img src={selectedItem.content.sourceUrl} alt={selectedItem.name} />
                    ) : null}
                    {selectedItem.content.previewKind === "pdf" && selectedItem.content.sourceUrl ? (
                      <iframe title={selectedItem.name} src={selectedItem.content.sourceUrl} />
                    ) : null}
                    {selectedItem.content.previewKind === "audio" && selectedItem.content.sourceUrl ? (
                      <audio controls src={selectedItem.content.sourceUrl} />
                    ) : null}
                    {selectedItem.content.previewKind === "video" && selectedItem.content.sourceUrl ? (
                      <video controls src={selectedItem.content.sourceUrl} />
                    ) : null}
                    {selectedItem.content.textContent ? <pre>{selectedItem.content.textContent}</pre> : null}
                    {selectedItem.content.metadata ? <code>{JSON.stringify(selectedItem.content.metadata, null, 2)}</code> : null}
                  </section>
                ) : null}

                {/* folder selected */}
                {!selectedItem.content ? (
                  <section className="empty-editor">
                    <p>This folder stores Drive items.</p>
                  </section>
                ) : null}
              </>
            ) : (
              <section className="empty-editor">
                <Folder size={36} />
                <h2>Drive workspace</h2>
                <p>Select a file from the list, or create something new from the sidebar.</p>
              </section>
            )}
          </div>

          {/* details panel */}
          <aside className="details-pane">
            <div className="detail-section">
              <div className="detail-section-header">
                <h3><MessageSquare size={13} /> Comments</h3>
              </div>
              <div className="comment-list">
                {comments.map((comment) => (
                  <article key={comment.id} className="mini-card">
                    <strong>{comment.authorName}</strong>
                    <p>{comment.body}</p>
                  </article>
                ))}
              </div>
              {selectedItem ? (
                <>
                  <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment..." />
                  <button className="btn-secondary" data-testid="add-comment" onClick={addComment}>Post</button>
                </>
              ) : null}
            </div>

            <div className="detail-section">
              <div className="detail-section-header">
                <h3><History size={13} /> Revisions</h3>
              </div>
              <div className="revision-list">
                {revisions.map((revision) => (
                  <article key={revision.id} className="mini-card">
                    <strong>v{revision.versionNumber}</strong>
                    <p>{revision.previewText || revision.summary || "Revision"}</p>
                    <button onClick={() => restoreRevision(revision.id)}>Restore</button>
                  </article>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-header">
                <h3><Link size={13} /> Shares</h3>
              </div>
              <div className="share-list">
                {shares.map((share) => (
                  <article key={share.id} className="mini-card">
                    <strong>
                      {share.label}
                      <span className={`share-badge ${share.revokedAt ? "revoked" : "active"}`}>
                        {share.revokedAt ? "revoked" : "active"}
                      </span>
                    </strong>
                  </article>
                ))}
              </div>
              {selectedItem ? (
                <>
                  <input value={shareLabel} onChange={(event) => setShareLabel(event.target.value)} placeholder="Share label" />
                  <button className="btn-secondary" data-testid="create-share" onClick={createShare}><Share2 size={14} /> Create link</button>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
