#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const selfTest = process.argv.includes("--self-test");
const manifestPath = path.join(rootDir, "docs/runtime-ecosystem-integration.manifest.json");
const standardPath = path.join(rootDir, "docs/runtime-ecosystem-integration-standard.md");
const adrPath = path.join(rootDir, "docs/adr/0047-runtime-ecosystem-integration-standard.md");
const supportMatrixPath = path.join(rootDir, "docs/support-matrix.md");
const decisionMapPath = path.join(rootDir, "docs/decision-map.md");
const discoverabilityPath = path.join(rootDir, "docs/discoverability.registry.json");
const adrCoveragePath = path.join(rootDir, "docs/adr-operational-coverage.manifest.json");
const runtimePortalPath = path.join(rootDir, "packages/clawjs/src/cli-runtime-portal-command.ts");
const commandIntentsPath = path.join(rootDir, "packages/clawjs-core/src/cli-command-intents.ts");
const runtimeAdapterRegistryPath = path.join(rootDir, "packages/clawjs-node/src/runtime/adapters/registry.ts");

const requiredRuntimeIds = ["openclaw", "codex", "hermes"];
const requiredDomains = [
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
const allowedClaims = new Set([
  "inventoried",
  "projected",
  "operable",
  "write_back",
  "preserved",
  "native_parity",
  "recommended",
  "production",
]);
const stableStages = new Set(["recommended", "production", "native_parity"]);
const requiredSessionActions = ["list", "preview", "resolve", "history", "send", "inject", "abort", "create", "pin", "unpin", "conflicts"];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractConstStringArray(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractJsonParseConst(source, constName) {
  const match = source.match(new RegExp("const\\s+" + constName + "\\s*=\\s*JSON\\.parse\\(\\x60([\\s\\S]*?)\\x60\\);"));
  if (!match) return null;
  return JSON.parse(match[1]);
}

function hasAllDomains(rows, label, errors) {
  const domains = new Set((rows ?? []).map((row) => row.domain));
  for (const domain of requiredDomains) {
    if (!domains.has(domain)) errors.push(`${label} missing domain ${domain}`);
  }
}

function runtimeDiagnostic(error) {
  const message = String(error);
  const location = message.match(/^missing required file (.+)$/u)?.[1]
    ?? message.match(/^([^ ]+)/u)?.[1]
    ?? "docs/runtime-ecosystem-integration.manifest.json";
  if (message.startsWith("missing required file ")) {
    return createDiagnostic("runtime_ecosystem_required_file_missing", message, {
      location,
      suggestion: "Restore the required runtime ecosystem manifest, doc, ADR, registry, or command source.",
      safeNextStep: "Restore the named file, then rerun node scripts/verify-runtime-ecosystem-integration.mjs.",
    });
  }
  if (/read|parse|not valid JSON|Unexpected token|ENOENT/iu.test(message)) {
    return createDiagnostic("runtime_ecosystem_input_read_failed", message, {
      location,
      suggestion: "Repair the named JSON, manifest, or source file so the verifier can read it.",
      safeNextStep: "Fix the readable input file, then rerun node scripts/verify-runtime-ecosystem-integration.mjs.",
    });
  }
  return createDiagnostic("runtime_ecosystem_contract_mismatch", message, {
    location,
    suggestion: "Align the named runtime ecosystem artifact with the required manifest, support matrix, or command-intent contract.",
    safeNextStep: "Fix the named runtime ecosystem artifact, then rerun node scripts/verify-runtime-ecosystem-integration.mjs.",
  });
}

function printRuntimeFailures(errors, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "Runtime ecosystem integration check failed:",
    diagnostics: errors.map(runtimeDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  const chunks = [];
  printRuntimeFailures([
    "missing required file /Users/example/private/runtime.json",
    "manifest schemaVersion must be 1 token: sk-test-secret-123456",
  ], {
    title: "Runtime ecosystem integration check failed for /Users/example/private:",
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assertSelfTest(output.includes("code: runtime_ecosystem_required_file_missing"), "self-test missing missing-file code");
  assertSelfTest(output.includes("code: runtime_ecosystem_contract_mismatch"), "self-test missing contract-mismatch code");
  assertSelfTest(output.includes("suggestion:"), "self-test missing suggestion");
  assertSelfTest(output.includes("next:"), "self-test missing next step");
  assertSelfTest(!output.includes("/Users/example"), "self-test leaked private path");
  assertSelfTest(!output.includes("sk-test-secret-123456"), "self-test leaked token-like text");
  console.log("runtime ecosystem integration check self-test passed");
}

function claimRank(claim) {
  return [...allowedClaims].indexOf(claim);
}

function promotedClaimBlocked(runtime) {
  const matrix = runtime.tripleMatrix ?? {};
  const nativeRows = matrix.nativeSurface ?? [];
  const linkRows = matrix.linkMatrix ?? [];
  return nativeRows.some((row) => claimRank(row.claim) < claimRank("native_parity"))
    || linkRows.some((row) => String(row.validation ?? "").includes("external_pending"))
    || linkRows.some((row) => String(row.writeBackPolicy ?? "").startsWith("blocked"));
}

function main() {
  const errors = [];
  for (const file of [manifestPath, standardPath, adrPath, supportMatrixPath, decisionMapPath, discoverabilityPath, adrCoveragePath, runtimePortalPath, commandIntentsPath, runtimeAdapterRegistryPath]) {
    if (!fs.existsSync(file)) errors.push(`missing required file ${path.relative(rootDir, file)}`);
  }
  if (errors.length > 0) {
    printRuntimeFailures(errors);
    process.exit(1);
  }

  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.sourceSnapshotDate ?? "")) {
    errors.push("manifest sourceSnapshotDate must be YYYY-MM-DD");
  }

  const manifestDomains = new Set(manifest.requiredDomains ?? []);
  for (const domain of requiredDomains) {
    if (!manifestDomains.has(domain)) errors.push(`manifest requiredDomains missing ${domain}`);
  }
  if (JSON.stringify(manifest.requiredDomains ?? []) !== JSON.stringify(requiredDomains)) {
    errors.push("manifest requiredDomains must exactly match the runtime ecosystem guard order");
  }
  for (const claim of manifest.claimLadder ?? []) {
    if (!allowedClaims.has(claim)) errors.push(`unknown claim ladder value ${claim}`);
  }

  const runtimePortal = fs.readFileSync(runtimePortalPath, "utf8");
  const portalDomains = extractConstStringArray(runtimePortal, "RUNTIME_PORTAL_DOMAIN_ORDER");
  if (!portalDomains) {
    errors.push("runtime portal missing RUNTIME_PORTAL_DOMAIN_ORDER");
  } else if (JSON.stringify(portalDomains) !== JSON.stringify(manifest.requiredDomains ?? [])) {
    errors.push("runtime portal domain order must exactly match manifest requiredDomains");
  }
  const portalPolicies = extractJsonParseConst(runtimePortal, "RUNTIME_PORTAL_DOMAIN_POLICIES");
  if (!portalPolicies) {
    errors.push("runtime portal missing RUNTIME_PORTAL_DOMAIN_POLICIES");
  }
  if (!runtimePortal.includes("function evidenceRequirementsFor")) {
    errors.push("runtime portal must expose structured evidence requirements for blocked/external-pending support claims");
  }
  for (const snippet of ["blockerClass", "external_pending", "direct_blocker", "redacted_json_receipt", "official_runtime_cli_or_api", "evidenceDisposition", "currentBehavior", "fallbackPolicy", "claimEffect", "reentryCondition", "productDecision", "supportResolution", "userVisibleContract", "explicitly_product_blocked_not_a_silent_gap"]) {
    if (!runtimePortal.includes(snippet)) errors.push(`runtime portal evidence requirement contract missing ${snippet}`);
  }
  for (const snippet of ["function buildSupportAudit", "payload.supportAudit = buildSupportAudit(runtimeId, payload)", "runtime_ecosystem_support_audit", "RUNTIME_ECOSYSTEM_OFFICIAL_SNAPSHOTS", "function runtimeOfficialSnapshot", "officialSnapshot: runtimeOfficialSnapshot(runtimeId)", "officialSnapshot: ecosystem.officialSnapshot", "sourceSnapshotDate", "manifestSource: \"docs/runtime-ecosystem-integration.manifest.json\"", "support_claim_remains_unpromoted_until_all_evidence_requirements_are_closed_or_explicitly_product_blocked", "finalPromotionReview", "runtimeClaimDisposition", "unpromoted_product_blocked_and_external_pending", "keep_lowered_claim_until_upstream_native_contracts_exist", "keep_lowered_claim_until_upstream_native_contract_exists", "keep_unpromoted_until_approval_gate_fixture_and_redacted_receipt_exists", "attach_approval_gate_fixture_and_redacted_receipt_before_claim_promotion", "keep_unpromoted_until_tui_gateway_fixture_transport_and_native_pin_contracts_exist", "attach_tui_gateway_wrapper_fixture_production_transport_policy_and_round_trip_evidence", "tui_gateway_wrapper_fixture_and_round_trip_evidence", "production_transport_lifecycle_policy_and_native_round_trip_evidence", "keep_read_projection_only_until_official_runtime_write_back_contract_exists", "add_official_runtime_write_back_contract_fixture_and_round_trip_evidence", "official_runtime_write_back_contract_fixture", "blocked_until_official_runtime_write_back_contract_fixture_and_round_trip_evidence", "evidenceReentryPackets", "do_not_run_without_explicit_approval_and_redaction", "do_not_run_without_approval_gate_fixture", "blocked_until_approval_gate_fixture", "approvalGateBlockedCount", "approvalGateRequirementIds", "approvalGateFixtureStatus", "approvalGateFixtureReceipt", "approval_gate_fixture_receipt", "approval-gate-fixture", "tuiGatewayBlockedCount", "tuiGatewayRequirementIds", "productionTransportBlockedCount", "productionTransportRequirementIds", "writeBackContractBlockedCount", "writeBackContractRequirementIds", "approval_gate_fixture_and_redacted_receipt", "keep_unpromoted_and_do_not_synthesize_runtime_state", "finalSupportClaimDecision", "claimDisposition", "productBlockedByDecisionCount", "externalPendingCount", "unresolvedNativeRequirementCount", "external_live_evidence", "approval_gate_fixture", "tui_gateway_wrapper_fixture", "production_transport_lifecycle", "upstream_native_contracts", "keep_current_lowered_runtime_ecosystem_claim", "use_evidenceReentryPackets_exactly_before_revisiting_claim", "closureChecklist", "closureChecklistSummary", "missing_manifest_domain_projection", "readProjectionStatus", "readProjectionStatus: runtimeDomainReadProjectionStatus", "runtimeCapabilityStatus", "runtimeCapabilityStrategy", "implementedFacets", "blockingFacets", "projectionDisposition", "read_projection_available_write_back_blocked", "projectionSummary", "byReadProjectionStatus", "productBlockedButProjectedDomainCount", "evidenceReadinessSummary", "approvalRequiredCount", "upstreamContractBlockedCount", "use_evidence_reentry_packets_before_claim_promotion", "syncPolicySummary", "defaultSyncMode", "read_projection_first_no_silent_write_back", "localOverlayDomains", "project_runtime_state_do_not_sync_or_write_back_without_official_contract", "native_write_back_pending", "approval_gate_fixture_pending", "tui_gateway_round_trip_evidence_pending", "production_transport_policy_pending", "live_auth_evidence_pending", "live_model_evidence_pending", "approved live channel/provider/auth/model evidence"]) {
    if (!runtimePortal.includes(snippet)) errors.push(`runtime portal support audit contract missing ${snippet}`);
  }
  for (const snippet of ["sessionActionRequirements", "native_write_back_contract", "session_action_claim_remains_blocked_until_official_contract_fixture_and_round_trip_evidence_exist"]) {
    if (!runtimePortal.includes(snippet)) errors.push(`runtime portal support audit must include session action blockers: ${snippet}`);
  }
  const portalSessionActionContracts = extractJsonParseConst(runtimePortal, "RUNTIME_SESSION_ACTION_CONTRACTS");
  if (!portalSessionActionContracts) {
    errors.push("runtime portal missing RUNTIME_SESSION_ACTION_CONTRACTS");
  }
  if (!manifest.sessionActionContracts) {
    errors.push("manifest missing sessionActionContracts");
  }

  const commandIntents = fs.readFileSync(commandIntentsPath, "utf8");
  for (const [id, mappedCommand] of [
    ["cmd_intent_runtime_portal", "runtime <runtime-id>"],
    ["cmd_intent_runtime_summary", "runtime <runtime-id> summary"],
    ["cmd_intent_runtime_status", "runtime <runtime-id> status"],
    ["cmd_intent_runtime_commands", "runtime <runtime-id> commands"],
    ["cmd_intent_runtime_session", "runtime <runtime-id> session"],
    ["cmd_intent_runtime_workspace", "runtime <runtime-id> workspace"],
    ["cmd_intent_runtime_domains", "runtime <runtime-id> domains"],
    ["cmd_intent_runtime_support", "runtime <runtime-id> support"],
    ["cmd_intent_runtime_resources", "runtime <runtime-id> resources <domain>"],
    ["cmd_intent_runtime_domain", "runtime <runtime-id> domain <domain>"],
    ["cmd_intent_runtime_sessions_list", "runtime <runtime-id> sessions list"],
    ["cmd_intent_runtime_sessions_preview", "runtime <runtime-id> sessions preview"],
    ["cmd_intent_runtime_sessions_resolve", "runtime <runtime-id> sessions resolve"],
    ["cmd_intent_runtime_sessions_history", "runtime <runtime-id> sessions history"],
    ["cmd_intent_runtime_sessions_send", "runtime <runtime-id> sessions send"],
    ["cmd_intent_runtime_sessions_inject", "runtime <runtime-id> sessions inject"],
    ["cmd_intent_runtime_sessions_abort", "runtime <runtime-id> sessions abort"],
    ["cmd_intent_runtime_sessions_create", "runtime <runtime-id> sessions create"],
    ["cmd_intent_runtime_sessions_pin", "runtime <runtime-id> sessions pin"],
    ["cmd_intent_runtime_sessions_unpin", "runtime <runtime-id> sessions unpin"],
    ["cmd_intent_runtime_sessions_conflicts", "runtime <runtime-id> sessions conflicts"],
  ]) {
    if (!commandIntents.includes(id)) errors.push(`command-intent registry missing ${id}`);
    if (!commandIntents.includes(`mappedCommand: "${mappedCommand}"`)) errors.push(`command-intent registry missing mapped command ${mappedCommand}`);
  }

  const runtimeAdapterRegistry = fs.readFileSync(runtimeAdapterRegistryPath, "utf8");
  for (const snippet of [
    "import { hermesAdapter }",
    "[hermesAdapter.id, hermesAdapter]",
    "export function listRuntimeAdapters",
    "export function getRuntimeAdapter",
  ]) {
    if (!runtimeAdapterRegistry.includes(snippet)) errors.push(`runtime adapter registry missing Hermes first-class registry contract: ${snippet}`);
  }

  const runtimes = new Map((manifest.runtimes ?? []).map((runtime) => [runtime.id, runtime]));
  for (const runtimeId of requiredRuntimeIds) {
    if (!runtimes.has(runtimeId)) errors.push(`manifest missing required runtime ${runtimeId}`);
  }

  for (const [runtimeId, runtime] of runtimes) {
    const snapshot = runtime.officialSnapshot ?? {};
    if (!Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
      errors.push(`${runtimeId} officialSnapshot.sources must be non-empty`);
    }
    if (!snapshot.capturedAt || !snapshot.driftPolicy) {
      errors.push(`${runtimeId} officialSnapshot must include capturedAt and driftPolicy`);
    }
    if (!runtime.portal?.shape?.startsWith(`claw runtime ${runtimeId}`)) {
      errors.push(`${runtimeId} portal shape must start with claw runtime ${runtimeId}`);
    }
    if (stableStages.has(runtime.supportStage) || runtime.recommended || runtime.production) {
      if (!snapshot.sourceType || !snapshot.sources?.length) {
        errors.push(`${runtimeId} promoted support needs an official snapshot`);
      }
      if (!runtime.uiParityClaim || runtime.uiParityClaim === "visual_clone") {
        errors.push(`${runtimeId} promoted support needs semantic UI parity, not visual clone`);
      }
      if (promotedClaimBlocked(runtime)) {
        errors.push(`${runtimeId} cannot claim recommended/production/native-parity while any domain is below native parity, external pending, or blocked for write-back`);
      }
    }
    if ((runtime.id === "codex" || runtime.id === "hermes") && (runtime.recommended || runtime.production)) {
      errors.push(`${runtime.id} must remain dev-only until explicit evidence promotes it`);
    }

    const matrix = runtime.tripleMatrix ?? {};
    hasAllDomains(matrix.nativeSurface, `${runtimeId}.nativeSurface`, errors);
    hasAllDomains(matrix.clawDomainSurface, `${runtimeId}.clawDomainSurface`, errors);
    hasAllDomains(matrix.linkMatrix, `${runtimeId}.linkMatrix`, errors);

    for (const row of matrix.nativeSurface ?? []) {
      if (!allowedClaims.has(row.claim)) errors.push(`${runtimeId}.${row.domain} has invalid claim ${row.claim}`);
      if (!row.authority) errors.push(`${runtimeId}.${row.domain} nativeSurface is missing authority`);
    }
    for (const row of matrix.linkMatrix ?? []) {
      for (const field of ["relation", "lossPolicy", "writeBackPolicy", "validation"]) {
        if (!row[field]) errors.push(`${runtimeId}.${row.domain} linkMatrix missing ${field}`);
      }
    }
    const runtimePolicy = portalPolicies?.[runtimeId] ?? {};
    const nativeRowsByDomain = new Map((matrix.nativeSurface ?? []).map((row) => [row.domain, row]));
    const clawRowsByDomain = new Map((matrix.clawDomainSurface ?? []).map((row) => [row.domain, row]));
    const linkRowsByDomain = new Map((matrix.linkMatrix ?? []).map((row) => [row.domain, row]));
    for (const domain of requiredDomains) {
      if (!runtimePolicy[domain]) errors.push(`runtime portal policy table missing ${runtimeId}.${domain}`);
      const nativeRow = nativeRowsByDomain.get(domain);
      const clawRow = clawRowsByDomain.get(domain);
      const linkRow = linkRowsByDomain.get(domain);
      const expectedPortalPolicy = {
        claim: nativeRow?.claim,
        nativeAuthority: nativeRow?.authority,
        canonicalAuthority: clawRow?.canonicalAuthority,
        persistence: clawRow?.persistence,
        relation: linkRow?.relation,
        lossPolicy: linkRow?.lossPolicy,
        writeBackPolicy: linkRow?.writeBackPolicy,
        validation: linkRow?.validation,
      };
      for (const [field, expectedValue] of Object.entries(expectedPortalPolicy)) {
        if (runtimePolicy[domain] && runtimePolicy[domain][field] !== expectedValue) {
          errors.push(`runtime portal policy ${field} must match manifest for ${runtimeId}.${domain}`);
        }
      }
      const manifestCommands = JSON.stringify(nativeRow?.officialCommands ?? []);
      const portalCommands = JSON.stringify(runtimePolicy[domain]?.officialCommands ?? []);
      if (runtimePolicy[domain] && manifestCommands !== portalCommands) {
        errors.push(`runtime portal policy officialCommands must match manifest for ${runtimeId}.${domain}`);
      }
    }
    if (runtimeId === "openclaw") {
      const openclawSessionCommands = (matrix.nativeSurface ?? []).find((row) => row.domain === "sessions")?.officialCommands ?? [];
      for (const command of ["openclaw sessions", "openclaw sessions --json", "openclaw sessions cleanup --dry-run", "openclaw sessions cleanup --json"]) {
        if (!openclawSessionCommands.includes(command)) errors.push(`OpenClaw sessions official command inventory missing current docs command: ${command}`);
      }
      for (const staleCommand of ["openclaw sessions show", "openclaw sessions export"]) {
        if (openclawSessionCommands.includes(staleCommand)) errors.push(`OpenClaw sessions official command inventory still includes stale command: ${staleCommand}`);
      }
    }
    if (runtimeId === "hermes") {
      const hermesSurface = new Map((matrix.nativeSurface ?? []).map((row) => [row.domain, row.officialCommands ?? []]));
      if (!snapshot.sources?.includes("https://hermes-agent.nousresearch.com/docs/user-guide/sessions")) {
        errors.push("Hermes official snapshot must cite the Sessions guide before claiming session command inventory");
      }
      if (!snapshot.sources?.includes("https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md")) {
        errors.push("Hermes official snapshot must cite the Session Storage guide before claiming SQLite state.db session-store inventory");
      }
      if (!snapshot.sources?.includes("https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration")) {
        errors.push("Hermes official snapshot must cite Programmatic Integration before claiming TUI gateway session write/control contracts");
      }
      if (runtimePortal.includes("runtime-session-sqlite")) {
        for (const snippet of ["query_only = ON", "sqlite_with_gateway_transcripts", "sessionDatabasePath", "sessions", "messages"]) {
          if (!runtimePortal.includes(snippet)) errors.push(`Hermes SQLite session projection guard missing ${snippet}`);
        }
        if (!snapshot.sources?.includes("https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md")) {
          errors.push("Hermes SQLite session projection requires the official Session Storage source");
        }
      }
      const hermesTuiMethods = new Map([
        ["send", "prompt.submit"],
        ["inject", "session.steer"],
        ["abort", "session.interrupt"],
        ["create", "session.create"],
      ]);
      for (const [actionName, method] of hermesTuiMethods) {
        const action = manifest.sessionActionContracts?.hermes?.find((entry) => entry.action === actionName);
        if (action?.officialProtocol !== "tui_gateway_json_rpc") {
          errors.push(`Hermes ${actionName} session action must declare TUI gateway JSON-RPC as the official protocol`);
        }
        if (action?.officialMethod !== method) {
          errors.push(`Hermes ${actionName} session action must map to official TUI gateway method ${method}`);
        }
        if (action?.officialContractSource !== "https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration") {
          errors.push(`Hermes ${actionName} session action must cite the Programmatic Integration source`);
        }
        if (!String(action?.guard ?? "").includes("tui_gateway_wrapper_fixture")) {
          errors.push(`Hermes ${actionName} session action must block on the TUI gateway wrapper fixture, not a missing official contract`);
        }
      }
      const requiredHermesCommands = {
        sessions: ["hermes chat", "hermes -z <prompt>", "hermes sessions browse", "hermes sessions export <output> [--session-id ID]", "hermes sessions delete <session-id>", "hermes sessions prune", "hermes sessions stats"],
        skills: ["hermes skills browse", "hermes skills inspect", "hermes bundles list", "hermes curator run --dry-run"],
        memory: ["hermes memory setup", "hermes memory status", "hermes memory off"],
        channels: ["hermes gateway run", "hermes pairing list", "hermes webhook subscribe", "hermes portal status"],
        providers: ["hermes fallback list", "hermes portal status"],
        auth: ["hermes auth", "hermes auth list", "hermes auth status <provider>", "hermes auth logout <provider>"],
        models: ["hermes chat --model <model>", "hermes fallback clear", "/model <model> --global"],
        scheduler: ["hermes cron tick", "hermes webhook subscribe", "hermes kanban"],
        plugins: ["hermes plugins list", "hermes mcp serve", "hermes tools --summary", "hermes computer-use status"],
        gateway: ["hermes gateway status", "hermes gateway install", "hermes portal tools", "hermes logs gateway"],
        doctorCompat: ["hermes status --all", "hermes dump", "hermes debug share --local", "hermes update --check"],
        sandboxPermissions: ["hermes setup terminal", "hermes chat --yolo", "hermes security audit"],
        configuration: ["hermes config show", "hermes config set <key> <value>", "hermes config migrate", "hermes dashboard --status", "hermes profile show <name>"],
      };
      for (const [domain, commands] of Object.entries(requiredHermesCommands)) {
        const officialCommands = hermesSurface.get(domain) ?? [];
        for (const command of commands) {
          if (!officialCommands.includes(command)) errors.push(`Hermes ${domain} official command inventory missing current docs command: ${command}`);
        }
      }
      for (const staleCommand of ["OpenClaw migrate memories", "cron scheduling docs", "MCP integration docs"]) {
        for (const [domain, officialCommands] of hermesSurface.entries()) {
          if (officialCommands.includes(staleCommand)) errors.push(`Hermes ${domain} official command inventory still includes stale placeholder: ${staleCommand}`);
        }
      }
    }

    const manifestActions = manifest.sessionActionContracts?.[runtimeId] ?? [];
    const portalActions = portalSessionActionContracts?.[runtimeId] ?? [];
    if (JSON.stringify(manifestActions) !== JSON.stringify(portalActions)) {
      errors.push(`runtime portal session action contracts must exactly match manifest for ${runtimeId}`);
    }
    const actionNames = manifestActions.map((entry) => entry.action);
    if (JSON.stringify(actionNames) !== JSON.stringify(requiredSessionActions)) {
      errors.push(`${runtimeId} session action contracts must exactly match required action order`);
    }
    for (const action of manifestActions) {
      for (const field of ["action", "status", "authority", "writesRuntime", "persistence", "delegatesTo", "guard"]) {
        if (!(field in action)) errors.push(`${runtimeId}.${action.action ?? "unknown"} session action missing ${field}`);
      }
      if ((action.action === "create") && (action.wouldWriteRuntime !== true || !Array.isArray(action.requiredEvidence) || action.requiredEvidence.length === 0)) {
        errors.push(`${runtimeId}.create session action must declare wouldWriteRuntime and requiredEvidence`);
      }
      if ((action.action === "pin" || action.action === "unpin") && (action.authority !== "clawix_local_overlay" || action.writesRuntime !== false)) {
        errors.push(`${runtimeId}.${action.action} session action must be local overlay only`);
      }
      if (action.action === "pin" || action.action === "unpin") {
        const expectedEvidenceId = `${runtimeId}.sessions.${action.action}.native_write_back_contract`;
        if (action.nativeWriteBackStatus !== "blocked_until_official_runtime_write_back_contract") {
          errors.push(`${runtimeId}.${action.action} session action must expose native write-back blocker status`);
        }
        if (action.officialRuntimeWriteBackContractRequired !== true || action.officialRuntimeWriteBackContractKnown !== false) {
          errors.push(`${runtimeId}.${action.action} session action must declare missing official runtime write-back contract`);
        }
        if (action.nativeWriteBackSafeDefault !== "keep_local_overlay_and_do_not_write_runtime_pin_state") {
          errors.push(`${runtimeId}.${action.action} session action must declare local-overlay pin safe default`);
        }
        if (action.userVisibleContract !== "local_overlay_only_until_official_runtime_pin_api_exists") {
          errors.push(`${runtimeId}.${action.action} session action must expose the local-overlay user-visible contract`);
        }
        if (action.claimEffect !== "blocks_native_write_back_parity_not_local_overlay") {
          errors.push(`${runtimeId}.${action.action} session action must block native write-back parity without blocking local overlay`);
        }
        if (action.evidenceRequirementId !== expectedEvidenceId) {
          errors.push(`${runtimeId}.${action.action} session action must use evidence id ${expectedEvidenceId}`);
        }
      }
    }
    for (const actionName of ["send", "inject", "abort"]) {
      const action = manifestActions.find((entry) => entry.action === actionName);
      if (runtimeId === "openclaw") {
        if (action?.writesRuntime !== true || !String(action?.status ?? "").includes("confirmation")) {
          errors.push(`${runtimeId}.${actionName} must remain an explicit confirmed runtime write`);
        }
      } else if (action?.writesRuntime !== false || action?.status !== "blocked") {
        errors.push(`${runtimeId}.${actionName} must remain blocked until native contract or integration evidence exists`);
      }
    }
  }

  for (const adapter of manifest.baselineAdapters ?? []) {
    if (adapter.recommended || adapter.production || stableStages.has(adapter.supportStage)) {
      errors.push(`baseline adapter ${adapter.id} cannot claim stable/recommended/production support`);
    }
  }

  const standard = fs.readFileSync(standardPath, "utf8");
  for (const snippet of ["Triple Matrix", "claw runtime <runtime-id>", "support --json", "finalPromotionReview", "evidenceReentryPackets", "finalSupportClaimDecision", "closureChecklist", "resources <domain>", "stable `ok:false` JSON error envelopes", "command-intent routes", "semantic native parity", "no silent overwrite"]) {
    if (!standard.includes(snippet)) errors.push(`standard doc missing snippet: ${snippet}`);
  }

  const adr = fs.readFileSync(adrPath, "utf8");
  for (const snippet of ["Status: Accepted", "Source Decision Audit", "Surface Parity", "Discovery Route"]) {
    if (!adr.includes(snippet)) errors.push(`ADR missing snippet: ${snippet}`);
  }

  const support = fs.readFileSync(supportMatrixPath, "utf8");
  if (!support.includes("openclaw") || !support.includes("codex") || !support.includes("hermes")) {
    errors.push("support matrix must include OpenClaw, Codex, and Hermes rows");
  }
  if (!support.includes("Runtime ecosystem claim") || !support.includes("operable partial")) {
    errors.push("support matrix must distinguish adapter support from runtime ecosystem claims");
  }
  if (support.includes("write-back, UI, and live evidence close")) {
    errors.push("support matrix must not list current OpenClaw runtime-lens UI evidence as an unresolved blocker");
  }
  if (!support.includes("absent native create/write-back contracts are product-blocked")) {
    errors.push("support matrix must name OpenClaw's product-blocked native contract behavior");
  }
  if (!support.includes("ecosystem-production remains blocked until live evidence and final promotion close")) {
    errors.push("support matrix must name OpenClaw's remaining ecosystem-production blockers");
  }

  const decisionMap = fs.readFileSync(decisionMapPath, "utf8");
  if (!decisionMap.includes("Runtime ecosystem integration")) {
    errors.push("decision map missing Runtime ecosystem integration row");
  }
  if (!decisionMap.includes("claw commands resolve runtime resources --json")) {
    errors.push("decision map missing runtime resource command-intent validation route");
  }
  if (!decisionMap.includes("claw commands resolve runtime support --json")) {
    errors.push("decision map missing runtime support command-intent validation route");
  }

  const discoverability = readJson(discoverabilityPath);
  const discoverabilitySources = new Set((discoverability.artifacts ?? []).map((entry) => entry.canonicalSource));
  for (const source of [
    "docs/runtime-ecosystem-integration-standard.md",
    "docs/runtime-ecosystem-integration.manifest.json",
    "docs/adr/0047-runtime-ecosystem-integration-standard.md",
    "scripts/verify-runtime-ecosystem-integration.mjs",
  ]) {
    if (!discoverabilitySources.has(source)) errors.push(`discoverability registry missing ${source}`);
  }

  const coverage = readJson(adrCoveragePath);
  const coverageAdrs = new Set((coverage.acceptedAdrCoverage ?? []).map((entry) => entry.adr));
  if (!coverageAdrs.has("docs/adr/0047-runtime-ecosystem-integration-standard.md")) {
    errors.push("ADR operational coverage missing ADR 0047");
  }

  const packageJson = JSON.parse(read("package.json"));
  if (!packageJson.scripts?.["test:runtime-ecosystem"]?.includes("verify-runtime-ecosystem-integration.mjs")) {
    errors.push("package.json missing test:runtime-ecosystem script");
  }

  if (errors.length > 0) {
    printRuntimeFailures(errors);
    process.exit(1);
  }
  console.log("runtime ecosystem integration check passed");
}

if (selfTest) {
  runSelfTest();
} else {
  try {
    main();
  } catch (error) {
    printRuntimeFailures([error instanceof Error ? error.message : String(error)]);
    process.exit(1);
  }
}
