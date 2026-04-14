import { useState, useEffect } from "react";
import type { FormSchema } from "../api/client";

interface Props {
  schema: FormSchema;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  serverErrors?: Record<string, string>;
}

export function FormEngine({ schema, onSubmit, onCancel, serverErrors }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize defaults
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const field of schema.fields) {
      if (field.defaultValue != null) defaults[field.key] = field.defaultValue;
    }
    setValues(defaults);
  }, [schema]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const field of schema.fields) {
      const val = values[field.key];
      const rules = schema.validations[field.key];
      if (!rules) continue;
      const ruleList = rules.split("|");
      for (const rule of ruleList) {
        if (rule === "required" && (val == null || val === "")) {
          errs[field.key] = `${field.label} is required`;
        }
        if (rule === "positive" && typeof val === "number" && val <= 0) {
          errs[field.key] = `${field.label} must be positive`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const setValue = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  // Group fields
  const groups: Map<string, typeof schema.fields> = new Map();
  const sortedFields = [...schema.fields].sort((a, b) => a.order - b.order);
  for (const field of sortedFields) {
    const group = field.group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  }

  const allErrors = { ...errors, ...serverErrors };

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{schema.title}</h2>

      {formError && (
        <div className="error-block" style={{ marginBottom: 16 }}>
          <div className="error-block-message">{formError}</div>
        </div>
      )}

      {Array.from(groups.entries()).map(([groupName, fields]) => (
        <div key={groupName}>
          <div className="form-section-title">{groupName.replace(/_/g, " ")}</div>
          {fields.map((field) => {
            // Visibility rules (simplified)
            const visRule = schema.visibilityRules.find((r) => (r as Record<string, unknown>).field === field.key);
            if (visRule) {
              const when = (visRule as Record<string, unknown>).visibleWhen as Record<string, unknown> | undefined;
              if (when) {
                const visible = Object.entries(when).every(([k, v]) => values[k] === v);
                if (!visible) return null;
              }
            }

            const err = allErrors[field.key];
            return (
              <div key={field.key} className="form-group">
                <label className="form-label">
                  {field.label}
                  {field.required && <span className="required">*</span>}
                </label>
                {renderField(field, values[field.key], (v) => setValue(field.key, v), !!err)}
                {field.helpText && <div className="form-help">{field.helpText}</div>}
                {err && <div className="form-error">{err}</div>}
              </div>
            );
          })}
        </div>
      ))}

      {schema.sideEffects.length > 0 && (
        <div style={{ fontSize: 11, color: "#6c757d", marginBottom: 12 }}>
          {schema.sideEffects.map((se, i) => <div key={i}>Note: {se}</div>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : schema.submitLabel}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function renderField(
  field: FormSchema["fields"][number],
  value: unknown,
  onChange: (val: unknown) => void,
  hasError: boolean,
) {
  const cls = `form-input${hasError ? " error" : ""}`;
  switch (field.component) {
    case "select":
    case "async-select":
      return (
        <input
          className={cls}
          type="text"
          placeholder={field.placeholder ?? ""}
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "combobox":
      return (
        <input
          className={cls}
          type="text"
          placeholder={field.placeholder ?? ""}
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
    case "money":
      return (
        <input
          className={cls}
          type="number"
          placeholder={field.placeholder ?? ""}
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
        />
      );
    default:
      return (
        <input
          className={cls}
          type="text"
          placeholder={field.placeholder ?? ""}
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
