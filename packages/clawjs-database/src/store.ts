import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { BUILTIN_COLLECTIONS_BY_NAME } from "@clawjs/core/catalogs";

// @clawjs-persistent-surface-ddl-source

import { generateOpaqueToken, hashSecret } from "./auth.ts";
import type {
  CollectionDefinition,
  CollectionRule,
  DatabaseOperation,
  FieldDefinition,
  FileAsset,
  IndexDefinition,
  ListRecordsOptions,
  NamespaceRecord,
  RecordEnvelope,
  ScopedTokenRecord,
} from "./types.ts";
import {
  RECORD_PAGE_FIELDS,
  SYSTEM_FIELDS,
  VALID_OPERATIONS,
  assertCollectionName,
  assertNamespaceId,
  builtInCollections,
  isPlainObject,
  mergeBuiltinFields,
  mergeBuiltinIndexes,
  normalizeIndex,
  nowIso,
  recordPageBody,
  recordPageFieldWasProvided,
  recordPageId,
  recordPageTitle,
  serializeCollection,
  serializeFile,
  serializeRecord,
  serializeToken,
  slugify,
  stringValue,
  validateFieldValue,
  validateFields,
  validateRecordRules,
  type CollectionRow,
  type FileRow,
  type RecordRow,
  type TokenRow,
} from "./store-helpers.ts";

interface RecordListQuery {
  where: string;
  orderBy: string;
  params: Record<string, unknown>;
}

interface RecordIndexSqlDefinition {
  name: string;
  sql: string;
}

const RECORD_INDEX_NAME_PREFIX = "claw_records_";

function buildRecordListQuery(collection: CollectionDefinition, options: ListRecordsOptions): RecordListQuery {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const allowedFields = recordQueryFields(collection);
  if (options.filter !== undefined) {
    if (!isPlainObject(options.filter)) {
      throw new Error("listRecords filter must be an object with simple field values.");
    }
    let index = 0;
    for (const [field, value] of Object.entries(options.filter)) {
      assertRecordQueryField(field, allowedFields, collection.name);
      if (!isSimpleRecordFilterValue(value)) {
        throw new Error(`Unsupported listRecords filter for ${field}; only string, number, boolean, or null values are supported.`);
      }
      const expression = recordFieldSqlExpression(field);
      const paramName = `filter_${index++}`;
      if (value === null) {
        where.push(`${expression} IS NULL`);
      } else {
        where.push(`${expression} = @${paramName}`);
        params[paramName] = typeof value === "boolean" ? (value ? 1 : 0) : value;
      }
    }
  }
  const sort = options.sort?.trim();
  const desc = sort?.startsWith("-") ?? false;
  const sortField = sort ? (desc ? sort.slice(1) : sort) : "createdAt";
  assertRecordQueryField(sortField, allowedFields, collection.name);
  const direction = desc || !sort ? "DESC" : "ASC";
  return {
    where: where.length ? ` AND ${where.join(" AND ")}` : "",
    orderBy: `${recordFieldSqlExpression(sortField)} ${direction}, id ASC`,
    params,
  };
}

function recordQueryFields(collection: CollectionDefinition): Set<string> {
  return new Set([
    "id",
    "createdAt",
    "updatedAt",
    ...collection.fields.map((field) => field.name),
    ...RECORD_PAGE_FIELDS,
  ]);
}

function assertRecordQueryField(field: string, allowedFields: Set<string>, collectionName: string): void {
  if (!allowedFields.has(field) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
    throw new Error(`Unsupported listRecords field ${field} for collection ${collectionName}.`);
  }
}

function recordFieldSqlExpression(field: string): string {
  if (field === "id") return "id";
  if (field === "createdAt") return "created_at";
  if (field === "updatedAt") return "updated_at";
  return `json_extract(data_json, '$.${field}')`;
}

function isSimpleRecordFilterValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validateRecordIndex(collection: CollectionDefinition, index: IndexDefinition): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(index.name)) {
    throw new Error(`Index ${index.name} must match ^[A-Za-z_][A-Za-z0-9_]*$.`);
  }
  const allowedFields = recordQueryFields(collection);
  for (const field of index.fields) {
    assertRecordQueryField(field, allowedFields, collection.name);
  }
}

function indexFieldsExist(fields: FieldDefinition[], index: IndexDefinition): boolean {
  const availableFields = new Set([
    "id",
    "createdAt",
    "updatedAt",
    ...fields.map((field) => field.name),
    ...RECORD_PAGE_FIELDS,
  ]);
  return index.fields.every((field) => availableFields.has(field));
}

function recordIndexSqlDefinition(collection: CollectionDefinition, index: IndexDefinition): RecordIndexSqlDefinition {
  validateRecordIndex(collection, index);
  const fields = index.fields.map(recordFieldSqlExpression);
  if (!index.unique && !index.fields.includes("id")) {
    fields.push("id");
  }
  const name = recordIndexSqlName(collection.namespaceId, collection.name, index.name);
  const unique = index.unique ? "UNIQUE " : "";
  return {
    name,
    sql: `CREATE ${unique}INDEX ${quoteSqlIdentifier(name)} ON records (namespace_id, collection_name, ${fields.join(", ")}) WHERE ${recordIndexPredicate(collection.namespaceId, collection.name)}`,
  };
}

function recordIndexSqlName(namespaceId: string, collectionName: string, indexName: string): string {
  const digest = createHash("sha256").update(`${namespaceId}\0${collectionName}\0${indexName}`).digest("hex").slice(0, 16);
  const stem = `${namespaceId}_${collectionName}_${indexName}`.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "").slice(0, 96) || "record";
  return `${RECORD_INDEX_NAME_PREFIX}${stem}_${digest}`;
}

function recordIndexPredicate(namespaceId: string, collectionName: string): string {
  return `namespace_id = ${sqlStringLiteral(namespaceId)} AND collection_name = ${sqlStringLiteral(collectionName)}`;
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeSqlForComparison(sql: string | null): string {
  return (sql ?? "").replace(/\s+/g, " ").trim();
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

export class DatabaseServiceStore {
  readonly sqlite: Database.Database;
  private readonly filesDir: string;

  constructor(
    dbPath: string,
    filesDir: string,
  ) {
    this.filesDir = filesDir;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(filesDir, { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
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
      CREATE TABLE IF NOT EXISTS namespaces (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collections (
        namespace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        indexes_json TEXT NOT NULL,
        builtin INTEGER NOT NULL DEFAULT 0,
        protected INTEGER NOT NULL DEFAULT 0,
        core_fields_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, name),
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS records (
        namespace_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, collection_name, id),
        FOREIGN KEY (namespace_id, collection_name) REFERENCES collections(namespace_id, name) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS records_collection_created_idx ON records(namespace_id, collection_name, created_at DESC, id ASC);
      CREATE INDEX IF NOT EXISTS records_collection_updated_idx ON records(namespace_id, collection_name, updated_at DESC, id ASC);
      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        record_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS service_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        space TEXT NOT NULL DEFAULT 'notes',
        surface TEXT NOT NULL DEFAULT 'note',
        owner_id TEXT,
        author_kind TEXT NOT NULL DEFAULT 'user',
        author_id TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        tags_json TEXT NOT NULL DEFAULT '[]',
        properties_json TEXT NOT NULL DEFAULT '{}',
        source_record_domain TEXT,
        source_record_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE INDEX IF NOT EXISTS pages_space_updated_idx ON pages(space, archived_at, updated_at DESC);
      CREATE INDEX IF NOT EXISTS pages_surface_idx ON pages(surface, updated_at DESC);
      CREATE INDEX IF NOT EXISTS pages_source_record_idx ON pages(source_record_domain, source_record_id);
      CREATE TABLE IF NOT EXISTS page_blocks (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        parent_block_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'paragraph',
        content_json TEXT NOT NULL DEFAULT '{}',
        text TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_blocks_page_order_idx ON page_blocks(page_id, sort_order, created_at);
      CREATE TABLE IF NOT EXISTS page_links (
        id TEXT PRIMARY KEY,
        source_page_id TEXT NOT NULL,
        target_page_id TEXT NOT NULL,
        relation TEXT NOT NULL DEFAULT 'related',
        created_at TEXT NOT NULL,
        UNIQUE (source_page_id, target_page_id, relation),
        FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_links_target_idx ON page_links(target_page_id);
      CREATE TABLE IF NOT EXISTS page_mentions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        block_id TEXT,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_mentions_target_idx ON page_mentions(target_kind, target_id);
      CREATE TABLE IF NOT EXISTS page_revisions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        author_kind TEXT NOT NULL DEFAULT 'system',
        author_id TEXT,
        UNIQUE (page_id, revision_number),
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS page_comments (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        block_id TEXT,
        parent_comment_id TEXT,
        body TEXT NOT NULL,
        author_kind TEXT NOT NULL DEFAULT 'user',
        author_id TEXT,
        upvotes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_comments_page_idx ON page_comments(page_id, created_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        page_id UNINDEXED,
        title,
        body,
        tags,
        tokenize='unicode61'
      );
    `);
  }

  private seed(): void {
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin-main", "admin@database.local", hashSecret("database-admin"), now);
    const existingNamespaces = this.listNamespaces();
    if (existingNamespaces.length === 0) {
      this.createNamespace({ id: "main", displayName: "Main" });
    }
    // Ensure builtin collections exist on every namespace, so newly added
    // builtins (e.g. the company app collections) are migrated into existing
    // databases without requiring a manual reset.
    for (const namespace of this.listNamespaces()) {
      this.ensureBuiltinCollections(namespace.id);
    }
    if (existingNamespaces.length > 0) {
      this.syncAllRecordIndexes();
    }
  }

  ensureBuiltinCollections(namespaceId: string): void {
    for (const builtIn of builtInCollections()) {
      const current = this.getCollection(namespaceId, builtIn.name);
      if (!current) {
        this.createCollection(namespaceId, {
          name: builtIn.name,
          displayName: builtIn.displayName,
          fields: builtIn.fields,
          indexes: builtIn.indexes,
          builtin: true,
          protected: true,
          coreFieldNames: builtIn.coreFieldNames,
        });
        continue;
      }
      this.syncBuiltinCollection(namespaceId, current, builtIn);
    }
  }

  private syncBuiltinCollection(
    namespaceId: string,
    current: CollectionDefinition,
    builtIn: {
      name: string;
      displayName: string;
      coreFieldNames: string[];
      fields: FieldDefinition[];
      indexes: IndexDefinition[];
    },
  ): CollectionDefinition {
    const mergedFields = validateFields(mergeBuiltinFields(current.fields, builtIn.fields));
    const mergedIndexes = mergeBuiltinIndexes(current.indexes, builtIn.indexes).map(normalizeIndex);
    const mergedCoreFieldNames = [...new Set([...current.coreFieldNames, ...builtIn.coreFieldNames])];

    const needsUpdate =
      current.displayName !== builtIn.displayName ||
      !current.builtin ||
      !current.protected ||
      mergedFields.length !== current.fields.length ||
      mergedIndexes.length !== current.indexes.length ||
      mergedCoreFieldNames.length !== current.coreFieldNames.length;

    if (!needsUpdate) return current;

    const now = nowIso();
    const update = this.sqlite.transaction((): CollectionDefinition => {
      this.sqlite.prepare(`
        UPDATE collections
        SET display_name = ?, fields_json = ?, indexes_json = ?, builtin = 1, protected = 1, core_fields_json = ?, updated_at = ?
        WHERE namespace_id = ? AND name = ?
      `).run(
        builtIn.displayName,
        JSON.stringify(mergedFields),
        JSON.stringify(mergedIndexes),
        JSON.stringify(mergedCoreFieldNames),
        now,
        namespaceId,
        builtIn.name,
      );
      const collection = this.getCollection(namespaceId, builtIn.name)!;
      this.syncRecordIndexes(collection);
      return collection;
    });
    return update();
  }

  private syncAllRecordIndexes(): void {
    for (const namespace of this.listNamespaces()) {
      for (const collection of this.listCollections(namespace.id)) {
        this.syncRecordIndexes(collection);
      }
    }
  }

  private syncRecordIndexes(collection: CollectionDefinition): void {
    const definitions = collection.indexes.map((index) => recordIndexSqlDefinition(collection, index));
    const expectedNames = new Set(definitions.map((definition) => definition.name));
    const existingRows = this.recordIndexRowsForCollection(collection.namespaceId, collection.name);
    const existingByName = new Map(existingRows.map((row) => [row.name, row]));

    for (const row of existingRows) {
      if (!expectedNames.has(row.name)) {
        this.sqlite.exec(`DROP INDEX IF EXISTS ${quoteSqlIdentifier(row.name)}`);
      }
    }
    for (const definition of definitions) {
      const existing = existingByName.get(definition.name);
      if (existing && normalizeSqlForComparison(existing.sql) === normalizeSqlForComparison(definition.sql)) {
        continue;
      }
      if (existing) {
        this.sqlite.exec(`DROP INDEX IF EXISTS ${quoteSqlIdentifier(existing.name)}`);
      }
      this.sqlite.exec(definition.sql);
    }
  }

  private dropRecordIndexes(namespaceId: string, collectionName: string): void {
    for (const row of this.recordIndexRowsForCollection(namespaceId, collectionName)) {
      this.sqlite.exec(`DROP INDEX IF EXISTS ${quoteSqlIdentifier(row.name)}`);
    }
  }

  private recordIndexRowsForCollection(namespaceId: string, collectionName: string): Array<{ name: string; sql: string | null }> {
    const predicate = `WHERE ${recordIndexPredicate(namespaceId, collectionName)}`;
    return (this.sqlite.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'records' AND name LIKE ?
    `).all(`${RECORD_INDEX_NAME_PREFIX}%`) as Array<{ name: string; sql: string | null }>)
      .filter((row) => row.sql?.includes(predicate));
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email, password_hash
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string; password_hash: string } | undefined;
    if (!row) return null;
    return row.password_hash === hashSecret(password) ? { id: row.id, email: row.email } : null;
  }

  findAdminByEmail(email: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string } | undefined;
    return row ? { id: row.id, email: row.email } : null;
  }

  createAdmin(input: { email: string; password: string }): { id: string; email: string } {
    const id = `admin-${randomUUID().slice(0, 8)}`;
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, input.email, hashSecret(input.password), now);
    return { id, email: input.email };
  }

  listNamespaces(): NamespaceRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      ORDER BY id ASC
    `).all() as Array<{ id: string; display_name: string; created_at: string; updated_at: string }>).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getNamespace(namespaceId: string): NamespaceRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      WHERE id = ?
    `).get(namespaceId) as { id: string; display_name: string; created_at: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  ensureNamespace(input: { id: string; displayName?: string }): NamespaceRecord {
    return this.getNamespace(input.id) ?? this.createNamespace({
      id: input.id,
      displayName: input.displayName ?? input.id,
    });
  }

  createNamespace(input: { id?: string; displayName: string }): NamespaceRecord {
    const id = input.id ? slugify(input.id) : slugify(input.displayName);
    assertNamespaceId(id);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO namespaces (id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, input.displayName.trim() || id, now, now);
    for (const builtIn of builtInCollections()) {
      this.createCollection(id, {
        name: builtIn.name,
        displayName: builtIn.displayName,
        fields: builtIn.fields,
        indexes: builtIn.indexes,
        builtin: true,
        protected: true,
        coreFieldNames: builtIn.coreFieldNames,
      });
    }
    return this.getNamespace(id)!;
  }

  private readCollectionRow(namespaceId: string, name: string): CollectionRow | undefined {
    return this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ? AND name = ?
    `).get(namespaceId, name) as CollectionRow | undefined;
  }

  getCollection(namespaceId: string, name: string): CollectionDefinition | null {
    const row = this.readCollectionRow(namespaceId, name);
    return row ? serializeCollection(row) : null;
  }

  ensureCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): CollectionDefinition {
    return this.getCollection(namespaceId, input.name) ?? this.createCollection(namespaceId, input);
  }

  listCollections(namespaceId: string): CollectionDefinition[] {
    return (this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ?
      ORDER BY builtin DESC, name ASC
    `).all(namespaceId) as CollectionRow[]).map(serializeCollection);
  }

  createCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): CollectionDefinition {
    if (!this.getNamespace(namespaceId)) {
      throw new Error(`Namespace ${namespaceId} does not exist.`);
    }
    assertCollectionName(input.name);
    const fields = validateFields(input.fields);
    const indexes = (input.indexes ?? []).map(normalizeIndex);
    const coreFieldNames = [...new Set((input.coreFieldNames ?? []).map((entry) => entry.trim()).filter(Boolean))];
    for (const fieldName of coreFieldNames) {
      if (!SYSTEM_FIELDS.includes(fieldName as typeof SYSTEM_FIELDS[number]) && !fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected core field ${fieldName} is missing from collection ${input.name}.`);
      }
    }
    const now = nowIso();
    const create = this.sqlite.transaction((): CollectionDefinition => {
      this.sqlite.prepare(`
        INSERT INTO collections (
          namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        namespaceId,
        input.name,
        input.displayName?.trim() || input.name,
        JSON.stringify(fields),
        JSON.stringify(indexes),
        input.builtin ? 1 : 0,
        input.protected ? 1 : 0,
        JSON.stringify(coreFieldNames),
        now,
        now,
      );
      const collection = this.getCollection(namespaceId, input.name)!;
      this.syncRecordIndexes(collection);
      return collection;
    });
    return create();
  }

  updateCollection(namespaceId: string, name: string, input: {
    displayName?: string;
    fields?: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): CollectionDefinition {
    const current = this.getCollection(namespaceId, name);
    if (!current) throw new Error(`Collection ${name} does not exist.`);
    const fields = input.fields ? validateFields(input.fields) : current.fields;
    for (const fieldName of current.coreFieldNames) {
      if (!SYSTEM_FIELDS.includes(fieldName as typeof SYSTEM_FIELDS[number]) && !fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected collection ${name} cannot remove core field ${fieldName}.`);
      }
    }
    const indexes = input.indexes
      ? input.indexes.map(normalizeIndex)
      : input.fields
        ? current.indexes.filter((index) => indexFieldsExist(fields, index))
        : current.indexes;
    const now = nowIso();
    const update = this.sqlite.transaction((): CollectionDefinition => {
      this.sqlite.prepare(`
        UPDATE collections
        SET display_name = ?, fields_json = ?, indexes_json = ?, updated_at = ?
        WHERE namespace_id = ? AND name = ?
      `).run(
        input.displayName?.trim() || current.displayName,
        JSON.stringify(fields),
        JSON.stringify(indexes),
        now,
        namespaceId,
        name,
      );
      const collection = this.getCollection(namespaceId, name)!;
      this.syncRecordIndexes(collection);
      return collection;
    });
    return update();
  }

  deleteCollection(namespaceId: string, name: string): boolean {
    const current = this.getCollection(namespaceId, name);
    if (!current) return false;
    if (current.protected) {
      throw new Error(`Collection ${name} is protected and cannot be deleted.`);
    }
    const remove = this.sqlite.transaction((): boolean => {
      const removed = this.sqlite.prepare(`
        DELETE FROM collections
        WHERE namespace_id = ? AND name = ?
      `).run(namespaceId, name).changes > 0;
      if (removed) {
        this.dropRecordIndexes(namespaceId, name);
      }
      return removed;
    });
    return remove();
  }

  private validateRecordPayload(collection: CollectionDefinition, payload: Record<string, unknown>, mode: "create" | "update"): Record<string, unknown> {
    const allowed = new Set(collection.fields.map((field) => field.name));
    for (const key of Object.keys(payload)) {
      if (SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number])) {
        throw new Error(`System field ${key} cannot be mutated.`);
      }
      if (!allowed.has(key) && !RECORD_PAGE_FIELDS.has(key)) {
        throw new Error(`Unknown field ${key} for collection ${collection.name}.`);
      }
      if (key === "pageId" && payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== "string") {
        throw new Error("Record pageId must be text.");
      }
      if ((key === "notes" || key === "notesBody") && !allowed.has(key)) {
        const value = payload[key];
        if (value !== undefined && value !== null && typeof value !== "string") {
          throw new Error(`Record ${key} must be text.`);
        }
      }
    }
    for (const field of collection.fields) {
      const value = payload[field.name];
      if (mode === "create" || value !== undefined) {
        validateFieldValue(field, value);
      }
    }
    const builtinDef = BUILTIN_COLLECTIONS_BY_NAME.get(collection.name);
    const effectiveCollection: CollectionDefinition = builtinDef?.rules
      ? { ...collection, rules: builtinDef.rules as CollectionRule[] }
      : collection;
    validateRecordRules(effectiveCollection, payload);
    return payload;
  }

  private normalizeRecordForStorage(input: {
    namespaceId: string;
    collectionName: string;
    recordId: string;
    collection: CollectionDefinition;
    payload: Record<string, unknown>;
    timestamp: string;
  }): Record<string, unknown> {
    const normalized = { ...input.payload };
    const hasPageBody = recordPageFieldWasProvided(normalized);
    const pageBody = hasPageBody ? recordPageBody(normalized) : null;
    delete normalized.notes;
    delete normalized.notesBody;

    if (!hasPageBody) {
      return normalized;
    }

    const pageId = stringValue(normalized.pageId) ?? recordPageId(input.namespaceId, input.collectionName, input.recordId);
    this.upsertRecordPage({
      pageId,
      collection: input.collection,
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId: input.recordId,
      payload: normalized,
      body: pageBody ?? "",
      timestamp: input.timestamp,
    });
    normalized.pageId = pageId;
    return normalized;
  }

  private upsertRecordPage(input: {
    pageId: string;
    collection: CollectionDefinition;
    namespaceId: string;
    collectionName: string;
    recordId: string;
    payload: Record<string, unknown>;
    body: string;
    timestamp: string;
  }): void {
    const title = recordPageTitle(input.collection, input.payload);
    const sourceRecordDomain = `${input.namespaceId}.${input.collectionName}`;
    const properties = JSON.stringify({
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId: input.recordId,
    });
    this.sqlite.prepare(`
      INSERT INTO pages (
        id, title, space, surface, author_kind, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id,
        created_at, updated_at
      )
      VALUES (?, ?, 'records', 'record_note', 'system', 'private', 'normal', '[]', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        properties_json = excluded.properties_json,
        source_record_domain = excluded.source_record_domain,
        source_record_id = excluded.source_record_id,
        updated_at = excluded.updated_at,
        archived_at = NULL
    `).run(
      input.pageId,
      title,
      properties,
      sourceRecordDomain,
      input.recordId,
      input.timestamp,
      input.timestamp,
    );

    this.sqlite.prepare("DELETE FROM page_blocks WHERE page_id = ?").run(input.pageId);
    this.sqlite.prepare(`
      INSERT INTO page_blocks (id, page_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at)
      VALUES (?, ?, 0, 'paragraph', ?, ?, '{}', ?, ?)
    `).run(
      `${input.pageId}:block:0`,
      input.pageId,
      JSON.stringify({ text: input.body }),
      input.body,
      input.timestamp,
      input.timestamp,
    );

    const revisionNumber = ((this.sqlite.prepare(`
      SELECT MAX(revision_number) AS revision_number
      FROM page_revisions
      WHERE page_id = ?
    `).get(input.pageId) as { revision_number: number | null } | undefined)?.revision_number ?? 0) + 1;
    this.sqlite.prepare(`
      INSERT INTO page_revisions (id, page_id, revision_number, snapshot_json, created_at, author_kind)
      VALUES (?, ?, ?, ?, ?, 'system')
    `).run(
      `rev-${randomUUID()}`,
      input.pageId,
      revisionNumber,
      JSON.stringify({ title, blocks: [{ kind: "paragraph", text: input.body }] }),
      input.timestamp,
    );

    this.sqlite.prepare("DELETE FROM notes_fts WHERE page_id = ?").run(input.pageId);
    this.sqlite.prepare(`
      INSERT INTO notes_fts (page_id, title, body, tags)
      VALUES (?, ?, ?, '')
    `).run(input.pageId, title, input.body);
  }

  listRecords(namespaceId: string, collectionName: string, options: ListRecordsOptions = {}): { total: number; items: RecordEnvelope[] } {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const query = buildRecordListQuery(collection, options);
    const params = {
      namespaceId,
      collectionName,
      ...query.params,
      limit: clampInt(options.limit, 1, options.maxLimit ?? 10_000, 50),
      offset: clampInt(options.offset, 0, Number.MAX_SAFE_INTEGER, 0),
    };
    const total = (this.sqlite.prepare(`
      SELECT COUNT(*) AS n
      FROM records
      WHERE namespace_id = @namespaceId AND collection_name = @collectionName${query.where}
    `).get(params) as { n: number }).n;
    const rows = this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = @namespaceId AND collection_name = @collectionName${query.where}
      ORDER BY ${query.orderBy}
      LIMIT @limit OFFSET @offset
    `).all(params) as RecordRow[];
    return { total, items: rows.map(serializeRecord) };
  }

  getRecord(namespaceId: string, collectionName: string, id: string): RecordEnvelope | null {
    const row = this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).get(namespaceId, collectionName, id) as RecordRow | undefined;
    return row ? serializeRecord(row) : null;
  }

  createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): RecordEnvelope {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const validated = this.validateRecordPayload(collection, payload, "create");
    const id = randomUUID();
    const now = nowIso();
    const normalized = this.normalizeRecordForStorage({
      namespaceId,
      collectionName,
      recordId: id,
      collection,
      payload: validated,
      timestamp: now,
    });
    this.sqlite.prepare(`
      INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(namespaceId, collectionName, id, JSON.stringify(normalized), now, now);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  putRecord(input: {
    namespaceId: string;
    collectionName: string;
    recordId: string;
    payload: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }): RecordEnvelope {
    const collection = this.getCollection(input.namespaceId, input.collectionName);
    if (!collection) throw new Error(`Collection ${input.collectionName} does not exist.`);
    const validated = this.validateRecordPayload(collection, input.payload, "update");
    const createdAt = input.createdAt ?? nowIso();
    const updatedAt = input.updatedAt ?? createdAt;
    const normalized = this.normalizeRecordForStorage({
      namespaceId: input.namespaceId,
      collectionName: input.collectionName,
      recordId: input.recordId,
      collection,
      payload: validated,
      timestamp: updatedAt,
    });
    this.sqlite.prepare(`
      INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(namespace_id, collection_name, id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      input.namespaceId,
      input.collectionName,
      input.recordId,
      JSON.stringify(normalized),
      createdAt,
      updatedAt,
    );
    return this.getRecord(input.namespaceId, input.collectionName, input.recordId)!;
  }

  updateRecord(namespaceId: string, collectionName: string, id: string, payload: Record<string, unknown>): RecordEnvelope {
    const current = this.getRecord(namespaceId, collectionName, id);
    if (!current) throw new Error(`Record ${id} does not exist.`);
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const merged = {
      ...Object.fromEntries(Object.entries(current).filter(([key]) => !SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number]))),
      ...payload,
    };
    const validated = this.validateRecordPayload(collection, merged, "update");
    const now = nowIso();
    const normalized = this.normalizeRecordForStorage({
      namespaceId,
      collectionName,
      recordId: id,
      collection,
      payload: validated,
      timestamp: now,
    });
    this.sqlite.prepare(`
      UPDATE records
      SET data_json = ?, updated_at = ?
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(JSON.stringify(normalized), now, namespaceId, collectionName, id);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  deleteRecord(namespaceId: string, collectionName: string, id: string): boolean {
    this.sqlite.prepare(`
      DELETE FROM pages
      WHERE source_record_domain = ? AND source_record_id = ?
    `).run(`${namespaceId}.${collectionName}`, id);
    return this.sqlite.prepare(`
      DELETE FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(namespaceId, collectionName, id).changes > 0;
  }

  getMeta(key: string): string | null {
    const row = this.sqlite.prepare(`
      SELECT meta_value
      FROM service_meta
      WHERE meta_key = ?
    `).get(key) as { meta_value: string } | undefined;
    return row?.meta_value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.sqlite.prepare(`
      INSERT INTO service_meta (meta_key, meta_value)
      VALUES (?, ?)
      ON CONFLICT(meta_key) DO UPDATE SET meta_value = excluded.meta_value
    `).run(key, value);
  }

  createScopedToken(input: {
    label: string;
    namespaceId: string;
    collectionName?: string | null;
    operations: DatabaseOperation[];
  }): { record: ScopedTokenRecord; token: string } {
    if (!this.getNamespace(input.namespaceId)) {
      throw new Error(`Namespace ${input.namespaceId} does not exist.`);
    }
    if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
      throw new Error(`Collection ${input.collectionName} does not exist.`);
    }
    const operations = [...new Set(input.operations)];
    if (operations.length === 0) {
      throw new Error("Scoped tokens require at least one operation.");
    }
    for (const operation of operations) {
      if (!VALID_OPERATIONS.has(operation)) {
        throw new Error(`Unknown operation ${operation}.`);
      }
    }
    const id = randomUUID();
    const token = generateOpaqueToken("dbtk");
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO scoped_tokens (
        id, label, token_hash, namespace_id, collection_name, operations_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.label.trim() || "token",
      hashSecret(token),
      input.namespaceId,
      input.collectionName ?? null,
      JSON.stringify(operations),
      now,
    );
    return {
      record: this.getScopedToken(id)!,
      token,
    };
  }

  listScopedTokens(namespaceId: string): ScopedTokenRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as TokenRow[]).map(serializeToken);
  }

  getScopedToken(id: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE id = ?
    `).get(id) as TokenRow | undefined;
    return row ? serializeToken(row) : null;
  }

  revokeScopedToken(namespaceId: string, tokenId: string): boolean {
    return this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET revoked_at = ?
      WHERE namespace_id = ? AND id = ? AND revoked_at IS NULL
    `).run(nowIso(), namespaceId, tokenId).changes > 0;
  }

  authenticateScopedToken(rawToken: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE token_hash = ?
    `).get(hashSecret(rawToken)) as TokenRow | undefined;
    if (!row || row.revoked_at) return null;
    this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET last_used_at = ?
      WHERE id = ?
    `).run(nowIso(), row.id);
    return serializeToken({
      ...row,
      last_used_at: nowIso(),
    });
  }

  saveFile(input: {
    namespaceId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
    collectionName?: string | null;
    recordId?: string | null;
  }): FileAsset {
    const tempPath = this.writeLegacyFileBytesToTemp(input.bytes);
    return this.saveFileFromPath({
      namespaceId: input.namespaceId,
      filename: input.filename,
      contentType: input.contentType,
      tempPath,
      sizeBytes: input.bytes.byteLength,
      collectionName: input.collectionName,
      recordId: input.recordId,
    });
  }

  saveFileFromPath(input: {
    namespaceId: string;
    filename: string;
    contentType: string;
    tempPath: string;
    sizeBytes: number;
    collectionName?: string | null;
    recordId?: string | null;
  }): FileAsset {
    let absolutePath: string | null = null;
    try {
      if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
        throw new Error("File size is invalid.");
      }
      this.assertManagedTempFile(input.tempPath);
      if (!fs.existsSync(input.tempPath)) {
        throw new Error("Uploaded temp file is missing.");
      }
      if (!this.getNamespace(input.namespaceId)) {
        throw new Error(`Namespace ${input.namespaceId} does not exist.`);
      }
      if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
        throw new Error(`Collection ${input.collectionName} does not exist.`);
      }
      if (input.collectionName && input.recordId && !this.getRecord(input.namespaceId, input.collectionName, input.recordId)) {
        throw new Error(`Record ${input.recordId} does not exist.`);
      }
      const id = randomUUID();
      const storedFileName = `${id}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const relativePath = path.join(input.namespaceId, storedFileName);
      absolutePath = path.join(this.filesDir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.renameSync(input.tempPath, absolutePath);
      const now = nowIso();
      this.sqlite.prepare(`
        INSERT INTO files (
          id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.namespaceId,
        input.collectionName ?? null,
        input.recordId ?? null,
        input.filename,
        input.contentType || "application/octet-stream",
        input.sizeBytes,
        relativePath,
        now,
      );
      return this.getFile(id)!;
    } catch (error) {
      safeUnlink(input.tempPath);
      if (absolutePath) safeUnlink(absolutePath);
      throw error;
    }
  }

  private writeLegacyFileBytesToTemp(bytes: Buffer): string {
    const tempDir = path.join(this.filesDir, ".tmp", "uploads");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${randomUUID()}.upload`);
    fs.writeFileSync(tempPath, bytes);
    return tempPath;
  }

  private assertManagedTempFile(tempPath: string): void {
    const resolvedTempPath = path.resolve(tempPath);
    const tempRoot = path.resolve(this.filesDir, ".tmp", "uploads");
    if (resolvedTempPath !== tempRoot && !resolvedTempPath.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error("Uploaded temp file is outside the managed upload directory.");
    }
  }

  listFiles(namespaceId: string): FileAsset[] {
    return (this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as FileRow[]).map(serializeFile);
  }

  getFile(id: string): (FileAsset & { storagePath: string }) | null {
    const row = this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE id = ?
    `).get(id) as FileRow | undefined;
    if (!row) return null;
    return {
      ...serializeFile(row),
      storagePath: path.join(this.filesDir, row.storage_path),
    };
  }

  deleteFile(id: string): boolean {
    const file = this.getFile(id);
    if (!file) return false;
    if (fs.existsSync(file.storagePath)) {
      fs.unlinkSync(file.storagePath);
    }
    return this.sqlite.prepare(`
      DELETE FROM files
      WHERE id = ?
    `).run(id).changes > 0;
  }
}
