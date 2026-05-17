# Claw stable surface

Generated from `claw inspect render --format markdown`. Do not edit by hand.
Use `claw inspect --manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]` to fuse static manifests from other language builders during inspection.
`claw inspect why <surface>` explains the docs, ADRs, tests, and source backing a CLI command or registered surface.

## Tree

```mermaid
flowchart TD
  claw_contracts["Claw stable contract surface\nroot"]
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
  claw_contracts_config["Configuration and environment\nroot"]
  claw_contracts --> claw_contracts_config
  claw_contracts_packages["Packages, exports, and bins\nroot"]
  claw_contracts --> claw_contracts_packages
  claw_contracts_native["Native identities\nroot"]
  claw_contracts --> claw_contracts_native
  claw_contracts_formats["Import/export formats\nroot"]
  claw_contracts --> claw_contracts_formats
  claw_contracts_external["External dependencies and owned mappings\nroot"]
  claw_contracts --> claw_contracts_external
  claw_cli_public["Public claw CLI\nroot"]
  claw_mcp_surface["MCP model-native surface\nroot"]
  claw_storage_canonical["Canonical storage boundary\nroot"]
  claw_host_signed["Active signed host\nroot"]
  claw_host_permissions["Host permissions\nroot"]
  claw_host_grants["Host grants\nroot"]
  claw_host_approvals["Host approvals\nroot"]
  claw_host_audit["Host audit\nroot"]
  clawix_ui_chat["Clawix agent chat UI\nroot"]
  clawix_companion_client["Companion client\nroot"]
  clawix_bridge_local["Clawix local bridge\nroot"]
  claw_daemon_local["Claw daemon\nroot"]
  claw_runtime_agent["Agent runtime\nroot"]
  claw_sessions["Sessions service\nroot"]
  claw_remote_client["Remote client\nroot"]
  claw_relay["Relay control plane\nroot"]
  claw_relay_connector["Relay workspace connector\nroot"]
  claw_api_chatCompletions["/v1/chat/completions API route\napiRoute"]
  claw_contracts_api --> claw_api_chatCompletions
  claw_api_app["/v1/app/ API route\napiRoute"]
  claw_contracts_api --> claw_api_app
  claw_api_connectorConnect["/v1/connector/connect API route\napiRoute"]
  claw_contracts_api --> claw_api_connectorConnect
  claw_api_families["/v1/families API route\napiRoute"]
  claw_contracts_api --> claw_api_families
  claw_api_meDevices["/v1/me/devices API route\napiRoute"]
  claw_contracts_api --> claw_api_meDevices
  claw_api_responses["/v1/responses API route\napiRoute"]
  claw_contracts_api --> claw_api_responses
  claw_api_secrets["/v1/secrets API route\napiRoute"]
  claw_contracts_api --> claw_api_secrets
  claw_api_secretsSetup["/v1/secrets/setup API route\napiRoute"]
  claw_contracts_api --> claw_api_secretsSetup
  claw_api_storage["/v1/storage API route\napiRoute"]
  claw_contracts_api --> claw_api_storage
  claw_api_storageObjectsWorkspaceAgentsAgentARemoteNoteTxt["/v1/storage/objects/workspace/agents/agent-a/remote/note.txt API route\napiRoute"]
  claw_contracts_api --> claw_api_storageObjectsWorkspaceAgentsAgentARemoteNoteTxt
  claw_api_itemsItem1Shares["/v1/items/item-1/shares API route\napiRoute"]
  claw_contracts_api --> claw_api_itemsItem1Shares
  claw_api_itemsItem1SharesShare1Revoke["/v1/items/item-1/shares/share-1/revoke API route\napiRoute"]
  claw_contracts_api --> claw_api_itemsItem1SharesShare1Revoke
  claw_api_storageShares["/v1/storage/shares API route\napiRoute"]
  claw_contracts_api --> claw_api_storageShares
  claw_api_systemStatus["/v1/system/status API route\napiRoute"]
  claw_contracts_api --> claw_api_systemStatus
  claw_api_uploads["/v1/uploads API route\napiRoute"]
  claw_contracts_api --> claw_api_uploads
  claw_api_workspaces["/v1/workspaces API route\napiRoute"]
  claw_contracts_api --> claw_api_workspaces
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
  claw_api_relay_remote["Remote Relay client channel\napiRoute"]
  claw_contracts_api --> claw_api_relay_remote
  claw_api_relay_connector["Relay workspace connector channel\napiRoute"]
  claw_contracts_api --> claw_api_relay_connector
  claw_privateApi_attachments["/api/attachments private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_attachments
  claw_privateApi_authToken["/api/auth/token private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_authToken
  claw_privateApi_capture["/api/capture private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_capture
  claw_privateApi_captures["/api/captures private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_captures
  claw_privateApi_chatFeedback["/api/chat/feedback private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_chatFeedback
  claw_privateApi_comments["/api/comments private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_comments
  claw_privateApi_configProfile["/api/config/profile private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_configProfile
  claw_privateApi_configReset["/api/config/reset private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_configReset
  claw_privateApi_configWorkspaceFiles["/api/config/workspace-files private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_configWorkspaceFiles
  claw_privateApi_connectorsCatalog["/api/connectors/catalog private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_connectorsCatalog
  claw_privateApi_context["/api/context private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_context
  claw_privateApi_customFields["/api/custom-fields private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_customFields
  claw_privateApi_cycles["/api/cycles private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_cycles
  claw_privateApi_discoverLocal["/api/discover/local private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_discoverLocal
  claw_privateApi_e2eSeed["/api/e2e/seed private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_e2eSeed
  claw_privateApi_epics["/api/epics private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_epics
  claw_privateApi_export["/api/export private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_export
  claw_privateApi_fieldValues["/api/field-values private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_fieldValues
  claw_privateApi_goals["/api/goals private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_goals
  claw_privateApi_graph["/api/graph private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_graph
  claw_privateApi_hotTopicsSeed["/api/hot-topics/seed private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_hotTopicsSeed
  claw_privateApi_images["/api/images private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_images
  claw_privateApi_instances["/api/instances private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_instances
  claw_privateApi_integrationsAuth["/api/integrations/auth private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsAuth
  claw_privateApi_integrationsEnable["/api/integrations/enable private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsEnable
  claw_privateApi_integrationsGateway["/api/integrations/gateway private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsGateway
  claw_privateApi_integrationsInstall["/api/integrations/install private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsInstall
  claw_privateApi_integrationsInstallStream["/api/integrations/install-stream private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsInstallStream
  claw_privateApi_integrationsReveal["/api/integrations/reveal private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsReveal
  claw_privateApi_integrationsSlackConnect["/api/integrations/slack/connect private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsSlackConnect
  claw_privateApi_integrationsSlackTest["/api/integrations/slack/test private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsSlackTest
  claw_privateApi_integrationsTelegramConnect["/api/integrations/telegram/connect private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsTelegramConnect
  claw_privateApi_integrationsTelegramTest["/api/integrations/telegram/test private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsTelegramTest
  claw_privateApi_integrationsUninstall["/api/integrations/uninstall private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsUninstall
  claw_privateApi_integrationsWhatsappCleanup["/api/integrations/whatsapp/cleanup private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsWhatsappCleanup
  claw_privateApi_integrationsWhatsappConnect["/api/integrations/whatsapp/connect private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsWhatsappConnect
  claw_privateApi_lists["/api/lists private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_lists
  claw_privateApi_memoryPerson["/api/memory/person private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_memoryPerson
  claw_privateApi_milestones["/api/milestones private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_milestones
  claw_privateApi_monitors["/api/monitors private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_monitors
  claw_privateApi_notes["/api/notes/ private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_notes
  claw_privateApi_notifyActions["/api/notify/actions private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_notifyActions
  claw_privateApi_people["/api/people private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_people
  claw_privateApi_projects["/api/projects private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_projects
  claw_privateApi_promote["/api/promote private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_promote
  claw_privateApi_recurrences["/api/recurrences private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_recurrences
  claw_privateApi_row["/api/row private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_row
  claw_privateApi_savedViews["/api/saved-views private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_savedViews
  claw_privateApi_search["/api/search private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_search
  claw_privateApi_sections["/api/sections private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_sections
  claw_privateApi_seed["/api/seed private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_seed
  claw_privateApi_sessions["/api/sessions private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_sessions
  claw_privateApi_setup["/api/setup private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_setup
  claw_privateApi_skillsInstall["/api/skills/install private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_skillsInstall
  claw_privateApi_skillsRemove["/api/skills/remove private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_skillsRemove
  claw_privateApi_skillsSources["/api/skills/sources private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_skillsSources
  claw_privateApi_sourcesRefresh["/api/sources/refresh private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_sourcesRefresh
  claw_privateApi_stats["/api/stats private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_stats
  claw_privateApi_telegramAccount["/api/telegram/account private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_telegramAccount
  claw_privateApi_templates["/api/templates private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_templates
  claw_privateApi_timeline["/api/timeline private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_timeline
  claw_privateApi_toolsConclude["/api/tools/conclude private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_toolsConclude
  claw_privateApi_toolsGet["/api/tools/get/ private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_toolsGet
  claw_privateApi_toolsSearch["/api/tools/search private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_toolsSearch
  claw_privateApi_toolsStatus["/api/tools/status private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_toolsStatus
  claw_privateApi_tts["/api/tts private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_tts
  claw_privateApi_ttsProviders["/api/tts/providers private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_ttsProviders
  claw_privateApi_users["/api/users private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_users
  claw_privateApi_activity["/api/activity private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_activity
  claw_privateApi_appsAppIdDashboard["/api/apps/{appId}/dashboard private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_appsAppIdDashboard
  claw_privateApi_appsAppIdAssets["/api/apps/{appId}/assets private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_appsAppIdAssets
  claw_privateApi_authTest["/api/auth.test private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_authTest
  claw_privateApi_chatSessions["/api/chat/sessions private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_chatSessions
  claw_privateApi_clawStatus["/api/claw/status private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_clawStatus
  claw_privateApi_companies["/api/companies private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_companies
  claw_privateApi_config["/api/config private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_config
  claw_privateApi_configLocal["/api/config/local private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_configLocal
  claw_privateApi_connectorsSubscriptions["/api/connectors/subscriptions private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_connectorsSubscriptions
  claw_privateApi_contacts["/api/contacts private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_contacts
  claw_privateApi_data["/api/data private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_data
  claw_privateApi_dm["/api/dm private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_dm
  claw_privateApi_e2eReset["/api/e2e/reset private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_e2eReset
  claw_privateApi_e2eStatus["/api/e2e/status private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_e2eStatus
  claw_privateApi_events["/api/events private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_events
  claw_privateApi_health["/api/health private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_health
  claw_privateApi_imagesBackends["/api/images/backends private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_imagesBackends
  claw_privateApi_inbox["/api/inbox private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_inbox
  claw_privateApi_inspectPreview["/api/inspect/preview private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_inspectPreview
  claw_privateApi_integrationsSetup["/api/integrations/setup private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsSetup
  claw_privateApi_integrationsStatus["/api/integrations/status private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsStatus
  claw_privateApi_integrationsWhatsappChats["/api/integrations/whatsapp/chats private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_integrationsWhatsappChats
  claw_privateApi_memory["/api/memory private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_memory
  claw_privateApi_notes["/api/notes private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_notes
  claw_privateApi_notifyDashboard["/api/notify/dashboard private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_notifyDashboard
  claw_privateApi_personas["/api/personas private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_personas
  claw_privateApi_plugins["/api/plugins private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_plugins
  claw_privateApi_routines["/api/routines private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_routines
  claw_privateApi_rules["/api/rules private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_rules
  claw_privateApi_schema["/api/schema private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_schema
  claw_privateApi_skillsList["/api/skills/list private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_skillsList
  claw_privateApi_sources["/api/sources private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_sources
  claw_privateApi_spaces["/api/spaces private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_spaces
  claw_privateApi_summary["/api/summary private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_summary
  claw_privateApi_tasks["/api/tasks private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_tasks
  claw_privateApi_toolsSave["/api/tools/save private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_toolsSave
  claw_privateApi_ui["/api/ui private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_ui
  claw_privateApi_usage["/api/usage private API route\nprivateApiRoute"]
  claw_contracts_api --> claw_privateApi_usage
  claw_protocol_hostCommand_v1["Host command contract v1\nprotocol"]
  claw_contracts_protocol --> claw_protocol_hostCommand_v1
  clawix_protocol_bridge_v1["Clawix bridge protocol v1\nprotocol"]
  claw_contracts_protocol --> clawix_protocol_bridge_v1
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
  claw_external_mapping_event_blueskyFeedPost["app.bsky.feed.post\nexternalMapping"]
  claw_contracts_external --> claw_external_mapping_event_blueskyFeedPost
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
  claw_error_inspect_manifest_error["Inspect manifest read/parse failure\nerrorCode"]
  claw_contracts_schemas --> claw_error_inspect_manifest_error
  claw_error_inspect_codebase_manifest_error["Codebase manifest read/parse failure\nerrorCode"]
  claw_contracts_schemas --> claw_error_inspect_codebase_manifest_error
  claw_error_inspect_not_found["Inspect target not found\nerrorCode"]
  claw_contracts_schemas --> claw_error_inspect_not_found
  claw_error_usage_error["CLI usage error\nerrorCode"]
  claw_contracts_schemas --> claw_error_usage_error
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
  claw_id_resource["Opaque registered resource identifiers\nidNamespace"]
  claw_contracts_ids --> claw_id_resource
  claw_env_allowedOrigins["allowed origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_allowedOrigins
  claw_env_audioBlobsDir["audio blobs dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_audioBlobsDir
  claw_env_audioDataDir["audio data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_audioDataDir
  claw_env_audioHost["audio host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_audioHost
  claw_env_audioPort["audio port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_audioPort
  claw_env_audioSharedSecret["audio shared secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_audioSharedSecret
  claw_env_bin["bin environment variable\nenvVar"]
  claw_contracts_config --> claw_env_bin
  claw_env_calendarMock["calendar mock environment variable\nenvVar"]
  claw_contracts_config --> claw_env_calendarMock
  claw_env_codexPath["codex path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_codexPath
  claw_env_codeHome["code home environment variable\nenvVar"]
  claw_contracts_config --> claw_env_codeHome
  claw_env_companyFakeAgentRuns["company fake agent runs environment variable\nenvVar"]
  claw_contracts_config --> claw_env_companyFakeAgentRuns
  claw_env_companyOpenclawAgentId["company openclaw agent id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_companyOpenclawAgentId
  claw_env_componentsSourceDir["components source dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_componentsSourceDir
  claw_env_connectorCatalogPath["connector catalog path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_connectorCatalogPath
  claw_env_connectorSubscriptionsPath["connector subscriptions path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_connectorSubscriptionsPath
  claw_env_contentToken["content token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_contentToken
  claw_env_contentUrl["content url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_contentUrl
  claw_env_databaseAdminEmail["database admin email environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseAdminEmail
  claw_env_databaseAdminPassword["database admin password environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseAdminPassword
  claw_env_databaseCorsOrigins["database cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseCorsOrigins
  claw_env_databaseDataDir["database data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseDataDir
  claw_env_databaseDir["database dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseDir
  claw_env_databaseFilesDir["database files dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseFilesDir
  claw_env_databaseHost["database host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseHost
  claw_env_databaseJwtSecret["database jwt secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseJwtSecret
  claw_env_databaseNamespace["database namespace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseNamespace
  claw_env_databasePort["database port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databasePort
  claw_env_databaseUrl["database url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_databaseUrl
  claw_env_dataDir["data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_dataDir
  claw_env_dayRoot["day root environment variable\nenvVar"]
  claw_contracts_config --> claw_env_dayRoot
  claw_env_dbPath["db path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_dbPath
  claw_env_debugChatPerf["debug chat perf environment variable\nenvVar"]
  claw_contracts_config --> claw_env_debugChatPerf
  claw_env_demoDataDir["demo data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_demoDataDir
  claw_env_deviceTestCommand["device test command environment variable\nenvVar"]
  claw_contracts_config --> claw_env_deviceTestCommand
  claw_env_domainsActive["domains active environment variable\nenvVar"]
  claw_contracts_config --> claw_env_domainsActive
  claw_env_domainShareUrl["domain share url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_domainShareUrl
  claw_env_driveBackend["drive backend environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveBackend
  claw_env_driveBase["drive base environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveBase
  claw_env_driveCloudflared["drive cloudflared environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveCloudflared
  claw_env_driveConverterMode["drive converter mode environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveConverterMode
  claw_env_driveCorsOrigins["drive cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveCorsOrigins
  claw_env_driveDataDir["drive data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveDataDir
  claw_env_driveDbPath["drive db path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveDbPath
  claw_env_driveEmail["drive email environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveEmail
  claw_env_driveEmbedSidecar["drive embed sidecar environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveEmbedSidecar
  claw_env_driveHost["drive host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveHost
  claw_env_driveJwtSecret["drive jwt secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveJwtSecret
  claw_env_driveOcrSidecar["drive ocr sidecar environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveOcrSidecar
  claw_env_drivePassword["drive password environment variable\nenvVar"]
  claw_contracts_config --> claw_env_drivePassword
  claw_env_drivePort["drive port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_drivePort
  claw_env_drivePublicBaseUrl["drive public base url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_drivePublicBaseUrl
  claw_env_driveStatusFile["drive status file environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveStatusFile
  claw_env_driveToken["drive token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveToken
  claw_env_driveUiDistDir["drive ui dist dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_driveUiDistDir
  claw_env_e2e["e2e environment variable\nenvVar"]
  claw_contracts_config --> claw_env_e2e
  claw_env_e2eDisableExternalCalls["e2e disable external calls environment variable\nenvVar"]
  claw_contracts_config --> claw_env_e2eDisableExternalCalls
  claw_env_e2eFixtureMode["e2e fixture mode environment variable\nenvVar"]
  claw_contracts_config --> claw_env_e2eFixtureMode
  claw_env_e2eReuseServer["e2e reuse server environment variable\nenvVar"]
  claw_contracts_config --> claw_env_e2eReuseServer
  claw_env_emailMock["email mock environment variable\nenvVar"]
  claw_contracts_config --> claw_env_emailMock
  claw_env_erpDir["erp dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_erpDir
  claw_env_filesDir["files dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_filesDir
  claw_env_findCommandStrictPath["find command strict path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_findCommandStrictPath
  claw_env_guidanceDir["guidance dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_guidanceDir
  claw_env_home["home environment variable\nenvVar"]
  claw_contracts_config --> claw_env_home
  claw_env_hostAppBundle["host app bundle environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostAppBundle
  claw_env_hostAppSupportName["host app support name environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostAppSupportName
  claw_env_hostBinDir["host bin dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostBinDir
  claw_env_hostBundleId["host bundle id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostBundleId
  claw_env_hostCliName["host cli name environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostCliName
  claw_env_hostDaemonName["host daemon name environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostDaemonName
  claw_env_hostDisableSocketFallback["host disable socket fallback environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostDisableSocketFallback
  claw_env_hostDisplayName["host display name environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostDisplayName
  claw_env_hostHome["host home environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostHome
  claw_env_hostId["host id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostId
  claw_env_hostLaunchAgentsDir["host launch agents dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostLaunchAgentsDir
  claw_env_hostLaunchAgentLabel["host launch agent label environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostLaunchAgentLabel
  claw_env_hostLogSubsystem["host log subsystem environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostLogSubsystem
  claw_env_hostMachService["host mach service environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostMachService
  claw_env_hostObsidianVault["host obsidian vault environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostObsidianVault
  claw_env_hostPermissionName["host permission name environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostPermissionName
  claw_env_hostPermissionRequestDryRun["host permission request dry run environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostPermissionRequestDryRun
  claw_env_hostPermissionRequestLog["host permission request log environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostPermissionRequestLog
  claw_env_hostRuntimeTransport["host runtime transport environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostRuntimeTransport
  claw_env_hostSafe["host safe environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostSafe
  claw_env_hostTestCalendar["host test calendar environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestCalendar
  claw_env_hostTestCommand["host test command environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestCommand
  claw_env_hostTestMailbox["host test mailbox environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestMailbox
  claw_env_hostTestMode["host test mode environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestMode
  claw_env_hostTestNotesFolder["host test notes folder environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestNotesFolder
  claw_env_hostTestRemindersList["host test reminders list environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestRemindersList
  claw_env_hostTestSafariWindow["host test safari window environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestSafariWindow
  claw_env_hostTestThingsProject["host test things project environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostTestThingsProject
  claw_env_hostValidationMode["host validation mode environment variable\nenvVar"]
  claw_contracts_config --> claw_env_hostValidationMode
  claw_env_imageLibraryDir["image library dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_imageLibraryDir
  claw_env_iotBaseUrl["iot base url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_iotBaseUrl
  claw_env_iotDir["iot dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_iotDir
  claw_env_libraryDir["library dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_libraryDir
  claw_env_liveBrokerCommand["live broker command environment variable\nenvVar"]
  claw_contracts_config --> claw_env_liveBrokerCommand
  claw_env_localAdminBootstrapStdin["local admin bootstrap stdin environment variable\nenvVar"]
  claw_contracts_config --> claw_env_localAdminBootstrapStdin
  claw_env_memoryBase["memory base environment variable\nenvVar"]
  claw_contracts_config --> claw_env_memoryBase
  claw_env_memoryEditor["memory editor environment variable\nenvVar"]
  claw_contracts_config --> claw_env_memoryEditor
  claw_env_memoryHost["memory host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_memoryHost
  claw_env_memoryPort["memory port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_memoryPort
  claw_env_memoryWorkspace["memory workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_memoryWorkspace
  claw_env_monitorCollectIntervalMs["monitor collect interval ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorCollectIntervalMs
  claw_env_monitorCorsOrigins["monitor cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorCorsOrigins
  claw_env_monitorHost["monitor host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorHost
  claw_env_monitorLocalDiscoveryIntervalMs["monitor local discovery interval ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorLocalDiscoveryIntervalMs
  claw_env_monitorLocalScanPorts["monitor local scan ports environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorLocalScanPorts
  claw_env_monitorMode["monitor mode environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorMode
  claw_env_monitorPort["monitor port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorPort
  claw_env_monitorRelayToken["monitor relay token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorRelayToken
  claw_env_monitorRelayUrl["monitor relay url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorRelayUrl
  claw_env_monitorRetentionDays["monitor retention days environment variable\nenvVar"]
  claw_contracts_config --> claw_env_monitorRetentionDays
  claw_env_node["node environment variable\nenvVar"]
  claw_contracts_config --> claw_env_node
  claw_env_openclawPath["openclaw path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_openclawPath
  claw_env_openWorkspace["open workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_openWorkspace
  claw_env_previewCloudflareUrl["preview cloudflare url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_previewCloudflareUrl
  claw_env_publishingCorsOrigins["publishing cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingCorsOrigins
  claw_env_publishingDataDir["publishing data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingDataDir
  claw_env_publishingDbPath["publishing db path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingDbPath
  claw_env_publishingDir["publishing dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingDir
  claw_env_publishingDriveUrl["publishing drive url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingDriveUrl
  claw_env_publishingHealthProbeMs["publishing health probe ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingHealthProbeMs
  claw_env_publishingHost["publishing host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingHost
  claw_env_publishingLogLevel["publishing log level environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingLogLevel
  claw_env_publishingPipelineEnabled["publishing pipeline enabled environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingPipelineEnabled
  claw_env_publishingPort["publishing port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingPort
  claw_env_publishingPrintToken["publishing print token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingPrintToken
  claw_env_publishingPublicBaseUrl["publishing public base url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingPublicBaseUrl
  claw_env_publishingRecurrenceTickMs["publishing recurrence tick ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingRecurrenceTickMs
  claw_env_publishingSchedulerTickMs["publishing scheduler tick ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingSchedulerTickMs
  claw_env_publishingStatusFile["publishing status file environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingStatusFile
  claw_env_publishingToken["publishing token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingToken
  claw_env_publishingTokenStore["publishing token store environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingTokenStore
  claw_env_publishingUrl["publishing url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingUrl
  claw_env_publishingVaultUrl["publishing vault url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingVaultUrl
  claw_env_publishingWorkerTickMs["publishing worker tick ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingWorkerTickMs
  claw_env_publishingWorkspace["publishing workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_publishingWorkspace
  claw_env_relayAccessToken["relay access token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_relayAccessToken
  claw_env_relayAgentId["relay agent id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_relayAgentId
  claw_env_relayTenantId["relay tenant id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_relayTenantId
  claw_env_relayUrl["relay url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_relayUrl
  claw_env_relayWorkspaceId["relay workspace id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_relayWorkspaceId
  claw_env_reportGithubToken["report github token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_reportGithubToken
  claw_env_resourcesDir["resources dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_resourcesDir
  claw_env_rulesDir["rules dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_rulesDir
  claw_env_runtimeHome["runtime home environment variable\nenvVar"]
  claw_contracts_config --> claw_env_runtimeHome
  claw_env_runtimePort["runtime port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_runtimePort
  claw_env_runtimeSessionsUrl["runtime sessions url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_runtimeSessionsUrl
  claw_env_searchAdminToken["search admin token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchAdminToken
  claw_env_searchBase["search base environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchBase
  claw_env_searchCodexBinary["search codex binary environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchCodexBinary
  claw_env_searchCorsOrigins["search cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchCorsOrigins
  claw_env_searchDataDir["search data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchDataDir
  claw_env_searchHost["search host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchHost
  claw_env_searchJwtSecret["search jwt secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchJwtSecret
  claw_env_searchPort["search port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchPort
  claw_env_searchRunTimeoutMs["search run timeout ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchRunTimeoutMs
  claw_env_searchSchedulerTickMs["search scheduler tick ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchSchedulerTickMs
  claw_env_searchToken["search token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchToken
  claw_env_searchWorkerConcurrency["search worker concurrency environment variable\nenvVar"]
  claw_contracts_config --> claw_env_searchWorkerConcurrency
  claw_env_secretsAdminToken["secrets admin token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsAdminToken
  claw_env_secretsBackend["secrets backend environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsBackend
  claw_env_secretsBase["secrets base environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsBase
  claw_env_secretsBaseUrl["secrets base url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsBaseUrl
  claw_env_secretsBootstrapStdin["secrets bootstrap stdin environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsBootstrapStdin
  claw_env_secretsCorsOrigins["secrets cors origins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsCorsOrigins
  claw_env_secretsDataDir["secrets data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsDataDir
  claw_env_secretsDbPath["secrets db path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsDbPath
  claw_env_secretsEnableUnsafeExternalPlugins["secrets enable unsafe external plugins environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsEnableUnsafeExternalPlugins
  claw_env_secretsHost["secrets host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsHost
  claw_env_secretsHostAssertionKeyBase64["secrets host assertion key base64 environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsHostAssertionKeyBase64
  claw_env_secretsJwtSecret["secrets jwt secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsJwtSecret
  claw_env_secretsKekBase64["secrets kek base64 environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsKekBase64
  claw_env_secretsPluginsDir["secrets plugins dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsPluginsDir
  claw_env_secretsPort["secrets port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsPort
  claw_env_secretsProxyPath["secrets proxy path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsProxyPath
  claw_env_secretsPublicBaseUrl["secrets public base url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsPublicBaseUrl
  claw_env_secretsSidecarPath["secrets sidecar path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsSidecarPath
  claw_env_secretsSignedHostToken["secrets signed host token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsSignedHostToken
  claw_env_secretsTenant["secrets tenant environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsTenant
  claw_env_secretsTenantId["secrets tenant id environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsTenantId
  claw_env_secretsToken["secrets token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsToken
  claw_env_secretsUiDistDir["secrets ui dist dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_secretsUiDistDir
  claw_env_sessionsCodexDir["sessions codex dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsCodexDir
  claw_env_sessionsDataDir["sessions data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsDataDir
  claw_env_sessionsDisableCodex["sessions disable codex environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsDisableCodex
  claw_env_sessionsDisableHermes["sessions disable hermes environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsDisableHermes
  claw_env_sessionsHermesDb["sessions hermes db environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsHermesDb
  claw_env_sessionsHost["sessions host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsHost
  claw_env_sessionsPort["sessions port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsPort
  claw_env_sessionsSharedSecret["sessions shared secret environment variable\nenvVar"]
  claw_contracts_config --> claw_env_sessionsSharedSecret
  claw_env_skillsAutoImport["skills auto import environment variable\nenvVar"]
  claw_contracts_config --> claw_env_skillsAutoImport
  claw_env_slidesDisableBrowser["slides disable browser environment variable\nenvVar"]
  claw_contracts_config --> claw_env_slidesDisableBrowser
  claw_env_telegramBackend["telegram backend environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramBackend
  claw_env_telegramDomainShareUrl["telegram domain share url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramDomainShareUrl
  claw_env_telegramHost["telegram host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramHost
  claw_env_telegramLogLevel["telegram log level environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramLogLevel
  claw_env_telegramPort["telegram port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramPort
  claw_env_telegramWorkspace["telegram workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_telegramWorkspace
  claw_env_templateDisableBrowser["template disable browser environment variable\nenvVar"]
  claw_contracts_config --> claw_env_templateDisableBrowser
  claw_env_testLive["test live environment variable\nenvVar"]
  claw_contracts_config --> claw_env_testLive
  claw_env_testLivePackage["test live package environment variable\nenvVar"]
  claw_contracts_config --> claw_env_testLivePackage
  claw_env_testWorkspace["test workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_testWorkspace
  claw_env_timeDataDir["time data dir environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeDataDir
  claw_env_timeDbFile["time db file environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeDbFile
  claw_env_timeDefaultTimezone["time default timezone environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeDefaultTimezone
  claw_env_timeHost["time host environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeHost
  claw_env_timeNotifySourceToken["time notify source token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeNotifySourceToken
  claw_env_timeNotifyUrl["time notify url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeNotifyUrl
  claw_env_timePort["time port environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timePort
  claw_env_timeSchedulerIntervalMs["time scheduler interval ms environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeSchedulerIntervalMs
  claw_env_timeToken["time token environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeToken
  claw_env_timeUrl["time url environment variable\nenvVar"]
  claw_contracts_config --> claw_env_timeUrl
  claw_env_wacliPath["wacli path environment variable\nenvVar"]
  claw_contracts_config --> claw_env_wacliPath
  claw_env_workspace["workspace environment variable\nenvVar"]
  claw_contracts_config --> claw_env_workspace
  claw_package_core["ClawJS core package\npackageName"]
  claw_contracts_packages --> claw_package_core
  claw_package_cli["Claw CLI package\npackageName"]
  claw_contracts_packages --> claw_package_cli
  claw_package_claw["Claw SDK package\npackageName"]
  claw_contracts_packages --> claw_package_claw
  claw_package_workspace["Workspace package\npackageName"]
  claw_contracts_packages --> claw_package_workspace
  claw_package_node["Node runtime package\npackageName"]
  claw_contracts_packages --> claw_package_node
  claw_package_database["Database package\npackageName"]
  claw_contracts_packages --> claw_package_database
  claw_package_agents["Agents package\npackageName"]
  claw_contracts_packages --> claw_package_agents
  claw_package_integrations["Integrations package\npackageName"]
  claw_contracts_packages --> claw_package_integrations
  claw_package_marketplace["Marketplace package\npackageName"]
  claw_contracts_packages --> claw_package_marketplace
  claw_package_profile["Profile package\npackageName"]
  claw_contracts_packages --> claw_package_profile
  claw_package_audio["Audio package\npackageName"]
  claw_contracts_packages --> claw_package_audio
  claw_package_sessions["Sessions package\npackageName"]
  claw_contracts_packages --> claw_package_sessions
  claw_package_userModel["User model package\npackageName"]
  claw_contracts_packages --> claw_package_userModel
  claw_package_runtime["Runtime package\npackageName"]
  claw_contracts_packages --> claw_package_runtime
  claw_package_sandbox["Sandbox package\npackageName"]
  claw_contracts_packages --> claw_package_sandbox
  claw_package_mcp["MCP package\npackageName"]
  claw_contracts_packages --> claw_package_mcp
  claw_package_voice["Voice package\npackageName"]
  claw_contracts_packages --> claw_package_voice
  claw_package_channelBase["Channel base package\npackageName"]
  claw_contracts_packages --> claw_package_channelBase
  claw_package_mesh["Mesh package\npackageName"]
  claw_contracts_packages --> claw_package_mesh
  claw_package_signals["Signals package\npackageName"]
  claw_contracts_packages --> claw_package_signals
  claw_package_signalsCore["Signals core package\npackageName"]
  claw_contracts_packages --> claw_package_signalsCore
  claw_package_createApp["Create Claw app generator\npackageName"]
  claw_contracts_packages --> claw_package_createApp
  claw_package_createAgent["Create Claw agent generator\npackageName"]
  claw_contracts_packages --> claw_package_createAgent
  claw_package_createServer["Create Claw server generator\npackageName"]
  claw_contracts_packages --> claw_package_createServer
  claw_package_createPlugin["Create Claw plugin generator\npackageName"]
  claw_contracts_packages --> claw_package_createPlugin
  claw_package_eslintConfig["ESLint config package\npackageName"]
  claw_contracts_packages --> claw_package_eslintConfig
  claw_package_bin_claw["Public framework CLI\npackageBin"]
  claw_contracts_packages --> claw_package_bin_claw
  claw_package_bin_createClawApp["Create app generator CLI\npackageBin"]
  claw_contracts_packages --> claw_package_bin_createClawApp
  claw_package_bin_createClawAgent["Create agent generator CLI\npackageBin"]
  claw_contracts_packages --> claw_package_bin_createClawAgent
  claw_package_bin_createClawServer["Create server generator CLI\npackageBin"]
  claw_contracts_packages --> claw_package_bin_createClawServer
  claw_package_bin_createClawPlugin["Create plugin generator CLI\npackageBin"]
  claw_contracts_packages --> claw_package_bin_createClawPlugin
  claw_format_export["General Claw export archive\nfileFormat"]
  claw_contracts_formats --> claw_format_export
  claw_format_backup["Full restorable Claw backup archive\nfileFormat"]
  claw_contracts_formats --> claw_format_backup
  claw_format_secrets["Encrypted secrets backup archive\nfileFormat"]
  claw_contracts_formats --> claw_format_secrets
  claw_format_archiveManifest["Internal archive manifest file\nfileFormat"]
  claw_contracts_formats --> claw_format_archiveManifest
  claw_native_app_bundle["Public placeholder Claw.app bundle identifier\nnativeIdentity"]
  claw_contracts_native --> claw_native_app_bundle
  claw_native_host_launchAgent["Public placeholder Claw host LaunchAgent label\nnativeIdentity"]
  claw_contracts_native --> claw_native_host_launchAgent
  claw_native_host_machService["Public placeholder Claw host Mach service\nnativeIdentity"]
  claw_contracts_native --> claw_native_host_machService
  clawix_native_app_bundle["Public placeholder Clawix bundle identifier\nnativeIdentity"]
  claw_contracts_native --> clawix_native_app_bundle
  clawix_native_bridge_launchAgent["Clawix bridge LaunchAgent/service suite label\nnativeIdentity"]
  claw_contracts_native --> clawix_native_bridge_launchAgent
  clawix_native_bridge_service["Clawix bridge service name\nnativeIdentity"]
  claw_contracts_native --> clawix_native_bridge_service
  clawix_native_bridge_bonjour["Clawix bridge Bonjour service type\nnativeIdentity"]
  claw_contracts_native --> clawix_native_bridge_bonjour
  clawix_native_bridge_pipe["Clawix bridge Windows pipe\nnativeIdentity"]
  claw_contracts_native --> clawix_native_bridge_pipe
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
  claw_cli_command_contacts["contacts\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_contacts
  claw_cli_command_inspect["inspect\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_inspect
  claw_cli_command_search["search\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_search
  claw_cli_command_signals["signals\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_signals
  claw_cli_command_life["life\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_life
  claw_cli_command_report["report\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_report
  claw_cli_command_needs["needs\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_needs
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
  claw_cli_command_agents["agents\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_agents
  claw_cli_command_personalities["personalities\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_personalities
  claw_cli_command_skills["skills\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_skills
  claw_cli_command_skill_collections["skill-collections\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_skill_collections
  claw_cli_command_connections["connections\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_connections
  claw_cli_command_snippets["snippets\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_snippets
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
  claw_cli_command_connectors["connectors\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_connectors
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
  claw_cli_command_marketplace["marketplace\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_marketplace
  claw_cli_command_content["content\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_content
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
  claw_cli_command_guidance["guidance\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_guidance
  claw_cli_command_resources["resources\ncliCommand"]
  claw_contracts_cli --> claw_cli_command_resources
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
  claw_cli_flag_guidance["--guidance\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_guidance
  claw_cli_flag_actor_assertion["--actor-assertion\ncliFlag"]
  claw_contracts_cli --> claw_cli_flag_actor_assertion
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
  claw_workspace_browserProfileCache["browserProfileCache\nfolder"]
  claw_workspace --> claw_workspace_browserProfileCache
  claw_workspace_demoCache["demoCache\nfolder"]
  claw_workspace --> claw_workspace_demoCache
  claw_workspace_e2eCache["e2eCache\nfolder"]
  claw_workspace --> claw_workspace_e2eCache
  claw_workspace_styles["styles\nfolder"]
  claw_workspace --> claw_workspace_styles
  claw_workspace_templates["templates\nfolder"]
  claw_workspace --> claw_workspace_templates
  claw_workspace_references["references\nfolder"]
  claw_workspace --> claw_workspace_references
  claw_workspace_reports["reports\nfolder"]
  claw_workspace --> claw_workspace_reports
  claw_workspace_reports_governance_state["report governance state\nfile"]
  claw_workspace_reports --> claw_workspace_reports_governance_state
  claw_workspace_need_routes["need-routes\nfolder"]
  claw_workspace --> claw_workspace_need_routes
  claw_workspace_need_routes_ledger["need route lab ledger\nfile"]
  claw_workspace_need_routes --> claw_workspace_need_routes_ledger
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
  claw_global_guidance["guidance\nfolder"]
  claw_global --> claw_global_guidance
  claw_global_resources["resources\nfolder"]
  claw_global --> claw_global_resources
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
  claw_browserStorage_showcaseTheme["showcaseTheme\nbrowserStorageKey"]
  claw_contracts_schemas --> claw_browserStorage_showcaseTheme
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
  claw_database_core_table_connector_providers["connector_providers\ntable"]
  claw_database_core --> claw_database_core_table_connector_providers
  claw_database_core_table_connector_external_principals["connector_external_principals\ntable"]
  claw_database_core --> claw_database_core_table_connector_external_principals
  claw_database_core_table_connector_credential_bindings["connector_credential_bindings\ntable"]
  claw_database_core --> claw_database_core_table_connector_credential_bindings
  claw_database_core_table_connector_capabilities["connector_capabilities\ntable"]
  claw_database_core --> claw_database_core_table_connector_capabilities
  claw_database_core_table_connector_operations["connector_operations\ntable"]
  claw_database_core --> claw_database_core_table_connector_operations
  claw_database_core_table_connector_policies["connector_policies\ntable"]
  claw_database_core --> claw_database_core_table_connector_policies
  claw_database_core_table_connector_budgets["connector_budgets\ntable"]
  claw_database_core --> claw_database_core_table_connector_budgets
  claw_database_core_table_connector_network_policies["connector_network_policies\ntable"]
  claw_database_core --> claw_database_core_table_connector_network_policies
  claw_database_core_table_connector_audit_events["connector_audit_events\ntable"]
  claw_database_core --> claw_database_core_table_connector_audit_events
  claw_database_core_table_personalities["personalities\ntable"]
  claw_database_core --> claw_database_core_table_personalities
  claw_database_core_table_provider_routing["provider_routing\ntable"]
  claw_database_core --> claw_database_core_table_provider_routing
  claw_database_core_table_provider_settings["provider_settings\ntable"]
  claw_database_core --> claw_database_core_table_provider_settings
  claw_database_core_table_snippets["snippets\ntable"]
  claw_database_core --> claw_database_core_table_snippets
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
  claw_database_core_index_app_projects_resource_id_idx["app_projects_resource_id_idx\nindex"]
  claw_database_core --> claw_database_core_index_app_projects_resource_id_idx
  claw_database_core_index_app_sidebar_snapshots_order_idx["app_sidebar_snapshots_order_idx\nindex"]
  claw_database_core --> claw_database_core_index_app_sidebar_snapshots_order_idx
  claw_database_core_index_connector_external_principals_provider_idx["connector_external_principals_provider_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_external_principals_provider_idx
  claw_database_core_index_connector_credential_bindings_provider_idx["connector_credential_bindings_provider_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_credential_bindings_provider_idx
  claw_database_core_index_connector_capabilities_domain_idx["connector_capabilities_domain_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_capabilities_domain_idx
  claw_database_core_index_connector_operations_provider_idx["connector_operations_provider_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_operations_provider_idx
  claw_database_core_index_connector_operations_support_idx["connector_operations_support_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_operations_support_idx
  claw_database_core_index_connector_budgets_scope_idx["connector_budgets_scope_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_budgets_scope_idx
  claw_database_core_index_connector_network_policies_egress_idx["connector_network_policies_egress_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_network_policies_egress_idx
  claw_database_core_index_connector_audit_events_request_idx["connector_audit_events_request_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_audit_events_request_idx
  claw_database_core_index_connector_audit_events_provider_idx["connector_audit_events_provider_idx\nindex"]
  claw_database_core --> claw_database_core_index_connector_audit_events_provider_idx
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
  claw_database_vault_table_connector_raw_trace_refs["connector_raw_trace_refs\ntable"]
  claw_database_vault --> claw_database_vault_table_connector_raw_trace_refs
  claw_database_vault_index_connector_raw_trace_refs_audit_idx["connector_raw_trace_refs_audit_idx\nindex"]
  claw_database_vault --> claw_database_vault_index_connector_raw_trace_refs_audit_idx
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
  clawix_ui_chat -- "consumes" --> clawix_bridge_local
  clawix_bridge_local -- "brokers" --> claw_daemon_local
  claw_daemon_local -- "brokers" --> claw_runtime_agent
  claw_runtime_agent -- "owns" --> claw_sessions
  claw_sessions -- "exposes" --> clawix_bridge_local
  clawix_bridge_local -- "exposes" --> clawix_ui_chat
  clawix_companion_client -- "consumes" --> clawix_bridge_local
  clawix_bridge_local -- "exposes" --> clawix_companion_client
  claw_remote_client -- "consumes" --> claw_relay
  claw_relay -- "brokers" --> claw_relay_connector
  claw_relay_connector -- "brokers" --> claw_workspace
  claw_relay_connector -- "brokers" --> claw_runtime_agent
  claw_sessions -- "exposes" --> claw_relay
  claw_relay -- "exposes" --> claw_remote_client
```

## Routes

| ID | From | To | Visibility | Validation |
| --- | --- | --- | --- | --- |
| `chat.localDesktop` | `clawix.ui.chat` | `claw.sessions` | internal | Fixture + hermetic E2E for local desktop chat |
| `chat.companionBridge` | `clawix.companion.client` | `claw.sessions` | public | Fixture + hermetic E2E for companion bridge traffic |
| `chat.remoteRelay` | `claw.remote.client` | `claw.sessions` | external | Fixture + hermetic Relay E2E without production services |

## Edges

| ID | Type | From | To | Contract | Transport |
| --- | --- | --- | --- | --- | --- |
| `claw.edge.chat.ui.consumes.bridge` | consumes | `clawix.ui.chat` | `clawix.bridge.local` | `clawix.protocol.bridge.v1` | local bridge RPC |
| `claw.edge.bridge.brokers.daemon` | brokers | `clawix.bridge.local` | `claw.daemon.local` | `claw.protocol.hostCommand.v1` | localhost/process bridge |
| `claw.edge.daemon.brokers.runtime` | brokers | `claw.daemon.local` | `claw.runtime.agent` | `claw.protocol.hostCommand.v1` | framework runtime adapter |
| `claw.edge.runtime.owns.sessions` | owns | `claw.runtime.agent` | `claw.sessions` | `claw.database.sessions` | sessions service/events |
| `claw.edge.sessions.exposes.bridge` | exposes | `claw.sessions` | `clawix.bridge.local` | `claw.event.sessions.message.appended` | session event frames |
| `claw.edge.bridge.exposes.ui` | exposes | `clawix.bridge.local` | `clawix.ui.chat` | `clawix.protocol.bridge.v1` | local bridge RPC |
| `claw.edge.companion.consumes.bridge` | consumes | `clawix.companion.client` | `clawix.bridge.local` | `clawix.protocol.bridge.v1` | WebSocket localhost:24080 |
| `claw.edge.bridge.exposes.companion` | exposes | `clawix.bridge.local` | `clawix.companion.client` | `clawix.protocol.bridge.v1` | WebSocket localhost:24080 |
| `claw.edge.remote.consumes.relay` | consumes | `claw.remote.client` | `claw.relay` | `claw.api.relay.remote` | HTTPS/WebSocket Relay |
| `claw.edge.relay.brokers.connector` | brokers | `claw.relay` | `claw.relay.connector` | `claw.api.relay.connector` | connector WebSocket |
| `claw.edge.connector.brokers.workspace` | brokers | `claw.relay.connector` | `claw.workspace` | `claw.workspace.manifest` | workspace materialization |
| `claw.edge.connector.brokers.runtime` | brokers | `claw.relay.connector` | `claw.runtime.agent` | `claw.protocol.hostCommand.v1` | local runtime adapter |
| `claw.edge.sessions.exposes.relay` | exposes | `claw.sessions` | `claw.relay` | `claw.event.sessions.message.appended` | remote-safe session events |
| `claw.edge.relay.exposes.remote` | exposes | `claw.relay` | `claw.remote.client` | `claw.api.relay.remote` | HTTPS/WebSocket Relay |

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
| `claw.contracts.config` | root | config | claw |  | cli, serviceApi | humanUi:optional | `contracts/config` |
| `claw.contracts.packages` | root | package | claw |  | sdk, cli | humanUi:optional | `contracts/packages` |
| `claw.contracts.native` | root | native | claw |  | humanUi, serviceApi | humanUi:optional | `contracts/native` |
| `claw.contracts.formats` | root | format | claw |  | cli, persistence | humanUi:optional | `contracts/formats` |
| `claw.contracts.external` | root | external | claw |  | sdk, serviceApi, mcp | humanUi:optional | `contracts/external` |
| `claw.cli.public` | root | protocol | claw | humanUi | cli |  | `claw` |
| `claw.mcp.surface` | root | protocol | claw | humanUi | mcp, sdk, serviceApi |  | `mcp` |
| `claw.storage.canonical` | root | protocol | claw | humanUi | sdk, cli, serviceApi, persistence |  | `storage` |
| `claw.host.signed` | root | protocol | claw | humanUi | cli, serviceApi |  | `host` |
| `claw.host.permissions` | root | protocol | claw | humanUi | cli, serviceApi |  | `host/permissions` |
| `claw.host.grants` | root | protocol | claw | humanUi | cli, serviceApi |  | `host/grants` |
| `claw.host.approvals` | root | protocol | claw | humanUi | cli, serviceApi |  | `host/approvals` |
| `claw.host.audit` | root | protocol | claw | humanUi | cli, serviceApi, persistence |  | `host/audit` |
| `clawix.ui.chat` | root | protocol | clawix | humanUi | serviceApi |  | `Clawix/chat` |
| `clawix.companion.client` | root | protocol | clawix | humanUi | serviceApi |  | `Clawix/companion` |
| `clawix.bridge.local` | root | protocol | clawix | humanUi | serviceApi |  | `clawix-bridge` |
| `claw.daemon.local` | root | protocol | claw | humanUi | sdk, serviceApi, cli |  | `daemon` |
| `claw.runtime.agent` | root | protocol | claw | humanUi | sdk, cli, serviceApi, mcp |  | `runtime/agent` |
| `claw.sessions` | root | protocol | claw | humanUi | sdk, cli, serviceApi, persistence |  | `sessions` |
| `claw.remote.client` | root | protocol | external | humanUi | relay |  | `remote-client` |
| `claw.relay` | root | protocol | claw | humanUi | relay, serviceApi |  | `relay` |
| `claw.relay.connector` | root | protocol | claw | humanUi | relay, serviceApi |  | `relay/connector` |
| `claw.api.chatCompletions` | apiRoute | api | claw |  |  |  | `/v1/chat/completions` |
| `claw.api.app` | apiRoute | api | claw |  |  |  | `/v1/app/` |
| `claw.api.connectorConnect` | apiRoute | api | claw |  |  |  | `/v1/connector/connect` |
| `claw.api.families` | apiRoute | api | claw |  |  |  | `/v1/families` |
| `claw.api.meDevices` | apiRoute | api | claw |  |  |  | `/v1/me/devices` |
| `claw.api.responses` | apiRoute | api | claw |  |  |  | `/v1/responses` |
| `claw.api.secrets` | apiRoute | api | claw |  |  |  | `/v1/secrets` |
| `claw.api.secretsSetup` | apiRoute | api | claw |  |  |  | `/v1/secrets/setup` |
| `claw.api.storage` | apiRoute | api | claw |  |  |  | `/v1/storage` |
| `claw.api.storageObjectsWorkspaceAgentsAgentARemoteNoteTxt` | apiRoute | api | claw |  |  |  | `/v1/storage/objects/workspace/agents/agent-a/remote/note.txt` |
| `claw.api.itemsItem1Shares` | apiRoute | api | claw |  |  |  | `/v1/items/item-1/shares` |
| `claw.api.itemsItem1SharesShare1Revoke` | apiRoute | api | claw |  |  |  | `/v1/items/item-1/shares/share-1/revoke` |
| `claw.api.storageShares` | apiRoute | api | claw |  |  |  | `/v1/storage/shares` |
| `claw.api.systemStatus` | apiRoute | api | claw |  |  |  | `/v1/system/status` |
| `claw.api.uploads` | apiRoute | api | claw |  |  |  | `/v1/uploads` |
| `claw.api.workspaces` | apiRoute | api | claw |  |  |  | `/v1/workspaces` |
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
| `claw.api.relay.remote` | apiRoute | api | claw |  |  |  | `/v1/relay/remote` |
| `claw.api.relay.connector` | apiRoute | api | claw |  |  |  | `/v1/relay/connectors` |
| `claw.privateApi.attachments` | privateApiRoute | api | claw |  |  |  | `/api/attachments` |
| `claw.privateApi.authToken` | privateApiRoute | api | claw |  |  |  | `/api/auth/token` |
| `claw.privateApi.capture` | privateApiRoute | api | claw |  |  |  | `/api/capture` |
| `claw.privateApi.captures` | privateApiRoute | api | claw |  |  |  | `/api/captures` |
| `claw.privateApi.chatFeedback` | privateApiRoute | api | claw |  |  |  | `/api/chat/feedback` |
| `claw.privateApi.comments` | privateApiRoute | api | claw |  |  |  | `/api/comments` |
| `claw.privateApi.configProfile` | privateApiRoute | api | claw |  |  |  | `/api/config/profile` |
| `claw.privateApi.configReset` | privateApiRoute | api | claw |  |  |  | `/api/config/reset` |
| `claw.privateApi.configWorkspaceFiles` | privateApiRoute | api | claw |  |  |  | `/api/config/workspace-files` |
| `claw.privateApi.connectorsCatalog` | privateApiRoute | api | claw |  |  |  | `/api/connectors/catalog` |
| `claw.privateApi.context` | privateApiRoute | api | claw |  |  |  | `/api/context` |
| `claw.privateApi.customFields` | privateApiRoute | api | claw |  |  |  | `/api/custom-fields` |
| `claw.privateApi.cycles` | privateApiRoute | api | claw |  |  |  | `/api/cycles` |
| `claw.privateApi.discoverLocal` | privateApiRoute | api | claw |  |  |  | `/api/discover/local` |
| `claw.privateApi.e2eSeed` | privateApiRoute | api | claw |  |  |  | `/api/e2e/seed` |
| `claw.privateApi.epics` | privateApiRoute | api | claw |  |  |  | `/api/epics` |
| `claw.privateApi.export` | privateApiRoute | api | claw |  |  |  | `/api/export` |
| `claw.privateApi.fieldValues` | privateApiRoute | api | claw |  |  |  | `/api/field-values` |
| `claw.privateApi.goals` | privateApiRoute | api | claw |  |  |  | `/api/goals` |
| `claw.privateApi.graph` | privateApiRoute | api | claw |  |  |  | `/api/graph` |
| `claw.privateApi.hotTopicsSeed` | privateApiRoute | api | claw |  |  |  | `/api/hot-topics/seed` |
| `claw.privateApi.images` | privateApiRoute | api | claw |  |  |  | `/api/images` |
| `claw.privateApi.instances` | privateApiRoute | api | claw |  |  |  | `/api/instances` |
| `claw.privateApi.integrationsAuth` | privateApiRoute | api | claw |  |  |  | `/api/integrations/auth` |
| `claw.privateApi.integrationsEnable` | privateApiRoute | api | claw |  |  |  | `/api/integrations/enable` |
| `claw.privateApi.integrationsGateway` | privateApiRoute | api | claw |  |  |  | `/api/integrations/gateway` |
| `claw.privateApi.integrationsInstall` | privateApiRoute | api | claw |  |  |  | `/api/integrations/install` |
| `claw.privateApi.integrationsInstallStream` | privateApiRoute | api | claw |  |  |  | `/api/integrations/install-stream` |
| `claw.privateApi.integrationsReveal` | privateApiRoute | api | claw |  |  |  | `/api/integrations/reveal` |
| `claw.privateApi.integrationsSlackConnect` | privateApiRoute | api | claw |  |  |  | `/api/integrations/slack/connect` |
| `claw.privateApi.integrationsSlackTest` | privateApiRoute | api | claw |  |  |  | `/api/integrations/slack/test` |
| `claw.privateApi.integrationsTelegramConnect` | privateApiRoute | api | claw |  |  |  | `/api/integrations/telegram/connect` |
| `claw.privateApi.integrationsTelegramTest` | privateApiRoute | api | claw |  |  |  | `/api/integrations/telegram/test` |
| `claw.privateApi.integrationsUninstall` | privateApiRoute | api | claw |  |  |  | `/api/integrations/uninstall` |
| `claw.privateApi.integrationsWhatsappCleanup` | privateApiRoute | api | claw |  |  |  | `/api/integrations/whatsapp/cleanup` |
| `claw.privateApi.integrationsWhatsappConnect` | privateApiRoute | api | claw |  |  |  | `/api/integrations/whatsapp/connect` |
| `claw.privateApi.lists` | privateApiRoute | api | claw |  |  |  | `/api/lists` |
| `claw.privateApi.memoryPerson` | privateApiRoute | api | claw |  |  |  | `/api/memory/person` |
| `claw.privateApi.milestones` | privateApiRoute | api | claw |  |  |  | `/api/milestones` |
| `claw.privateApi.monitors` | privateApiRoute | api | claw |  |  |  | `/api/monitors` |
| `claw.privateApi.notes` | privateApiRoute | api | claw |  |  |  | `/api/notes/` |
| `claw.privateApi.notifyActions` | privateApiRoute | api | claw |  |  |  | `/api/notify/actions` |
| `claw.privateApi.people` | privateApiRoute | api | claw |  |  |  | `/api/people` |
| `claw.privateApi.projects` | privateApiRoute | api | claw |  |  |  | `/api/projects` |
| `claw.privateApi.promote` | privateApiRoute | api | claw |  |  |  | `/api/promote` |
| `claw.privateApi.recurrences` | privateApiRoute | api | claw |  |  |  | `/api/recurrences` |
| `claw.privateApi.row` | privateApiRoute | api | claw |  |  |  | `/api/row` |
| `claw.privateApi.savedViews` | privateApiRoute | api | claw |  |  |  | `/api/saved-views` |
| `claw.privateApi.search` | privateApiRoute | api | claw |  |  |  | `/api/search` |
| `claw.privateApi.sections` | privateApiRoute | api | claw |  |  |  | `/api/sections` |
| `claw.privateApi.seed` | privateApiRoute | api | claw |  |  |  | `/api/seed` |
| `claw.privateApi.sessions` | privateApiRoute | api | claw |  |  |  | `/api/sessions` |
| `claw.privateApi.setup` | privateApiRoute | api | claw |  |  |  | `/api/setup` |
| `claw.privateApi.skillsInstall` | privateApiRoute | api | claw |  |  |  | `/api/skills/install` |
| `claw.privateApi.skillsRemove` | privateApiRoute | api | claw |  |  |  | `/api/skills/remove` |
| `claw.privateApi.skillsSources` | privateApiRoute | api | claw |  |  |  | `/api/skills/sources` |
| `claw.privateApi.sourcesRefresh` | privateApiRoute | api | claw |  |  |  | `/api/sources/refresh` |
| `claw.privateApi.stats` | privateApiRoute | api | claw |  |  |  | `/api/stats` |
| `claw.privateApi.telegramAccount` | privateApiRoute | api | claw |  |  |  | `/api/telegram/account` |
| `claw.privateApi.templates` | privateApiRoute | api | claw |  |  |  | `/api/templates` |
| `claw.privateApi.timeline` | privateApiRoute | api | claw |  |  |  | `/api/timeline` |
| `claw.privateApi.toolsConclude` | privateApiRoute | api | claw |  |  |  | `/api/tools/conclude` |
| `claw.privateApi.toolsGet` | privateApiRoute | api | claw |  |  |  | `/api/tools/get/` |
| `claw.privateApi.toolsSearch` | privateApiRoute | api | claw |  |  |  | `/api/tools/search` |
| `claw.privateApi.toolsStatus` | privateApiRoute | api | claw |  |  |  | `/api/tools/status` |
| `claw.privateApi.tts` | privateApiRoute | api | claw |  |  |  | `/api/tts` |
| `claw.privateApi.ttsProviders` | privateApiRoute | api | claw |  |  |  | `/api/tts/providers` |
| `claw.privateApi.users` | privateApiRoute | api | claw |  |  |  | `/api/users` |
| `claw.privateApi.activity` | privateApiRoute | api | claw |  |  |  | `/api/activity` |
| `claw.privateApi.appsAppIdDashboard` | privateApiRoute | api | claw |  |  |  | `/api/apps/{appId}/dashboard` |
| `claw.privateApi.appsAppIdAssets` | privateApiRoute | api | claw |  |  |  | `/api/apps/{appId}/assets` |
| `claw.privateApi.authTest` | privateApiRoute | api | claw |  |  |  | `/api/auth.test` |
| `claw.privateApi.chatSessions` | privateApiRoute | api | claw |  |  |  | `/api/chat/sessions` |
| `claw.privateApi.clawStatus` | privateApiRoute | api | claw |  |  |  | `/api/claw/status` |
| `claw.privateApi.companies` | privateApiRoute | api | claw |  |  |  | `/api/companies` |
| `claw.privateApi.config` | privateApiRoute | api | claw |  |  |  | `/api/config` |
| `claw.privateApi.configLocal` | privateApiRoute | api | claw |  |  |  | `/api/config/local` |
| `claw.privateApi.connectorsSubscriptions` | privateApiRoute | api | claw |  |  |  | `/api/connectors/subscriptions` |
| `claw.privateApi.contacts` | privateApiRoute | api | claw |  |  |  | `/api/contacts` |
| `claw.privateApi.data` | privateApiRoute | api | claw |  |  |  | `/api/data` |
| `claw.privateApi.dm` | privateApiRoute | api | claw |  |  |  | `/api/dm` |
| `claw.privateApi.e2eReset` | privateApiRoute | api | claw |  |  |  | `/api/e2e/reset` |
| `claw.privateApi.e2eStatus` | privateApiRoute | api | claw |  |  |  | `/api/e2e/status` |
| `claw.privateApi.events` | privateApiRoute | api | claw |  |  |  | `/api/events` |
| `claw.privateApi.health` | privateApiRoute | api | claw |  |  |  | `/api/health` |
| `claw.privateApi.imagesBackends` | privateApiRoute | api | claw |  |  |  | `/api/images/backends` |
| `claw.privateApi.inbox` | privateApiRoute | api | claw |  |  |  | `/api/inbox` |
| `claw.privateApi.inspectPreview` | privateApiRoute | api | claw |  |  |  | `/api/inspect/preview` |
| `claw.privateApi.integrationsSetup` | privateApiRoute | api | claw |  |  |  | `/api/integrations/setup` |
| `claw.privateApi.integrationsStatus` | privateApiRoute | api | claw |  |  |  | `/api/integrations/status` |
| `claw.privateApi.integrationsWhatsappChats` | privateApiRoute | api | claw |  |  |  | `/api/integrations/whatsapp/chats` |
| `claw.privateApi.memory` | privateApiRoute | api | claw |  |  |  | `/api/memory` |
| `claw.privateApi.notes` | privateApiRoute | api | claw |  |  |  | `/api/notes` |
| `claw.privateApi.notifyDashboard` | privateApiRoute | api | claw |  |  |  | `/api/notify/dashboard` |
| `claw.privateApi.personas` | privateApiRoute | api | claw |  |  |  | `/api/personas` |
| `claw.privateApi.plugins` | privateApiRoute | api | claw |  |  |  | `/api/plugins` |
| `claw.privateApi.routines` | privateApiRoute | api | claw |  |  |  | `/api/routines` |
| `claw.privateApi.rules` | privateApiRoute | api | claw |  |  |  | `/api/rules` |
| `claw.privateApi.schema` | privateApiRoute | api | claw |  |  |  | `/api/schema` |
| `claw.privateApi.skillsList` | privateApiRoute | api | claw |  |  |  | `/api/skills/list` |
| `claw.privateApi.sources` | privateApiRoute | api | claw |  |  |  | `/api/sources` |
| `claw.privateApi.spaces` | privateApiRoute | api | claw |  |  |  | `/api/spaces` |
| `claw.privateApi.summary` | privateApiRoute | api | claw |  |  |  | `/api/summary` |
| `claw.privateApi.tasks` | privateApiRoute | api | claw |  |  |  | `/api/tasks` |
| `claw.privateApi.toolsSave` | privateApiRoute | api | claw |  |  |  | `/api/tools/save` |
| `claw.privateApi.ui` | privateApiRoute | api | claw |  |  |  | `/api/ui` |
| `claw.privateApi.usage` | privateApiRoute | api | claw |  |  |  | `/api/usage` |
| `claw.protocol.hostCommand.v1` | protocol | protocol | claw |  |  |  | `host-command-v1` |
| `clawix.protocol.bridge.v1` | protocol | protocol | clawix |  |  |  | `clawix-bridge-v1` |
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
| `claw.external.mapping.event.blueskyFeedPost` | externalMapping | external | external |  |  |  | `app.bsky.feed.post` |
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
| `claw.error.inspect_manifest_error` | errorCode | schema | claw |  |  |  | `inspect_manifest_error` |
| `claw.error.inspect_codebase_manifest_error` | errorCode | schema | claw |  |  |  | `inspect_codebase_manifest_error` |
| `claw.error.inspect_not_found` | errorCode | schema | claw |  |  |  | `inspect_not_found` |
| `claw.error.usage_error` | errorCode | schema | claw |  |  |  | `usage_error` |
| `claw.id.session` | idNamespace | id | claw |  |  |  | `sessionId` |
| `claw.id.thread.external` | idNamespace | id | claw |  |  |  | `threadId` |
| `claw.id.host` | idNamespace | id | claw |  |  |  | `hostId` |
| `claw.id.device` | idNamespace | id | claw |  |  |  | `deviceId` |
| `claw.id.installation` | idNamespace | id | claw |  |  |  | `installationId` |
| `claw.id.record` | idNamespace | id | claw |  |  |  | `recordId` |
| `claw.id.resource` | idNamespace | id | claw |  |  |  | `resourceId` |
| `claw.env.allowedOrigins` | envVar | config | claw |  |  |  | `CLAW_ALLOWED_ORIGINS` |
| `claw.env.audioBlobsDir` | envVar | config | claw |  |  |  | `CLAW_AUDIO_BLOBS_DIR` |
| `claw.env.audioDataDir` | envVar | config | claw |  |  |  | `CLAW_AUDIO_DATA_DIR` |
| `claw.env.audioHost` | envVar | config | claw |  |  |  | `CLAW_AUDIO_HOST` |
| `claw.env.audioPort` | envVar | config | claw |  |  |  | `CLAW_AUDIO_PORT` |
| `claw.env.audioSharedSecret` | envVar | config | claw |  |  |  | `CLAW_AUDIO_SHARED_SECRET` |
| `claw.env.bin` | envVar | config | claw |  |  |  | `CLAW_BIN` |
| `claw.env.calendarMock` | envVar | config | claw |  |  |  | `CLAW_CALENDAR_MOCK` |
| `claw.env.codexPath` | envVar | config | claw |  |  |  | `CLAW_CODEX_PATH` |
| `claw.env.codeHome` | envVar | config | claw |  |  |  | `CLAW_CODE_HOME` |
| `claw.env.companyFakeAgentRuns` | envVar | config | claw |  |  |  | `CLAW_COMPANY_FAKE_AGENT_RUNS` |
| `claw.env.companyOpenclawAgentId` | envVar | config | claw |  |  |  | `CLAW_COMPANY_OPENCLAW_AGENT_ID` |
| `claw.env.componentsSourceDir` | envVar | config | claw |  |  |  | `CLAW_COMPONENTS_SOURCE_DIR` |
| `claw.env.connectorCatalogPath` | envVar | config | claw |  |  |  | `CLAW_CONNECTOR_CATALOG_PATH` |
| `claw.env.connectorSubscriptionsPath` | envVar | config | claw |  |  |  | `CLAW_CONNECTOR_SUBSCRIPTIONS_PATH` |
| `claw.env.contentToken` | envVar | config | claw |  |  |  | `CLAW_CONTENT_TOKEN` |
| `claw.env.contentUrl` | envVar | config | claw |  |  |  | `CLAW_CONTENT_URL` |
| `claw.env.databaseAdminEmail` | envVar | config | claw |  |  |  | `CLAW_DATABASE_ADMIN_EMAIL` |
| `claw.env.databaseAdminPassword` | envVar | config | claw |  |  |  | `CLAW_DATABASE_ADMIN_PASSWORD` |
| `claw.env.databaseCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_DATABASE_CORS_ORIGINS` |
| `claw.env.databaseDataDir` | envVar | config | claw |  |  |  | `CLAW_DATABASE_DATA_DIR` |
| `claw.env.databaseDir` | envVar | config | claw |  |  |  | `CLAW_DATABASE_DIR` |
| `claw.env.databaseFilesDir` | envVar | config | claw |  |  |  | `CLAW_DATABASE_FILES_DIR` |
| `claw.env.databaseHost` | envVar | config | claw |  |  |  | `CLAW_DATABASE_HOST` |
| `claw.env.databaseJwtSecret` | envVar | config | claw |  |  |  | `CLAW_DATABASE_JWT_SECRET` |
| `claw.env.databaseNamespace` | envVar | config | claw |  |  |  | `CLAW_DATABASE_NAMESPACE` |
| `claw.env.databasePort` | envVar | config | claw |  |  |  | `CLAW_DATABASE_PORT` |
| `claw.env.databaseUrl` | envVar | config | claw |  |  |  | `CLAW_DATABASE_URL` |
| `claw.env.dataDir` | envVar | config | claw |  |  |  | `CLAW_DATA_DIR` |
| `claw.env.dayRoot` | envVar | config | claw |  |  |  | `CLAW_DAY_ROOT` |
| `claw.env.dbPath` | envVar | config | claw |  |  |  | `CLAW_DB_PATH` |
| `claw.env.debugChatPerf` | envVar | config | claw |  |  |  | `CLAW_DEBUG_CHAT_PERF` |
| `claw.env.demoDataDir` | envVar | config | claw |  |  |  | `CLAW_DEMO_DATA_DIR` |
| `claw.env.deviceTestCommand` | envVar | config | claw |  |  |  | `CLAW_DEVICE_TEST_COMMAND` |
| `claw.env.domainsActive` | envVar | config | claw |  |  |  | `CLAW_DOMAINS_ACTIVE` |
| `claw.env.domainShareUrl` | envVar | config | claw |  |  |  | `CLAW_DOMAIN_SHARE_URL` |
| `claw.env.driveBackend` | envVar | config | claw |  |  |  | `CLAW_DRIVE_BACKEND` |
| `claw.env.driveBase` | envVar | config | claw |  |  |  | `CLAW_DRIVE_BASE` |
| `claw.env.driveCloudflared` | envVar | config | claw |  |  |  | `CLAW_DRIVE_CLOUDFLARED` |
| `claw.env.driveConverterMode` | envVar | config | claw |  |  |  | `CLAW_DRIVE_CONVERTER_MODE` |
| `claw.env.driveCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_DRIVE_CORS_ORIGINS` |
| `claw.env.driveDataDir` | envVar | config | claw |  |  |  | `CLAW_DRIVE_DATA_DIR` |
| `claw.env.driveDbPath` | envVar | config | claw |  |  |  | `CLAW_DRIVE_DB_PATH` |
| `claw.env.driveEmail` | envVar | config | claw |  |  |  | `CLAW_DRIVE_EMAIL` |
| `claw.env.driveEmbedSidecar` | envVar | config | claw |  |  |  | `CLAW_DRIVE_EMBED_SIDECAR` |
| `claw.env.driveHost` | envVar | config | claw |  |  |  | `CLAW_DRIVE_HOST` |
| `claw.env.driveJwtSecret` | envVar | config | claw |  |  |  | `CLAW_DRIVE_JWT_SECRET` |
| `claw.env.driveOcrSidecar` | envVar | config | claw |  |  |  | `CLAW_DRIVE_OCR_SIDECAR` |
| `claw.env.drivePassword` | envVar | config | claw |  |  |  | `CLAW_DRIVE_PASSWORD` |
| `claw.env.drivePort` | envVar | config | claw |  |  |  | `CLAW_DRIVE_PORT` |
| `claw.env.drivePublicBaseUrl` | envVar | config | claw |  |  |  | `CLAW_DRIVE_PUBLIC_BASE_URL` |
| `claw.env.driveStatusFile` | envVar | config | claw |  |  |  | `CLAW_DRIVE_STATUS_FILE` |
| `claw.env.driveToken` | envVar | config | claw |  |  |  | `CLAW_DRIVE_TOKEN` |
| `claw.env.driveUiDistDir` | envVar | config | claw |  |  |  | `CLAW_DRIVE_UI_DIST_DIR` |
| `claw.env.e2e` | envVar | config | claw |  |  |  | `CLAW_E2E` |
| `claw.env.e2eDisableExternalCalls` | envVar | config | claw |  |  |  | `CLAW_E2E_DISABLE_EXTERNAL_CALLS` |
| `claw.env.e2eFixtureMode` | envVar | config | claw |  |  |  | `CLAW_E2E_FIXTURE_MODE` |
| `claw.env.e2eReuseServer` | envVar | config | claw |  |  |  | `CLAW_E2E_REUSE_SERVER` |
| `claw.env.emailMock` | envVar | config | claw |  |  |  | `CLAW_EMAIL_MOCK` |
| `claw.env.erpDir` | envVar | config | claw |  |  |  | `CLAW_ERP_DIR` |
| `claw.env.filesDir` | envVar | config | claw |  |  |  | `CLAW_FILES_DIR` |
| `claw.env.findCommandStrictPath` | envVar | config | claw |  |  |  | `CLAW_FIND_COMMAND_STRICT_PATH` |
| `claw.env.guidanceDir` | envVar | config | claw |  |  |  | `CLAW_GUIDANCE_DIR` |
| `claw.env.home` | envVar | config | claw |  |  |  | `CLAW_HOME` |
| `claw.env.hostAppBundle` | envVar | config | claw |  |  |  | `CLAW_HOST_APP_BUNDLE` |
| `claw.env.hostAppSupportName` | envVar | config | claw |  |  |  | `CLAW_HOST_APP_SUPPORT_NAME` |
| `claw.env.hostBinDir` | envVar | config | claw |  |  |  | `CLAW_HOST_BIN_DIR` |
| `claw.env.hostBundleId` | envVar | config | claw |  |  |  | `CLAW_HOST_BUNDLE_ID` |
| `claw.env.hostCliName` | envVar | config | claw |  |  |  | `CLAW_HOST_CLI_NAME` |
| `claw.env.hostDaemonName` | envVar | config | claw |  |  |  | `CLAW_HOST_DAEMON_NAME` |
| `claw.env.hostDisableSocketFallback` | envVar | config | claw |  |  |  | `CLAW_HOST_DISABLE_SOCKET_FALLBACK` |
| `claw.env.hostDisplayName` | envVar | config | claw |  |  |  | `CLAW_HOST_DISPLAY_NAME` |
| `claw.env.hostHome` | envVar | config | claw |  |  |  | `CLAW_HOST_HOME` |
| `claw.env.hostId` | envVar | config | claw |  |  |  | `CLAW_HOST_ID` |
| `claw.env.hostLaunchAgentsDir` | envVar | config | claw |  |  |  | `CLAW_HOST_LAUNCH_AGENTS_DIR` |
| `claw.env.hostLaunchAgentLabel` | envVar | config | claw |  |  |  | `CLAW_HOST_LAUNCH_AGENT_LABEL` |
| `claw.env.hostLogSubsystem` | envVar | config | claw |  |  |  | `CLAW_HOST_LOG_SUBSYSTEM` |
| `claw.env.hostMachService` | envVar | config | claw |  |  |  | `CLAW_HOST_MACH_SERVICE` |
| `claw.env.hostObsidianVault` | envVar | config | claw |  |  |  | `CLAW_HOST_OBSIDIAN_VAULT` |
| `claw.env.hostPermissionName` | envVar | config | claw |  |  |  | `CLAW_HOST_PERMISSION_NAME` |
| `claw.env.hostPermissionRequestDryRun` | envVar | config | claw |  |  |  | `CLAW_HOST_PERMISSION_REQUEST_DRY_RUN` |
| `claw.env.hostPermissionRequestLog` | envVar | config | claw |  |  |  | `CLAW_HOST_PERMISSION_REQUEST_LOG` |
| `claw.env.hostRuntimeTransport` | envVar | config | claw |  |  |  | `CLAW_HOST_RUNTIME_TRANSPORT` |
| `claw.env.hostSafe` | envVar | config | claw |  |  |  | `CLAW_HOST_SAFE` |
| `claw.env.hostTestCalendar` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_CALENDAR` |
| `claw.env.hostTestCommand` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_COMMAND` |
| `claw.env.hostTestMailbox` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_MAILBOX` |
| `claw.env.hostTestMode` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_MODE` |
| `claw.env.hostTestNotesFolder` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_NOTES_FOLDER` |
| `claw.env.hostTestRemindersList` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_REMINDERS_LIST` |
| `claw.env.hostTestSafariWindow` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_SAFARI_WINDOW` |
| `claw.env.hostTestThingsProject` | envVar | config | claw |  |  |  | `CLAW_HOST_TEST_THINGS_PROJECT` |
| `claw.env.hostValidationMode` | envVar | config | claw |  |  |  | `CLAW_HOST_VALIDATION_MODE` |
| `claw.env.imageLibraryDir` | envVar | config | claw |  |  |  | `CLAW_IMAGE_LIBRARY_DIR` |
| `claw.env.iotBaseUrl` | envVar | config | claw |  |  |  | `CLAW_IOT_BASE_URL` |
| `claw.env.iotDir` | envVar | config | claw |  |  |  | `CLAW_IOT_DIR` |
| `claw.env.libraryDir` | envVar | config | claw |  |  |  | `CLAW_LIBRARY_DIR` |
| `claw.env.liveBrokerCommand` | envVar | config | claw |  |  |  | `CLAW_LIVE_BROKER_COMMAND` |
| `claw.env.localAdminBootstrapStdin` | envVar | config | claw |  |  |  | `CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN` |
| `claw.env.memoryBase` | envVar | config | claw |  |  |  | `CLAW_MEMORY_BASE` |
| `claw.env.memoryEditor` | envVar | config | claw |  |  |  | `CLAW_MEMORY_EDITOR` |
| `claw.env.memoryHost` | envVar | config | claw |  |  |  | `CLAW_MEMORY_HOST` |
| `claw.env.memoryPort` | envVar | config | claw |  |  |  | `CLAW_MEMORY_PORT` |
| `claw.env.memoryWorkspace` | envVar | config | claw |  |  |  | `CLAW_MEMORY_WORKSPACE` |
| `claw.env.monitorCollectIntervalMs` | envVar | config | claw |  |  |  | `CLAW_MONITOR_COLLECT_INTERVAL_MS` |
| `claw.env.monitorCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_MONITOR_CORS_ORIGINS` |
| `claw.env.monitorHost` | envVar | config | claw |  |  |  | `CLAW_MONITOR_HOST` |
| `claw.env.monitorLocalDiscoveryIntervalMs` | envVar | config | claw |  |  |  | `CLAW_MONITOR_LOCAL_DISCOVERY_INTERVAL_MS` |
| `claw.env.monitorLocalScanPorts` | envVar | config | claw |  |  |  | `CLAW_MONITOR_LOCAL_SCAN_PORTS` |
| `claw.env.monitorMode` | envVar | config | claw |  |  |  | `CLAW_MONITOR_MODE` |
| `claw.env.monitorPort` | envVar | config | claw |  |  |  | `CLAW_MONITOR_PORT` |
| `claw.env.monitorRelayToken` | envVar | config | claw |  |  |  | `CLAW_MONITOR_RELAY_TOKEN` |
| `claw.env.monitorRelayUrl` | envVar | config | claw |  |  |  | `CLAW_MONITOR_RELAY_URL` |
| `claw.env.monitorRetentionDays` | envVar | config | claw |  |  |  | `CLAW_MONITOR_RETENTION_DAYS` |
| `claw.env.node` | envVar | config | claw |  |  |  | `CLAW_NODE` |
| `claw.env.openclawPath` | envVar | config | claw |  |  |  | `CLAW_OPENCLAW_PATH` |
| `claw.env.openWorkspace` | envVar | config | claw |  |  |  | `CLAW_OPEN_WORKSPACE` |
| `claw.env.previewCloudflareUrl` | envVar | config | claw |  |  |  | `CLAW_PREVIEW_CLOUDFLARE_URL` |
| `claw.env.publishingCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_CORS_ORIGINS` |
| `claw.env.publishingDataDir` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_DATA_DIR` |
| `claw.env.publishingDbPath` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_DB_PATH` |
| `claw.env.publishingDir` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_DIR` |
| `claw.env.publishingDriveUrl` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_DRIVE_URL` |
| `claw.env.publishingHealthProbeMs` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_HEALTH_PROBE_MS` |
| `claw.env.publishingHost` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_HOST` |
| `claw.env.publishingLogLevel` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_LOG_LEVEL` |
| `claw.env.publishingPipelineEnabled` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_PIPELINE_ENABLED` |
| `claw.env.publishingPort` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_PORT` |
| `claw.env.publishingPrintToken` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_PRINT_TOKEN` |
| `claw.env.publishingPublicBaseUrl` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_PUBLIC_BASE_URL` |
| `claw.env.publishingRecurrenceTickMs` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_RECURRENCE_TICK_MS` |
| `claw.env.publishingSchedulerTickMs` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_SCHEDULER_TICK_MS` |
| `claw.env.publishingStatusFile` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_STATUS_FILE` |
| `claw.env.publishingToken` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_TOKEN` |
| `claw.env.publishingTokenStore` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_TOKEN_STORE` |
| `claw.env.publishingUrl` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_URL` |
| `claw.env.publishingVaultUrl` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_VAULT_URL` |
| `claw.env.publishingWorkerTickMs` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_WORKER_TICK_MS` |
| `claw.env.publishingWorkspace` | envVar | config | claw |  |  |  | `CLAW_PUBLISHING_WORKSPACE` |
| `claw.env.relayAccessToken` | envVar | config | claw |  |  |  | `CLAW_RELAY_ACCESS_TOKEN` |
| `claw.env.relayAgentId` | envVar | config | claw |  |  |  | `CLAW_RELAY_AGENT_ID` |
| `claw.env.relayTenantId` | envVar | config | claw |  |  |  | `CLAW_RELAY_TENANT_ID` |
| `claw.env.relayUrl` | envVar | config | claw |  |  |  | `CLAW_RELAY_URL` |
| `claw.env.relayWorkspaceId` | envVar | config | claw |  |  |  | `CLAW_RELAY_WORKSPACE_ID` |
| `claw.env.reportGithubToken` | envVar | config | claw |  |  |  | `CLAW_REPORT_GITHUB_TOKEN` |
| `claw.env.resourcesDir` | envVar | config | claw |  |  |  | `CLAW_RESOURCES_DIR` |
| `claw.env.rulesDir` | envVar | config | claw |  |  |  | `CLAW_RULES_DIR` |
| `claw.env.runtimeHome` | envVar | config | claw |  |  |  | `CLAW_RUNTIME_HOME` |
| `claw.env.runtimePort` | envVar | config | claw |  |  |  | `CLAW_RUNTIME_PORT` |
| `claw.env.runtimeSessionsUrl` | envVar | config | claw |  |  |  | `CLAW_RUNTIME_SESSIONS_URL` |
| `claw.env.searchAdminToken` | envVar | config | claw |  |  |  | `CLAW_SEARCH_ADMIN_TOKEN` |
| `claw.env.searchBase` | envVar | config | claw |  |  |  | `CLAW_SEARCH_BASE` |
| `claw.env.searchCodexBinary` | envVar | config | claw |  |  |  | `CLAW_SEARCH_CODEX_BINARY` |
| `claw.env.searchCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_SEARCH_CORS_ORIGINS` |
| `claw.env.searchDataDir` | envVar | config | claw |  |  |  | `CLAW_SEARCH_DATA_DIR` |
| `claw.env.searchHost` | envVar | config | claw |  |  |  | `CLAW_SEARCH_HOST` |
| `claw.env.searchJwtSecret` | envVar | config | claw |  |  |  | `CLAW_SEARCH_JWT_SECRET` |
| `claw.env.searchPort` | envVar | config | claw |  |  |  | `CLAW_SEARCH_PORT` |
| `claw.env.searchRunTimeoutMs` | envVar | config | claw |  |  |  | `CLAW_SEARCH_RUN_TIMEOUT_MS` |
| `claw.env.searchSchedulerTickMs` | envVar | config | claw |  |  |  | `CLAW_SEARCH_SCHEDULER_TICK_MS` |
| `claw.env.searchToken` | envVar | config | claw |  |  |  | `CLAW_SEARCH_TOKEN` |
| `claw.env.searchWorkerConcurrency` | envVar | config | claw |  |  |  | `CLAW_SEARCH_WORKER_CONCURRENCY` |
| `claw.env.secretsAdminToken` | envVar | config | claw |  |  |  | `CLAW_SECRETS_ADMIN_TOKEN` |
| `claw.env.secretsBackend` | envVar | config | claw |  |  |  | `CLAW_SECRETS_BACKEND` |
| `claw.env.secretsBase` | envVar | config | claw |  |  |  | `CLAW_SECRETS_BASE` |
| `claw.env.secretsBaseUrl` | envVar | config | claw |  |  |  | `CLAW_SECRETS_BASE_URL` |
| `claw.env.secretsBootstrapStdin` | envVar | config | claw |  |  |  | `CLAW_SECRETS_BOOTSTRAP_STDIN` |
| `claw.env.secretsCorsOrigins` | envVar | config | claw |  |  |  | `CLAW_SECRETS_CORS_ORIGINS` |
| `claw.env.secretsDataDir` | envVar | config | claw |  |  |  | `CLAW_SECRETS_DATA_DIR` |
| `claw.env.secretsDbPath` | envVar | config | claw |  |  |  | `CLAW_SECRETS_DB_PATH` |
| `claw.env.secretsEnableUnsafeExternalPlugins` | envVar | config | claw |  |  |  | `CLAW_SECRETS_ENABLE_UNSAFE_EXTERNAL_PLUGINS` |
| `claw.env.secretsHost` | envVar | config | claw |  |  |  | `CLAW_SECRETS_HOST` |
| `claw.env.secretsHostAssertionKeyBase64` | envVar | config | claw |  |  |  | `CLAW_SECRETS_HOST_ASSERTION_KEY_BASE64` |
| `claw.env.secretsJwtSecret` | envVar | config | claw |  |  |  | `CLAW_SECRETS_JWT_SECRET` |
| `claw.env.secretsKekBase64` | envVar | config | claw |  |  |  | `CLAW_SECRETS_KEK_BASE64` |
| `claw.env.secretsPluginsDir` | envVar | config | claw |  |  |  | `CLAW_SECRETS_PLUGINS_DIR` |
| `claw.env.secretsPort` | envVar | config | claw |  |  |  | `CLAW_SECRETS_PORT` |
| `claw.env.secretsProxyPath` | envVar | config | claw |  |  |  | `CLAW_SECRETS_PROXY_PATH` |
| `claw.env.secretsPublicBaseUrl` | envVar | config | claw |  |  |  | `CLAW_SECRETS_PUBLIC_BASE_URL` |
| `claw.env.secretsSidecarPath` | envVar | config | claw |  |  |  | `CLAW_SECRETS_SIDECAR_PATH` |
| `claw.env.secretsSignedHostToken` | envVar | config | claw |  |  |  | `CLAW_SECRETS_SIGNED_HOST_TOKEN` |
| `claw.env.secretsTenant` | envVar | config | claw |  |  |  | `CLAW_SECRETS_TENANT` |
| `claw.env.secretsTenantId` | envVar | config | claw |  |  |  | `CLAW_SECRETS_TENANT_ID` |
| `claw.env.secretsToken` | envVar | config | claw |  |  |  | `CLAW_SECRETS_TOKEN` |
| `claw.env.secretsUiDistDir` | envVar | config | claw |  |  |  | `CLAW_SECRETS_UI_DIST_DIR` |
| `claw.env.sessionsCodexDir` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_CODEX_DIR` |
| `claw.env.sessionsDataDir` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_DATA_DIR` |
| `claw.env.sessionsDisableCodex` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_DISABLE_CODEX` |
| `claw.env.sessionsDisableHermes` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_DISABLE_HERMES` |
| `claw.env.sessionsHermesDb` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_HERMES_DB` |
| `claw.env.sessionsHost` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_HOST` |
| `claw.env.sessionsPort` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_PORT` |
| `claw.env.sessionsSharedSecret` | envVar | config | claw |  |  |  | `CLAW_SESSIONS_SHARED_SECRET` |
| `claw.env.skillsAutoImport` | envVar | config | claw |  |  |  | `CLAW_SKILLS_AUTO_IMPORT` |
| `claw.env.slidesDisableBrowser` | envVar | config | claw |  |  |  | `CLAW_SLIDES_DISABLE_BROWSER` |
| `claw.env.telegramBackend` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_BACKEND` |
| `claw.env.telegramDomainShareUrl` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_DOMAIN_SHARE_URL` |
| `claw.env.telegramHost` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_HOST` |
| `claw.env.telegramLogLevel` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_LOG_LEVEL` |
| `claw.env.telegramPort` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_PORT` |
| `claw.env.telegramWorkspace` | envVar | config | claw |  |  |  | `CLAW_TELEGRAM_WORKSPACE` |
| `claw.env.templateDisableBrowser` | envVar | config | claw |  |  |  | `CLAW_TEMPLATE_DISABLE_BROWSER` |
| `claw.env.testLive` | envVar | config | claw |  |  |  | `CLAW_TEST_LIVE` |
| `claw.env.testLivePackage` | envVar | config | claw |  |  |  | `CLAW_TEST_LIVE_PACKAGE` |
| `claw.env.testWorkspace` | envVar | config | claw |  |  |  | `CLAW_TEST_WORKSPACE` |
| `claw.env.timeDataDir` | envVar | config | claw |  |  |  | `CLAW_TIME_DATA_DIR` |
| `claw.env.timeDbFile` | envVar | config | claw |  |  |  | `CLAW_TIME_DB_FILE` |
| `claw.env.timeDefaultTimezone` | envVar | config | claw |  |  |  | `CLAW_TIME_DEFAULT_TIMEZONE` |
| `claw.env.timeHost` | envVar | config | claw |  |  |  | `CLAW_TIME_HOST` |
| `claw.env.timeNotifySourceToken` | envVar | config | claw |  |  |  | `CLAW_TIME_NOTIFY_SOURCE_TOKEN` |
| `claw.env.timeNotifyUrl` | envVar | config | claw |  |  |  | `CLAW_TIME_NOTIFY_URL` |
| `claw.env.timePort` | envVar | config | claw |  |  |  | `CLAW_TIME_PORT` |
| `claw.env.timeSchedulerIntervalMs` | envVar | config | claw |  |  |  | `CLAW_TIME_SCHEDULER_INTERVAL_MS` |
| `claw.env.timeToken` | envVar | config | claw |  |  |  | `CLAW_TIME_TOKEN` |
| `claw.env.timeUrl` | envVar | config | claw |  |  |  | `CLAW_TIME_URL` |
| `claw.env.wacliPath` | envVar | config | claw |  |  |  | `CLAW_WACLI_PATH` |
| `claw.env.workspace` | envVar | config | claw |  |  |  | `CLAW_WORKSPACE` |
| `claw.package.core` | packageName | package | claw |  |  |  | `@clawjs/core` |
| `claw.package.cli` | packageName | package | claw |  |  |  | `@clawjs/cli` |
| `claw.package.claw` | packageName | package | claw |  |  |  | `@clawjs/claw` |
| `claw.package.workspace` | packageName | package | claw |  |  |  | `@clawjs/workspace` |
| `claw.package.node` | packageName | package | claw |  |  |  | `@clawjs/node` |
| `claw.package.database` | packageName | package | claw |  |  |  | `@clawjs/database` |
| `claw.package.agents` | packageName | package | claw |  |  |  | `@clawjs/agents` |
| `claw.package.integrations` | packageName | package | claw |  |  |  | `@clawjs/integrations` |
| `claw.package.marketplace` | packageName | package | claw |  |  |  | `@clawjs/marketplace` |
| `claw.package.profile` | packageName | package | claw |  |  |  | `@clawjs/profile` |
| `claw.package.audio` | packageName | package | claw |  |  |  | `@clawjs/audio` |
| `claw.package.sessions` | packageName | package | claw |  |  |  | `@clawjs/sessions` |
| `claw.package.userModel` | packageName | package | claw |  |  |  | `@clawjs/user-model` |
| `claw.package.runtime` | packageName | package | claw |  |  |  | `@clawjs/runtime` |
| `claw.package.sandbox` | packageName | package | claw |  |  |  | `@clawjs/sandbox` |
| `claw.package.mcp` | packageName | package | claw |  |  |  | `@clawjs/mcp` |
| `claw.package.voice` | packageName | package | claw |  |  |  | `@clawjs/voice` |
| `claw.package.channelBase` | packageName | package | claw |  |  |  | `@clawjs/channel-base` |
| `claw.package.mesh` | packageName | package | claw |  |  |  | `@clawjs/mesh` |
| `claw.package.signals` | packageName | package | claw |  |  |  | `@clawjs/signals` |
| `claw.package.signalsCore` | packageName | package | claw |  |  |  | `@clawjs/signals-core` |
| `claw.package.createApp` | packageName | package | claw |  |  |  | `create-claw-app` |
| `claw.package.createAgent` | packageName | package | claw |  |  |  | `create-claw-agent` |
| `claw.package.createServer` | packageName | package | claw |  |  |  | `create-claw-server` |
| `claw.package.createPlugin` | packageName | package | claw |  |  |  | `create-claw-plugin` |
| `claw.package.eslintConfig` | packageName | package | claw |  |  |  | `eslint-config-claw` |
| `claw.package.bin.claw` | packageBin | package | claw |  |  |  | `claw` |
| `claw.package.bin.createClawApp` | packageBin | package | claw |  |  |  | `create-claw-app` |
| `claw.package.bin.createClawAgent` | packageBin | package | claw |  |  |  | `create-claw-agent` |
| `claw.package.bin.createClawServer` | packageBin | package | claw |  |  |  | `create-claw-server` |
| `claw.package.bin.createClawPlugin` | packageBin | package | claw |  |  |  | `create-claw-plugin` |
| `claw.format.export` | fileFormat | format | claw |  |  |  | `.clawexport` |
| `claw.format.backup` | fileFormat | format | claw |  |  |  | `.clawbackup` |
| `claw.format.secrets` | fileFormat | format | claw |  |  |  | `.clawsecrets` |
| `claw.format.archiveManifest` | fileFormat | format | claw |  |  |  | `manifest.json` |
| `claw.native.app.bundle` | nativeIdentity | native | claw |  |  |  | `com.example.claw` |
| `claw.native.host.launchAgent` | nativeIdentity | native | claw |  |  |  | `com.example.claw.host` |
| `claw.native.host.machService` | nativeIdentity | native | claw |  |  |  | `com.example.claw.host.xpc` |
| `clawix.native.app.bundle` | nativeIdentity | native | claw |  |  |  | `com.example.clawix` |
| `clawix.native.bridge.launchAgent` | nativeIdentity | native | claw |  |  |  | `clawix.bridge` |
| `clawix.native.bridge.service` | nativeIdentity | native | claw |  |  |  | `clawix-bridge` |
| `clawix.native.bridge.bonjour` | nativeIdentity | native | claw |  |  |  | `_clawix-bridge._tcp` |
| `clawix.native.bridge.pipe` | nativeIdentity | native | claw |  |  |  | `\\.\pipe\clawix-bridge` |
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
| `claw.cli.command.contacts` | cliCommand | cli | claw |  |  |  | `contacts` |
| `claw.cli.command.inspect` | cliCommand | cli | claw |  |  |  | `inspect` |
| `claw.cli.command.search` | cliCommand | cli | claw |  |  |  | `search` |
| `claw.cli.command.signals` | cliCommand | cli | claw |  |  |  | `signals` |
| `claw.cli.command.life` | cliCommand | cli | claw |  |  |  | `life` |
| `claw.cli.command.report` | cliCommand | cli | claw |  |  |  | `report` |
| `claw.cli.command.needs` | cliCommand | cli | claw |  |  |  | `needs` |
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
| `claw.cli.command.agents` | cliCommand | cli | claw |  |  |  | `agents` |
| `claw.cli.command.personalities` | cliCommand | cli | claw |  |  |  | `personalities` |
| `claw.cli.command.skills` | cliCommand | cli | claw |  |  |  | `skills` |
| `claw.cli.command.skill-collections` | cliCommand | cli | claw |  |  |  | `skill-collections` |
| `claw.cli.command.connections` | cliCommand | cli | claw |  |  |  | `connections` |
| `claw.cli.command.snippets` | cliCommand | cli | claw |  |  |  | `snippets` |
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
| `claw.cli.command.connectors` | cliCommand | cli | claw |  |  |  | `connectors` |
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
| `claw.cli.command.marketplace` | cliCommand | cli | claw |  |  |  | `marketplace` |
| `claw.cli.command.content` | cliCommand | cli | claw |  |  |  | `content` |
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
| `claw.cli.command.guidance` | cliCommand | cli | claw |  |  |  | `guidance` |
| `claw.cli.command.resources` | cliCommand | cli | claw |  |  |  | `resources` |
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
| `claw.cli.flag.guidance` | cliFlag | cli | claw |  |  |  | `--guidance` |
| `claw.cli.flag.actor-assertion` | cliFlag | cli | claw |  |  |  | `--actor-assertion` |
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
| `claw.workspace.browserProfileCache` | folder | persistent | claw |  |  |  | `.claw-browser` |
| `claw.workspace.demoCache` | folder | persistent | claw |  |  |  | `.claw-demo` |
| `claw.workspace.e2eCache` | folder | persistent | claw |  |  |  | `.claw-e2e` |
| `claw.workspace.styles` | folder | persistent | claw |  |  |  | `.claw/styles` |
| `claw.workspace.templates` | folder | persistent | claw |  |  |  | `.claw/templates` |
| `claw.workspace.references` | folder | persistent | claw |  |  |  | `.claw/references` |
| `claw.workspace.reports` | folder | persistent | claw |  |  |  | `.claw/reports` |
| `claw.workspace.reports.governance_state` | file | persistent | claw |  |  |  | `.claw/reports/report-governance.json` |
| `claw.workspace.need_routes` | folder | persistent | claw |  |  |  | `.claw/need-routes` |
| `claw.workspace.need_routes.ledger` | file | persistent | claw |  |  |  | `.claw/need-routes/need-route-lab.json` |
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
| `claw.global.guidance` | folder | persistent | claw |  |  |  | `~/.claw/guidance` |
| `claw.global.resources` | folder | persistent | claw |  |  |  | `~/.claw/resources` |
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
| `claw.browserStorage.showcaseTheme` | browserStorageKey | config | claw |  |  |  | `clawjs-theme` |
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
| `claw.database.core.table.connector_providers` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_external_principals` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_credential_bindings` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_capabilities` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_operations` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_policies` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_budgets` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_network_policies` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.connector_audit_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.personalities` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.provider_routing` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.provider_settings` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.snippets` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.apps` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.design_resources` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.session_index` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.table.session_index_fts` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.index.data_registry_domain_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.app_projects_path_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.app_projects_resource_id_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.app_sidebar_snapshots_order_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_external_principals_provider_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_credential_bindings_provider_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_capabilities_domain_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_operations_provider_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_operations_support_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_budgets_scope_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_network_policies_egress_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_audit_events_request_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.index.connector_audit_events_provider_idx` | index | persistent | claw |  |  |  | `` |
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
| `claw.database.vault.table.connector_raw_trace_refs` | table | persistent | claw |  |  |  | `` |
| `claw.database.vault.index.connector_raw_trace_refs_audit_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.runtime.table.runtime_jobs` | table | persistent | claw |  |  |  | `` |
| `claw.database.runtime.table.runtime_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.runtime.index.runtime_jobs_status_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.runtime.index.runtime_events_job_idx` | index | persistent | claw |  |  |  | `` |
| `claw.database.core.table.operational_events` | table | persistent | claw |  |  |  | `` |
| `claw.database.core.index.operational_events_kind_idx` | index | persistent | claw |  |  |  | `` |
