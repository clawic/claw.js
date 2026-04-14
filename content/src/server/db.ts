import crypto from "node:crypto";

import Database from "better-sqlite3";

import { hashSecret } from "./auth.ts";
import { ContentError } from "../shared/errors.ts";
import { defaultCapabilityMap, validateVariant } from "./publish.ts";
import type {
  ContentApprovalRequest,
  ContentAssetKind,
  ContentAssetRef,
  ContentBrand,
  ContentCampaign,
  ContentDestination,
  ContentDestinationKind,
  ContentEntry,
  ContentFormat,
  ContentOperation,
  ContentPlanStatus,
  ContentPublishPlan,
  ContentPublicationRun,
  ContentPublishPolicy,
  ContentRevision,
  ContentScopedTokenRecord,
  ContentType,
  ContentVariant,
} from "../shared/types.ts";

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stringJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  default_locale: string;
  voice_summary: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
}

interface DestinationRow {
  id: string;
  brand_id: string;
  name: string;
  kind: string;
  publish_policy: string;
  status: string;
  capability_map_json: string;
  secret_ref: string | null;
  external_account_label: string | null;
  config_json: string;
  conditional_rules_json: string;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  brand_id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  id: string;
  brand_id: string;
  campaign_id: string | null;
  content_type: string;
  canonical_format: string;
  title: string;
  summary: string;
  canonical_body: string;
  status: string;
  tags_json: string;
  owner_id: string | null;
  author_id: string | null;
  current_revision_number: number;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  entry_id: string;
  revision_number: number;
  title: string;
  summary: string;
  canonical_body: string;
  snapshot_json: string;
  created_at: string;
  author_id: string | null;
}

interface AssetRow {
  id: string;
  entry_id: string;
  variant_id: string | null;
  drive_item_id: string;
  asset_kind: string;
  name: string;
  alt_text: string | null;
  order_index: number;
  created_at: string;
}

interface VariantRow {
  id: string;
  entry_id: string;
  destination_id: string;
  format: string;
  title: string;
  body: string;
  status: string;
  validation_errors_json: string;
  media_plan_json: string;
  publish_config_json: string;
  created_at: string;
  updated_at: string;
}

interface ApprovalRow {
  id: string;
  entry_id: string;
  variant_id: string;
  destination_id: string;
  status: string;
  requested_by: string | null;
  reviewed_by: string | null;
  requested_at: string;
  reviewed_at: string | null;
  comment: string | null;
}

interface PlanRow {
  id: string;
  entry_id: string;
  variant_id: string;
  destination_id: string;
  status: string;
  scheduled_at: string | null;
  temporal_item_id: string | null;
  destination_snapshot_json: string;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  plan_id: string;
  entry_id: string;
  variant_id: string;
  destination_id: string;
  status: string;
  attempt_number: number;
  external_id: string | null;
  provider_message: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface TokenRow {
  id: string;
  label: string;
  token_hash: string;
  operations_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function serializeBrand(row: BrandRow): ContentBrand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    defaultLocale: row.default_locale,
    voiceSummary: row.voice_summary,
    tags: parseJson<string[]>(row.tags_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDestination(row: DestinationRow): ContentDestination {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    kind: row.kind as ContentDestinationKind,
    publishPolicy: row.publish_policy as ContentPublishPolicy,
    status: row.status as ContentDestination["status"],
    capabilityMap: parseJson(row.capability_map_json, defaultCapabilityMap(row.kind as ContentDestinationKind)),
    secretRef: row.secret_ref,
    externalAccountLabel: row.external_account_label,
    config: parseJson(row.config_json, {}),
    conditionalRules: parseJson(row.conditional_rules_json, {
      requireApprovalWithAssets: true,
      requireApprovalWhenScheduled: true,
    }),
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeCampaign(row: CampaignRow): ContentCampaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as ContentCampaign["status"],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEntry(row: EntryRow): ContentEntry {
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    contentType: row.content_type as ContentType,
    canonicalFormat: row.canonical_format as ContentFormat,
    title: row.title,
    summary: row.summary,
    canonicalBody: row.canonical_body,
    status: row.status as ContentEntry["status"],
    tags: parseJson(row.tags_json, []),
    ownerId: row.owner_id,
    authorId: row.author_id,
    currentRevisionNumber: row.current_revision_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRevision(row: RevisionRow): ContentRevision {
  return {
    id: row.id,
    entryId: row.entry_id,
    revisionNumber: row.revision_number,
    title: row.title,
    summary: row.summary,
    canonicalBody: row.canonical_body,
    snapshot: parseJson(row.snapshot_json, {}),
    createdAt: row.created_at,
    authorId: row.author_id,
  };
}

function serializeAsset(row: AssetRow): ContentAssetRef {
  return {
    id: row.id,
    entryId: row.entry_id,
    variantId: row.variant_id,
    driveItemId: row.drive_item_id,
    assetKind: row.asset_kind as ContentAssetKind,
    name: row.name,
    altText: row.alt_text,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

function serializeVariant(row: VariantRow): ContentVariant {
  return {
    id: row.id,
    entryId: row.entry_id,
    destinationId: row.destination_id,
    format: row.format as ContentFormat,
    title: row.title,
    body: row.body,
    status: row.status as ContentVariant["status"],
    validationErrors: parseJson(row.validation_errors_json, []),
    mediaPlan: parseJson(row.media_plan_json, {}),
    publishConfig: parseJson(row.publish_config_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeApproval(row: ApprovalRow): ContentApprovalRequest {
  return {
    id: row.id,
    entryId: row.entry_id,
    variantId: row.variant_id,
    destinationId: row.destination_id,
    status: row.status as ContentApprovalRequest["status"],
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    comment: row.comment,
  };
}

function serializePlan(row: PlanRow): ContentPublishPlan {
  return {
    id: row.id,
    entryId: row.entry_id,
    variantId: row.variant_id,
    destinationId: row.destination_id,
    status: row.status as ContentPlanStatus,
    scheduledAt: row.scheduled_at,
    temporalItemId: row.temporal_item_id,
    destinationSnapshot: parseJson(row.destination_snapshot_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRun(row: RunRow): ContentPublicationRun {
  return {
    id: row.id,
    planId: row.plan_id,
    entryId: row.entry_id,
    variantId: row.variant_id,
    destinationId: row.destination_id,
    status: row.status as ContentPublicationRun["status"],
    attemptNumber: row.attempt_number,
    externalId: row.external_id,
    providerMessage: row.provider_message,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function serializeToken(row: TokenRow): ContentScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    operations: parseJson<ContentOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export class ContentStore {
  private readonly sqlite: ReturnType<typeof Database>;

  constructor(
    dbPath: string,
    options: { adminEmail: string; adminPassword: string },
  ) {
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed(options);
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        default_locale TEXT NOT NULL,
        voice_summary TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS destinations (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        publish_policy TEXT NOT NULL,
        status TEXT NOT NULL,
        capability_map_json TEXT NOT NULL,
        secret_ref TEXT,
        external_account_label TEXT,
        config_json TEXT NOT NULL,
        conditional_rules_json TEXT NOT NULL,
        last_checked_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        starts_at TEXT,
        ends_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS campaigns_brand_slug_idx ON campaigns(brand_id, slug);
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        content_type TEXT NOT NULL,
        canonical_format TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        canonical_body TEXT NOT NULL,
        status TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        owner_id TEXT,
        author_id TEXT,
        current_revision_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        canonical_body TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        author_id TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS revisions_entry_number_idx ON revisions(entry_id, revision_number);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        variant_id TEXT,
        drive_item_id TEXT NOT NULL,
        asset_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        alt_text TEXT,
        order_index INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS variants (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
        format TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        validation_errors_json TEXT NOT NULL,
        media_plan_json TEXT NOT NULL,
        publish_config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS variants_entry_destination_idx ON variants(entry_id, destination_id);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        requested_by TEXT,
        reviewed_by TEXT,
        requested_at TEXT NOT NULL,
        reviewed_at TEXT,
        comment TEXT
      );
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        scheduled_at TEXT,
        temporal_item_id TEXT,
        destination_snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS publication_runs (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        external_id TEXT,
        provider_message TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
    `);
  }

  private seed(options: { adminEmail: string; adminPassword: string }): void {
    const row = this.sqlite.prepare("SELECT * FROM admins WHERE email = ?").get(options.adminEmail) as AdminRow | undefined;
    if (row) return;
    this.sqlite.prepare(`
      INSERT INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(uuid(), options.adminEmail, hashSecret(options.adminPassword), nowIso());
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare("SELECT * FROM admins WHERE email = ?").get(email) as AdminRow | undefined;
    if (!row) return null;
    if (row.password_hash !== hashSecret(password)) return null;
    return { id: row.id, email: row.email };
  }

  listBrands(): ContentBrand[] {
    return (this.sqlite.prepare("SELECT * FROM brands ORDER BY created_at DESC").all() as BrandRow[]).map(serializeBrand);
  }

  getBrand(id: string): ContentBrand | null {
    const row = this.sqlite.prepare("SELECT * FROM brands WHERE id = ? OR slug = ?").get(id, id) as BrandRow | undefined;
    return row ? serializeBrand(row) : null;
  }

  createBrand(input: {
    name: string;
    slug?: string;
    description?: string;
    defaultLocale?: string;
    voiceSummary?: string;
    tags?: string[];
  }): ContentBrand {
    if (!input.name.trim()) throw new ContentError("Brand name is required.");
    const id = uuid();
    const createdAt = nowIso();
    const row: BrandRow = {
      id,
      name: input.name.trim(),
      slug: input.slug?.trim() || slugify(input.name),
      description: input.description?.trim() ?? "",
      default_locale: input.defaultLocale?.trim() ?? "en",
      voice_summary: input.voiceSummary?.trim() ?? "",
      tags_json: stringJson(input.tags ?? []),
      created_at: createdAt,
      updated_at: createdAt,
    };
    this.sqlite.prepare(`
      INSERT INTO brands (id, name, slug, description, default_locale, voice_summary, tags_json, created_at, updated_at)
      VALUES (@id, @name, @slug, @description, @default_locale, @voice_summary, @tags_json, @created_at, @updated_at)
    `).run(row);
    return serializeBrand(row);
  }

  updateBrand(id: string, input: Partial<{
    name: string;
    description: string;
    defaultLocale: string;
    voiceSummary: string;
    tags: string[];
  }>): ContentBrand {
    const current = this.getBrand(id);
    if (!current) throw new ContentError("Brand not found.", 404, "brand_not_found");
    const updated: BrandRow = {
      id: current.id,
      name: input.name?.trim() ?? current.name,
      slug: current.slug,
      description: input.description?.trim() ?? current.description,
      default_locale: input.defaultLocale?.trim() ?? current.defaultLocale,
      voice_summary: input.voiceSummary?.trim() ?? current.voiceSummary,
      tags_json: stringJson(input.tags ?? current.tags),
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE brands
      SET name=@name, description=@description, default_locale=@default_locale, voice_summary=@voice_summary, tags_json=@tags_json, updated_at=@updated_at
      WHERE id=@id
    `).run(updated);
    return serializeBrand(updated);
  }

  listDestinations(filters: { brandId?: string } = {}): ContentDestination[] {
    const rows = filters.brandId
      ? this.sqlite.prepare("SELECT * FROM destinations WHERE brand_id = ? ORDER BY created_at DESC").all(filters.brandId)
      : this.sqlite.prepare("SELECT * FROM destinations ORDER BY created_at DESC").all();
    return (rows as DestinationRow[]).map(serializeDestination);
  }

  getDestination(id: string): ContentDestination | null {
    const row = this.sqlite.prepare("SELECT * FROM destinations WHERE id = ?").get(id) as DestinationRow | undefined;
    return row ? serializeDestination(row) : null;
  }

  createDestination(input: {
    brandId: string;
    name: string;
    kind: ContentDestinationKind;
    publishPolicy?: ContentPublishPolicy;
    status?: ContentDestination["status"];
    secretRef?: string | null;
    externalAccountLabel?: string | null;
    capabilityMap?: Partial<ContentDestination["capabilityMap"]>;
    config?: Record<string, unknown>;
    conditionalRules?: Partial<ContentDestination["conditionalRules"]>;
  }): ContentDestination {
    if (!this.getBrand(input.brandId)) throw new ContentError("Brand not found.", 404, "brand_not_found");
    if (!input.name.trim()) throw new ContentError("Destination name is required.");
    const createdAt = nowIso();
    const capabilityMap = { ...defaultCapabilityMap(input.kind), ...(input.capabilityMap ?? {}) };
    const row: DestinationRow = {
      id: uuid(),
      brand_id: input.brandId,
      name: input.name.trim(),
      kind: input.kind,
      publish_policy: input.publishPolicy ?? "manual",
      status: input.status ?? "active",
      capability_map_json: stringJson(capabilityMap),
      secret_ref: input.secretRef ?? null,
      external_account_label: input.externalAccountLabel ?? null,
      config_json: stringJson(input.config ?? {}),
      conditional_rules_json: stringJson({
        requireApprovalWithAssets: true,
        requireApprovalWhenScheduled: true,
        ...(input.conditionalRules ?? {}),
      }),
      last_checked_at: null,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    this.sqlite.prepare(`
      INSERT INTO destinations (
        id, brand_id, name, kind, publish_policy, status, capability_map_json, secret_ref, external_account_label, config_json,
        conditional_rules_json, last_checked_at, last_error, created_at, updated_at
      ) VALUES (
        @id, @brand_id, @name, @kind, @publish_policy, @status, @capability_map_json, @secret_ref, @external_account_label, @config_json,
        @conditional_rules_json, @last_checked_at, @last_error, @created_at, @updated_at
      )
    `).run(row);
    return serializeDestination(row);
  }

  updateDestination(id: string, input: Partial<{
    name: string;
    publishPolicy: ContentPublishPolicy;
    status: ContentDestination["status"];
    secretRef: string | null;
    externalAccountLabel: string | null;
    config: Record<string, unknown>;
    capabilityMap: Partial<ContentDestination["capabilityMap"]>;
    conditionalRules: Partial<ContentDestination["conditionalRules"]>;
    lastCheckedAt: string | null;
    lastError: string | null;
  }>): ContentDestination {
    const current = this.getDestination(id);
    if (!current) throw new ContentError("Destination not found.", 404, "destination_not_found");
    const row: DestinationRow = {
      id: current.id,
      brand_id: current.brandId,
      name: input.name?.trim() ?? current.name,
      kind: current.kind,
      publish_policy: input.publishPolicy ?? current.publishPolicy,
      status: input.status ?? current.status,
      capability_map_json: stringJson({ ...current.capabilityMap, ...(input.capabilityMap ?? {}) }),
      secret_ref: input.secretRef === undefined ? current.secretRef : input.secretRef,
      external_account_label: input.externalAccountLabel === undefined ? current.externalAccountLabel : input.externalAccountLabel,
      config_json: stringJson(input.config ?? current.config),
      conditional_rules_json: stringJson({ ...current.conditionalRules, ...(input.conditionalRules ?? {}) }),
      last_checked_at: input.lastCheckedAt === undefined ? current.lastCheckedAt : input.lastCheckedAt,
      last_error: input.lastError === undefined ? current.lastError : input.lastError,
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE destinations
      SET name=@name, publish_policy=@publish_policy, status=@status, capability_map_json=@capability_map_json, secret_ref=@secret_ref,
          external_account_label=@external_account_label, config_json=@config_json, conditional_rules_json=@conditional_rules_json,
          last_checked_at=@last_checked_at, last_error=@last_error, updated_at=@updated_at
      WHERE id=@id
    `).run(row);
    return serializeDestination(row);
  }

  listCampaigns(filters: { brandId?: string } = {}): ContentCampaign[] {
    const rows = filters.brandId
      ? this.sqlite.prepare("SELECT * FROM campaigns WHERE brand_id = ? ORDER BY created_at DESC").all(filters.brandId)
      : this.sqlite.prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all();
    return (rows as CampaignRow[]).map(serializeCampaign);
  }

  createCampaign(input: {
    brandId: string;
    name: string;
    slug?: string;
    description?: string;
    status?: ContentCampaign["status"];
    startsAt?: string | null;
    endsAt?: string | null;
  }): ContentCampaign {
    if (!this.getBrand(input.brandId)) throw new ContentError("Brand not found.", 404, "brand_not_found");
    if (!input.name.trim()) throw new ContentError("Campaign name is required.");
    const createdAt = nowIso();
    const row: CampaignRow = {
      id: uuid(),
      brand_id: input.brandId,
      name: input.name.trim(),
      slug: input.slug?.trim() || slugify(input.name),
      description: input.description?.trim() ?? "",
      status: input.status ?? "draft",
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    this.sqlite.prepare(`
      INSERT INTO campaigns (id, brand_id, name, slug, description, status, starts_at, ends_at, created_at, updated_at)
      VALUES (@id, @brand_id, @name, @slug, @description, @status, @starts_at, @ends_at, @created_at, @updated_at)
    `).run(row);
    return serializeCampaign(row);
  }

  updateCampaign(id: string, input: Partial<{
    name: string;
    description: string;
    status: ContentCampaign["status"];
    startsAt: string | null;
    endsAt: string | null;
  }>): ContentCampaign {
    const current = this.listCampaigns().find((entry) => entry.id === id);
    if (!current) throw new ContentError("Campaign not found.", 404, "campaign_not_found");
    const row: CampaignRow = {
      id: current.id,
      brand_id: current.brandId,
      name: input.name?.trim() ?? current.name,
      slug: current.slug,
      description: input.description?.trim() ?? current.description,
      status: input.status ?? current.status,
      starts_at: input.startsAt === undefined ? current.startsAt : input.startsAt,
      ends_at: input.endsAt === undefined ? current.endsAt : input.endsAt,
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE campaigns
      SET name=@name, description=@description, status=@status, starts_at=@starts_at, ends_at=@ends_at, updated_at=@updated_at
      WHERE id=@id
    `).run(row);
    return serializeCampaign(row);
  }

  getEntry(id: string): ContentEntry | null {
    const row = this.sqlite.prepare("SELECT * FROM entries WHERE id = ?").get(id) as EntryRow | undefined;
    return row ? serializeEntry(row) : null;
  }

  listEntries(filters: {
    brandId?: string;
    campaignId?: string;
    status?: ContentEntry["status"];
  } = {}): ContentEntry[] {
    let sql = "SELECT * FROM entries WHERE 1=1";
    const params: unknown[] = [];
    if (filters.brandId) {
      sql += " AND brand_id = ?";
      params.push(filters.brandId);
    }
    if (filters.campaignId) {
      sql += " AND campaign_id = ?";
      params.push(filters.campaignId);
    }
    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    sql += " ORDER BY created_at DESC";
    return (this.sqlite.prepare(sql).all(...params) as EntryRow[]).map(serializeEntry);
  }

  private createRevision(entry: ContentEntry): void {
    const row: RevisionRow = {
      id: uuid(),
      entry_id: entry.id,
      revision_number: entry.currentRevisionNumber,
      title: entry.title,
      summary: entry.summary,
      canonical_body: entry.canonicalBody,
      snapshot_json: stringJson(entry),
      created_at: nowIso(),
      author_id: entry.authorId,
    };
    this.sqlite.prepare(`
      INSERT INTO revisions (id, entry_id, revision_number, title, summary, canonical_body, snapshot_json, created_at, author_id)
      VALUES (@id, @entry_id, @revision_number, @title, @summary, @canonical_body, @snapshot_json, @created_at, @author_id)
    `).run(row);
  }

  createEntry(input: {
    brandId: string;
    campaignId?: string | null;
    contentType: ContentType;
    canonicalFormat: ContentFormat;
    title: string;
    summary?: string;
    canonicalBody: string;
    tags?: string[];
    ownerId?: string | null;
    authorId?: string | null;
  }): ContentEntry {
    if (!this.getBrand(input.brandId)) throw new ContentError("Brand not found.", 404, "brand_not_found");
    if (!input.title.trim()) throw new ContentError("Entry title is required.");
    if (!input.canonicalBody.trim()) throw new ContentError("Entry body is required.");
    const createdAt = nowIso();
    const row: EntryRow = {
      id: uuid(),
      brand_id: input.brandId,
      campaign_id: input.campaignId ?? null,
      content_type: input.contentType,
      canonical_format: input.canonicalFormat,
      title: input.title.trim(),
      summary: input.summary?.trim() ?? "",
      canonical_body: input.canonicalBody,
      status: "draft",
      tags_json: stringJson(input.tags ?? []),
      owner_id: input.ownerId ?? null,
      author_id: input.authorId ?? null,
      current_revision_number: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
    this.sqlite.prepare(`
      INSERT INTO entries (
        id, brand_id, campaign_id, content_type, canonical_format, title, summary, canonical_body, status, tags_json,
        owner_id, author_id, current_revision_number, created_at, updated_at
      ) VALUES (
        @id, @brand_id, @campaign_id, @content_type, @canonical_format, @title, @summary, @canonical_body, @status, @tags_json,
        @owner_id, @author_id, @current_revision_number, @created_at, @updated_at
      )
    `).run(row);
    const entry = serializeEntry(row);
    this.createRevision(entry);
    return entry;
  }

  updateEntry(id: string, input: Partial<{
    campaignId: string | null;
    title: string;
    summary: string;
    canonicalBody: string;
    status: ContentEntry["status"];
    tags: string[];
    ownerId: string | null;
    authorId: string | null;
  }>): ContentEntry {
    const current = this.getEntry(id);
    if (!current) throw new ContentError("Entry not found.", 404, "entry_not_found");
    const row: EntryRow = {
      id: current.id,
      brand_id: current.brandId,
      campaign_id: input.campaignId === undefined ? current.campaignId : input.campaignId,
      content_type: current.contentType,
      canonical_format: current.canonicalFormat,
      title: input.title?.trim() ?? current.title,
      summary: input.summary?.trim() ?? current.summary,
      canonical_body: input.canonicalBody ?? current.canonicalBody,
      status: input.status ?? current.status,
      tags_json: stringJson(input.tags ?? current.tags),
      owner_id: input.ownerId === undefined ? current.ownerId : input.ownerId,
      author_id: input.authorId === undefined ? current.authorId : input.authorId,
      current_revision_number: current.currentRevisionNumber + 1,
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE entries
      SET campaign_id=@campaign_id, title=@title, summary=@summary, canonical_body=@canonical_body, status=@status, tags_json=@tags_json,
          owner_id=@owner_id, author_id=@author_id, current_revision_number=@current_revision_number, updated_at=@updated_at
      WHERE id=@id
    `).run(row);
    const entry = serializeEntry(row);
    this.createRevision(entry);
    return entry;
  }

  archiveEntry(id: string): ContentEntry {
    return this.updateEntry(id, { status: "archived" });
  }

  listRevisions(entryId: string): ContentRevision[] {
    return (this.sqlite.prepare("SELECT * FROM revisions WHERE entry_id = ? ORDER BY revision_number DESC").all(entryId) as RevisionRow[]).map(serializeRevision);
  }

  listAssets(input: { entryId?: string; variantId?: string | null } = {}): ContentAssetRef[] {
    let sql = "SELECT * FROM assets WHERE 1=1";
    const params: unknown[] = [];
    if (input.entryId) {
      sql += " AND entry_id = ?";
      params.push(input.entryId);
    }
    if (input.variantId !== undefined) {
      if (input.variantId === null) {
        sql += " AND variant_id IS NULL";
      } else {
        sql += " AND variant_id = ?";
        params.push(input.variantId);
      }
    }
    sql += " ORDER BY order_index ASC, created_at ASC";
    return (this.sqlite.prepare(sql).all(...params) as AssetRow[]).map(serializeAsset);
  }

  attachAsset(input: {
    entryId: string;
    variantId?: string | null;
    driveItemId: string;
    assetKind: ContentAssetKind;
    name: string;
    altText?: string | null;
  }): ContentAssetRef {
    if (!this.getEntry(input.entryId)) throw new ContentError("Entry not found.", 404, "entry_not_found");
    const orderIndex = this.listAssets({ entryId: input.entryId, variantId: input.variantId ?? null }).length;
    const row: AssetRow = {
      id: uuid(),
      entry_id: input.entryId,
      variant_id: input.variantId ?? null,
      drive_item_id: input.driveItemId,
      asset_kind: input.assetKind,
      name: input.name.trim(),
      alt_text: input.altText ?? null,
      order_index: orderIndex,
      created_at: nowIso(),
    };
    this.sqlite.prepare(`
      INSERT INTO assets (id, entry_id, variant_id, drive_item_id, asset_kind, name, alt_text, order_index, created_at)
      VALUES (@id, @entry_id, @variant_id, @drive_item_id, @asset_kind, @name, @alt_text, @order_index, @created_at)
    `).run(row);
    return serializeAsset(row);
  }

  getVariant(id: string): ContentVariant | null {
    const row = this.sqlite.prepare("SELECT * FROM variants WHERE id = ?").get(id) as VariantRow | undefined;
    return row ? serializeVariant(row) : null;
  }

  listVariants(filters: {
    entryId?: string;
    destinationId?: string;
    status?: ContentVariant["status"];
  } = {}): ContentVariant[] {
    let sql = "SELECT * FROM variants WHERE 1=1";
    const params: unknown[] = [];
    if (filters.entryId) {
      sql += " AND entry_id = ?";
      params.push(filters.entryId);
    }
    if (filters.destinationId) {
      sql += " AND destination_id = ?";
      params.push(filters.destinationId);
    }
    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    sql += " ORDER BY created_at DESC";
    return (this.sqlite.prepare(sql).all(...params) as VariantRow[]).map(serializeVariant);
  }

  createVariant(input: {
    entryId: string;
    destinationId: string;
    format: ContentFormat;
    title: string;
    body: string;
    mediaPlan?: Record<string, unknown>;
    publishConfig?: Record<string, unknown>;
  }): ContentVariant {
    const entry = this.getEntry(input.entryId);
    if (!entry) throw new ContentError("Entry not found.", 404, "entry_not_found");
    const destination = this.getDestination(input.destinationId);
    if (!destination) throw new ContentError("Destination not found.", 404, "destination_not_found");
    const assets = this.listAssets({ entryId: entry.id, variantId: null });
    const validationErrors = validateVariant({
      variant: { body: input.body, format: input.format },
      destination,
      assets,
    });
    const now = nowIso();
    const row: VariantRow = {
      id: uuid(),
      entry_id: entry.id,
      destination_id: destination.id,
      format: input.format,
      title: input.title.trim() || entry.title,
      body: input.body,
      status: validationErrors.length > 0 ? "blocked" : "ready",
      validation_errors_json: stringJson(validationErrors),
      media_plan_json: stringJson(input.mediaPlan ?? {}),
      publish_config_json: stringJson(input.publishConfig ?? {}),
      created_at: now,
      updated_at: now,
    };
    this.sqlite.prepare(`
      INSERT INTO variants (id, entry_id, destination_id, format, title, body, status, validation_errors_json, media_plan_json, publish_config_json, created_at, updated_at)
      VALUES (@id, @entry_id, @destination_id, @format, @title, @body, @status, @validation_errors_json, @media_plan_json, @publish_config_json, @created_at, @updated_at)
    `).run(row);
    return serializeVariant(row);
  }

  updateVariant(id: string, input: Partial<{
    format: ContentFormat;
    title: string;
    body: string;
    mediaPlan: Record<string, unknown>;
    publishConfig: Record<string, unknown>;
    status: ContentVariant["status"];
  }>): ContentVariant {
    const current = this.getVariant(id);
    if (!current) throw new ContentError("Variant not found.", 404, "variant_not_found");
    const destination = this.getDestination(current.destinationId);
    if (!destination) throw new ContentError("Destination not found.", 404, "destination_not_found");
    const assets = this.listAssets({ entryId: current.entryId, variantId: null });
    const format = input.format ?? current.format;
    const body = input.body ?? current.body;
    const validationErrors = validateVariant({
      variant: { body, format },
      destination,
      assets,
    });
    const row: VariantRow = {
      id: current.id,
      entry_id: current.entryId,
      destination_id: current.destinationId,
      format,
      title: input.title?.trim() ?? current.title,
      body,
      status: input.status ?? (validationErrors.length > 0 ? "blocked" : current.status === "published" ? "published" : "ready"),
      validation_errors_json: stringJson(validationErrors),
      media_plan_json: stringJson(input.mediaPlan ?? current.mediaPlan),
      publish_config_json: stringJson(input.publishConfig ?? current.publishConfig),
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE variants
      SET format=@format, title=@title, body=@body, status=@status, validation_errors_json=@validation_errors_json,
          media_plan_json=@media_plan_json, publish_config_json=@publish_config_json, updated_at=@updated_at
      WHERE id=@id
    `).run(row);
    return serializeVariant(row);
  }

  listApprovals(filters: { status?: ContentApprovalRequest["status"] } = {}): ContentApprovalRequest[] {
    const rows = filters.status
      ? this.sqlite.prepare("SELECT * FROM approvals WHERE status = ? ORDER BY requested_at DESC").all(filters.status)
      : this.sqlite.prepare("SELECT * FROM approvals ORDER BY requested_at DESC").all();
    return (rows as ApprovalRow[]).map(serializeApproval);
  }

  findLatestApprovalForVariant(variantId: string): ContentApprovalRequest | null {
    const row = this.sqlite.prepare("SELECT * FROM approvals WHERE variant_id = ? ORDER BY requested_at DESC LIMIT 1").get(variantId) as ApprovalRow | undefined;
    return row ? serializeApproval(row) : null;
  }

  createApproval(input: {
    entryId: string;
    variantId: string;
    destinationId: string;
    requestedBy?: string | null;
    comment?: string | null;
  }): ContentApprovalRequest {
    const row: ApprovalRow = {
      id: uuid(),
      entry_id: input.entryId,
      variant_id: input.variantId,
      destination_id: input.destinationId,
      status: "pending",
      requested_by: input.requestedBy ?? null,
      reviewed_by: null,
      requested_at: nowIso(),
      reviewed_at: null,
      comment: input.comment ?? null,
    };
    this.sqlite.prepare(`
      INSERT INTO approvals (id, entry_id, variant_id, destination_id, status, requested_by, reviewed_by, requested_at, reviewed_at, comment)
      VALUES (@id, @entry_id, @variant_id, @destination_id, @status, @requested_by, @reviewed_by, @requested_at, @reviewed_at, @comment)
    `).run(row);
    return serializeApproval(row);
  }

  reviewApproval(id: string, input: {
    status: "approved" | "rejected" | "cancelled";
    reviewedBy?: string | null;
    comment?: string | null;
  }): ContentApprovalRequest {
    const row = this.sqlite.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as ApprovalRow | undefined;
    if (!row) throw new ContentError("Approval not found.", 404, "approval_not_found");
    const updated: ApprovalRow = {
      ...row,
      status: input.status,
      reviewed_by: input.reviewedBy ?? null,
      reviewed_at: nowIso(),
      comment: input.comment ?? row.comment,
    };
    this.sqlite.prepare(`
      UPDATE approvals
      SET status=@status, reviewed_by=@reviewed_by, reviewed_at=@reviewed_at, comment=@comment
      WHERE id=@id
    `).run(updated);
    return serializeApproval(updated);
  }

  listPlans(filters: { status?: ContentPlanStatus } = {}): ContentPublishPlan[] {
    const rows = filters.status
      ? this.sqlite.prepare("SELECT * FROM plans WHERE status = ? ORDER BY created_at DESC").all(filters.status)
      : this.sqlite.prepare("SELECT * FROM plans ORDER BY created_at DESC").all();
    return (rows as PlanRow[]).map(serializePlan);
  }

  getPlan(id: string): ContentPublishPlan | null {
    const row = this.sqlite.prepare("SELECT * FROM plans WHERE id = ?").get(id) as PlanRow | undefined;
    return row ? serializePlan(row) : null;
  }

  createPlan(input: {
    entryId: string;
    variantId: string;
    destinationId: string;
    status: ContentPlanStatus;
    scheduledAt?: string | null;
    temporalItemId?: string | null;
    destinationSnapshot: Record<string, unknown>;
  }): ContentPublishPlan {
    const now = nowIso();
    const row: PlanRow = {
      id: uuid(),
      entry_id: input.entryId,
      variant_id: input.variantId,
      destination_id: input.destinationId,
      status: input.status,
      scheduled_at: input.scheduledAt ?? null,
      temporal_item_id: input.temporalItemId ?? null,
      destination_snapshot_json: stringJson(input.destinationSnapshot),
      created_at: now,
      updated_at: now,
    };
    this.sqlite.prepare(`
      INSERT INTO plans (id, entry_id, variant_id, destination_id, status, scheduled_at, temporal_item_id, destination_snapshot_json, created_at, updated_at)
      VALUES (@id, @entry_id, @variant_id, @destination_id, @status, @scheduled_at, @temporal_item_id, @destination_snapshot_json, @created_at, @updated_at)
    `).run(row);
    return serializePlan(row);
  }

  updatePlan(id: string, input: Partial<{
    status: ContentPlanStatus;
    scheduledAt: string | null;
    temporalItemId: string | null;
  }>): ContentPublishPlan {
    const current = this.getPlan(id);
    if (!current) throw new ContentError("Plan not found.", 404, "plan_not_found");
    const row: PlanRow = {
      id: current.id,
      entry_id: current.entryId,
      variant_id: current.variantId,
      destination_id: current.destinationId,
      status: input.status ?? current.status,
      scheduled_at: input.scheduledAt === undefined ? current.scheduledAt : input.scheduledAt,
      temporal_item_id: input.temporalItemId === undefined ? current.temporalItemId : input.temporalItemId,
      destination_snapshot_json: stringJson(current.destinationSnapshot),
      created_at: current.createdAt,
      updated_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE plans
      SET status=@status, scheduled_at=@scheduled_at, temporal_item_id=@temporal_item_id, updated_at=@updated_at
      WHERE id=@id
    `).run(row);
    return serializePlan(row);
  }

  duePlans(reference = nowIso()): ContentPublishPlan[] {
    return (this.sqlite.prepare(`
      SELECT * FROM plans
      WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `).all(reference) as PlanRow[]).map(serializePlan);
  }

  createRun(input: {
    planId: string;
    entryId: string;
    variantId: string;
    destinationId: string;
    attemptNumber: number;
  }): ContentPublicationRun {
    const row: RunRow = {
      id: uuid(),
      plan_id: input.planId,
      entry_id: input.entryId,
      variant_id: input.variantId,
      destination_id: input.destinationId,
      status: "running",
      attempt_number: input.attemptNumber,
      external_id: null,
      provider_message: null,
      error: null,
      started_at: nowIso(),
      completed_at: null,
    };
    this.sqlite.prepare(`
      INSERT INTO publication_runs (id, plan_id, entry_id, variant_id, destination_id, status, attempt_number, external_id, provider_message, error, started_at, completed_at)
      VALUES (@id, @plan_id, @entry_id, @variant_id, @destination_id, @status, @attempt_number, @external_id, @provider_message, @error, @started_at, @completed_at)
    `).run(row);
    return serializeRun(row);
  }

  completeRun(id: string, input: {
    status: ContentPublicationRun["status"];
    externalId?: string | null;
    providerMessage?: string | null;
    error?: string | null;
  }): ContentPublicationRun {
    const current = this.getRun(id);
    if (!current) throw new ContentError("Publication run not found.", 404, "publication_run_not_found");
    const row: RunRow = {
      id: current.id,
      plan_id: current.planId,
      entry_id: current.entryId,
      variant_id: current.variantId,
      destination_id: current.destinationId,
      status: input.status,
      attempt_number: current.attemptNumber,
      external_id: input.externalId === undefined ? current.externalId : input.externalId,
      provider_message: input.providerMessage === undefined ? current.providerMessage : input.providerMessage,
      error: input.error === undefined ? current.error : input.error,
      started_at: current.startedAt,
      completed_at: nowIso(),
    };
    this.sqlite.prepare(`
      UPDATE publication_runs
      SET status=@status, external_id=@external_id, provider_message=@provider_message, error=@error, completed_at=@completed_at
      WHERE id=@id
    `).run(row);
    return serializeRun(row);
  }

  listRuns(filters: { planId?: string; status?: ContentPublicationRun["status"] } = {}): ContentPublicationRun[] {
    let sql = "SELECT * FROM publication_runs WHERE 1=1";
    const params: unknown[] = [];
    if (filters.planId) {
      sql += " AND plan_id = ?";
      params.push(filters.planId);
    }
    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    sql += " ORDER BY started_at DESC";
    return (this.sqlite.prepare(sql).all(...params) as RunRow[]).map(serializeRun);
  }

  getRun(id: string): ContentPublicationRun | null {
    const row = this.sqlite.prepare("SELECT * FROM publication_runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? serializeRun(row) : null;
  }

  latestRunForPlan(planId: string): ContentPublicationRun | null {
    const row = this.sqlite.prepare("SELECT * FROM publication_runs WHERE plan_id = ? ORDER BY attempt_number DESC LIMIT 1").get(planId) as RunRow | undefined;
    return row ? serializeRun(row) : null;
  }

  issueScopedToken(input: {
    label: string;
    operations: ContentOperation[];
  }): { token: string; record: ContentScopedTokenRecord } {
    const token = `content_${uuid().replace(/-/g, "")}`;
    const row: TokenRow = {
      id: uuid(),
      label: input.label.trim(),
      token_hash: hashSecret(token),
      operations_json: stringJson(input.operations),
      created_at: nowIso(),
      last_used_at: null,
      revoked_at: null,
    };
    this.sqlite.prepare(`
      INSERT INTO scoped_tokens (id, label, token_hash, operations_json, created_at, last_used_at, revoked_at)
      VALUES (@id, @label, @token_hash, @operations_json, @created_at, @last_used_at, @revoked_at)
    `).run(row);
    return { token, record: serializeToken(row) };
  }

  listTokens(): ContentScopedTokenRecord[] {
    return (this.sqlite.prepare("SELECT * FROM scoped_tokens ORDER BY created_at DESC").all() as TokenRow[]).map(serializeToken);
  }

  revokeToken(id: string): ContentScopedTokenRecord {
    const row = this.sqlite.prepare("SELECT * FROM scoped_tokens WHERE id = ?").get(id) as TokenRow | undefined;
    if (!row) throw new ContentError("Token not found.", 404, "token_not_found");
    const updated: TokenRow = {
      ...row,
      revoked_at: nowIso(),
    };
    this.sqlite.prepare("UPDATE scoped_tokens SET revoked_at = ? WHERE id = ?").run(updated.revoked_at, id);
    return serializeToken(updated);
  }

  authenticateScopedToken(token: string): ContentScopedTokenRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM scoped_tokens WHERE token_hash = ? AND revoked_at IS NULL").get(hashSecret(token)) as TokenRow | undefined;
    if (!row) return null;
    const now = nowIso();
    this.sqlite.prepare("UPDATE scoped_tokens SET last_used_at = ? WHERE id = ?").run(now, row.id);
    return serializeToken({ ...row, last_used_at: now });
  }
}
