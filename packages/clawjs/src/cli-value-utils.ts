import type { SoulModule, SoulModuleKey, UserDomainId, UserFactSensitivity, UserFactValue } from "@clawjs/core";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseJsonFlag } from "./cli-flag-parsers.ts";

export function parseLooseCliValue(rawValue: string): unknown {
  if (!rawValue.length) return "";
  if ((rawValue.startsWith("{") && rawValue.endsWith("}")) || (rawValue.startsWith("[") && rawValue.endsWith("]"))) {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch {
      return rawValue;
    }
  }
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  return rawValue;
}

export function parseSetFlags(argv: string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") continue;
    const pair = argv[index + 1];
    if (!pair || pair.startsWith("--")) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex <= 0) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    values[pair.slice(0, equalsIndex)] = parseLooseCliValue(pair.slice(equalsIndex + 1));
    index += 1;
  }
  return values;
}

const SOUL_CLI_MODULES = new Set<SoulModuleKey>([
  "identity",
  "mission",
  "values",
  "temperament",
  "communication",
  "cognition",
  "autonomy",
  "memory",
  "boundaries",
  "tools",
  "social",
  "domain",
  "operations",
  "vibe",
]);

export function parseSoulModulesFromSetFlags(argv: string[]): Partial<Record<SoulModuleKey, SoulModule>> {
  const values = parseSetFlags(argv);
  const modules: Partial<Record<SoulModuleKey, SoulModule>> = {};
  for (const [pathKey, value] of Object.entries(values)) {
    const [moduleKey, settingKey] = pathKey.split(".", 2);
    if (!moduleKey || !settingKey || !SOUL_CLI_MODULES.has(moduleKey as SoulModuleKey)) {
      throw new CliHandledError("usage_error", `Soul --set keys must use module.setting, received ${pathKey}`, CLI_EXIT_USAGE);
    }
    const key = moduleKey as SoulModuleKey;
    modules[key] = {
      ...(modules[key] ?? {}),
      [settingKey]: value,
    } as SoulModule;
  }
  return modules;
}

export function parseSkillScopeFlag(value: string): { kind: "global" | "project" | "tag" | "session"; projectIds?: string[]; sessionId?: string; tagFilters?: string[] } {
  if (!value || value === "global") return { kind: "global" };
  const [kindRaw, ref] = value.split(":", 2);
  const kind = kindRaw as "global" | "project" | "tag" | "session";
  if (kind === "project") return { kind, projectIds: ref ? ref.split(",").map((s) => s.trim()).filter(Boolean) : [] };
  if (kind === "session") return { kind, sessionId: ref ?? "" };
  if (kind === "tag") return { kind, tagFilters: ref ? ref.split(",").map((s) => s.trim()).filter(Boolean) : [] };
  return { kind: "global" };
}

export function parseSkillParamsFlag(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const out: Record<string, unknown> = {};
  for (const pair of value.split(",")) {
    const [k, v] = pair.split("=", 2);
    if (!k) continue;
    out[k.trim()] = v ?? "";
  }
  return out;
}

export async function readAllStdin(stdin: NodeJS.ReadableStream): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let acc = "";
    stdin.setEncoding?.("utf8");
    stdin.on("data", (chunk: string | Buffer) => {
      acc += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    stdin.on("end", () => resolve(acc));
    stdin.on("error", (err) => reject(err));
  });
}

export function parseUserFactValue(raw: string | undefined, label: string): UserFactValue {
  if (raw === undefined) throw new CliHandledError("usage_error", `${label} is required`, CLI_EXIT_USAGE);
  const parsed = parseLooseCliValue(raw);
  if (
    typeof parsed === "string"
    || typeof parsed === "number"
    || typeof parsed === "boolean"
    || parsed === null
    || Array.isArray(parsed)
    || (typeof parsed === "object" && parsed !== null)
  ) {
    return parsed as UserFactValue;
  }
  return String(parsed);
}

export function parseUserFieldsFromSetFlags(argv: string[]): Record<string, UserFactValue> {
  return parseSetFlags(argv) as Record<string, UserFactValue>;
}

export function parseUserMetadataFlags(flags: Record<string, string>) {
  return {
    ...(flags.domain ? { domain: flags.domain as UserDomainId } : {}),
    ...(flags.supersedes ? { supersedes: flags.supersedes } : {}),
    ...(flags.source ? { source: flags.source } : {}),
    ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
    ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
    ...(flags["valid-from"] ? { validFrom: flags["valid-from"] } : {}),
    ...(flags["valid-to"] ? { validTo: flags["valid-to"] } : {}),
    ...(flags.notes ? { notes: flags.notes } : {}),
    ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
  };
}

export function parseObjectFlag(value: string | undefined, label: string): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = parseJsonFlag<unknown>(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_json", `${label} must be a JSON object.`, CLI_EXIT_USAGE);
  }
  return parsed as Record<string, unknown>;
}
