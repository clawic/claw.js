import fs from "fs";
import path from "path";

import type { DatabaseServiceStore } from "@clawjs/database";

import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  V1_DATA_EXIT_USAGE,
  expandHome,
  normalizeDbRow,
  nowIso,
  parseCsvOrJson,
  resolveClawjsDataRoot,
  usage,
  usageError,
  writeError,
  writeSuccess,
} from "./v1-data-core.ts";
import type { V1DataCliInput } from "./v1-data-core.ts";
import { scheduleProvidersRoutingSearchEvent, scheduleSnippetsLibrarySearchEvent } from "./cli-search-events.ts";

export function runProviderRoutingCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const area = input.positionals[1];
  if (area === "settings") {
    return runProviderSettingsCommand(input, store);
  }
  const subcommand = input.positionals[2];
  if (subcommand === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM provider_routing ORDER BY feature, capability").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (subcommand === "set" || subcommand === "upsert") {
    const feature = input.flags.feature || input.positionals[3];
    const capability = input.flags.capability || "chat";
    const provider = input.flags.provider;
    if (!feature || !capability || !provider) {
      return usageError(input, "Usage: claw providers routing set FEATURE --capability CAP --provider PROVIDER [--model MODEL] [--account-ref REF]");
    }
    const id = input.flags.id || `${feature}:${capability}`;
    const policyJson = parseProviderJsonFlag(input, "policy", "routing");
    if (policyJson === null) return V1_DATA_EXIT_USAGE;
    const metadataJson = parseProviderJsonFlag(input, "metadata", "routing");
    if (metadataJson === null) return V1_DATA_EXIT_USAGE;
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO provider_routing (id, feature, capability, provider, model, account_ref, policy_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feature, capability) DO UPDATE SET provider = excluded.provider, model = excluded.model,
        account_ref = excluded.account_ref, policy_json = excluded.policy_json,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(
      id,
      feature,
      capability,
      provider,
      input.flags.model || null,
      input.flags["account-ref"] || null,
      policyJson,
      metadataJson,
      now,
      now,
    );
    scheduleProvidersRoutingSearchEvent({
      operation: "upsert",
      kind: "routing",
      feature,
      capability,
      provider,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, {
      id,
      feature,
      capability,
      provider,
      model: input.flags.model || null,
      accountRef: input.flags["account-ref"] || null,
      updatedAt: now,
    });
    return V1_DATA_EXIT_OK;
  }
  if (subcommand === "delete") {
    const feature = input.flags.feature || input.positionals[3];
    const capability = input.flags.capability || "chat";
    if (!feature || !capability) {
      return usageError(input, "Usage: claw providers routing delete FEATURE --capability CAP [--json]");
    }
    const changes = store.sqlite.prepare("DELETE FROM provider_routing WHERE feature = ? AND capability = ?").run(feature, capability).changes;
    if (changes > 0) {
      scheduleProvidersRoutingSearchEvent({
        operation: "delete",
        kind: "routing",
        feature,
        capability,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { feature, capability, deleted: changes > 0 });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "providers"));
}

function runProviderSettingsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const subcommand = input.positionals[2];
  if (subcommand === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM provider_settings ORDER BY provider").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (subcommand === "set" || subcommand === "upsert") {
    const provider = input.flags.provider || input.positionals[3];
    if (!provider || input.flags.enabled === undefined) {
      return usageError(input, "Usage: claw providers settings set PROVIDER --enabled true|false [--json]");
    }
    const enabled = parseProviderEnabledFlag(input.flags.enabled);
    if (enabled === null) {
      return usageError(input, "Usage: claw providers settings set PROVIDER --enabled true|false [--json]");
    }
    const id = input.flags.id || `provider:${provider}`;
    const policyJson = parseProviderJsonFlag(input, "policy", "settings");
    if (policyJson === null) return V1_DATA_EXIT_USAGE;
    const metadataJson = parseProviderJsonFlag(input, "metadata", "settings");
    if (metadataJson === null) return V1_DATA_EXIT_USAGE;
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO provider_settings (id, provider, enabled, policy_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled,
        policy_json = excluded.policy_json, metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      provider,
      enabled ? 1 : 0,
      policyJson,
      metadataJson,
      now,
      now,
    );
    scheduleProvidersRoutingSearchEvent({
      operation: "upsert",
      kind: "setting",
      provider,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, {
      id,
      provider,
      enabled,
      updatedAt: now,
    });
    return V1_DATA_EXIT_OK;
  }
  if (subcommand === "delete") {
    const provider = input.flags.provider || input.positionals[3];
    if (!provider) {
      return usageError(input, "Usage: claw providers settings delete PROVIDER [--json]");
    }
    const changes = store.sqlite.prepare("DELETE FROM provider_settings WHERE provider = ?").run(provider).changes;
    if (changes > 0) {
      scheduleProvidersRoutingSearchEvent({
        operation: "delete",
        kind: "setting",
        provider,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { provider, deleted: changes > 0 });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "providers"));
}

function parseProviderEnabledFlag(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function parseProviderJsonFlag(input: V1DataCliInput, flag: "policy" | "metadata", surface: "routing" | "settings"): string | null {
  const value = input.flags[flag];
  if (value === undefined) return "{}";
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    writeError(input, `invalid_provider_${surface}_${flag}_json`, `Expected --${flag} to be valid JSON.`, V1_DATA_EXIT_USAGE);
    return null;
  }
}

export function runSnippetsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const kind = input.flags.kind;
    const rows = kind
      ? store.sqlite.prepare("SELECT * FROM snippets WHERE kind = ? ORDER BY title").all(kind)
      : store.sqlite.prepare("SELECT * FROM snippets ORDER BY kind, title").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const slug = input.flags.slug || input.positionals[2];
    const title = input.flags.title || input.flags.name || slug;
    const body = input.flags.file ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.file)), "utf8") : (input.flags.body || "");
    if (!slug || !title || !body) {
      return usageError(input, "Usage: claw snippets upsert SLUG --title TITLE --body TEXT [--kind prompt|template|slash]");
    }
    const now = nowIso();
    const skillRefs = parseCsvOrJson(input.flags["skill-refs"] || input.flags["skill-ref"]) ?? [];
    const scopeJson = parseSnippetJsonFlag(input, "scope");
    if (scopeJson === null) return V1_DATA_EXIT_USAGE;
    const metadataJson = parseSnippetJsonFlag(input, "metadata");
    if (metadataJson === null) return V1_DATA_EXIT_USAGE;
    store.sqlite.prepare(`
      INSERT INTO snippets (id, slug, kind, title, body, shortcut, scope_json, skill_refs_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET kind = excluded.kind, title = excluded.title, body = excluded.body,
        shortcut = excluded.shortcut, scope_json = excluded.scope_json, skill_refs_json = excluded.skill_refs_json,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(
      input.flags.id || `snippet-${slug}`,
      slug,
      input.flags.kind || "prompt",
      title,
      body,
      input.flags.shortcut || null,
      scopeJson,
      JSON.stringify(skillRefs),
      metadataJson,
      now,
      now,
    );
    scheduleSnippetsLibrarySearchEvent({
      operation: "upsert",
      slug,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, {
      slug,
      title,
      kind: input.flags.kind || "prompt",
      shortcut: input.flags.shortcut || null,
      skillRefs,
      updatedAt: now,
    });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const slug = input.flags.slug || input.positionals[2];
    if (!slug) {
      return usageError(input, "Usage: claw snippets delete SLUG [--json]");
    }
    const changes = store.sqlite.prepare("DELETE FROM snippets WHERE slug = ?").run(slug).changes;
    if (changes > 0) {
      scheduleSnippetsLibrarySearchEvent({
        operation: "delete",
        slug,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { slug, deleted: changes > 0 });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "snippets"));
}

function parseSnippetJsonFlag(input: V1DataCliInput, flag: "scope" | "metadata"): string | null {
  const value = input.flags[flag];
  if (value === undefined) return "{}";
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    writeError(input, `invalid_snippet_${flag}_json`, `Expected --${flag} to be valid JSON.`, V1_DATA_EXIT_USAGE);
    return null;
  }
}
