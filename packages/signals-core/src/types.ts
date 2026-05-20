export type Source =
  | "manual"
  | "healthkit"
  | "import"
  | "agent"
  | "external_api"
  | "device";

export const SOURCES: readonly Source[] = [
  "manual",
  "healthkit",
  "import",
  "agent",
  "external_api",
  "device",
];

export type ValueType =
  | "numeric"
  | "boolean"
  | "enum"
  | "duration"
  | "text"
  | "geo"
  | "photo"
  | "currency";

export const VALUE_TYPES: readonly ValueType[] = [
  "numeric",
  "boolean",
  "enum",
  "duration",
  "text",
  "geo",
  "photo",
  "currency",
];

export type CatalogOrigin = "system" | "user";

export interface Unit {
  id: string;
  label: string;
  group?: string;
}

export interface ValidRange {
  min?: number;
  max?: number;
}

export interface CatalogEntry {
  id: string;
  domain: string;
  label: string;
  unit: Unit;
  valueType: ValueType;
  validRange?: ValidRange;
  enumValues?: string[];
  category?: string;
  healthkitTypeId?: string;
  description?: string;
  origin: CatalogOrigin;
  hidden?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type GeoValue = { lat: number; lng: number; accuracy?: number };
export type PhotoValue = { photoRef: string; thumbRef?: string | null };

export type ObservationValue =
  | number
  | boolean
  | string
  | GeoValue
  | PhotoValue;

export interface Observation {
  id: string;
  variableId: string;
  value: ObservationValue;
  unitId: string;
  recordedAt: number;
  source: Source;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  sessionId?: string | null;
  externalId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  domain: string;
  type: string;
  startedAt: number;
  endedAt?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export type RegistryStatus = "stable" | "dev_only" | "removed";

export const REGISTRY_STATUSES: readonly RegistryStatus[] = [
  "stable",
  "dev_only",
  "removed",
];

export type RegistryCategory =
  | "body-health"
  | "mind-emotions"
  | "time-productivity"
  | "creative-output"
  | "consumption-leisure"
  | "relations-social"
  | "world-places"
  | "possessions-identity"
  | "career-money"
  | "meta-reflection";

export const REGISTRY_CATEGORIES: readonly RegistryCategory[] = [
  "body-health",
  "mind-emotions",
  "time-productivity",
  "creative-output",
  "consumption-leisure",
  "relations-social",
  "world-places",
  "possessions-identity",
  "career-money",
  "meta-reflection",
];

export interface RegistryEntry {
  id: string;
  label: string;
  category: RegistryCategory;
  description: string;
  catalogSize: number;
  hasSessions: boolean;
  healthkitMapping: boolean;
  sensitive: boolean;
  status: RegistryStatus;
  catalogPackage: "@clawjs/signals";
  catalogPath: string;
  iconHint?: string;
}

export interface RegistryCategoryProjection {
  id: RegistryCategory;
  label: string;
}

export interface RegistryProjectionSource {
  type: "clawjs.tracking-registry";
  path: "tracking-registry.json";
  schemaVersion: number;
  generatedAt?: string;
  checksum: string;
}

export interface RegistryProjectionService {
  id: "signals";
  port: number;
  basePath: "/v1";
  verticalRouteTemplate: "/v1/{verticalId}";
}

export interface RegistryProjectionEntry {
  id: string;
  label: string;
  category: RegistryCategory;
  description: string;
  catalogSize: number;
  hasSessions: boolean;
  healthkitMapping: boolean;
  sensitive: boolean;
  status: RegistryStatus;
  iconHint?: string;
}

export interface RegistryProjection {
  schemaVersion: 1;
  projectionVersion: "signals-registry.v1";
  source: RegistryProjectionSource;
  service: RegistryProjectionService;
  categories: RegistryCategoryProjection[];
  entries: RegistryProjectionEntry[];
}

export interface UpsertCatalogInput {
  id: string;
  label: string;
  unit: Unit;
  valueType: ValueType;
  validRange?: ValidRange | null;
  enumValues?: string[] | null;
  category?: string | null;
  healthkitTypeId?: string | null;
  description?: string | null;
}

export interface UpsertObservationInput {
  id?: string;
  variableId: string;
  value: ObservationValue;
  unitId?: string;
  recordedAt?: number;
  source?: Source;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  sessionId?: string | null;
  externalId?: string | null;
}

export interface UpsertSessionInput {
  id?: string;
  type: string;
  startedAt?: number;
  endedAt?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ObservationQuery {
  variableId?: string;
  from?: number;
  to?: number;
  source?: Source;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface StatsBucket {
  bucket: number;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50?: number;
  p95?: number;
}

export interface StatsResult {
  variableId: string;
  from: number;
  to: number;
  period: "raw" | "hour" | "day" | "week" | "month" | "year";
  buckets: StatsBucket[];
}

export interface HealthKitAnchor {
  variableId: string;
  anchorBlob: string;
  lastSyncedAt: number;
}
