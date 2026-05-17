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
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceConversationId = "019e366f-8e14-7e51-8817-9820d2914dc4";

const requiredDocs = [
  "docs/mac-control-plane.md",
  "docs/mac-control-plane-source-decision-audit.md",
  "docs/mac-control-plane-decision-matrix.md",
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

for (const doc of requiredDocs) readRequired(doc);

const sourceAudit = readRequired("docs/mac-control-plane-source-decision-audit.md");
requireText("source decision audit", sourceAudit, sourceConversationId);
for (const id of requiredDecisionRows) requireText("source decision audit", sourceAudit, id);
for (const snippet of ["Structured Prompt Review", "83 `request_user_input` prompts", "not counted as user-selected answers"]) {
  requireText("source decision audit prompt review", sourceAudit, snippet);
}

const decisionMatrix = readRequired("docs/mac-control-plane-decision-matrix.md");
for (const id of requiredMatrixRows) requireText("decision matrix", decisionMatrix, id);

const workflowSkill = readRequired("skills/mac-control-plane-work/SKILL.md");
for (const snippet of ["Mac Action Broker", "Mac Permission Broker", "Related surfaces", "EXTERNAL PENDING"]) {
  requireText("Mac workflow skill", workflowSkill, snippet);
}

const macDocs = readRequired("docs/mac-control-plane.md");
for (const snippet of ["Related surfaces", "mac.directCliAction", "mac.permissionLifecycle", "claw permissions", "MAC_PROGRAMMATIC_SURFACES", "mac.execute", "/v1/mac/execute", "claw.mac.execute", "docs/mac-native-legacy-audit.md"]) {
  requireNormalizedText("Mac Control Plane docs", macDocs, snippet);
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
for (const snippet of ["claw.mac", "/v1/mac/plan", "mac.plan"]) {
  requireNormalizedText("API docs", apiDocs, snippet);
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
