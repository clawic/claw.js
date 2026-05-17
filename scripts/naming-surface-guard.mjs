import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const violations = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function fail(message) {
  violations.push(message);
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) {
    fail(`${relativePath} is missing required frozen surface: ${snippet}`);
  }
}

function requireSnippetInAny(relativePaths, snippet, label) {
  if (!relativePaths.some((relativePath) => read(relativePath).includes(snippet))) {
    fail(`${label} is missing required frozen surface: ${snippet}`);
  }
}

function forbidSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (text.includes(snippet)) {
    fail(`${relativePath} contains forbidden stale surface: ${snippet}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

forbidSnippet("packages/clawjs-core/src/surface-registry.ts", "stable compatibility surface");
forbidSnippet("packages/clawjs/src/inspect-cli.test.ts", "stable compatibility surface");
forbidSnippet("docs/adr/0004-persistent-surface-registry-and-inspection.md", "stable compatibility");
forbidSnippet("docs/decision-map.md", "stable compatibility");

for (const relativePath of [
  "apps/host/Sources/CommanderCore/RuntimeInstall.swift",
  "apps/host/Sources/CommanderCore/DaemonLifecycle.swift",
  "apps/host/Sources/CommanderCore/CommandService.swift",
  "apps/host/Sources/CommanderApp/DashboardView.swift",
  "apps/host/Sources/ClawHostDaemon/main.swift",
  "apps/host/Tests/CommanderE2ETests/CommanderE2ETests.swift",
  "packages/clawjs-core/src/surface-registry.ts",
]) {
  forbidSnippet(relativePath, "legacySocket");
  forbidSnippet(relativePath, "LegacySocket");
  forbidSnippet(relativePath, "legacy_socket");
  forbidSnippet(relativePath, "legacy socket");
  forbidSnippet(relativePath, "CLAW_HOST_DISABLE_LEGACY_SOCKET_FALLBACK");
}
forbidSnippet("apps/host/Sources/CommanderApp/DashboardView.swift", "LaunchAgent (legacy)");
forbidSnippet("apps/host/Sources/CommanderApp/DashboardView.swift", "LaunchAgent loaded (legacy)");

const canonicalDocs = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/host-ownership.md",
  "docs/data-storage-boundary.md",
  "docs/workspace.md",
  "docs/setup.md",
  "docs/getting-started.md",
];

const canonicalSources = [
  "packages/clawjs-core/src/storage.ts",
  "packages/clawjs-core/src/host-json-schemas.ts",
  "packages/clawjs-core/src/host-contract-fixtures.ts",
  "packages/clawjs-core/src/surface-registry.ts",
  "packages/clawjs-core/src/index.test.ts",
  "packages/clawjs/src/v1-data.ts",
  "packages/clawjs/src/v1-data-core.ts",
  "packages/clawjs-workspace/src/sqlite-store.ts",
  "packages/clawjs-node/src/create-claw.ts",
  "packages/clawjs-node/src/context/store.ts",
  "packages/clawjs-node/src/apps/store.ts",
  "packages/clawjs-node/src/storage/store.ts",
  "packages/clawjs-node/src/code/index.ts",
  "packages/clawjs-user-model/src/config.ts",
  "packages/clawjs-database/src/config.ts",
  "packages/clawjs-mcp/src/config.ts",
  "packages/clawjs-channel-base/src/index.ts",
  "packages/signals/src/config.ts",
  "packages/clawjs-runtime/src/config.ts",
  "packages/clawjs-sandbox/src/config.ts",
  "packages/clawjs-sessions/src/config.ts",
  "packages/clawjs-index/src/config.ts",
  "packages/clawjs-index/src/app.ts",
  "packages/clawjs-index/src/index.ts",
  "packages/clawjs-audio/src/config.ts",
  "packages/clawjs-voice/src/config.ts",
  "publishing/src/server/config.ts",
  "publishing/src/bin/server.ts",
  "publishing/src/cli/parser.ts",
  "monitor/src/server/config.ts",
  "packages/clawjs/bin/database-server-launcher.mjs",
  "packages/clawjs/bin/secrets-server-launcher.mjs",
  "packages/clawjs/bin/index-server-launcher.mjs",
  "packages/clawjs/bin/audio-server-launcher.mjs",
  "packages/clawjs/bin/sessions-server-launcher.mjs",
  "packages/clawjs/bin/drive-server-launcher.mjs",
  "modules/erp/src/server/config.ts",
  "notify/src/server/config.ts",
  "modules/feed/src/server/config.ts",
  "delegation/src/server/config.ts",
];

for (const relativePath of [...canonicalDocs, ...canonicalSources]) {
  for (const snippet of [
    "~/Library/Application Support/Claw",
    "claw.sqlite",
    "clawjs.sqlite",
    "https://schemas.claw.dev",
    "CLAWIX_BRIDGED",
    "clawix-bridged",
    "BADGER_",
  ]) {
    forbidSnippet(relativePath, snippet);
  }
}

for (const relativePath of [
  "packages/clawjs/templates/plugin/src/index.ts",
  "packages/clawjs/templates/plugin/plugin.json",
  "packages/create-claw-plugin/template/src/index.ts",
  "packages/create-claw-plugin/template/plugin.json",
]) {
  forbidSnippet(relativePath, 'supportLevel: "experimental"');
  forbidSnippet(relativePath, '"supportLevel": "experimental"');
  requireSnippet(relativePath, "dev-only");
}

for (const relativePath of [
  "docs/adr/0001-naming-and-stability-surfaces.md",
  "docs/naming-style-guide.md",
]) {
  forbidSnippet(relativePath, "clawix://pair/<token>");
  forbidSnippet(relativePath, "`mobile`, `desktop`, `web`, or `daemon`");
  requireSnippet(relativePath, "`companion` or `desktop`");
  requireSnippet(relativePath, "Pairing QR codes use a JSON payload");
}

for (const relativePath of [
  "packages/clawjs-core/src/surface-registry.ts",
  "packages/clawjs-node/src/time/index.ts",
  "time/src/server/app.ts",
  "time/tests/e2e/backend.e2e.test.ts",
  "docs/time.md",
]) {
  forbidSnippet(relativePath, "/v1/legacy/events");
  forbidSnippet(relativePath, "/v1/legacy/routines");
  forbidSnippet(relativePath, "legacyEvents");
  forbidSnippet(relativePath, "legacyRoutines");
  forbidSnippet(relativePath, "compatibility projections");
}
requireSnippet("docs/time.md", "v1 calendar and timeline views");

for (const relativePath of [
  "packages/clawjs-node/src/runtime/claw-runtime.ts",
  "packages/clawjs-node/src/runtime/claw-runtime.test.ts",
  "packages/clawjs-node/src/runtime/plugins.ts",
  "packages/clawjs-node/src/runtime/plugins.test.ts",
  "packages/openclaw-plugin/src/index.js",
  "packages/openclaw-plugin/src/index.test.ts",
]) {
  forbidSnippet(relativePath, "legacy alias");
  forbidSnippet(relativePath, "legacy?: boolean");
  forbidSnippet(relativePath, "legacy: true");
  forbidSnippet(relativePath, "contextEngine: \"legacy\"");
  forbidSnippet(relativePath, "select-context:legacy");
}

for (const relativePath of [
  "packages/clawjs/src/database-magic.ts",
  "packages/clawjs/src/index-productivity.test.ts",
  "packages/clawjs/src/index-installed.test.ts",
  "packages/clawjs-core/src/surface-registry.ts",
  "packages/clawjs-node/src/create-claw.test.ts",
  "packages/clawjs-node/src/data-v2-config.test.ts",
  "docs/persistent-surface.md",
]) {
  forbidSnippet(relativePath, "legacy_productivity");
  forbidSnippet(relativePath, "legacy productivity");
  forbidSnippet(relativePath, "Legacy productivity");
}

for (const relativePath of [
  "packages/clawjs-node/src/create-claw.ts",
  "packages/clawjs-node/src/create-claw-options.ts",
  "packages/clawjs-node/src/create-claw-instance.ts",
  "packages/clawjs-node/src/skills-v2/index.ts",
  "packages/clawjs-core/src/skills-v2/types.ts",
  "docs/surface.md",
]) {
  forbidSnippet(relativePath, "migrateLegacyState");
  forbidSnippet(relativePath, "MigrateOptions");
  forbidSnippet(relativePath, ".skills-v2.migrated");
  forbidSnippet(relativePath, "souls.json / library / skills.json");
  forbidSnippet(relativePath, "legacy soul shape");
  forbidSnippet(relativePath, "legacy library compatibility");
}
for (const relativePath of [
  "packages/clawjs-node/src/soul/store.ts",
  "packages/clawjs-node/src/create-claw-instance.ts",
  "packages/clawjs-node/src/library/store.ts",
  "packages/clawjs-node/src/skills/sources.ts",
]) {
  forbidSnippet(relativePath, "migrateLegacySpec");
  forbidSnippet(relativePath, "LegacySpec");
  forbidSnippet(relativePath, "LegacyModule");
  forbidSnippet(relativePath, "compatibility shim");
  forbidSnippet(relativePath, "@deprecated");
}

for (const relativePath of [
  "packages/clawjs-node/src/compat/store.ts",
  "packages/clawjs-node/src/compat/store.test.ts",
]) {
  forbidSnippet(relativePath, "LEGACY_SNAPSHOT_WRAPPER_KEYS");
  forbidSnippet(relativePath, "findLegacySnapshotPayload");
  forbidSnippet(relativePath, "legacyPayload");
  forbidSnippet(relativePath, "normalizedLegacy");
  forbidSnippet(relativePath, "legacyWrapper");
}

for (const relativePath of [
  "docs/signals-modules.md",
]) {
  forbidSnippet(relativePath, "goals-to-signals");
  forbidSnippet(relativePath, "legacy_iot_goal");
  forbidSnippet(relativePath, "iot.sqlite");
  forbidSnippet(relativePath, "migrate-iot-goals");
}

for (const relativePath of [
  "docs/relay.md",
  "relay/tests/e2e/relay.e2e.test.ts",
  "relay/src/connector/runtime.ts",
  "relay/src/connector/observed-store.ts",
]) {
  forbidSnippet(relativePath, "legacy mode");
  forbidSnippet(relativePath, "legacy routes");
  forbidSnippet(relativePath, "legacy enrollment token");
  forbidSnippet(relativePath, "Legacy enrollment token");
  forbidSnippet(relativePath, "Legacy connector enrollment");
  forbidSnippet(relativePath, "legacy `GET` route");
  forbidSnippet(relativePath, "legacy workspace compatibility");
  forbidSnippet(relativePath, "compatibility data under");
  forbidSnippet(relativePath, "compatibility layer");
  forbidSnippet(relativePath, "legacy?: boolean");
  forbidSnippet(relativePath, "legacy: true");
  forbidSnippet(relativePath, "Relay compatibility plugin catalog");
  forbidSnippet(relativePath, "relay-compat");
  forbidSnippet(relativePath, "WorkspaceCompatStore");
  forbidSnippet(relativePath, "text-only for compatibility");
}

for (const relativePath of [
  "docs/getting-started.md",
  "docs/index.md",
  "docs/plugins.md",
  "packages/create-claw-app/README.md",
  "packages/create-claw-agent/README.md",
  "packages/create-claw-server/README.md",
  "packages/create-claw-plugin/README.md",
]) {
  forbidSnippet(relativePath, "compatibility wrapper");
  forbidSnippet(relativePath, "compatibility metadata");
  forbidSnippet(relativePath, "compatibility and packaged surfaces");
  forbidSnippet(relativePath, "compatibility and packaged-surface metadata");
  requireSnippet(relativePath, "generator entrypoint");
}

for (const relativePath of [
  "packages/clawjs/src/index.ts",
  "packages/create-claw-plugin/src/index.ts",
  "packages/create-claw-plugin/template/README.md",
  "packages/clawjs/templates/plugin/README.md",
]) {
  forbidSnippet(relativePath, "compatibility metadata");
  forbidSnippet(relativePath, "compatibility and packaged surfaces");
  forbidSnippet(relativePath, "compatibility and packaged-surface metadata");
}

for (const relativePath of [
  "docs/getting-started.md",
  "docs/adr/0001-naming-and-stability-surfaces.md",
]) {
  forbidSnippet(relativePath, "Experimental adapters");
  forbidSnippet(relativePath, "experimental adapters");
  forbidSnippet(relativePath, "labs/experimental surfaces");
  forbidSnippet(relativePath, "Experimental runtime codenames");
  requireSnippet(relativePath, "dev-only");
}

for (const relativePath of [
  "packages/clawjs/src/index.ts",
  "packages/clawjs/src/index.test.ts",
  "packages/clawjs/src/cli-discovery.test.ts",
]) {
  forbidSnippet(relativePath, "hidden legacy aliases");
  forbidSnippet(relativePath, "legacy V1 CRUD");
  forbidSnippet(relativePath, "removed public legacy");
  forbidSnippet(relativePath, "legacy namespaces");
  forbidSnippet(relativePath, "legacy commands");
  requireSnippet(relativePath, "pre-v1");
}

forbidSnippet("docs/adr/0007-cli-agent-interface.md", "Pre-V1 accidental legacy commands");
forbidSnippet("packages/marketplace/tests/discovery.test.ts", "legacy implementation");
forbidSnippet("packages/clawjs-integrations/src/connection-controller.test.ts", "legacy watchers");
forbidSnippet("packages/clawjs-integrations/src/connection-controller.test.ts", "legacy outbound sends");
forbidSnippet("packages/clawjs-node/src/runtime/claw-runtime.test.ts", "pre-v1 legacy model");

forbidSnippet("packages/clawjs/src/index-data.test.ts", "legacy service tables");
forbidSnippet("packages/clawjs/src/cli-rules-library-skills-command.ts", "readBooleanFlag(argv, flags, \"legacy\"");
forbidSnippet("docs/interface-matrix.md", "claw.skills.list()");
forbidSnippet("docs/interface-matrix.md", "claw.skills.sync()");
forbidSnippet("packages/clawjs/src/v1-data.ts", "skills: new Set([\"list\"");
forbidSnippet("packages/clawjs/src/v1-data-core.ts", "skills list|get|upsert|delete");

for (const relativePath of [
  "packages/clawjs-node/src/generations/store.ts",
  "packages/clawjs-node/src/images/store.ts",
  "packages/clawjs-node/src/skills/sources.ts",
]) {
  forbidSnippet(relativePath, "legacy workspace assets");
  forbidSnippet(relativePath, "legacy image assets");
  forbidSnippet(relativePath, "legacy v1 skill surface");
}

for (const relativePath of [
  "docs/index.md",
  "packages/openclaw-context-engine/package.json",
  "packages/openclaw-context-engine/openclaw.plugin.json",
  "packages/openclaw-context-engine/README.md",
  "packages/openclaw-context-engine/src/index.js",
]) {
  forbidSnippet(relativePath, "Experimental");
  forbidSnippet(relativePath, "experimental");
  requireSnippet(relativePath, "dev-only");
}

for (const relativePath of [
  "publishing/src/server/config.ts",
  "publishing/src/bin/server.ts",
  "publishing/src/cli/parser.ts",
  "packages/clawjs-sessions/src/config.ts",
  "packages/clawjs-index/src/config.ts",
  "packages/clawjs/bin/sessions-server-launcher.mjs",
  "packages/clawjs/bin/index-server-launcher.mjs",
  "packages/clawjs-search-mcp/bin/clawjs-index-mcp.mjs",
  "packages/clawjs/src/index.ts",
]) {
  for (const snippet of ["4640", "7796", "7798", "18273", "18419", "18647", "20347"]) {
    forbidSnippet(relativePath, snippet);
  }
}

for (const relativePath of ["docs/workspace.md", "docs/setup.md", "docs/getting-started.md"]) {
  for (const snippet of [
    ".clawjs/manifest",
    ".clawjs/audit",
    ".clawjs/observed",
    ".clawjs/projections",
    ".clawjs/backups",
    ".clawjs/locks",
    ".clawjs/sessions",
  ]) {
    forbidSnippet(relativePath, snippet);
  }
}

for (const [relativePath, snippets] of Object.entries({
	  "docs/adr/0001-naming-and-stability-surfaces.md": [
	    "Framework/product name: `ClawJS`",
	    "CLI/workspace brand: `claw`",
	    "Global ClawJS home: `~/.claw`",
    "Clawix host/bridge home: `~/.clawix`",
    "SQL tables and columns: `snake_case`",
    "JSON/API/YAML/framework fields: `camelCase`",
    "CLI commands and flags: `kebab-case`",
    "Events use `domain.action`",
	    "`schemaVersion` versions persisted data",
	    "`protocolVersion` versions wire protocols",
	    "`signals` replaces `life` as the technical and public domain",
	    'personal-domain packages outside the `signals` catalog',
	  ],
	  "docs/naming-style-guide.md": [
	    "JSON, API, YAML, and TypeScript framework fields use `camelCase`",
	    "CLI commands and flags use `kebab-case`",
	    "SQL tables, SQL columns, and collection names use `snake_case`",
	    "Events use `domain.action`",
	    "Use `sessionId`, not stable `chatId`",
	    "`signals` is the approved public domain",
	  ],
  "packages/clawjs-core/src/storage.ts": [
    ".claw",
    ".clawix",
    "state",
    "hosts",
    "registry.json",
  ],
  "packages/clawjs-core/src/host-json-schemas.ts": [
    "https://schemas.clawjs.ai/v1/command-request.schema.json",
    "https://schemas.clawjs.ai/v1/host-descriptor.schema.json",
  ],
  "packages/clawjs-core/src/host-contract-fixtures.ts": [
    ".clawix/run/clawix-bridge.sock",
  ],
	  "packages/clawjs-core/src/surface-registry.ts": [
    "runtime: 24100",
    "sessions: 24101",
    "database: 24102",
    "signals: 24110",
    "publishing: 24111",
    "monitor: 24114",
    "showcase.claw.localhost",
    "board.claw.localhost",
    "~/.claw/run",
    "claw-${service}.sock",
    "~/.clawix/run/clawix-bridge.sock",
    'mainDatabase: "core.sqlite"',
	  ],
	  "publishing/src/server/config.ts": [
	    "PUBLISHING_DEFAULT_PORT = 24111",
	    "CLAW_PUBLISHING_PORT",
	    "CLAW_PUBLISHING_DATA_DIR",
	  ],
	  "packages/clawjs-sessions/src/config.ts": [
	    "SESSIONS_DEFAULT_PORT = 24101",
	    "CLAW_SESSIONS_PORT",
	    "CLAW_SESSIONS_DATA_DIR",
	  ],
	  "packages/clawjs-index/src/config.ts": [
	    "SEARCH_DEFAULT_PORT = 24106",
	    "CLAW_SEARCH_PORT",
	    "CLAW_SEARCH_DATA_DIR",
	  ],
	  "monitor/src/server/config.ts": [
	    "MONITOR_DEFAULT_PORT = 24114",
	    "CLAW_MONITOR_PORT",
	    "CLAW_MONITOR_DB_PATH",
	  ],
  "packages/clawjs-workspace/src/sqlite-store.ts": [
    "CLAW_DATA_DIR",
    "CLAW_HOME",
    "CLAW_DB_PATH",
    "core.sqlite",
  ],
})) {
  for (const snippet of snippets) {
    requireSnippet(relativePath, snippet);
  }
}

for (const snippet of [
  "CLAW_DATA_DIR",
  "CLAW_HOME",
  "CLAW_DB_PATH",
  "core.sqlite",
]) {
  requireSnippetInAny([
    "packages/clawjs/src/v1-data.ts",
    "packages/clawjs/src/v1-data-core.ts",
  ], snippet, "packages/clawjs/src/v1-data.ts or packages/clawjs/src/v1-data-core.ts");
}

forbidSnippet("docs/adr/0001-naming-and-stability-surfaces.md", "\n- `signals`\n");
forbidSnippet("docs/naming-style-guide.md", "or `signals` surfaces");

const cliPackage = readJson("packages/clawjs/package.json");
const cliBinKeys = Object.keys(cliPackage.bin ?? {}).sort();
if (JSON.stringify(cliBinKeys) !== JSON.stringify(["claw"])) {
  fail(`packages/clawjs/package.json must expose exactly the public claw bin, found: ${cliBinKeys.join(", ")}`);
}
if (cliPackage.bin?.clawjs) {
  fail("packages/clawjs/package.json must not expose a public clawjs bin");
}

for (const relativePath of ["packages/clawjs/package.json", "packages/clawjs-core/package.json"]) {
  const packageJson = readJson(relativePath);
  if (!String(packageJson.name).startsWith("@clawjs/")) {
    fail(`${relativePath} must use the @clawjs package scope`);
  }
}

if (violations.length > 0) {
  console.error("Naming surface guard failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Naming surface guard passed");
