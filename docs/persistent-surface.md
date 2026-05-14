# Claw persistent surface

Generated from `claw inspect render --format markdown`. Do not edit by hand.
Use `claw inspect --manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]` to fuse static manifests from other language builders during inspection.

## Tree

```mermaid
flowchart TD
  claw_global["Claw global home\nroot"]
  claw_workspace["Claw workspace state\nroot"]
  clawix_home["Clawix host home\nroot"]
  claw_database_core["Framework main database\ndatabase"]
  claw_global --> claw_database_core
  claw_database_legacy_productivity["Legacy productivity workspace database\nsidecar"]
  claw_workspace --> claw_database_legacy_productivity
  claw_database_core_table_workspace_records["workspace_records\ntable"]
  claw_database_core --> claw_database_core_table_workspace_records
  claw_database_core_table_workspace_records_column_collection_name["collection_name\ncolumn"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_column_collection_name
  claw_database_core_table_workspace_records_column_record_id["record_id\ncolumn"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_column_record_id
  claw_database_core_table_workspace_records_column_payload_json["payload_json\ncolumn"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_column_payload_json
  claw_database_core_table_workspace_records_column_updated_at["updated_at\ncolumn"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_column_updated_at
  claw_database_core_table_workspace_records_column_archived_at["archived_at\ncolumn"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_column_archived_at
  claw_database_core_table_workspace_records_index_workspace_records_collection_updated_idx["workspace_records_collection_updated_idx\nindex"]
  claw_database_core_table_workspace_records --> claw_database_core_table_workspace_records_index_workspace_records_collection_updated_idx
  claw_database_core_table_workspace_meta["workspace_meta\ntable"]
  claw_database_core --> claw_database_core_table_workspace_meta
  claw_database_core_table_workspace_meta_column_meta_key["meta_key\ncolumn"]
  claw_database_core_table_workspace_meta --> claw_database_core_table_workspace_meta_column_meta_key
  claw_database_core_table_workspace_meta_column_meta_value["meta_value\ncolumn"]
  claw_database_core_table_workspace_meta --> claw_database_core_table_workspace_meta_column_meta_value
  claw_database_runtime["Runtime sidecar database\nsidecar"]
  claw_global --> claw_database_runtime
  claw_database_sessions["Sessions sidecar database\nsidecar"]
  claw_global --> claw_database_sessions
  claw_database_audio["Audio sidecar database\nsidecar"]
  claw_global --> claw_database_audio
  claw_database_search["Search sidecar database\nsidecar"]
  claw_global --> claw_database_search
  claw_database_notify["Notify sidecar database\nsidecar"]
  claw_global --> claw_database_notify
  claw_database_feed["Feed sidecar database\nsidecar"]
  claw_global --> claw_database_feed
  claw_database_monitor["Monitor sidecar database\nsidecar"]
  claw_global --> claw_database_monitor
  claw_workspace_manifest["Workspace manifest\nfile"]
  claw_workspace --> claw_workspace_manifest
  claw_workspace_desiredState["desiredState\nfolder"]
  claw_workspace --> claw_workspace_desiredState
  claw_workspace_projections["projections\nfolder"]
  claw_workspace --> claw_workspace_projections
  claw_workspace_sessions["sessions\nfolder"]
  claw_workspace --> claw_workspace_sessions
  claw_workspace_audit["audit\nfolder"]
  claw_workspace --> claw_workspace_audit
  claw_workspace_locks["locks\nfolder"]
  claw_workspace --> claw_workspace_locks
  claw_workspace_backups["backups\nfolder"]
  claw_workspace --> claw_workspace_backups
  claw_workspace_browser["browser\nfolder"]
  claw_workspace --> claw_workspace_browser
  claw_workspace_styles["styles\nfolder"]
  claw_workspace --> claw_workspace_styles
  claw_workspace_templates["templates\nfolder"]
  claw_workspace --> claw_workspace_templates
  claw_workspace_references["references\nfolder"]
  claw_workspace --> claw_workspace_references
  claw_workspace_slides["slides\nfolder"]
  claw_workspace --> claw_workspace_slides
  claw_workspace_dashboard_database["dashboard-database\nfolder"]
  claw_workspace --> claw_workspace_dashboard_database
  claw_workspace_channel_run["channel run state\nfolder"]
  claw_workspace --> claw_workspace_channel_run
  claw_workspace_telegram_codex_bridge_state["telegram-codex bridge state\nfile"]
  claw_workspace --> claw_workspace_telegram_codex_bridge_state
  claw_workspace_channel_runs_state["channel-runs state\nfile"]
  claw_workspace --> claw_workspace_channel_runs_state
  claw_workspace_observedState["observed state\nfolder"]
  claw_workspace --> claw_workspace_observedState
  claw_workspace_projections["projections\nfolder"]
  claw_workspace --> claw_workspace_projections
  claw_workspace_sessions["sessions\nfolder"]
  claw_workspace --> claw_workspace_sessions
  claw_workspace_audit["audit\nfolder"]
  claw_workspace --> claw_workspace_audit
  claw_workspace_backups["backups\nfolder"]
  claw_workspace --> claw_workspace_backups
  claw_workspace_locks["locks\nfolder"]
  claw_workspace --> claw_workspace_locks
  claw_workspace_intents["intents\nfolder"]
  claw_workspace --> claw_workspace_intents
  claw_workspace_compat["compat\nfolder"]
  claw_workspace --> claw_workspace_compat
  claw_workspace_documents["documents\nfolder"]
  claw_workspace --> claw_workspace_documents
  claw_workspace_data["data\nfolder"]
  claw_workspace --> claw_workspace_data
  claw_workspace_generations_tmp["generation temp assets\npersistentTemp"]
  claw_workspace --> claw_workspace_generations_tmp
  claw_global_config["config\nfolder"]
  claw_global --> claw_global_config
  claw_global_data["data\nfolder"]
  claw_global --> claw_global_data
  claw_global_state["state\nfolder"]
  claw_global --> claw_global_state
  claw_global_cache["cache\nfolder"]
  claw_global --> claw_global_cache
  claw_global_logs["logs\nfolder"]
  claw_global --> claw_global_logs
  claw_global_run["run\nfolder"]
  claw_global --> claw_global_run
  claw_global_tmp["tmp\nfolder"]
  claw_global --> claw_global_tmp
  claw_global_skills["skills\nfolder"]
  claw_global --> claw_global_skills
  claw_global_library["library\nfolder"]
  claw_global --> claw_global_library
  claw_global_rules["rules\nfolder"]
  claw_global --> claw_global_rules
  claw_global_image_library["image_library\nfolder"]
  claw_global --> claw_global_image_library
  claw_global_runtime_home["runtime_home\nfolder"]
  claw_global --> claw_global_runtime_home
  claw_global_demo_home["demo_home\nfolder"]
  claw_global --> claw_global_demo_home
  clawix_home_data["data\nfolder"]
  clawix_home --> clawix_home_data
  clawix_home_state["state\nfolder"]
  clawix_home --> clawix_home_state
  clawix_home_cache["cache\nfolder"]
  clawix_home --> clawix_home_cache
  clawix_home_logs["logs\nfolder"]
  clawix_home --> clawix_home_logs
  clawix_home_run["run\nfolder"]
  clawix_home --> clawix_home_run
  clawix_home_tmp["tmp\nfolder"]
  clawix_home --> clawix_home_tmp
  clawix_home_bridgeSocket["bridgeSocket\nsocket"]
  clawix_home --> clawix_home_bridgeSocket
  claw_external_codex["Codex home\nexternalReadOnlySource"]
  claw_legacy_workspace_clawjs["Legacy pre-public workspace root\nlegacyPath"]
  claw_database_core_table_data_registry["data_registry\ntable"]
  claw_database_core --> claw_database_core_table_data_registry
  claw_database_core_table_app_state["app_state\ntable"]
  claw_database_core --> claw_database_core_table_app_state
  claw_database_core_table_app_projects["app_projects\ntable"]
  claw_database_core --> claw_database_core_table_app_projects
  claw_database_core_table_app_pinned_threads["app_pinned_threads\ntable"]
  claw_database_core --> claw_database_core_table_app_pinned_threads
  claw_database_core_table_app_session_titles["app_session_titles\ntable"]
  claw_database_core --> claw_database_core_table_app_session_titles
  claw_database_core_table_app_archives["app_archives\ntable"]
  claw_database_core --> claw_database_core_table_app_archives
  claw_database_core_table_app_sidebar_snapshots["app_sidebar_snapshots\ntable"]
  claw_database_core --> claw_database_core_table_app_sidebar_snapshots
  claw_database_core_table_app_terminal_tabs["app_terminal_tabs\ntable"]
  claw_database_core --> claw_database_core_table_app_terminal_tabs
  claw_database_core_table_signals_verticals["signals_verticals\ntable"]
  claw_database_core --> claw_database_core_table_signals_verticals
  claw_database_core_table_signals_variables["signals_variables\ntable"]
  claw_database_core --> claw_database_core_table_signals_variables
  claw_database_core_table_signals_sessions["signals_sessions\ntable"]
  claw_database_core --> claw_database_core_table_signals_sessions
  claw_database_core_table_signals_observations["signals_observations\ntable"]
  claw_database_core --> claw_database_core_table_signals_observations
  claw_database_core_table_knowledge_entities["knowledge_entities\ntable"]
  claw_database_core --> claw_database_core_table_knowledge_entities
  claw_database_core_table_knowledge_facts["knowledge_facts\ntable"]
  claw_database_core --> claw_database_core_table_knowledge_facts
  claw_database_core_table_pages["pages\ntable"]
  claw_database_core --> claw_database_core_table_pages
  claw_database_core_table_page_blocks["page_blocks\ntable"]
  claw_database_core --> claw_database_core_table_page_blocks
  claw_database_core_table_page_links["page_links\ntable"]
  claw_database_core --> claw_database_core_table_page_links
  claw_database_core_table_page_mentions["page_mentions\ntable"]
  claw_database_core --> claw_database_core_table_page_mentions
  claw_database_core_table_page_revisions["page_revisions\ntable"]
  claw_database_core --> claw_database_core_table_page_revisions
  claw_database_core_table_page_comments["page_comments\ntable"]
  claw_database_core --> claw_database_core_table_page_comments
  claw_database_core_table_profile_projection["profile_projection\ntable"]
  claw_database_core --> claw_database_core_table_profile_projection
  claw_database_core_table_notes_fts["notes_fts\ntable"]
  claw_database_core --> claw_database_core_table_notes_fts
  claw_database_core_table_productivity_items["productivity_items\ntable"]
  claw_database_core --> claw_database_core_table_productivity_items
  claw_database_core_table_business_records["business_records\ntable"]
  claw_database_core --> claw_database_core_table_business_records
  claw_database_core_table_content_items["content_items\ntable"]
  claw_database_core --> claw_database_core_table_content_items
  claw_database_core_table_social_posts["social_posts\ntable"]
  claw_database_core --> claw_database_core_table_social_posts
  claw_database_core_table_accounting_entries["accounting_entries\ntable"]
  claw_database_core --> claw_database_core_table_accounting_entries
  claw_database_core_table_accounting_lines["accounting_lines\ntable"]
  claw_database_core --> claw_database_core_table_accounting_lines
  claw_database_core_table_calendar_events["calendar_events\ntable"]
  claw_database_core --> claw_database_core_table_calendar_events
  claw_database_core_table_iot_config["iot_config\ntable"]
  claw_database_core --> claw_database_core_table_iot_config
  claw_database_core_table_finance_records["finance_records\ntable"]
  claw_database_core --> claw_database_core_table_finance_records
  claw_database_core_table_marketplace_choices["marketplace_choices\ntable"]
  claw_database_core --> claw_database_core_table_marketplace_choices
  claw_database_core_table_resources["resources\ntable"]
  claw_database_core --> claw_database_core_table_resources
  claw_database_core_table_agents["agents\ntable"]
  claw_database_core --> claw_database_core_table_agents
  claw_database_core_table_skills["skills\ntable"]
  claw_database_core --> claw_database_core_table_skills
  claw_database_core_table_skill_collections["skill_collections\ntable"]
  claw_database_core --> claw_database_core_table_skill_collections
  claw_database_core_table_connections["connections\ntable"]
  claw_database_core --> claw_database_core_table_connections
  claw_database_core_table_apps["apps\ntable"]
  claw_database_core --> claw_database_core_table_apps
  claw_database_core_table_design_resources["design_resources\ntable"]
  claw_database_core --> claw_database_core_table_design_resources
  claw_database_core_table_session_index["session_index\ntable"]
  claw_database_core --> claw_database_core_table_session_index
  claw_database_core_table_session_index_fts["session_index_fts\ntable"]
  claw_database_core --> claw_database_core_table_session_index_fts
  claw_database_core_index_data_registry_domain_idx["data_registry_domain_idx\nindex"]
  claw_database_core --> claw_database_core_index_data_registry_domain_idx
  claw_database_core_index_app_projects_path_idx["app_projects_path_idx\nindex"]
  claw_database_core --> claw_database_core_index_app_projects_path_idx
  claw_database_core_index_app_sidebar_snapshots_order_idx["app_sidebar_snapshots_order_idx\nindex"]
  claw_database_core --> claw_database_core_index_app_sidebar_snapshots_order_idx
  claw_database_core_index_signals_variables_vertical_idx["signals_variables_vertical_idx\nindex"]
  claw_database_core --> claw_database_core_index_signals_variables_vertical_idx
  claw_database_core_index_signals_observations_variable_time_idx["signals_observations_variable_time_idx\nindex"]
  claw_database_core --> claw_database_core_index_signals_observations_variable_time_idx
  claw_database_core_index_signals_observations_vertical_time_idx["signals_observations_vertical_time_idx\nindex"]
  claw_database_core --> claw_database_core_index_signals_observations_vertical_time_idx
  claw_database_core_index_knowledge_entities_type_idx["knowledge_entities_type_idx\nindex"]
  claw_database_core --> claw_database_core_index_knowledge_entities_type_idx
  claw_database_core_index_knowledge_facts_subject_idx["knowledge_facts_subject_idx\nindex"]
  claw_database_core --> claw_database_core_index_knowledge_facts_subject_idx
  claw_database_core_index_knowledge_facts_predicate_idx["knowledge_facts_predicate_idx\nindex"]
  claw_database_core --> claw_database_core_index_knowledge_facts_predicate_idx
  claw_database_core_index_pages_space_updated_idx["pages_space_updated_idx\nindex"]
  claw_database_core --> claw_database_core_index_pages_space_updated_idx
  claw_database_core_index_pages_surface_idx["pages_surface_idx\nindex"]
  claw_database_core --> claw_database_core_index_pages_surface_idx
  claw_database_core_index_pages_source_record_idx["pages_source_record_idx\nindex"]
  claw_database_core --> claw_database_core_index_pages_source_record_idx
  claw_database_core_index_page_blocks_page_order_idx["page_blocks_page_order_idx\nindex"]
  claw_database_core --> claw_database_core_index_page_blocks_page_order_idx
  claw_database_core_index_page_links_target_idx["page_links_target_idx\nindex"]
  claw_database_core --> claw_database_core_index_page_links_target_idx
  claw_database_core_index_page_mentions_target_idx["page_mentions_target_idx\nindex"]
  claw_database_core --> claw_database_core_index_page_mentions_target_idx
  claw_database_core_index_page_comments_page_idx["page_comments_page_idx\nindex"]
  claw_database_core --> claw_database_core_index_page_comments_page_idx
  claw_database_core_index_profile_projection_section_idx["profile_projection_section_idx\nindex"]
  claw_database_core --> claw_database_core_index_profile_projection_section_idx
  claw_database_core_index_productivity_items_kind_status_idx["productivity_items_kind_status_idx\nindex"]
  claw_database_core --> claw_database_core_index_productivity_items_kind_status_idx
  claw_database_core_index_business_records_kind_idx["business_records_kind_idx\nindex"]
  claw_database_core --> claw_database_core_index_business_records_kind_idx
  claw_database_core_index_content_items_status_idx["content_items_status_idx\nindex"]
  claw_database_core --> claw_database_core_index_content_items_status_idx
  claw_database_core_index_social_posts_status_idx["social_posts_status_idx\nindex"]
  claw_database_core --> claw_database_core_index_social_posts_status_idx
  claw_database_core_index_calendar_events_time_idx["calendar_events_time_idx\nindex"]
  claw_database_core --> claw_database_core_index_calendar_events_time_idx
  claw_database_core_index_finance_records_time_idx["finance_records_time_idx\nindex"]
  claw_database_core --> claw_database_core_index_finance_records_time_idx
  claw_database_core_index_marketplace_choices_kind_target_idx["marketplace_choices_kind_target_idx\nindex"]
  claw_database_core --> claw_database_core_index_marketplace_choices_kind_target_idx
  claw_database_core_index_iot_config_kind_idx["iot_config_kind_idx\nindex"]
  claw_database_core --> claw_database_core_index_iot_config_kind_idx
  claw_database_core_index_resources_domain_kind_idx["resources_domain_kind_idx\nindex"]
  claw_database_core --> claw_database_core_index_resources_domain_kind_idx
  claw_database_core_index_design_resources_kind_idx["design_resources_kind_idx\nindex"]
  claw_database_core --> claw_database_core_index_design_resources_kind_idx
  claw_database_core_index_session_index_source_updated_idx["session_index_source_updated_idx\nindex"]
  claw_database_core --> claw_database_core_index_session_index_source_updated_idx
  claw_database_sessions_table_conversation_sessions["conversation_sessions\ntable"]
  claw_database_sessions --> claw_database_sessions_table_conversation_sessions
  claw_database_sessions_table_conversation_messages["conversation_messages\ntable"]
  claw_database_sessions --> claw_database_sessions_table_conversation_messages
  claw_database_sessions_table_conversation_fts["conversation_fts\ntable"]
  claw_database_sessions --> claw_database_sessions_table_conversation_fts
  claw_database_sessions_index_conversation_sessions_source_updated_idx["conversation_sessions_source_updated_idx\nindex"]
  claw_database_sessions --> claw_database_sessions_index_conversation_sessions_source_updated_idx
  claw_database_sessions_index_conversation_messages_session_idx["conversation_messages_session_idx\nindex"]
  claw_database_sessions --> claw_database_sessions_index_conversation_messages_session_idx
  claw_database_audio_table_audio_items["audio_items\ntable"]
  claw_database_audio --> claw_database_audio_table_audio_items
  claw_database_audio_table_audio_fts["audio_fts\ntable"]
  claw_database_audio --> claw_database_audio_table_audio_fts
  claw_database_audio_index_audio_items_session_idx["audio_items_session_idx\nindex"]
  claw_database_audio --> claw_database_audio_index_audio_items_session_idx
  claw_database_drive_table_drive_items["drive_items\ntable"]
  claw_database_drive --> claw_database_drive_table_drive_items
  claw_database_drive_table_drive_fts["drive_fts\ntable"]
  claw_database_drive --> claw_database_drive_table_drive_fts
  claw_database_drive_index_drive_items_session_idx["drive_items_session_idx\nindex"]
  claw_database_drive --> claw_database_drive_index_drive_items_session_idx
  claw_database_drive_index_drive_items_parent_idx["drive_items_parent_idx\nindex"]
  claw_database_drive --> claw_database_drive_index_drive_items_parent_idx
  claw_database_search_table_search_documents["search_documents\ntable"]
  claw_database_search --> claw_database_search_table_search_documents
  claw_database_search_table_search_fts["search_fts\ntable"]
  claw_database_search --> claw_database_search_table_search_fts
  claw_database_search_index_search_documents_domain_idx["search_documents_domain_idx\nindex"]
  claw_database_search --> claw_database_search_index_search_documents_domain_idx
  claw_database_runtime_table_runtime_jobs["runtime_jobs\ntable"]
  claw_database_runtime --> claw_database_runtime_table_runtime_jobs
  claw_database_runtime_table_runtime_events["runtime_events\ntable"]
  claw_database_runtime --> claw_database_runtime_table_runtime_events
  claw_database_runtime_index_runtime_jobs_status_idx["runtime_jobs_status_idx\nindex"]
  claw_database_runtime --> claw_database_runtime_index_runtime_jobs_status_idx
  claw_database_runtime_index_runtime_events_job_idx["runtime_events_job_idx\nindex"]
  claw_database_runtime --> claw_database_runtime_index_runtime_events_job_idx
  claw_database_core_table_operational_events["operational_events\ntable"]
  claw_database_core --> claw_database_core_table_operational_events
  claw_database_core_index_operational_events_kind_idx["operational_events_kind_idx\nindex"]
  claw_database_core --> claw_database_core_index_operational_events_kind_idx
```

## Nodes

| ID | Kind | Owner | Path / Key |
| --- | --- | --- | --- |
| `claw.global` | root | claw | `~/.claw` |
| `claw.workspace` | root | claw | `.claw` |
| `clawix.home` | root | clawix | `~/.clawix` |
| `claw.database.core` | database | claw | `~/.claw/data/core.sqlite` |
| `claw.database.legacy_productivity` | sidecar | claw | `.claw/data/productivity.sqlite` |
| `claw.database.core.table.workspace_records` | table | claw | `` |
| `claw.database.core.table.workspace_records.column.collection_name` | column | claw | `` |
| `claw.database.core.table.workspace_records.column.record_id` | column | claw | `` |
| `claw.database.core.table.workspace_records.column.payload_json` | column | claw | `` |
| `claw.database.core.table.workspace_records.column.updated_at` | column | claw | `` |
| `claw.database.core.table.workspace_records.column.archived_at` | column | claw | `` |
| `claw.database.core.table.workspace_records.index.workspace_records_collection_updated_idx` | index | claw | `` |
| `claw.database.core.table.workspace_meta` | table | claw | `` |
| `claw.database.core.table.workspace_meta.column.meta_key` | column | claw | `` |
| `claw.database.core.table.workspace_meta.column.meta_value` | column | claw | `` |
| `claw.database.runtime` | sidecar | claw | `~/.claw/data/runtime.sqlite` |
| `claw.database.sessions` | sidecar | claw | `~/.claw/data/sessions.sqlite` |
| `claw.database.audio` | sidecar | claw | `~/.claw/data/audio.sqlite` |
| `claw.database.search` | sidecar | claw | `~/.claw/data/search.sqlite` |
| `claw.database.notify` | sidecar | claw | `~/.claw/data/notify.sqlite` |
| `claw.database.feed` | sidecar | claw | `~/.claw/data/feed.sqlite` |
| `claw.database.monitor` | sidecar | claw | `~/.claw/data/monitor.sqlite` |
| `claw.workspace.manifest` | file | claw | `.claw/manifest.json` |
| `claw.workspace.desiredState` | folder | claw | `.claw/state/desired` |
| `claw.workspace.projections` | folder | claw | `.claw/projections` |
| `claw.workspace.sessions` | folder | claw | `.claw/sessions` |
| `claw.workspace.audit` | folder | claw | `.claw/audit` |
| `claw.workspace.locks` | folder | claw | `.claw/locks` |
| `claw.workspace.backups` | folder | claw | `.claw/backups` |
| `claw.workspace.browser` | folder | claw | `.claw/browser` |
| `claw.workspace.styles` | folder | claw | `.claw/styles` |
| `claw.workspace.templates` | folder | claw | `.claw/templates` |
| `claw.workspace.references` | folder | claw | `.claw/references` |
| `claw.workspace.slides` | folder | claw | `.claw/slides` |
| `claw.workspace.dashboard_database` | folder | claw | `.claw/dashboard-database` |
| `claw.workspace.channel_run` | folder | claw | `.claw/run/channels` |
| `claw.workspace.telegram_codex_bridge_state` | file | claw | `.claw/telegram-codex-bridge.json` |
| `claw.workspace.channel_runs_state` | file | claw | `.claw/channel-runs.json` |
| `claw.workspace.observedState` | folder | claw | `.claw/observed` |
| `claw.workspace.projections` | folder | claw | `.claw/projections` |
| `claw.workspace.sessions` | folder | claw | `.claw/sessions` |
| `claw.workspace.audit` | folder | claw | `.claw/audit` |
| `claw.workspace.backups` | folder | claw | `.claw/backups` |
| `claw.workspace.locks` | folder | claw | `.claw/locks` |
| `claw.workspace.intents` | folder | claw | `.claw/intents` |
| `claw.workspace.compat` | folder | claw | `.claw/compat` |
| `claw.workspace.documents` | folder | claw | `.claw/documents` |
| `claw.workspace.data` | folder | claw | `.claw/data` |
| `claw.workspace.generations_tmp` | persistentTemp | claw | `.claw/tmp/generations` |
| `claw.global.config` | folder | claw | `~/.claw/config.yaml` |
| `claw.global.data` | folder | claw | `~/.claw/data` |
| `claw.global.state` | folder | claw | `~/.claw/state` |
| `claw.global.cache` | folder | claw | `~/.claw/cache` |
| `claw.global.logs` | folder | claw | `~/.claw/logs` |
| `claw.global.run` | folder | claw | `~/.claw/run` |
| `claw.global.tmp` | folder | claw | `~/.claw/tmp` |
| `claw.global.skills` | folder | claw | `~/.claw/skills` |
| `claw.global.library` | folder | claw | `~/.claw/library` |
| `claw.global.rules` | folder | claw | `~/.claw/rules` |
| `claw.global.image_library` | folder | claw | `~/.claw/image-library` |
| `claw.global.runtime_home` | folder | claw | `~/.claw-runtime` |
| `claw.global.demo_home` | folder | claw | `~/.claw-demo` |
| `clawix.home.data` | folder | clawix | `~/.clawix/data` |
| `clawix.home.state` | folder | clawix | `~/.clawix/state` |
| `clawix.home.cache` | folder | clawix | `~/.clawix/cache` |
| `clawix.home.logs` | folder | clawix | `~/.clawix/logs` |
| `clawix.home.run` | folder | clawix | `~/.clawix/run` |
| `clawix.home.tmp` | folder | clawix | `~/.clawix/tmp` |
| `clawix.home.bridgeSocket` | socket | clawix | `~/.clawix/run/clawix-bridge.sock` |
| `claw.external.codex` | externalReadOnlySource | external | `~/.codex` |
| `claw.legacy.workspace.clawjs` | legacyPath | claw | `.clawjs` |
| `claw.database.core.table.data_registry` | table | claw | `` |
| `claw.database.core.table.app_state` | table | claw | `` |
| `claw.database.core.table.app_projects` | table | claw | `` |
| `claw.database.core.table.app_pinned_threads` | table | claw | `` |
| `claw.database.core.table.app_session_titles` | table | claw | `` |
| `claw.database.core.table.app_archives` | table | claw | `` |
| `claw.database.core.table.app_sidebar_snapshots` | table | claw | `` |
| `claw.database.core.table.app_terminal_tabs` | table | claw | `` |
| `claw.database.core.table.signals_verticals` | table | claw | `` |
| `claw.database.core.table.signals_variables` | table | claw | `` |
| `claw.database.core.table.signals_sessions` | table | claw | `` |
| `claw.database.core.table.signals_observations` | table | claw | `` |
| `claw.database.core.table.knowledge_entities` | table | claw | `` |
| `claw.database.core.table.knowledge_facts` | table | claw | `` |
| `claw.database.core.table.pages` | table | claw | `` |
| `claw.database.core.table.page_blocks` | table | claw | `` |
| `claw.database.core.table.page_links` | table | claw | `` |
| `claw.database.core.table.page_mentions` | table | claw | `` |
| `claw.database.core.table.page_revisions` | table | claw | `` |
| `claw.database.core.table.page_comments` | table | claw | `` |
| `claw.database.core.table.profile_projection` | table | claw | `` |
| `claw.database.core.table.notes_fts` | table | claw | `` |
| `claw.database.core.table.productivity_items` | table | claw | `` |
| `claw.database.core.table.business_records` | table | claw | `` |
| `claw.database.core.table.content_items` | table | claw | `` |
| `claw.database.core.table.social_posts` | table | claw | `` |
| `claw.database.core.table.accounting_entries` | table | claw | `` |
| `claw.database.core.table.accounting_lines` | table | claw | `` |
| `claw.database.core.table.calendar_events` | table | claw | `` |
| `claw.database.core.table.iot_config` | table | claw | `` |
| `claw.database.core.table.finance_records` | table | claw | `` |
| `claw.database.core.table.marketplace_choices` | table | claw | `` |
| `claw.database.core.table.resources` | table | claw | `` |
| `claw.database.core.table.agents` | table | claw | `` |
| `claw.database.core.table.skills` | table | claw | `` |
| `claw.database.core.table.skill_collections` | table | claw | `` |
| `claw.database.core.table.connections` | table | claw | `` |
| `claw.database.core.table.apps` | table | claw | `` |
| `claw.database.core.table.design_resources` | table | claw | `` |
| `claw.database.core.table.session_index` | table | claw | `` |
| `claw.database.core.table.session_index_fts` | table | claw | `` |
| `claw.database.core.index.data_registry_domain_idx` | index | claw | `` |
| `claw.database.core.index.app_projects_path_idx` | index | claw | `` |
| `claw.database.core.index.app_sidebar_snapshots_order_idx` | index | claw | `` |
| `claw.database.core.index.signals_variables_vertical_idx` | index | claw | `` |
| `claw.database.core.index.signals_observations_variable_time_idx` | index | claw | `` |
| `claw.database.core.index.signals_observations_vertical_time_idx` | index | claw | `` |
| `claw.database.core.index.knowledge_entities_type_idx` | index | claw | `` |
| `claw.database.core.index.knowledge_facts_subject_idx` | index | claw | `` |
| `claw.database.core.index.knowledge_facts_predicate_idx` | index | claw | `` |
| `claw.database.core.index.pages_space_updated_idx` | index | claw | `` |
| `claw.database.core.index.pages_surface_idx` | index | claw | `` |
| `claw.database.core.index.pages_source_record_idx` | index | claw | `` |
| `claw.database.core.index.page_blocks_page_order_idx` | index | claw | `` |
| `claw.database.core.index.page_links_target_idx` | index | claw | `` |
| `claw.database.core.index.page_mentions_target_idx` | index | claw | `` |
| `claw.database.core.index.page_comments_page_idx` | index | claw | `` |
| `claw.database.core.index.profile_projection_section_idx` | index | claw | `` |
| `claw.database.core.index.productivity_items_kind_status_idx` | index | claw | `` |
| `claw.database.core.index.business_records_kind_idx` | index | claw | `` |
| `claw.database.core.index.content_items_status_idx` | index | claw | `` |
| `claw.database.core.index.social_posts_status_idx` | index | claw | `` |
| `claw.database.core.index.calendar_events_time_idx` | index | claw | `` |
| `claw.database.core.index.finance_records_time_idx` | index | claw | `` |
| `claw.database.core.index.marketplace_choices_kind_target_idx` | index | claw | `` |
| `claw.database.core.index.iot_config_kind_idx` | index | claw | `` |
| `claw.database.core.index.resources_domain_kind_idx` | index | claw | `` |
| `claw.database.core.index.design_resources_kind_idx` | index | claw | `` |
| `claw.database.core.index.session_index_source_updated_idx` | index | claw | `` |
| `claw.database.sessions.table.conversation_sessions` | table | claw | `` |
| `claw.database.sessions.table.conversation_messages` | table | claw | `` |
| `claw.database.sessions.table.conversation_fts` | table | claw | `` |
| `claw.database.sessions.index.conversation_sessions_source_updated_idx` | index | claw | `` |
| `claw.database.sessions.index.conversation_messages_session_idx` | index | claw | `` |
| `claw.database.audio.table.audio_items` | table | claw | `` |
| `claw.database.audio.table.audio_fts` | table | claw | `` |
| `claw.database.audio.index.audio_items_session_idx` | index | claw | `` |
| `claw.database.drive.table.drive_items` | table | claw | `` |
| `claw.database.drive.table.drive_fts` | table | claw | `` |
| `claw.database.drive.index.drive_items_session_idx` | index | claw | `` |
| `claw.database.drive.index.drive_items_parent_idx` | index | claw | `` |
| `claw.database.search.table.search_documents` | table | claw | `` |
| `claw.database.search.table.search_fts` | table | claw | `` |
| `claw.database.search.index.search_documents_domain_idx` | index | claw | `` |
| `claw.database.runtime.table.runtime_jobs` | table | claw | `` |
| `claw.database.runtime.table.runtime_events` | table | claw | `` |
| `claw.database.runtime.index.runtime_jobs_status_idx` | index | claw | `` |
| `claw.database.runtime.index.runtime_events_job_idx` | index | claw | `` |
| `claw.database.core.table.operational_events` | table | claw | `` |
| `claw.database.core.index.operational_events_kind_idx` | index | claw | `` |
