import { clawPersistentSurface } from "@clawjs/core";
import { V1_AGENT_DATA_SCHEMA_SQL, v1AgentDataSurfaceNodes } from "./v1-data-agent-surfaces.ts";
const v1MainDatabaseId = "claw.database.core";
const v1MainSchemaSource = {
  file: "packages/clawjs/src/v1-data-surface.ts",
  language: "typescript",
} as const;

const connectorControlPlaneMainTables = [
  "connector_providers",
  "connector_external_principals",
  "connector_credential_bindings",
  "connector_capabilities",
  "connector_operations",
  "connector_policies",
  "connector_budgets",
  "connector_network_policies",
  "connector_audit_events",
] as const;

const connectorControlPlaneMainIndexes = [
  "connector_external_principals_provider_idx",
  "connector_credential_bindings_provider_idx",
  "connector_capabilities_domain_idx",
  "connector_operations_provider_idx",
  "connector_operations_support_idx",
  "connector_budgets_scope_idx",
  "connector_network_policies_egress_idx",
  "connector_audit_events_request_idx",
  "connector_audit_events_provider_idx",
] as const;

export const v1MainSchemaSurfaceNodes = [
  clawPersistentSurface.table({
    id: `claw.database.core.table.data_registry`,
    name: "data_registry",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_state`,
    name: "app_state",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_projects`,
    name: "app_projects",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_pinned_threads`,
    name: "app_pinned_threads",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_session_titles`,
    name: "app_session_titles",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_archives`,
    name: "app_archives",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_sidebar_snapshots`,
    name: "app_sidebar_snapshots",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.app_terminal_tabs`,
    name: "app_terminal_tabs",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.signals_verticals`,
    name: "signals_verticals",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.signals_variables`,
    name: "signals_variables",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.signals_sessions`,
    name: "signals_sessions",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.signals_observations`,
    name: "signals_observations",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.knowledge_entities`,
    name: "knowledge_entities",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.knowledge_facts`,
    name: "knowledge_facts",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.pages`,
    name: "pages",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.page_blocks`,
    name: "page_blocks",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.page_links`,
    name: "page_links",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.page_mentions`,
    name: "page_mentions",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.page_revisions`,
    name: "page_revisions",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.page_comments`,
    name: "page_comments",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.profile_projection`,
    name: "profile_projection",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.notes_fts`,
    name: "notes_fts",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.productivity_items`,
    name: "productivity_items",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.business_records`,
    name: "business_records",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.content_items`,
    name: "content_items",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.social_posts`,
    name: "social_posts",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.accounting_entries`,
    name: "accounting_entries",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.accounting_lines`,
    name: "accounting_lines",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.calendar_events`,
    name: "calendar_events",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.iot_config`,
    name: "iot_config",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.finance_records`,
    name: "finance_records",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.marketplace_choices`,
    name: "marketplace_choices",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.resources`,
    name: "resources",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.agents`,
    name: "agents",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.skills`,
    name: "skills",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.skill_collections`,
    name: "skill_collections",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.connections`,
    name: "connections",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  ...connectorControlPlaneMainTables.map((name) => clawPersistentSurface.table({
    id: `claw.database.core.table.${name}`,
    name,
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  })),
  ...v1AgentDataSurfaceNodes,
  clawPersistentSurface.table({
    id: `claw.database.core.table.apps`,
    name: "apps",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.design_resources`,
    name: "design_resources",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.session_index`,
    name: "session_index",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.session_index_fts`,
    name: "session_index_fts",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.data_registry_domain_idx`,
    name: "data_registry_domain_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  ...["app_projects_path_idx", "app_projects_resource_id_idx"].map((name) => clawPersistentSurface.index({
    id: `claw.database.core.index.${name}`, name, parentId: v1MainDatabaseId, databaseId: v1MainDatabaseId, source: v1MainSchemaSource,
  })),
  clawPersistentSurface.index({
    id: `claw.database.core.index.app_sidebar_snapshots_order_idx`,
    name: "app_sidebar_snapshots_order_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  ...connectorControlPlaneMainIndexes.map((name) => clawPersistentSurface.index({
    id: `claw.database.core.index.${name}`,
    name,
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  })),
  clawPersistentSurface.index({
    id: `claw.database.core.index.signals_variables_vertical_idx`,
    name: "signals_variables_vertical_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.signals_observations_variable_time_idx`,
    name: "signals_observations_variable_time_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.signals_observations_vertical_time_idx`,
    name: "signals_observations_vertical_time_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.knowledge_entities_type_idx`,
    name: "knowledge_entities_type_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.knowledge_facts_subject_idx`,
    name: "knowledge_facts_subject_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.knowledge_facts_predicate_idx`,
    name: "knowledge_facts_predicate_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.pages_space_updated_idx`,
    name: "pages_space_updated_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.pages_surface_idx`,
    name: "pages_surface_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.pages_source_record_idx`,
    name: "pages_source_record_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.page_blocks_page_order_idx`,
    name: "page_blocks_page_order_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.page_links_target_idx`,
    name: "page_links_target_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.page_mentions_target_idx`,
    name: "page_mentions_target_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.page_comments_page_idx`,
    name: "page_comments_page_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.profile_projection_section_idx`,
    name: "profile_projection_section_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.productivity_items_kind_status_idx`,
    name: "productivity_items_kind_status_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.business_records_kind_idx`,
    name: "business_records_kind_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.content_items_status_idx`,
    name: "content_items_status_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.social_posts_status_idx`,
    name: "social_posts_status_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.calendar_events_time_idx`,
    name: "calendar_events_time_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.finance_records_time_idx`,
    name: "finance_records_time_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.marketplace_choices_kind_target_idx`,
    name: "marketplace_choices_kind_target_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.iot_config_kind_idx`,
    name: "iot_config_kind_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.resources_domain_kind_idx`,
    name: "resources_domain_kind_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.design_resources_kind_idx`,
    name: "design_resources_kind_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.session_index_source_updated_idx`,
    name: "session_index_source_updated_idx",
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.sessions.table.conversation_sessions`,
    name: "conversation_sessions",
    parentId: "claw.database.sessions",
    databaseId: "claw.database.sessions",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.sessions.table.conversation_messages`,
    name: "conversation_messages",
    parentId: "claw.database.sessions",
    databaseId: "claw.database.sessions",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.sessions.table.conversation_fts`,
    name: "conversation_fts",
    parentId: "claw.database.sessions",
    databaseId: "claw.database.sessions",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.sessions.index.conversation_sessions_source_updated_idx`,
    name: "conversation_sessions_source_updated_idx",
    parentId: "claw.database.sessions",
    databaseId: "claw.database.sessions",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.sessions.index.conversation_messages_session_idx`,
    name: "conversation_messages_session_idx",
    parentId: "claw.database.sessions",
    databaseId: "claw.database.sessions",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.audio.table.audio_items`,
    name: "audio_items",
    parentId: "claw.database.audio",
    databaseId: "claw.database.audio",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.audio.table.audio_fts`,
    name: "audio_fts",
    parentId: "claw.database.audio",
    databaseId: "claw.database.audio",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.audio.index.audio_items_session_idx`,
    name: "audio_items_session_idx",
    parentId: "claw.database.audio",
    databaseId: "claw.database.audio",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.drive.table.drive_items`,
    name: "drive_items",
    parentId: "claw.database.drive",
    databaseId: "claw.database.drive",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.drive.table.drive_fts`,
    name: "drive_fts",
    parentId: "claw.database.drive",
    databaseId: "claw.database.drive",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.drive.index.drive_items_session_idx`,
    name: "drive_items_session_idx",
    parentId: "claw.database.drive",
    databaseId: "claw.database.drive",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.drive.index.drive_items_parent_idx`,
    name: "drive_items_parent_idx",
    parentId: "claw.database.drive",
    databaseId: "claw.database.drive",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.search.table.search_documents`,
    name: "search_documents",
    parentId: "claw.database.search",
    databaseId: "claw.database.search",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.search.table.search_fts`,
    name: "search_fts",
    parentId: "claw.database.search",
    databaseId: "claw.database.search",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.search.index.search_documents_domain_idx`,
    name: "search_documents_domain_idx",
    parentId: "claw.database.search",
    databaseId: "claw.database.search",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.vault.table.connector_raw_trace_refs`,
    name: "connector_raw_trace_refs",
    parentId: "claw.database.vault",
    databaseId: "claw.database.vault",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.vault.index.connector_raw_trace_refs_audit_idx`,
    name: "connector_raw_trace_refs_audit_idx",
    parentId: "claw.database.vault",
    databaseId: "claw.database.vault",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.runtime.table.runtime_jobs`,
    name: "runtime_jobs",
    parentId: "claw.database.runtime",
    databaseId: "claw.database.runtime",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.runtime.table.runtime_events`,
    name: "runtime_events",
    parentId: "claw.database.runtime",
    databaseId: "claw.database.runtime",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.runtime.index.runtime_jobs_status_idx`,
    name: "runtime_jobs_status_idx",
    parentId: "claw.database.runtime",
    databaseId: "claw.database.runtime",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.runtime.index.runtime_events_job_idx`,
    name: "runtime_events_job_idx",
    parentId: "claw.database.runtime",
    databaseId: "claw.database.runtime",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.table({
    id: `claw.database.core.table.operational_events`,
    name: "operational_events",
    parentId: "claw.database.core",
    databaseId: "claw.database.core",
    source: v1MainSchemaSource,
  }),
  clawPersistentSurface.index({
    id: `claw.database.core.index.operational_events_kind_idx`,
    name: "operational_events_kind_idx",
    parentId: "claw.database.core",
    databaseId: "claw.database.core",
    source: v1MainSchemaSource,
  })
];

export const V1_SIDECAR_SCHEMA_SQL_BY_FILE = {
  "vault.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS connector_raw_trace_refs (
        id TEXT PRIMARY KEY,
        audit_event_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        encrypted_payload_ref TEXT NOT NULL,
        key_ref TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS connector_raw_trace_refs_audit_idx
        ON connector_raw_trace_refs(audit_event_id, expires_at);
    `,
  "sessions.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        session_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        artifact_path TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        title TEXT NOT NULL,
        cwd TEXT,
        created_at TEXT,
        updated_at TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        snippet TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        indexed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversation_sessions_source_updated_idx ON conversation_sessions(source, updated_at DESC);
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        turn_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(session_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS conversation_messages_session_idx ON conversation_messages(session_id, turn_index);
      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
        session_id UNINDEXED,
        message_id UNINDEXED,
        title,
        body,
        cwd,
        tokenize='unicode61'
      );
    `,
  "audio.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS audio_items (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        message_id TEXT,
        path TEXT NOT NULL,
        content_type TEXT,
        duration_ms INTEGER,
        size_bytes INTEGER,
        transcript_text TEXT,
        transcript_source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS audio_items_session_idx ON audio_items(session_id, updated_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS audio_fts USING fts5(
        item_id UNINDEXED,
        transcript,
        path,
        tokenize='unicode61'
      );
    `,
  "drive.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS drive_items (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        session_id TEXT,
        message_id TEXT,
        kind TEXT NOT NULL DEFAULT 'file',
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER,
        checksum TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS drive_items_session_idx ON drive_items(session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS drive_items_parent_idx ON drive_items(parent_id, name);
      CREATE VIRTUAL TABLE IF NOT EXISTS drive_fts USING fts5(
        item_id UNINDEXED,
        name,
        path,
        metadata,
        tokenize='unicode61'
      );
    `,
  "search.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS search_documents (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        path TEXT,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS search_documents_domain_idx ON search_documents(domain, updated_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        doc_id UNINDEXED,
        domain UNINDEXED,
        title,
        body,
        path,
        tokenize='unicode61'
      );
    `,
  "runtime.sqlite": String.raw`
      CREATE TABLE IF NOT EXISTS runtime_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        claim_owner TEXT,
        run_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runtime_jobs_status_idx ON runtime_jobs(status, run_at, updated_at DESC);
      CREATE TABLE IF NOT EXISTS runtime_events (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        kind TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS runtime_events_job_idx ON runtime_events(job_id, created_at DESC);
    `,
  "default": String.raw`
    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS operational_events_kind_idx ON operational_events(kind, created_at DESC);
  `
} as const;

export const V1_MAIN_SCHEMA_SQL = String.raw`
    CREATE TABLE IF NOT EXISTS data_registry (
      domain TEXT NOT NULL,
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT 'clawjs-core',
      storage TEXT NOT NULL DEFAULT 'main-db',
      path TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      secret_ref TEXT,
      cache INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (domain, kind, id)
    );
    CREATE INDEX IF NOT EXISTS data_registry_domain_idx ON data_registry(domain, kind);

    CREATE TABLE IF NOT EXISTS app_state (
      profile_id TEXT NOT NULL DEFAULT 'local',
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, key)
    );
    CREATE TABLE IF NOT EXISTS app_projects (
      id TEXT PRIMARY KEY,
      resource_id TEXT,
      name TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER,
      hidden INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS app_projects_path_idx ON app_projects(path);
    CREATE TABLE IF NOT EXISTS app_pinned_threads (
      thread_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      pinned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_session_titles (
      thread_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_archives (
      thread_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_sidebar_snapshots (
      thread_id TEXT PRIMARY KEY,
      chat_uuid TEXT,
      title TEXT NOT NULL,
      cwd TEXT,
      project_path TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS app_sidebar_snapshots_order_idx
      ON app_sidebar_snapshots(pinned DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_terminal_tabs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signals_verticals (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'dev_only',
      sensitive INTEGER NOT NULL DEFAULT 0,
      catalog_version TEXT,
      catalog_source TEXT NOT NULL DEFAULT 'repo',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signals_variables (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value_type TEXT NOT NULL,
      unit_json TEXT,
      category TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      definition_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES signals_verticals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS signals_variables_vertical_idx ON signals_variables(vertical_id);
    CREATE TABLE IF NOT EXISTS signals_sessions (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      title TEXT,
      source TEXT,
      external_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES signals_verticals(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS signals_observations (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      variable_id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      unit_id TEXT,
      recorded_at TEXT NOT NULL,
      source_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      page_id TEXT,
      session_id TEXT,
      external_id TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES signals_verticals(id) ON DELETE CASCADE,
      FOREIGN KEY (variable_id) REFERENCES signals_variables(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS signals_observations_variable_time_idx
      ON signals_observations(variable_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS signals_observations_vertical_time_idx
      ON signals_observations(vertical_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      properties_json TEXT NOT NULL DEFAULT '{}',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL DEFAULT 'manual',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_entities_type_idx ON knowledge_entities(type, label);

    CREATE TABLE IF NOT EXISTS knowledge_facts (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      predicate TEXT NOT NULL,
      object_kind TEXT NOT NULL DEFAULT 'literal',
      object_value_json TEXT NOT NULL,
      confidence REAL,
      scope_json TEXT NOT NULL DEFAULT '{}',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL DEFAULT 'manual',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      supersedes_id TEXT,
      valid_from TEXT,
      valid_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_facts_subject_idx ON knowledge_facts(subject_id, predicate);
    CREATE INDEX IF NOT EXISTS knowledge_facts_predicate_idx ON knowledge_facts(predicate);

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

    CREATE TABLE IF NOT EXISTS profile_projection (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      content_text TEXT NOT NULL,
      source_fact_ids_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL,
      scope_json TEXT NOT NULL DEFAULT '{}',
      refreshed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profile_projection_section_idx ON profile_projection(section);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      page_id UNINDEXED,
      title,
      body,
      tags,
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS productivity_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      due_at TEXT,
      anchor_type TEXT,
      anchor_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS productivity_items_kind_status_idx ON productivity_items(kind, status, due_at);

    CREATE TABLE IF NOT EXISTS business_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS business_records_kind_idx ON business_records(kind, status, name);

    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'entry',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      brand_id TEXT,
      campaign_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_items_status_idx ON content_items(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      channel_json TEXT NOT NULL DEFAULT '{}',
      scheduled_at TEXT,
      published_at TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_posts_status_idx ON social_posts(status, scheduled_at, updated_at DESC);

    CREATE TABLE IF NOT EXISTS accounting_entries (
      id TEXT PRIMARY KEY,
      entity_id TEXT,
      period_id TEXT,
      entry_date TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounting_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      account_code TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('debit','credit')),
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (entry_id) REFERENCES accounting_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      calendar_id TEXT,
      source TEXT NOT NULL DEFAULT 'clawjs',
      external_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calendar_events_time_idx ON calendar_events(starts_at, ends_at);

    CREATE TABLE IF NOT EXISTS iot_config (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      config_json TEXT NOT NULL DEFAULT '{}',
      secret_ref TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'transaction',
      account_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      occurred_at TEXT NOT NULL,
      merchant TEXT,
      category TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS finance_records_time_idx ON finance_records(occurred_at DESC, kind);

    CREATE TABLE IF NOT EXISTS marketplace_choices (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      choice TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rationale TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS marketplace_choices_kind_target_idx ON marketplace_choices(kind, target);
    CREATE INDEX IF NOT EXISTS iot_config_kind_idx ON iot_config(kind, parent_id);

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      path TEXT,
      content_type TEXT,
      size_bytes INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS resources_domain_kind_idx ON resources(domain, kind);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'agent',
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      agency_mode TEXT NOT NULL DEFAULT 'assistant',
      role TEXT NOT NULL DEFAULT '',
      title TEXT,
      description TEXT,
      owner_kind TEXT,
      owner_id TEXT,
      workspace_id TEXT,
      project_id TEXT,
      runtime TEXT,
      model TEXT,
      autonomy_profile TEXT NOT NULL DEFAULT 'respond_only',
      default_execution_profile_id TEXT,
      default_memory_policy_id TEXT,
      default_budget_id TEXT,
      builtin INTEGER NOT NULL DEFAULT 0,
      secret_ref TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      retired_at TEXT,
      retirement_snapshot_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      scope_json TEXT NOT NULL DEFAULT '{}',
      secret_refs_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      skills_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      secret_ref TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connector_providers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      trust_tier TEXT NOT NULL DEFAULT 'external_saas',
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connector_external_principals (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      display_name TEXT NOT NULL,
      external_id TEXT,
      parent_principal_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES connector_providers(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_principal_id) REFERENCES connector_external_principals(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS connector_external_principals_provider_idx
      ON connector_external_principals(provider_id, kind);
    CREATE TABLE IF NOT EXISTS connector_credential_bindings (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      principal_id TEXT,
      secret_ref TEXT NOT NULL,
      credential_kind TEXT NOT NULL DEFAULT 'api_key',
      scopes_json TEXT NOT NULL DEFAULT '[]',
      capability_ids_json TEXT NOT NULL DEFAULT '[]',
      operation_ids_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES connector_providers(id) ON DELETE CASCADE,
      FOREIGN KEY (principal_id) REFERENCES connector_external_principals(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS connector_credential_bindings_provider_idx
      ON connector_credential_bindings(provider_id, principal_id, enabled);
    CREATE TABLE IF NOT EXISTS connector_capabilities (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      action TEXT NOT NULL,
      facet TEXT NOT NULL DEFAULT 'default',
      summary TEXT NOT NULL,
      risk_tiers_json TEXT NOT NULL DEFAULT '[]',
      data_classes_json TEXT NOT NULL DEFAULT '[]',
      required_scopes_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS connector_capabilities_domain_idx
      ON connector_capabilities(domain, action, facet);
    CREATE TABLE IF NOT EXISTS connector_operations (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      support TEXT NOT NULL DEFAULT 'external_pending',
      native_name TEXT,
      capability_ids_json TEXT NOT NULL DEFAULT '[]',
      risk_tiers_json TEXT NOT NULL DEFAULT '[]',
      credential_required INTEGER NOT NULL DEFAULT 1,
      cost_risk TEXT NOT NULL DEFAULT 'unknown',
      requires_approval INTEGER NOT NULL DEFAULT 1,
      network_policy_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES connector_providers(id) ON DELETE CASCADE,
      FOREIGN KEY (network_policy_id) REFERENCES connector_network_policies(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS connector_operations_provider_idx
      ON connector_operations(provider_id, runtime_kind);
    CREATE INDEX IF NOT EXISTS connector_operations_support_idx
      ON connector_operations(support, provider_id);
    CREATE TABLE IF NOT EXISTS connector_policies (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      default_effect TEXT NOT NULL DEFAULT 'deny',
      require_context INTEGER NOT NULL DEFAULT 1,
      block_unsupported INTEGER NOT NULL DEFAULT 1,
      block_missing_credential_binding INTEGER NOT NULL DEFAULT 1,
      trace_mode TEXT NOT NULL DEFAULT 'redacted',
      rules_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connector_budgets (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      operation_id TEXT,
      capability_id TEXT,
      unit TEXT NOT NULL,
      window TEXT NOT NULL,
      limit_value REAL NOT NULL,
      used_value REAL NOT NULL DEFAULT 0,
      unknown_cost_behavior TEXT NOT NULL DEFAULT 'block',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES connector_providers(id) ON DELETE CASCADE,
      FOREIGN KEY (operation_id) REFERENCES connector_operations(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES connector_capabilities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS connector_budgets_scope_idx
      ON connector_budgets(provider_id, operation_id, capability_id, unit, window);
    CREATE TABLE IF NOT EXISTS connector_network_policies (
      id TEXT PRIMARY KEY,
      required INTEGER NOT NULL DEFAULT 0,
      egress_profile_id TEXT,
      vpn_profile_id TEXT,
      proxy_profile_id TEXT,
      allowed_hosts_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS connector_network_policies_egress_idx
      ON connector_network_policies(egress_profile_id, vpn_profile_id, proxy_profile_id);
    CREATE TABLE IF NOT EXISTS connector_audit_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      actor_id TEXT,
      provider_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      capability_id TEXT,
      credential_binding_id TEXT,
      decision TEXT NOT NULL,
      reason_codes_json TEXT NOT NULL DEFAULT '[]',
      trace_mode TEXT NOT NULL DEFAULT 'redacted',
      raw_trace_ref TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES connector_providers(id) ON DELETE CASCADE,
      FOREIGN KEY (operation_id) REFERENCES connector_operations(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES connector_capabilities(id) ON DELETE SET NULL,
      FOREIGN KEY (credential_binding_id) REFERENCES connector_credential_bindings(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS connector_audit_events_request_idx
      ON connector_audit_events(request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS connector_audit_events_provider_idx
      ON connector_audit_events(provider_id, operation_id, created_at DESC);
${V1_AGENT_DATA_SCHEMA_SQL}

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      root_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      created_by_chat_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS design_resources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      root_path TEXT,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS design_resources_kind_idx ON design_resources(kind);

    CREATE TABLE IF NOT EXISTS session_index (
      session_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      title TEXT NOT NULL,
      cwd TEXT,
      created_at TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      indexed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_index_source_updated_idx
      ON session_index(source, updated_at DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS session_index_fts USING fts5(
      session_id UNINDEXED,
      title,
      snippet,
      cwd
    );
  `;
