import fs from "node:fs";

import { MemoryError } from "./errors";
import type {
  AttributeDefinition,
  EntityTypeDefinition,
  FrontmatterValue,
  LoadedSchema,
  MemoryTypeDefinition,
  NoteKind,
  ParsedNote,
  RelationCardinality,
  RelationDefinition,
} from "./types";
import { hashString, normalizeIdentity, normalizeReference, parseFrontmatterDocument } from "./utils";

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

export function parseNoteFile(filePath: string): ParsedNote {
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

export function validateNoteShape(
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
    "lastSeen",
    "createdBy",
    "lastEditedBy",
    "lastEditedAt",
    "originalBody",
    "embeddingStale"
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

export function validateRelationTargets(
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

export function getTypeDefinition(
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

export function collectResolvedRelations(notes: ParsedNote[], schema: LoadedSchema): ResolvedRelation[] {
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

export function buildIdentityIndex(notes: ParsedNote[]): IdentityIndex {
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

export function collectIdentityIssues(identityIndex: IdentityIndex, schema: LoadedSchema): string[] {
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

export function matchesWhere(note: ParsedNote, where: Record<string, string> | undefined): boolean {
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

export function matchesText(note: ParsedNote, text: string | undefined): boolean {
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

export function getSemanticKind(note: ParsedNote, schema: LoadedSchema): string {
  const definition = getTypeDefinition(note, schema);
  return definition.kindId;
}

export function readAliases(note: ParsedNote): string[] {
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

export function defaultAttributeValue(definition: AttributeDefinition): FrontmatterValue {
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

export function placeholderTargetId(type: string): string {
  return `${type}_id`;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildPreferredKeyOrder(definition: EntityTypeDefinition | MemoryTypeDefinition): string[] {
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

export function buildSavedMemoryKeyOrder(): string[] {
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

export function toMessage(error: unknown): string {
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

export function groupRelationsByOrigin(relations: ResolvedRelation[]): Map<string, ResolvedRelation[]> {
  const grouped = new Map<string, ResolvedRelation[]>();
  for (const relation of relations) {
    const next = grouped.get(relation.originId) ?? [];
    next.push(relation);
    grouped.set(relation.originId, next);
  }
  return grouped;
}
