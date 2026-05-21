import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAC_CAPABILITY_ATLAS,
  MAC_CONTROL_COMMAND_ROOTS,
  MAC_PERMISSION_CATALOG,
  MAC_PROGRAMMATIC_SURFACES,
  clawMacControlPlaneRegistry,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
  resolveClawCliCommand,
} from "../packages/clawjs-core/src/catalogs.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceConversationId = "019e366f-8e14-7e51-8817-9820d2914dc4";

const requiredDocs = [
  "docs/mac-control-plane.md",
  "docs/governance/mac-control-plane/verb-audit.md",
  "docs/governance/mac-control-plane/version-drift-audit.md",
  "docs/governance/mac-control-plane/source-audit.md",
  "docs/governance/mac-control-plane/completion.md",
  "docs/governance/mac-control-plane/decision-matrix.md",
  "docs/mac-native-legacy-audit.md",
  "docs/mac-native-usage-allowlist.json",
  "docs/adr/0023-mac-control-plane-v1.md",
  "docs/adr/0024-mac-permission-broker-v1.md",
  "docs/decision-map.md",
  "docs/adr/0012-surface-route-graph.md",
  "skills/mac-control-plane-work/SKILL.md",
];

const requiredProgrammaticSurfaces = [
  "mac.plan",
  "mac.execute",
  "mac.revert",
  "mac.audit",
  "mac.permissions",
  "/v1/mac/plan",
  "/v1/mac/execute",
  "/v1/mac/revert",
  "/v1/mac/audit",
  "/v1/mac/permissions",
  "claw.mac.plan",
  "claw.mac.execute",
  "claw.mac.revert",
  "claw.mac.audit",
  "claw.mac.permissions",
];

const requiredDecisionRows = [
  "MCQ-001",
  "MCQ-002",
  "MCQ-003",
  "MCQ-004",
  "MCQ-005",
  "MCQ-006",
  "MCQ-007",
  "MCQ-008",
  "MCQ-009",
  "MCQ-010",
  "MCQ-011",
  "MCQ-012",
  "MCQ-013",
  "MCQ-014",
  "MCQ-015",
  "MCQ-016",
  "MCQ-017",
  "MCQ-018",
];

const requiredMatrixRows = [
  "MC-001",
  "MC-002",
  "MC-003",
  "MC-004",
  "MC-005",
  "MC-006",
  "MC-007",
  "MC-008",
  "MC-009",
  "MC-010",
  "MC-011",
];

const requiredRoots = [
  "mac",
  "permissions",
  "wifi",
  "window",
  "shortcut",
  "app",
  "bluetooth",
  "vpn",
  "network",
];

const requiredExecutableCapabilities = [
  "mac.wifi.status",
  "mac.wifi.list",
  "mac.wifi.connect",
  "mac.wifi.disconnect",
  "mac.wifi.power.on",
  "mac.wifi.power.off",
  "mac.window.list",
  "mac.window.focus",
  "mac.window.move",
  "mac.window.resize",
  "mac.window.close",
  "mac.window.minimize",
  "mac.shortcut.list",
  "mac.shortcut.show",
  "mac.shortcut.run",
];

const requiredPermissionIds = [
  "mac.permission.accessibility",
  "mac.permission.screen_capture",
  "mac.permission.microphone",
  "mac.permission.speech_recognition",
  "mac.permission.automation_apple_events",
  "mac.permission.full_disk_access",
];

const requiredNodes = [
  "claw.mac.controlPlane",
  "claw.mac.capabilityAtlas",
  "claw.mac.permissionBroker",
  "claw.mac.actionBroker",
  "claw.host.permissions",
  "claw.host.audit",
];

const requiredRoutes = [
  "mac.directCliAction",
  "mac.permissionLifecycle",
];

const requiredRelatedSurfaceHelp = new Map([
  ["app", ["claw apps"]],
  ["apps", ["claw app"]],
  ["audio", ["claw mac coverage audio"]],
  ["notification", ["claw notify"]],
  ["notify", ["claw notification"]],
  ["calendar", ["claw permissions show calendar"]],
  ["contacts", ["claw permissions show contacts"]],
  ["reminders", ["claw permissions show reminders"]],
  ["files", ["claw permissions show files"]],
  ["location", ["claw permissions show location"]],
  ["microphone", ["claw stt", "claw tts"]],
  ["speech", ["claw stt", "claw tts"]],
  ["stt", ["claw speech", "claw microphone"]],
  ["tts", ["claw speech", "claw microphone"]],
  ["voice-notes", ["claw microphone", "claw speech"]],
]);

function readRequired(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) fail(`missing required file ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function fail(message) {
  console.error(`Mac Control Plane goal verification failed: ${message}`);
  process.exit(1);
}

function requireText(label, text, snippet) {
  if (!text.includes(snippet)) fail(`${label} is missing ${snippet}`);
}

function requireNormalizedText(label, text, snippet) {
  const normalizedText = text.replace(/\s+/g, " ");
  const normalizedSnippet = snippet.replace(/\s+/g, " ");
  if (!normalizedText.includes(normalizedSnippet)) fail(`${label} is missing ${snippet}`);
}

function verifySourceSessionIfProvided() {
  const sourceSession = process.env.CLAW_MAC_CONTROL_SOURCE_SESSION;
  if (!sourceSession) return;

  const sourceSessionPath = path.resolve(sourceSession);
  if (!fs.existsSync(sourceSessionPath)) fail(`source session file does not exist: ${sourceSessionPath}`);

  const calls = new Map();
  let sessionId = null;
  const lines = fs.readFileSync(sourceSessionPath, "utf8").trimEnd().split("\n");
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      fail(`source session line ${index + 1} is not valid JSON: ${error.message}`);
    }

    if (event.type === "session_meta") sessionId = event.payload?.id ?? null;
    const payload = event.payload;
    if (payload?.name === "request_user_input") {
      const args = JSON.parse(payload.arguments || "{}");
      calls.set(payload.call_id, {
        line: index + 1,
        ids: (args.questions || []).map((question) => question.id),
        answers: null,
      });
    }
    if (payload?.type === "function_call_output" && calls.has(payload.call_id)) {
      const call = calls.get(payload.call_id);
      call.answers = JSON.parse(payload.output || "{}").answers || {};
    }
  }

  if (sessionId !== sourceConversationId) fail(`source session id ${sessionId} did not match ${sourceConversationId}`);
  if (calls.size !== 83) fail(`source session must contain 83 request_user_input prompt groups, found ${calls.size}`);

  const promptIdCount = [...calls.values()].reduce((count, call) => count + call.ids.length, 0);
  if (promptIdCount !== 245) fail(`source session must contain 245 structured prompt ids, found ${promptIdCount}`);

  const answered = [...calls.values()].filter((call) => call.answers).length;
  if (answered !== 82) fail(`source session must contain 82 answered prompt groups, found ${answered}`);

  const unanswered = [...calls.values()].filter((call) => !call.answers);
  if (
    unanswered.length !== 1 ||
    unanswered[0].line !== 329 ||
    unanswered[0].ids.join(",") !== "permission_catalog_coverage,manual_permission_policy,usage_description_policy"
  ) {
    fail("source session unanswered prompt group did not match the known interrupted permission catalog group");
  }

  const freeFormAnswers = [];
  for (const call of calls.values()) {
    for (const [id, answer] of Object.entries(call.answers || {})) {
      const values = answer?.answers || [];
      if (values.some((value) => !String(value).includes("(Recommended)"))) {
        freeFormAnswers.push(id);
      }
    }
  }
  if (freeFormAnswers.length !== 17) fail(`source session must contain 17 free-form or non-recommended answers, found ${freeFormAnswers.length}`);
}

function readExternalRequired(rootPath, relativePath, label) {
  const fullPath = path.join(rootPath, relativePath);
  if (!fs.existsSync(fullPath)) fail(`${label} is missing ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function verifyClawixMacosIfProvided() {
  const clawixMacos = process.env.CLAWIX_MACOS_PATH;
  if (!clawixMacos) return;

  const clawixMacosPath = path.resolve(clawixMacos);
  if (!fs.existsSync(clawixMacosPath)) fail(`Clawix macOS path does not exist: ${clawixMacosPath}`);

  const projector = readExternalRequired(
    clawixMacosPath,
    "Sources/Clawix/HostActions/MacControlGlobalInboxProjector.swift",
    "Clawix macOS",
  );
  for (const snippet of [
    "protocol MacControlGlobalInboxWriting",
    "extension DatabaseManager: MacControlGlobalInboxWriting",
    "enum MacControlGlobalInboxProjector",
    "createRecord(collection: \"approvals\"",
    "createRecord(collection: \"inbox_threads\"",
    "createRecord(collection: \"inbox_messages\"",
    "deleteRecord(collection: \"approvals\"",
  ]) {
    requireText("Clawix global inbox projector", projector, snippet);
  }

  const settingsPage = readExternalRequired(
    clawixMacosPath,
    "Sources/Clawix/HostActions/MacControlSettingsPage.swift",
    "Clawix macOS",
  );
  for (const snippet of [
    "projectPendingApprovalsToGlobalInbox",
    "MacControlGlobalInboxProjector.project(approval, using: databaseManager)",
    "center.markPendingApprovalProjected",
  ]) {
    requireText("Clawix Mac Control settings page", settingsPage, snippet);
  }

  const centerTests = readExternalRequired(
    clawixMacosPath,
    "Tests/ClawixMeshTests/MacControlCenterTests.swift",
    "Clawix macOS",
  );
  for (const snippet of [
    "testGlobalInboxProjectorCreatesApprovalThreadAndMessage",
    "testGlobalInboxProjectorCleansUpApprovalWhenThreadCreationFails",
    "RecordingGlobalInboxWriter",
    "inbox_threads",
    "inbox_messages",
  ]) {
    requireText("Clawix Mac Control center tests", centerTests, snippet);
  }
}

function renderSafeCli(text) {
  return text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

verifySourceSessionIfProvided();
verifyClawixMacosIfProvided();

for (const doc of requiredDocs) readRequired(doc);

const sourceAudit = readRequired("docs/governance/mac-control-plane/source-audit.md");
requireText("source decision audit", sourceAudit, sourceConversationId);
for (const id of requiredDecisionRows) requireText("source decision audit", sourceAudit, id);
for (const snippet of [
  "Structured Prompt Review",
  "83 `request_user_input` prompt groups",
  "82 answered prompt groups",
  "245 structured prompt ids",
  "17 free-form or non-recommended selected answers",
]) {
  requireNormalizedText("source decision audit prompt review", sourceAudit, snippet);
}

const closureAudit = readRequired("docs/governance/mac-control-plane/completion.md");
for (const snippet of [
  sourceConversationId,
  "active_goal_not_complete",
  "SIGNED-001",
  "AUDIT-001",
  "VALIDATION-001",
  "CSSMERR_TP_CERT_REVOKED",
  "Structured Prompt Review",
  "82 answered prompt groups",
  "17 free-form or non-recommended selected answers",
  "Claw.app",
  "Clawix embedded",
  "global inbox",
  "MacControlGlobalInboxProjector",
  "testGlobalInboxProjectorCreatesApprovalThreadAndMessage",
  "testGlobalInboxProjectorCleansUpApprovalWhenThreadCreationFails",
  "CLAWIX_MACOS_PATH",
  "| MCQ-015 | implemented |",
  "Host permission contract guard",
  "node scripts/verify-host-permission-contract.mjs --self-test",
  "node scripts/verify-host-permission-contract.mjs",
]) {
  requireNormalizedText("closure audit", closureAudit, snippet);
}
for (const id of requiredDecisionRows) requireText("closure audit", closureAudit, id);

for (const snippet of [
  "| MCQ-015 | Mac permissions correction |",
  "Implemented: static guard coverage is now repeatable",
  "scripts/verify-host-permission-contract.mjs --self-test",
]) {
  requireNormalizedText("source decision audit MCQ-015", sourceAudit, snippet);
}

const decisionMatrix = readRequired("docs/governance/mac-control-plane/decision-matrix.md");
for (const id of requiredMatrixRows) requireText("decision matrix", decisionMatrix, id);

const workflowSkill = readRequired("skills/mac-control-plane-work/SKILL.md");
for (const snippet of ["Mac Action Broker", "Mac Permission Broker", "Related surfaces", "EXTERNAL PENDING"]) {
  requireText("Mac workflow skill", workflowSkill, snippet);
}

const macDocs = readRequired("docs/mac-control-plane.md");
for (const snippet of ["Related surfaces", "mac.directCliAction", "mac.permissionLifecycle", "claw permissions", "MAC_PROGRAMMATIC_SURFACES", "mac.execute", "/v1/mac/execute", "claw.mac.execute", "docs/mac-native-legacy-audit.md", "Mac Control Plane Verb Audit", "Mac Control Plane Version Drift Audit", "stt", "tts", "voice-notes", "mac-permission-lifecycle.json", "requestedBefore", "revocationDetectedAt", "mac-control-policy-grants.json", "most-restrictive-wins", "role", "mcp_client", "mac-control-continuity.json", "confirmation_required", "macsnap_", "nativePrompt: just_in_time_only", "/v1/mac/permissions/request", "CLAW_LIVE_BROKER_COMMAND", "system mac execute"]) {
  requireNormalizedText("Mac Control Plane docs", macDocs, snippet);
}

const verbAudit = readRequired("docs/governance/mac-control-plane/verb-audit.md");
for (const snippet of [sourceConversationId, "MCQ-011", "Capability id", "Canonical CLI", "Verb decision"]) {
  requireNormalizedText("Mac verb audit", verbAudit, snippet);
}
for (const capability of MAC_CAPABILITY_ATLAS) {
  requireText("Mac verb audit capability ids", verbAudit, capability.id);
  if (!verbAudit.includes(capability.cli.canonicalUsage) && !verbAudit.includes(renderSafeCli(capability.cli.canonicalUsage))) {
    fail(`Mac verb audit canonical CLI is missing ${capability.cli.canonicalUsage}`);
  }
}

const versionDriftAudit = readRequired("docs/governance/mac-control-plane/version-drift-audit.md");
for (const snippet of [
  sourceConversationId,
  "MCQ-002",
  "MCQ-004",
  "macOS 14",
  "macOS 15",
  "macOS 26",
  "https://developer.apple.com/documentation/macos-release-notes/macos-14-release-notes",
  "https://developer.apple.com/documentation/macos-release-notes/macos-15-release-notes",
  "https://developer.apple.com/go/?id=macos-26-rn",
  "https://developer.apple.com/documentation/bundleresources/protected-resources",
  "https://developer.apple.com/documentation/corewlan/cwinterface",
  "https://developer.apple.com/documentation/applicationservices/axuielement_h",
  "https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac",
]) {
  requireNormalizedText("Mac version drift audit", versionDriftAudit, snippet);
}
for (const capability of MAC_CAPABILITY_ATLAS) {
  requireText("Mac version drift audit capability ids", versionDriftAudit, capability.id);
  requireText("Mac version drift audit backend strategies", versionDriftAudit, capability.backend.strategy);
  requireText("Mac version drift audit coverage states", versionDriftAudit, capability.coverageState);
}

const cliDocs = readRequired("docs/cli.md");
for (const snippet of ["mac-permission-lifecycle.json", "requestedBefore", "lastRequestedAt", "revocationDetectedAt", "mac-control-policy-grants.json", "upsert", "revoke", "mac-control-continuity.json", "system mac permissions --command request", "lastRequestResult", "CLAW_LIVE_BROKER_COMMAND", "signed_host_required"]) {
  requireNormalizedText("CLI docs", cliDocs, snippet);
}

const legacyAudit = readRequired("docs/mac-native-legacy-audit.md");
for (const snippet of ["MNL-001", "MNL-002", "MNL-003", "MNL-004", "MNL-005", "MNL-006", "MNL-007", "MNL-008", "`Commander*` names that remain in Swift are private implementation names only"]) {
  requireText("Mac native legacy audit", legacyAudit, snippet);
}
for (const snippet of [
  "retained-non-mac-control",
  "permission-broker-covered",
  "retained-installer-only",
  "retained-process-helper",
  "allowlisted-computer-use",
  "MacControlPermissionID.calendar",
  "MacControlPermissionID.contacts",
  "MacControlPermissionID.reminders",
]) {
  requireText("Mac native legacy audit dispositions", legacyAudit, snippet);
}

const apiDocs = readRequired("docs/api.md");
for (const snippet of ["claw.mac", "/v1/mac/plan", "mac.plan", "/v1/mac/permissions/request", "confirmation_required"]) {
  requireNormalizedText("API docs", apiDocs, snippet);
}

const hostMacControl = readRequired("apps/host/Sources/ClawHostKit/MacControl.swift");
for (const snippet of ["MacControlPermissionLifecycleStore", "mac-permission-lifecycle.json", "requestedBefore", "lastRequestedAt", "revocationDetectedAt", "MacControlPolicyGrantStore", "mac-control-policy-grants.json", "MacControlPolicySubjectKind", "mcpClient", "grantAuthorization", "MacControlContinuityStore", "mac-control-continuity.json", "continuitySnapshot", "continuityRevertSteps", "beforeRef"]) {
  requireText("Host Mac Control lifecycle store", hostMacControl, snippet);
}

const hostMacBridge = readRequired("apps/host/Sources/ClawHostKit/MacControlHostBridge.swift");
for (const snippet of ["lifecyclePath", "requestedBefore", "lastCheckedAt", "revocationDetectedAt", "policyPath", "policyResponse", "policyGrant(from:", "continuityPath", "confirmation_required", "decodeRevertSteps", "responseAsync", "PermissionRequester", "nativePrompt", "surprisePrompt", "permissionRequestResponse"]){
  requireText("Host Mac Control bridge lifecycle projection", hostMacBridge, snippet);
}

const hostMacTests = readRequired("apps/host/Tests/CommanderE2ETests/MacControlTests.swift");
for (const snippet of ["testPermissionLifecycleStorePersistsRequestsAndDetectsRevocation", "mac-permission-lifecycle", "requestedBefore", "revocationDetectedAt", "testPolicyGrantStoreMatchesEveryActorScope", "testHostBridgePersistsPolicyGrantEditsAndUsesThemForExecution", "grant_role_operator_block", "testHostBridgeCapturesContinuitySnapshotAndExecutesConfirmedWifiRevert", "mac-control-continuity", "confirmation_required", "testHostBridgePlansAndRecordsConfirmedPermissionRequest", "just_in_time_only"]) {
  requireText("Host Mac Control lifecycle tests", hostMacTests, snippet);
}

const mcpBridge = readRequired("packages/clawjs-mcp/src/mac-signed-host-bridge.ts");
for (const snippet of ["MacPermissionBridgeRequest", "--permission-id", "--confirm"]) {
  requireText("Mac MCP signed host bridge permissions", mcpBridge, snippet);
}

const mcpApp = readRequired("packages/clawjs-mcp/src/app.ts");
for (const snippet of ["mac/permissions/request", "signed_host_required", "just_in_time_only"]) {
  requireText("Mac MCP API permission request route", mcpApp, snippet);
}

const mcpExpose = readRequired("packages/clawjs-mcp/src/expose.ts");
for (const snippet of ["mac.permissions", "permissionId", "confirm", "just_in_time_only"]) {
  requireText("Mac MCP permissions tool", mcpExpose, snippet);
}

const macCli = readRequired("packages/clawjs/src/cli-mac-control-command.ts");
for (const snippet of ["CLAW_LIVE_BROKER_COMMAND", "system", "mac", "execute", "runSignedHostIfConfigured", "signed_host_result"]) {
  requireText("Mac CLI signed host bridge", macCli, snippet);
}

const macCliTests = readRequired("packages/clawjs/src/cli-mac-control-command.test.ts");
for (const snippet of ["Mac direct roots and permission requests hand off to configured signed host", "CLAW_LIVE_BROKER_COMMAND", "mac.wifi.connect", "macact_123"]) {
  requireText("Mac CLI signed host bridge tests", macCliTests, snippet);
}

const macCore = readRequired("packages/clawjs-core/src/mac-control-plane.ts");
for (const snippet of ["macPolicyGrantSchema", "effect: z.enum([\"allow\", \"block\"])", "\"mcp_client\"", "\"automation\""]) {
  requireText("Mac policy grant schema", macCore, snippet);
}

const nativeUsageAllowlist = JSON.parse(readRequired("docs/mac-native-usage-allowlist.json"));
if (nativeUsageAllowlist.version !== 1) fail("Mac native usage allowlist version must be 1");
for (const entry of nativeUsageAllowlist.entries ?? []) {
  if (!entry.path || !entry.owner || !entry.reason || !entry.expiresOn) fail("Mac native usage allowlist entries require path, owner, reason, and expiresOn");
  if (!Array.isArray(entry.allowedViolations) || entry.allowedViolations.length === 0) fail(`${entry.path} must declare allowedViolations`);
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) fail(`${entry.path} must declare tests`);
}

if (clawMacControlPlaneRegistry.validationGates.signedHostsRequired.length < 2) {
  fail("Mac registry must require Clawix embedded and Claw.app signed-host validation");
}
if (!clawMacControlPlaneRegistry.validationGates.staticNativeUsageGuardrail) {
  fail("Mac registry must require static native usage guardrail");
}

const roots = new Set(MAC_CONTROL_COMMAND_ROOTS.map((entry) => entry.root));
for (const root of requiredRoots) {
  if (!roots.has(root)) fail(`missing Mac command root ${root}`);
  if (!resolveClawCliCommand(root)) fail(`missing CLI registry command ${root}`);
}

for (const [command, relatedSurfaces] of requiredRelatedSurfaceHelp) {
  const entry = resolveClawCliCommand(command);
  if (!entry) fail(`missing CLI registry command ${command}`);
  for (const related of relatedSurfaces) {
    if (!entry.relatedSurfaces?.includes(related)) fail(`missing related surface ${related} on ${command}`);
  }
}

const executable = new Set(MAC_CAPABILITY_ATLAS
  .filter((entry) => entry.coverageState === "executable" || entry.coverageState === "host_validated")
  .map((entry) => entry.id));
for (const id of requiredExecutableCapabilities) {
  if (!executable.has(id)) fail(`missing V1 executable capability ${id}`);
}

const permissions = new Set(MAC_PERMISSION_CATALOG.map((entry) => entry.id));
for (const id of requiredPermissionIds) {
  if (!permissions.has(id)) fail(`missing Mac permission ${id}`);
}

const programmaticSurfaces = new Set(MAC_PROGRAMMATIC_SURFACES.map((entry) => entry.name));
for (const name of requiredProgrammaticSurfaces) {
  if (!programmaticSurfaces.has(name)) fail(`missing Mac programmatic surface ${name}`);
}
for (const surface of MAC_PROGRAMMATIC_SURFACES) {
  if (surface.mutatesNativeState && !surface.requiresSignedHost) fail(`mutating Mac surface must require signed host: ${surface.name}`);
  if (surface.lifecycleAction === "execute" && !surface.requiresApproval) fail(`Mac execute surface must require approval: ${surface.name}`);
}

for (const nodeId of requiredNodes) {
  if (!findClawPersistentSurfaceNode(nodeId)) fail(`missing surface node ${nodeId}`);
}

for (const routeId of requiredRoutes) {
  const route = findClawSurfaceRoute(routeId);
  if (!route) fail(`missing surface route ${routeId}`);
  if (!route.tests?.includes("packages/clawjs/src/inspect-cli.test.ts")) {
    fail(`${routeId} must cite inspect CLI tests`);
  }
}

console.log(`Mac Control Plane goal verification passed (${requiredDecisionRows.length} source decisions, ${requiredRoutes.length} routes)`);
