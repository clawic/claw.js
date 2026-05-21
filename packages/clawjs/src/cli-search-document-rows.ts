export interface DatabaseRecordRow {
  namespace_id: string;
  collection_name: string;
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}
export interface FinanceRecordTableRow {
  id: string;
  kind: string;
  account_id: string | null;
  amount: number | null;
  currency: string | null;
  occurred_at: string | null;
  merchant: string | null;
  category: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface NotesPageRow {
  id: string;
  title: string;
  space: string;
  surface: string;
  owner_id: string | null;
  author_kind: string;
  author_id: string | null;
  visibility: string;
  sensitivity: string;
  tags_json: string;
  properties_json: string;
  source_record_domain: string | null;
  source_record_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface NotesPageBlockRow {
  id: string;
  page_id: string;
  parent_block_id: string | null;
  sort_order: number;
  kind: string;
  content_json: string;
  text: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface KnowledgeEntityRow {
  id: string;
  type: string;
  label: string;
  description: string | null;
  properties_json: string;
  sensitivity: string;
  source: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}
export interface KnowledgeFactRow {
  id: string;
  subject_id: string | null;
  predicate: string;
  object_kind: string;
  object_value_json: string;
  confidence: number | null;
  scope_json: string;
  sensitivity: string;
  source: string;
  provenance_json: string;
  supersedes_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}
export interface SignalsVerticalRow {
  id: string;
  label: string;
  category: string | null;
  description: string | null;
  status: string;
  sensitive: number;
  catalog_version: string | null;
  catalog_source: string;
  metadata_json: string;
  synced_at: string;
}
export interface SignalsVariableRow {
  id: string;
  vertical_id: string;
  label: string;
  value_type: string;
  unit_json: string | null;
  category: string | null;
  sensitive: number;
  definition_json: string;
  updated_at: string;
}
export interface SignalsObservationRow {
  id: string;
  vertical_id: string;
  variable_id: string;
  value_json: string;
  unit_id: string | null;
  recorded_at: string;
  source_json: string;
  notes: string | null;
  page_id: string | null;
  session_id: string | null;
  external_id: string | null;
  sensitive: number;
  created_at: string;
  updated_at: string;
}
export interface CalendarEventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  calendar_id: string | null;
  source: string;
  external_id: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface TemporalCalendarEventRow {
  id: string;
  title: string;
  status: string;
  workspace_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  source_provider: string | null;
  starts_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  payload: string;
}
export interface RuntimeJobRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  claim_owner: string | null;
  run_at: string | null;
  attempts: number;
  payload_json: string;
  created_at: string;
  updated_at: string;
}
export interface RuntimeEventRow {
  id: string;
  job_id: string | null;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}
export interface OperationalEventRow {
  id: string;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}
export interface AppCatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  root_path: string | null;
  manifest_json: string;
  permissions_json: string;
  pinned: number;
  last_opened_at: string | null;
  created_by_chat_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface DesignResourceRow {
  id: string;
  kind: string;
  name: string;
  root_path: string | null;
  manifest_json: string;
  builtin: number;
  created_at: string;
  updated_at: string;
}
export interface SkillRegistryRow {
  id: string;
  slug: string;
  kind: string;
  name: string;
  body: string;
  scope_json: string;
  secret_refs_json: string;
  metadata_json: string;
  export_path: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProviderRoutingRow {
  id: string;
  feature: string;
  capability: string;
  provider: string;
  model: string | null;
  account_ref: string | null;
  policy_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ProviderSettingRow {
  id: string;
  provider: string;
  enabled: number;
  policy_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface SnippetLibraryRow {
  id: string;
  slug: string;
  kind: string;
  title: string;
  body: string;
  shortcut: string | null;
  scope_json: string;
  skill_refs_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogAgentRow {
  id: string;
  kind: string;
  name: string;
  status: string;
  agency_mode: string;
  role: string;
  title: string | null;
  description: string | null;
  owner_kind: string | null;
  owner_id: string | null;
  workspace_id: string | null;
  project_id: string | null;
  runtime: string | null;
  model: string | null;
  autonomy_profile: string;
  builtin: number;
  secret_ref: string | null;
  config_json: string;
  export_path: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogPersonalityRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogSkillCollectionRow {
  id: string;
  name: string;
  description: string | null;
  skills_json: string;
  metadata_json: string;
  export_path: string | null;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogConnectionRow {
  id: string;
  provider: string;
  label: string;
  secret_ref: string | null;
  config_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface MarketplaceChoiceRow {
  id: string;
  kind: string;
  target: string;
  choice: string;
  status: string;
  rationale: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ContentItemRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  brand_id: string | null;
  campaign_id: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface SocialPostRow {
  id: string;
  title: string;
  status: string;
  channel_json: string;
  scheduled_at: string | null;
  published_at: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface IotConfigRow {
  id: string;
  kind: string;
  name: string;
  parent_id: string | null;
  status: string;
  config_json: string;
  secret_ref: string | null;
  enabled: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ConnectorOperationRow {
  id: string;
  provider_id: string;
  runtime_kind: string;
  support: string;
  native_name: string | null;
  capability_ids_json: string;
  risk_tiers_json: string;
  credential_required: number;
  cost_risk: string;
  requires_approval: number;
  network_policy_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  provider_display_name: string | null;
  provider_trust_tier: string | null;
  provider_enabled: number | null;
}
export interface ConnectorCapabilityRow {
  id: string;
  domain: string;
  action: string;
  facet: string;
  summary: string;
}
