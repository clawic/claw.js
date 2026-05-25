// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { RuntimeAdapterId } from "@clawjs/core";
import { getRuntimeAdapter, getRuntimeSessionDescriptor, listRuntimeAdapters, NodeProcessHost } from "@clawjs/claw";

import { RUNTIME_ADAPTER_IDS } from "./cli-constants.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { applyAppStateTransaction, appStateRequestFromOperations, readAppStateProjection } from "./app-state-service.ts";
import { openMainDataStore } from "./v1-data-core.ts";

const RUNTIME_PORTAL_IDS = new Set(["openclaw", "codex", "hermes"]);

const RUNTIME_PORTAL_DOMAIN_ORDER = [
  "sessions",
  "skills",
  "memory",
  "channels",
  "providers",
  "auth",
  "models",
  "scheduler",
  "plugins",
  "gateway",
  "doctorCompat",
  "sandboxPermissions",
  "configuration",
];

const DOMAIN_ALIASES = new Map([
  ["provider", "providers"],
  ["model", "models"],
  ["auth-state", "auth"],
  ["config", "configuration"],
  ["configs", "configuration"],
  ["schedule", "scheduler"],
  ["schedules", "scheduler"],
  ["skill", "skills"],
  ["channel", "channels"],
  ["plugin", "plugins"],
  ["session", "sessions"],
  ["conversation", "sessions"],
  ["conversations", "sessions"],
  ["doctor", "doctorCompat"],
  ["compat", "doctorCompat"],
  ["doctorcompat", "doctorCompat"],
  ["doctor-compat", "doctorCompat"],
  ["doctor_compat", "doctorCompat"],
  ["sandbox", "sandboxPermissions"],
  ["permission", "sandboxPermissions"],
  ["permissions", "sandboxPermissions"],
  ["sandboxpermissions", "sandboxPermissions"],
  ["sandbox-permissions", "sandboxPermissions"],
  ["sandbox_permissions", "sandboxPermissions"],
]);

const RUNTIME_PORTAL_DOMAIN_POLICIES = JSON.parse(`{
  "openclaw": {
    "sessions": {"claim":"projected","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_and_shadow","relation":"native_projection","lossPolicy":"preserve_transcript_when_safe","writeBackPolicy":"official_cli_or_gateway_only","validation":"hermetic_fixture_required","officialCommands":["openclaw sessions","openclaw sessions --json","openclaw sessions cleanup --dry-run","openclaw sessions cleanup --json","openclaw message","openclaw agent","openclaw agents list"]},
    "skills": {"claim":"projected","nativeAuthority":"runtime","canonicalAuthority":"runtime_for_native_installation_claw_for_canon","persistence":"index_only","relation":"native_inventory_to_claw_catalog","lossPolicy":"no_auto_import","writeBackPolicy":"explicit_native_install_only","validation":"snapshot_required","officialCommands":["openclaw skills list","openclaw skills info","openclaw skills check"]},
    "memory": {"claim":"projected","nativeAuthority":"runtime","canonicalAuthority":"runtime_until_promoted","persistence":"sensitive_index","relation":"sensitive_projection","lossPolicy":"metadata_default_content_policy_gated","writeBackPolicy":"blocked_until_policy","validation":"sensitive_fixture_required","officialCommands":["openclaw memory status","openclaw memory index","openclaw memory search"]},
    "channels": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"claw_registry_with_runtime_binding","persistence":"secret_refs_and_binding_metadata","relation":"brokered_binding","lossPolicy":"secret_refs_only","writeBackPolicy":"official_cli_with_dry_run_when_available","validation":"external_pending_for_live_accounts","officialCommands":["openclaw channels list","openclaw channels status","openclaw channels add","openclaw channels remove","openclaw channels login","openclaw channels logout"]},
    "providers": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"claw_for_context_runtime_for_native_profile","persistence":"secret_refs","relation":"governed_context_binding","lossPolicy":"no_plaintext_secrets","writeBackPolicy":"brokered_only","validation":"fixture_and_external_pending_live","officialCommands":["openclaw models auth","openclaw onboard --auth-choice"]},
    "auth": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"host_for_secrets_runtime_for_native_profile","persistence":"opaque_refs","relation":"secret_ref_mapping","lossPolicy":"opaque_refs_only","writeBackPolicy":"signed_host_or_runtime_official_cli","validation":"secret_guard","officialCommands":["openclaw secrets reload","openclaw secrets audit","openclaw secrets configure"]},
    "models": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"both_with_resolver","persistence":"routing_metadata","relation":"model_profile_projection","lossPolicy":"native_aliases_preserved","writeBackPolicy":"official_cli_only","validation":"fixture_required","officialCommands":["openclaw models list","openclaw models status","openclaw models set","openclaw models aliases","openclaw models fallbacks"]},
    "scheduler": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"task_projection","lossPolicy":"index_only_until_operable","writeBackPolicy":"blocked_until_tested","validation":"fixture_required","officialCommands":["openclaw cron status","openclaw cron list","openclaw cron add","openclaw cron edit","openclaw cron rm","openclaw tasks","openclaw tasks list","openclaw tasks show","openclaw tasks notify","openclaw tasks cancel","openclaw tasks audit","openclaw tasks maintenance","openclaw tasks flow list","openclaw tasks flow show","openclaw tasks flow cancel"]},
    "plugins": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"inventory_projection","lossPolicy":"no_auto_enable","writeBackPolicy":"blocked_until_plugin_policy","validation":"fixture_required","officialCommands":["openclaw plugins list","openclaw plugins info","openclaw plugins install","openclaw plugins enable","openclaw plugins disable","openclaw plugins doctor","openclaw hooks list","openclaw hooks info","openclaw hooks check","openclaw hooks enable","openclaw hooks disable","openclaw hooks install","openclaw hooks update"]},
    "gateway": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"status_snapshot","relation":"lifecycle_status","lossPolicy":"status_snapshot","writeBackPolicy":"lifecycle_commands_only","validation":"local_dry_run_or_fixture","officialCommands":["openclaw gateway status","openclaw gateway health","openclaw gateway start","openclaw daemon status","openclaw system event","openclaw system heartbeat last","openclaw system heartbeat enable","openclaw system heartbeat disable","openclaw system presence"]},
    "doctorCompat": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"diagnostic_receipts","relation":"diagnostic_projection","lossPolicy":"redacted_receipts","writeBackPolicy":"safe_repair_only_after_approval","validation":"fixture_required","officialCommands":["openclaw doctor","openclaw status","openclaw health"]},
    "sandboxPermissions": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime_and_host_by_action","persistence":"audit_summary","relation":"approval_projection","lossPolicy":"no_silent_permission_change","writeBackPolicy":"explicit_approval_only","validation":"permission_fixture_required","officialCommands":["openclaw sandbox list","openclaw sandbox explain","openclaw approvals get","openclaw approvals set","openclaw security audit"]},
    "configuration": {"claim":"operable","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"config_snapshot_without_secrets","relation":"config_projection","lossPolicy":"secrets_redacted","writeBackPolicy":"official_cli_only","validation":"config_fixture_required","officialCommands":["openclaw config get","openclaw config set","openclaw config unset","openclaw setup","openclaw onboard"]}
  },
  "codex": {
    "sessions": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_and_shadow_when_safe","relation":"read_only_projection","lossPolicy":"no_destructive_migration","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex","codex resume","codex resume --last","codex resume --all","codex fork","codex fork --last","codex exec"]},
    "skills": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime_for_installation_claw_for_canon","persistence":"index_only","relation":"inventory_projection","lossPolicy":"no_auto_import","writeBackPolicy":"blocked_until_official_write_policy","validation":"snapshot_required","officialCommands":["/skills","$skill-name"]},
    "memory": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"metadata_only","relation":"instruction_projection","lossPolicy":"metadata_default","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["repository and user instructions"]},
    "channels": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"mcp_projection","lossPolicy":"no_secret_copy","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex mcp","codex mcp list","codex mcp get","codex mcp add","codex mcp remove","codex mcp login","codex mcp logout"]},
    "providers": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"config_projection","lossPolicy":"redacted_only","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex config"]},
    "auth": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"secret_ref_projection","lossPolicy":"no_plaintext","writeBackPolicy":"blocked_by_default","validation":"secret_guard","officialCommands":["codex login","codex login status","codex login --with-api-key","codex login --with-access-token","codex logout","codex mcp login","codex mcp logout"]},
    "models": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"model_projection","lossPolicy":"native_names_preserved","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex model/config"]},
    "scheduler": {"claim":"inventoried","nativeAuthority":"blocked","canonicalAuthority":"blocked","persistence":"none","relation":"unsupported","lossPolicy":"not_applicable","writeBackPolicy":"blocked","validation":"manifest_guard","officialCommands":[]},
    "plugins": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"inventory_projection","lossPolicy":"no_auto_enable","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex plugin","codex plugin marketplace"]},
    "gateway": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"mcp_server_projection","lossPolicy":"no_secret_copy","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex mcp add","codex mcp login","codex mcp-server","codex app-server daemon","codex app-server proxy","codex remote-control"]},
    "doctorCompat": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"diagnostic_summary","relation":"diagnostic_projection","lossPolicy":"redacted_summary","writeBackPolicy":"blocked_by_default","validation":"fixture_required","officialCommands":["codex --help","codex --version","codex features list","codex debug"]},
    "sandboxPermissions": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"audit_summary","relation":"policy_projection","lossPolicy":"no_silent_permission_change","writeBackPolicy":"blocked_by_default","validation":"permission_fixture_required","officialCommands":["codex sandbox","codex sandbox macos","codex sandbox linux","codex sandbox windows"]},
    "configuration": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"read_only_projection","lossPolicy":"redacted_only","writeBackPolicy":"blocked_by_default","validation":"config_fixture_required","officialCommands":["codex config","codex features list","codex features enable","codex features disable","codex mcp"]}
  },
  "hermes": {
    "sessions": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_and_shadow_when_safe","relation":"native_projection","lossPolicy":"preserve_when_safe","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes","hermes chat","hermes -z <prompt>","hermes --continue","hermes --resume <session_id>","hermes chat --continue <name>","hermes chat --resume <session>","hermes sessions list","hermes sessions browse","hermes sessions export <output> [--session-id ID]","hermes sessions delete <session-id>","hermes sessions prune","hermes sessions stats","hermes sessions rename <session-id> <title>","/new","/reset","/sessions","/title"]},
    "skills": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"inventory_projection","lossPolicy":"no_auto_import","writeBackPolicy":"blocked_until_fixture_coverage","validation":"snapshot_required","officialCommands":["hermes skills browse","hermes skills search","hermes skills install","hermes skills inspect","hermes skills list","hermes skills check","hermes skills update","hermes skills audit","hermes skills uninstall","hermes skills reset","hermes skills publish","hermes skills snapshot","hermes skills tap","hermes skills config","hermes bundles list","hermes bundles show <name>","hermes curator status","hermes curator run --dry-run","/skills","/<skill-name>"]},
    "memory": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"sensitive_index","relation":"sensitive_projection","lossPolicy":"metadata_default","writeBackPolicy":"blocked_until_policy","validation":"fixture_required","officialCommands":["hermes memory setup","hermes memory status","hermes memory off","hermes plugins list","hermes profile show <name>","hermes claw migrate --preset user-data --dry-run"]},
    "channels": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"secret_refs_only","relation":"gateway_projection","lossPolicy":"secret_refs_only","writeBackPolicy":"external_pending_live_accounts","validation":"external_pending_for_live_accounts","officialCommands":["hermes gateway","hermes gateway setup","hermes gateway run","hermes gateway start","hermes gateway stop","hermes gateway restart","hermes gateway status","hermes gateway list","hermes whatsapp","hermes slack manifest","hermes pairing list","hermes pairing approve <platform> <code>","hermes webhook subscribe","hermes portal status"]},
    "providers": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"provider_projection","lossPolicy":"redacted_only","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes model","hermes chat --provider <provider>","hermes auth list","hermes auth status <provider>","hermes fallback list","hermes fallback add","hermes fallback remove","hermes portal status","hermes setup model"]},
    "auth": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"secret_ref_projection","lossPolicy":"no_plaintext","writeBackPolicy":"blocked_until_fixture_coverage","validation":"secret_guard","officialCommands":["hermes auth","hermes auth list","hermes auth add <provider>","hermes auth remove <provider> <index>","hermes auth reset <provider>","hermes auth status <provider>","hermes auth logout <provider>","hermes auth spotify","hermes model","hermes setup --portal","hermes portal status","hermes claw migrate --dry-run"]},
    "models": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"model_projection","lossPolicy":"native_names_preserved","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes model","hermes chat --model <model>","hermes chat --provider <provider>","hermes fallback list","hermes fallback add","hermes fallback clear","/model","/model <provider>:<model>","/model <model> --global"]},
    "scheduler": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"scheduler_projection","lossPolicy":"index_only","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes cron list","hermes cron create","hermes cron add","hermes cron edit","hermes cron pause","hermes cron resume","hermes cron run","hermes cron remove","hermes cron status","hermes cron tick","hermes webhook subscribe","hermes kanban","/background <prompt>"]},
    "plugins": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"index_only","relation":"inventory_projection","lossPolicy":"no_auto_enable","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes plugins","hermes plugins install <identifier>","hermes plugins update <name>","hermes plugins remove <name>","hermes plugins enable <name>","hermes plugins disable <name>","hermes plugins list","hermes tools","hermes tools --summary","hermes mcp serve","hermes mcp add <name>","hermes mcp list","hermes mcp test <name>","hermes mcp configure <name>","hermes mcp login <name>","hermes acp","hermes hooks list","hermes computer-use status"]},
    "gateway": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"status_snapshot","relation":"status_projection","lossPolicy":"status_snapshot","writeBackPolicy":"blocked_until_fixture_coverage","validation":"fixture_required","officialCommands":["hermes gateway","hermes gateway run","hermes gateway start","hermes gateway stop","hermes gateway restart","hermes gateway status","hermes gateway list","hermes gateway install","hermes gateway uninstall","hermes gateway setup","hermes portal status","hermes portal tools","hermes logs gateway","hermes dashboard --status"]},
    "doctorCompat": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"diagnostic_summary","relation":"diagnostic_projection","lossPolicy":"redacted_summary","writeBackPolicy":"safe_repair_only_after_approval","validation":"fixture_required","officialCommands":["hermes doctor","hermes doctor --fix","hermes status","hermes status --all","hermes status --deep","hermes dump","hermes dump --show-keys","hermes debug share --local","hermes logs","hermes update --check","hermes version","hermes --version","hermes --help"]},
    "sandboxPermissions": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"audit_summary","relation":"approval_projection","lossPolicy":"no_silent_permission_change","writeBackPolicy":"explicit_approval_only","validation":"permission_fixture_required","officialCommands":["hermes setup terminal","hermes config set terminal.backend <backend>","hermes chat --yolo","hermes checkpoints","hermes hooks list","hermes hooks doctor","hermes security audit","hermes tools --summary","security docs","tools docs"]},
    "configuration": {"claim":"inventoried","nativeAuthority":"runtime","canonicalAuthority":"runtime","persistence":"redacted_snapshot","relation":"config_projection","lossPolicy":"redacted_only","writeBackPolicy":"blocked_until_fixture_coverage","validation":"config_fixture_required","officialCommands":["hermes config show","hermes config edit","hermes config set <key> <value>","hermes config path","hermes config env-path","hermes config check","hermes config migrate","hermes setup","hermes setup --non-interactive","hermes setup --quick","hermes setup --reset","hermes dashboard","hermes dashboard --status","hermes profile list","hermes profile show <name>"]}
  }
}`);

const RUNTIME_ECOSYSTEM_SUPPORT = {
  openclaw: {
    supportStage: "operable",
    recommended: false,
    production: false,
    uiParityClaim: "partial_runtime_lens",
    summary: "Adapter support is production, and the Clawix runtime lens has real-app evidence, but the runtime ecosystem claim remains operable partial until native write-back and live evidence close.",
    blockingReasons: ["native_write_back_pending", "live_evidence_pending"],
  },
  codex: {
    supportStage: "dev_only",
    recommended: false,
    production: false,
    uiParityClaim: "partial_template_only",
    summary: "Codex runtime ecosystem support is a dev-only partial projection until official write policies and total snapshot coverage exist.",
    blockingReasons: ["dev_only_runtime_ecosystem", "native_write_policy_pending", "ui_parity_not_claimed"],
  },
  hermes: {
    supportStage: "dev_only",
    recommended: false,
    production: false,
    uiParityClaim: "partial_runtime_lens",
    summary: "Hermes runtime ecosystem support is a dev-only partial runtime lens until official fixture coverage, write policies, and live channel evidence exist.",
    blockingReasons: ["dev_only_runtime_ecosystem", "fixture_coverage_pending", "live_channel_evidence_pending"],
  },
};

const RUNTIME_SESSION_ACTION_CONTRACTS = JSON.parse(`{
  "openclaw": [
    {"action":"list","status":"implemented","authority":"runtime","writesRuntime":false,"persistence":"runtime_gateway_snapshot","delegatesTo":"runtime.openclaw.sessions.list","guard":"official_gateway_read_only"},
    {"action":"preview","status":"implemented","authority":"runtime","writesRuntime":false,"persistence":"runtime_gateway_snapshot","delegatesTo":"runtime.openclaw.sessions.preview","guard":"official_gateway_preview_read_only"},
    {"action":"resolve","status":"implemented","authority":"runtime","writesRuntime":false,"persistence":"runtime_gateway_snapshot","delegatesTo":"runtime.openclaw.sessions.resolve","guard":"official_gateway_resolve_read_only"},
    {"action":"history","status":"implemented","authority":"runtime","writesRuntime":false,"persistence":"runtime_gateway_snapshot","delegatesTo":"runtime.openclaw.chat.history","guard":"official_gateway_history_read_only"},
    {"action":"send","status":"implemented_requires_confirmation","authority":"runtime","writesRuntime":true,"persistence":"runtime_gateway_write","delegatesTo":"runtime.openclaw.chat.send","guard":"requires_confirm_runtime_write"},
    {"action":"inject","status":"implemented_requires_confirmation","authority":"runtime","writesRuntime":true,"persistence":"runtime_gateway_write","delegatesTo":"runtime.openclaw.chat.inject","guard":"requires_confirm_runtime_write"},
    {"action":"abort","status":"implemented_requires_confirmation","authority":"runtime","writesRuntime":true,"persistence":"runtime_gateway_control","delegatesTo":"runtime.openclaw.chat.abort","guard":"requires_confirm_runtime_write"},
    {"action":"create","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until official runtime create contract and fixture","guard":"blocked_until_official_create_fixture","requiredEvidence":["official_create_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_list_evidence"]},
    {"action":"pin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"unpin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"conflicts","status":"implemented","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay_report","delegatesTo":"ClawJS app-state local overlay reconciliation report","guard":"no_silent_overwrite_or_runtime_write_back"}
  ],
  "codex": [
    {"action":"list","status":"degraded","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"metadata_only","delegatesTo":"runtime session path metadata projection","guard":"bounded_scan_without_transcript_reads"},
    {"action":"preview","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_local_session_preview","delegatesTo":"blocked until native preview contract","delegatesToWhenSessionPath":"runtime session path bounded preview","guard":"blocked_until_preview_contract_and_content_policy","guardWhenSessionPath":"metadata_default_include_content_required"},
    {"action":"resolve","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_local_session_resolve","delegatesTo":"blocked until native resolve contract","delegatesToWhenSessionPath":"runtime session path bounded resolve","guard":"blocked_until_resolve_contract","guardWhenSessionPath":"metadata_default_no_content"},
    {"action":"history","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_redacted_local_session_history","delegatesTo":"blocked until native history contract","delegatesToWhenSessionPath":"runtime session path bounded history","guard":"blocked_until_history_contract_and_content_policy","guardWhenSessionPath":"metadata_default_include_content_required"},
    {"action":"send","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native send contract","guard":"blocked_until_send_contract","requiredEvidence":["official_send_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_visibility"]},
    {"action":"inject","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native inject contract","guard":"blocked_until_inject_contract","requiredEvidence":["official_inject_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_visibility"]},
    {"action":"abort","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native abort contract","guard":"blocked_until_abort_contract","requiredEvidence":["official_abort_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_control_receipt"]},
    {"action":"create","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until official runtime create contract and fixture","guard":"blocked_until_official_create_fixture","requiredEvidence":["official_create_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_list_evidence"]},
    {"action":"pin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"unpin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"conflicts","status":"implemented","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay_report","delegatesTo":"ClawJS app-state local overlay reconciliation report","guard":"no_silent_overwrite_or_runtime_write_back"}
  ],
  "hermes": [
    {"action":"list","status":"degraded","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"metadata_only","delegatesTo":"runtime session path metadata projection","guard":"bounded_scan_without_transcript_reads"},
    {"action":"preview","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_local_session_preview","delegatesTo":"blocked until native preview contract","delegatesToWhenSessionPath":"runtime session path bounded preview","guard":"blocked_until_preview_contract_and_content_policy","guardWhenSessionPath":"metadata_default_include_content_required"},
    {"action":"resolve","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_local_session_resolve","delegatesTo":"blocked until native resolve contract","delegatesToWhenSessionPath":"runtime session path bounded resolve","guard":"blocked_until_resolve_contract","guardWhenSessionPath":"metadata_default_no_content"},
    {"action":"history","status":"blocked","statusWhenSessionPath":"implemented","authority":"runtime","writesRuntime":false,"persistence":"none","persistenceWhenSessionPath":"bounded_redacted_local_session_history","delegatesTo":"blocked until native history contract","delegatesToWhenSessionPath":"runtime session path bounded history","guard":"blocked_until_history_contract_and_content_policy","guardWhenSessionPath":"metadata_default_include_content_required"},
    {"action":"send","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native send contract","guard":"blocked_until_send_contract","requiredEvidence":["official_send_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_visibility"]},
    {"action":"inject","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native inject contract","guard":"blocked_until_inject_contract","requiredEvidence":["official_inject_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_visibility"]},
    {"action":"abort","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until native abort contract","guard":"blocked_until_abort_contract","requiredEvidence":["official_abort_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_control_receipt"]},
    {"action":"create","status":"blocked","authority":"runtime","writesRuntime":false,"wouldWriteRuntime":true,"persistence":"none","delegatesTo":"blocked until official runtime create contract and fixture","guard":"blocked_until_official_create_fixture","requiredEvidence":["official_create_command_or_api","non_destructive_fixture","confirmation_or_dry_run_policy","round_trip_native_list_evidence"]},
    {"action":"pin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"unpin","status":"local_overlay_only","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay","delegatesTo":"ClawJS app-state local pin overlay","guard":"must_not_write_runtime_pin_without_official_api"},
    {"action":"conflicts","status":"implemented","authority":"clawix_local_overlay","writesRuntime":false,"persistence":"local_pin_overlay_report","delegatesTo":"ClawJS app-state local overlay reconciliation report","guard":"no_silent_overwrite_or_runtime_write_back"}
  ]
}`);

const RUNTIME_PORTAL_PRIVATE_FIELD_NAMES = new Set(["env", "headers", "token"]);

function normalizeDomain(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-") || "summary";
  return DOMAIN_ALIASES.get(normalized) ?? normalized;
}

function isRuntimePortalDomain(domain: string): boolean {
  return RUNTIME_PORTAL_DOMAIN_ORDER.includes(domain);
}

function writePayload(input, payload, meta = {}) {
  const publicPayload = stripRuntimePortalPrivateFields(payload);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "runtime", publicPayload, {
      invokedCommand: "runtime",
      subcommand: input.command ?? null,
      operation: input.subcommand ?? null,
      ...meta,
    });
    return;
  }
  input.context.stdout.write(`${JSON.stringify(publicPayload, null, 2)}\n`);
}

function writePortalUsageError(input, code: string, message: string, meta = {}) {
  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, "runtime", new CliHandledError(code, message, CLI_EXIT_USAGE), {
      invokedCommand: "runtime",
      subcommand: input.command ?? null,
      operation: input.subcommand ?? null,
      ...meta,
    });
  } else {
    input.context.stderr.write(`${message}\n`);
  }
}

function stripRuntimePortalPrivateFields(value) {
  if (Array.isArray(value)) return value.map((entry) => stripRuntimePortalPrivateFields(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !RUNTIME_PORTAL_PRIVATE_FIELD_NAMES.has(key))
        .map(([key, entry]) => [key, stripRuntimePortalPrivateFields(entry)]),
    );
  }
  return value;
}

function runtimePortalUsage(binName: string): string {
  return [
    `Usage: ${binName} runtime <openclaw|codex|hermes> <summary|domains|domain|resources|commands|status|support|session|sessions|workspace> [options]`,
    "",
    "Examples:",
    `  ${binName} runtime openclaw domains --json`,
    `  ${binName} runtime openclaw support --json`,
    `  ${binName} runtime openclaw sessions preview --session-key alpha --json`,
    `  ${binName} runtime codex resources skills --json`,
    `  ${binName} runtime hermes commands --json`,
  ].join("\n");
}

function buildCommandMatrix(adapter, runtimeId: RuntimeAdapterId) {
  return {
    runtimeId,
    runtimeName: adapter.runtimeName,
    authority: "runtime_adapter",
    executableByClawCli: [
      {
        command: `runtime ${runtimeId} status`,
        delegatesTo: "adapter.getStatus",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} domains`,
        delegatesTo: "adapter capability map and resource facades",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} support`,
        delegatesTo: "runtime ecosystem support audit",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} resources <domain>`,
        delegatesTo: "adapter resource catalog/list methods",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} session`,
        delegatesTo: "adapter session descriptor",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} sessions list`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.sessions.list" : "runtime session metadata projection",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} sessions preview --session-key <id>`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.sessions.preview" : "runtime session path bounded preview when configured; otherwise blocked until native preview contract",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} sessions resolve --session-key <id>`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.sessions.resolve" : "runtime session path bounded resolve when configured; otherwise blocked until native resolve contract",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} sessions history --session-key <id>`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.chat.history" : "runtime session path bounded history when configured; otherwise blocked until native history contract",
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} sessions send --session-key <id> --message <text> --confirm-runtime-write`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.chat.send" : "blocked until native send contract",
        writesRuntime: runtimeId === "openclaw",
        wouldWriteRuntime: runtimeId !== "openclaw",
      },
      {
        command: `runtime ${runtimeId} sessions inject --session-key <id> --message <text> --confirm-runtime-write`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.chat.inject" : "blocked until native inject contract",
        writesRuntime: runtimeId === "openclaw",
        wouldWriteRuntime: runtimeId !== "openclaw",
      },
      {
        command: `runtime ${runtimeId} sessions abort --session-key <id> --confirm-runtime-write`,
        delegatesTo: runtimeId === "openclaw" ? "runtime.openclaw.chat.abort" : "blocked until native abort contract",
        writesRuntime: runtimeId === "openclaw",
        wouldWriteRuntime: runtimeId !== "openclaw",
      },
      {
        command: `runtime ${runtimeId} sessions create --title <title>`,
        delegatesTo: "blocked until official runtime create contract and fixture",
        writesRuntime: false,
        wouldWriteRuntime: true,
      },
      {
        command: `runtime ${runtimeId} sessions pin --session-key <id>`,
        delegatesTo: "ClawJS app-state local overlay",
        writesRuntime: false,
        writesLocalOverlay: true,
      },
      {
        command: `runtime ${runtimeId} sessions unpin --session-key <id>`,
        delegatesTo: "ClawJS app-state local overlay",
        writesRuntime: false,
        writesLocalOverlay: true,
      },
      {
        command: `runtime ${runtimeId} sessions conflicts`,
        delegatesTo: "ClawJS app-state local overlay reconciliation report",
        writesRuntime: false,
        writesLocalOverlay: false,
      },
      {
        command: `runtime ${runtimeId} install --dry-run`,
        delegatesTo: adapter.buildInstallCommand().command,
        args: adapter.buildInstallCommand().args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} repair --dry-run`,
        delegatesTo: adapter.buildRepairCommand().command,
        args: adapter.buildRepairCommand().args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} setup-workspace --dry-run`,
        delegatesTo: adapter.buildWorkspaceSetupCommand({ agentId: "default", workspaceDir: "." }).command,
        args: adapter.buildWorkspaceSetupCommand({ agentId: "default", workspaceDir: "." }).args,
        writesRuntime: false,
      },
      {
        command: `runtime ${runtimeId} uninstall --dry-run`,
        delegatesTo: adapter.buildUninstallCommand().command,
        args: adapter.buildUninstallCommand().args,
        writesRuntime: false,
      },
    ],
    resourceDomains: RUNTIME_PORTAL_DOMAIN_ORDER,
    mutationPolicy: runtimeId === "codex"
      ? "Codex-owned config remains read-only from ClawJS unless Codex exposes an explicit supported mutation path."
      : "Runtime-owned actions must delegate to the runtime adapter or be marked unsupported.",
  };
}

function runtimeOptionsFromInput(input, runtimeId: RuntimeAdapterId) {
  return {
    adapter: runtimeId,
    homeDir: input.flags["home-dir"],
    configPath: input.flags["config-path"],
    binaryPath: input.flags["binary-path"],
    workspacePath: input.flags["runtime-workspace"] ?? input.workspaceRoot,
    authStorePath: input.flags["auth-store"],
    agentDir: input.flags["agent-dir"],
    provider: input.flags.provider,
    model: input.flags.model,
    wire: input.flags.wire,
    baseUrl: input.flags["base-url"],
    secretRef: input.flags["secret-ref"],
    envKey: input.flags["env-key"],
    permissionMode: input.flags.sandbox,
    gateway: {
      url: input.flags["gateway-url"],
      token: input.flags["gateway-token"],
      ...(input.flags["gateway-port"] ? { port: Number(input.flags["gateway-port"]) } : {}),
      configPath: input.flags["gateway-config"],
    },
    env: process.env,
  };
}

function boolLabel(value: boolean | undefined): string {
  return value === true ? "true" : value === false ? "false" : "unknown";
}

function runtimeLocationDiagnostics(status): Record<string, string | undefined> {
  const locations = status?.diagnostics?.locations;
  return locations && typeof locations === "object" ? locations as Record<string, string | undefined> : {};
}

function buildGatewayOperationalResources(runtimeId: RuntimeAdapterId, status, runtimeOptions, session) {
  const capability = domainCapability(status, "gateway");
  const locations = runtimeLocationDiagnostics(status);
  const gatewayOptions = runtimeOptions?.gateway ?? {};
  const resources = [
    {
      id: "gateway-status",
      label: "Gateway status",
      status: status.gatewayAvailable ? "ready" : "degraded",
      kind: session?.transport?.kind ?? "gateway",
      enabled: Boolean(session?.supportsGateway),
      summary: status.gatewayAvailable ? "Gateway endpoint configured." : "Gateway endpoint unavailable or not configured.",
      limitations: capability?.limitations ?? [],
      attributes: [
        `runtime: ${runtimeId}`,
        `primary transport: ${session?.primaryTransport ?? "unknown"}`,
        `fallback transport: ${session?.fallbackTransport ?? "unknown"}`,
        `streaming mode: ${session?.streamingMode ?? "unknown"}`,
        `supports gateway: ${boolLabel(session?.supportsGateway)}`,
      ],
      provenance: {
        source: "runtime-session-descriptor",
        runtimeId,
      },
    },
  ];
  if (gatewayOptions.url || gatewayOptions.port || gatewayOptions.configPath || locations.gatewayConfigPath) {
    resources.push({
      id: "gateway-configuration",
      label: "Gateway configuration",
      status: gatewayOptions.url ? "configured" : "projected",
      kind: "gateway_config",
      path: gatewayOptions.configPath ?? locations.gatewayConfigPath,
      enabled: Boolean(gatewayOptions.url || gatewayOptions.port || gatewayOptions.configPath || locations.gatewayConfigPath),
      summary: gatewayOptions.url ? "Gateway endpoint configured; credential value is not exposed." : "Gateway configuration path projected.",
      limitations: [],
      attributes: [
        `url configured: ${boolLabel(Boolean(gatewayOptions.url))}`,
        `port configured: ${boolLabel(Boolean(gatewayOptions.port))}`,
        `token configured: ${boolLabel(Boolean(gatewayOptions.token))}`,
        "secret policy: redacted_presence_only",
      ],
      provenance: {
        source: "runtime-options",
        runtimeId,
        path: gatewayOptions.configPath ?? locations.gatewayConfigPath,
      },
    });
  }
  return resources;
}

function buildDoctorOperationalResources(runtimeId: RuntimeAdapterId, status) {
  const capability = domainCapability(status, "doctorCompat");
  const lastError = status?.diagnostics?.lastError;
  return [
    {
      id: "doctor-status",
      label: "Doctor status",
      status: status.cliAvailable ? "ready" : "degraded",
      kind: capability?.strategy ?? "diagnostics",
      enabled: Boolean(capability?.supported),
      summary: lastError ?? status.version ?? "Runtime diagnostics available.",
      limitations: capability?.limitations ?? [],
      attributes: [
        `runtime: ${runtimeId}`,
        `cli available: ${boolLabel(status.cliAvailable)}`,
        `installed: ${boolLabel(status.installed)}`,
        `version available: ${boolLabel(Boolean(status.version))}`,
        "secret policy: redacted_summary",
      ],
      provenance: {
        source: "runtime-status",
        runtimeId,
      },
    },
  ];
}

function buildSandboxOperationalResources(runtimeId: RuntimeAdapterId, status, runtimeOptions) {
  const capability = domainCapability(status, "sandboxPermissions");
  const permissionMode = runtimeOptions?.permissionMode ?? "read-only";
  return [
    {
      id: "sandbox-policy",
      label: "Sandbox policy",
      status: capability?.status ?? "degraded",
      kind: capability?.strategy ?? "approval_policy",
      enabled: Boolean(capability?.supported),
      summary: "No runtime or host permission is changed by the runtime lens.",
      limitations: capability?.limitations ?? [],
      attributes: [
        `runtime: ${runtimeId}`,
        `permission mode: ${permissionMode}`,
        "write policy: explicit_approval_only",
        "conflict policy: no_silent_permission_change",
      ],
      provenance: {
        source: "runtime-options",
        runtimeId,
      },
    },
  ];
}

async function readResources(claw, domain: string, status, adapter?, runtimeOptions?) {
  async function readPluginResources() {
    if (status.adapter === "openclaw") {
      return { plugins: await claw.runtime.plugins.status() };
    }
    const pluginCatalog = adapter?.resources?.getPluginCatalog
      ? await adapter.resources.getPluginCatalog(new NodeProcessHost(), runtimeOptions)
      : { plugins: [] };
    return {
      plugins: pluginCatalog.plugins ?? [],
      status: status.capabilityMap?.plugins ?? { supported: false, status: "unsupported", strategy: "unsupported" },
    };
  }

  switch (domain) {
    case "sessions":
    case "gateway":
    case "doctorCompat":
    case "sandboxPermissions":
    case "configuration":
      return {};
    case "providers":
      return { providers: await claw.providers.list() };
    case "models":
      return { models: await claw.models.list(), defaultModel: await claw.models.getDefault() };
    case "auth":
      return { auth: await claw.auth.status() };
    case "scheduler":
      return { schedulers: await claw.scheduler.list() };
    case "memory":
      return { memory: await claw.memory.list() };
    case "skills":
      return { skills: await claw.skills.list() };
    case "channels":
      return { channels: await claw.channels.list() };
    case "plugins":
      return readPluginResources();
    default:
      const pluginResources = await readPluginResources();
      return {
        providers: await claw.providers.list(),
        models: await claw.models.list(),
        defaultModel: await claw.models.getDefault(),
        auth: await claw.auth.status(),
        schedulers: await claw.scheduler.list(),
        memory: await claw.memory.list(),
        skills: await claw.skills.list(),
        channels: await claw.channels.list(),
        plugins: pluginResources.plugins,
        status: pluginResources.status,
      };
  }
}

function domainCapability(status, domain: string) {
  const capabilityMap = status.capabilityMap ?? {};
  const capabilityKey = domain === "providers" ? "auth"
    : domain === "sessions" ? "session_cli"
    : domain === "gateway" ? "session_gateway"
    : domain === "doctorCompat" ? "compat"
    : domain === "sandboxPermissions" ? "sandbox"
    : domain;
  return capabilityMap[capabilityKey];
}

function domainAuthority(domain: string) {
  if (domain === "configuration") return "runtime_config_with_claw_workspace_projection";
  if (domain === "auth" || domain === "sandboxPermissions") return "runtime_and_host_by_action";
  if (domain === "providers" || domain === "models") return "runtime_adapter_with_claw_resolver";
  return "runtime_adapter";
}

function domainPolicy(runtimeId: RuntimeAdapterId, domain: string) {
  return RUNTIME_PORTAL_DOMAIN_POLICIES[runtimeId]?.[domain] ?? {
    claim: "inventoried",
    nativeAuthority: "runtime",
    canonicalAuthority: domainAuthority(domain),
    persistence: "index_only",
    relation: "projection",
    lossPolicy: "no_silent_loss",
    writeBackPolicy: "blocked_until_policy",
    validation: "fixture_required",
    officialCommands: [],
  };
}

function freshnessFor(status, domain: string) {
  const capability = domainCapability(status, domain);
  return capability?.diagnostics?.inventoryFreshness
    ?? (status.cliAvailable ? "snapshot" : "degraded_snapshot");
}

function evidenceRequirementsFor(runtimeId: RuntimeAdapterId, domain: string, policy) {
  const requirements = [];
  const validation = String(policy.validation ?? "");
  const writeBackPolicy = String(policy.writeBackPolicy ?? "");
  if (validation.includes("external_pending") || writeBackPolicy.includes("external_pending")) {
    requirements.push({
      id: `${runtimeId}.${domain}.live_evidence`,
      blockerClass: "external_pending",
      approvalRequired: true,
      commandShape: `runtime ${runtimeId} domain ${domain} --json`,
      expectedEvidence: [
        "redacted_json_receipt",
        "no_plaintext_secrets",
        "support_contract_matches_manifest",
      ],
      riskControls: [
        "read_only_first",
        "no_paid_calls_without_explicit_approval",
        "no_provider_or_channel_mutation_without_explicit_approval",
      ],
      evidenceDisposition: "external_pending_until_approved_redacted_live_receipt",
      currentBehavior: "read_only_projection_or_degraded_snapshot_only",
      fallbackPolicy: "no_live_claim_promotion_without_explicit_approval",
      claimEffect: "blocks_recommended_production_native_parity",
      reentryCondition: `approve_and_run_runtime_${runtimeId}_domain_${domain}_read_only_evidence`,
      productDecision: "external_live_claim_not_supported_without_approved_redacted_evidence",
      supportResolution: "external_pending_not_product_blocked",
      userVisibleContract: "read_only_degraded_projection_until_live_evidence_is_approved",
      promotionGate: "claim_remains_unpromoted_until_redacted_live_evidence_is_attached",
    });
  }
  if (writeBackPolicy.startsWith("blocked")) {
    requirements.push({
      id: `${runtimeId}.${domain}.write_back_contract`,
      blockerClass: "direct_blocker",
      approvalRequired: false,
      commandShape: "not_executable_until_official_runtime_contract_exists",
      expectedEvidence: [
        "official_runtime_cli_or_api",
        "non_destructive_fixture",
        "round_trip_native_visibility",
      ],
      riskControls: [
        "no_silent_write_back",
        "no_direct_runtime_store_mutation",
        "local_overlay_only_until_contract_exists",
      ],
      evidenceDisposition: "blocked_until_official_runtime_contract",
      currentBehavior: "read_only_projection_or_local_overlay_only",
      fallbackPolicy: "do_not_synthesize_native_write_back",
      claimEffect: "blocks_recommended_production_native_parity",
      reentryCondition: "add_official_runtime_contract_fixture_and_round_trip_evidence",
      productDecision: "native_write_back_unsupported_until_official_runtime_contract",
      supportResolution: "explicitly_product_blocked_not_a_silent_gap",
      userVisibleContract: "read_only_projection_or_local_overlay_only",
      promotionGate: "write_back_claim_remains_blocked_until_contract_fixture_and_round_trip_evidence_exist",
    });
  }
  return requirements;
}

function buildSupportContract(runtimeId: RuntimeAdapterId, status, domain: string) {
  const policy = domainPolicy(runtimeId, domain);
  const evidenceRequirements = evidenceRequirementsFor(runtimeId, domain, policy);
  return {
    ...policy,
    authority: domainAuthority(domain),
    freshness: freshnessFor(status, domain),
    writeBackAllowed: !String(policy.writeBackPolicy).startsWith("blocked")
      && policy.writeBackPolicy !== "external_pending_live_accounts",
    externalPending: String(policy.validation).includes("external_pending")
      || String(policy.writeBackPolicy).includes("external_pending"),
    evidenceRequirements,
    provenance: {
      source: "runtime-ecosystem-manifest",
      runtimeId,
      domain,
    },
  };
}

function buildRuntimeEcosystemSupport(runtimeId: RuntimeAdapterId) {
  const support = RUNTIME_ECOSYSTEM_SUPPORT[runtimeId] ?? {
    supportStage: "dev_only",
    recommended: false,
    production: false,
    uiParityClaim: "none",
    summary: "Runtime ecosystem support is not promoted without an explicit manifest entry.",
    blockingReasons: ["runtime_ecosystem_manifest_missing"],
  };
  const policies = RUNTIME_PORTAL_DOMAIN_POLICIES[runtimeId] ?? {};
  const blockedWriteBackDomains = Object.entries(policies)
    .filter(([, policy]) => String(policy?.writeBackPolicy ?? "").startsWith("blocked"))
    .map(([domain]) => domain);
  const externalPendingDomains = Object.entries(policies)
    .filter(([, policy]) => String(policy?.validation ?? "").includes("external_pending")
      || String(policy?.writeBackPolicy ?? "").includes("external_pending"))
    .map(([domain]) => domain);
  const evidenceRequirements = Object.entries(policies).flatMap(([domain, policy]) => evidenceRequirementsFor(runtimeId, domain, policy));
  return {
    scope: "runtime_ecosystem",
    ...support,
    blockedWriteBackDomains,
    externalPendingDomains,
    evidenceRequirements,
    claimSource: "runtime-ecosystem-manifest",
    provenance: {
      source: "runtime-ecosystem-manifest",
      runtimeId,
    },
  };
}

function runtimeDomainReadProjectionStatus(audit, sessionActions = []) {
  const nativeAuthority = String(audit.nativeAuthority ?? "");
  const relation = String(audit.relation ?? "");
  const status = String(audit.status ?? "");
  if (nativeAuthority === "blocked" || relation === "unsupported") return "unsupported_by_runtime";
  if (audit.domain === "sessions" && sessionActions.some((action) => String(action.status ?? "").startsWith("implemented"))) {
    return "projected";
  }
  if (status === "ready") return "projected";
  if (status === "degraded") return "degraded_projection";
  if (status === "unsupported") return "contract_only_no_projection";
  return "manifest_projection_declared";
}

function runtimeDomainImplementedFacets(audit, sessionActions = []) {
  const facets = ["manifest_domain_contract", "claw_cli_resource_surface"];
  const relation = String(audit.relation ?? "");
  const status = String(audit.status ?? "");
  const persistence = String(audit.persistence ?? "");
  if (relation.includes("projection") || persistence !== "none") facets.push("read_projection_contract");
  if (status === "ready") facets.push("ready_runtime_projection");
  if (status === "degraded") facets.push("degraded_runtime_projection");
  if (audit.writeBackAllowed === true) facets.push("runtime_write_policy_allowed");
  if (audit.domain === "sessions") {
    const readActions = new Set(["list", "preview", "resolve", "history"]);
    const implementedReadActions = sessionActions
      .filter((action) => readActions.has(String(action.action ?? "")))
      .filter((action) => String(action.status ?? "").startsWith("implemented"))
      .map((action) => `session_${action.action}_action`);
    facets.push(...implementedReadActions);
    if (sessionActions.some((action) => String(action.status ?? "") === "local_overlay_only")) {
      facets.push("local_overlay_reconciliation_policy");
    }
  }
  return [...new Set(facets)];
}

function runtimeDomainBlockingFacets(requirements = [], audit) {
  const facets = [];
  if (String(audit?.status ?? "") === "unsupported") facets.push("unsupported_runtime_capability");
  for (const requirement of requirements) {
    const id = String(requirement.id ?? "");
    if (id.includes(".write_back_contract") || id.includes(".native_write_back_contract")) {
      facets.push("native_write_back_contract");
    } else if (id.includes(".action_contract")) {
      facets.push("native_action_contract");
    }
    if (requirement.blockerClass === "external_pending") facets.push("approved_live_evidence");
    if (requirement.supportResolution === "explicitly_product_blocked_not_a_silent_gap") {
      facets.push("product_blocked_claim");
    }
  }
  return [...new Set(facets)];
}

function runtimeDomainProjectionDisposition(closureStatus: string, readProjectionStatus: string) {
  if (closureStatus === "implemented_or_projected") return "projection_satisfies_current_manifest_claim";
  if (readProjectionStatus === "unsupported_by_runtime") return "runtime_domain_unsupported";
  if (readProjectionStatus === "contract_only_no_projection") return "contract_declared_without_live_projection";
  if (closureStatus === "external_pending") return "read_projection_available_live_evidence_pending";
  if (closureStatus === "product_blocked") return "read_projection_available_write_back_blocked";
  return "projection_blocked_until_direct_issue_resolved";
}

function countByValue(values) {
  return values.reduce((acc, value) => {
    const key = value ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function runtimeProjectionSummary(checklist) {
  const byReadProjectionStatus = countByValue(checklist.map((item) => item.readProjectionStatus));
  const implementedFacetCounts = countByValue(checklist.flatMap((item) => item.implementedFacets ?? []));
  const blockingFacetCounts = countByValue(checklist.flatMap((item) => item.blockingFacets ?? []));
  const readProjectionStatuses = new Set(["projected", "degraded_projection", "manifest_projection_declared"]);
  const projectedDomainCount = checklist
    .filter((item) => readProjectionStatuses.has(String(item.readProjectionStatus ?? ""))).length;
  const unsupportedDomainCount = checklist
    .filter((item) => item.readProjectionStatus === "unsupported_by_runtime").length;
  const productBlockedButProjectedDomainCount = checklist
    .filter((item) => item.closureStatus === "product_blocked")
    .filter((item) => readProjectionStatuses.has(String(item.readProjectionStatus ?? ""))).length;
  return {
    byReadProjectionStatus,
    implementedFacetCounts,
    blockingFacetCounts,
    projectedDomainCount,
    unsupportedDomainCount,
    productBlockedButProjectedDomainCount,
  };
}

function runtimeEvidenceReadinessSummary({
  evidenceRequirements,
  evidenceReentryPackets,
  productBlockedRequirements,
  externalPendingRequirements,
  unresolvedNativeRequirements,
}) {
  const statusCounts = countByValue(evidenceReentryPackets.map((packet) => packet.status));
  const blockerClassCounts = countByValue(evidenceReentryPackets.map((packet) => packet.blockerClass));
  const safeDefaultCounts = countByValue(evidenceReentryPackets.map((packet) => packet.safeDefault));
  const upstreamContractPackets = evidenceReentryPackets
    .filter((packet) => packet.status === "blocked_until_upstream_contract");
  const approvalPackets = evidenceReentryPackets
    .filter((packet) => packet.status === "approval_required" || packet.approvalRequired === true);
  const nextRequiredActions = [
    ...(approvalPackets.length > 0 ? ["approved_redacted_live_evidence"] : []),
    ...(upstreamContractPackets.length > 0 ? ["official_runtime_native_contract_fixture"] : []),
    ...(unresolvedNativeRequirements.length > 0 ? ["resolve_direct_blocker_before_promotion"] : []),
  ];
  return {
    statusCounts,
    blockerClassCounts,
    safeDefaultCounts,
    totalRequirementCount: evidenceRequirements.length,
    approvalRequiredCount: approvalPackets.length,
    externalPendingCount: externalPendingRequirements.length,
    upstreamContractBlockedCount: upstreamContractPackets.length,
    productBlockedCount: productBlockedRequirements.length,
    unresolvedNativeRequirementCount: unresolvedNativeRequirements.length,
    approvalRequiredRequirementIds: approvalPackets.map((packet) => packet.requirementId).filter(Boolean),
    externalPendingRequirementIds: externalPendingRequirements.map((requirement) => requirement.id),
    upstreamContractRequirementIds: upstreamContractPackets.map((packet) => packet.requirementId).filter(Boolean),
    productBlockedRequirementIds: productBlockedRequirements.map((requirement) => requirement.id),
    unresolvedNativeRequirementIds: unresolvedNativeRequirements.map((requirement) => requirement.id),
    nextRequiredActions,
    reentryPolicy: evidenceReentryPackets.length > 0
      ? "use_evidence_reentry_packets_before_claim_promotion"
      : "no_reentry_packets_required_for_current_claim",
    safeDefault: evidenceReentryPackets.length > 0
      ? "keep_unpromoted_and_follow_exact_reentry_packets"
      : "claim_may_remain_at_current_manifest_stage",
  };
}

function runtimeSyncPolicySummary(domainAudits, payload) {
  const sessionActions = payload.domainData?.sessions?.actionPolicy
    ?? payload.domainData?.sessions?.actionContracts
    ?? [];
  const localOverlayActions = sessionActions
    .filter((action) => String(action.status ?? "") === "local_overlay_only")
    .map((action) => action.action)
    .filter(Boolean);
  const localOverlayDomains = localOverlayActions.length > 0 ? ["sessions"] : [];
  const blockedWriteBackDomains = domainAudits
    .filter((domain) => String(domain.writeBackPolicy ?? "").startsWith("blocked"))
    .map((domain) => domain.domain);
  const externalPendingDomains = domainAudits
    .filter((domain) => domain.externalPending === true
      || String(domain.writeBackPolicy ?? "").includes("external_pending")
      || String(domain.validation ?? "").includes("external_pending"))
    .map((domain) => domain.domain);
  const writeBackAllowedDomains = domainAudits
    .filter((domain) => domain.writeBackAllowed === true)
    .map((domain) => domain.domain);
  const readOnlyProjectionDomains = domainAudits
    .filter((domain) => domain.writeBackAllowed !== true)
    .filter((domain) => {
      const relation = String(domain.relation ?? "");
      const persistence = String(domain.persistence ?? "");
      return relation.includes("projection")
        || relation.includes("inventory")
        || persistence.includes("index")
        || persistence.includes("snapshot")
        || persistence.includes("metadata");
    })
    .map((domain) => domain.domain);
  return {
    domainCount: domainAudits.length,
    canonicalAuthorityCounts: countByValue(domainAudits.map((domain) => domain.canonicalAuthority)),
    nativeAuthorityCounts: countByValue(domainAudits.map((domain) => domain.nativeAuthority)),
    persistenceCounts: countByValue(domainAudits.map((domain) => domain.persistence)),
    relationCounts: countByValue(domainAudits.map((domain) => domain.relation)),
    writeBackPolicyCounts: countByValue(domainAudits.map((domain) => domain.writeBackPolicy)),
    lossPolicyCounts: countByValue(domainAudits.map((domain) => domain.lossPolicy)),
    freshnessCounts: countByValue(domainAudits.map((domain) => domain.freshness)),
    readOnlyProjectionDomains,
    writeBackAllowedDomains,
    blockedWriteBackDomains,
    externalPendingDomains,
    localOverlayDomains,
    localOverlayActions,
    noSilentOverwrite: true,
    defaultSyncMode: "read_projection_first_no_silent_write_back",
    safeDefault: "project_runtime_state_do_not_sync_or_write_back_without_official_contract",
  };
}

function buildPortalSupport(adapter, runtimeId: RuntimeAdapterId) {
  const adapterSupport = {
    scope: "runtime_adapter",
    stability: adapter.stability,
    supportLevel: adapter.supportLevel,
    recommended: !!adapter.recommended,
  };
  return {
    ...adapterSupport,
    adapter: adapterSupport,
    ecosystem: buildRuntimeEcosystemSupport(runtimeId),
  };
}

function buildSupportAudit(runtimeId: RuntimeAdapterId, payload) {
  const ecosystem = payload.support?.ecosystem ?? buildRuntimeEcosystemSupport(runtimeId);
  const domains = payload.domains ?? [];
  const domainEvidenceRequirements = ecosystem.evidenceRequirements ?? domains.flatMap((domain) => domain.evidenceRequirements ?? []);
  const sessionActionRequirements = (payload.domainData?.sessions?.actionPolicy ?? payload.domainData?.sessions?.actionContracts ?? [])
    .flatMap((action) => {
      const status = String(action.status ?? "");
      const isBlocked = status === "blocked" || action.wouldWriteRuntime === true;
      const isLocalOverlayGap = status === "local_overlay_only" && String(action.guard ?? "").includes("official");
      if (!isBlocked && !isLocalOverlayGap) return [];
      const evidenceKind = isLocalOverlayGap ? "native_write_back_contract" : "action_contract";
      const evidenceDisposition = isLocalOverlayGap
        ? "local_overlay_until_official_runtime_write_back_contract"
        : "blocked_until_official_runtime_action_contract";
      return [{
        id: `${runtimeId}.sessions.${action.action}.${evidenceKind}`,
        blockerClass: "direct_blocker",
        approvalRequired: false,
        commandShape: isLocalOverlayGap
          ? `not_executable_until_official_runtime_${action.action}_api_exists`
          : `not_executable_until_official_runtime_${action.action}_contract_exists`,
        expectedEvidence: action.requiredEvidence ?? [
          "official_runtime_cli_or_api",
          "non_destructive_fixture",
          "round_trip_native_visibility",
        ],
        riskControls: [
          "no_silent_runtime_write",
          "no_direct_runtime_store_mutation",
          "local_overlay_only_until_contract_exists",
        ],
        evidenceDisposition,
        currentBehavior: isLocalOverlayGap
          ? "ClawJS local overlay only; writesRuntime=false"
          : "non_executable_action_plan_only",
        fallbackPolicy: isLocalOverlayGap
          ? "do_not_write_runtime_pin_state_without_official_api"
          : "do_not_synthesize_native_runtime_action",
        claimEffect: "blocks_recommended_production_native_parity",
        reentryCondition: isLocalOverlayGap
          ? "add_official_runtime_pin_write_back_contract_fixture_and_round_trip_evidence"
          : "add_official_runtime_action_contract_fixture_and_round_trip_evidence",
        productDecision: isLocalOverlayGap
          ? "native_pin_write_back_unsupported_until_official_runtime_api"
          : "native_session_action_unsupported_until_official_runtime_contract",
        supportResolution: "explicitly_product_blocked_not_a_silent_gap",
        userVisibleContract: isLocalOverlayGap
          ? "pin_state_is_clawix_local_overlay_until_runtime_write_back_exists"
          : "non_executable_action_plan_only_until_runtime_contract_exists",
        promotionGate: "session_action_claim_remains_blocked_until_official_contract_fixture_and_round_trip_evidence_exist",
      }];
    });
  const evidenceRequirements = [...domainEvidenceRequirements, ...sessionActionRequirements];
  const byBlockerClass = evidenceRequirements.reduce((acc, requirement) => {
    const blockerClass = requirement.blockerClass ?? "unknown";
    acc[blockerClass] = (acc[blockerClass] ?? 0) + 1;
    return acc;
  }, {});
  const domainAudits = domains.map((domain) => {
    const requirements = domain.domain === "sessions"
      ? [...(domain.evidenceRequirements ?? []), ...sessionActionRequirements]
      : domain.evidenceRequirements ?? [];
    const sessionActions = domain.domain === "sessions"
      ? payload.domainData?.sessions?.actionPolicy ?? payload.domainData?.sessions?.actionContracts ?? []
      : [];
    const audit = {
      domain: domain.domain,
      claim: domain.claim,
      status: domain.status,
      canonicalAuthority: domain.canonicalAuthority,
      nativeAuthority: domain.nativeAuthority,
      writeBackPolicy: domain.writeBackPolicy,
      writeBackAllowed: domain.writeBackAllowed,
      validation: domain.validation,
      externalPending: domain.externalPending,
      persistence: domain.persistence,
      relation: domain.relation,
      lossPolicy: domain.lossPolicy,
      freshness: domain.freshness,
      blockerClasses: [...new Set(requirements.map((requirement) => requirement.blockerClass).filter(Boolean))],
      evidenceDispositions: [...new Set(requirements.map((requirement) => requirement.evidenceDisposition).filter(Boolean))],
      supportResolutions: [...new Set(requirements.map((requirement) => requirement.supportResolution).filter(Boolean))],
      evidenceRequirementIds: requirements.map((requirement) => requirement.id),
    };
    return {
      ...audit,
      readProjectionStatus: runtimeDomainReadProjectionStatus(audit, sessionActions),
      implementedFacets: runtimeDomainImplementedFacets(audit, sessionActions),
      blockingFacets: runtimeDomainBlockingFacets(requirements, audit),
    };
  });
  const directBlockerDomains = domainAudits
    .filter((domain) => domain.blockerClasses.includes("direct_blocker"))
    .map((domain) => domain.domain);
  const externalPendingDomains = domainAudits
    .filter((domain) => domain.blockerClasses.includes("external_pending"))
    .map((domain) => domain.domain);
  const allDomainsAccountedFor = RUNTIME_PORTAL_DOMAIN_ORDER.every((domain) => domains.some((entry) => entry.domain === domain));
  const supportComplete = allDomainsAccountedFor
    && evidenceRequirements.length === 0
    && ecosystem.production === true
    && ecosystem.recommended === true;
  const closureState = supportComplete ? "complete" : "blocked";
  const productBlockedRequirements = evidenceRequirements.filter((requirement) => requirement.supportResolution === "explicitly_product_blocked_not_a_silent_gap");
  const externalPendingRequirements = evidenceRequirements.filter((requirement) => requirement.supportResolution === "external_pending_not_product_blocked" || requirement.blockerClass === "external_pending");
  const unresolvedNativeRequirements = evidenceRequirements.filter((requirement) => requirement.blockerClass === "direct_blocker" && requirement.supportResolution !== "explicitly_product_blocked_not_a_silent_gap");
  const finalPromotionReview = {
    status: supportComplete ? "promoted" : "unpromoted",
    finalPromotionAllowed: supportComplete,
    claimDisposition: supportComplete
      ? "all_claims_supported_by_current_evidence"
      : externalPendingRequirements.length > 0
        ? "unpromoted_external_pending"
        : productBlockedRequirements.length > 0
          ? "unpromoted_product_claim_lowered"
          : "unpromoted_unresolved_requirements",
    productBlockedByDecisionCount: productBlockedRequirements.length,
    externalPendingCount: externalPendingRequirements.length,
    unresolvedNativeRequirementCount: unresolvedNativeRequirements.length,
    productBlockedRequirementIds: productBlockedRequirements.map((requirement) => requirement.id),
    externalPendingRequirementIds: externalPendingRequirements.map((requirement) => requirement.id),
    unresolvedNativeRequirementIds: unresolvedNativeRequirements.map((requirement) => requirement.id),
    requiredForPromotion: [
      ...(externalPendingRequirements.length > 0 ? ["approved_redacted_live_evidence"] : []),
      ...(unresolvedNativeRequirements.length > 0 ? ["official_runtime_native_contracts"] : []),
      ...(productBlockedRequirements.length > 0 ? ["keep_lowered_claim_until_upstream_native_contracts_exist"] : []),
      ...(ecosystem.production !== true ? ["ecosystem_production_claim"] : []),
      ...(ecosystem.recommended !== true ? ["ecosystem_recommended_claim"] : []),
    ],
    userVisibleStatus: supportComplete
      ? "runtime_ecosystem_promoted"
      : "runtime_ecosystem_available_with_product_blocked_or_external_pending_claims",
  };
  const evidenceReentryPackets = evidenceRequirements.map((requirement) => {
    const isExternalPending = requirement.blockerClass === "external_pending"
      || requirement.supportResolution === "external_pending_not_product_blocked";
    const isProductBlocked = requirement.supportResolution === "explicitly_product_blocked_not_a_silent_gap";
    return {
      id: `${requirement.id}.reentry`,
      requirementId: requirement.id,
      blockerClass: requirement.blockerClass,
      status: isExternalPending
        ? "approval_required"
        : isProductBlocked
          ? "blocked_until_upstream_contract"
          : "blocked_until_resolution",
      approvalRequired: !!requirement.approvalRequired,
      commandShape: requirement.commandShape,
      expectedEvidence: requirement.expectedEvidence ?? [],
      riskControls: requirement.riskControls ?? [],
      reentryCondition: requirement.reentryCondition,
      claimEffect: requirement.claimEffect,
      supportResolution: requirement.supportResolution,
      productDecision: requirement.productDecision,
      userVisibleContract: requirement.userVisibleContract,
      safeDefault: isExternalPending
        ? "do_not_run_without_explicit_approval_and_redaction"
        : "keep_unpromoted_and_do_not_synthesize_runtime_state",
    };
  });
  const blockedPromotionClaims = [
    ...(supportComplete ? [] : ["recommended", "production", "native_parity"]),
    ...(productBlockedRequirements.length > 0 ? ["write_back"] : []),
  ];
  const finalSupportClaimDecision = {
    status: supportComplete ? "promoted" : "not_promoted",
    decision: supportComplete
      ? "promote_runtime_ecosystem_claims"
      : "keep_current_lowered_runtime_ecosystem_claim",
    effectiveSupportStage: ecosystem.supportStage,
    recommended: ecosystem.recommended === true && supportComplete,
    production: ecosystem.production === true && supportComplete,
    uiParityClaim: ecosystem.uiParityClaim,
    uiParityDisposition: supportComplete
      ? "ui_parity_promoted"
      : runtimeId === "openclaw" || runtimeId === "hermes"
        ? "partial_lens_validated_not_full_native_parity"
        : "ui_parity_not_claimed",
    blockedPromotionClaims,
    blockerClasses: Object.keys(byBlockerClass),
    productBlockedRequirementIds: productBlockedRequirements.map((requirement) => requirement.id),
    externalPendingRequirementIds: externalPendingRequirements.map((requirement) => requirement.id),
    unresolvedNativeRequirementIds: unresolvedNativeRequirements.map((requirement) => requirement.id),
    promotionEvidenceRequired: finalPromotionReview.requiredForPromotion,
    reentryPolicy: evidenceReentryPackets.length > 0
      ? "use_evidenceReentryPackets_exactly_before_revisiting_claim"
      : "no_reentry_packets_required_for_current_claim",
    safeDefault: supportComplete
      ? "claim_may_be_promoted"
      : "keep_unpromoted_until_evidence_or_upstream_contract_changes",
    userVisibleStatus: supportComplete
      ? "runtime_ecosystem_promoted"
      : "runtime_ecosystem_available_but_not_recommended_or_production",
  };
  const closureChecklist = RUNTIME_PORTAL_DOMAIN_ORDER.map((domain) => {
    const audit = domainAudits.find((entry) => entry.domain === domain);
    if (!audit) {
      return {
        domain,
        closureStatus: "missing_manifest_domain_projection",
        claim: "unknown",
        readProjectionStatus: "missing",
        implementedFacets: [],
        blockingFacets: ["missing_manifest_domain_projection"],
        projectionDisposition: "projection_blocked_until_direct_issue_resolved",
        blockerClasses: ["direct_blocker"],
        evidenceRequirementIds: [],
        safeDefault: "do_not_claim_runtime_domain_support",
        nextAction: "implement_manifest_domain_projection_or_mark_explicitly_product_blocked",
      };
    }
    const requirements = evidenceRequirements.filter((requirement) => String(requirement.id ?? "").startsWith(`${runtimeId}.${domain}.`));
    const hasExternal = requirements.some((requirement) => requirement.blockerClass === "external_pending"
      || requirement.supportResolution === "external_pending_not_product_blocked");
    const hasProductBlocked = requirements.some((requirement) => requirement.supportResolution === "explicitly_product_blocked_not_a_silent_gap");
    const hasUnresolved = requirements.some((requirement) => requirement.blockerClass === "direct_blocker"
      && requirement.supportResolution !== "explicitly_product_blocked_not_a_silent_gap");
    const closureStatus = hasUnresolved
      ? "direct_blocker"
      : hasExternal
        ? "external_pending"
        : hasProductBlocked
          ? "product_blocked"
          : "implemented_or_projected";
    const safeDefault = closureStatus === "implemented_or_projected"
      ? "domain_claim_may_remain_at_manifest_stage"
      : closureStatus === "external_pending"
        ? "keep_unpromoted_until_approved_redacted_evidence"
        : closureStatus === "product_blocked"
          ? "keep_lowered_claim_until_upstream_native_contract_exists"
          : "keep_blocked_until_direct_issue_resolved";
    const nextAction = closureStatus === "implemented_or_projected"
      ? "keep_manifest_claim_and_monitor_drift"
      : closureStatus === "external_pending"
        ? "use_matching_evidenceReentryPacket_after_explicit_approval"
        : closureStatus === "product_blocked"
          ? "wait_for_official_runtime_contract_then_add_fixture_and_round_trip_evidence"
          : "resolve_direct_blocker_before_claiming_support";
    const readProjectionStatus = audit.readProjectionStatus;
    return {
      domain,
      closureStatus,
      claim: audit.claim,
      status: audit.status,
      readProjectionStatus,
      implementedFacets: audit.implementedFacets,
      blockingFacets: audit.blockingFacets,
      projectionDisposition: runtimeDomainProjectionDisposition(closureStatus, readProjectionStatus),
      writeBackPolicy: audit.writeBackPolicy,
      validation: audit.validation,
      blockerClasses: audit.blockerClasses,
      evidenceRequirementIds: audit.evidenceRequirementIds,
      supportResolutions: audit.supportResolutions,
      safeDefault,
      nextAction,
    };
  });
  const closureChecklistSummary = closureChecklist.reduce((acc, item) => {
    acc[item.closureStatus] = (acc[item.closureStatus] ?? 0) + 1;
    return acc;
  }, {});
  const projectionSummary = runtimeProjectionSummary(closureChecklist);
  const evidenceReadinessSummary = runtimeEvidenceReadinessSummary({
    evidenceRequirements,
    evidenceReentryPackets,
    productBlockedRequirements,
    externalPendingRequirements,
    unresolvedNativeRequirements,
  });
  const syncPolicySummary = runtimeSyncPolicySummary(domainAudits, payload);
  return {
    runtimeId,
    runtimeName: payload.runtimeName,
    scope: "runtime_ecosystem_support_audit",
    closureState,
    supportComplete,
    allDomainsAccountedFor,
    supportStage: ecosystem.supportStage,
    recommended: ecosystem.recommended,
    production: ecosystem.production,
    uiParityClaim: ecosystem.uiParityClaim,
    summary: ecosystem.summary,
    blockingReasons: ecosystem.blockingReasons ?? [],
    blockerSummary: {
      byBlockerClass,
      directBlockerDomains,
      externalPendingDomains,
      blockedWriteBackDomains: ecosystem.blockedWriteBackDomains ?? [],
      ecosystemExternalPendingDomains: ecosystem.externalPendingDomains ?? [],
      evidenceRequirementCount: evidenceRequirements.length,
      productBlockedRequirementCount: productBlockedRequirements.length,
    },
    evidenceRequirements,
    domains: domainAudits,
    promotionGate: supportComplete
      ? "all_runtime_ecosystem_claims_are_supported_by_current_evidence"
      : "support_claim_remains_unpromoted_until_all_evidence_requirements_are_closed_or_explicitly_product_blocked",
    syncPolicySummary,
    projectionSummary,
    evidenceReadinessSummary,
    closureChecklist,
    closureChecklistSummary,
    finalPromotionReview,
    finalSupportClaimDecision,
    evidenceReentryPackets,
    provenance: {
      source: "runtime-portal-support-audit",
      runtimeId,
    },
  };
}

function sessionActionContracts(runtimeId: RuntimeAdapterId) {
  return RUNTIME_SESSION_ACTION_CONTRACTS[runtimeId] ?? [];
}

function materializeSessionActionContract(contract, session) {
  const hasSessionPath = Boolean(session.sessionPath);
  return {
    ...contract,
    status: hasSessionPath && contract.statusWhenSessionPath ? contract.statusWhenSessionPath : contract.status,
    persistence: hasSessionPath && contract.persistenceWhenSessionPath ? contract.persistenceWhenSessionPath : contract.persistence,
    delegatesTo: hasSessionPath && contract.delegatesToWhenSessionPath ? contract.delegatesToWhenSessionPath : contract.delegatesTo,
    guard: hasSessionPath && contract.guardWhenSessionPath ? contract.guardWhenSessionPath : contract.guard,
  };
}

function sessionActionPolicy(runtimeId: RuntimeAdapterId, session, supportContract) {
  void supportContract;
  return sessionActionContracts(runtimeId).map((contract) => materializeSessionActionContract(contract, session));
}

function runtimeSessionOverlayThreadId(runtimeId: RuntimeAdapterId, sessionKey: string): string {
  return `runtime:${runtimeId}:sessions:${encodeURIComponent(sessionKey)}`;
}

function localPinnedRuntimeSessionIds(runtimeId: RuntimeAdapterId): Set<string> {
  const prefix = `runtime:${runtimeId}:sessions:`;
  try {
    const store = openMainDataStore();
    try {
      const projection = readAppStateProjection(store.sqlite, { receiptLimit: 0, sidebarLimit: 1 });
      return new Set((projection.pinnedThreads ?? [])
        .map((entry) => String(entry.threadId ?? ""))
        .filter((threadId) => threadId.startsWith(prefix))
        .map((threadId) => decodeURIComponent(threadId.slice(prefix.length))));
    } finally {
      store.close();
    }
  } catch {
    return new Set();
  }
}

function localRuntimeSessionOverlayEntries(runtimeId: RuntimeAdapterId) {
  const prefix = `runtime:${runtimeId}:sessions:`;
  try {
    const store = openMainDataStore();
    try {
      const projection = readAppStateProjection(store.sqlite, { receiptLimit: 5, sidebarLimit: 1 });
      return (projection.pinnedThreads ?? [])
        .map((entry) => ({
          threadId: String(entry.threadId ?? ""),
          sortOrder: entry.sortOrder,
          pinnedAt: entry.pinnedAt,
        }))
        .filter((entry) => entry.threadId.startsWith(prefix))
        .map((entry) => ({
          id: decodeURIComponent(entry.threadId.slice(prefix.length)),
          overlayThreadId: entry.threadId,
          kind: "pin",
          pinned: true,
          authority: "clawix_local_overlay",
          writesRuntime: false,
          sortOrder: entry.sortOrder,
          pinnedAt: entry.pinnedAt,
        }));
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}

function withLocalPinOverlay(runtimeId: RuntimeAdapterId, sessions) {
  const pinned = localPinnedRuntimeSessionIds(runtimeId);
  return (sessions ?? []).map((session) => ({
    ...session,
    localOverlay: {
      pinned: pinned.has(String(session.id)),
      authority: "clawix_local_overlay",
      writesRuntime: false,
    },
    pinned: Boolean(session.nativePinned === true || pinned.has(String(session.id))),
    pinAuthority: pinned.has(String(session.id))
      ? "clawix_local_overlay"
      : session.nativePinned === true ? "runtime" : "none",
    divergence: pinned.has(String(session.id)) && session.nativePinned !== true
      ? "local_overlay_not_written_to_runtime"
      : session.nativePinned === true && !pinned.has(String(session.id))
        ? "runtime_pinned_not_local_overlay"
        : "none",
  }));
}

function runtimeSessionOverlayState(runtimeId: RuntimeAdapterId, sessions = []) {
  const sessionMap = new Map((sessions ?? []).map((session) => [String(session.id), session]));
  const overlays = localRuntimeSessionOverlayEntries(runtimeId).map((entry) => {
    const native = sessionMap.get(String(entry.id));
    return {
      ...entry,
      nativeFound: Boolean(native),
      nativePinned: native?.nativePinned ?? null,
      conflictStatus: native
        ? native.nativePinned === true ? "native_and_local" : "local_only"
        : "local_orphaned",
    };
  });
  return {
    runtimeId,
    overlayAuthority: "clawix_local_overlay",
    writesRuntime: false,
    writeBackStatus: "blocked_until_official_runtime_pin_api",
    conflictPolicy: "no_silent_overwrite",
    overlays,
    totalOverlays: overlays.length,
    totalConflicts: overlays.filter((entry) => entry.conflictStatus !== "native_and_local").length,
  };
}

function hermesTimestampToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return new Date(numeric * 1000).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function openHermesSessionDatabase(session) {
  if (session?.sessionStorageContract !== "sqlite_with_gateway_transcripts") return null;
  const databasePath = session?.sessionDatabasePath;
  if (!databasePath || !fs.existsSync(databasePath)) return null;
  let db = null;
  try {
    db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true, timeout: 50 });
    db.pragma("query_only = ON");
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all().map((row) => String(row.name)));
    if (!tables.has("sessions") || !tables.has("messages")) {
      db.close();
      return null;
    }
    return db;
  } catch {
    try {
      db?.close();
    } catch {
      // best effort only
    }
    return null;
  }
}

function listHermesSqliteSessions(runtimeId: RuntimeAdapterId, session, limit = 20) {
  const db = openHermesSessionDatabase(session);
  if (!db) return null;
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.title,
        s.source,
        s.model,
        s.started_at,
        s.ended_at,
        s.end_reason,
        s.message_count,
        s.tool_call_count,
        s.input_tokens,
        s.output_tokens,
        COALESCE((SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.session_id = s.id), s.started_at) AS last_active,
        COALESCE(
          (SELECT SUBSTR(m.content, 1, 63)
           FROM messages m
           WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
           ORDER BY m.timestamp, m.id LIMIT 1),
          ''
        ) AS preview
      FROM sessions s
      ORDER BY last_active DESC, s.started_at DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(Number(limit) || 20, 240)));
    const sessions = rows.map((row) => ({
      id: String(row.id),
      label: row.title ? String(row.title) : String(row.id),
      title: row.title ?? null,
      kind: "session",
      source: row.source ?? null,
      model: row.model ?? null,
      startedAt: hermesTimestampToIso(row.started_at),
      endedAt: hermesTimestampToIso(row.ended_at),
      updatedAt: hermesTimestampToIso(row.last_active ?? row.started_at),
      endReason: row.end_reason ?? null,
      messageCount: Number(row.message_count ?? 0),
      toolCallCount: Number(row.tool_call_count ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      preview: row.preview ? redactRuntimeSessionText(String(row.preview)) : null,
      status: "projected",
      contentIncluded: false,
      nativeIdentifier: { name: "sessionId" },
      sessionStorageContract: session.sessionStorageContract,
      provenance: {
        source: "runtime-session-sqlite",
        runtimeId,
        path: session.sessionDatabasePath,
        table: "sessions",
      },
    }));
    return withLocalPinOverlay(runtimeId, sessions);
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function listNativeSessions(runtimeId: RuntimeAdapterId, sessionOrPath, limit = 20) {
  const session = typeof sessionOrPath === "string" ? { sessionPath: sessionOrPath } : sessionOrPath;
  const sqliteSessions = runtimeId === "hermes" ? listHermesSqliteSessions(runtimeId, session, limit) : null;
  if (sqliteSessions) return sqliteSessions;
  const sessionPath = session?.sessionPath;
  if (!sessionPath || !fs.existsSync(sessionPath)) return [];
  const candidates = [];
  const maxVisited = 240;
  const allowedExtensions = new Set(["", ".json", ".jsonl", ".md", ".txt", ".log"]);

  function visit(dir: string, depth: number) {
    if (depth > 5 || candidates.length >= maxVisited) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length >= maxVisited) return;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(extension)) continue;
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      const relativePath = path.relative(sessionPath, fullPath);
      const id = relativePath.replaceAll(path.sep, "/").replace(/\.[^.]+$/, "");
      candidates.push({
        id,
        label: path.basename(entry.name, extension) || id,
        kind: "session",
        path: fullPath,
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        status: "projected",
        provenance: {
          source: "runtime-session-store",
          runtimeId,
          path: fullPath,
        },
      });
    }
  }

  visit(sessionPath, 0);
  return withLocalPinOverlay(runtimeId, candidates
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit));
}

function buildDomainData(runtimeId: RuntimeAdapterId, status, resources, workspace, session, scopeDomain = "all", runtimeOptions?) {
  const includeSessions = scopeDomain === "all" || scopeDomain === "sessions";
  const sessions = includeSessions ? listNativeSessions(runtimeId, session) : [];
  const sessionsSupportContract = buildSupportContract(runtimeId, status, "sessions");
  return {
    sessions: {
      session,
      sessions,
      totalProjected: sessions.length,
      supportContract: sessionsSupportContract,
      actionContracts: sessionActionContracts(runtimeId),
      actionPolicy: sessionActionPolicy(runtimeId, session, sessionsSupportContract),
      overlayState: runtimeSessionOverlayState(runtimeId, sessions),
    },
    skills: { skills: resources.skills ?? [], supportContract: buildSupportContract(runtimeId, status, "skills") },
    memory: { memory: resources.memory ?? [], supportContract: buildSupportContract(runtimeId, status, "memory") },
    channels: { channels: resources.channels ?? [], supportContract: buildSupportContract(runtimeId, status, "channels") },
    providers: { providers: resources.providers ?? [], supportContract: buildSupportContract(runtimeId, status, "providers") },
    auth: { auth: resources.auth ?? null, supportContract: buildSupportContract(runtimeId, status, "auth") },
    models: { models: resources.models ?? [], defaultModel: resources.defaultModel ?? null, supportContract: buildSupportContract(runtimeId, status, "models") },
    scheduler: { schedulers: resources.schedulers ?? [], supportContract: buildSupportContract(runtimeId, status, "scheduler") },
    plugins: { plugins: resources.plugins ?? [], status: resources.status ?? status.capabilityMap?.plugins ?? null, supportContract: buildSupportContract(runtimeId, status, "plugins") },
    gateway: {
      gatewayAvailable: status.gatewayAvailable,
      resources: buildGatewayOperationalResources(runtimeId, status, runtimeOptions, session),
      capability: domainCapability(status, "gateway") ?? null,
      supportContract: buildSupportContract(runtimeId, status, "gateway"),
    },
    doctorCompat: {
      runtimeVersion: status.version,
      diagnostics: status.diagnostics ?? {},
      resources: buildDoctorOperationalResources(runtimeId, status),
      capability: domainCapability(status, "doctorCompat") ?? null,
      supportContract: buildSupportContract(runtimeId, status, "doctorCompat"),
    },
    sandboxPermissions: {
      permissionMode: runtimeOptions?.permissionMode ?? "read-only",
      resources: buildSandboxOperationalResources(runtimeId, status, runtimeOptions),
      capability: domainCapability(status, "sandboxPermissions") ?? null,
      supportContract: buildSupportContract(runtimeId, status, "sandboxPermissions"),
    },
    configuration: {
      canonicalPaths: workspace.canonicalPaths,
      managedFiles: workspace.managedFiles,
      diagnostics: status.diagnostics ?? {},
      runtimeLocations: runtimeLocationDiagnostics(status),
      redactionPolicy: "redacted_paths_and_presence_only",
      capability: domainCapability(status, "configuration") ?? null,
      supportContract: buildSupportContract(runtimeId, status, "configuration"),
    },
  };
}

function sessionCreatePlan(runtimeId: RuntimeAdapterId, input, supportContract) {
  const requestedTitle = input.flags.title ?? input.flags.name ?? null;
  const requestedWorkspace = input.flags["runtime-workspace"] ?? input.workspaceRoot ?? null;
  return {
    runtimeId,
    domain: "sessions",
    action: "create",
    requested: {
      title: requestedTitle,
      workspace: requestedWorkspace,
      model: input.flags.model ?? null,
      provider: input.flags.provider ?? null,
    },
    authority: "runtime",
    writesRuntime: false,
    wouldWriteRuntime: true,
    writesLocalOverlay: false,
    writeBackStatus: "blocked_until_official_runtime_create_contract",
    conflictPolicy: "no_silent_native_object_creation",
    requiredEvidence: [
      "official_create_command_or_api",
      "non_destructive_fixture",
      "dry_run_or_confirmation_policy",
      "round_trip_visible_in_native_list",
      "support_claim_guard_update",
    ],
    acceptedContracts: runtimeId === "openclaw"
      ? ["runtime.openclaw.sessions.create", "runtime.openclaw.chat.create", "documented OpenClaw CLI/API create command"]
      : [`documented ${runtimeId} session create CLI/API contract`],
    rejectedFallbacks: [
      "do_not_create_claw_portable_session_and_label_it_native",
      "do_not_write_directly_to_runtime_store",
      "do_not_infer_create_from_transcript_file_layout",
    ],
    nextContract: {
      commandShape: `runtime ${runtimeId} sessions create --title <title> --confirm-runtime-write --json`,
      confirmationFlag: "--confirm-runtime-write",
      fixtureRequirement: "A hermetic runtime fixture must prove create, list, preview/resolve, and cleanup or isolated non-destructive state.",
    },
    supportContract,
  };
}

function blockedSessionAction(runtimeId: RuntimeAdapterId, action: string, reason: string, supportContract, extra = {}) {
  const actionContract = sessionActionContracts(runtimeId).find((contract) => contract.action === action) ?? {};
  const requiredEvidence = extra.requiredEvidence ?? actionContract.requiredEvidence ?? runtimeWriteActionEvidence(action) ?? [
    "official_runtime_cli_or_api",
    "non_destructive_fixture",
    "round_trip_native_visibility",
  ];
  const wouldWriteRuntime = extra.wouldWriteRuntime ?? ["send", "inject", "abort", "create"].includes(action);
  return {
    runtimeId,
    domain: "sessions",
    action,
    status: "blocked",
    authority: actionContract.authority ?? "runtime",
    writesRuntime: false,
    wouldWriteRuntime,
    writesLocalOverlay: false,
    reason,
    blockerClass: "direct_blocker",
    officialContractRequired: true,
    fixtureRequired: true,
    requiredEvidence,
    riskControls: [
      "no_silent_runtime_write",
      "no_direct_runtime_store_mutation",
      "local_overlay_only_until_contract_exists",
    ],
    writeBackStatus: `blocked_until_official_runtime_${action}_contract`,
    fallbackPolicy: "do_not_synthesize_native_runtime_action",
    supportResolution: "explicitly_product_blocked_not_a_silent_gap",
    productDecision: "native_session_action_unsupported_until_official_runtime_contract",
    userVisibleContract: "non_executable_action_plan_only_until_runtime_contract_exists",
    claimEffect: "blocks_recommended_production_native_parity",
    promotionGate: "session_action_claim_remains_blocked_until_official_contract_fixture_and_round_trip_evidence_exist",
    safeDefault: "keep_unpromoted_and_do_not_synthesize_runtime_state",
    commandShape: `runtime ${runtimeId} sessions ${action} --json`,
    evidenceRequirementId: `${runtimeId}.sessions.${action}.action_contract`,
    evidenceReentryStatus: "blocked_until_upstream_contract",
    actionContract,
    supportContract,
    ...extra,
  };
}

function runtimeWriteActionEvidence(action: string): string[] | null {
  if (action === "send") return ["official_send_command_or_api", "non_destructive_fixture", "confirmation_or_dry_run_policy", "round_trip_native_visibility"];
  if (action === "inject") return ["official_inject_command_or_api", "non_destructive_fixture", "confirmation_or_dry_run_policy", "round_trip_native_visibility"];
  if (action === "abort") return ["official_abort_command_or_api", "non_destructive_fixture", "confirmation_or_dry_run_policy", "round_trip_control_receipt"];
  if (action === "create") return ["official_create_command_or_api", "non_destructive_fixture", "confirmation_or_dry_run_policy", "round_trip_native_list_evidence"];
  return null;
}

function nextPinSortOrder(pinnedThreads): number {
  const maxSortOrder = Array.isArray(pinnedThreads)
    ? pinnedThreads.reduce((max, entry) => Math.max(max, Number(entry?.sortOrder ?? 0) || 0), 0)
    : 0;
  return maxSortOrder + 1000;
}

function applyRuntimeSessionPinOverlay(input, runtimeId: RuntimeAdapterId, action: "pin" | "unpin", sessionKey: string, supportContract) {
  const overlayThreadId = runtimeSessionOverlayThreadId(runtimeId, sessionKey);
  const store = openMainDataStore();
  try {
    const before = readAppStateProjection(store.sqlite, { receiptLimit: 1, sidebarLimit: 1 });
    const operation = action === "pin"
      ? { kind: "pin.upsert", threadId: overlayThreadId, sortOrder: nextPinSortOrder(before.pinnedThreads) }
      : { kind: "pin.delete", threadId: overlayThreadId };
    const request = appStateRequestFromOperations([operation], {
      requestId: input.flags["request-id"],
      hostId: input.flags["host-id"] ?? "runtime-portal",
      clientContext: {
        overlayKind: "runtime_session_pin",
        runtimeId,
        sessionKey,
        writesRuntime: false,
      },
    });
    const applied = applyAppStateTransaction(store.sqlite, request);
    const pinned = applied.projection.pinnedThreads.some((entry) => entry.threadId === overlayThreadId);
    return {
      runtimeId,
      domain: "sessions",
      action,
      status: "local_overlay_applied",
      authority: "clawix_local_overlay",
      writesRuntime: false,
      writesLocalOverlay: true,
      reason: "Runtime session pins are stored as a ClawJS app-state overlay and are not written back to the runtime without an official runtime pin API.",
      result: {
        id: sessionKey,
        overlayThreadId,
        pinned,
        nativeIdentifier: { name: runtimeId === "openclaw" ? "sessionKey" : "sessionPathId" },
        receipt: applied.receipt,
      },
      supportContract,
    };
  } finally {
    store.close();
  }
}

function normalizeOpenClawSessionSummary(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = entry.id ?? entry.sessionId ?? entry.sessionKey ?? entry.key ?? null;
  return {
    id,
    title: entry.title ?? entry.name ?? null,
    updatedAt: entry.updatedAt ?? entry.lastModifiedAt ?? null,
    status: entry.status ?? null,
    nativePinned: typeof entry.pinned === "boolean" ? entry.pinned : typeof entry.isPinned === "boolean" ? entry.isPinned : null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawSessionList(result) {
  const nativeSessions = Array.isArray(result?.sessions)
    ? result.sessions
    : Array.isArray(result)
      ? result
      : [];
  const sessions = nativeSessions
    .map((entry) => normalizeOpenClawSessionSummary(entry))
    .filter(Boolean);
  return {
    sessions: withLocalPinOverlay("openclaw", sessions),
    totalProjected: sessions.length,
    nativeIdentifier: { name: "sessionKey" },
  };
}

async function attachOpenClawSessionInventory(runtimeId: RuntimeAdapterId, claw, payload, limit = 20) {
  if (runtimeId !== "openclaw") return;
  try {
    const result = normalizeOpenClawSessionList(await claw.runtime.openclaw.sessions.list({ limit }));
    payload.domainData.sessions.sessions = result.sessions;
    payload.domainData.sessions.totalProjected = result.totalProjected;
    payload.domainData.sessions.overlayState = runtimeSessionOverlayState(runtimeId, result.sessions);
  } catch (error) {
    payload.domainData.sessions.inventoryError = error instanceof Error ? error.message : "Unable to read OpenClaw sessions.";
  }
}

function normalizeOpenClawSessionPreview(result, requestedId: string) {
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    title: result?.title ?? result?.name ?? null,
    preview: result?.preview ?? result?.summary ?? null,
    updatedAt: result?.updatedAt ?? result?.lastModifiedAt ?? null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawSessionResolve(result, requestedId: string) {
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    found: result?.found ?? null,
    title: result?.title ?? result?.name ?? null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawSessionHistory(result, requestedId: string) {
  const nativeMessages = Array.isArray(result?.messages) ? result.messages : [];
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    messages: nativeMessages.map((message) => ({
      role: message?.role ?? null,
      content: message?.content ?? null,
      createdAt: message?.createdAt ?? message?.timestamp ?? null,
    })),
    totalProjected: nativeMessages.length,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawSendResult(result, requestedId: string) {
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    accepted: result?.accepted ?? null,
    runId: result?.runId ?? null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawInjectResult(result, requestedId: string) {
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    accepted: result?.accepted ?? null,
    messageId: result?.messageId ?? result?.eventId ?? null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function normalizeOpenClawAbortResult(result, requestedId: string) {
  return {
    id: result?.id ?? result?.sessionId ?? result?.sessionKey ?? requestedId,
    accepted: result?.accepted ?? result?.aborted ?? null,
    runId: result?.runId ?? null,
    nativeIdentifier: { name: "sessionKey" },
  };
}

function nativeSessionLookupKeys(sessionPath: string | undefined, candidate) {
  const keys = new Set([String(candidate.id), String(candidate.label)]);
  if (sessionPath && candidate.path) {
    const relativePath = path.relative(sessionPath, candidate.path).replaceAll(path.sep, "/");
    keys.add(relativePath);
    keys.add(relativePath.replace(/\.[^.]+$/, ""));
  }
  return keys;
}

function findNativeSessionFromPath(runtimeId: RuntimeAdapterId, session, sessionId: string) {
  const sessions = listNativeSessions(runtimeId, session, 240);
  const candidate = sessions.find((entry) => nativeSessionLookupKeys(session.sessionPath, entry).has(sessionId));
  return { sessions, candidate };
}

function matchedNativeSessionKey(sessionPath: string | undefined, candidate, sessionId: string) {
  if (String(candidate.id) === sessionId) return candidate.nativeIdentifier?.name ?? "sessionPathId";
  if (candidate.title && String(candidate.title) === sessionId) return "sessionTitle";
  if (candidate.label && String(candidate.label) === sessionId) return candidate.title ? "sessionTitle" : "sessionLabel";
  if (sessionPath && candidate.path) {
    const relativePath = path.relative(sessionPath, candidate.path).replaceAll(path.sep, "/");
    if (relativePath === sessionId) return "sessionPath";
    if (relativePath.replace(/\.[^.]+$/, "") === sessionId) return "sessionPathId";
  }
  return "unknown";
}

function redactRuntimeSessionText(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "sk-<redacted>")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=<redacted>");
}

function readBoundedRuntimeSessionFile(filePath: string, maxBytes: number) {
  const file = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(file);
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs.readSync(file, buffer, 0, bytesToRead, 0);
    return {
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      sizeBytes: stat.size,
      truncated: stat.size > bytesRead,
      limitBytes: maxBytes,
    };
  } finally {
    fs.closeSync(file);
  }
}

function readHermesSqliteSessionMessages(session, sessionId: string, includeContent: boolean, limit: number) {
  const db = openHermesSessionDatabase(session);
  if (!db) return null;
  try {
    const messages = db.prepare(`
      SELECT id, role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp, id
      LIMIT ?
    `).all(sessionId, Math.max(1, Math.min(Number(limit) || 20, 240))).map((row, index) => {
      const rawContent = typeof row.content === "string" ? row.content : "";
      const entry = {
        id: row.id !== null && row.id !== undefined ? String(row.id) : null,
        index,
        role: row.role ?? null,
        type: "message",
        createdAt: hermesTimestampToIso(row.timestamp),
        contentIncluded: false,
        contentLength: rawContent.length,
      };
      if (!includeContent) return entry;
      const redacted = redactRuntimeSessionText(rawContent);
      return {
        ...entry,
        contentIncluded: true,
        contentPreview: redacted.slice(0, 280),
        contentTruncated: redacted.length > 280,
      };
    });
    const totalAvailable = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE session_id = ?").get(sessionId)?.count ?? messages.length;
    return {
      messages,
      totalAvailable: Number(totalAvailable),
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function previewNativeSessionFromPath(runtimeId: RuntimeAdapterId, session, sessionId: string, includeContent: boolean) {
  const { candidate } = findNativeSessionFromPath(runtimeId, session, sessionId);
  if (!candidate) {
    return {
      id: sessionId,
      found: false,
      contentIncluded: false,
      nativeIdentifier: { name: "sessionPathId" },
    };
  }
  const preview = {
    id: candidate.id,
    found: true,
    label: candidate.label,
    kind: candidate.kind,
    path: candidate.path,
    updatedAt: candidate.updatedAt,
    sizeBytes: candidate.sizeBytes,
    contentIncluded: false,
    nativeIdentifier: candidate.nativeIdentifier ?? { name: "sessionPathId" },
    provenance: candidate.provenance,
  };
  if (!includeContent) return preview;
  if (candidate.provenance?.source === "runtime-session-sqlite") {
    const sqlite = readHermesSqliteSessionMessages(session, candidate.id, true, 3);
    const contentPreview = sqlite?.messages
      ?.map((entry) => entry.contentPreview)
      .filter(Boolean)
      .join("\n") ?? "";
    return {
      ...preview,
      contentIncluded: true,
      contentPreview,
      contentTruncated: Boolean(sqlite && sqlite.totalAvailable > sqlite.messages.length),
      contentLimitMessages: 3,
      sessionStorageContract: candidate.sessionStorageContract,
    };
  }
  try {
    const maxBytes = 4096;
    const bounded = readBoundedRuntimeSessionFile(candidate.path, maxBytes);
    return {
      ...preview,
      contentIncluded: true,
      contentPreview: redactRuntimeSessionText(bounded.text),
      contentTruncated: bounded.truncated,
      contentLimitBytes: maxBytes,
    };
  } catch (error) {
    return {
      ...preview,
      contentIncluded: false,
      readError: error instanceof Error ? error.message : "Unable to read session preview.",
    };
  }
}

function resolveNativeSessionFromPath(runtimeId: RuntimeAdapterId, session, sessionId: string) {
  const { candidate } = findNativeSessionFromPath(runtimeId, session, sessionId);
  if (!candidate) {
    return {
      id: sessionId,
      found: false,
      writesRuntime: false,
      contentIncluded: false,
      nativeIdentifier: { name: "sessionPathId" },
    };
  }
  const matchedBy = matchedNativeSessionKey(session.sessionPath, candidate, sessionId);
  return {
    id: candidate.id,
    found: true,
    label: candidate.label,
    title: candidate.title ?? null,
    kind: candidate.kind,
    source: candidate.source ?? null,
    model: candidate.model ?? null,
    path: candidate.path,
    startedAt: candidate.startedAt ?? null,
    updatedAt: candidate.updatedAt,
    endedAt: candidate.endedAt ?? null,
    sizeBytes: candidate.sizeBytes,
    messageCount: candidate.messageCount ?? null,
    writesRuntime: false,
    contentIncluded: false,
    matchedBy,
    nativeIdentifier: candidate.nativeIdentifier ?? { name: "sessionPathId" },
    sessionStorageContract: candidate.sessionStorageContract,
    support: "bounded_runtime_session_store_mapping",
    provenance: candidate.provenance,
  };
}

function parseRuntimeSessionHistoryLine(rawLine: string, index: number, includeContent: boolean) {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = { type: "text", content: trimmed };
  }
  const rawContent = typeof parsed.content === "string"
    ? parsed.content
    : typeof parsed.message === "string"
      ? parsed.message
      : typeof parsed.text === "string"
        ? parsed.text
        : "";
  const entry = {
    index,
    role: parsed.role ?? parsed.author ?? null,
    type: parsed.type ?? parsed.kind ?? "event",
    createdAt: parsed.createdAt ?? parsed.timestamp ?? parsed.time ?? null,
    contentIncluded: false,
    contentLength: rawContent.length,
  };
  if (!includeContent) return entry;
  const redacted = redactRuntimeSessionText(rawContent);
  return {
    ...entry,
    contentIncluded: true,
    contentPreview: redacted.slice(0, 280),
    contentTruncated: redacted.length > 280,
  };
}

function historyNativeSessionFromPath(runtimeId: RuntimeAdapterId, session, sessionId: string, includeContent: boolean, limit: number) {
  const resolved = resolveNativeSessionFromPath(runtimeId, session, sessionId);
  if (!resolved.found) {
    return {
      id: sessionId,
      found: false,
      writesRuntime: false,
      contentIncluded: false,
      messages: [],
      totalProjected: 0,
      nativeIdentifier: { name: "sessionPathId" },
    };
  }
  if (resolved.provenance?.source === "runtime-session-sqlite") {
    const sqlite = readHermesSqliteSessionMessages(session, resolved.id, includeContent, limit);
    if (sqlite) {
      return {
        id: resolved.id,
        found: true,
        resolved,
        writesRuntime: false,
        contentIncluded: includeContent,
        contentPolicy: includeContent ? "explicit_include_content_bounded_redacted" : "metadata_default_include_content_required",
        contentLimitMessages: Math.max(1, Math.min(Number(limit) || 20, 240)),
        contentTruncated: sqlite.totalAvailable > sqlite.messages.length,
        messages: sqlite.messages,
        totalProjected: sqlite.messages.length,
        totalAvailableInStore: sqlite.totalAvailable,
        nativeIdentifier: { name: "sessionId" },
        sessionStorageContract: resolved.sessionStorageContract,
        provenance: {
          source: "runtime-session-sqlite",
          runtimeId,
          path: session.sessionDatabasePath,
          table: "messages",
        },
      };
    }
  }
  try {
    const maxBytes = 65536;
    const bounded = readBoundedRuntimeSessionFile(resolved.path, maxBytes);
    const lines = bounded.text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const messages = lines
      .slice(0, limit)
      .map((line, index) => parseRuntimeSessionHistoryLine(line, index, includeContent))
      .filter(Boolean);
    return {
      id: resolved.id,
      found: true,
      resolved,
      writesRuntime: false,
      contentIncluded: includeContent,
      contentPolicy: includeContent ? "explicit_include_content_bounded_redacted" : "metadata_default_include_content_required",
      contentLimitBytes: maxBytes,
      contentTruncated: bounded.truncated || lines.length > messages.length,
      messages,
      totalProjected: messages.length,
      totalAvailableInBoundedRead: lines.length,
      nativeIdentifier: { name: "sessionPathId" },
    };
  } catch (error) {
    return {
      id: resolved.id,
      found: true,
      resolved,
      writesRuntime: false,
      contentIncluded: false,
      messages: [],
      totalProjected: 0,
      readError: error instanceof Error ? error.message : "Unable to read session history.",
      nativeIdentifier: { name: "sessionPathId" },
    };
  }
}

function isTruthyFlag(input, name: string) {
  return input.argv?.includes(`--${name}`) || input.flags[name] === "true";
}

function writeMissingRuntimeSessionKeyError(input, runtimeId: RuntimeAdapterId, action: string) {
  writePortalUsageError(
    input,
    "missing_runtime_session_key",
    `Usage: ${input.binName} runtime ${runtimeId} sessions ${action} --session-key <id> --json`,
    { runtimeId, operation: "sessions", action },
  );
}

async function runSessionAction(input, runtimeId: RuntimeAdapterId, claw, payload, status) {
  const action = input.positionals[3] ?? input.flags.action ?? "list";
  const supportContract = payload.domainData.sessions.supportContract;
  if (action === "list") {
    if (runtimeId === "openclaw") {
      const limit = Math.max(1, Number(input.flags.limit ?? 20));
      const result = normalizeOpenClawSessionList(await claw.runtime.openclaw.sessions.list({ limit }));
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "ok",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    writePayload(input, {
      runtimeId,
      domain: "sessions",
      action,
      status: "ok",
      authority: "runtime",
      writesRuntime: false,
      result: {
        sessions: payload.domainData.sessions.sessions,
        totalProjected: payload.domainData.sessions.totalProjected,
      },
      supportContract,
    }, { runtimeId, operation: "sessions", action });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (action === "preview") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    if (runtimeId === "openclaw") {
      const result = normalizeOpenClawSessionPreview(await claw.runtime.openclaw.sessions.preview({ sessionKey }), sessionKey);
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "ok",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (payload.domainData.sessions.session?.sessionPath) {
      const result = previewNativeSessionFromPath(runtimeId, payload.domainData.sessions.session, sessionKey, isTruthyFlag(input, "include-content"));
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: result.found ? "ok" : "not_found",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return result.found ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    writePayload(input, blockedSessionAction(runtimeId, action, "Native preview is blocked until the runtime exposes a fixture-backed official preview contract or a local session path.", supportContract), { runtimeId, operation: "sessions", action });
    return CLI_EXIT_DEGRADED;
  }

  if (action === "resolve") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    if (runtimeId === "openclaw") {
      const result = normalizeOpenClawSessionResolve(await claw.runtime.openclaw.sessions.resolve({ sessionKey }), sessionKey);
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "ok",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (payload.domainData.sessions.session?.sessionPath) {
      const result = resolveNativeSessionFromPath(runtimeId, payload.domainData.sessions.session, sessionKey);
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: result.found ? "ok" : "not_found",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return result.found ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    writePayload(input, blockedSessionAction(runtimeId, action, "Native resolve is blocked until the runtime exposes a fixture-backed official resolve contract.", supportContract), { runtimeId, operation: "sessions", action });
    return CLI_EXIT_DEGRADED;
  }

  if (action === "history") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    if (runtimeId === "openclaw") {
      const limit = Math.max(1, Number(input.flags.limit ?? 20));
      const result = normalizeOpenClawSessionHistory(await claw.runtime.openclaw.chat.history({ sessionKey, limit }), sessionKey);
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "ok",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (payload.domainData.sessions.session?.sessionPath) {
      const limit = Math.max(1, Number(input.flags.limit ?? 20));
      const result = historyNativeSessionFromPath(runtimeId, payload.domainData.sessions.session, sessionKey, isTruthyFlag(input, "include-content"), limit);
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: result.found ? "ok" : "not_found",
        authority: "runtime",
        writesRuntime: false,
        result,
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return result.found ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    writePayload(input, blockedSessionAction(runtimeId, action, "Native history is blocked until the runtime exposes a fixture-backed official history contract and content policy.", supportContract), { runtimeId, operation: "sessions", action });
    return CLI_EXIT_DEGRADED;
  }

  if (action === "send" || action === "inject") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    const message = input.flags.message ?? input.positionals.slice(5).join(" ").trim();
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    if (!message) {
      writePortalUsageError(
        input,
        "missing_runtime_session_message",
        `Usage: ${input.binName} runtime ${runtimeId} sessions ${action} --session-key <id> --message <text> --json`,
        { runtimeId, operation: "sessions", action },
      );
      return CLI_EXIT_USAGE;
    }
    if (runtimeId !== "openclaw") {
      writePayload(input, blockedSessionAction(runtimeId, action, `Native ${action} is blocked until the runtime exposes a fixture-backed official ${action} contract.`, supportContract), { runtimeId, operation: "sessions", action });
      return CLI_EXIT_DEGRADED;
    }
    if (!isTruthyFlag(input, "confirm-runtime-write")) {
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "confirmation_required",
        authority: "runtime",
        writesRuntime: false,
        wouldWriteRuntime: true,
        requiredFlag: "--confirm-runtime-write",
        result: {
          id: sessionKey,
          messagePreview: message.slice(0, 160),
          nativeIdentifier: { name: "sessionKey" },
        },
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return CLI_EXIT_DEGRADED;
    }
    const result = action === "inject"
      ? normalizeOpenClawInjectResult(await claw.runtime.openclaw.chat.inject({ sessionKey, message }), sessionKey)
      : normalizeOpenClawSendResult(await claw.runtime.openclaw.chat.send({ sessionKey, message }), sessionKey);
    writePayload(input, {
      runtimeId,
      domain: "sessions",
      action,
      status: "ok",
      authority: "runtime",
      writesRuntime: true,
      result,
      supportContract,
    }, { runtimeId, operation: "sessions", action });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (action === "abort") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    if (runtimeId !== "openclaw") {
      writePayload(input, blockedSessionAction(runtimeId, action, "Native abort is blocked until the runtime exposes a fixture-backed official abort contract.", supportContract), { runtimeId, operation: "sessions", action });
      return CLI_EXIT_DEGRADED;
    }
    if (!isTruthyFlag(input, "confirm-runtime-write")) {
      writePayload(input, {
        runtimeId,
        domain: "sessions",
        action,
        status: "confirmation_required",
        authority: "runtime",
        writesRuntime: false,
        wouldWriteRuntime: true,
        requiredFlag: "--confirm-runtime-write",
        result: {
          id: sessionKey,
          nativeIdentifier: { name: "sessionKey" },
        },
        supportContract,
      }, { runtimeId, operation: "sessions", action });
      return CLI_EXIT_DEGRADED;
    }
    const result = normalizeOpenClawAbortResult(await claw.runtime.openclaw.chat.abort({ sessionKey }), sessionKey);
    writePayload(input, {
      runtimeId,
      domain: "sessions",
      action,
      status: "ok",
      authority: "runtime",
      writesRuntime: true,
      result,
      supportContract,
    }, { runtimeId, operation: "sessions", action });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (action === "create") {
    writePayload(input, blockedSessionAction(
      runtimeId,
      action,
      "Native session create is blocked until an official create contract and non-destructive fixture exist.",
      supportContract,
      {
        wouldWriteRuntime: true,
        createPlan: sessionCreatePlan(runtimeId, input, supportContract),
      },
    ), { runtimeId, operation: "sessions", action });
    return CLI_EXIT_DEGRADED;
  }

  if (action === "conflicts" || action === "overlays") {
    const sessions = runtimeId === "openclaw"
      ? normalizeOpenClawSessionList(await claw.runtime.openclaw.sessions.list({ limit: Math.max(1, Number(input.flags.limit ?? 20)) })).sessions
      : payload.domainData.sessions.sessions;
    writePayload(input, {
      runtimeId,
      domain: "sessions",
      action,
      status: "ok",
      authority: "clawix_local_overlay",
      writesRuntime: false,
      result: runtimeSessionOverlayState(runtimeId, sessions),
      supportContract,
    }, { runtimeId, operation: "sessions", action });
    return CLI_EXIT_OK;
  }

  if (action === "pin" || action === "unpin") {
    const sessionKey = input.flags["session-key"] ?? input.flags.id ?? input.positionals[4];
    if (!sessionKey) {
      writeMissingRuntimeSessionKeyError(input, runtimeId, action);
      return CLI_EXIT_USAGE;
    }
    writePayload(input, applyRuntimeSessionPinOverlay(input, runtimeId, action, sessionKey, supportContract), { runtimeId, operation: "sessions", action });
    return CLI_EXIT_OK;
  }

  writePortalUsageError(input, "unknown_runtime_session_action", `Unknown runtime session action: ${action}`, { runtimeId, operation: "sessions", action });
  return CLI_EXIT_USAGE;
}

function domainCount(domain: string, data) {
  if (domain === "sessions") return data.sessions?.sessions?.length ?? 0;
  if (domain === "skills") return data.skills?.skills?.length;
  if (domain === "memory") return data.memory?.memory?.length;
  if (domain === "channels") return data.channels?.channels?.length;
  if (domain === "providers") return data.providers?.providers?.length;
  if (domain === "auth") return data.auth?.auth ? Object.keys(data.auth.auth).length : 0;
  if (domain === "models") return data.models?.models?.length;
  if (domain === "scheduler") return data.scheduler?.schedulers?.length;
  if (domain === "plugins") return data.plugins?.plugins?.length;
  if (domain === "gateway") return data.gateway?.resources?.length ?? (data.gateway ? 1 : 0);
  if (domain === "doctorCompat") return data.doctorCompat?.resources?.length ?? (data.doctorCompat ? 1 : 0);
  if (domain === "sandboxPermissions") return data.sandboxPermissions?.resources?.length ?? (data.sandboxPermissions ? 1 : 0);
  if (domain === "configuration") {
    const managedFiles = data.configuration?.managedFiles?.length ?? 0;
    const canonicalPaths = data.configuration?.canonicalPaths ? Object.keys(data.configuration.canonicalPaths).length : 0;
    return Math.max(managedFiles, canonicalPaths);
  }
  return undefined;
}

function domainRows(runtimeId: RuntimeAdapterId, status, domainData) {
  return RUNTIME_PORTAL_DOMAIN_ORDER.map((domain) => {
    const capability = domainCapability(status, domain);
    const supportContract = buildSupportContract(runtimeId, status, domain);
    return {
      domain,
      supported: capability?.supported ?? (domain === "workspace" || domain === "sessions" ? true : undefined),
      status: capability?.status ?? (domain === "workspace" ? "ready" : undefined),
      strategy: capability?.strategy ?? (domain === "workspace" ? "native" : undefined),
      count: domainCount(domain, domainData),
      authority: domainAuthority(domain),
      claim: supportContract.claim,
      canonicalAuthority: supportContract.canonicalAuthority,
      nativeAuthority: supportContract.nativeAuthority,
      persistence: supportContract.persistence,
      relation: supportContract.relation,
      lossPolicy: supportContract.lossPolicy,
      writeBackPolicy: supportContract.writeBackPolicy,
      writeBackAllowed: supportContract.writeBackAllowed,
      validation: supportContract.validation,
      externalPending: supportContract.externalPending,
      evidenceRequirements: supportContract.evidenceRequirements,
      freshness: supportContract.freshness,
      officialCommands: supportContract.officialCommands,
      provenance: supportContract.provenance,
      limitations: capability?.limitations ?? [],
    };
  });
}

function pickDomain(payload, domain: string) {
  switch (domain) {
    case "summary":
      return payload;
    case "runtime":
      return payload.status;
    case "workspace":
      return payload.workspace;
    case "sessions":
    case "skills":
    case "memory":
    case "channels":
    case "providers":
    case "auth":
    case "models":
    case "scheduler":
    case "plugins":
    case "gateway":
    case "doctorCompat":
    case "sandboxPermissions":
    case "configuration":
      return payload.domainData[domain];
    default:
      return null;
  }
}

export async function runRuntimePortalCli(input): Promise<number | null> {
  if (input.group !== "runtime") return null;

  if (input.command === "adapters") {
    const adapters = listRuntimeAdapters().map((adapter) => ({
      id: adapter.id,
      runtimeName: adapter.runtimeName,
      stability: adapter.stability,
      supportLevel: adapter.supportLevel,
      targetedForFullIntegration: RUNTIME_PORTAL_IDS.has(adapter.id),
    }));
    writePayload(input, { adapters });
    return CLI_EXIT_OK;
  }

  if (!input.command || !RUNTIME_ADAPTER_IDS.has(input.command)) return null;
  if (!RUNTIME_PORTAL_IDS.has(input.command)) return null;

  const runtimeId = input.command as RuntimeAdapterId;
  const operation = input.subcommand ?? "summary";
  const domain = normalizeDomain(input.positionals[3] ?? input.flags.domain);
  const adapter = getRuntimeAdapter(runtimeId);

  if (operation === "help" || operation === "--help") {
    input.context.stdout.write(`${runtimePortalUsage(input.binName)}\n`);
    return CLI_EXIT_OK;
  }

  if (operation === "resources") {
    const rawResourceDomain = input.positionals[3] ?? input.flags.domain;
    const selectedResourceDomain = normalizeDomain(rawResourceDomain);
    if (!rawResourceDomain || !isRuntimePortalDomain(selectedResourceDomain)) {
      writePortalUsageError(
        input,
        rawResourceDomain ? "unknown_runtime_resource_domain" : "missing_runtime_resource_domain",
        rawResourceDomain
          ? `Unknown runtime resource domain: ${rawResourceDomain}.`
          : `Usage: ${input.binName} runtime ${runtimeId} resources <domain> --json`,
        { runtimeId, operation, ...(rawResourceDomain ? { domain: rawResourceDomain } : {}) },
      );
      return CLI_EXIT_USAGE;
    }
  }

  if (operation === "domain") {
    const rawDomain = input.positionals[3] ?? input.flags.domain;
    const selectedDomain = normalizeDomain(rawDomain);
    if (!rawDomain || !isRuntimePortalDomain(selectedDomain)) {
      writePortalUsageError(
        input,
        rawDomain ? "unknown_runtime_domain" : "missing_runtime_domain",
        rawDomain
          ? `Unknown runtime domain: ${rawDomain}.`
          : `Usage: ${input.binName} runtime ${runtimeId} domain <domain> --json`,
        { runtimeId, operation, ...(rawDomain ? { domain: rawDomain } : {}) },
      );
      return CLI_EXIT_USAGE;
    }
  }

  const scopedFlags = { ...input.flags, runtime: runtimeId };
  const claw = await input.createCliClaw(runtimeId, scopedFlags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId);

  if (operation === "commands") {
    writePayload(input, buildCommandMatrix(adapter, runtimeId), { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  if (operation === "session") {
    writePayload(input, {
      runtimeId,
      session: getRuntimeSessionDescriptor(adapter, runtimeOptionsFromInput(input, runtimeId)),
    }, { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  if (operation === "workspace") {
    writePayload(input, {
      runtimeId,
      workspace: {
        managedFiles: await claw.workspace.listManagedFiles(),
        canonicalPaths: claw.workspace.canonicalPaths(),
        inspect: await claw.workspace.inspect(),
      },
    }, { runtimeId, operation });
    return CLI_EXIT_OK;
  }

  const runtimeOptions = runtimeOptionsFromInput(input, runtimeId);
  const status = await claw.runtime.status();
  const session = getRuntimeSessionDescriptor(adapter, runtimeOptions);
  const workspace = {
    managedFiles: await claw.workspace.listManagedFiles(),
    canonicalPaths: claw.workspace.canonicalPaths(),
  };

  if (operation === "status") {
    writePayload(input, { runtimeId, status }, { runtimeId, operation });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  const requestedResourceDomain = operation === "resources"
    ? normalizeDomain(input.positionals[3] ?? input.flags.domain)
    : operation === "domain"
      ? domain
      : operation === "sessions"
        ? "sessions"
        : "all";
  const resources = await readResources(claw, requestedResourceDomain, status, adapter, runtimeOptions);
  const payload = {
    runtimeId,
    runtimeName: adapter.runtimeName,
    support: buildPortalSupport(adapter, runtimeId),
    status,
    session,
    workspace,
    resources,
    domainData: buildDomainData(runtimeId, status, resources, workspace, session, requestedResourceDomain, runtimeOptions),
    commands: buildCommandMatrix(adapter, runtimeId),
    domains: [],
  };
  if (requestedResourceDomain === "all" || requestedResourceDomain === "sessions") {
    await attachOpenClawSessionInventory(runtimeId, claw, payload, Math.max(1, Number(input.flags.limit ?? 20)));
  }
  payload.domains = domainRows(runtimeId, status, payload.domainData);
  payload.supportAudit = buildSupportAudit(runtimeId, payload);

  if (operation === "summary" || operation === "domains") {
    writePayload(input, payload, { runtimeId, operation });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (operation === "support") {
    writePayload(input, payload.supportAudit, { runtimeId, operation });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (operation === "domain" || operation === "resources") {
    const selectedDomain = operation === "resources" ? requestedResourceDomain : domain;
    const selected = pickDomain(payload, selectedDomain);
    if (selected === null) {
      writePortalUsageError(input, "unknown_runtime_domain", `Unknown runtime domain: ${selectedDomain}`, { runtimeId, operation, domain: selectedDomain });
      return CLI_EXIT_USAGE;
    }
    writePayload(input, {
      runtimeId,
      domain: selectedDomain,
      data: selected,
    }, { runtimeId, operation, domain: selectedDomain });
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (operation === "sessions") {
    return await runSessionAction(input, runtimeId, claw, payload, status);
  }

  writePortalUsageError(input, "unknown_runtime_portal_operation", runtimePortalUsage(input.binName), { runtimeId, operation });
  return CLI_EXIT_USAGE;
}
