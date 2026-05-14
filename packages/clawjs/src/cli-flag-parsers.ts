import { CliHandledError } from "./cli-errors.ts";

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
