import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CORE_SCHEMA } from "./core-ontology";
import { MemoryError } from "./errors";
import {
  AppConfig,
  AttributeDefinition,
  EntityTypeDefinition,
  FrontmatterMap,
  FrontmatterValue,
  LoadedSchema,
  MemoryClass,
  MemoryTypeDefinition,
  NoteKind,
  ParsedNote,
  RelationCardinality,
  RelationDefinition,
  SchemaDocument,
  ValidationResult,
  WorkspacePaths
} from "./types";
import {
  hashString,
  listMarkdownFiles,
  normalizeIdentity,
  normalizeReference,
  parseFrontmatterDocument,
  parseKeyValueFilters,
  readJsonFile,
  serializeFrontmatterDocument,
  sortFrontmatterMap,
  sortScalarArray
} from "./utils";
import { loadWorkspace, loadWorkspaceConfig } from "./workspace";

type QueryFilters = {
  mode?: "find" | "search" | "neighbors";
  noteKind?: NoteKind;
  type?: string;
  kind?: string;
  where?: Record<string, string>;
  has?: Record<string, string>;
  linkedTo?: string;
  pathDepth?: number;
  text?: string;
  exact?: boolean;
};

type ActiveSearchOptions = {
  text: string;
  limit?: number;
  minScore?: number;
  includeHistory?: boolean;
  semantic?: boolean;
  memoryClass?: MemoryClass;
  scopeUser?: string;
  scopeAgent?: string;
  scopeProject?: string;
};

type SaveMemoryInput = {
  title?: string;
  content: string;
  memoryClass?: MemoryClass;
  confidence?: number;
  trustScore?: number;
  scopeUser?: string;
  scopeAgent?: string;
  scopeProject?: string;
  provenance?: string;
  validFrom?: string;
  validTo?: string;
  supersedes?: string[];
  quarantined?: boolean;
};

type CaptureTurnInput = {
  sessionId?: string;
  user?: string;
  assistant?: string;
  source?: string;
  scopeUser?: string;
  scopeAgent?: string;
  scopeProject?: string;
};

type LookupFilters = {
  noteKind?: NoteKind;
  type?: string;
  kind?: string;
  allowLoose?: boolean;
};

type IdentityIndex = {
  byId: Map<string, ParsedNote[]>;
  bySlug: Map<string, ParsedNote[]>;
  byAlias: Map<string, ParsedNote[]>;
  byTitle: Map<string, ParsedNote[]>;
};

type RelationEntry = {
  targetRef: string;
  metadata: Record<string, FrontmatterValue>;
};

type ResolvedRelation = {
  originId: string;
  sourceId: string;
  targetId: string;
  relationName: string;
  inverseName: string | null;
  metadata: Record<string, FrontmatterValue>;
};

type IndexStatus = {
  present: boolean;
  stale: boolean;
  schemaChanged: boolean;
  noteChanges: number;
  indexedAt: string | null;
};

type IndexedNote = {
  id: string;
  path: string;
  fingerprint: string;
  note_kind: string;
  semantic_kind: string;
  type: string;
  title: string;
  slug: string | null;
  aliases_json: string;
  frontmatter_json: string;
  body: string;
  memory_class?: string;
  valid_from?: string | null;
  valid_to?: string | null;
  confidence?: number | null;
  trust_score?: number | null;
  quarantined?: number | null;
  scope_user?: string | null;
  scope_agent?: string | null;
  scope_project?: string | null;
  last_seen?: string | null;
  provenance?: string | null;
  embedding_json?: string | null;
  archived?: number | null;
};

export class MemoryService {
  constructor(readonly workspace: WorkspacePaths) {}

  static fromCwd(cwd: string): MemoryService {
    return new MemoryService(loadWorkspace(cwd));
  }

  getConfig(): AppConfig {
    return loadWorkspaceConfig(this.workspace);
  }

  loadSchema(): LoadedSchema {
    const files = fs
      .readdirSync(this.workspace.schemaDir)
      .filter((entry) => entry.endsWith(".json"))
      .sort();

    if (files.length === 0) {
      throw new MemoryError("No schema files found in .memory/schema");
    }

    const entityKinds = new Map<string, { id: string; description?: string }>();
    const memoryKinds = new Map<string, { id: string; description?: string }>();
    const entityTypes = new Map<string, EntityTypeDefinition>();
    const memoryTypes = new Map<string, MemoryTypeDefinition>();
    let version = CORE_SCHEMA.version;
    const schemaHashSource: string[] = [`builtin-core:${JSON.stringify(CORE_SCHEMA)}`];

    for (const fileName of files) {
      const filePath = path.join(this.workspace.schemaDir, fileName);
      const rawContent = fs.readFileSync(filePath, "utf8");
      schemaHashSource.push(`${fileName}:${rawContent}`);
      const document = readJsonFile<SchemaDocument>(filePath);
      version = Math.max(version, document.version);

      for (const entityKind of document.entityKinds) {
        if (entityKinds.has(entityKind.id)) {
          throw new MemoryError(`Duplicate entity kind "${entityKind.id}" in schema`);
        }
        entityKinds.set(entityKind.id, entityKind);
      }

      for (const memoryKind of document.memoryKinds) {
        if (memoryKinds.has(memoryKind.id)) {
          throw new MemoryError(`Duplicate memory kind "${memoryKind.id}" in schema`);
        }
        memoryKinds.set(memoryKind.id, memoryKind);
      }

      for (const entityType of document.entityTypes) {
        if (entityTypes.has(entityType.id)) {
          throw new MemoryError(`Duplicate entity type "${entityType.id}" in schema`);
        }
        entityTypes.set(entityType.id, entityType);
      }

      for (const memoryType of document.memoryTypes) {
        if (memoryTypes.has(memoryType.id)) {
          throw new MemoryError(`Duplicate memory type "${memoryType.id}" in schema`);
        }
        memoryTypes.set(memoryType.id, memoryType);
      }
    }

    addMissingCoreDefinitions(entityKinds, memoryKinds, entityTypes, memoryTypes);

    for (const entityType of entityTypes.values()) {
      if (!entityKinds.has(entityType.kindId)) {
        throw new MemoryError(`Entity type "${entityType.id}" references unknown entity kind "${entityType.kindId}"`);
      }
      validateRelationTargets(entityType.relations ?? {}, entityTypes, memoryTypes, entityType.id);
    }

    for (const memoryType of memoryTypes.values()) {
      if (!memoryKinds.has(memoryType.kindId)) {
        throw new MemoryError(`Memory type "${memoryType.id}" references unknown memory kind "${memoryType.kindId}"`);
      }
      validateRelationTargets(memoryType.relations ?? {}, entityTypes, memoryTypes, memoryType.id);
    }

    return {
      version,
      hash: hashString(schemaHashSource.join("\n")),
      entityKinds,
      memoryKinds,
      entityTypes,
      memoryTypes
    };
  }

  validate(): ValidationResult {
    const schema = this.loadSchema();
    const noteFiles = listMarkdownFiles(this.workspace.notesDir);
    const notes: ParsedNote[] = [];
    const issues: string[] = [];
    const warnings: string[] = [];

    for (const filePath of noteFiles) {
      try {
        notes.push(parseNoteFile(filePath));
      } catch (error) {
        issues.push(`${path.relative(this.workspace.root, filePath)}: ${toMessage(error)}`);
      }
    }

    const identityIndex = buildIdentityIndex(notes);
    issues.push(...collectIdentityIssues(identityIndex, schema));

    for (const note of notes) {
      try {
        validateNoteShape(note, schema, identityIndex, warnings);
      } catch (error) {
        issues.push(`${note.id}: ${toMessage(error)}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      requiresMigration: warnings.some((warning) => warning.includes("requires schema migration")),
      notes,
      schema
    };
  }

  index() {
    const validation = this.validate();
    if (!validation.valid) {
      throw new MemoryError(validation.issues.join("\n"));
    }

    const notesByPath = new Map(validation.notes.map((note) => [note.path, note]));
    const relations = collectResolvedRelations(validation.notes, validation.schema);
    const sqlite = new Database(this.workspace.indexDbPath);

    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS files (
          path TEXT PRIMARY KEY,
          note_id TEXT NOT NULL,
          fingerprint TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          note_kind TEXT NOT NULL,
          semantic_kind TEXT NOT NULL,
          memory_class TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          slug TEXT,
          aliases_json TEXT NOT NULL,
          frontmatter_json TEXT NOT NULL,
          body TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0,
          valid_from TEXT,
          valid_to TEXT,
          confidence REAL,
          trust_score REAL,
          quarantined INTEGER NOT NULL DEFAULT 0,
          scope_user TEXT,
          scope_agent TEXT,
          scope_project TEXT,
          last_seen TEXT,
          provenance TEXT,
          embedding_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS note_relations (
          origin_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          relation_name TEXT NOT NULL,
          target_id TEXT NOT NULL,
          direction TEXT NOT NULL,
          derived INTEGER NOT NULL,
          metadata_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
        CREATE INDEX IF NOT EXISTS idx_notes_kind ON notes(semantic_kind);
        CREATE INDEX IF NOT EXISTS idx_relations_source ON note_relations(source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON note_relations(target_id);
        CREATE INDEX IF NOT EXISTS idx_relations_origin ON note_relations(origin_id);
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          id UNINDEXED,
          title,
          aliases,
          body,
          tokenize = 'unicode61'
        );
      `);
      ensureIndexStorage(sqlite);
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_class ON notes(memory_class);
        CREATE INDEX IF NOT EXISTS idx_notes_scope ON notes(scope_user, scope_agent, scope_project);
      `);

      const existingSchemaHash = readMeta(sqlite, "schema_hash");
      const existingFiles = readIndexedFiles(sqlite);
      const fullRebuild = existingSchemaHash !== validation.schema.hash;

      if (fullRebuild) {
        sqlite.exec(`
          DELETE FROM files;
          DELETE FROM notes;
          DELETE FROM note_relations;
          DELETE FROM notes_fts;
        `);
      }

      const currentPaths = new Set(validation.notes.map((note) => note.path));
      const removedPaths = fullRebuild
        ? []
        : [...existingFiles.keys()].filter((filePath) => !currentPaths.has(filePath));
      const changedPaths = fullRebuild
        ? [...currentPaths]
        : validation.notes
            .filter((note) => existingFiles.get(note.path)?.fingerprint !== note.fingerprint)
            .map((note) => note.path);

      if (!fullRebuild) {
        const changedNoteIds = new Set(
          changedPaths.map((p) => notesByPath.get(p)?.id).filter((id): id is string => id !== undefined)
        );
        if (changedNoteIds.size > 0) {
          const placeholders = [...changedNoteIds].map(() => "?").join(",");
          const ids = [...changedNoteIds];
          const affected = sqlite
            .prepare(
              `SELECT DISTINCT origin_id FROM note_relations WHERE target_id IN (${placeholders}) OR source_id IN (${placeholders})`
            )
            .all(...ids, ...ids) as Array<{ origin_id: string }>;
          for (const row of affected) {
            const originNote = validation.notes.find((n) => n.id === row.origin_id);
            if (originNote && !changedPaths.includes(originNote.path)) {
              changedPaths.push(originNote.path);
            }
          }
        }
      }

      const deleteFile = sqlite.prepare(`DELETE FROM files WHERE path = ?`);
      const deleteNote = sqlite.prepare(`DELETE FROM notes WHERE id = ?`);
      const deleteFts = sqlite.prepare(`DELETE FROM notes_fts WHERE id = ?`);
      const deleteRelationsByOrigin = sqlite.prepare(`DELETE FROM note_relations WHERE origin_id = ?`);
      const deleteRelationsByNode = sqlite.prepare(
        `DELETE FROM note_relations WHERE source_id = ? OR target_id = ?`
      );
      const upsertFile = sqlite.prepare(`
        INSERT INTO files (path, note_id, fingerprint)
        VALUES (@path, @note_id, @fingerprint)
        ON CONFLICT(path) DO UPDATE SET note_id = excluded.note_id, fingerprint = excluded.fingerprint
      `);
      const upsertNote = sqlite.prepare(`
        INSERT INTO notes (
          id, path, fingerprint, note_kind, semantic_kind, memory_class, type, title, slug,
          aliases_json, frontmatter_json, body, archived, valid_from, valid_to, confidence, trust_score,
          quarantined, scope_user, scope_agent, scope_project, last_seen, provenance, embedding_json
        )
        VALUES (
          @id, @path, @fingerprint, @note_kind, @semantic_kind, @memory_class, @type, @title, @slug,
          @aliases_json, @frontmatter_json, @body, @archived, @valid_from, @valid_to, @confidence, @trust_score,
          @quarantined, @scope_user, @scope_agent, @scope_project, @last_seen, @provenance, @embedding_json
        )
        ON CONFLICT(id) DO UPDATE SET
          path = excluded.path,
          fingerprint = excluded.fingerprint,
          note_kind = excluded.note_kind,
          semantic_kind = excluded.semantic_kind,
          memory_class = excluded.memory_class,
          type = excluded.type,
          title = excluded.title,
          slug = excluded.slug,
          aliases_json = excluded.aliases_json,
          frontmatter_json = excluded.frontmatter_json,
          body = excluded.body,
          archived = excluded.archived,
          valid_from = excluded.valid_from,
          valid_to = excluded.valid_to,
          confidence = excluded.confidence,
          trust_score = excluded.trust_score,
          quarantined = excluded.quarantined,
          scope_user = excluded.scope_user,
          scope_agent = excluded.scope_agent,
          scope_project = excluded.scope_project,
          last_seen = excluded.last_seen,
          provenance = excluded.provenance,
          embedding_json = excluded.embedding_json
      `);
      const insertFts = sqlite.prepare(`
        INSERT INTO notes_fts (id, title, aliases, body)
        VALUES (?, ?, ?, ?)
      `);
      const insertRelation = sqlite.prepare(`
        INSERT INTO note_relations (origin_id, source_id, relation_name, target_id, direction, derived, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const upsertMeta = sqlite.prepare(`
        INSERT INTO meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);

      const runIndex = sqlite.transaction(() => {
        for (const removedPath of removedPaths) {
          const indexedFile = existingFiles.get(removedPath);
          if (!indexedFile) {
            continue;
          }
          deleteFile.run(removedPath);
          deleteRelationsByOrigin.run(indexedFile.noteId);
          deleteRelationsByNode.run(indexedFile.noteId, indexedFile.noteId);
          deleteNote.run(indexedFile.noteId);
          deleteFts.run(indexedFile.noteId);
        }

        const relationsByOrigin = groupRelationsByOrigin(relations);
        for (const changedPath of changedPaths) {
          const note = notesByPath.get(changedPath);
          if (!note) {
            continue;
          }
          const previous = existingFiles.get(changedPath);
          if (previous && previous.noteId !== note.id) {
            deleteRelationsByOrigin.run(previous.noteId);
            deleteRelationsByNode.run(previous.noteId, previous.noteId);
            deleteNote.run(previous.noteId);
            deleteFts.run(previous.noteId);
          }

          deleteRelationsByOrigin.run(note.id);
          deleteFts.run(note.id);
          const noteIndexMetadata = getNoteIndexMetadata(note, validation.schema);
          upsertNote.run({
            id: note.id,
            path: note.path,
            fingerprint: note.fingerprint,
            note_kind: note.kind,
            semantic_kind: getSemanticKind(note, validation.schema),
            memory_class: noteIndexMetadata.memoryClass,
            type: note.type,
            title: note.title,
            slug: note.slug,
            aliases_json: JSON.stringify(readAliases(note)),
            frontmatter_json: JSON.stringify(note.frontmatter),
            body: note.body,
            archived: note.frontmatter.archived === true ? 1 : 0,
            valid_from: noteIndexMetadata.validFrom,
            valid_to: noteIndexMetadata.validTo,
            confidence: noteIndexMetadata.confidence,
            trust_score: noteIndexMetadata.trustScore,
            quarantined: noteIndexMetadata.quarantined ? 1 : 0,
            scope_user: noteIndexMetadata.scopeUser,
            scope_agent: noteIndexMetadata.scopeAgent,
            scope_project: noteIndexMetadata.scopeProject,
            last_seen: noteIndexMetadata.lastSeen,
            provenance: noteIndexMetadata.provenance,
            embedding_json: JSON.stringify(noteIndexMetadata.embedding)
          });
          insertFts.run(note.id, note.title, readAliases(note).join(" "), note.body);
          upsertFile.run({
            path: note.path,
            note_id: note.id,
            fingerprint: note.fingerprint
          });

          for (const relation of relationsByOrigin.get(note.id) ?? []) {
            insertRelation.run(
              relation.originId,
              relation.sourceId,
              relation.relationName,
              relation.targetId,
              relation.sourceId === relation.originId ? "outbound" : "inbound",
              relation.sourceId === relation.originId ? 0 : 1,
              JSON.stringify(relation.metadata)
            );
          }
        }

        const indexedAt = new Date().toISOString();
        upsertMeta.run("schema_hash", validation.schema.hash);
        upsertMeta.run("indexed_at", indexedAt);
      });

      runIndex();

      return {
        indexed: validation.notes.length,
        changed: fullRebuild ? validation.notes.length : changedPaths.length,
        removed: removedPaths.length,
        rebuild: fullRebuild,
        warnings: validation.warnings,
        indexDbPath: this.workspace.indexDbPath
      };
    } finally {
      sqlite.close();
    }
  }

  query(filters: QueryFilters) {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      throw new MemoryError("No index found. Run `memory index` first.");
    }

    const mode = filters.mode ?? (filters.linkedTo ? "neighbors" : filters.text ? "search" : "find");
    if (mode === "neighbors" && !filters.linkedTo) {
      throw new MemoryError('Query mode "neighbors" requires --linked-to');
    }

    const indexStatus = this.checkStalenessLightweight();
    if (filters.exact && indexStatus.stale) {
      throw new MemoryError("Index is stale. Run memory index before exact queries.");
    }

    return this.queryFromIndex(filters, mode, indexStatus);
  }

  private queryFromIndex(filters: QueryFilters, mode: string, indexStatus: IndexStatus) {
    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.noteKind) {
        conditions.push("n.note_kind = ?");
        params.push(filters.noteKind);
      }
      if (filters.type) {
        conditions.push("n.type = ?");
        params.push(filters.type);
      }
      if (filters.kind) {
        conditions.push("n.semantic_kind = ?");
        params.push(filters.kind);
      }
      if (filters.text) {
        const pattern = `%${filters.text.toLowerCase()}%`;
        conditions.push("(LOWER(n.title) LIKE ? OR LOWER(n.body) LIKE ? OR LOWER(n.aliases_json) LIKE ? OR LOWER(n.slug) LIKE ?)");
        params.push(pattern, pattern, pattern, pattern);
      }

      let focus: { id: string; title: string; type: string; noteKind: string; kind: string } | null = null;
      let reachableIds: Set<string> | null = null;

      if (filters.linkedTo) {
        const focusNote = this.lookupFromIndex(sqlite, filters.linkedTo, {
          noteKind: filters.noteKind,
          type: filters.type,
          allowLoose: true
        });
        focus = {
          id: focusNote.id,
          title: focusNote.title,
          type: focusNote.type,
          noteKind: focusNote.note_kind,
          kind: focusNote.semantic_kind
        };
        reachableIds = buildReachableNoteIdsFromIndex(sqlite, focusNote.id, filters.pathDepth ?? 1);
      }

      if (reachableIds) {
        if (reachableIds.size === 0) {
          conditions.push("0 = 1");
        } else {
          const placeholders = [...reachableIds].map(() => "?").join(",");
          conditions.push(`n.id IN (${placeholders})`);
          params.push(...reachableIds);
        }
      }

      if (filters.has) {
        for (const [relationName, targetRef] of Object.entries(filters.has)) {
          const targetNote = this.lookupFromIndex(sqlite, targetRef, { allowLoose: true });
          conditions.push(
            `EXISTS (SELECT 1 FROM note_relations r WHERE r.source_id = n.id AND r.relation_name = ? AND r.target_id = ?)`
          );
          params.push(relationName, targetNote.id);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      let rows = sqlite
        .prepare(
          `SELECT n.id, n.slug, n.title, n.note_kind, n.semantic_kind, n.type, n.path, n.aliases_json, n.frontmatter_json
           FROM notes n ${whereClause}`
        )
        .all(...params) as Array<{
          id: string;
          slug: string | null;
          title: string;
          note_kind: string;
          semantic_kind: string;
          type: string;
          path: string;
          aliases_json: string;
          frontmatter_json: string;
        }>;

      if (filters.where) {
        rows = rows.filter((row) => {
          const frontmatter = JSON.parse(row.frontmatter_json) as FrontmatterMap;
          return matchesWhere({ frontmatter } as ParsedNote, filters.where);
        });
      }

      return {
        mode,
        focus,
        count: rows.length,
        exact: Boolean(filters.exact),
        index: indexStatus,
        warnings: [] as string[],
        notes: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          noteKind: row.note_kind,
          kind: row.semantic_kind,
          type: row.type,
          path: path.relative(this.workspace.root, row.path),
          aliases: JSON.parse(row.aliases_json) as string[]
        }))
      };
    } finally {
      sqlite.close();
    }
  }

  newNote(kind: NoteKind, type: string, id: string, title: string, force = false) {
    const schema = this.loadSchema();
    const definition = kind === "entity" ? schema.entityTypes.get(type) : schema.memoryTypes.get(type);
    if (!definition) {
      throw new MemoryError(`Unknown ${kind} type "${type}"`);
    }

    const destinationDir = kind === "entity" ? this.workspace.entitiesDir : this.workspace.memoriesDir;
    const filePath = path.join(destinationDir, `${id}.md`);
    if (fs.existsSync(filePath) && !force) {
      throw new MemoryError(`Note already exists: ${filePath}`);
    }

    const now = new Date().toISOString().slice(0, 10);
    const frontmatter: FrontmatterMap = {
      id,
      slug: slugify(title),
      kind,
      type,
      title,
      schemaVersion: schema.version,
      createdAt: now,
      updatedAt: now,
      status: "active",
      archived: false
    };

    if (kind === "entity") {
      frontmatter.aliases = [slugify(title)];
    }

    for (const [attributeName, attributeDefinition] of Object.entries(definition.attributes ?? {})) {
      if (attributeDefinition.required) {
        frontmatter[attributeName] = defaultAttributeValue(attributeDefinition);
      }
    }

    for (const [relationName, relationDefinition] of Object.entries(definition.relations ?? {})) {
      if ((relationDefinition.cardinality ?? "many") === "one") {
        frontmatter[relationName] = placeholderTargetId(relationDefinition.targets[0]);
      } else if ((relationDefinition.cardinality ?? "many") === "at_least_one") {
        frontmatter[relationName] = [placeholderTargetId(relationDefinition.targets[0])];
      }
    }

    const preferredOrder = buildPreferredKeyOrder(definition);
    const orderedFrontmatter = sortFrontmatterMap(frontmatter, preferredOrder);
    const body = [
      title,
      "",
      `Type: ${type}`,
      `Kind: ${definition.kindId}`,
      "",
      "Describe the durable facts here. Keep queryable structure in frontmatter."
    ].join("\n");

    fs.writeFileSync(filePath, serializeFrontmatterDocument(orderedFrontmatter, body), "utf8");

    return {
      path: filePath,
      id,
      slug: orderedFrontmatter.slug,
      kind,
      type
    };
  }

  lint(fix = false) {
    const schema = this.loadSchema();
    const files = listMarkdownFiles(this.workspace.notesDir);
    const issues: string[] = [];
    const changed: string[] = [];

    for (const filePath of files) {
      try {
        const note = parseNoteFile(filePath);
        const definition = getTypeDefinition(note, schema);
        const preferredOrder = buildPreferredKeyOrder(definition);
        const ordered = sortFrontmatterMap(note.frontmatter, preferredOrder);
        const nextContent = serializeFrontmatterDocument(ordered, note.body);
        if (nextContent !== note.rawContent.replace(/\r\n/g, "\n")) {
          changed.push(path.relative(this.workspace.root, filePath));
          if (fix) {
            fs.writeFileSync(filePath, nextContent, "utf8");
          }
        }
      } catch (error) {
        issues.push(`${path.relative(this.workspace.root, filePath)}: ${toMessage(error)}`);
      }
    }

    return {
      checked: files.length,
      changed: changed.length,
      fixed: fix ? changed.length : 0,
      files: changed,
      issues
    };
  }

  lookup(reference: string, filters: LookupFilters = {}) {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      throw new MemoryError("No index found. Run `memory index` first.");
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const note = this.lookupFromIndex(sqlite, reference, {
        ...filters,
        allowLoose: filters.allowLoose ?? true
      });

      return {
        reference,
        id: note.id,
        slug: note.slug,
        title: note.title,
        noteKind: note.note_kind,
        kind: note.semantic_kind,
        type: note.type,
        path: path.relative(this.workspace.root, note.path)
      };
    } finally {
      sqlite.close();
    }
  }

  archiveNote(reference: string) {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      throw new MemoryError("No index found. Run `memory index` first.");
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    let notePath: string;
    try {
      const note = this.lookupFromIndex(sqlite, reference, { allowLoose: true });
      notePath = note.path;
    } finally {
      sqlite.close();
    }

    const rawContent = fs.readFileSync(notePath, "utf8");
    const { frontmatter, body } = parseFrontmatterDocument(rawContent);
    frontmatter.archived = true;
    frontmatter.updatedAt = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(notePath, serializeFrontmatterDocument(frontmatter, body), "utf8");

    return {
      archived: true,
      path: path.relative(this.workspace.root, notePath),
      id: frontmatter.id
    };
  }

  deleteNote(reference: string) {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      throw new MemoryError("No index found. Run `memory index` first.");
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    let notePath: string;
    let noteId: string;
    try {
      const note = this.lookupFromIndex(sqlite, reference, { allowLoose: true });
      notePath = note.path;
      noteId = note.id;
    } finally {
      sqlite.close();
    }

    fs.unlinkSync(notePath);

    return {
      deleted: true,
      path: path.relative(this.workspace.root, notePath),
      id: noteId
    };
  }

  doctor() {
    const validation = this.validate();
    const duplicateIdentities = validation.issues.some((issue) =>
      issue.includes("Duplicate note id") ||
      issue.includes("Duplicate slug") ||
      issue.includes('Duplicate alias')
    );
    const indexStatus = this.getIndexStatus(validation);

    return {
      workspace: this.workspace.root,
      format: this.getConfig().format,
      schemaVersion: validation.schema.version,
      schemaHash: validation.schema.hash,
      notes: validation.notes.length,
      valid: validation.valid,
      requiresMigration: validation.requiresMigration,
      issues: validation.issues,
      warnings: validation.warnings,
      health: {
        schemaChanged: indexStatus.schemaChanged,
        indexStale: indexStatus.stale,
        duplicateIdentities
      },
      index: indexStatus
    };
  }

  activeStatus() {
    const validation = this.validate();
    const indexStatus = this.getIndexStatus(validation);
    return {
      enabled: this.getConfig().activeMemory?.enabled ?? true,
      workspace: this.workspace.root,
      notes: validation.notes.length,
      valid: validation.valid,
      index: indexStatus,
      captures: this.listCaptures().filter((entry) => !entry.promotedAt).length,
      tools: ["search", "get", "save", "conclude", "status"],
      warnings: validation.warnings
    };
  }

  activeSearch(options: ActiveSearchOptions) {
    const query = options.text.trim();
    if (!query) {
      throw new MemoryError("Search text is required.");
    }

    this.ensureSearchIndex();
    const config = this.getConfig().activeMemory ?? {};
    const limit = clampPositiveInteger(options.limit ?? config.maxResults ?? 6, 1, 50);
    const minScore = options.minScore ?? config.minScore ?? 0.02;
    const semantic = options.semantic ?? config.semanticSearch ?? false;
    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });

    try {
      const rows = readSearchCandidateRows(sqlite, options);
      const ftsRanks = readFtsRanks(sqlite, query);
      const queryVector = semantic ? buildTextVector(query) : {};
      const scored = rows
        .map((row) => {
          const lexicalRank = ftsRanks.get(row.id);
          const lexicalScore = lexicalRank === undefined ? keywordScore(row, query) : 1 / (10 + lexicalRank);
          const semanticScore = semantic ? cosineSimilarity(queryVector, safeParseVector(row.embedding_json)) : 0;
          const quality = clamp01((row.confidence ?? 1) * (row.trust_score ?? 1));
          const score = (lexicalScore + semanticScore) * quality;
          return {
            id: row.id,
            title: row.title,
            noteKind: row.note_kind,
            kind: row.semantic_kind,
            memoryClass: row.memory_class ?? memoryClassFor(row.note_kind, row.semantic_kind),
            type: row.type,
            score,
            confidence: row.confidence ?? 1,
            trustScore: row.trust_score ?? 1,
            current: isCurrentIndexedRow(row),
            temporal: {
              validFrom: row.valid_from,
              validTo: row.valid_to,
              lastSeen: row.last_seen
            },
            scope: {
              user: row.scope_user,
              agent: row.scope_agent,
              project: row.scope_project
            },
            citation: `${path.relative(this.workspace.root, row.path)}#${row.id}`,
            excerpt: buildExcerpt(row, query),
            provenance: row.provenance
          };
        })
        .filter((row) => row.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        query,
        mode: semantic ? "hybrid" : "keyword",
        count: scored.length,
        minScore,
        results: scored
      };
    } finally {
      sqlite.close();
    }
  }

  contextBundle(options: ActiveSearchOptions & { maxSummaryChars?: number }) {
    const config = this.getConfig().activeMemory ?? {};
    const maxSummaryChars = clampPositiveInteger(
      options.maxSummaryChars ?? config.maxSummaryChars ?? 220,
      40,
      2000
    );
    const search = this.activeSearch(options);
    const memories = search.results.map((result, index) => ({
      rank: index + 1,
      ...result,
      summary: truncate(result.excerpt, maxSummaryChars)
    }));
    return {
      query: search.query,
      mode: search.mode,
      count: memories.length,
      context: memories
        .map((memory) => `- ${memory.title}: ${memory.summary} [${memory.citation}]`)
        .join("\n"),
      memories
    };
  }

  getNote(reference: string) {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      throw new MemoryError("No index found. Run `memory index` first.");
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const note = this.lookupFromIndex(sqlite, reference, { allowLoose: true });
      return {
        id: note.id,
        slug: note.slug,
        title: note.title,
        noteKind: note.note_kind,
        kind: note.semantic_kind,
        memoryClass: note.memory_class ?? memoryClassFor(note.note_kind, note.semantic_kind),
        type: note.type,
        path: path.relative(this.workspace.root, note.path),
        frontmatter: JSON.parse(note.frontmatter_json) as FrontmatterMap,
        body: note.body
      };
    } finally {
      sqlite.close();
    }
  }

  saveMemory(input: SaveMemoryInput) {
    if (!input.content.trim()) {
      throw new MemoryError("Memory content is required.");
    }
    const schema = this.loadSchema();
    const memoryClass = input.memoryClass ?? "semantic";
    const type = memoryTypeForClass(memoryClass);
    if (!schema.memoryTypes.has(type)) {
      throw new MemoryError(`Schema does not define memory type "${type}"`);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const id = `mem_${hashString(`${nowIso}:${input.content}`).slice(0, 12)}`;
    const title = input.title?.trim() || summarizeTitle(input.content);
    const frontmatter: FrontmatterMap = {
      id,
      slug: slugify(title),
      kind: "memory",
      type,
      title,
      schemaVersion: schema.version,
      createdAt: nowIso.slice(0, 10),
      updatedAt: nowIso.slice(0, 10),
      status: "active",
      archived: false,
      observedAt: input.validFrom ?? nowIso,
      validFrom: input.validFrom ?? nowIso,
      confidence: input.confidence ?? 0.8,
      trustScore: input.trustScore ?? 0.8,
      quarantined: input.quarantined ?? false,
      provenance: input.provenance ?? "manual",
      lastSeen: nowIso
    };
    if (input.validTo) frontmatter.validTo = input.validTo;
    if (input.scopeUser) frontmatter.scopeUser = input.scopeUser;
    if (input.scopeAgent) frontmatter.scopeAgent = input.scopeAgent;
    if (input.scopeProject) frontmatter.scopeProject = input.scopeProject;
    if (input.supersedes?.length) frontmatter.supersedes = input.supersedes;
    if (memoryClass === "episodic") frontmatter.eventAt = input.validFrom ?? nowIso;
    if (memoryClass === "procedural") {
      frontmatter.workflow = title;
      frontmatter.outcome = "unknown";
    }

    const filePath = path.join(this.workspace.memoriesDir, `${id}.md`);
    fs.writeFileSync(
      filePath,
      serializeFrontmatterDocument(sortFrontmatterMap(frontmatter, buildSavedMemoryKeyOrder()), input.content.trim()),
      "utf8"
    );
    this.index();

    return {
      saved: true,
      id,
      title,
      memoryClass,
      path: path.relative(this.workspace.root, filePath)
    };
  }

  concludeMemory(content: string, input: Omit<SaveMemoryInput, "content"> = {}) {
    return this.saveMemory({
      ...input,
      content,
      memoryClass: input.memoryClass ?? "semantic",
      confidence: input.confidence ?? 0.95,
      trustScore: input.trustScore ?? 0.9,
      provenance: input.provenance ?? "conclusion"
    });
  }

  captureTurn(input: CaptureTurnInput) {
    ensureDirLocal(this.workspace.capturesDir);
    const nowIso = new Date().toISOString();
    const id = `cap_${hashString(`${nowIso}:${input.user ?? ""}:${input.assistant ?? ""}`).slice(0, 12)}`;
    const entry = {
      id,
      capturedAt: nowIso,
      sessionId: input.sessionId ?? "default",
      source: input.source ?? "session",
      user: input.user ?? "",
      assistant: input.assistant ?? "",
      scopeUser: input.scopeUser ?? null,
      scopeAgent: input.scopeAgent ?? null,
      scopeProject: input.scopeProject ?? null,
      promotedAt: null as string | null
    };
    const entries = this.listCaptures();
    writeCaptureEntries(this.workspace.capturesDir, [...entries, entry]);
    return entry;
  }

  listCaptures() {
    return readCaptureEntries(this.workspace.capturesDir);
  }

  promoteCapture(captureId: string) {
    const entries = this.listCaptures();
    const entry = entries.find((candidate) => candidate.id === captureId);
    if (!entry) {
      throw new MemoryError(`Capture not found: ${captureId}`);
    }
    if (entry.promotedAt) {
      throw new MemoryError(`Capture already promoted: ${captureId}`);
    }

    const content = [`Session: ${entry.sessionId}`, "", "User:", entry.user, "", "Assistant:", entry.assistant]
      .join("\n")
      .trim();
    const saved = this.saveMemory({
      title: `Session ${entry.sessionId}`,
      content,
      memoryClass: "episodic",
      confidence: 0.7,
      trustScore: 0.75,
      scopeUser: entry.scopeUser ?? undefined,
      scopeAgent: entry.scopeAgent ?? undefined,
      scopeProject: entry.scopeProject ?? undefined,
      provenance: `capture:${entry.id}`,
      validFrom: entry.capturedAt
    });
    entry.promotedAt = new Date().toISOString();
    writeCaptureEntries(this.workspace.capturesDir, entries);
    return {
      promoted: true,
      captureId,
      memory: saved
    };
  }

  timeline(includeHistory = true) {
    this.ensureSearchIndex();
    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const rows = readSearchCandidateRows(sqlite, { text: "", includeHistory });
      return {
        count: rows.length,
        events: rows
          .map((row) => ({
            id: row.id,
            title: row.title,
            kind: row.semantic_kind,
            memoryClass: row.memory_class ?? memoryClassFor(row.note_kind, row.semantic_kind),
            type: row.type,
            date: row.valid_from ?? row.last_seen ?? null,
            validTo: row.valid_to,
            current: isCurrentIndexedRow(row),
            confidence: row.confidence ?? 1,
            trustScore: row.trust_score ?? 1,
            quarantined: Boolean(row.quarantined)
          }))
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
      };
    } finally {
      sqlite.close();
    }
  }

  exportScopedMemory(filters: { scopeUser?: string; scopeAgent?: string; scopeProject?: string }) {
    this.ensureSearchIndex();
    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      return {
        filters,
        notes: readSearchCandidateRows(sqlite, { text: "", includeHistory: true, ...filters }).map((row) => ({
          id: row.id,
          title: row.title,
          type: row.type,
          memoryClass: row.memory_class ?? memoryClassFor(row.note_kind, row.semantic_kind),
          scope: {
            user: row.scope_user,
            agent: row.scope_agent,
            project: row.scope_project
          },
          body: row.body
        }))
      };
    } finally {
      sqlite.close();
    }
  }

  private ensureSearchIndex() {
    const status = this.checkStalenessLightweight();
    if (!status.present || status.stale) {
      this.index();
    }
  }

  private checkStalenessLightweight(): IndexStatus {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      const noteFiles = listMarkdownFiles(this.workspace.notesDir);
      return {
        present: false,
        stale: noteFiles.length > 0,
        schemaChanged: false,
        noteChanges: noteFiles.length,
        indexedAt: null
      };
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const noteFiles = listMarkdownFiles(this.workspace.notesDir);
      const currentFiles = new Map<string, string>();
      for (const filePath of noteFiles) {
        const rawContent = fs.readFileSync(filePath, "utf8");
        currentFiles.set(filePath, hashString(rawContent));
      }

      const indexedFiles = readIndexedFiles(sqlite);
      const indexedAt = readMeta(sqlite, "indexed_at");
      const indexedSchemaHash = readMeta(sqlite, "schema_hash");
      const schema = this.loadSchema();
      let noteChanges = 0;

      for (const [filePath, fingerprint] of currentFiles) {
        if (indexedFiles.get(filePath)?.fingerprint !== fingerprint) {
          noteChanges += 1;
        }
      }
      for (const indexedPath of indexedFiles.keys()) {
        if (!currentFiles.has(indexedPath)) {
          noteChanges += 1;
        }
      }

      const schemaChanged = indexedSchemaHash !== schema.hash;
      return {
        present: true,
        stale: schemaChanged || noteChanges > 0,
        schemaChanged,
        noteChanges,
        indexedAt
      };
    } finally {
      sqlite.close();
    }
  }

  private getIndexStatus(validation: ValidationResult): IndexStatus {
    if (!fs.existsSync(this.workspace.indexDbPath)) {
      return {
        present: false,
        stale: validation.notes.length > 0,
        schemaChanged: false,
        noteChanges: validation.notes.length,
        indexedAt: null
      };
    }

    const sqlite = new Database(this.workspace.indexDbPath, { readonly: true });
    try {
      const currentFiles = new Map(validation.notes.map((note) => [note.path, note.fingerprint]));
      const indexedFiles = readIndexedFiles(sqlite);
      const indexedAt = readMeta(sqlite, "indexed_at");
      const indexedSchemaHash = readMeta(sqlite, "schema_hash");
      let noteChanges = 0;

      for (const [filePath, fingerprint] of currentFiles) {
        if (indexedFiles.get(filePath)?.fingerprint !== fingerprint) {
          noteChanges += 1;
        }
      }
      for (const indexedPath of indexedFiles.keys()) {
        if (!currentFiles.has(indexedPath)) {
          noteChanges += 1;
        }
      }

      const schemaChanged = indexedSchemaHash !== validation.schema.hash;
      return {
        present: true,
        stale: schemaChanged || noteChanges > 0,
        schemaChanged,
        noteChanges,
        indexedAt
      };
    } finally {
      sqlite.close();
    }
  }

  private lookupFromIndex(
    sqlite: Database.Database,
    reference: string,
    filters: LookupFilters = {}
  ): IndexedNote {
    const normalized = normalizeIdentity(reference);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.noteKind) {
      conditions.push("note_kind = ?");
      params.push(filters.noteKind);
    }
    if (filters.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }
    if (filters.kind) {
      conditions.push("semantic_kind = ?");
      params.push(filters.kind);
    }

    const filterClause = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";

    const byId = sqlite
      .prepare(`SELECT * FROM notes WHERE LOWER(id) = ?${filterClause}`)
      .all(normalized, ...params) as IndexedNote[];
    const bySlug = sqlite
      .prepare(`SELECT * FROM notes WHERE LOWER(slug) = ?${filterClause}`)
      .all(normalized, ...params) as IndexedNote[];

    let candidates = dedupeIndexedNotes([...byId, ...bySlug]);

    if ((filters.allowLoose ?? false) && candidates.length === 0) {
      const byTitle = sqlite
        .prepare(`SELECT * FROM notes WHERE LOWER(title) = ?${filterClause}`)
        .all(normalized, ...params) as IndexedNote[];
      const byAlias = sqlite
        .prepare(
          `SELECT n.* FROM notes n, json_each(n.aliases_json) AS a WHERE LOWER(a.value) = ?${filterClause.replace(/(?<=\b)(note_kind|type|semantic_kind)\b/g, "n.$1")}`
        )
        .all(normalized, ...params) as IndexedNote[];
      candidates = dedupeIndexedNotes([...candidates, ...byTitle, ...byAlias]);
    }

    if (candidates.length === 0) {
      throw new MemoryError(`Reference not found: ${reference}`);
    }
    if (candidates.length > 1) {
      const candidateIds = candidates.map((c) => c.id).join(", ");
      throw new MemoryError(`Ambiguous reference "${reference}". Matches: ${candidateIds}`);
    }

    return candidates[0];
  }
}

function ensureIndexStorage(sqlite: Database.Database): void {
  const columns = new Set(
    (sqlite.prepare(`PRAGMA table_info(notes)`).all() as Array<{ name: string }>).map((column) => column.name)
  );
  const additions: Array<[string, string]> = [
    ["memory_class", "TEXT NOT NULL DEFAULT 'archival'"],
    ["archived", "INTEGER NOT NULL DEFAULT 0"],
    ["valid_from", "TEXT"],
    ["valid_to", "TEXT"],
    ["confidence", "REAL"],
    ["trust_score", "REAL"],
    ["quarantined", "INTEGER NOT NULL DEFAULT 0"],
    ["scope_user", "TEXT"],
    ["scope_agent", "TEXT"],
    ["scope_project", "TEXT"],
    ["last_seen", "TEXT"],
    ["provenance", "TEXT"],
    ["embedding_json", "TEXT NOT NULL DEFAULT '{}'"]
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      sqlite.exec(`ALTER TABLE notes ADD COLUMN ${name} ${definition}`);
    }
  }
}

function addMissingCoreDefinitions(
  entityKinds: Map<string, { id: string; description?: string }>,
  memoryKinds: Map<string, { id: string; description?: string }>,
  entityTypes: Map<string, EntityTypeDefinition>,
  memoryTypes: Map<string, MemoryTypeDefinition>
): void {
  for (const definition of CORE_SCHEMA.entityKinds) {
    if (!entityKinds.has(definition.id)) entityKinds.set(definition.id, definition);
  }
  for (const definition of CORE_SCHEMA.memoryKinds) {
    if (!memoryKinds.has(definition.id)) memoryKinds.set(definition.id, definition);
  }
  for (const definition of CORE_SCHEMA.entityTypes) {
    if (!entityTypes.has(definition.id)) entityTypes.set(definition.id, definition);
  }
  for (const definition of CORE_SCHEMA.memoryTypes) {
    if (!memoryTypes.has(definition.id)) memoryTypes.set(definition.id, definition);
  }
}

function getNoteIndexMetadata(note: ParsedNote, schema: LoadedSchema) {
  const semanticKind = getSemanticKind(note, schema);
  const memoryClass = memoryClassFor(note.kind, semanticKind);
  const validFrom = readOptionalString(note.frontmatter.validFrom)
    ?? readOptionalString(note.frontmatter.observedAt)
    ?? readOptionalString(note.frontmatter.createdAt);
  const validTo = readOptionalString(note.frontmatter.validTo);
  const lastSeen = readOptionalString(note.frontmatter.lastSeen)
    ?? readOptionalString(note.frontmatter.updatedAt)
    ?? validFrom;
  const confidence = readOptionalNumber(note.frontmatter.confidence) ?? 1;
  const trustScore = readOptionalNumber(note.frontmatter.trustScore) ?? 1;
  const quarantined = note.frontmatter.quarantined === true || trustScore < 0.25;
  const scopeUser = readOptionalString(note.frontmatter.scopeUser);
  const scopeAgent = readOptionalString(note.frontmatter.scopeAgent);
  const scopeProject = readOptionalString(note.frontmatter.scopeProject);
  const provenance = readOptionalString(note.frontmatter.provenance);
  const embedding = buildTextVector(
    [
      note.title,
      readAliases(note).join(" "),
      note.body,
      JSON.stringify({
        tags: note.frontmatter.tags,
        type: note.type,
        kind: semanticKind,
        class: memoryClass
      })
    ].join("\n")
  );

  return {
    memoryClass,
    validFrom,
    validTo,
    confidence,
    trustScore,
    quarantined,
    scopeUser,
    scopeAgent,
    scopeProject,
    lastSeen,
    provenance,
    embedding
  };
}

function readSearchCandidateRows(sqlite: Database.Database, filters: Partial<ActiveSearchOptions>): IndexedNote[] {
  const conditions: string[] = ["n.archived IS NOT 1", "COALESCE(n.quarantined, 0) = 0"];
  const params: unknown[] = [];

  if (!filters.includeHistory) {
    conditions.push("(n.valid_to IS NULL OR n.valid_to >= ?)");
    params.push(new Date().toISOString());
  }
  if (filters.memoryClass) {
    conditions.push("n.memory_class = ?");
    params.push(filters.memoryClass);
  }
  if (filters.scopeUser) {
    conditions.push("(n.scope_user IS NULL OR n.scope_user = ?)");
    params.push(filters.scopeUser);
  }
  if (filters.scopeAgent) {
    conditions.push("(n.scope_agent IS NULL OR n.scope_agent = ?)");
    params.push(filters.scopeAgent);
  }
  if (filters.scopeProject) {
    conditions.push("(n.scope_project IS NULL OR n.scope_project = ?)");
    params.push(filters.scopeProject);
  }

  return sqlite
    .prepare(
      `SELECT n.* FROM notes n
       WHERE ${conditions.join(" AND ")}`
    )
    .all(...params) as IndexedNote[];
}

function readFtsRanks(sqlite: Database.Database, text: string): Map<string, number> {
  const query = toFtsQuery(text);
  if (!query) {
    return new Map();
  }
  try {
    const rows = sqlite
      .prepare(
        `SELECT id FROM notes_fts
         WHERE notes_fts MATCH ?
         ORDER BY bm25(notes_fts)
         LIMIT 100`
      )
      .all(query) as Array<{ id: string }>;
    return new Map(rows.map((row, index) => [row.id, index + 1]));
  } catch {
    return new Map();
  }
}

function keywordScore(row: IndexedNote, query: string): number {
  const haystack = `${row.title} ${row.aliases_json} ${row.body}`.toLowerCase();
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return 0.01;
  }
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits === 0 ? 0 : hits / tokens.length / 5;
}

function buildExcerpt(row: IndexedNote, query: string): string {
  const text = row.body.trim() || row.title;
  const tokens = tokenize(query);
  const lower = text.toLowerCase();
  const firstHit = tokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstHit - 80);
  return `${start > 0 ? "..." : ""}${truncate(text.slice(start), 280)}`;
}

function buildTextVector(text: string): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const token of tokenize(text)) {
    vector[token] = (vector[token] ?? 0) + 1;
  }
  const norm = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0)) || 1;
  for (const key of Object.keys(vector)) {
    vector[key] = vector[key] / norm;
  }
  return vector;
}

function safeParseVector(raw: string | null | undefined): Record<string, number> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let score = 0;
  const [small, large] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a];
  for (const key of Object.keys(small)) {
    score += small[key] * (large[key] ?? 0);
  }
  return score;
}

function toFtsQuery(text: string): string {
  return tokenize(text).slice(0, 12).map((token) => `"${token}"`).join(" OR ");
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_áéíóúüñ-]{2,}/gi)?.map((token) => token.toLowerCase()) ?? [])];
}

function isCurrentIndexedRow(row: IndexedNote): boolean {
  return !row.valid_to || row.valid_to >= new Date().toISOString();
}

function memoryClassFor(noteKind: string, semanticKind: string): MemoryClass {
  if (semanticKind === "episodic" || semanticKind === "source_extract") return "episodic";
  if (semanticKind === "procedural" || semanticKind === "task_context") return "procedural";
  if (noteKind === "memory") return "semantic";
  return "archival";
}

function memoryTypeForClass(memoryClass: MemoryClass): string {
  if (memoryClass === "episodic") return "episodic_note";
  if (memoryClass === "procedural") return "procedural_note";
  return "semantic_note";
}

function summarizeTitle(content: string): string {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Memory";
  return truncate(firstLine.replace(/^#+\s*/, ""), 60);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPositiveInteger(value: number, min: number, max: number): number {
  const integer = Number.isInteger(value) ? value : Math.trunc(value);
  return Math.max(min, Math.min(max, integer));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
}

function ensureDirLocal(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

type CaptureEntry = {
  id: string;
  capturedAt: string;
  sessionId: string;
  source: string;
  user: string;
  assistant: string;
  scopeUser: string | null;
  scopeAgent: string | null;
  scopeProject: string | null;
  promotedAt: string | null;
};

function captureQueuePath(capturesDir: string): string {
  return path.join(capturesDir, "pending.json");
}

function readCaptureEntries(capturesDir: string): CaptureEntry[] {
  const queuePath = captureQueuePath(capturesDir);
  if (!fs.existsSync(queuePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath, "utf8")) as CaptureEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCaptureEntries(capturesDir: string, entries: CaptureEntry[]): void {
  ensureDirLocal(capturesDir);
  fs.writeFileSync(captureQueuePath(capturesDir), `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function parseNoteFile(filePath: string): ParsedNote {
  const rawContent = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const { frontmatter, body } = parseFrontmatterDocument(rawContent);
  const id = expectString(frontmatter.id, "id");
  const kind = expectKind(frontmatter.kind);
  const type = expectString(frontmatter.type, "type");
  const title = expectString(frontmatter.title, "title");
  const slug = frontmatter.slug === undefined ? null : expectString(frontmatter.slug, "slug");
  const schemaVersion =
    frontmatter.schemaVersion === undefined ? null : expectInteger(frontmatter.schemaVersion, "schemaVersion");

  return {
    path: filePath,
    rawContent,
    fingerprint: hashString(rawContent),
    id,
    slug,
    schemaVersion,
    kind,
    type,
    title,
    frontmatter,
    body
  };
}

function validateNoteShape(
  note: ParsedNote,
  schema: LoadedSchema,
  identityIndex: IdentityIndex,
  warnings: string[]
): void {
  const definition = getTypeDefinition(note, schema);
  const allowedKeys = new Set([
    "id",
    "slug",
    "kind",
    "type",
    "title",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "status",
    "archived",
    "tags",
    "validFrom",
    "validTo",
    "supersedes",
    "confidence",
    "trustScore",
    "quarantined",
    "scopeUser",
    "scopeAgent",
    "scopeProject",
    "provenance",
    "lastSeen"
  ]);
  if (note.kind === "entity") {
    allowedKeys.add("aliases");
  }
  if (note.kind === "memory") {
    allowedKeys.add("observedAt");
    allowedKeys.add("eventAt");
  }

  for (const key of Object.keys(definition.attributes ?? {})) {
    allowedKeys.add(key);
  }
  for (const key of Object.keys(definition.relations ?? {})) {
    allowedKeys.add(key);
  }

  for (const key of Object.keys(note.frontmatter)) {
    if (!allowedKeys.has(key)) {
      throw new MemoryError(`Unknown frontmatter field "${key}"`);
    }
  }

  if (note.kind === "entity" && note.frontmatter.aliases !== undefined) {
    assertStringArray(note.frontmatter.aliases, "aliases");
    const aliases = readAliases(note);
    if (aliases.length !== new Set(aliases.map((alias) => normalizeIdentity(alias))).size) {
      throw new MemoryError('Field "aliases" must not contain duplicates');
    }
  }

  if (note.frontmatter.createdAt !== undefined) {
    assertDate(note.frontmatter.createdAt, "createdAt");
  }
  if (note.frontmatter.updatedAt !== undefined) {
    assertDate(note.frontmatter.updatedAt, "updatedAt");
  }
  if (note.frontmatter.archived !== undefined && typeof note.frontmatter.archived !== "boolean") {
    throw new MemoryError('Field "archived" must be a boolean');
  }
  if (note.kind === "memory" && note.frontmatter.observedAt !== undefined) {
    assertDate(note.frontmatter.observedAt, "observedAt");
  }
  if (note.frontmatter.validFrom !== undefined) {
    assertDate(note.frontmatter.validFrom, "validFrom");
  }
  if (note.frontmatter.validTo !== undefined) {
    assertDate(note.frontmatter.validTo, "validTo");
  }
  if (note.frontmatter.lastSeen !== undefined) {
    assertDate(note.frontmatter.lastSeen, "lastSeen");
  }
  if (note.frontmatter.eventAt !== undefined) {
    assertDate(note.frontmatter.eventAt, "eventAt");
  }
  if (note.frontmatter.supersedes !== undefined) {
    assertStringArray(note.frontmatter.supersedes, "supersedes");
  }
  if (note.frontmatter.confidence !== undefined) {
    assertUnitNumber(note.frontmatter.confidence, "confidence");
  }
  if (note.frontmatter.trustScore !== undefined) {
    assertUnitNumber(note.frontmatter.trustScore, "trustScore");
  }
  if (note.frontmatter.quarantined !== undefined && typeof note.frontmatter.quarantined !== "boolean") {
    throw new MemoryError('Field "quarantined" must be a boolean');
  }
  for (const scopeField of ["scopeUser", "scopeAgent", "scopeProject", "provenance"]) {
    const value = note.frontmatter[scopeField];
    if (value !== undefined && typeof value !== "string") {
      throw new MemoryError(`Field "${scopeField}" must be a string`);
    }
  }

  if (note.schemaVersion === null || note.schemaVersion < schema.version) {
    warnings.push(`${note.id}: requires schema migration to version ${schema.version}`);
  }
  if (note.schemaVersion !== null && note.schemaVersion > schema.version) {
    throw new MemoryError(`Note schemaVersion ${note.schemaVersion} is newer than loaded schema ${schema.version}`);
  }

  for (const [attributeName, attributeDefinition] of Object.entries(definition.attributes ?? {})) {
    const value = note.frontmatter[attributeName];
    if (attributeDefinition.required && value === undefined) {
      throw new MemoryError(`Missing required field "${attributeName}"`);
    }
    if (value !== undefined) {
      validateAttribute(value, attributeDefinition, attributeName);
    }
  }

  for (const [relationName, relationDefinition] of Object.entries(definition.relations ?? {})) {
    const rawValue = note.frontmatter[relationName];
    if (rawValue === undefined) {
      if ((relationDefinition.cardinality ?? "many") === "at_least_one") {
        throw new MemoryError(`Relation "${relationName}" must contain at least one target`);
      }
      continue;
    }
    const entries = readRelationEntries(rawValue, relationName);
    validateCardinality(entries.length, relationDefinition.cardinality ?? "many", relationName);

    for (const entry of entries) {
      const targetNote = resolveCanonicalReference(identityIndex, entry.targetRef, schema);
      if (!relationDefinition.targets.includes(targetNote.type)) {
        throw new MemoryError(
          `Relation "${relationName}" does not allow target type "${targetNote.type}"`
        );
      }

      validateRelationMetadata(entry.metadata, relationDefinition, relationName);
    }
  }
}

function validateAttribute(value: unknown, definition: AttributeDefinition, label: string): void {
  switch (definition.type) {
    case "string":
      if (typeof value !== "string") {
        throw new MemoryError(`Field "${label}" must be a string`);
      }
      if (definition.enum && !definition.enum.includes(value)) {
        throw new MemoryError(`Field "${label}" must be one of: ${definition.enum.join(", ")}`);
      }
      break;
    case "number":
      if (typeof value !== "number") {
        throw new MemoryError(`Field "${label}" must be a number`);
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new MemoryError(`Field "${label}" must be a boolean`);
      }
      break;
    case "date":
      assertDate(value, label);
      break;
    case "string[]":
      assertStringArray(value, label);
      break;
    default:
      throw new MemoryError(`Unsupported field type for "${label}"`);
  }
}

function validateRelationMetadata(
  metadata: Record<string, FrontmatterValue>,
  definition: RelationDefinition,
  relationName: string
): void {
  const schema = definition.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    const attributeDefinition = schema[key];
    if (!attributeDefinition) {
      throw new MemoryError(`Relation "${relationName}" does not allow metadata field "${key}"`);
    }
    validateAttribute(metadata[key], attributeDefinition, `${relationName}.${key}`);
  }
}

function validateCardinality(count: number, cardinality: RelationCardinality, relationName: string): void {
  if (cardinality === "one" && count !== 1) {
    throw new MemoryError(`Relation "${relationName}" must contain exactly one target`);
  }
  if (cardinality === "at_least_one" && count < 1) {
    throw new MemoryError(`Relation "${relationName}" must contain at least one target`);
  }
}

function validateRelationTargets(
  relations: Record<string, RelationDefinition>,
  entityTypes: Map<string, EntityTypeDefinition>,
  memoryTypes: Map<string, MemoryTypeDefinition>,
  ownerType: string
): void {
  for (const [relationName, definition] of Object.entries(relations)) {
    for (const target of definition.targets) {
      if (!entityTypes.has(target) && !memoryTypes.has(target)) {
        throw new MemoryError(
          `Type "${ownerType}" relation "${relationName}" references unknown target type "${target}"`
        );
      }
    }
    if (definition.inverse) {
      for (const target of definition.targets) {
        const targetDef = entityTypes.get(target) ?? memoryTypes.get(target);
        if (targetDef?.relations?.[definition.inverse] && targetDef.relations[definition.inverse] !== definition) {
          throw new MemoryError(
            `Type "${ownerType}" relation "${relationName}" inverse "${definition.inverse}" conflicts with an existing relation on target type "${target}"`
          );
        }
      }
    }
  }
}

function getTypeDefinition(
  note: ParsedNote,
  schema: LoadedSchema
): EntityTypeDefinition | MemoryTypeDefinition {
  if (note.kind === "entity") {
    const definition = schema.entityTypes.get(note.type);
    if (!definition) {
      throw new MemoryError(`Unknown entity type "${note.type}"`);
    }
    return definition;
  }

  const definition = schema.memoryTypes.get(note.type);
  if (!definition) {
    throw new MemoryError(`Unknown memory type "${note.type}"`);
  }
  return definition;
}

function collectResolvedRelations(notes: ParsedNote[], schema: LoadedSchema): ResolvedRelation[] {
  const identityIndex = buildIdentityIndex(notes);
  const relations: ResolvedRelation[] = [];

  for (const note of notes) {
    const definition = getTypeDefinition(note, schema);
    for (const [relationName, relationDefinition] of Object.entries(definition.relations ?? {})) {
      for (const entry of readRelationEntries(note.frontmatter[relationName], relationName)) {
        const targetNote = resolveCanonicalReference(identityIndex, entry.targetRef, schema);
        relations.push({
          originId: note.id,
          sourceId: note.id,
          targetId: targetNote.id,
          relationName,
          inverseName: relationDefinition.inverse ?? null,
          metadata: entry.metadata
        });

        if (relationDefinition.inverse) {
          relations.push({
            originId: note.id,
            sourceId: targetNote.id,
            targetId: note.id,
            relationName: relationDefinition.inverse,
            inverseName: relationName,
            metadata: entry.metadata
          });
        }
      }
    }
  }

  return relations;
}

function buildIdentityIndex(notes: ParsedNote[]): IdentityIndex {
  const byId = new Map<string, ParsedNote[]>();
  const bySlug = new Map<string, ParsedNote[]>();
  const byAlias = new Map<string, ParsedNote[]>();
  const byTitle = new Map<string, ParsedNote[]>();

  for (const note of notes) {
    addIdentityCandidate(byId, note.id, note);
    if (note.slug) {
      addIdentityCandidate(bySlug, note.slug, note);
    }
    for (const alias of readAliases(note)) {
      addIdentityCandidate(byAlias, alias, note);
    }
    addIdentityCandidate(byTitle, note.title, note);
  }

  return { byId, bySlug, byAlias, byTitle };
}

function collectIdentityIssues(identityIndex: IdentityIndex, schema: LoadedSchema): string[] {
  const issues: string[] = [];

  for (const [identity, notes] of identityIndex.byId) {
    if (notes.length > 1) {
      issues.push(`Duplicate note id "${identity}"`);
    }
  }
  for (const [identity, notes] of identityIndex.bySlug) {
    if (notes.length > 1) {
      issues.push(`Duplicate slug "${identity}"`);
    }
  }
  for (const [identity, notes] of identityIndex.byAlias) {
    if (notes.length > 1) {
      issues.push(`Duplicate alias "${identity}"`);
    }
  }

  for (const notes of identityIndex.byId.values()) {
    for (const note of notes) {
      getTypeDefinition(note, schema);
    }
  }

  return issues;
}

function resolveCanonicalReference(
  identityIndex: IdentityIndex,
  reference: string,
  schema: LoadedSchema
): ParsedNote {
  const normalized = normalizeIdentity(reference);
  const candidates = dedupeCandidates([
    ...(identityIndex.byId.get(normalized) ?? []),
    ...(identityIndex.bySlug.get(normalized) ?? [])
  ]);

  if (candidates.length === 0) {
    throw new MemoryError(`Broken canonical reference "${normalizeReference(reference)}"`);
  }
  if (candidates.length > 1) {
    throw new MemoryError(`Ambiguous canonical reference "${normalizeReference(reference)}"`);
  }

  getTypeDefinition(candidates[0], schema);
  return candidates[0];
}

function matchesWhere(note: ParsedNote, where: Record<string, string> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expectedValue]) => {
    const value = note.frontmatter[key];
    if (value === undefined || value === null) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some((item) => coerceEquals(item, expectedValue));
    }
    return coerceEquals(value, expectedValue);
  });
}

function coerceEquals(value: FrontmatterValue, expected: string): boolean {
  if (typeof value === "boolean") {
    return value === (expected === "true");
  }
  if (typeof value === "number") {
    const num = Number(expected);
    return !Number.isNaN(num) && value === num;
  }
  return String(value) === expected;
}

function matchesText(note: ParsedNote, text: string | undefined): boolean {
  if (!text) {
    return true;
  }
  const normalized = text.toLowerCase();
  return (
    note.title.toLowerCase().includes(normalized) ||
    (note.slug?.toLowerCase().includes(normalized) ?? false) ||
    note.body.toLowerCase().includes(normalized) ||
    readAliases(note).some((alias) => alias.toLowerCase().includes(normalized))
  );
}

function getSemanticKind(note: ParsedNote, schema: LoadedSchema): string {
  const definition = getTypeDefinition(note, schema);
  return definition.kindId;
}

function readAliases(note: ParsedNote): string[] {
  if (!Array.isArray(note.frontmatter.aliases)) {
    return [];
  }
  return note.frontmatter.aliases
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readRelationEntries(value: unknown, relationName: string): RelationEntry[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [{ targetRef: normalizeReference(value), metadata: {} }];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => parseRelationEntry(entry, relationName));
  }
  if (value && typeof value === "object") {
    return [parseRelationEntry(value, relationName)];
  }
  throw new MemoryError(`Relation "${relationName}" must be a string, object, or array`);
}

function parseRelationEntry(value: unknown, relationName: string): RelationEntry {
  if (typeof value === "string") {
    return { targetRef: normalizeReference(value), metadata: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MemoryError(`Relation "${relationName}" entries must be strings or objects`);
  }

  const record = value as Record<string, FrontmatterValue>;
  if (typeof record.target !== "string" || !record.target.trim()) {
    throw new MemoryError(`Relation "${relationName}" object entries must define a non-empty "target"`);
  }

  const metadata: Record<string, FrontmatterValue> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (key === "target") {
      continue;
    }
    metadata[key] = entryValue;
  }

  return {
    targetRef: normalizeReference(record.target),
    metadata
  };
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MemoryError(`Frontmatter field "${fieldName}" must be a non-empty string`);
  }
  return value.trim();
}

function expectInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MemoryError(`Frontmatter field "${fieldName}" must be an integer`);
  }
  return value;
}

function expectKind(value: unknown): NoteKind {
  if (value !== "entity" && value !== "memory") {
    throw new MemoryError('Frontmatter field "kind" must be "entity" or "memory"');
  }
  return value;
}

function assertStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new MemoryError(`Field "${label}" must be a string array`);
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function assertDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new MemoryError(`Field "${label}" must be an ISO date string`);
  }
}

function assertUnitNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new MemoryError(`Field "${label}" must be a number between 0 and 1`);
  }
}

function defaultAttributeValue(definition: AttributeDefinition): FrontmatterValue {
  if (definition.enum && definition.enum.length > 0) {
    return definition.enum[0];
  }
  if (definition.type === "number") {
    return 0;
  }
  if (definition.type === "boolean") {
    return false;
  }
  if (definition.type === "date") {
    return new Date().toISOString().slice(0, 10);
  }
  if (definition.type === "string[]") {
    return ["todo"];
  }
  return "todo";
}

function placeholderTargetId(type: string): string {
  return `${type}_id`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildPreferredKeyOrder(definition: EntityTypeDefinition | MemoryTypeDefinition): string[] {
  return [
    "id",
    "slug",
    "kind",
    "type",
    "title",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "status",
    "archived",
    "aliases",
    "tags",
    "observedAt",
    "eventAt",
    "validFrom",
    "validTo",
    "supersedes",
    "confidence",
    "trustScore",
    "quarantined",
    "scopeUser",
    "scopeAgent",
    "scopeProject",
    "provenance",
    "lastSeen",
    ...Object.keys(definition.attributes ?? {}),
    ...Object.keys(definition.relations ?? {})
  ];
}

function buildSavedMemoryKeyOrder(): string[] {
  return [
    "id",
    "slug",
    "kind",
    "type",
    "title",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "status",
    "archived",
    "observedAt",
    "eventAt",
    "validFrom",
    "validTo",
    "supersedes",
    "confidence",
    "trustScore",
    "quarantined",
    "scopeUser",
    "scopeAgent",
    "scopeProject",
    "provenance",
    "lastSeen",
    "category",
    "sessionId",
    "workflow",
    "outcome",
    "about",
    "source"
  ];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function addIdentityCandidate(map: Map<string, ParsedNote[]>, rawIdentity: string, note: ParsedNote): void {
  const normalized = normalizeIdentity(rawIdentity);
  const next = map.get(normalized) ?? [];
  next.push(note);
  map.set(normalized, next);
}

function dedupeCandidates(notes: ParsedNote[]): ParsedNote[] {
  const seen = new Set<string>();
  const deduped: ParsedNote[] = [];
  for (const note of notes) {
    if (seen.has(note.id)) {
      continue;
    }
    seen.add(note.id);
    deduped.push(note);
  }
  return deduped;
}

function groupRelationsByOrigin(relations: ResolvedRelation[]): Map<string, ResolvedRelation[]> {
  const grouped = new Map<string, ResolvedRelation[]>();
  for (const relation of relations) {
    const next = grouped.get(relation.originId) ?? [];
    next.push(relation);
    grouped.set(relation.originId, next);
  }
  return grouped;
}

function readMeta(sqlite: Database.Database, key: string): string | null {
  const row = sqlite.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function readIndexedFiles(
  sqlite: Database.Database
): Map<string, { noteId: string; fingerprint: string }> {
  const rows = sqlite
    .prepare(`SELECT path, note_id as noteId, fingerprint FROM files`)
    .all() as Array<{ path: string; noteId: string; fingerprint: string }>;
  return new Map(rows.map((row) => [row.path, { noteId: row.noteId, fingerprint: row.fingerprint }]));
}

export function parseHasFilters(values: string[]): Record<string, string> {
  return parseKeyValueFilters(values);
}

function dedupeIndexedNotes(notes: IndexedNote[]): IndexedNote[] {
  const seen = new Set<string>();
  const deduped: IndexedNote[] = [];
  for (const note of notes) {
    if (seen.has(note.id)) {
      continue;
    }
    seen.add(note.id);
    deduped.push(note);
  }
  return deduped;
}

function buildReachableNoteIdsFromIndex(
  sqlite: Database.Database,
  focusId: string,
  maxDepth: number
): Set<string> {
  const rows = sqlite
    .prepare("SELECT source_id, target_id FROM note_relations")
    .all() as Array<{ source_id: string; target_id: string }>;

  const adjacency = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!adjacency.has(row.source_id)) {
      adjacency.set(row.source_id, new Set());
    }
    adjacency.get(row.source_id)!.add(row.target_id);
  }

  const reachable = new Set<string>([focusId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: focusId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) {
      continue;
    }

    for (const targetId of adjacency.get(current.id) ?? []) {
      if (reachable.has(targetId)) {
        continue;
      }
      reachable.add(targetId);
      queue.push({ id: targetId, depth: current.depth + 1 });
    }
  }

  return reachable;
}
