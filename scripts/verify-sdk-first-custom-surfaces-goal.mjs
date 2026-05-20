#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const requireClawixSibling = args.has("--require-clawix") || process.env.CLAWIX_SDK_FIRST_REQUIRE_CLAWIX === "1";
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readFrom(baseDir, relativePath) {
  return fs.readFileSync(path.join(baseDir, relativePath), "utf8");
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  assert(text.includes(snippet), `${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function requireSiblingSnippet(siblingRoot, relativePath, snippet) {
  const text = readFrom(siblingRoot, relativePath);
  assert(text.includes(snippet), `clawix:${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function assertCompletionAudit() {
  const text = read("docs/sdk-first-custom-surfaces-completion-audit.md");
  for (const snippet of [
    "Source conversation: `019e403c-3837-7f02-9b78-532c43cdd997`",
    "Status: `active_goal_not_complete`",
    "private source session path is",
    "also inspects",
    "private source-session verifier has re-read",
    "24 decision prompt ids",
    "three interrupted unanswered ids",
    "The Network Control Plane now provides a typed executable route-family example",
    "disabled-by-default rule suggestions",
    "The required sibling Clawix checkout is present for this closure gate",
    "Keep the `--require-clawix` verifier path current",
    "| CLJ-SDK-001 | ADR, plan, decision-map, and discoverability routing",
    "| CLJ-SDK-002 | Shared capability catalog and SDK facade",
    "| CLJ-SDK-003 | Custom-app SDK inspection exposes `executionBoundary`",
    "| CLJ-SDK-004 | Ordinary local reads/list/search/filter/composition",
    "| CLJ-SDK-005 | High-risk actions stay brokered",
    "| CLJ-SDK-006 | Service API, MCP, and Relay custom-app routes",
    "| CLJ-SDK-007 | Clawix consumes the shared framework contract",
    "| CLJ-SDK-008 | Shells and hosts remain modular and nonblocking",
    "redacted installed-app Time Profiler smoke",
    "raw trace artifacts private because Instruments captures local environment details",
    "Complete real signed-app UI/Instruments performance evidence is missing.",
    "| CLJ-SDK-009 | Unanswered `data_access_lock`, `custom_collections`, and `cli_escape_hatch`",
    "| CLJ-SDK-010 | Final decision-by-decision source-session audit",
    "VALIDATED PRIVATE",
    "Do not call `update_goal`",
  ]) {
    assert(text.includes(snippet), `docs/sdk-first-custom-surfaces-completion-audit.md: missing ${JSON.stringify(snippet)}`);
  }
  const rowIds = text.match(/\| CLJ-SDK-\d{3} \|/g) ?? [];
  assert(rowIds.length === 10, "docs/sdk-first-custom-surfaces-completion-audit.md: must contain exactly CLJ-SDK-001 through CLJ-SDK-010");
  assert(!text.includes("/Users/"), "docs/sdk-first-custom-surfaces-completion-audit.md: must not publish private filesystem paths");
  for (const [rowId, status] of [
    ["CLJ-SDK-002", "PARTIAL LOCAL"],
    ["CLJ-SDK-005", "EXTERNAL PENDING"],
    ["CLJ-SDK-007", "VALIDATED LOCAL"],
    ["CLJ-SDK-008", "EXTERNAL PENDING"],
    ["CLJ-SDK-010", "VALIDATED PRIVATE"],
  ]) {
    const pattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*${status}\\s*\\|`);
    assert(pattern.test(text), `docs/sdk-first-custom-surfaces-completion-audit.md: ${rowId} must remain ${status}`);
  }
}

function assertPublicRouting() {
  for (const [relativePath, snippets] of Object.entries({
    "docs/adr/0032-sdk-first-custom-surfaces-and-nonblocking-shell.md": [
      "The shared custom-app SDK inspection payload includes an `executionBoundary`",
      "MCP `clawjs.custom_app_sdk`",
      "Relay `/v1/remote/custom-app-sdk` are metadata-only contract projections",
    ],
    "docs/sdk-first-custom-surfaces-plan.md": [
      "Expose `executionBoundary` in the shared custom-app SDK inspection payload",
      "Custom-app SDK inspection exposes `executionBoundary` across CLI/API/MCP/",
      "Sibling Clawix installed-app Time Profiler smoke",
      "launch, rescue, delayed-heavy-surface",
    ],
    "docs/decision-map.md": [
      "sdk-first-custom-surfaces-completion-audit.md",
      "scripts/verify-sdk-first-custom-surfaces-goal.mjs",
      "metadata-only projection boundaries",
    ],
    "docs/discoverability.registry.json": [
      "docs/sdk-first-custom-surfaces-completion-audit.md",
      "scripts/verify-sdk-first-custom-surfaces-goal.mjs",
      "sdk-first custom surfaces completion audit",
    ],
    "docs/discoverability.md": [
      "sdk-first-custom-surfaces-completion-audit",
      "verify-sdk-first-custom-surfaces-goal",
    ],
    "package.json": [
      "\"test:sdk-first-custom-surfaces-goal\": \"node ./scripts/verify-sdk-first-custom-surfaces-goal.mjs\"",
      "npm run test:sdk-first-custom-surfaces-goal",
    ],
  })) {
    for (const snippet of snippets) requireSnippet(relativePath, snippet);
  }
}

function assertFrameworkArtifacts() {
  for (const [relativePath, snippets] of Object.entries({
    "packages/clawjs-core/src/capability-catalog.ts": [
      "sdk-first-custom-surfaces",
      "buildCustomAppCapabilityRiskMap",
      "approvalRequired",
      "blocked",
    ],
    "packages/clawjs-core/src/custom-app-sdk-inspection.ts": [
      "CUSTOM_APP_SDK_EXECUTION_BOUNDARY",
      "metadata_only_contract_catalog",
      "executesCapabilityCalls: false",
      "sdk_host_bridge",
      "relay.remote.custom_app_sdk",
    ],
    "packages/clawjs-core/src/custom-app-sdk-contracts.ts": [
      "customAppSDKCollectionIdSchema",
      ".regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/)",
      "!/^sqlite_/i.test(value)",
      "claw.db.query.v1",
    ],
    "packages/clawjs-node/src/create-claw.test.ts": [
      "claw.capabilities.list()",
      "claw.capabilities.riskMap()",
      "claw.capabilities.source()",
      "sdk-first-custom-surfaces",
    ],
    "packages/clawjs-core/src/network-control-plane.ts": [
      "networkPolicyEvaluationSchema",
      "evaluateGatewayNetworkAccess",
      "createNetworkEvent",
      "createNetworkRuleSuggestion",
    ],
  })) {
    for (const snippet of snippets) requireSnippet(relativePath, snippet);
  }
}

function assertTests() {
  for (const [relativePath, snippets] of Object.entries({
    "packages/clawjs-core/src/capability-catalog.test.ts": [
      "custom-app SDK inspection payload has no missing schema refs",
      "custom-app SDK inspection payload exposes dispatch availability and gaps",
      "payload.executionBoundary.executesCapabilityCalls",
      "custom-app DB query schema rejects collection creation",
      "approvalRequiredNoPlaintextBroker",
    ],
    "packages/clawjs/src/inspect-cli.test.ts": [
      "runCli exposes custom app SDK read contracts through inspect",
      "custom-app-sdk",
      "payload.executionBoundary.executesCapabilityCalls",
    ],
    "packages/clawjs-mcp/src/custom-app-sdk-contract.test.ts": [
      "MCP custom app SDK contract boundary",
      "clawjs.custom_app_sdk",
      "payload.executionBoundary.executesCapabilityCalls",
    ],
    "runtime/tests/e2e/runtime.e2e.test.ts": [
      "runtime service API exposes custom app SDK contracts as read-only metadata",
      "runtime custom app SDK contract route does not execute DB or Search calls",
      "contracts/custom-app-sdk",
    ],
    "relay/src/server/remote-sync-routes.test.ts": [
      "relay exposes custom app SDK dispatch metadata as remote-safe contract projection",
      "/v1/remote/custom-app-sdk",
      "relay.remote.custom_app_sdk",
    ],
    "packages/clawjs-core/src/network-control-plane.test.ts": [
      "Network policy evaluation matches gateway routes and redacts by default",
      "Network events and rule suggestions keep detailed fields opt-in",
      "Network access manifests and CLI registry expose the framework portal",
    ],
    "packages/clawjs/src/cli-network-command.test.ts": [
      "network CLI records Monitor-backed events and keeps details redacted unless opted in",
      "network CLI applies rules to Gateway route explanations and suggestions never auto-apply",
    ],
  })) {
    for (const snippet of snippets) requireSnippet(relativePath, snippet);
  }
}

function assertSiblingClawixArtifacts() {
  const siblingRoot = process.env.CLAWIX_SDK_FIRST_ROOT
    ? path.resolve(process.env.CLAWIX_SDK_FIRST_ROOT)
    : path.resolve(rootDir, "..", "Clawix", "clawix");
  if (!fs.existsSync(siblingRoot)) {
    if (requireClawixSibling) fail(`missing sibling Clawix checkout at ${siblingRoot}`);
    return;
  }

  for (const [relativePath, snippets] of Object.entries({
    "docs/adr/0019-sdk-first-custom-surfaces-and-nonblocking-shell.md": [
      "SDK-first custom surfaces and nonblocking shell mirror",
      "`clawix.capabilities.contracts()` is a metadata-only contract catalog",
      "`window.clawix`",
    ],
    "docs/sdk-first-custom-surfaces-plan.md": [
      "metadata-only `executionBoundary`",
      "`clawix.capabilities.contracts()` exposes `executionBoundary`",
      "Direct SQLite is not exposed as a custom-app action surface.",
    ],
    "docs/sdk-first-custom-surfaces-completion-audit.md": [
      "Status: `active_goal_not_complete`",
      "The Clawix verifier inspects sibling ClawJS evidence when that checkout is present.",
      "| CLX-SDK-010 | Final decision-by-decision source-session audit",
      "| CLX-SDK-007 | Swift custom surfaces are native but isolated",
      "verified the signed bundled helper, valid stdout `render` output",
      "docs/sdk-first-custom-surfaces-installed-performance-smoke.md",
    ],
    "scripts/verify-sdk-first-custom-surfaces-goal.mjs": [
      "assertSiblingClawJSArtifacts",
      "CUSTOM_APP_SDK_EXECUTION_BOUNDARY",
      "runtime custom app SDK contract route does not execute DB or Search calls",
    ],
    "macos/Sources/Clawix/Apps/AppCapabilityCatalog.swift": [
      "static var executionBoundaryBridgeValue",
      "\"metadata_only_contract_catalog\"",
      "\"hostBridgeImplementation\": \"window.clawix\"",
    ],
    "macos/Sources/Clawix/Apps/ClawixAppsSDK.swift": [
      "capabilities",
      "contracts: function () { return send('capabilities.contracts'); }",
      "db.query",
    ],
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceCapabilityTests.swift": [
      "testHostBridgeExposesCustomAppSDKContractPayload",
      "testDBQueryDSLRejectsCollectionEscapesAndDDLKeys",
      "testSwiftSurfaceRunnerSupervisorRejectsInProcessPlans",
    ],
    "macos/Tests/ClawixMeshTests/SurfaceShellPerformanceTests.swift": [
      "testCriticalShellStartFastPathStaysBoundedWithAllHeavyDependenciesUnavailable",
      "testExtensionSurfaceStartMeasurementRemainsRouteLocalUnderUnavailableDependencies",
    ],
    "docs/sdk-first-custom-surfaces-installed-app-smoke.md": [
      "`/Applications/Clawix.app/Contents/Helpers/ClawixSwiftSurfaceRunner`",
      "`codex-swift-runner-smoke`",
      "`Rendered by the installed Swift surface runner.`",
      "The Clawix app process stayed alive with the same PID",
    ],
    "docs/sdk-first-custom-surfaces-installed-performance-smoke.md": [
      "Status: `partial_local_evidence`",
      "Do not publish the raw trace",
      "`/Applications/Clawix.app/Contents/MacOS/Clawix`",
      "`Time Profiler`",
      "A local Web custom app route opened through the sidebar.",
      "A local Swift declarative app route opened through the sidebar.",
      "`CLX-SDK-008` remains `EXTERNAL PENDING`",
    ],
    "macos/Sources/Clawix/NetworkControl/NetworkControlBridge.swift": [
      "NetworkControlBridge",
      "resource: \"network\"",
      "action: \"routes\"",
      "NetworkControlRouteDecision",
    ],
    "macos/Tests/ClawixMeshTests/NetworkControlBridgeTests.swift": [
      "testDecodesGatewayRouteDecision",
      "testBridgeUsesSystemNetworkResourceWithoutNativeMutation",
    ],
  })) {
    for (const snippet of snippets) requireSiblingSnippet(siblingRoot, relativePath, snippet);
  }
}

assertCompletionAudit();
assertPublicRouting();
assertFrameworkArtifacts();
assertTests();
assertSiblingClawixArtifacts();

if (errors.length > 0) {
  console.error(`SDK-first custom surfaces verifier failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("SDK-first custom surfaces verifier passed; goal remains active until closure blockers are resolved.");
