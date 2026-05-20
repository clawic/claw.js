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

function forbidSnippet(relativePath, snippet) {
  const text = read(relativePath);
  assert(!text.includes(snippet), `${relativePath}: must not contain ${JSON.stringify(snippet)}`);
}

function assertNoPendingCapabilitySurfaceBindings() {
  const relativePath = "packages/clawjs-core/src/capability-catalog.ts";
  const text = read(relativePath);
  const blocks = [...text.matchAll(/surfaces\(\{([\s\S]*?)\n\s*\}\)/g)];
  assert(blocks.length > 0, `${relativePath}: must declare capability surface bindings`);

  const expectedSurfaces = ["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"];
  for (const [index, match] of blocks.entries()) {
    const block = match[1];
    const missing = expectedSurfaces.filter((surface) => !new RegExp(`\\b${surface}:`).test(block));
    assert(
      missing.length === 0,
      `${relativePath}: surfaces block ${index + 1} missing ${missing.join(", ")}`,
    );
    assert(
      !/:\s*"pending"\b/.test(block),
      `${relativePath}: surfaces block ${index + 1} must use explicit available/blocked/notApplicable refs, not pending`,
    );
  }
}

function requireSiblingSnippet(siblingRoot, relativePath, snippet) {
  const text = readFrom(siblingRoot, relativePath);
  assert(text.includes(snippet), `clawix:${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function assertCompletionAudit() {
  const text = read("docs/governance/sdk-first-custom-surfaces/completion.md");
  for (const snippet of [
    "Source conversation: `019e403c-3837-7f02-9b78-532c43cdd997`",
    "Status: `active_goal_not_complete`",
    "private source session path is",
    "also inspects",
    "private source-session verifier has re-read",
    "24 decision prompt ids",
    "three interrupted unanswered ids",
    "The Network Control Plane now provides a typed executable route-family example",
    "mirrors the ClawJS SDK facade shape for `capabilities.list`, `capabilities.get`",
    "disabled-by-default rule suggestions",
    "sibling Clawix checkout now mirrors ClawJS `system.telemetry.snapshot` and `system.telemetry.history`",
    "`window.clawix.system.telemetry`",
    "`SystemTelemetryBridge.localStatusBridge`",
    "resources.list` as a separate local-wide registered-resource catalog read",
    "ClawJS and sibling Clawix now expose `jobs.list`, `jobs.get`, and `jobs.events`",
    "ClawJS now blocks public CLI jobs read surfaces",
    "ClawJS now marks `jobs.stream`, `jobs.start`, and `jobs.cancel` only as blocked explicit gaps",
    "`window.clawix.mac.planAction()`",
    "dry-run-only Mac Control plan projection",
    "`window.clawix.iot.invokeAction()`",
    "approval-gated IoT host-dispatch projection",
    "`window.clawix.actions.invoke()`",
    "`window.clawix.secrets.broker()`",
    "no-runner/no-plaintext-broker host bridge facades",
    "imported/marketplace app trust handling with host-local `app-package-trust-roots.json`",
    "signature key/trust-source provenance",
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
    "launched `/Applications/Clawix.app` under Instruments",
    "raw trace artifacts private because Instruments captures local environment details",
    "Complete real signed-app UI/Instruments performance evidence is missing.",
    "| CLJ-SDK-009 | Unanswered `data_access_lock`, `custom_collections`, and `cli_escape_hatch`",
    "| CLJ-SDK-010 | Final decision-by-decision source-session audit",
    "VALIDATED PRIVATE",
    "Do not call `update_goal`",
  ]) {
    assert(text.includes(snippet), `docs/governance/sdk-first-custom-surfaces/completion.md: missing ${JSON.stringify(snippet)}`);
  }
  const rowIds = text.match(/\| CLJ-SDK-\d{3} \|/g) ?? [];
  assert(rowIds.length === 10, "docs/governance/sdk-first-custom-surfaces/completion.md: must contain exactly CLJ-SDK-001 through CLJ-SDK-010");
  assert(!text.includes("/Users/"), "docs/governance/sdk-first-custom-surfaces/completion.md: must not publish private filesystem paths");
  for (const [rowId, status] of [
    ["CLJ-SDK-002", "PARTIAL LOCAL"],
    ["CLJ-SDK-005", "EXTERNAL PENDING"],
    ["CLJ-SDK-007", "VALIDATED LOCAL"],
    ["CLJ-SDK-008", "EXTERNAL PENDING"],
    ["CLJ-SDK-010", "VALIDATED PRIVATE"],
  ]) {
    const pattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*${status}\\s*\\|`);
    assert(pattern.test(text), `docs/governance/sdk-first-custom-surfaces/completion.md: ${rowId} must remain ${status}`);
  }
}

function assertPublicRouting() {
  for (const [relativePath, snippets] of Object.entries({
    "docs/adr/0032-sdk-first-custom-surfaces-and-nonblocking-shell.md": [
      "The shared custom-app SDK inspection payload includes an `executionBoundary`",
      "MCP `clawjs.custom_app_sdk`",
      "Relay `/v1/remote/custom-app-sdk` are metadata-only contract projections",
    ],
    "docs/governance/sdk-first-custom-surfaces/plan.md": [
      "Expose `executionBoundary` in the shared custom-app SDK inspection payload",
      "Custom-app SDK inspection exposes `executionBoundary` across CLI/API/MCP/",
      "Sibling Clawix mirrors the ClawJS capability facade shape",
      "Sibling Clawix installed-app Time Profiler smoke",
      "launch and attach capture paths",
      "rescue, delayed-heavy-surface",
      "Sibling Clawix mirrors `system.telemetry.snapshot` and",
      "ClawJS and sibling Clawix expose `resources.list` and",
      "ClawJS and sibling Clawix expose `jobs.list`, `jobs.get`, and `jobs.events`",
      "ClawJS blocks public CLI jobs read surfaces",
      "ClawJS and sibling Clawix expose `jobs.stream` only as a blocked explicit",
      "ClawJS and sibling Clawix expose `jobs.start` and `jobs.cancel` only as",
      "Sibling Clawix exposes `mac.action.plan` through",
      "Sibling Clawix exposes `iot.device.action.invoke` through",
      "Sibling Clawix exposes `actions.invoke` and `secrets.broker` through",
      "Sibling Clawix validates imported/marketplace packages through host-local",
    ],
    "docs/decision-map.md": [
      "governance/sdk-first-custom-surfaces/completion.md",
      "scripts/verify-sdk-first-custom-surfaces-goal.mjs",
      "metadata-only projection boundaries",
    ],
    "docs/discoverability.registry.json": [
      "docs/governance/sdk-first-custom-surfaces/completion.md",
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
      "id: \"resources.list\"",
      "id: \"jobs.list\"",
      "id: \"jobs.get\"",
      "id: \"jobs.events\"",
      "id: \"jobs.stream\"",
      "id: \"jobs.start\"",
      "id: \"jobs.cancel\"",
      "cli: \"blocked\"",
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
      "claw.jobs.list.v1",
      "claw.jobs.get.v1",
      "claw.jobs.detail.v1",
      "claw.jobs.events.v1",
      "claw.jobs.eventsResult.v1",
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
  forbidSnippet("packages/clawjs-core/src/capability-catalog.ts", "claw runtime jobs --json");
  forbidSnippet("packages/clawjs-core/src/capability-fiches.ts", "claw runtime jobs --json");
  assertNoPendingCapabilitySurfaceBindings();
}

function assertTests() {
  for (const [relativePath, snippets] of Object.entries({
    "packages/clawjs-core/src/capability-catalog.test.ts": [
      "custom-app SDK inspection payload has no missing schema refs",
      "custom-app SDK inspection payload exposes dispatch availability and gaps",
      "payload.executionBoundary.executesCapabilityCalls",
      "custom-app DB query schema rejects collection creation",
      "resources.list",
      "jobs.list",
      "jobs.get",
      "jobs.events",
      "jobs.stream",
      "jobs.start",
      "jobs.cancel",
      "jobs read capabilities do not advertise removed runtime CLI sidecars",
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
    "docs/governance/sdk-first-custom-surfaces/plan.md": [
      "metadata-only `executionBoundary`",
      "`clawix.capabilities.contracts()` exposes `executionBoundary`",
      "`window.clawix.capabilities` mirrors the shared SDK facade shape",
      "Direct SQLite is not exposed as a custom-app action surface.",
      "`system.telemetry.snapshot` and `system.telemetry.history` are mirrored as",
      "`resources.list` and `resources.read` are separate local-wide capabilities",
      "`jobs.list`, `jobs.get`, and `jobs.events` are exposed to Web custom apps",
      "`mac.action.plan` is exposed to Web custom apps through",
      "`iot.device.action.invoke` is exposed to Web custom apps through",
      "`actions.invoke` and `secrets.broker` are exposed to Web custom apps through",
    ],
    "docs/governance/sdk-first-custom-surfaces/completion.md": [
      "Status: `active_goal_not_complete`",
      "The Clawix verifier inspects sibling ClawJS evidence when that checkout is present.",
      "| CLX-SDK-005 | Imported/marketplace apps require origin/capability/risk ficha",
      "host-local `app-package-trust-roots.json` policy",
      "| CLX-SDK-010 | Final decision-by-decision source-session audit",
      "| CLX-SDK-007 | Swift custom surfaces are native but isolated",
      "`window.clawix.mac.planAction()`",
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
      "systemTelemetrySnapshotSchemaRef",
      "system.telemetry.snapshot",
      "system.telemetry.history",
      "resourcesListSchemaRef",
      "resources.list",
      "jobsListSchemaRef",
      "jobs.list",
      "jobsGetSchemaRef",
      "jobs.get",
      "jobsEventsSchemaRef",
      "jobs.events",
    ],
    "macos/Sources/Clawix/Apps/AppPackageTrustPolicy.swift": [
      "app-package-trust-roots.json",
      "TrustedSignatureKey",
      "trustSource",
      "ed25519",
    ],
    "macos/Sources/Clawix/Apps/AppRecord.swift": [
      "signatureKeyId",
      "signatureTrustSource",
    ],
    "macos/Sources/Clawix/Apps/AppTrustAudit.swift": [
      "signatureKeyId",
      "signatureTrustSource",
    ],
    "macos/Sources/Clawix/Apps/AGENT_CONTRACT.md": [
      "app-package-trust-roots.json",
      "signatureKeyId",
      "signatureTrustSource",
    ],
    "macos/Sources/Clawix/Apps/ClawixAppsSDK.swift": [
      "capabilities",
      "get: function (id) { return send('capabilities.get'",
      "contracts: function () { return send('capabilities.contracts'); }",
      "source: function () { return send('capabilities.source'); }",
      "db.query",
      "resources.list",
      "jobs.list",
      "jobs.get",
      "jobs.events",
      "mac.action.plan",
      "planAction",
      "actions.invoke",
      "secrets.broker",
      "ttlSeconds",
      "iot.device.action.invoke",
      "invokeAction",
      "system.telemetry.snapshot",
      "system.telemetry.history",
    ],
    "macos/Sources/Clawix/Apps/AppBridgeMessageHandler.swift": [
      "handleSystemTelemetrySnapshot",
      "macActionPlanTool",
      "\"iot.device.action.invoke\"",
      "\"actions.invoke\"",
      "\"secrets.broker\"",
      "\"jobs.list\"",
      "\"jobs.get\"",
      "\"jobs.events\"",
      "jobBridgeValue",
      "jobDetailBridgeValue",
      "jobEventBridgeValues",
      "systemTelemetrySnapshotBridgeValue",
      "SystemTelemetryBridge",
    ],
    "macos/Sources/Clawix/SystemTelemetry/SystemTelemetryBridge.swift": [
      "localStatusBridge",
      "telemetry",
      "history",
    ],
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceCapabilityTests.swift": [
      "testHostBridgeExposesCustomAppSDKContractPayload",
      "testSwiftSurfaceResourceListExecutesThroughRegisteredResources",
      "capabilities.get",
      "capabilities.source",
      "testInjectedAppsSdkExposesMacPlanOnlyFacade",
      "testInjectedAppsSdkExposesIoTActionFacade",
      "testInjectedAppsSdkExposesActionsAndSecretsBrokerFacades",
      "testInjectedAppsSdkExposesJobsListFacade",
      "testJobsListBridgeValueRedactsRunMetadataThroughSharedPolicy",
      "testFrameworkHighRiskActionDispatcherKeepsGenericActionsAndSecretsUnavailable",
      "testDBQueryDSLRejectsCollectionEscapesAndDDLKeys",
      "testSwiftSurfaceRunnerSupervisorRejectsInProcessPlans",
      "testSystemTelemetryBridgeValuesMatchSdkContracts",
      "Signature key",
      "Trust source",
    ],
    "macos/Tests/ClawixMeshTests/AppsStoreCancellationTests.swift": [
      "testImportAppVerifiesSignedPackageDigestWithHostTrustPolicy",
      "AppPackageTrustPolicy.defaultURL",
      "signatureTrustSource",
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
      "`macos/artifacts/traces/20260520T123248Z-installed-launch-time-profiler.trace`",
      "The installed app launched under Instruments for a 30 second Time Profiler",
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
