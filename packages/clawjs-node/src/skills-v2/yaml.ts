// Minimal YAML serializer for SKILL.md frontmatter. We deliberately do NOT
// pull in js-yaml as a runtime dep; SKILL.md frontmatter we author has a
// tiny known shape (strings, numbers, booleans, null, arrays of scalars,
// nested mappings up to depth ~4). For reading, we use the parser in
// ./yaml-parse.ts which is also intentionally minimal but tolerant.

function isScalar(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

function needsQuoting(value: string): boolean {
  if (value === "") return true;
  if (/^[\s]/.test(value) || /[\s]$/.test(value)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true;
  if (/^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(value)) return true;
  if (/[:#&*!|>'"%@`]/.test(value)) return true;
  if (/\n/.test(value)) return true;
  if (/^[\[{]/.test(value)) return true;
  return false;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const str = String(value);
  if (!needsQuoting(str)) return str;
  // Use double quotes with JSON-style escaping for safety.
  return JSON.stringify(str);
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function stringifyYaml(value: unknown, level = 0): string {
  if (isScalar(value) || value === undefined) {
    return `${formatScalar(value)}\n`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]\n";
    let out = "";
    for (const entry of value) {
      if (isScalar(entry)) {
        out += `${indent(level)}- ${formatScalar(entry)}\n`;
      } else if (Array.isArray(entry)) {
        const nested = stringifyYaml(entry, level + 1);
        out += `${indent(level)}-\n${nested}`;
      } else if (isPlainObject(entry)) {
        const keys = Object.keys(entry).filter((k) => entry[k] !== undefined);
        if (keys.length === 0) {
          out += `${indent(level)}- {}\n`;
          continue;
        }
        let first = true;
        for (const key of keys) {
          const child = entry[key];
          if (first) {
            first = false;
            out += `${indent(level)}- ${formatKeyValue(key, child, level + 1, true)}`;
          } else {
            out += formatKeyValue(key, child, level + 1, false);
          }
        }
      } else {
        out += `${indent(level)}- null\n`;
      }
    }
    return out;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return level === 0 ? "" : "{}\n";
    let out = "";
    for (const key of keys) {
      out += formatKeyValue(key, value[key], level, false);
    }
    return out;
  }
  return `${formatScalar(value)}\n`;
}

function formatKeyValue(key: string, value: unknown, level: number, inline: boolean): string {
  const safeKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
  const prefix = inline ? "" : indent(level);
  if (isScalar(value) || value === undefined) {
    return `${prefix}${safeKey}: ${formatScalar(value)}\n`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}${safeKey}: []\n`;
    if (value.every(isScalar)) {
      return `${prefix}${safeKey}: [${value.map(formatScalar).join(", ")}]\n`;
    }
    return `${prefix}${safeKey}:\n${stringifyYaml(value, level)}`;
  }
  if (isPlainObject(value)) {
    const inner = stringifyYaml(value, level + 1);
    if (!inner.trim()) return `${prefix}${safeKey}: {}\n`;
    return `${prefix}${safeKey}:\n${inner}`;
  }
  return `${prefix}${safeKey}: ${formatScalar(value)}\n`;
}

export function buildSkillMd(frontmatter: unknown, body: string): string {
  const fm = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
  return `---\n${fm}\n---\n\n${trimmedBody}\n`;
}
