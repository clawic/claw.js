// Minimal YAML emitter / parser for the flat schemas in @clawjs/agents.
// Mirrors `SimpleYaml.swift` so the on-disk format stays identical
// regardless of which side of the bridge wrote it. Supports:
//
// - `key: value`
// - `key: "quoted value"`
// - `key: true|false`
// - `key: 42`
// - `key:` followed by `  - item` lines (string arrays)
// - `# comment` lines
//
// Nested structures live in their own files (`integrations.yaml`,
// `permissions.yaml`, `delegation.yaml` carry JSON inside) so the
// grammar above is enough.

export type SimpleYamlValue =
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "array"; values: SimpleYamlValue[] };

export type SimpleYamlMap = Record<string, SimpleYamlValue>;

const RESERVED_LOWER = new Set([
  "true",
  "false",
  "yes",
  "no",
  "null",
  "~",
]);

function encodeScalar(s: string): string {
  if (s === "") return '""';
  const lower = s.toLowerCase();
  const isInt = /^-?\d+$/.test(s);
  const needsQuoting =
    s.includes(":") ||
    s.includes("#") ||
    s.includes("\n") ||
    s.startsWith("- ") ||
    s.startsWith(" ") ||
    s.endsWith(" ") ||
    RESERVED_LOWER.has(lower) ||
    isInt;
  if (!needsQuoting) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function emitSimpleYaml(pairs: Array<[string, SimpleYamlValue]>): string {
  const lines: string[] = [];
  for (const [key, value] of pairs) {
    switch (value.kind) {
      case "string":
        lines.push(`${key}: ${encodeScalar(value.value)}`);
        break;
      case "bool":
        lines.push(`${key}: ${value.value ? "true" : "false"}`);
        break;
      case "int":
        lines.push(`${key}: ${value.value}`);
        break;
      case "array":
        if (value.values.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value.values) {
            switch (item.kind) {
              case "string":
                lines.push(`  - ${encodeScalar(item.value)}`);
                break;
              case "bool":
                lines.push(`  - ${item.value ? "true" : "false"}`);
                break;
              case "int":
                lines.push(`  - ${item.value}`);
                break;
              case "array":
                // Nested arrays are out of scope.
                continue;
            }
          }
        }
        break;
    }
  }
  return lines.join("\n") + "\n";
}

function decodeScalar(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    const inner = s.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

export function parseSimpleYaml(text: string): SimpleYamlMap {
  const dict: SimpleYamlMap = {};
  let pendingArrayKey: string | null = null;
  let pendingArrayItems: SimpleYamlValue[] = [];

  const flushArray = () => {
    if (pendingArrayKey != null) {
      dict[pendingArrayKey] = { kind: "array", values: pendingArrayItems };
      pendingArrayKey = null;
      pendingArrayItems = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine;
    const trimmedLeading = line.replace(/^ +/, "");
    if (trimmedLeading.length === 0 || trimmedLeading.startsWith("#")) continue;
    const isIndented = line.startsWith("  ");
    const trimmed = line.trim();

    if (isIndented && trimmed.startsWith("- ") && pendingArrayKey != null) {
      const item = trimmed.slice(2);
      pendingArrayItems.push({ kind: "string", value: decodeScalar(item) });
      continue;
    }

    flushArray();

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (rest.length === 0) {
      pendingArrayKey = key;
      pendingArrayItems = [];
      continue;
    }
    if (rest === "[]") {
      dict[key] = { kind: "array", values: [] };
      continue;
    }
    const decoded = decodeScalar(rest);
    const lower = decoded.toLowerCase();
    if (lower === "true") dict[key] = { kind: "bool", value: true };
    else if (lower === "false") dict[key] = { kind: "bool", value: false };
    else if (/^-?\d+$/.test(decoded)) {
      dict[key] = { kind: "int", value: parseInt(decoded, 10) };
    } else {
      dict[key] = { kind: "string", value: decoded };
    }
  }

  flushArray();
  return dict;
}

export function yamlString(map: SimpleYamlMap, key: string, fallback = ""): string {
  const v = map[key];
  return v && v.kind === "string" ? v.value : fallback;
}

export function yamlBool(map: SimpleYamlMap, key: string, fallback = false): boolean {
  const v = map[key];
  return v && v.kind === "bool" ? v.value : fallback;
}

export function yamlInt(map: SimpleYamlMap, key: string, fallback = 0): number {
  const v = map[key];
  return v && v.kind === "int" ? v.value : fallback;
}

export function yamlStringArray(map: SimpleYamlMap, key: string): string[] {
  const v = map[key];
  if (!v || v.kind !== "array") return [];
  return v.values.flatMap((item) => (item.kind === "string" ? [item.value] : []));
}
