#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
    "external evidence lanes",
    "scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs",
    "The Network Control Plane now provides a typed executable route-family example",
    "mirrors the ClawJS SDK facade shape for `capabilities.list`, `capabilities.get`",
    "complete resolved surface bindings across SDK, CLI, service API, MCP, Relay, and host bridge projections",
    "exact reviewed custom-app capability ID set",
    "exact reviewed risk partition sets",
    "exact reviewed dispatch mode partitions",
    "exact reviewed blocked and metadata-only surface partitions",
    "no `pending` status, no future-facade SDK refs, no unknown dispatch modes, no source-level unknown dispatch fallback, no conditional placeholder refs",
    "local-only/custom-app Relay coverage as `relay.remote.custom_app_sdk` metadata-only projection",
    "disabled-by-default rule suggestions",
    "sibling Clawix checkout now mirrors ClawJS `system.telemetry.snapshot` and `system.telemetry.history`",
    "`window.clawix.system.telemetry`",
    "`SystemTelemetryBridge.localStatusBridge`",
    "resources.list` as a separate local-wide registered-resource catalog read",
    "ClawJS and sibling Clawix now expose `jobs.list`, `jobs.get`, and `jobs.events`",
    "ClawJS now blocks public CLI jobs read surfaces",
    "ClawJS and sibling Clawix now expose `jobs.stream`, `jobs.start`, and `jobs.cancel` through runtime jobs contracts",
    "Public CLI jobs mutation surfaces remain blocked",
    "`window.clawix.mac.planAction()`",
    "dry-run-only Mac Control plan projection",
    "`window.clawix.iot.invokeAction()`",
    "approval-gated IoT host-dispatch projection",
    "`window.clawix.actions.invoke()`",
    "`window.clawix.secrets.broker()`",
    "no-runner/no-plaintext-broker host bridge facades",
    "imported/marketplace app trust handling with host-local `app-package-trust-roots.json`",
    "exact reviewed origin-class activation policy",
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
    "exact protected route target sets",
    "| CLJ-SDK-008 | Shells and hosts remain modular and nonblocking",
    "exact reviewed core survival route and heavy dependency sets",
    "exact reviewed surface lifecycle state and report sets",
    "redacted installed-app Time Profiler smoke",
    "launched `/Applications/Clawix.app` under Instruments",
    "rescue reachability, and a deliberately delayed-heavy-surface Web fixture reaching route-local timeout",
    "Newer host-liveness and all-process captures confirmed the installed Clawix process stayed alive after capture",
    "redacted stack attribution separated Clawix host SwiftUI/route/render work from WebKit WebContent and GPU work",
    "Raw trace artifacts stay private because Instruments captures local environment details and all-process metadata",
    "Performance governance now routes whole-computer resource classification",
    "scripts/performance-governance-check.mjs",
    "design governance rather than measured UI evidence",
    "Signed-app UI/Instruments performance evidence still needs an approved baseline and explicit review decision",
    "Complete real signed-app UI/Instruments performance evidence is missing.",
    "| CLJ-SDK-009 | Unanswered `data_access_lock`, `custom_collections`, and `cli_escape_hatch`",
    "exact reviewed allowlist",
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
    ["CLJ-SDK-002", "VALIDATED LOCAL"],
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
      "deliberately delayed-heavy-surface Web fixture reaching route-local timeout",
      "newer host-liveness and all-process captures confirmed post-capture app",
      "baseline remains the closure blocker",
      "docs/sdk-first-custom-surfaces-performance-closure-summary.md",
      "Sibling Clawix mirrors `system.telemetry.snapshot` and",
      "ClawJS and sibling Clawix expose `resources.list` and",
      "ClawJS and sibling Clawix expose `jobs.list`, `jobs.get`, and `jobs.events`",
      "ClawJS blocks public CLI jobs read surfaces",
      "ClawJS and sibling Clawix expose `jobs.stream` through the runtime jobs event",
      "ClawJS and sibling Clawix expose `jobs.start` and `jobs.cancel` as",
      "`runtime/jobs/start`, `runtime/jobs/:id/cancel`, `runtime/jobs/events`",
      "Public CLI job mutation",
      "Sibling Clawix exposes `mac.action.plan` through",
      "Sibling Clawix exposes `iot.device.action.invoke` through",
      "Sibling Clawix exposes `actions.invoke` and `secrets.broker` through",
      "docs/governance/sdk-first-custom-surfaces/external-pending.md",
      "scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs",
      "Sibling Clawix validates imported/marketplace packages through host-local",
    ],
    "docs/decision-map.md": [
      "governance/sdk-first-custom-surfaces/completion.md",
      "scripts/verify-sdk-first-custom-surfaces-goal.mjs",
      "scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs",
      "metadata-only projection boundaries",
      "Generic `actions.invoke` and `secrets.broker` remain explicit approval-gated no-runner/no-plaintext-broker gaps until safe runners exist",
    ],
    "docs/discoverability.registry.json": [
      "docs/governance/sdk-first-custom-surfaces/completion.md",
      "../Clawix/clawix/docs/governance/sdk-first-custom-surfaces/external-pending.md",
      "../Clawix/clawix/docs/governance/sdk-first-custom-surfaces/external-evidence.schema.json",
      "scripts/verify-sdk-first-custom-surfaces-goal.mjs",
      "sdk-first custom surfaces completion audit",
    ],
    "docs/discoverability.md": [
      "sdk-first-custom-surfaces-completion-audit",
      "sdk-first-custom-surfaces-external-pending",
      "sdk-first-custom-surfaces-external-evidence-schema",
      "verify-sdk-first-custom-surfaces-goal",
    ],
    "package.json": [
      "\"test:sdk-first-custom-surfaces-goal\": \"node ./scripts/verify-sdk-first-custom-surfaces-goal.mjs\"",
      "npm run test:sdk-first-custom-surfaces-goal",
    ],
  })) {
    for (const snippet of snippets) requireSnippet(relativePath, snippet);
  }

  forbidSnippet("docs/decision-map.md", "backend executor");
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
      "export type ClawCapabilitySurfaceStatus = \"available\" | \"blocked\" | \"notApplicable\";",
      "Pending capability surface binding is not allowed",
      "Available capability surface binding requires a ref",
      "approvalRequired",
      "blocked",
      "const customAppSDKRelayMetadataProjection = \"relay.remote.custom_app_sdk metadata-only contract projection\";",
      "@clawjs/claw:capabilities metadata + claw.search.query.v1 schema",
      "@clawjs/claw:capabilities metadata + claw.db.query.v1 schema",
      "@clawjs/claw:capabilities metadata + claw.actions.invoke.v1 schema",
      "@clawjs/claw:capabilities metadata + claw.mac.actionRequest.v1 schema",
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
    "packages/clawjs-runtime/src/app.ts": [
      "runtime/jobs/start",
      "runtime/jobs/:id/cancel",
      "runtime/jobs/events",
      "startRuntimeJob",
    ],
    "packages/clawjs-runtime/src/client.ts": [
      "startJob(input: RuntimeJobStartInput)",
      "cancelJob(id: string",
      "listJobEvents",
      "listEventsForJob",
    ],
    "packages/clawjs-runtime/src/store.ts": [
      "runtime_job_events",
      "recordJobEvent",
      "cancelJob",
      "listJobEvents",
    ],
    "packages/clawjs-runtime/src/types.ts": [
      "RuntimeJobStartInput",
      "RuntimeJobCancelResult",
      "RuntimeJobEventRecord",
      "\"cancelled\"",
    ],
    "packages/clawjs-runtime/README.md": [
      "GET /v1/runtime/jobs/events",
      "POST /v1/runtime/jobs/start",
      "POST /v1/runtime/jobs/:id/cancel",
      "Custom-app execution through",
    ],
  })) {
    for (const snippet of snippets) requireSnippet(relativePath, snippet);
  }
  forbidSnippet("packages/clawjs-core/src/capability-catalog.ts", "claw runtime jobs --json");
  forbidSnippet("packages/clawjs-core/src/capability-fiches.ts", "claw runtime jobs --json");
  forbidSnippet("packages/clawjs-core/src/capability-catalog.ts", 'mode: capability.customAppAccess === "blocked" ? "blocked" : "unknown"');
  forbidSnippet("packages/clawjs-core/src/capability-catalog.ts", 'reason: "No custom-app dispatcher is registered for this capability."');
  requireSnippet("packages/clawjs-core/src/capability-catalog.ts", '"unclassifiedBlocked"');
  requireSnippet(
    "packages/clawjs-core/src/capability-catalog.ts",
    "has not been classified for custom-app dispatch",
  );
  assertNoPendingCapabilitySurfaceBindings();
  for (const snippet of [
    "future search facade",
    "future db facade",
    "future actions facade",
    "future mac facade",
    "remote-safe when classified",
    "remote-safe only when classified",
    "local-only unless explicitly classified",
    "MCP tools when policy grants allow",
  ]) {
    forbidSnippet("packages/clawjs-core/src/capability-catalog.ts", snippet);
  }
}

function assertTests() {
  for (const [relativePath, snippets] of Object.entries({
    "packages/clawjs-core/src/capability-catalog.test.ts": [
      "EXPECTED_CUSTOM_APP_CAPABILITY_IDS",
      "EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS",
      "EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS",
      "EXPECTED_CLI_BLOCKED_CAPABILITY_IDS",
      "EXPECTED_LOCAL_WIDE_DISPATCH_CAPABILITY_IDS",
      "EXPECTED_APPROVAL_DISPATCH_CAPABILITY_IDS",
      "EXPECTED_NO_PLAINTEXT_BROKER_DISPATCH_CAPABILITY_IDS",
      "EXPECTED_MCP_METADATA_PROJECTION_CAPABILITY_IDS",
      "EXPECTED_RELAY_METADATA_PROJECTION_CAPABILITY_IDS",
      "assert.deepEqual(ids, EXPECTED_CUSTOM_APP_CAPABILITY_IDS)",
      "assert.deepEqual(sorted(riskMap.ordinaryAccess), EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS)",
      "assert.deepEqual(sorted(payload.riskMap.highRisk), EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS)",
      "registered custom-app dispatch modes preserve reviewed partitions",
      "assert.deepEqual(idsForDispatchMode(\"approvalRequiredDispatch\"), EXPECTED_APPROVAL_DISPATCH_CAPABILITY_IDS)",
      "published capability surfaces preserve reviewed blocked and metadata-only partitions",
      "idsForSurfaceRef(\"relay\", \"relay.remote.custom_app_sdk metadata-only contract projection\")",
      "available SDK surface bindings do not advertise future facades",
      "available surface refs are concrete rather than conditional placeholders",
      "conditionalRefPattern",
      "registered custom-app dispatch modes are explicit",
      "assert.notEqual(capability.dispatch.mode, \"unknown\"",
      "custom-app SDK inspection payload has no missing schema refs",
      "custom-app SDK inspection payload exposes dispatch availability and gaps",
      "custom-app SDK inspection payload exposes complete resolved surfaces",
      "assert.equal(Boolean(surface.ref), true",
      "assert.equal(surface.ref, undefined",
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
      "custom-app Relay coverage is metadata-only for local host execution",
      "relay.remote.custom_app_sdk metadata-only contract projection",
    ],
    "runtime/tests/e2e/runtime.e2e.test.ts": [
      "jobs start, events, detail, and cancel contracts round-trip through runtime API",
      "ctx.runtimeClient.startJob",
      "ctx.runtimeClient.listEventsForJob",
      "ctx.runtimeClient.cancelJob",
    ],
    "packages/clawjs/src/inspect-cli.test.ts": [
      "runCli exposes custom app SDK read contracts through inspect",
      "custom-app-sdk",
      "payload.executionBoundary.executesCapabilityCalls",
      "assertCompleteResolvedSurfaces(payload.capabilities)",
    ],
    "packages/clawjs-mcp/src/custom-app-sdk-contract.test.ts": [
      "MCP custom app SDK contract boundary",
      "clawjs.custom_app_sdk",
      "payload.executionBoundary.executesCapabilityCalls",
      "assertCompleteResolvedSurfaces(payload.capabilities)",
      "assertCompleteResolvedSurfaces(rpc.json().result.content.capabilities)",
    ],
    "runtime/tests/e2e/runtime.e2e.test.ts": [
      "runtime service API exposes custom app SDK contracts as read-only metadata",
      "runtime custom app SDK contract route does not execute DB or Search calls",
      "contracts/custom-app-sdk",
      "assertCompleteResolvedSurfaces(payload.capabilities)",
    ],
    "relay/src/server/remote-sync-routes.test.ts": [
      "relay exposes custom app SDK dispatch metadata as remote-safe contract projection",
      "/v1/remote/custom-app-sdk",
      "relay.remote.custom_app_sdk",
      "assertCompleteResolvedSurfaces(payload.capabilities)",
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

  const externalEvidenceSelfTest = spawnSync(
    process.execPath,
    ["scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs", "--self-test"],
    { cwd: siblingRoot, encoding: "utf8" },
  );
  if (externalEvidenceSelfTest.status !== 0) {
    fail(`clawix:scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs --self-test failed:\n${externalEvidenceSelfTest.stderr || externalEvidenceSelfTest.stdout}`);
  }

  const appSurfaceTestText = [
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceCapabilityTests.swift",
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceCapabilityCatalogTests.swift",
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceResourceQueryTests.swift",
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceSDKBridgeTests.swift",
    "macos/Tests/ClawixMeshTests/AppCustomSurfaceTrustPolicyTests.swift",
    "macos/Tests/ClawixMeshTests/AppHighRiskActionDispatcherTests.swift",
    "macos/Tests/ClawixMeshTests/AppSwiftSurfaceActionBridgeTests.swift",
    "macos/Tests/ClawixMeshTests/AppSwiftSurfaceContractTests.swift",
    "macos/Tests/ClawixMeshTests/AppVariantDefaultsTests.swift",
  ].map((relativePath) => fs.readFileSync(path.join(siblingRoot, relativePath), "utf8")).join("\n");
  for (const snippet of [
    "testHostBridgeExposesCustomAppSDKContractPayload",
    "testHostBridgeSurfaceBindingsAreCompleteAndResolvedWhenPublished",
    "XCTAssertEqual(checkedSurfaceGroups, capabilities.count)",
    "XCTAssertNotNil(surface[\"ref\"]",
    "XCTAssertNil(jobsListSurfaces.first { $0[\"surface\"] == \"cli\" }?[\"ref\"])",
    "XCTAssertEqual(jobsListSurfaces.first { $0[\"surface\"] == \"sdk\" }?[\"ref\"], \"window.clawix.jobs.list\")",
    "expectedCustomAppCapabilityIds",
    "expectedOrdinaryAccessCapabilityIds",
    "expectedApprovalRequiredCapabilityIds",
    "expectedCliBlockedSurfaceCapabilityIds",
    "expectedMcpBlockedSurfaceCapabilityIds",
    "expectedApprovalDispatchCapabilityIds",
    "expectedNoPlaintextBrokerDispatchCapabilityIds",
    "XCTAssertEqual(AppCapabilityCatalog.descriptors.map(\\.id).sorted(), expectedCustomAppCapabilityIds)",
    "XCTAssertEqual(riskMap.highRisk.sorted(), expectedApprovalRequiredCapabilityIds)",
    "testDispatchModesKeepReviewedPartitions",
    "XCTAssertEqual(approvalDispatch.sorted(), expectedApprovalDispatchCapabilityIds)",
    "testSurfaceBindingsKeepReviewedBlockedPartitions",
    "XCTAssertEqual(cliBlocked.sorted(), expectedCliBlockedSurfaceCapabilityIds)",
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
    "testBridgeOperationPolicyKeepsReviewedAllowlistExact",
    "XCTAssertEqual(AppBridgeOperationPolicy.allowedOperations, expectedOperations)",
    "db.schema.create",
    "testProtectedRouteTargetSetIsExactAndVariantOnly",
    "testOriginClassesAndActivationReviewPolicyStayExact",
    "reviewedOriginClasses",
    "\"localUserAuthored\"",
    "\"marketplace\"",
    "AppCapabilityCatalog.protectedRouteTargets",
    "\"native-permissions\"",
    "\"chat-core\"",
    "testSwiftSurfaceRunnerSupervisorRejectsInProcessPlans",
    "testSystemTelemetryBridgeValuesMatchSdkContracts",
    "Signature key",
    "Trust source",
  ]) {
    assert(appSurfaceTestText.includes(snippet), `clawix:macos/Tests/ClawixMeshTests/AppCustomSurface*Tests.swift: missing ${JSON.stringify(snippet)}`);
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
      "docs/sdk-first-custom-surfaces-performance-closure-summary.md",
      "docs/governance/sdk-first-custom-surfaces/external-pending.md",
      "scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs",
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
      "\"mode\": \"unclassifiedBlocked\"",
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
      "static let canonicalSurfaceNames",
      "static func surfaceBindingsBridgeValue(for descriptor",
      "private static func surfaceRef(for descriptor",
      "window.clawix.jobs.list",
      "mcp.custom_app_sdk metadata-only contract projection",
      "relay.remote.custom_app_sdk metadata-only contract projection",
      "statuses[\"cli\"] = \"blocked\"",
      "statuses[\"mcp\"] = \"blocked\"",
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
    "macos/Tests/ClawixMeshTests/AppsStoreCancellationTests.swift": [
      "testImportAppVerifiesSignedPackageDigestWithHostTrustPolicy",
      "AppPackageTrustPolicy.defaultURL",
      "signatureTrustSource",
    ],
    "macos/Tests/ClawixMeshTests/SurfaceShellPerformanceTests.swift": [
      "testCriticalShellStartFastPathStaysBoundedWithAllHeavyDependenciesUnavailable",
      "testExtensionSurfaceStartMeasurementRemainsRouteLocalUnderUnavailableDependencies",
    ],
    "macos/Tests/ClawixMeshTests/SurfaceRouteDescriptorTests.swift": [
      "testCoreSurvivalRouteSetIsExactAndDependencyFree",
      "reviewedCoreSurvivalRouteIds",
      "chat:00000000-0000-0000-0000-000000000001",
      "reviewedHeavySurfaceDependencies",
      "SurfaceShellIsolationPolicy.criticalShellDependencies(for: descriptor)",
    ],
    "macos/Tests/ClawixMeshTests/SurfaceRouteSupervisorTests.swift": [
      "testSurfaceLifecycleStateAndReportSetsAreExact",
      "reviewedSurfaceLifecycleStateKinds",
      "\"partial\"",
      "\"unavailable\"",
      "SurfaceRouteSupervisor",
      "cancel",
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
      "`macos/artifacts/traces/20260520T122426Z-installed-shell-time-profiler.trace`",
      "`macos/artifacts/traces/20260520T123248Z-installed-launch-time-profiler.trace`",
      "`macos/artifacts/traces/20260520T161127Z-clean-rescue-delayed-heavy-time-profiler.trace`",
      "`macos/artifacts/traces/20260520T183831Z-liveness-rescue-delayed-heavy-time-profiler.trace`",
      "`macos/artifacts/traces/20260520T184057Z-allprocess-rescue-delayed-heavy-time-profiler.trace`",
      "`codex-delayed-heavy-surface` under the framework apps directory",
      "The installed app launched under Instruments for a 30 second Time Profiler",
      "A local Web custom app route opened through the sidebar.",
      "A local Swift declarative app route opened through the sidebar.",
      "A focused rescue route was opened through `clawix://rescue`",
      "The local `codex-delayed-heavy-surface` Web app was opened from the sidebar",
      "A host-only liveness rerun repeated the rescue and delayed-heavy route",
      "A final all-process Time Profiler rerun repeated the same route",
      "The delayed-heavy fixture produced the expected route-local unavailable",
      "installed Clawix process was still alive after",
      "WebContent samples in WebCore/JSC `performance.now`",
      "WebKit GPU remote graphics work",
      "first rescue plus delayed-heavy capture did not leave enough evidence",
      "Later host-liveness and all-process reruns did confirm post-capture app",
      "approved performance baseline",
      "all-process trace includes unrelated local process metadata",
      "`CLX-SDK-008` remains `EXTERNAL PENDING`",
    ],
    "docs/sdk-first-custom-surfaces-performance-closure-summary.md": [
      "Status: `external_pending_baseline`",
      "This is the reviewable public closure summary for the `CLX-SDK-008`",
      "## Required Flow Coverage",
      "Installed app launch",
      "Sidebar interaction",
      "Chat basics",
      "Rescue path",
      "Web custom surface load",
      "Swift custom surface load",
      "Host liveness",
      "Failure-domain attribution",
      "Confirmed:",
      "Probable:",
      "Discarded for this scenario:",
      "Partial:",
      "approved baseline bundle",
      "`CLX-SDK-008` remains `EXTERNAL PENDING`",
    ],
    "docs/governance/sdk-first-custom-surfaces/external-pending.md": [
      "Status: `active_goal_not_complete`",
      "Rows marked `EXTERNAL PENDING` are blockers",
      "CLX-SDK-EXT-001",
      "Signed-host/native high-risk execution from custom apps",
      "CLX-SDK-EXT-002",
      "Live IoT/provider action execution from custom apps",
      "CLX-SDK-EXT-003",
      "Approved signed-app performance baseline",
      "CLX-SDK-EXT-004",
      "Live marketplace trust validation",
    ],
    "docs/governance/sdk-first-custom-surfaces/external-validation-runbook.md": [
      "CLX-SDK-EXT-001 signed-host/native execution",
      "CLX-SDK-EXT-002 live IoT/provider action",
      "CLX-SDK-EXT-003 approved performance baseline",
      "CLX-SDK-EXT-004 live marketplace trust",
      "Required Critical Performance Flows",
    ],
    "docs/governance/sdk-first-custom-surfaces/external-evidence.schema.json": [
      "\"title\": \"Clawix SDK-first custom surfaces external evidence packet\"",
      "\"CLX-SDK-EXT-001\"",
      "\"CLX-SDK-EXT-002\"",
      "\"CLX-SDK-EXT-003\"",
      "\"CLX-SDK-EXT-004\"",
      "\"containsRawTrace\"",
    ],
    "docs/governance/sdk-first-custom-surfaces/external-evidence.fixtures.json": [
      "\"status\": \"synthetic_templates_not_evidence\"",
      "\"validSyntheticPackets\"",
      "\"invalidSyntheticPackets\"",
      "\"rejects performance baseline missing required flow\"",
    ],
    "scripts/validate-sdk-first-custom-surfaces-external-evidence.mjs": [
      "requiredFlows",
      "CLX-SDK-EXT-001",
      "CLX-SDK-EXT-002",
      "CLX-SDK-EXT-003",
      "CLX-SDK-EXT-004",
      "--self-test",
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

  const siblingCatalog = readFrom(siblingRoot, "macos/Sources/Clawix/Apps/AppCapabilityCatalog.swift");
  assert(!siblingCatalog.includes('"mode": "unknown"'), 'clawix:macos/Sources/Clawix/Apps/AppCapabilityCatalog.swift must not contain "\"mode\": \"unknown\""');
  assert(
    !siblingCatalog.includes('"reason": "No custom-app dispatcher is registered for this capability."'),
    "clawix:macos/Sources/Clawix/Apps/AppCapabilityCatalog.swift must not contain stale unclassified dispatch reason",
  );
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
