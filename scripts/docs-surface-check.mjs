import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const surfaceContract = JSON.parse(
  fs.readFileSync(path.join(rootDir, "docs", "surface-contract.registry.json"), "utf8"),
);

const docRoots = [
  path.join(rootDir, "README.md"),
  path.join(rootDir, "docs"),
];

const publicDocPages = [
  "index.md",
  "getting-started.md",
  "terminology.md",
  "runtime.md",
  "workspace.md",
  "authentication.md",
  "relay.md",
  "vault.md",
  "database.md",
  "audio.md",
  "time.md",
  "content.md",
  "notify.md",
  "iot.md",
  "drive.md",
  "execution.md",
  "delegation.md",
  "models.md",
  "sessions.md",
  "files.md",
  "watchers.md",
  "diagnostics.md",
  "cli.md",
  "api.md",
  "surface.md",
  "interface-matrix.md",
  "plugins.md",
];

const forbiddenPatterns = [
  {
    label: "absolute local workspace path",
    pattern: /(?:\/Users\/(?!user\b)[^/\s"'`]+\/[^\s"'`]+|\/home\/(?!user\b)[^/\s"'`]+\/[^\s"'`]+|[A-Za-z]:\\Users\\(?!user\b)[^\s"'`]+)/g,
  },
  {
    label: "SDK imported from clawjs package",
    pattern: /import\s*\{\s*createClaw\s*\}\s*from\s*"clawjs"/g,
  },
  {
    label: "CLI docs using repo-local package path",
    pattern: /node\s+packages\/clawjs\/bin\/clawjs\.mjs/g,
  },
  {
    label: "stale files API registerBinding example",
    pattern: /\bclaw\.files\.registerBinding\b/g,
  },
  {
    label: "stale watcher emit example on claw.watch",
    pattern: /\bclaw\.watch\.emit\b/g,
  },
  {
    label: "stale watcher iterate example on claw.watch",
    pattern: /\bclaw\.watch\.iterate\b/g,
  },
  {
    label: "stale watcher runtimeStatus example",
    pattern: /\bclaw\.watch\.watchRuntimeStatus\b/g,
  },
  {
    label: "stale watcher providerStatus example",
    pattern: /\bclaw\.watch\.watchProviderStatus\b/g,
  },
  {
    label: "stale conversations namespace example",
    pattern: /\bclaw\.conversations\./g,
  },
  {
    label: "stale FileSyncConflictError example",
    pattern: /\bFileSyncConflictError\b/g,
  },
];

const requiredSnippets = [
  {
    file: path.join(rootDir, "docs", "api.md"),
    snippets: [
      "claw.telegram",
      "claw.secrets",
      "claw.inference",
      "claw.content",
      "claw.notify",
      "claw.data",
      "claw.orchestration",
      "claw.providers",
      "eventsIterator",
    ],
  },
  {
    file: path.join(rootDir, "docs", "cli.md"),
    snippets: [
      "files apply-template-pack",
      "telegram webhook set",
      "telegram polling start",
      "sessions generate-title",
      "documents upload",
      "providers auth-state",
      "inference generate-text",
      "tts synthesize",
      "workspace repair",
      "channels status",
      "browser status",
      "content serve",
      "notify send",
      "erp serve",
      "iot serve",
    ],
  },
  {
    file: path.join(rootDir, "docs", "files.md"),
    snippets: [
      "writeWorkspaceFilePreservingManagedBlocks",
      "updateSettings",
      "managedBlockMarkers",
      "previewManagedBlockMutation",
    ],
  },
  {
    file: path.join(rootDir, "docs", "watchers.md"),
    snippets: [
      "claw.watch.runtimeStatus",
      "claw.watch.providerStatus",
      "ClawEventBus",
      "watchPolledValue",
      "eventsIterator",
    ],
  },
  {
    file: path.join(rootDir, "docs", "interface-matrix.md"),
    snippets: [
      "Surface Parity Matrix",
      "Human UI",
      "Service API",
      "MCP",
      "Persistence",
      "SDK core",
      "Relay control plane",
      "stable",
      "local-only",
      "WS/chat/feedback",
      "/v1/me/devices",
      "/v1/pairings/:pairingId/approve",
      "/v1/admin/tenants/:tenantId/workspace-grants",
      "providers auth-state",
      "documents upload",
      "inference generate-text",
      "tts synthesize",
    ],
  },
];

function listFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".vitepress") return [];
    const next = path.join(targetPath, entry.name);
    return entry.isDirectory() ? listFiles(next) : [next];
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractExports(filePath) {
  const raw = read(filePath);
  const start = raw.lastIndexOf("export {");
  if (start === -1) {
    throw new Error(`Missing export block in ${filePath}`);
  }
  const tail = raw.slice(start + "export {".length);
  const end = tail.indexOf("};");
  if (end === -1) {
    throw new Error(`Unterminated export block in ${filePath}`);
  }
  return tail
    .slice(0, end)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, "").replace(/^(.*?)\s+as\s+(.*)$/, "$2"));
}

function extractSurfaceEntries(filePath) {
  return read(filePath)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line));
}

function routeSnippet(route) {
  if (route.path.startsWith("WS/")) {
    return `app.${route.method.toLowerCase()}(\`${"${workspacePrefix}"}/${route.path.slice(3)}\``;
  }
  if (route.path.startsWith("PROJECT/")) {
    return `app.${route.method.toLowerCase()}(\`${"${projectWorkspacePrefix}"}/${route.path.slice(8)}\``;
  }
  return `app.${route.method.toLowerCase()}("${route.path}"`;
}

function relayRouteSnippets(route) {
  const method = route.method.toLowerCase();
  const snippets = [routeSnippet(route)];
  if (route.path.startsWith("/v1/")) {
    snippets.push(`app.${method}(clawApiPath("${route.path.slice("/v1/".length)}")`);
  }
  return snippets;
}

const docFiles = docRoots.flatMap((targetPath) => listFiles(targetPath))
  .filter((filePath) => /\.(md|html)$/.test(filePath));

const violations = [];

for (const page of publicDocPages) {
  const targetPath = path.join(rootDir, "docs", page);
  if (!fs.existsSync(targetPath)) {
    violations.push(`docs site is missing required page ${page}`);
  }
}

for (const filePath of docFiles) {
  const raw = read(filePath);
  for (const rule of forbiddenPatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(raw)) {
      violations.push(`${path.relative(rootDir, filePath)} contains ${rule.label}`);
    }
  }
}

for (const requirement of requiredSnippets) {
  const raw = read(requirement.file);
  for (const snippet of requirement.snippets) {
    if (!raw.includes(snippet)) {
      violations.push(`${path.relative(rootDir, requirement.file)} is missing required snippet ${snippet}`);
    }
  }
}

const apiRaw = read(path.join(rootDir, "docs", "api.md"));
for (const namespace of surfaceContract.sdk.namespaces) {
  if (!apiRaw.includes(`\`${namespace.name}\``)) {
    violations.push(`docs/api.md is missing SDK namespace ${namespace.name}`);
  }
}
for (const namespace of surfaceContract.sdk.workspaceNamespaces) {
  if (!apiRaw.includes(`\`${namespace.name}\``)) {
    violations.push(`docs/api.md is missing workspace namespace ${namespace.name}`);
  }
}

const interfaceMatrixRaw = read(path.join(rootDir, "docs", "interface-matrix.md"));
for (const tier of surfaceContract.taxonomy.tiers) {
  if (!interfaceMatrixRaw.includes(tier)) {
    violations.push(`docs/interface-matrix.md is missing taxonomy tier ${tier}`);
  }
}
for (const marker of surfaceContract.taxonomy.visibility) {
  if (!interfaceMatrixRaw.includes(marker)) {
    violations.push(`docs/interface-matrix.md is missing visibility marker ${marker}`);
  }
}
for (const column of surfaceContract.taxonomy.surfaceParityColumns ?? []) {
  if (!interfaceMatrixRaw.includes(column)) {
    violations.push(`docs/interface-matrix.md is missing surface parity column ${column}`);
  }
}
for (const status of surfaceContract.taxonomy.surfaceParityStatuses ?? []) {
  if (!interfaceMatrixRaw.includes(status)) {
    violations.push(`docs/interface-matrix.md is missing surface parity status ${status}`);
  }
}

const cliSourceDir = path.join(rootDir, "packages", "clawjs", "src");
const cliSourceFiles = fs.readdirSync(cliSourceDir)
  .filter((entry) => /^cli-.*\.ts$/.test(entry))
  .map((entry) => path.join(cliSourceDir, entry));
const cliSourceRaw = [
  read(path.join(cliSourceDir, "index.ts")),
  read(path.join(rootDir, "packages", "clawjs-core", "src", "cli-command-registry.ts")),
  ...cliSourceFiles.map((filePath) => read(filePath)),
].join("\n");
const cliDocRaw = read(path.join(rootDir, "docs", "cli.md"));
function cliSourceHasGroup(groupName) {
  return cliSourceRaw.includes(`group === "${groupName}"`)
    || cliSourceRaw.includes(`name: "${groupName}"`)
    || cliSourceRaw.includes(`"${groupName}":`)
    || cliSourceRaw.includes(`${groupName}:`);
}
for (const group of surfaceContract.cli.groups) {
  if (!cliSourceHasGroup(group.name)) {
    violations.push(`packages/clawjs/src/index.ts is missing CLI group ${group.name}`);
  }
  if (!cliDocRaw.includes(`claw ${group.name}`)) {
    violations.push(`docs/cli.md is missing CLI group ${group.name}`);
  }
  for (const command of group.commands) {
    const snippet = `claw ${group.name} ${command}`;
    if (!cliDocRaw.includes(snippet) && !cliSourceRaw.includes(`"${command}"`)) {
      violations.push(`CLI surface is missing command ${snippet}`);
    }
  }
}

const relaySourceDir = path.join(rootDir, "relay", "src", "server");
const relayRaw = [
  "app.ts",
  "workspace-routes.ts",
  "monitor-routes.ts",
].map((fileName) => {
  const filePath = path.join(relaySourceDir, fileName);
  return fs.existsSync(filePath) ? read(filePath) : "";
}).join("\n");
for (const route of surfaceContract.relay.routes) {
  if (!relayRouteSnippets(route).some((snippet) => relayRaw.includes(snippet))) {
    violations.push(`relay/src/server/app.ts is missing route ${route.method} ${route.path}`);
  }
}
for (const resource of surfaceContract.relay.resources) {
  if (!relayRaw.includes(`{ path: "${resource}"`)) {
    violations.push(`relay/src/server/app.ts is missing relay resource ${resource}`);
  }
}

const surfacePath = path.join(rootDir, "docs", "surface.md");
const surfaceEntries = new Set(extractSurfaceEntries(surfacePath));
const sdkExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-node", "dist", "index.d.ts")));
const coreExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-core", "dist", "index.d.ts")));
const databaseExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-database", "dist", "index.d.ts")));
const audioExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-audio", "dist", "index.d.ts")));
const sessionsExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-sessions", "dist", "index.d.ts")));
const userModelExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-user-model", "dist", "index.d.ts")));
const runtimeExports = new Set(extractExports(path.join(rootDir, "packages", "clawjs-runtime", "dist", "index.d.ts")));
const expectedSurfaceEntries = new Set([...sdkExports, ...coreExports, ...databaseExports, ...audioExports, ...sessionsExports, ...userModelExports, ...runtimeExports]);

for (const exportName of expectedSurfaceEntries) {
  if (!surfaceEntries.has(exportName)) {
    violations.push(`docs/surface.md is missing export ${exportName}`);
  }
}

for (const exportName of surfaceEntries) {
  if (!expectedSurfaceEntries.has(exportName)) {
    violations.push(`docs/surface.md contains stale export ${exportName}`);
  }
}

if (violations.length > 0) {
  console.error("Documentation surface check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Documentation surface check passed for ${docFiles.length} files.`);
