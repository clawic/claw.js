import { useState } from "react";

export function ConfirmDialog({ title, description, warning, confirmLabel, danger, onConfirm, onCancel }: {
  title: string;
  description?: string;
  warning?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const needsExplicit = !!warning;

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog__title">{title}</h3>
        {description && <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", marginBottom: "var(--sp-3)" }}>{description}</p>}
        {warning && (
          <div style={{ background: "var(--c-warning-subtle)", border: "1px solid var(--c-warning)", borderRadius: "var(--r-md)", padding: "var(--sp-3)", fontSize: "var(--fs-sm)", color: "var(--c-warning)", marginBottom: "var(--sp-3)" }}>
            {warning}
          </div>
        )}
        {needsExplicit && (
          <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-sm)", marginTop: "var(--sp-2)" }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand the impact
          </label>
        )}
        <div className="dialog__actions">
          <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            onClick={handleConfirm}
            disabled={loading || (needsExplicit && !confirmed)}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
