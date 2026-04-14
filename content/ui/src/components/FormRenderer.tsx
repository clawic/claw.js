import { useState, useEffect } from "react";
import type { FormSchema } from "../api/types";
import { getFormSchema } from "../api/client";

export function FormRenderer({ formId, onSubmit, onCancel, defaults }: {
  formId: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  defaults?: Record<string, unknown>;
}) {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getFormSchema(formId).then((s) => {
      setSchema(s);
      const initial: Record<string, unknown> = {};
      for (const f of s.fields) {
        initial[f.key] = defaults?.[f.key] ?? f.defaultValue ?? "";
      }
      setValues(initial);
    });
  }, [formId, defaults]);

  if (!schema) return <div className="skeleton" style={{ height: 200 }} />;

  const sorted = [...schema.fields].sort((a, b) => a.order - b.order);
  const groups = [...new Set(sorted.map((f) => f.group))];

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const [key, rule] of Object.entries(schema!.validations)) {
      if (rule === "required" && !values[key]) {
        const field = schema!.fields.find((f) => f.key === key);
        errs[key] = `${field?.label ?? key} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try { await onSubmit(values); } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, marginBottom: "var(--sp-4)" }}>{schema.title}</h3>
      {groups.map((g) => (
        <fieldset key={g} style={{ border: "none", marginBottom: "var(--sp-4)" }}>
          <legend style={{ fontSize: "var(--fs-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--c-text-muted)", marginBottom: "var(--sp-2)" }}>{g}</legend>
          {sorted.filter((f) => f.group === g).map((f) => (
            <div key={f.key} style={{ marginBottom: "var(--sp-3)" }}>
              <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                {f.label}{f.required && <span style={{ color: "var(--c-danger)" }}> *</span>}
              </label>
              {f.component === "readonly" ? (
                <div className="input" style={{ background: "var(--c-surface-raised)" }}>{String(values[f.key] ?? "")}</div>
              ) : f.component === "textarea" || f.component === "rich-text" ? (
                <textarea
                  className={`input ${errors[f.key] ? "input--error" : ""}`}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={f.component === "rich-text" ? 6 : 3}
                />
              ) : f.component === "select" ? (
                <select
                  className={`input ${errors[f.key] ? "input--error" : ""}`}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  <option value="">Select...</option>
                </select>
              ) : f.component === "datetime" ? (
                <input
                  type="datetime-local"
                  className={`input ${errors[f.key] ? "input--error" : ""}`}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              ) : f.component === "json" ? (
                <textarea
                  className={`input mono ${errors[f.key] ? "input--error" : ""}`}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  rows={4}
                  placeholder="{}"
                />
              ) : (
                <input
                  type="text"
                  className={`input ${errors[f.key] ? "input--error" : ""}`}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              )}
              {errors[f.key] && <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-danger)", marginTop: 2 }}>{errors[f.key]}</div>}
              {f.helpText && <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginTop: 2 }}>{f.helpText}</div>}
            </div>
          ))}
        </fieldset>
      ))}
      {schema.sideEffects.length > 0 && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginBottom: "var(--sp-3)" }}>
          Side effects: {schema.sideEffects.join(", ")}
        </div>
      )}
      <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? "Saving..." : schema.submitLabel}
        </button>
      </div>
    </form>
  );
}
