import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

export function parseJsonFlag<TValue>(value: string | undefined, label: string): TValue | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as TValue;
  } catch (error) {
    throw new CliHandledError("invalid_json", `Invalid JSON for ${label}: ${error instanceof Error ? error.message : "parse error"}`);
  }
}

export function parseCsvFlag(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function collectFlagValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  const prefix = `--${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === `--${name}`) {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        values.push(...parseCsvFlag(next));
        index += 1;
      }
      continue;
    }
    if (token?.startsWith(prefix)) {
      values.push(...parseCsvFlag(token.slice(prefix.length)));
    }
  }
  return values;
}

export function readBooleanFlag(argv: string[], flags: Record<string, string>, name: string, fallback = false): boolean {
  const value = flags[name];
  if (value !== undefined) {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new CliHandledError("invalid_boolean_flag", `--${name} must be true or false.`, CLI_EXIT_USAGE);
  }
  if (argv.includes(`--${name}`)) return true;
  if (value === undefined) return fallback;
  return fallback;
}

export function joinedPositionals(positionals: string[], startIndex: number): string | undefined {
  const value = positionals.slice(startIndex).join(" ").trim();
  return value || undefined;
}

export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      flags[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) continue;
    flags[token.slice(2)] = next;
  }
  return flags;
}

export function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return positionals;
}

export function formatCliTable(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] ?? {});
  const widths = Object.fromEntries(columns.map((column) => [
    column,
    Math.max(column.length, ...rows.map((row) => (row[column] ?? "").length)),
  ]));
  return [
    columns.map((column) => column.padEnd(widths[column])).join("  "),
    columns.map((column) => "-".repeat(widths[column])).join("  "),
    ...rows.map((row) => columns.map((column) => (row[column] ?? "").padEnd(widths[column])).join("  ")),
  ].join("\n");
}
