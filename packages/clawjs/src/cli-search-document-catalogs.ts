import path from "node:path";
import Database from "better-sqlite3";
import { type SearchDocumentInput } from "@clawjs/search";
import type { BusinessRecordRow } from "./cli-search-command-constants.ts";
import { redactedStructuredText } from "./cli-search-web-external-source.ts";
import type { JsonRecord } from "./v1-data-core.ts";
import type {
  AgentCatalogAgentRow,
  AgentCatalogConnectionRow,
  AgentCatalogPersonalityRow,
  AgentCatalogSkillCollectionRow,
  AppCatalogRow,
  ConnectorCapabilityRow,
  ConnectorOperationRow,
  ContentItemRow,
  DesignResourceRow,
  IotConfigRow,
  MarketplaceChoiceRow,
  ProviderRoutingRow,
  ProviderSettingRow,
  SkillRegistryRow,
  SnippetLibraryRow,
  SocialPostRow,
} from "./cli-search-document-rows.ts";
import {
  firstMeaningfulLine,
  firstTextValue,
  hasTable,
  isSensitiveRecord,
  parseJsonRecord,
  safeSearchUrlHost,
  searchableRecordFields,
  sortedRecordKeys,
  stringArray,
  stringMetadata,
  stringifySearchValue,
} from "./cli-search-document-utils.ts";

export function skillRegistrySearchDocument(row: SkillRegistryRow): SearchDocumentInput | null {
  if (!row.slug) return null;
  const scope = parseJsonRecord(row.scope_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const secretRefs = parseJsonArray(row.secret_refs_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.name,
    row.slug,
    row.kind,
    row.body,
    metadataText,
    row.export_path,
  ].filter(Boolean).join("\n");
  const scopeKind = typeof scope.kind === "string" ? scope.kind : undefined;
  return {
    id: `skills.registry:${row.slug}`,
    source: "skills.registry",
    domain: "skills",
    type: row.kind || "skill",
    resourceId: row.slug,
    title: row.name || row.slug,
    subtitle: [row.kind, scopeKind].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.body) ?? row.name ?? row.slug,
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      skillId: row.id,
      slug: row.slug,
      kind: row.kind,
      scopeKind: scopeKind ?? null,
      requiresProtectedRefs: secretRefs.length > 0,
      exportPath: row.export_path ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      skill: 1,
      requiresProtectedRefs: secretRefs.length > 0 ? -0.1 : 0,
    },
    fragments: [
      ...(row.body ? [{
        id: `skills.registry:${row.slug}:body`,
        title: "body",
        body: row.body,
        snippet: row.body.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "body" },
      }] : []),
      ...(metadataText ? [{
        id: `skills.registry:${row.slug}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open skill", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy skill reference", requiresApproval: false },
    ],
  };
}
export function providerRoutingSearchDocument(row: ProviderRoutingRow): SearchDocumentInput {
  const policy = parseJsonRecord(row.policy_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const policyText = redactedStructuredText(policy);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `routing:${row.feature}:${row.capability}`;
  const body = [
    row.feature,
    row.capability,
    row.provider,
    row.model,
    policyText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `providers.routing:${resourceId}`,
    source: "providers.routing",
    domain: "providers",
    type: "routing_rule",
    resourceId,
    title: `${row.feature} ${row.capability}`,
    subtitle: [row.provider, row.model].filter(Boolean).join(" / "),
    snippet: [row.provider, row.model].filter(Boolean).join(" / ") || row.capability,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "routing",
      routeId: row.id,
      feature: row.feature,
      capability: row.capability,
      provider: row.provider,
      model: row.model ?? null,
      hasAccountRef: !!row.account_ref,
      policyKey: Object.keys(policy).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      providerRouting: 1,
      hasAccountRef: row.account_ref ? 0.1 : 0,
    },
    fragments: [
      ...(policyText ? [{
        id: `providers.routing:${resourceId}:policy`,
        title: "policy",
        body: policyText,
        snippet: policyText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "policy" },
      }] : []),
      ...(metadataText ? [{
        id: `providers.routing:${resourceId}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open provider route", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy provider route reference", requiresApproval: false },
    ],
  };
}
export function providerSettingSearchDocument(row: ProviderSettingRow): SearchDocumentInput {
  const policy = parseJsonRecord(row.policy_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const policyText = redactedStructuredText(policy);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `setting:${row.provider}`;
  const body = [
    row.provider,
    row.enabled === 1 ? "enabled" : "disabled",
    policyText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `providers.routing:${resourceId}`,
    source: "providers.routing",
    domain: "providers",
    type: "provider_setting",
    resourceId,
    title: row.provider,
    subtitle: row.enabled === 1 ? "enabled" : "disabled",
    snippet: firstMeaningfulLine(policyText || metadataText || "") ?? (row.enabled === 1 ? "enabled" : "disabled"),
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "setting",
      settingId: row.id,
      provider: row.provider,
      enabled: row.enabled === 1,
      policyKey: Object.keys(policy).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      providerSetting: 1,
      enabled: row.enabled === 1 ? 0.2 : -0.1,
    },
    fragments: [
      ...(policyText ? [{
        id: `providers.routing:${resourceId}:policy`,
        title: "policy",
        body: policyText,
        snippet: policyText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "policy" },
      }] : []),
      ...(metadataText ? [{
        id: `providers.routing:${resourceId}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open provider setting", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy provider setting reference", requiresApproval: false },
    ],
  };
}
export function snippetLibrarySearchDocument(row: SnippetLibraryRow): SearchDocumentInput {
  const scope = parseJsonRecord(row.scope_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const skillRefs = parseJsonArray(row.skill_refs_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadataText = redactedStructuredText(metadata);
  const scopeText = redactedStructuredText(scope);
  const scopeKind = typeof scope.kind === "string" ? scope.kind : undefined;
  const body = [
    row.title,
    row.slug,
    row.kind,
    row.shortcut,
    row.body,
    skillRefs.join(" "),
    scopeText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `snippets.library:${row.slug}`,
    source: "snippets.library",
    domain: "snippets",
    type: row.kind || "snippet",
    resourceId: row.slug,
    title: row.title || row.slug,
    subtitle: [row.kind, row.shortcut, scopeKind].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.body) ?? row.shortcut ?? row.slug,
    body,
    updatedAt: row.updated_at,
    metadata: {
      snippetId: row.id,
      slug: row.slug,
      kind: row.kind,
      shortcut: row.shortcut ?? null,
      scopeKind: scopeKind ?? null,
      skillRef: skillRefs,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      snippet: 1,
      shortcut: row.shortcut ? 0.3 : 0,
    },
    fragments: [
      ...(row.body ? [{
        id: `snippets.library:${row.slug}:body`,
        title: "body",
        body: row.body,
        snippet: row.body.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "body" },
      }] : []),
      ...(scopeText ? [{
        id: `snippets.library:${row.slug}:scope`,
        title: "scope",
        body: scopeText,
        snippet: scopeText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "scope" },
      }] : []),
      ...(metadataText ? [{
        id: `snippets.library:${row.slug}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open snippet", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy snippet reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogAgentSearchDocument(row: AgentCatalogAgentRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const configText = redactedStructuredText(config);
  const configSnippet = firstMeaningfulLine(stringValue(config.instructionsFreeText) ?? configText ?? "");
  const body = [
    row.name,
    row.kind,
    row.status,
    row.agency_mode,
    row.role,
    row.title,
    row.description,
    row.owner_kind,
    row.owner_id,
    row.workspace_id,
    row.project_id,
    row.runtime,
    row.model,
    row.autonomy_profile,
    row.export_path,
    configText,
  ].filter(Boolean).join("\n");
  const resourceId = `agent:${row.id}`;
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "agent",
    resourceId,
    title: row.name || row.id,
    subtitle: [row.role, row.runtime, row.model].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.description || row.title || row.role) ?? row.id,
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      kind: "agent",
      agentId: row.id,
      status: row.status,
      agencyMode: row.agency_mode,
      role: row.role,
      runtime: row.runtime ?? null,
      model: row.model ?? null,
      autonomyProfile: row.autonomy_profile,
      builtin: row.builtin === 1,
      hasProtectedRef: !!row.secret_ref,
      configKey: Object.keys(config).sort(),
      exportPath: row.export_path ?? null,
      retired: !!row.retired_at,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      agent: 1,
      active: row.status === "active" ? 0.2 : 0,
      builtin: row.builtin === 1 ? 0.1 : 0,
    },
    fragments: [
      ...(row.description ? [{
        id: `agents.catalog:${resourceId}:description`,
        title: "description",
        body: row.description,
        snippet: row.description.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "description" },
      }] : []),
      ...(configText ? [{
        id: `agents.catalog:${resourceId}:configuration`,
        title: "configuration",
        body: configText,
        snippet: configSnippet ?? configText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "configuration" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open agent", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy agent reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogPersonalitySearchDocument(row: AgentCatalogPersonalityRow): SearchDocumentInput {
  const resourceId = `personality:${row.id}`;
  const body = [row.name, row.description, row.prompt, `version ${row.version}`].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "personality",
    resourceId,
    title: row.name || row.id,
    subtitle: `personality / v${row.version}`,
    snippet: firstMeaningfulLine(row.description || row.prompt) ?? row.id,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "personality",
      personalityId: row.id,
      version: row.version,
      hasProtectedRef: false,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      personality: 1,
    },
    fragments: row.prompt ? [{
      id: `agents.catalog:${resourceId}:prompt`,
      title: "prompt",
      body: row.prompt,
      snippet: row.prompt.slice(0, 180),
      sortOrder: 0,
      metadata: { kind: "prompt" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open personality", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy personality reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogSkillCollectionSearchDocument(row: AgentCatalogSkillCollectionRow): SearchDocumentInput {
  const skills = parseJsonArray(row.skills_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadata = parseJsonRecord(row.metadata_json);
  const includedTags = Array.isArray(metadata.includedTags)
    ? metadata.includedTags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const resourceId = `skill_collection:${row.id}`;
  const body = [row.name, row.description, skills.join(" "), includedTags.join(" "), row.export_path].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "skill_collection",
    resourceId,
    title: row.name || row.id,
    subtitle: includedTags.length ? `tags: ${includedTags.join(", ")}` : "skill collection",
    snippet: firstMeaningfulLine(row.description ?? "") ?? (includedTags.join(", ") || row.id),
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      kind: "skill_collection",
      collectionId: row.id,
      skillCount: skills.length,
      includedTags,
      metadataKey: Object.keys(metadata).sort(),
      hasProtectedRef: false,
      exportPath: row.export_path ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      skillCollection: 1,
    },
    actions: [
      { id: "open", kind: "open", label: "Open skill collection", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy skill collection reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogConnectionSearchDocument(row: AgentCatalogConnectionRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const configText = redactedStructuredText(config);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `connection:${row.id}`;
  const body = [
    row.label,
    row.provider,
    scopes.join(" "),
    typeof metadata.lastSyncAt === "string" ? metadata.lastSyncAt : undefined,
    configText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "connection",
    resourceId,
    title: row.label || row.id,
    subtitle: row.provider,
    snippet: scopes.length ? scopes.join(", ") : row.provider,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "connection",
      connectionId: row.id,
      provider: row.provider,
      scopes,
      hasProtectedRef: !!row.secret_ref,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      connection: 1,
      hasProtectedRef: row.secret_ref ? 0.1 : 0,
    },
    fragments: [
      ...(scopes.length ? [{
        id: `agents.catalog:${resourceId}:scopes`,
        title: "scopes",
        body: scopes.join("\n"),
        snippet: scopes.join(", "),
        sortOrder: 0,
        metadata: { kind: "scopes" },
      }] : []),
      ...(configText ? [{
        id: `agents.catalog:${resourceId}:configuration`,
        title: "configuration",
        body: configText,
        snippet: configText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "configuration" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open connection", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy connection reference", requiresApproval: false },
    ],
  };
}
export function marketplaceChoiceSearchDocument(row: MarketplaceChoiceRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.kind,
    row.target,
    row.choice,
    row.status,
    row.rationale,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `marketplace.choices:${row.id}`,
    source: "marketplace.choices",
    domain: "marketplace",
    type: row.kind || "choice",
    resourceId: row.id,
    title: `${row.target}: ${row.choice}`,
    subtitle: [row.kind, row.status].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.rationale || metadataText || "") ?? row.choice,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      target: row.target,
      choice: row.choice,
      status: row.status,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      marketplaceChoice: 1,
      active: row.status === "active" ? 0.2 : 0,
    },
    fragments: [
      ...(row.rationale ? [{
        id: `marketplace.choices:${row.id}:rationale`,
        title: "rationale",
        body: row.rationale,
        snippet: row.rationale.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "rationale" },
      }] : []),
      ...(metadataText ? [{
        id: `marketplace.choices:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open marketplace choice", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy marketplace choice reference", requiresApproval: false },
    ],
  };
}
export function contentItemSearchDocument(row: ContentItemRow, pageBody?: string): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.title,
    row.kind,
    row.status,
    row.brand_id,
    row.campaign_id,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `content.items:${row.id}`,
    source: "content.items",
    domain: "content",
    type: row.kind || "entry",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [row.kind, row.status, row.brand_id, row.campaign_id].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      brandId: row.brand_id ?? null,
      campaignId: row.campaign_id ?? null,
      pageId: row.page_id ?? null,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      content: 1,
      published: row.status === "published" ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `content.items:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(metadataText ? [{
        id: `content.items:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open content item", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy content reference", requiresApproval: false },
    ],
  };
}
export function businessRecordSearchDocument(row: BusinessRecordRow, pageBody?: string): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.name,
    row.kind,
    row.status,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `business.records:${row.id}`,
    source: "business.records",
    domain: "business",
    type: row.kind || "record",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.status].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      pageId: row.page_id ?? null,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      businessRecord: 1,
      active: row.status === "active" ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `business.records:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(metadataText ? [{
        id: `business.records:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open business record", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy business reference", requiresApproval: false },
    ],
  };
}
export function socialPostSearchDocument(row: SocialPostRow, pageBody?: string): SearchDocumentInput {
  const channel = parseJsonRecord(row.channel_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const channelText = redactedStructuredText(channel);
  const metadataText = redactedStructuredText(metadata);
  const channelName = stringValue(channel.name) ?? stringValue(channel.id) ?? stringValue(channel.kind) ?? stringValue(channel.provider);
  const body = [
    row.title,
    row.status,
    channelName,
    channelText,
    row.scheduled_at,
    row.published_at,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `social.posts:${row.id}`,
    source: "social.posts",
    domain: "social",
    type: row.published_at ? "publication" : row.status || "post",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [row.status, channelName, row.scheduled_at].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || channelText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      status: row.status,
      channel: channelName ?? null,
      scheduled: !!row.scheduled_at,
      published: !!row.published_at,
      scheduledAt: row.scheduled_at ?? null,
      publishedAt: row.published_at ?? null,
      pageId: row.page_id ?? null,
      channelKey: Object.keys(channel).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      socialPost: 1,
      scheduled: row.scheduled_at ? 0.1 : 0,
      published: row.published_at ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `social.posts:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(channelText ? [{
        id: `social.posts:${row.id}:channel`,
        title: "channel",
        body: channelText,
        snippet: channelText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "channel" },
      }] : []),
      ...(metadataText ? [{
        id: `social.posts:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open social post", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy social post reference", requiresApproval: false },
    ],
  };
}
export function iotConfigSearchDocument(row: IotConfigRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const configText = redactedStructuredText(config);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.name,
    row.kind,
    row.status,
    row.parent_id,
    configText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `iot.config:${row.id}`,
    source: "iot.config",
    domain: "iot",
    type: row.kind || "config",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.status, row.enabled === 1 ? "enabled" : "disabled"].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(metadataText || configText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      parentId: row.parent_id ?? null,
      enabled: row.enabled === 1,
      hasProtectedRef: !!row.secret_ref,
      configKey: Object.keys(config).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      iotConfig: 1,
      enabled: row.enabled === 1 ? 0.2 : -0.1,
      hasProtectedRef: row.secret_ref ? 0.1 : 0,
    },
    fragments: [
      ...(configText ? [{
        id: `iot.config:${row.id}:config`,
        title: "config",
        body: configText,
        snippet: configText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "config" },
      }] : []),
      ...(metadataText ? [{
        id: `iot.config:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open IoT config", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy IoT config reference", requiresApproval: false },
    ],
  };
}
export function connectorCatalogSearchDocument(row: ConnectorOperationRow, capabilitiesById: Map<string, ConnectorCapabilityRow>): SearchDocumentInput | null {
  if (!row.id) return null;
  const capabilityIds = parseJsonArray(row.capability_ids_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const riskTiers = parseJsonArray(row.risk_tiers_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadata = parseJsonRecord(row.metadata_json);
  const capabilities = capabilityIds
    .map((id) => capabilitiesById.get(id))
    .filter((value): value is ConnectorCapabilityRow => Boolean(value));
  const capabilityText = capabilities.map((capability) => [
    capability.id,
    capability.domain,
    capability.action,
    capability.facet,
    capability.summary,
  ].filter(Boolean).join(" ")).join("\n");
  const providerName = row.provider_display_name || row.provider_id;
  const nativeName = row.native_name || row.id;
  const metadataText = redactedStructuredText(metadata);
  const body = [
    providerName,
    row.provider_id,
    row.id,
    row.runtime_kind,
    row.support,
    nativeName,
    row.cost_risk,
    row.network_policy_id,
    capabilityText,
    metadataText,
  ].filter(Boolean).join("\n");
  const capabilityDomains = Array.from(new Set(capabilities.map((capability) => capability.domain)));
  const capabilityActions = Array.from(new Set(capabilities.map((capability) => capability.action)));
  const requiresApproval = row.requires_approval === 1;
  const costRisk = row.cost_risk || "unknown";
  return {
    id: `connectors.catalog:${row.id}`,
    source: "connectors.catalog",
    domain: "connectors",
    type: "operation",
    resourceId: row.id,
    title: `${providerName} ${nativeName}`.trim(),
    subtitle: [row.runtime_kind, row.support].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(capabilityText) ?? nativeName,
    body,
    updatedAt: row.updated_at,
    metadata: {
      provider: row.provider_id,
      providerDisplayName: providerName,
      providerTrustTier: row.provider_trust_tier ?? null,
      providerEnabled: row.provider_enabled === 1,
      runtimeKind: row.runtime_kind,
      support: row.support,
      nativeName: row.native_name ?? null,
      capabilityId: capabilityIds,
      capabilityDomain: capabilityDomains,
      capabilityAction: capabilityActions,
      riskTier: riskTiers,
      credentialRequired: row.credential_required === 1,
      costRisk,
      requiresApproval,
      networkPolicyId: row.network_policy_id ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      connectorOperation: 1,
      supported: row.support === "supported" ? 0.2 : 0,
    },
    fragments: [
      ...(metadataText ? [{
        id: `connectors.catalog:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: -1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
      ...capabilities.slice(0, 20).map((capability, index) => ({
        id: `connectors.catalog:${row.id}:capability:${capability.id}`,
        title: capability.id,
        body: [capability.domain, capability.action, capability.facet, capability.summary].filter(Boolean).join("\n"),
        snippet: capability.summary.slice(0, 180),
        sortOrder: index,
        metadata: {
          kind: "capability",
          domain: capability.domain,
          action: capability.action,
          facet: capability.facet,
        },
      })),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open connector operation", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy connector reference", requiresApproval: false },
      { id: "execute", kind: "custom", label: "Plan connector operation", requiresApproval, risk: costRisk === "none" || costRisk === "free" ? "system" : "cost", grant: "search.connectors.execute" },
    ],
  };
}
export function mcpServerSearchDocument(server: JsonRecord & { id: string }, configPath: string, updatedAt: string): SearchDocumentInput {
  const transport = typeof server.url === "string" ? "http" : typeof server.command === "string" ? "stdio" : "unknown";
  const enabled = typeof server.enabled === "boolean" ? server.enabled : (typeof server.disabled === "boolean" ? !server.disabled : true);
  const command = typeof server.command === "string" ? server.command : undefined;
  const commandName = command ? path.basename(command) : undefined;
  const url = typeof server.url === "string" ? server.url : undefined;
  const urlHost = url ? safeSearchUrlHost(url) : undefined;
  const cwd = typeof server.cwd === "string" ? server.cwd : undefined;
  const envKeys = sortedRecordKeys(server.env);
  const envPassthrough = stringArray(server.env_passthrough);
  const headerKeys = sortedRecordKeys(server.headers);
  const headersFromEnvKeys = sortedRecordKeys(server.headers_from_env);
  const bearerTokenEnvVar = typeof server.bearer_token_env_var === "string" ? server.bearer_token_env_var : undefined;
  const args = Array.isArray(server.args) ? server.args : [];
  const hasEnv = envKeys.length > 0 || envPassthrough.length > 0 || !!bearerTokenEnvVar;
  const hasHeaders = headerKeys.length > 0 || headersFromEnvKeys.length > 0;
  const configName = path.basename(configPath);
  const body = [
    server.id,
    transport,
    enabled ? "enabled" : "disabled",
    commandName,
    urlHost,
    cwd ? path.basename(cwd) : undefined,
    envKeys.join(" "),
    envPassthrough.join(" "),
    headerKeys.join(" "),
    headersFromEnvKeys.join(" "),
    bearerTokenEnvVar,
  ].filter(Boolean).join("\n");
  const secretSummary = [
    envKeys.length ? `env keys: ${envKeys.join(", ")}` : "",
    envPassthrough.length ? `env passthrough: ${envPassthrough.join(", ")}` : "",
    headerKeys.length ? `header keys: ${headerKeys.join(", ")}` : "",
    headersFromEnvKeys.length ? `headers from env: ${headersFromEnvKeys.join(", ")}` : "",
    bearerTokenEnvVar ? `bearer token env var: ${bearerTokenEnvVar}` : "",
  ].filter(Boolean).join("\n");
  return {
    id: `mcp.servers:${server.id}`,
    source: "mcp.servers",
    domain: "mcp",
    type: "server",
    resourceId: server.id,
    title: server.id,
    subtitle: [transport, enabled ? "enabled" : "disabled"].filter(Boolean).join(" / "),
    snippet: [commandName, urlHost, configName].filter(Boolean).join(" / ") || transport,
    body,
    path: configPath,
    updatedAt,
    metadata: {
      serverId: server.id,
      transport,
      enabled,
      commandName: commandName ?? null,
      urlHost: urlHost ?? null,
      cwdBasename: cwd ? path.basename(cwd) : null,
      argCount: args.length,
      hasEnv,
      hasHeaders,
      envKey: envKeys,
      envPassthrough,
      headerKey: headerKeys,
      headersFromEnvKey: headersFromEnvKeys,
      bearerTokenEnvVar: bearerTokenEnvVar ?? null,
      configPath,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      mcp: 1,
      enabled: enabled ? 0.2 : -0.1,
    },
    fragments: secretSummary ? [{
      id: `mcp.servers:${server.id}:redacted-config`,
      title: "redacted config",
      body: secretSummary,
      snippet: secretSummary.slice(0, 180),
      sortOrder: 0,
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open MCP server", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy MCP reference", requiresApproval: false },
    ],
  };
}
export function appCatalogSearchDocument(row: AppCatalogRow): SearchDocumentInput {
  const manifest = parseJsonRecord(row.manifest_json);
  const permissions = parseJsonRecord(row.permissions_json);
  const manifestText = redactedStructuredText(manifest);
  const permissionsText = redactedStructuredText(permissions);
  const permissionsKeys = Object.keys(permissions).sort();
  const body = [
    row.name,
    row.slug,
    row.description,
    row.root_path ? path.basename(row.root_path) : undefined,
    manifestText,
    permissionsText,
    permissionsKeys.join(" "),
  ].filter(Boolean).join("\n");
  return {
    id: `apps.catalog:${row.id}`,
    source: "apps.catalog",
    domain: "apps",
    type: "app",
    resourceId: row.id,
    title: row.name || row.slug || row.id,
    subtitle: [row.slug, row.pinned === 1 ? "pinned" : ""].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.description || manifestText || "") ?? row.slug,
    body,
    ...(row.root_path ? { path: row.root_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      appId: row.id,
      slug: row.slug,
      pinned: row.pinned === 1,
      rootBasename: row.root_path ? path.basename(row.root_path) : null,
      lastOpenedAt: row.last_opened_at,
      createdByChatId: row.created_by_chat_id,
      manifestKeys: Object.keys(manifest).sort(),
      permissionKey: permissionsKeys,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      app: 1,
      pinned: row.pinned === 1 ? 0.4 : 0,
    },
    fragments: [
      ...(manifestText ? [{
        id: `apps.catalog:${row.id}:manifest`,
        title: "manifest",
        body: manifestText,
        snippet: manifestText.slice(0, 180),
        sortOrder: 0,
        metadata: { redactedValues: true },
      }] : []),
      ...(permissionsText ? [{
        id: `apps.catalog:${row.id}:permissions`,
        title: "permissions",
        body: permissionsText,
        snippet: permissionsText.slice(0, 180),
        sortOrder: 1,
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open app", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy app reference", requiresApproval: false },
    ],
  };
}
export function designResourceSearchDocument(row: DesignResourceRow): SearchDocumentInput {
  const manifest = parseJsonRecord(row.manifest_json);
  const manifestText = redactedStructuredText(manifest);
  const body = [
    row.name,
    row.kind,
    row.id,
    row.root_path ? path.basename(row.root_path) : undefined,
    manifestText,
  ].filter(Boolean).join("\n");
  return {
    id: `design.resources:${row.id}`,
    source: "design.resources",
    domain: "design",
    type: row.kind || "resource",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.builtin === 1 ? "built-in" : ""].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(manifestText || "") ?? row.kind,
    body,
    ...(row.root_path ? { path: row.root_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      resourceId: row.id,
      kind: row.kind,
      builtin: row.builtin === 1,
      rootBasename: row.root_path ? path.basename(row.root_path) : null,
      manifestKeys: Object.keys(manifest).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      design: 1,
      builtin: row.builtin === 1 ? 0.2 : 0,
    },
    fragments: manifestText ? [{
      id: `design.resources:${row.id}:manifest`,
      title: "manifest",
      body: manifestText,
      snippet: manifestText.slice(0, 180),
      sortOrder: 0,
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open design resource", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy design reference", requiresApproval: false },
    ],
  };
}
export function connectorCapabilitiesById(db: Database.Database): Map<string, ConnectorCapabilityRow> {
  if (!hasTable(db, "connector_capabilities")) return new Map();
  const rows = db.prepare(`
    SELECT id, domain, action, facet, summary
    FROM connector_capabilities
  `).all() as ConnectorCapabilityRow[];
  return new Map(rows.map((row) => [row.id, row]));
}
