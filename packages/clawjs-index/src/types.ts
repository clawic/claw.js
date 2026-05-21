export interface JsonSchemaField {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  description?: string;
  enum?: string[];
  items?: JsonSchemaField;
  properties?: Record<string, JsonSchemaField>;
  required?: string[];
  timeseries?: boolean;
  format?: string;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaField>;
  required?: string[];
}

export interface UiHints {
  icon?: string;
  accentColor?: string;
  cardKind?: "media" | "text" | "data";
  listColumns?: string[];
}

export interface EntityType {
  id: string;
  name: string;
  version: number;
  schemaJson: JsonSchema;
  uiHints?: UiHints;
  identityFields: string[];
  timeseriesFields: string[];
  canonical: boolean;
  createdAt: string;
}

export interface EntityRow {
  id: string;
  typeId: string;
  typeName: string;
  identityKey: string;
  data: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;
  sourceUrl?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
}

export interface EntityQueryPage {
  entities: EntityRow[];
  nextCursor?: string | null;
}

export interface ObservationRow {
  id: string;
  entityId: string;
  runId?: string | null;
  sourceUrl?: string | null;
  observedAt: string;
  snapshot: Record<string, unknown>;
  changedFields: string[];
  agentSessionId?: string | null;
}

export interface FieldHistoryPoint {
  fieldPath: string;
  value: unknown;
  validFrom: string;
  runId?: string | null;
}

export interface SearchRow {
  id: string;
  name: string;
  typeId?: string | null;
  criteria: Record<string, unknown>;
  promptTemplate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlertRuleKind =
  | "field_decrease"
  | "field_increase"
  | "new_entity"
  | "field_match"
  | "rating_drop"
  | "absence";

export interface AlertRule {
  id: string;
  when: AlertRuleKind;
  field?: string;
  thresholdPct?: number;
  thresholdAbs?: number;
  match?: unknown;
}

export interface MonitorRow {
  id: string;
  searchId: string;
  name?: string | null;
  cronExpr: string;
  enabled: boolean;
  lastFireAt?: string | null;
  nextFireAt?: string | null;
  alertRules: AlertRule[];
  muteUntil?: string | null;
  createdAt: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";

export interface RunRow {
  id: string;
  monitorId?: string | null;
  searchId?: string | null;
  kind: "manual" | "monitor";
  status: RunStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  codexSessionId?: string | null;
  error?: string | null;
  entitiesSeen: number;
  observationsCount: number;
  alertsFired: number;
  tokensIn?: number | null;
  tokensOut?: number | null;
  prompt?: string | null;
  log?: unknown;
  createdAt: string;
}

export interface AlertRow {
  id: string;
  monitorId?: string | null;
  runId?: string | null;
  entityId?: string | null;
  ruleId: string;
  ruleKind: AlertRuleKind;
  ts: string;
  payload: Record<string, unknown>;
  ackAt?: string | null;
}

export interface TagRow {
  id: string;
  name: string;
  color?: string | null;
  createdAt: string;
}

export interface CollectionRow {
  id: string;
  name: string;
  description?: string | null;
  kind: "manual" | "smart";
  criteria?: Record<string, unknown> | null;
  createdAt: string;
  memberCount: number;
}

export interface RelationRow {
  id: number;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  attrs?: Record<string, unknown> | null;
  createdAt: string;
}

export type IndexEvent =
  | { kind: "entity_upserted"; entity: EntityRow; isNew: boolean; changedFields: string[] }
  | { kind: "run_started"; run: RunRow }
  | { kind: "run_ended"; run: RunRow }
  | { kind: "alert_fired"; alert: AlertRow }
  | { kind: "type_declared"; type: EntityType }
  | { kind: "search_changed"; search: SearchRow }
  | { kind: "monitor_changed"; monitor: MonitorRow };

export interface DeviceTokenRow {
  id: string;
  platform: "macos" | "ios";
  token: string;
  label?: string | null;
  lastSeenAt: string;
}
