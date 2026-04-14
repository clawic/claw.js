import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { getComposer, updateEntry, updateVariant, createPlan, generateVariants } from "../api/client";
import type { ComposerPayload, Variant, EntryStatus, VariantStatus } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import "./Composer.css";

const VARIANT_STATUS_BADGE: Record<VariantStatus, { v: "neutral" | "success" | "danger" | "info" | "accent" | "warning" | "muted"; l: string }> = {
  draft: { v: "neutral", l: "Draft" },
  ready: { v: "success", l: "Ready" },
  blocked: { v: "danger", l: "Blocked" },
  approved: { v: "info", l: "Approved" },
  scheduled: { v: "accent", l: "Scheduled" },
  published: { v: "success", l: "Published" },
  failed: { v: "danger", l: "Failed" },
};

function kindIcon(kind: string): string {
  return { linkedin_post: "in", bluesky_post: "BS", mastodon_post: "M", webhook: "WH", blog_post: "BG", website_page: "WP" }[kind] ?? "?";
}

export function ComposerScreen() {
  const { entryId } = useParams<{ entryId: string }>();
  const { status, data, error, reload } = useApi<ComposerPayload>(() => getComposer(entryId!), [entryId]);

  useRealtimeRevalidation(["entry.updated", "variant.updated", "variant.generated", "approval.reviewed", "plan.executed", "publication.completed"], reload);

  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [publishDialog, setPublishDialog] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Local editable state
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editBody, setEditBody] = useState("");
  const [variantBodies, setVariantBodies] = useState<Record<string, string>>({});

  const knownRevision = useRef<number>(0);

  // Sync from server data
  useEffect(() => {
    if (data) {
      setEditTitle(data.entry.title);
      setEditSummary(data.entry.summary);
      setEditBody(data.entry.canonicalBody);
      knownRevision.current = data.entry.currentRevisionNumber;
      const vb: Record<string, string> = {};
      for (const v of data.variants) vb[v.id] = v.body;
      setVariantBodies(vb);
      if (!activeVariant && data.variants.length > 0) setActiveVariant(data.variants[0].id);
      setDirty(false);
    }
  }, [data, activeVariant]);

  const markDirty = useCallback(() => setDirty(true), []);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await updateEntry(data.entry.id, {
        title: editTitle,
        summary: editSummary,
        canonicalBody: editBody,
      });
      if (res.entry.currentRevisionNumber !== knownRevision.current + 1 && knownRevision.current > 0) {
        setRevisionConflict(true);
      }
      // Save active variant if dirty
      if (activeVariant && variantBodies[activeVariant] !== data.variants.find((v) => v.id === activeVariant)?.body) {
        await updateVariant(activeVariant, { body: variantBodies[activeVariant] });
      }
      setDirty(false);
      reload();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        setRevisionConflict(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule(variantId: string) {
    await createPlan({ variantId });
    setPublishDialog(null);
    reload();
  }

  async function handleGenerate() {
    if (!entryId) return;
    setGenerating(true);
    try {
      await generateVariants(entryId);
      reload();
    } finally {
      setGenerating(false);
    }
  }

  if (status === "loading") return <div data-testid="content-composer"><LoadingSkeleton rows={12} /></div>;
  if (status === "error") return <div data-testid="content-composer"><ErrorBlock message={error!} onRetry={reload} /></div>;

  const d = data!;
  const entry = d.entry;
  const currentVariant = d.variants.find((v) => v.id === activeVariant);

  return (
    <div data-testid="content-composer" className="comp">
      {/* Revision conflict banner */}
      {revisionConflict && (
        <div className="comp__conflict">
          <span>Revision conflict detected. The entry was modified elsewhere.</span>
          <button className="btn btn--sm btn--secondary" onClick={() => { setRevisionConflict(false); reload(); }}>
            Load latest
          </button>
        </div>
      )}

      {/* Dirty state indicator */}
      {dirty && (
        <div className="comp__dirty">
          Unsaved changes
        </div>
      )}

      <div className="comp__layout">
        {/* ── Left Rail ── */}
        <aside className="comp__left">
          <div className="comp__section">
            <h3 className="comp__section-title">Entry</h3>
            <div className="comp__field">
              <span className="comp__field-label">Status</span>
              <StatusBadge status={entry.status as EntryStatus} />
            </div>
            <div className="comp__field">
              <span className="comp__field-label">Revision</span>
              <span className="mono">v{entry.currentRevisionNumber}</span>
            </div>
            <div className="comp__field">
              <span className="comp__field-label">Type</span>
              <span>{entry.contentType}</span>
            </div>
            <div className="comp__field">
              <span className="comp__field-label">Format</span>
              <span>{entry.canonicalFormat}</span>
            </div>
          </div>

          <div className="comp__section">
            <h3 className="comp__section-title">Campaign</h3>
            <div style={{ fontSize: "var(--fs-sm)", color: entry.campaignId ? "var(--c-text)" : "var(--c-text-muted)" }}>
              {entry.campaignId ?? "No campaign"}
            </div>
          </div>

          <div className="comp__section">
            <h3 className="comp__section-title">Assets</h3>
            {d.assets.length === 0 ? (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No assets</div>
            ) : (
              <div className="comp__assets">
                {d.assets.map((a) => (
                  <div key={a.id} className="comp__asset">
                    <span className="comp__asset-icon">{a.assetKind === "image" ? "🖼" : "📄"}</span>
                    <div>
                      <div className="comp__asset-name">{a.name}</div>
                      <div className="comp__asset-alt">{a.altText ?? "No alt text"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="comp__section">
            <h3 className="comp__section-title">Approval Summary</h3>
            {d.approvals.length === 0 ? (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No approvals</div>
            ) : (
              d.approvals.map((a) => (
                <div key={a.id} className="comp__approval-item">
                  <Badge variant={a.status === "approved" ? "success" : a.status === "pending" ? "warning" : "danger"}>
                    {a.status}
                  </Badge>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>{a.destinationId}</span>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Center Canvas ── */}
        <main className="comp__center">
          {/* Canonical editor */}
          <div data-testid="composer-canonical-editor" className="comp__editor">
            <input
              className="comp__editor-title"
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); markDirty(); }}
              placeholder="Entry title"
            />
            <textarea
              className="comp__editor-summary"
              value={editSummary}
              onChange={(e) => { setEditSummary(e.target.value); markDirty(); }}
              placeholder="Summary"
              rows={2}
            />
            <textarea
              className="comp__editor-body"
              value={editBody}
              onChange={(e) => { setEditBody(e.target.value); markDirty(); }}
              placeholder="Write your canonical content here..."
              rows={12}
            />
          </div>

          {/* Variant tabs */}
          <div data-testid="composer-variant-tabs" className="comp__variants">
            <div className="comp__variant-bar">
              {d.variants.map((v) => {
                const vDirty = variantBodies[v.id] !== v.body;
                return (
                  <button
                    key={v.id}
                    className={`comp__variant-tab ${activeVariant === v.id ? "comp__variant-tab--active" : ""}`}
                    onClick={() => setActiveVariant(v.id)}
                  >
                    <span className="comp__variant-kind">{kindIcon(v.destinationKind ?? "")}</span>
                    <span>{v.destinationName ?? v.destinationId}</span>
                    {(() => {
                      const b = VARIANT_STATUS_BADGE[v.status as VariantStatus];
                      return b ? <Badge variant={b.v}>{b.l}</Badge> : null;
                    })()}
                    {vDirty && <span className="comp__variant-dirty">*</span>}
                  </button>
                );
              })}
              <button className="btn btn--ghost btn--sm" onClick={handleGenerate} disabled={generating}>
                {generating ? "Generating..." : "+ Generate variants"}
              </button>
            </div>

            {currentVariant ? (
              <div className="comp__variant-editor">
                <textarea
                  className="comp__editor-body"
                  value={variantBodies[currentVariant.id] ?? currentVariant.body}
                  onChange={(e) => {
                    setVariantBodies({ ...variantBodies, [currentVariant.id]: e.target.value });
                    markDirty();
                  }}
                  rows={8}
                  placeholder="Variant body..."
                />
              </div>
            ) : (
              <EmptyState icon="◉" title="No variant selected" description="Select a variant tab or generate variants." />
            )}
          </div>
        </main>

        {/* ── Right Rail ── */}
        <aside className="comp__right">
          {/* Preview */}
          <div data-testid="composer-preview" className="comp__section">
            <h3 className="comp__section-title">Preview</h3>
            <div className="comp__preview-frame">
              {currentVariant ? (
                <div className="comp__preview-content">
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginBottom: "var(--sp-2)" }}>
                    {currentVariant.destinationName ?? currentVariant.destinationId} · {currentVariant.destinationKind}
                  </div>
                  <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>{editTitle}</div>
                  <div style={{ fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" }}>
                    {variantBodies[currentVariant.id] ?? currentVariant.body}
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)", padding: "var(--sp-4)", textAlign: "center" }}>
                  Select a variant to preview
                </div>
              )}
            </div>
          </div>

          {/* Validation panel */}
          <div data-testid="composer-validation-panel" className="comp__section">
            <h3 className="comp__section-title">Validation</h3>
            {currentVariant && currentVariant.validationErrors.length > 0 ? (
              <div className="comp__validations">
                {currentVariant.validationErrors.map((err, i) => (
                  <div key={i} className="comp__validation-error">
                    <span style={{ color: "var(--c-danger)" }}>●</span> {err}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-success)" }}>
                No validation errors
              </div>
            )}

            {/* Capabilities */}
            <h4 style={{ fontSize: "var(--fs-xs)", fontWeight: 700, marginTop: "var(--sp-3)", marginBottom: "var(--sp-1)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--c-text-muted)" }}>Capabilities</h4>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>
              Select a variant to view destination capabilities.
            </div>
          </div>

          {/* Publish controls */}
          <div className="comp__section">
            <h3 className="comp__section-title">Publish</h3>
            {d.plans.length > 0 && (
              <div style={{ marginBottom: "var(--sp-2)" }}>
                {d.plans.map((p) => (
                  <div key={p.id} style={{ fontSize: "var(--fs-sm)", display: "flex", justifyContent: "space-between", padding: "var(--sp-1) 0" }}>
                    <Badge variant={p.status === "executed" ? "success" : p.status === "cancelled" ? "muted" : "accent"}>
                      {p.status}
                    </Badge>
                    <span className="mono" style={{ fontSize: "var(--fs-xs)" }}>
                      {p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : "Immediate"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {d.variants.map((v) => (
              <button
                key={v.id}
                className="btn btn--secondary btn--sm w-full"
                style={{ marginBottom: "var(--sp-1)" }}
                onClick={() => setPublishDialog(v.id)}
              >
                Schedule {v.destinationName ?? v.destinationId}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Fixed Publish Bar ── */}
      <div data-testid="composer-publish-bar" className="comp__publish-bar">
        <div className="comp__publish-bar-left">
          <StatusBadge status={entry.status as EntryStatus} />
          {dirty && <span className="comp__publish-bar-dirty">Unsaved</span>}
        </div>
        <div className="comp__publish-bar-actions">
          <button className="btn btn--secondary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="btn btn--secondary" disabled>Request Approval</button>
          <button className="btn btn--secondary" onClick={() => currentVariant && setPublishDialog(currentVariant.id)} disabled={!currentVariant}>
            Schedule
          </button>
          <button className="btn btn--primary" onClick={() => currentVariant && setPublishDialog(currentVariant.id)} disabled={!currentVariant}>
            Publish Now
          </button>
        </div>
      </div>

      {/* Schedule dialog */}
      {publishDialog && (
        <ConfirmDialog
          title="Schedule Publication"
          description={`Create a publish plan for this variant?`}
          confirmLabel="Schedule"
          onConfirm={() => handleSchedule(publishDialog)}
          onCancel={() => setPublishDialog(null)}
        />
      )}
    </div>
  );
}
