export type ScalarType = "string" | "number" | "boolean" | "date" | "string[]";

export type RelationCardinality = "one" | "many" | "at_least_one";

export interface AttributeDefinition {
  type: ScalarType;
  required?: boolean;
  enum?: string[];
  description?: string;
}

export interface RelationDefinition {
  targets: string[];
  cardinality?: RelationCardinality;
  inverse?: string;
  description?: string;
  metadata?: Record<string, AttributeDefinition>;
}

export interface TypeKindDefinition {
  id: string;
  description?: string;
}

export interface EntityTypeDefinition {
  id: string;
  kindId: string;
  description?: string;
  attributes?: Record<string, AttributeDefinition>;
  relations?: Record<string, RelationDefinition>;
}

export interface MemoryTypeDefinition {
  id: string;
  kindId: string;
  description?: string;
  attributes?: Record<string, AttributeDefinition>;
  relations?: Record<string, RelationDefinition>;
}

export interface SchemaDocument {
  version: number;
  entityKinds: TypeKindDefinition[];
  memoryKinds: TypeKindDefinition[];
  entityTypes: EntityTypeDefinition[];
  memoryTypes: MemoryTypeDefinition[];
}

export type NoteKind = "entity" | "memory";
export type MemoryClass = "semantic" | "episodic" | "procedural" | "archival";

export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue =
  | FrontmatterScalar
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

export type FrontmatterMap = Record<string, FrontmatterValue>;

export interface ParsedNote {
  path: string;
  rawContent: string;
  fingerprint: string;
  id: string;
  slug: string | null;
  schemaVersion: number | null;
  kind: NoteKind;
  type: string;
  title: string;
  frontmatter: FrontmatterMap;
  body: string;
}

export interface LoadedSchema {
  version: number;
  hash: string;
  entityKinds: Map<string, TypeKindDefinition>;
  memoryKinds: Map<string, TypeKindDefinition>;
  entityTypes: Map<string, EntityTypeDefinition>;
  memoryTypes: Map<string, MemoryTypeDefinition>;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  requiresMigration: boolean;
  notes: ParsedNote[];
  schema: LoadedSchema;
}

export interface WorkspacePaths {
  root: string;
  memoryDir: string;
  configPath: string;
  schemaDir: string;
  notesDir: string;
  entitiesDir: string;
  memoriesDir: string;
  capturesDir: string;
  indexDbPath: string;
}

export interface AppConfig {
  version: 3;
  format: "markdown-first";
  activeMemory?: {
    enabled?: boolean;
    maxResults?: number;
    maxSummaryChars?: number;
    minScore?: number;
    semanticSearch?: boolean;
  };
}
