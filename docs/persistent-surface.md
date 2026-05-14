# Claw stable surface

Generated from `claw inspect render --format markdown`. Do not edit by hand.
Use `claw inspect --manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]` to fuse static manifests from other language builders during inspection.
`claw inspect why <surface>` explains the docs, ADRs, tests, and source backing a CLI command or registered surface.

## Tree

```mermaid
flowchart TD
  claw_contracts["Claw stable compatibility surface\nroot"]
  claw_contracts_api["API routes\nroot"]
  claw_contracts --> claw_contracts_api
  claw_contracts_protocol["Wire protocols\nroot"]
  claw_contracts --> claw_contracts_protocol
  claw_contracts_events["Events and queues\nroot"]
  claw_contracts --> claw_contracts_events
  claw_contracts_schemas["Schemas and JSON fields\nroot"]
  claw_contracts --> claw_contracts_schemas
  claw_contracts_ids["Persistent IDs\nroot"]
  claw_contracts --> claw_contracts_ids
  claw_contracts_cli["CLI commands and flags\nroot"]
  claw_contracts --> claw_contracts_cli
  claw_contracts_external["External dependencies and owned mappings\nroot"]
  claw_contracts --> claw_contracts_external
  claw_api_events["Public framework event stream\napiRoute"]
  claw_contracts_api --> claw_api_events
  claw_api_host_commands["Host command endpoint\napiRoute"]
  claw_contracts_api --> claw_api_host_commands
  claw_api_storage_ownerToken["Storage owner token endpoint\napiRoute"]
  claw_contracts_api --> claw_api_storage_ownerToken
  claw_api_storage_buckets["Storage bucket list\napiRoute"]
  claw_contracts_api --> claw_api_storage_buckets
  claw_api_storage_objects["Storage object list\napiRoute"]
  claw_contracts_api --> claw_api_storage_objects
  claw_api_storage_shares["Storage share creation\napiRoute"]
  claw_contracts_api --> claw_api_storage_shares
  claw_api_database_namespaces["Database namespace list\napiRoute"]
  claw_contracts_api --> claw_api_database_namespaces
  claw_api_database_collections["Database collection list\napiRoute"]
  claw_contracts_api --> claw_api_database_collections
  claw_api_database_records["Database record list\napiRoute"]
  claw_contracts_api --> claw_api_database_records
  claw_api_database_adminLogin["Database admin login\napiRoute"]
  claw_contracts_api --> claw_api_database_adminLogin
  claw_api_database_realtime["Database realtime websocket\napiRoute"]
  claw_contracts_api --> claw_api_database_realtime
  claw_api_drive_health["Drive health endpoint\napiRoute"]
  claw_contracts_api --> claw_api_drive_health
  claw_api_drive_login["Drive admin login\napiRoute"]
  claw_contracts_api --> claw_api_drive_login
  claw_api_drive_items["Drive item list\napiRoute"]
  claw_contracts_api --> claw_api_drive_items
  claw_api_drive_search["Drive search endpoint\napiRoute"]
  claw_contracts_api --> claw_api_drive_search
  claw_api_search_types["Search/index type list\napiRoute"]
  claw_contracts_api --> claw_api_search_types
  claw_api_search_entitiesUpsert["Search/index entity upsert\napiRoute"]
  claw_contracts_api --> claw_api_search_entitiesUpsert
  claw_api_search_searches["Search definition list\napiRoute"]
  claw_contracts_api --> claw_api_search_searches
  claw_api_search_monitors["Search monitor list\napiRoute"]
  claw_contracts_api --> claw_api_search_monitors
  claw_api_time_items["Time item list\napiRoute"]
  claw_contracts_api --> claw_api_time_items
  claw_api_time_executions["Time execution list\napiRoute"]
  claw_contracts_api --> claw_api_time_executions
  claw_api_time_calendar["Time calendar view\napiRoute"]
  claw_contracts_api --> claw_api_time_calendar
  claw_api_time_timeline["Time timeline view\napiRoute"]
  claw_contracts_api --> claw_api_time_timeline
  claw_api_notify_notifications["Notification dispatch endpoint\napiRoute"]
  claw_contracts_api --> claw_api_notify_notifications
  claw_api_webhooks_providerEvent["Provider webhook ingress\napiRoute"]
  claw_contracts_api --> claw_api_webhooks_providerEvent
  claw_api_integrations_callback["OAuth integration callback\napiRoute"]
  claw_contracts_api --> claw_api_integrations_callback
  claw_protocol_hostCommand_v1["Host command contract v1\nprotocol"]
  claw_contracts_protocol --> claw_protocol_hostCommand_v1
  claw_protocol_hostCommand_v1_field_schemaVersion["schemaVersion\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_schemaVersion
  claw_protocol_hostCommand_v1_field_requestId["requestId\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_requestId
  claw_protocol_hostCommand_v1_field_domain["domain\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_domain
  claw_protocol_hostCommand_v1_field_resource["resource\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_resource
  claw_protocol_hostCommand_v1_field_action["action\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_action
  claw_protocol_hostCommand_v1_field_payload["payload\nprotocolField"]
  claw_protocol_hostCommand_v1 --> claw_protocol_hostCommand_v1_field_payload
  claw_event_workspace_initialized["workspace.initialized\neventTopic"]
  claw_contracts_events --> claw_event_workspace_initialized
  claw_event_compat_refreshed["compat.refreshed\neventTopic"]
  claw_contracts_events --> claw_event_compat_refreshed
  claw_event_telegram_webhook_configured["telegram.webhook_configured\neventTopic"]
  claw_contracts_events --> claw_event_telegram_webhook_configured
  claw_event_models_default_set["models.default-set\neventTopic"]
  claw_contracts_events --> claw_event_models_default_set
  claw_event_auth_login_started["auth.login-started\neventTopic"]
  claw_contracts_events --> claw_event_auth_login_started
  claw_event_database_record_created["record.created\neventTopic"]
  claw_contracts_events --> claw_event_database_record_created
  claw_event_database_record_updated["record.updated\neventTopic"]
  claw_contracts_events --> claw_event_database_record_updated
  claw_event_database_record_deleted["record.deleted\neventTopic"]
  claw_contracts_events --> claw_event_database_record_deleted
  claw_event_time_temporal_item_due["temporal.item.due\neventTopic"]
  claw_contracts_events --> claw_event_time_temporal_item_due
  claw_event_sessions_project_updated["project.updated\neventTopic"]
  claw_contracts_events --> claw_event_sessions_project_updated
  claw_event_sessions_session_updated["session.updated\neventTopic"]
  claw_contracts_events --> claw_event_sessions_session_updated
  claw_event_sessions_message_appended["message.appended\neventTopic"]
  claw_contracts_events --> claw_event_sessions_message_appended
  claw_event_sessions_message_updated["message.updated\neventTopic"]
  claw_contracts_events --> claw_event_sessions_message_updated
  claw_event_sessions_turn_started["turn.started\neventTopic"]
  claw_contracts_events --> claw_event_sessions_turn_started
  claw_event_sessions_turn_finished["turn.finished\neventTopic"]
  claw_contracts_events --> claw_event_sessions_turn_finished
  claw_event_channels_channel_message_received["channel.message.received\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_message_received
  claw_event_channels_channel_target_discovered["channel.target.discovered\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_target_discovered
  claw_event_channels_channel_message_sent["channel.message.sent\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_message_sent
  claw_event_channels_channel_listener_started["channel.listener.started\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_listener_started
  claw_event_channels_channel_listener_error["channel.listener.error\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_listener_error
  claw_event_channels_channel_listener_stopped["channel.listener.stopped\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_listener_stopped
  claw_event_channels_channel_processor_invoked["channel.processor.invoked\neventTopic"]
  claw_contracts_events --> claw_event_channels_channel_processor_invoked
  claw_event_workspaceAudit_workspace_created["workspace.created\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_workspace_created
  claw_event_workspaceAudit_files_synced["files.synced\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_files_synced
  claw_event_workspaceAudit_audit_child["audit.child\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_audit_child
  claw_event_workspaceAudit_tasks_created["tasks.created\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_tasks_created
  claw_event_workspaceAudit_notes_created["notes.created\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_notes_created
  claw_event_workspaceAudit_tasks_updated["tasks.updated\neventTopic"]
  claw_contracts_events --> claw_event_workspaceAudit_tasks_updated
  claw_event_notify_sdk_alert["sdk.alert\neventTopic"]
  claw_contracts_events --> claw_event_notify_sdk_alert
  claw_event_notify_deployment_failed["deployment.failed\neventTopic"]
  claw_contracts_events --> claw_event_notify_deployment_failed
  claw_event_notify_deployment_recovered["deployment.recovered\neventTopic"]
  claw_contracts_events --> claw_event_notify_deployment_recovered
  claw_event_notify_summary_ready["summary.ready\neventTopic"]
  claw_contracts_events --> claw_event_notify_summary_ready
  claw_event_notify_manual_triggered["manual.triggered\neventTopic"]
  claw_contracts_events --> claw_event_notify_manual_triggered
  claw_external_mapping_event_notionPageContentUpdated["page.content_updated\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_notionPageContentUpdated
  claw_external_mapping_event_stripeCheckoutSessionCompleted["checkout.session.completed\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_stripeCheckoutSessionCompleted
  claw_external_mapping_event_threadStarted["thread.started\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_threadStarted
  claw_external_mapping_event_itemCompleted["item.completed\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_itemCompleted
  claw_external_mapping_event_turnCompleted["turn.completed\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_turnCompleted
  claw_schema_common_field_schemaVersion["Persisted/exported data version field\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_schemaVersion
  claw_schema_common_field_protocolVersion["Wire protocol version field\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_protocolVersion
  claw_schema_common_field_sessionId["Framework conversation identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_sessionId
  claw_schema_common_field_requestId["Request correlation identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_requestId
  claw_schema_common_field_runtimeId["Runtime identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_runtimeId
  claw_schema_common_field_agentId["Agent identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_agentId
  claw_schema_common_field_providerId["Provider identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_providerId
  claw_schema_common_field_modelId["Model identity\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_modelId
  claw_schema_common_field_createdAt["Creation instant\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_createdAt
  claw_schema_common_field_updatedAt["Update instant\njsonField"]
  claw_contracts_schemas --> claw_schema_common_field_updatedAt
  claw_id_session["Framework agent session identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_session
  claw_id_thread_external["External runtime thread identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_thread_external
  claw_id_host["Signed host identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_host
  claw_id_device["Device identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_device
  claw_id_installation["Installation identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_installation
  claw_id_record["Database record identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_record
  claw_deeplink_scheme_host["clawix://\ndeepLink"]
  claw_contracts_api --> claw_deeplink_scheme_host
  claw_deeplink_scheme_frameworkReserved["claw://\ndeepLink"]
  claw_contracts_api --> claw_deeplink_scheme_frameworkReserved
  claw_hostname_showcase["showcase.claw.localhost\nhostname"]
  claw_contracts_api --> claw_hostname_showcase
  claw_hostname_agenda["agenda.claw.localhost\nhostname"]
  claw_contracts_api --> claw_hostname_agenda
  claw_hostname_board["board.claw.localhost\nhostname"]
  claw_contracts_api --> claw_hostname_board
  claw_hostname_channels["channels.claw.localhost\nhostname"]
  claw_contracts_api --> claw_hostname_channels
  claw_hostname_notify["notify.claw.localhost\nhostname"]
  claw_contracts_api --> claw_hostname_notify
  claw_port_runtime["runtime\nport"]
  claw_contracts_api --> claw_port_runtime
  claw_port_sessions["sessions\nport"]
  claw_contracts_api --> claw_port_sessions
  claw_port_database["database\nport"]
  claw_contracts_api --> claw_port_database
  claw_port_secrets["secrets\nport"]
  claw_contracts_api --> claw_port_secrets
  claw_port_drive["drive\nport"]
  claw_contracts_api --> claw_port_drive
  claw_port_memory["memory\nport"]
  claw_contracts_api --> claw_port_memory
  claw_port_search["search\nport"]
  claw_contracts_api --> claw_port_search
  claw_port_mcp["mcp\nport"]
  claw_contracts_api --> claw_port_mcp
  claw_port_mesh["mesh\nport"]
  claw_contracts_api --> claw_port_mesh
  claw_port_notify["notify\nport"]
  claw_contracts_api --> claw_port_notify
  claw_port_signals["signals\nport"]
  claw_contracts_api --> claw_port_signals
  claw_port_publishing["publishing\nport"]
  claw_contracts_api --> claw_port_publishing
  claw_port_remote["remote\nport"]
  claw_contracts_api --> claw_port_remote
  claw_port_remoteStatus["remoteStatus\nport"]
  claw_contracts_api --> claw_port_remoteStatus
  claw_port_monitor["monitor\nport"]
  claw_contracts_api --> claw_port_monitor
  claw_port_showcase["showcase\nport"]
  claw_contracts_api --> claw_port_showcase
  claw_port_agenda["agenda\nport"]
  claw_contracts_api --> claw_port_agenda
  claw_port_board["board\nport"]
  claw_contracts_api --> claw_port_board
  claw_port_channels["channels\nport"]
  claw_contracts_api --> claw_port_channels
  claw_port_clawixBridge["clawixBridge\nport"]
  claw_contracts_api --> claw_port_clawixBridge
  claw_cli_command_host["host\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_host
  claw_cli_command_system["system\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_system
  claw_cli_command_database["database\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_database
  claw_cli_command_db["db\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_db
  claw_cli_command_collections["collections\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_collections
  claw_cli_command_records["records\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_records
  claw_cli_command_inspect["inspect\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_inspect
  claw_cli_command_search["search\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_search
  claw_cli_command_work["work\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_work
  claw_cli_command_projects["projects\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_projects
  claw_cli_command_tasks["tasks\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_tasks
  claw_cli_command_notes["notes\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_notes
  claw_cli_command_people["people\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_people
  claw_cli_command_goals["goals\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_goals
  claw_cli_command_inbox["inbox\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_inbox
  claw_cli_command_approvals["approvals\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_approvals
  claw_cli_command_blockers["blockers\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_blockers
  claw_cli_command_decisions["decisions\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_decisions
  claw_cli_command_assignments["assignments\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_assignments
  claw_cli_command_handoffs["handoffs\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_handoffs
  claw_cli_command_artifacts["artifacts\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_artifacts
  claw_cli_command_commitments["commitments\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_commitments
  claw_cli_command_sessions["sessions\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_sessions
  claw_cli_command_skills["skills\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_skills
  claw_cli_command_models["models\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_models
  claw_cli_command_providers["providers\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_providers
  claw_cli_command_auth["auth\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_auth
  claw_cli_command_time["time\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_time
  claw_cli_command_calendar["calendar\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_calendar
  claw_cli_command_reminders["reminders\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_reminders
  claw_cli_command_deadlines["deadlines\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_deadlines
  claw_cli_command_routines["routines\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_routines
  claw_cli_command_schedule["schedule\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_schedule
  claw_cli_command_watch["watch\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_watch
  claw_cli_command_agenda["agenda\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_agenda
  claw_cli_command_timeline["timeline\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_timeline
  claw_cli_command_review["review\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_review
  claw_cli_command_channels["channels\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_channels
  claw_cli_command_telegram["telegram\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_telegram
  claw_cli_command_notify["notify\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_notify
  claw_cli_command_messages["messages\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_messages
  claw_cli_command_integrations["integrations\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_integrations
  claw_cli_command_media["media\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_media
  claw_cli_command_documents["documents\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_documents
  claw_cli_command_files["files\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_files
  claw_cli_command_images["images\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_images
  claw_cli_command_audio["audio\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_audio
  claw_cli_command_video["video\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_video
  claw_cli_command_slides["slides\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_slides
  claw_cli_command_generations["generations\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_generations
  claw_cli_command_templates["templates\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_templates
  claw_cli_command_styles["styles\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_styles
  claw_cli_command_references["references\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_references
  claw_cli_command_drive["drive\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_drive
  claw_cli_command_design["design\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_design
  claw_cli_command_apps["apps\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_apps
  claw_cli_command_content["content\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_content
  claw_cli_command_posts["posts\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_posts
  claw_cli_command_campaigns["campaigns\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_campaigns
  claw_cli_command_publications["publications\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_publications
  claw_cli_command_knowledge["knowledge\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_knowledge
  claw_cli_command_profile["profile\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_profile
  claw_cli_command_health["health\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_health
  claw_cli_command_travel["travel\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_travel
  claw_cli_command_career["career\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_career
  claw_cli_command_family["family\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_family
  claw_cli_command_legal["legal\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_legal
  claw_cli_command_finance["finance\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_finance
  claw_cli_command_location["location\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_location
  claw_cli_command_accounts["accounts\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_accounts
  claw_cli_command_business["business\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_business
  claw_cli_command_social["social\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_social
  claw_cli_command_runtime["runtime\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_runtime
  claw_cli_command_monitor["monitor\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_monitor
  claw_cli_command_logs["logs\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_logs
  claw_cli_command_doctor["doctor\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_doctor
  claw_cli_command_diagnostics["diagnostics\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_diagnostics
  claw_cli_command_mcp["mcp\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_mcp
  claw_cli_command_open["open\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_open
  claw_cli_command_context["context\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_context
  claw_cli_command_learning["learning\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_learning
  claw_cli_command_judgment["judgment\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_judgment
  claw_cli_command_outcomes["outcomes\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_outcomes
  claw_cli_command_plan["plan\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_plan
  claw_cli_command_code["code\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_code
  claw_cli_command_rules["rules\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_rules
  claw_cli_command_library["library\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_library
  claw_cli_command_soul["soul\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_soul
  claw_cli_command_erp["erp\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_erp
  claw_cli_command_iot["iot\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_iot
  claw_cli_command_tts["tts\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_tts
  claw_cli_command_stt["stt\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_stt
  claw_cli_command_voice_notes["voice-notes\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_voice_notes
  claw_cli_command_inference["inference\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_inference
  claw_cli_command_preview["preview\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_preview
  claw_cli_command_browser["browser\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_browser
  claw_cli_command_compat["compat\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_compat
  claw_cli_flag_json["--json\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_json
  claw_cli_flag_dry_run["--dry-run\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_dry_run
  claw_cli_flag_workspace["--workspace\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_workspace
  claw_cli_flag_runtime["--runtime\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_runtime
  claw_cli_flag_help["--help\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_help
  claw_external_openai["openai\nexternalDependency"]
  claw_contracts_external --> claw_external_openai
  claw_external_anthropic["anthropic\nexternalDependency"]
  claw_contracts_external --> claw_external_anthropic
  claw_external_stripe["stripe\nexternalDependency"]
  claw_contracts_external --> claw_external_stripe
  claw_external_telegram["telegram\nexternalDependency"]
  claw_contracts_external --> claw_external_telegram
  claw_external_slack["slack\nexternalDependency"]
  claw_contracts_external --> claw_external_slack
  claw_external_google["google\nexternalDependency"]
  claw_contracts_external --> claw_external_google
  claw_external_microsoft["microsoft\nexternalDependency"]
  claw_contracts_external --> claw_external_microsoft
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
  claw_browserStorage_databaseTheme["databaseTheme\nbrowserStorageKey"]
  claw_contracts_schemas --> claw_browserStorage_databaseTheme
  claw_chat_appStorage_selectedAppearance["selectedAppearance\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_selectedAppearance
  claw_chat_appStorage_appLanguage["appLanguage\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_appLanguage
  claw_chat_appStorage_notificationsEnabled["notificationsEnabled\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_notificationsEnabled
  claw_chat_appStorage_soundEnabled["soundEnabled\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_soundEnabled
  claw_chat_appStorage_hapticEnabled["hapticEnabled\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_hapticEnabled
  claw_chat_appStorage_relayBaseURL["relayBaseURL\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_relayBaseURL
  claw_chat_appStorage_relayTenantId["relayTenantId\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_relayTenantId
  claw_chat_appStorage_relayEmail["relayEmail\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_relayEmail
  claw_chat_appStorage_relayPassword["relayPassword\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_relayPassword
  claw_chat_appStorage_mainWindowFrame["mainWindowFrame\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_mainWindowFrame
  claw_chat_appStorage_swiftUiWindowFrame["swiftUiWindowFrame\nappStorageKey"]
  claw_contracts_schemas --> claw_chat_appStorage_swiftUiWindowFrame
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

| ID | Kind | Surface | Owner | Human | Programmatic | Gaps | Path / Key / Value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `claw.contracts` | root | schema | claw | humanUi | cli, persistence |  | `contracts` |
| `claw.contracts.api` | root | api | claw |  | serviceApi | humanUi:optional | `contracts/api` |
| `claw.contracts.protocol` | root | protocol | claw |  | serviceApi | humanUi:optional | `contracts/protocol` |
| `claw.contracts.events` | root | event | claw |  | serviceApi | humanUi:optional | `contracts/events` |
| `claw.contracts.schemas` | root | schema | claw |  | sdk, serviceApi, persistence | humanUi:optional | `contracts/schemas` |
| `claw.contracts.ids` | root | id | claw |  | sdk, serviceApi, persistence | humanUi:optional | `contracts/ids` |
| `claw.contracts.cli` | root | cli | claw |  | cli | humanUi:optional | `contracts/cli` |
| `claw.contracts.external` | root | external | claw |  | sdk, serviceApi, mcp | humanUi:optional | `contracts/external` |
| `claw.api.events` | apiRoute | api | claw |  |  |  | `/v1/events` |
| `claw.api.host.commands` | apiRoute | api | claw |  |  |  | `/v1/commands` |
| `claw.api.storage.ownerToken` | apiRoute | api | claw |  |  |  | `/v1/storage/owner-token` |
| `claw.api.storage.buckets` | apiRoute | api | claw |  |  |  | `/v1/storage/buckets` |
| `claw.api.storage.objects` | apiRoute | api | claw |  |  |  | `/v1/storage/objects` |
| `claw.api.storage.shares` | apiRoute | api | claw |  |  |  | `/v1/storage/shares` |
| `claw.api.database.namespaces` | apiRoute | api | claw |  |  |  | `/v1/namespaces` |
| `claw.api.database.collections` | apiRoute | api | claw |  |  |  | `/v1/namespaces/{namespace}/collections` |
| `claw.api.database.records` | apiRoute | api | claw |  |  |  | `/v1/namespaces/{namespace}/collections/{collection}/records` |
| `claw.api.database.adminLogin` | apiRoute | api | claw |  |  |  | `/v1/auth/admin/login` |
| `claw.api.database.realtime` | apiRoute | api | claw |  |  |  | `/v1/realtime` |
| `claw.api.drive.health` | apiRoute | api | claw |  |  |  | `/v1/health` |
| `claw.api.drive.login` | apiRoute | api | claw |  |  |  | `/v1/auth/admin/login` |
| `claw.api.drive.items` | apiRoute | api | claw |  |  |  | `/v1/items` |
| `claw.api.drive.search` | apiRoute | api | claw |  |  |  | `/v1/search` |
| `claw.api.search.types` | apiRoute | api | claw |  |  |  | `/v1/types` |
| `claw.api.search.entitiesUpsert` | apiRoute | api | claw |  |  |  | `/v1/entities/upsert` |
| `claw.api.search.searches` | apiRoute | api | claw |  |  |  | `/v1/searches` |
| `claw.api.search.monitors` | apiRoute | api | claw |  |  |  | `/v1/monitors` |
| `claw.api.time.items` | apiRoute | api | claw |  |  |  | `/v1/items` |
| `claw.api.time.executions` | apiRoute | api | claw |  |  |  | `/v1/executions` |
| `claw.api.time.calendar` | apiRoute | api | claw |  |  |  | `/v1/views/calendar` |
| `claw.api.time.timeline` | apiRoute | api | claw |  |  |  | `/v1/views/timeline` |
| `claw.api.notify.notifications` | apiRoute | api | claw |  |  |  | `/v1/notifications` |
| `claw.api.webhooks.providerEvent` | apiRoute | api | claw |  |  |  | `/v1/webhooks/{provider}/{event}` |
| `claw.api.integrations.callback` | apiRoute | api | claw |  |  |  | `/v1/integrations/{provider}/callback` |
| `claw.protocol.hostCommand.v1` | protocol | protocol | claw |  |  |  | `host-command-v1` |
| `claw.protocol.hostCommand.v1.field.schemaVersion` | protocolField | protocol | claw |  |  |  | `schemaVersion` |
| `claw.protocol.hostCommand.v1.field.requestId` | protocolField | protocol | claw |  |  |  | `requestId` |
| `claw.protocol.hostCommand.v1.field.domain` | protocolField | protocol | claw |  |  |  | `domain` |
| `claw.protocol.hostCommand.v1.field.resource` | protocolField | protocol | claw |  |  |  | `resource` |
| `claw.protocol.hostCommand.v1.field.action` | protocolField | protocol | claw |  |  |  | `action` |
| `claw.protocol.hostCommand.v1.field.payload` | protocolField | protocol | claw |  |  |  | `payload` |
| `claw.event.workspace.initialized` | eventTopic | event | claw |  |  |  | `workspace.initialized` |
| `claw.event.compat.refreshed` | eventTopic | event | claw |  |  |  | `compat.refreshed` |
| `claw.event.telegram.webhook.configured` | eventTopic | event | claw |  |  |  | `telegram.webhook_configured` |
| `claw.event.models.default.set` | eventTopic | event | claw |  |  |  | `models.default-set` |
| `claw.event.auth.login.started` | eventTopic | event | claw |  |  |  | `auth.login-started` |
| `claw.event.database.record.created` | eventTopic | event | claw |  |  |  | `record.created` |
| `claw.event.database.record.updated` | eventTopic | event | claw |  |  |  | `record.updated` |
| `claw.event.database.record.deleted` | eventTopic | event | claw |  |  |  | `record.deleted` |
| `claw.event.time.temporal.item.due` | eventTopic | event | claw |  |  |  | `temporal.item.due` |
| `claw.event.sessions.project.updated` | eventTopic | event | claw |  |  |  | `project.updated` |
| `claw.event.sessions.session.updated` | eventTopic | event | claw |  |  |  | `session.updated` |
| `claw.event.sessions.message.appended` | eventTopic | event | claw |  |  |  | `message.appended` |
| `claw.event.sessions.message.updated` | eventTopic | event | claw |  |  |  | `message.updated` |
| `claw.event.sessions.turn.started` | eventTopic | event | claw |  |  |  | `turn.started` |
| `claw.event.sessions.turn.finished` | eventTopic | event | claw |  |  |  | `turn.finished` |
| `claw.event.channels.channel.message.received` | eventTopic | event | claw |  |  |  | `channel.message.received` |
| `claw.event.channels.channel.target.discovered` | eventTopic | event | claw |  |  |  | `channel.target.discovered` |
| `claw.event.channels.channel.message.sent` | eventTopic | event | claw |  |  |  | `channel.message.sent` |
| `claw.event.channels.channel.listener.started` | eventTopic | event | claw |  |  |  | `channel.listener.started` |
| `claw.event.channels.channel.listener.error` | eventTopic | event | claw |  |  |  | `channel.listener.error` |
| `claw.event.channels.channel.listener.stopped` | eventTopic | event | claw |  |  |  | `channel.listener.stopped` |
| `claw.event.channels.channel.processor.invoked` | eventTopic | event | claw |  |  |  | `channel.processor.invoked` |
| `claw.event.workspaceAudit.workspace.created` | eventTopic | event | claw |  |  |  | `workspace.created` |
| `claw.event.workspaceAudit.files.synced` | eventTopic | event | claw |  |  |  | `files.synced` |
| `claw.event.workspaceAudit.audit.child` | eventTopic | event | claw |  |  |  | `audit.child` |
| `claw.event.workspaceAudit.tasks.created` | eventTopic | event | claw |  |  |  | `tasks.created` |
| `claw.event.workspaceAudit.notes.created` | eventTopic | event | claw |  |  |  | `notes.created` |
| `claw.event.workspaceAudit.tasks.updated` | eventTopic | event | claw |  |  |  | `tasks.updated` |
| `claw.event.notify.sdk.alert` | eventTopic | event | claw |  |  |  | `sdk.alert` |
| `claw.event.notify.deployment.failed` | eventTopic | event | claw |  |  |  | `deployment.failed` |
| `claw.event.notify.deployment.recovered` | eventTopic | event | claw |  |  |  | `deployment.recovered` |
| `claw.event.notify.summary.ready` | eventTopic | event | claw |  |  |  | `summary.ready` |
| `claw.event.notify.manual.triggered` | eventTopic | event | claw |  |  |  | `manual.triggered` |
| `claw.external.mapping.event.notionPageContentUpdated` | externalMapping | external | external |  |  |  | `page.content_updated` |
| `claw.external.mapping.event.stripeCheckoutSessionCompleted` | externalMapping | external | external |  |  |  | `checkout.session.completed` |
| `claw.external.mapping.event.threadStarted` | externalMapping | external | external |  |  |  | `thread.started` |
| `claw.external.mapping.event.itemCompleted` | externalMapping | external | external |  |  |  | `item.completed` |
| `claw.external.mapping.event.turnCompleted` | externalMapping | external | external |  |  |  | `turn.completed` |
| `claw.schema.common.field.schemaVersion` | jsonField | schema | claw |  |  |  | `schemaVersion` |
| `claw.schema.common.field.protocolVersion` | jsonField | schema | claw |  |  |  | `protocolVersion` |
| `claw.schema.common.field.sessionId` | jsonField | schema | claw |  |  |  | `sessionId` |
| `claw.schema.common.field.requestId` | jsonField | schema | claw |  |  |  | `requestId` |
| `claw.schema.common.field.runtimeId` | jsonField | schema | claw |  |  |  | `runtimeId` |
| `claw.schema.common.field.agentId` | jsonField | schema | claw |  |  |  | `agentId` |
| `claw.schema.common.field.providerId` | jsonField | schema | claw |  |  |  | `providerId` |
| `claw.schema.common.field.modelId` | jsonField | schema | claw |  |  |  | `modelId` |
| `claw.schema.common.field.createdAt` | jsonField | schema | claw |  |  |  | `createdAt` |
| `claw.schema.common.field.updatedAt` | jsonField | schema | claw |  |  |  | `updatedAt` |
| `claw.id.session` | idNamespace | id | claw |  |  |  | `sessionId` |
| `claw.id.thread.external` | idNamespace | id | claw |  |  |  | `threadId` |
| `claw.id.host` | idNamespace | id | claw |  |  |  | `hostId` |
| `claw.id.device` | idNamespace | id | claw |  |  |  | `deviceId` |
| `claw.id.installation` | idNamespace | id | claw |  |  |  | `installationId` |
| `claw.id.record` | idNamespace | id | claw |  |  |  | `recordId` |
| `claw.deeplink.scheme.host` | deepLink | config | claw |  |  |  | `clawix://` |
| `claw.deeplink.scheme.frameworkReserved` | deepLink | config | claw |  |  |  | `claw://` |
| `claw.hostname.showcase` | hostname | config | claw |  |  |  | `showcase.claw.localhost` |
| `claw.hostname.agenda` | hostname | config | claw |  |  |  | `agenda.claw.localhost` |
| `claw.hostname.board` | hostname | config | claw |  |  |  | `board.claw.localhost` |
| `claw.hostname.channels` | hostname | config | claw |  |  |  | `channels.claw.localhost` |
| `claw.hostname.notify` | hostname | config | claw |  |  |  | `notify.claw.localhost` |
| `claw.port.runtime` | port | config | claw |  |  |  | `24100` |
| `claw.port.sessions` | port | config | claw |  |  |  | `24101` |
| `claw.port.database` | port | config | claw |  |  |  | `24102` |
| `claw.port.secrets` | port | config | claw |  |  |  | `24103` |
| `claw.port.drive` | port | config | claw |  |  |  | `24104` |
| `claw.port.memory` | port | config | claw |  |  |  | `24105` |
| `claw.port.search` | port | config | claw |  |  |  | `24106` |
| `claw.port.mcp` | port | config | claw |  |  |  | `24107` |
| `claw.port.mesh` | port | config | claw |  |  |  | `24108` |
| `claw.port.notify` | port | config | claw |  |  |  | `24124` |
| `claw.port.signals` | port | config | claw |  |  |  | `24110` |
| `claw.port.publishing` | port | config | claw |  |  |  | `24111` |
| `claw.port.remote` | port | config | claw |  |  |  | `24112` |
| `claw.port.remoteStatus` | port | config | claw |  |  |  | `24113` |
| `claw.port.monitor` | port | config | claw |  |  |  | `24114` |
| `claw.port.showcase` | port | config | claw |  |  |  | `24120` |
| `claw.port.agenda` | port | config | claw |  |  |  | `24121` |
| `claw.port.board` | port | config | claw |  |  |  | `24122` |
| `claw.port.channels` | port | config | claw |  |  |  | `24123` |
| `claw.port.clawixBridge` | port | config | claw |  |  |  | `24080` |
| `claw.cli.command.host` | cliCommand | cli | claw |  |  |  | `host` |
| `claw.cli.command.system` | cliCommand | cli | claw |  |  |  | `system` |
| `claw.cli.command.database` | cliCommand | cli | claw |  |  |  | `database` |
| `claw.cli.command.db` | cliCommand | cli | claw |  |  |  | `db` |
| `claw.cli.command.collections` | cliCommand | cli | claw |  |  |  | `collections` |
| `claw.cli.command.records` | cliCommand | cli | claw |  |  |  | `records` |
| `claw.cli.command.inspect` | cliCommand | cli | claw |  |  |  | `inspect` |
| `claw.cli.command.search` | cliCommand | cli | claw |  |  |  | `search` |
| `claw.cli.command.work` | cliCommand | cli | claw |  |  |  | `work` |
| `claw.cli.command.projects` | cliCommand | cli | claw |  |  |  | `projects` |
| `claw.cli.command.tasks` | cliCommand | cli | claw |  |  |  | `tasks` |
| `claw.cli.command.notes` | cliCommand | cli | claw |  |  |  | `notes` |
| `claw.cli.command.people` | cliCommand | cli | claw |  |  |  | `people` |
| `claw.cli.command.goals` | cliCommand | cli | claw |  |  |  | `goals` |
| `claw.cli.command.inbox` | cliCommand | cli | claw |  |  |  | `inbox` |
| `claw.cli.command.approvals` | cliCommand | cli | claw |  |  |  | `approvals` |
| `claw.cli.command.blockers` | cliCommand | cli | claw |  |  |  | `blockers` |
| `claw.cli.command.decisions` | cliCommand | cli | claw |  |  |  | `decisions` |
| `claw.cli.command.assignments` | cliCommand | cli | claw |  |  |  | `assignments` |
| `claw.cli.command.handoffs` | cliCommand | cli | claw |  |  |  | `handoffs` |
| `claw.cli.command.artifacts` | cliCommand | cli | claw |  |  |  | `artifacts` |
| `claw.cli.command.commitments` | cliCommand | cli | claw |  |  |  | `commitments` |
| `claw.cli.command.sessions` | cliCommand | cli | claw |  |  |  | `sessions` |
| `claw.cli.command.skills` | cliCommand | cli | claw |  |  |  | `skills` |
| `claw.cli.command.models` | cliCommand | cli | claw |  |  |  | `models` |
| `claw.cli.command.providers` | cliCommand | cli | claw |  |  |  | `providers` |
| `claw.cli.command.auth` | cliCommand | cli | claw |  |  |  | `auth` |
| `claw.cli.command.time` | cliCommand | cli | claw |  |  |  | `time` |
| `claw.cli.command.calendar` | cliCommand | cli | claw |  |  |  | `calendar` |
| `claw.cli.command.reminders` | cliCommand | cli | claw |  |  |  | `reminders` |
| `claw.cli.command.deadlines` | cliCommand | cli | claw |  |  |  | `deadlines` |
| `claw.cli.command.routines` | cliCommand | cli | claw |  |  |  | `routines` |
| `claw.cli.command.schedule` | cliCommand | cli | claw |  |  |  | `schedule` |
| `claw.cli.command.watch` | cliCommand | cli | claw |  |  |  | `watch` |
| `claw.cli.command.agenda` | cliCommand | cli | claw |  |  |  | `agenda` |
| `claw.cli.command.timeline` | cliCommand | cli | claw |  |  |  | `timeline` |
| `claw.cli.command.review` | cliCommand | cli | claw |  |  |  | `review` |
| `claw.cli.command.channels` | cliCommand | cli | claw |  |  |  | `channels` |
| `claw.cli.command.telegram` | cliCommand | cli | claw |  |  |  | `telegram` |
| `claw.cli.command.notify` | cliCommand | cli | claw |  |  |  | `notify` |
| `claw.cli.command.messages` | cliCommand | cli | claw |  |  |  | `messages` |
| `claw.cli.command.integrations` | cliCommand | cli | claw |  |  |  | `integrations` |
| `claw.cli.command.media` | cliCommand | cli | claw |  |  |  | `media` |
| `claw.cli.command.documents` | cliCommand | cli | claw |  |  |  | `documents` |
| `claw.cli.command.files` | cliCommand | cli | claw |  |  |  | `files` |
| `claw.cli.command.images` | cliCommand | cli | claw |  |  |  | `images` |
| `claw.cli.command.audio` | cliCommand | cli | claw |  |  |  | `audio` |
| `claw.cli.command.video` | cliCommand | cli | claw |  |  |  | `video` |
| `claw.cli.command.slides` | cliCommand | cli | claw |  |  |  | `slides` |
| `claw.cli.command.generations` | cliCommand | cli | claw |  |  |  | `generations` |
| `claw.cli.command.templates` | cliCommand | cli | claw |  |  |  | `templates` |
| `claw.cli.command.styles` | cliCommand | cli | claw |  |  |  | `styles` |
| `claw.cli.command.references` | cliCommand | cli | claw |  |  |  | `references` |
| `claw.cli.command.drive` | cliCommand | cli | claw |  |  |  | `drive` |
| `claw.cli.command.design` | cliCommand | cli | claw |  |  |  | `design` |
| `claw.cli.command.apps` | cliCommand | cli | claw |  |  |  | `apps` |
| `claw.cli.command.content` | cliCommand | cli | claw |  |  |  | `content` |
| `claw.cli.command.posts` | cliCommand | cli | claw |  |  |  | `posts` |
| `claw.cli.command.campaigns` | cliCommand | cli | claw |  |  |  | `campaigns` |
| `claw.cli.command.publications` | cliCommand | cli | claw |  |  |  | `publications` |
| `claw.cli.command.knowledge` | cliCommand | cli | claw |  |  |  | `knowledge` |
| `claw.cli.command.profile` | cliCommand | cli | claw |  |  |  | `profile` |
| `claw.cli.command.health` | cliCommand | cli | claw |  |  |  | `health` |
| `claw.cli.command.travel` | cliCommand | cli | claw |  |  |  | `travel` |
| `claw.cli.command.career` | cliCommand | cli | claw |  |  |  | `career` |
| `claw.cli.command.family` | cliCommand | cli | claw |  |  |  | `family` |
| `claw.cli.command.legal` | cliCommand | cli | claw |  |  |  | `legal` |
| `claw.cli.command.finance` | cliCommand | cli | claw |  |  |  | `finance` |
| `claw.cli.command.location` | cliCommand | cli | claw |  |  |  | `location` |
| `claw.cli.command.accounts` | cliCommand | cli | claw |  |  |  | `accounts` |
| `claw.cli.command.business` | cliCommand | cli | claw |  |  |  | `business` |
| `claw.cli.command.social` | cliCommand | cli | claw |  |  |  | `social` |
| `claw.cli.command.runtime` | cliCommand | cli | claw |  |  |  | `runtime` |
| `claw.cli.command.monitor` | cliCommand | cli | claw |  |  |  | `monitor` |
| `claw.cli.command.logs` | cliCommand | cli | claw |  |  |  | `logs` |
| `claw.cli.command.doctor` | cliCommand | cli | claw |  |  |  | `doctor` |
| `claw.cli.command.diagnostics` | cliCommand | cli | claw |  |  |  | `diagnostics` |
| `claw.cli.command.mcp` | cliCommand | cli | claw |  |  |  | `mcp` |
| `claw.cli.command.open` | cliCommand | cli | claw |  |  |  | `open` |
| `claw.cli.command.context` | cliCommand | cli | claw |  |  |  | `context` |
| `claw.cli.command.learning` | cliCommand | cli | claw |  |  |  | `learning` |
| `claw.cli.command.judgment` | cliCommand | cli | claw |  |  |  | `judgment` |
| `claw.cli.command.outcomes` | cliCommand | cli | claw |  |  |  | `outcomes` |
| `claw.cli.command.plan` | cliCommand | cli | claw |  |  |  | `plan` |
| `claw.cli.command.code` | cliCommand | cli | claw |  |  |  | `code` |
| `claw.cli.command.rules` | cliCommand | cli | claw |  |  |  | `rules` |
| `claw.cli.command.library` | cliCommand | cli | claw |  |  |  | `library` |
| `claw.cli.command.soul` | cliCommand | cli | claw |  |  |  | `soul` |
| `claw.cli.command.erp` | cliCommand | cli | claw |  |  |  | `erp` |
| `claw.cli.command.iot` | cliCommand | cli | claw |  |  |  | `iot` |
| `claw.cli.command.tts` | cliCommand | cli | claw |  |  |  | `tts` |
| `claw.cli.command.stt` | cliCommand | cli | claw |  |  |  | `stt` |
| `claw.cli.command.voice-notes` | cliCommand | cli | claw |  |  |  | `voice-notes` |
| `claw.cli.command.inference` | cliCommand | cli | claw |  |  |  | `inference` |
| `claw.cli.command.preview` | cliCommand | cli | claw |  |  |  | `preview` |
| `claw.cli.command.browser` | cliCommand | cli | claw |  |  |  | `browser` |
| `claw.cli.command.compat` | cliCommand | cli | claw |  |  |  | `compat` |
| `claw.cli.flag.json` | cliFlag | cli | claw |  |  |  | `--json` |
| `claw.cli.flag.dry-run` | cliFlag | cli | claw |  |  |  | `--dry-run` |
| `claw.cli.flag.workspace` | cliFlag | cli | claw |  |  |  | `--workspace` |
| `claw.cli.flag.runtime` | cliFlag | cli | claw |  |  |  | `--runtime` |
| `claw.cli.flag.help` | cliFlag | cli | claw |  |  |  | `--help` |
| `claw.external.openai` | externalDependency | external | external |  |  |  | `openai` |
| `claw.external.anthropic` | externalDependency | external | external |  |  |  | `anthropic` |
| `claw.external.stripe` | externalDependency | external | external |  |  |  | `stripe` |
| `claw.external.telegram` | externalDependency | external | external |  |  |  | `telegram` |
| `claw.external.slack` | externalDependency | external | external |  |  |  | `slack` |
| `claw.external.google` | externalDependency | external | external |  |  |  | `google` |
| `claw.external.microsoft` | externalDependency | external | external |  |  |  | `microsoft` |
| `claw.global` | root | persistent | claw |  |  |  | `~/.claw` |
| `claw.workspace` | root | persistent | claw |  |  |  | `.claw` |
| `clawix.home` | root | persistent | clawix |  |  |  | `~/.clawix` |
| `claw.database.core` | database | persistent | claw |  |  |  | `~/.claw/data/core.sqlite` |
| `claw.database.legacy_productivity` | sidecar | persistent | claw |  |  |  | `.claw/data/productivity.sqlite` |
| `claw.database.core.table.workspace_records` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.column.collection_name` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.column.record_id` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.column.payload_json` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.column.updated_at` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.column.archived_at` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_records.index.workspace_records_collection_updated_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_meta` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_meta.column.meta_key` | column | persistent | claw |  |  |  | `` |
| `claw.database.core.table.workspace_meta.column.meta_value` | column | persistent | claw |  |  |  | `` |
| `claw.database.runtime` | sidecar | persistent | claw |  |  |  | `~/.claw/data/runtime.sqlite` |
| `claw.database.sessions` | sidecar | persistent | claw |  |  |  | `~/.claw/data/sessions.sqlite` |
| `claw.database.audio` | sidecar | persistent | claw |  |  |  | `~/.claw/data/audio.sqlite` |
| `claw.database.search` | sidecar | persistent | claw |  |  |  | `~/.claw/data/search.sqlite` |
| `claw.database.notify` | sidecar | persistent | claw |  |  |  | `~/.claw/data/notify.sqlite` |
| `claw.database.feed` | sidecar | persistent | claw |  |  |  | `~/.claw/data/feed.sqlite` |
| `claw.database.monitor` | sidecar | persistent | claw |  |  |  | `~/.claw/data/monitor.sqlite` |
| `claw.workspace.manifest` | file | persistent | claw |  |  |  | `.claw/manifest.json` |
| `claw.workspace.desiredState` | folder | persistent | claw |  |  |  | `.claw/state/desired` |
| `claw.workspace.projections` | folder | persistent | claw |  |  |  | `.claw/projections` |
| `claw.workspace.sessions` | folder | persistent | claw |  |  |  | `.claw/sessions` |
| `claw.workspace.audit` | folder | persistent | claw |  |  |  | `.claw/audit` |
| `claw.workspace.locks` | folder | persistent | claw |  |  |  | `.claw/locks` |
| `claw.workspace.backups` | folder | persistent | claw |  |  |  | `.claw/backups` |
| `claw.workspace.browser` | folder | persistent | claw |  |  |  | `.claw/browser` |
| `claw.workspace.styles` | folder | persistent | claw |  |  |  | `.claw/styles` |
| `claw.workspace.templates` | folder | persistent | claw |  |  |  | `.claw/templates` |
| `claw.workspace.references` | folder | persistent | claw |  |  |  | `.claw/references` |
| `claw.workspace.slides` | folder | persistent | claw |  |  |  | `.claw/slides` |
| `claw.workspace.dashboard_database` | folder | persistent | claw |  |  |  | `.claw/dashboard-database` |
| `claw.workspace.channel_run` | folder | persistent | claw |  |  |  | `.claw/run/channels` |
| `claw.workspace.telegram_codex_bridge_state` | file | persistent | claw |  |  |  | `.claw/telegram-codex-bridge.json` |
| `claw.workspace.channel_runs_state` | file | persistent | claw |  |  |  | `.claw/channel-runs.json` |
| `claw.workspace.observedState` | folder | persistent | claw |  |  |  | `.claw/observed` |
| `claw.workspace.projections` | folder | persistent | claw |  |  |  | `.claw/projections` |
| `claw.workspace.sessions` | folder | persistent | claw |  |  |  | `.claw/sessions` |
| `claw.workspace.audit` | folder | persistent | claw |  |  |  | `.claw/audit` |
| `claw.workspace.backups` | folder | persistent | claw |  |  |  | `.claw/backups` |
| `claw.workspace.locks` | folder | persistent | claw |  |  |  | `.claw/locks` |
| `claw.workspace.intents` | folder | persistent | claw |  |  |  | `.claw/intents` |
| `claw.workspace.compat` | folder | persistent | claw |  |  |  | `.claw/compat` |
| `claw.workspace.documents` | folder | persistent | claw |  |  |  | `.claw/documents` |
| `claw.workspace.data` | folder | persistent | claw |  |  |  | `.claw/data` |
| `claw.workspace.generations_tmp` | persistentTemp | persistent | claw |  |  |  | `.claw/tmp/generations` |
| `claw.global.config` | folder | persistent | claw |  |  |  | `~/.claw/config.yaml` |
| `claw.global.data` | folder | persistent | claw |  |  |  | `~/.claw/data` |
| `claw.global.state` | folder | persistent | claw |  |  |  | `~/.claw/state` |
| `claw.global.cache` | folder | persistent | claw |  |  |  | `~/.claw/cache` |
| `claw.global.logs` | folder | persistent | claw |  |  |  | `~/.claw/logs` |
| `claw.global.run` | folder | persistent | claw |  |  |  | `~/.claw/run` |
| `claw.global.tmp` | folder | persistent | claw |  |  |  | `~/.claw/tmp` |
| `claw.global.skills` | folder | persistent | claw |  |  |  | `~/.claw/skills` |
| `claw.global.library` | folder | persistent | claw |  |  |  | `~/.claw/library` |
| `claw.global.rules` | folder | persistent | claw |  |  |  | `~/.claw/rules` |
| `claw.global.image_library` | folder | persistent | claw |  |  |  | `~/.claw/image-library` |
| `claw.global.runtime_home` | folder | persistent | claw |  |  |  | `~/.claw-runtime` |
| `claw.global.demo_home` | folder | persistent | claw |  |  |  | `~/.claw-demo` |
| `clawix.home.data` | folder | persistent | clawix |  |  |  | `~/.clawix/data` |
| `clawix.home.state` | folder | persistent | clawix |  |  |  | `~/.clawix/state` |
| `clawix.home.cache` | folder | persistent | clawix |  |  |  | `~/.clawix/cache` |
| `clawix.home.logs` | folder | persistent | clawix |  |  |  | `~/.clawix/logs` |
| `clawix.home.run` | folder | persistent | clawix |  |  |  | `~/.clawix/run` |
| `clawix.home.tmp` | folder | persistent | clawix |  |  |  | `~/.clawix/tmp` |
| `clawix.home.bridgeSocket` | socket | persistent | clawix |  |  |  | `~/.clawix/run/clawix-bridge.sock` |
| `claw.external.codex` | externalReadOnlySource | persistent | external |  |  |  | `~/.codex` |
| `claw.browserStorage.databaseTheme` | browserStorageKey | config | claw |  |  |  | `claw-db-theme` |
| `claw.chat.appStorage.selectedAppearance` | appStorageKey | config | claw |  |  |  | `selectedAppearance` |
| `claw.chat.appStorage.appLanguage` | appStorageKey | config | claw |  |  |  | `appLanguage` |
| `claw.chat.appStorage.notificationsEnabled` | appStorageKey | config | claw |  |  |  | `notificationsEnabled` |
| `claw.chat.appStorage.soundEnabled` | appStorageKey | config | claw |  |  |  | `soundEnabled` |
| `claw.chat.appStorage.hapticEnabled` | appStorageKey | config | claw |  |  |  | `hapticEnabled` |
| `claw.chat.appStorage.relayBaseURL` | appStorageKey | config | claw |  |  |  | `relayBaseURL` |
| `claw.chat.appStorage.relayTenantId` | appStorageKey | config | claw |  |  |  | `relayTenantId` |
| `claw.chat.appStorage.relayEmail` | appStorageKey | config | claw |  |  |  | `relayEmail` |
| `claw.chat.appStorage.relayPassword` | appStorageKey | config | claw |  |  |  | `relayPassword` |
| `claw.chat.appStorage.mainWindowFrame` | appStorageKey | config | claw |  |  |  | `NSWindow Frame main` |
| `claw.chat.appStorage.swiftUiWindowFrame` | appStorageKey | config | claw |  |  |  | `NSWindow Frame SwiftUI` |
| `claw.legacy.workspace.clawjs` | legacyPath | persistent | claw |  |  |  | `.clawjs` |
| `claw.database.core.table.data_registry` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_state` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_projects` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_pinned_threads` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_session_titles` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_archives` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_sidebar_snapshots` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.app_terminal_tabs` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.signals_verticals` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.signals_variables` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.signals_sessions` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.signals_observations` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.knowledge_entities` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.knowledge_facts` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.pages` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.page_blocks` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.page_links` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.page_mentions` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.page_revisions` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.page_comments` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.profile_projection` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.notes_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.productivity_items` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.business_records` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.content_items` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.social_posts` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.accounting_entries` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.accounting_lines` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.calendar_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.iot_config` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.finance_records` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.marketplace_choices` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.resources` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.agents` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.skills` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.skill_collections` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connections` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.apps` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.design_resources` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.session_index` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.session_index_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.index.data_registry_domain_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.app_projects_path_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.app_sidebar_snapshots_order_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.signals_variables_vertical_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.signals_observations_variable_time_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.signals_observations_vertical_time_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.knowledge_entities_type_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.knowledge_facts_subject_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.knowledge_facts_predicate_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.pages_space_updated_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.pages_surface_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.pages_source_record_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.page_blocks_page_order_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.page_links_target_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.page_mentions_target_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.page_comments_page_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.profile_projection_section_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.productivity_items_kind_status_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.business_records_kind_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.content_items_status_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.social_posts_status_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.calendar_events_time_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.finance_records_time_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.marketplace_choices_kind_target_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.iot_config_kind_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.resources_domain_kind_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.design_resources_kind_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.session_index_source_updated_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.sessions.table.conversation_sessions` | table | persistent | claw |  |  |  | `` |
| `claw.database.sessions.table.conversation_messages` | table | persistent | claw |  |  |  | `` |
| `claw.database.sessions.table.conversation_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.sessions.index.conversation_sessions_source_updated_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.sessions.index.conversation_messages_session_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.audio.table.audio_items` | table | persistent | claw |  |  |  | `` |
| `claw.database.audio.table.audio_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.audio.index.audio_items_session_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.drive.table.drive_items` | table | persistent | claw |  |  |  | `` |
| `claw.database.drive.table.drive_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.drive.index.drive_items_session_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.drive.index.drive_items_parent_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.search.table.search_documents` | table | persistent | claw |  |  |  | `` |
| `claw.database.search.table.search_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.search.index.search_documents_domain_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.runtime.table.runtime_jobs` | table | persistent | claw |  |  |  | `` |
| `claw.database.runtime.table.runtime_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.runtime.index.runtime_jobs_status_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.runtime.index.runtime_events_job_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.table.operational_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.index.operational_events_kind_idx` | index | persistent | claw |  |  |  | `` |
