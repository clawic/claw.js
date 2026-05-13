import { useState } from "react";

interface Props {
  title: string;
  message: string;
  effects?: string[];
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, effects, confirmLabel = "Confirm", danger, onConfirm, onCancel }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="confirm-modal">
      <div className="modal">
        <div className="modal-header">{title}</div>
        <div className="modal-body">
          <p>{message}</p>
          {effects && effects.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 12 }}>Impact:</strong>
              <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 12, color: "#6c757d" }}>
                {effects.map((effect, i) => <li key={i}>{effect}</li>)}
              </ul>
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13 }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand the impact of this action
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={handleSubmit}
            disabled={!confirmed || submitting}
          >
            {submitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
