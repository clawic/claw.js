import fs from "fs";
import path from "path";

import type { DatabaseServiceStore } from "@clawjs/database";

import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  expandHome,
  normalizeDbRow,
  nowIso,
  parseCsvOrJson,
  resolveClawjsDataRoot,
  truthy,
  usage,
  usageError,
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
      input.flags.policy ? JSON.stringify(JSON.parse(input.flags.policy)) : "{}",
      input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}",
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
    const id = input.flags.id || `provider:${provider}`;
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
      truthy(input.flags.enabled) ? 1 : 0,
      input.flags.policy ? JSON.stringify(JSON.parse(input.flags.policy)) : "{}",
      input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}",
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
      enabled: truthy(input.flags.enabled),
      updatedAt: now,
    });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "providers"));
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
      input.flags.scope ? JSON.stringify(JSON.parse(input.flags.scope)) : "{}",
      JSON.stringify(skillRefs),
      input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}",
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
