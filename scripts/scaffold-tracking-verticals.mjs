#!/usr/bin/env node
// Generates the package skeleton and top-level service directory for every
// vertical declared in tracking-registry.json. Idempotent: existing files
// with hand-written content are NOT overwritten unless --force is passed.
//
// Layout per vertical id "<id>":
//
//   packages/clawjs-<id>/
//     package.json
//     tsconfig.json
//     src/
//       index.ts
//       catalog.json     (seed; user can replace by hand later)
//       app.ts
//       client.ts
//       config.ts
//
//   <id>/
//     package.json
//     tsconfig.json
//     src/bin/server.ts
//     src/bin/cli.ts
//     tests/e2e/<id>.e2e.test.ts
//
// The package re-exports @clawjs/tracking-runtime helpers and ships its own
// catalog.json. The runtime contains every Fastify route, every CRUD path,
// every healthkit anchor handler — the per-vertical package is intentionally
// thin so that the 80 modules stay in sync.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(ROOT, "tracking-registry.json");

const force = process.argv.includes("--force");

function writeIfMissing(filePath, content) {
  const exists = fs.existsSync(filePath);
  if (exists && !force) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

function camelize(id) {
  return id
    .split("-")
    .map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1)))
    .join("");
}

function pascalize(id) {
  return id
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
}

function envPrefix(id) {
  return id.toUpperCase().replace(/-/g, "_");
}

function packageJsonForLib(entry) {
  return JSON.stringify(
    {
      name: entry.packageName,
      version: "0.1.0",
      description: entry.description,
      type: "module",
      license: "MIT",
      author: { name: "Iván González Dávila", url: "https://github.com/ivangdavila" },
      homepage: "https://github.com/clawic/clawjs",
      repository: { type: "git", url: "git+https://github.com/clawic/clawjs.git" },
      bugs: { url: "https://github.com/clawic/clawjs/issues" },
      publishConfig: { access: "public" },
      engines: { node: ">=20" },
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
        "./catalog.json": "./src/catalog.json",
      },
      files: ["dist", "src/catalog.json", "README.md", "LICENSE"],
      scripts: {
        build: "tsup src/index.ts --format esm --dts --out-dir dist --clean --target node20",
      },
      dependencies: {
        "@clawjs/tracking-core": "*",
        "@clawjs/tracking-runtime": "*",
        fastify: "^5.6.1",
        "better-sqlite3": "^12.9.0",
      },
    },
    null,
    2,
  ) + "\n";
}

function tsconfig() {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "nodenext",
          moduleResolution: "nodenext",
          lib: ["esnext"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n"
  );
}

function catalogJson(entry) {
  return (
    JSON.stringify(
      {
        domain: entry.id,
        version: "0.1.0",
        entries: defaultCatalogFor(entry),
      },
      null,
      2,
    ) + "\n"
  );
}

function defaultCatalogFor(entry) {
  // Each vertical ships at least one variable so the UI has something to
  // render out of the box. Curated catalogs replace this when each vertical
  // graduates from "planned" to "alpha".
  const base = [
    {
      id: `${entry.id}.note`,
      label: `${entry.label} — free-form note`,
      unit: { id: "text", label: "text", group: "abstract" },
      valueType: "text",
      category: "general",
      description: `Free-form text observation for ${entry.label}.`,
    },
  ];
  return base;
}

function appTs(entry) {
return `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTrackingApp,
  catalogJsonToEntries,
  loadCatalogJson,
  type BuildTrackingAppOptions,
} from "@clawjs/tracking-runtime";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_CATALOG_PATH = path.resolve(__dirname, "catalog.json");
const SOURCE_CATALOG_PATH = path.resolve(__dirname, "../src/catalog.json");
const CATALOG_PATH = fs.existsSync(DIST_CATALOG_PATH) ? DIST_CATALOG_PATH : SOURCE_CATALOG_PATH;

export const DOMAIN = "${entry.id}" as const;
export const DEFAULT_PORT = ${entry.servicePort};
export const HAS_SESSIONS = ${entry.hasSessions ? "true" : "false"};
export const ENV_PREFIX = "${envPrefix(entry.id)}";

export interface Build${pascalize(entry.id)}AppOptions {
  configOverrides?: BuildTrackingAppOptions["configOverrides"];
}

export function build${pascalize(entry.id)}App(options: Build${pascalize(entry.id)}AppOptions = {}) {
  const catalog = loadCatalogJson(CATALOG_PATH);
  return buildTrackingApp({
    domain: DOMAIN,
    defaultPort: DEFAULT_PORT,
    hasSessions: HAS_SESSIONS,
    envPrefix: ENV_PREFIX,
    configOverrides: options.configOverrides,
    seedCatalog: catalogJsonToEntries(catalog),
  });
}
`;
}

function clientTs(entry) {
  return `import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ${pascalize(entry.id)}ClientOptions = Omit<TrackingClientOptions, "domain">;

export class ${pascalize(entry.id)}Client extends TrackingApiClient {
  constructor(options: ${pascalize(entry.id)}ClientOptions) {
    super({ ...options, domain: "${entry.id}" });
  }
}
`;
}

function configTs(entry) {
  return `import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function load${pascalize(entry.id)}Config(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "${entry.id}",
    defaultPort: ${entry.servicePort},
    hasSessions: ${entry.hasSessions ? "true" : "false"},
    envPrefix: "${envPrefix(entry.id)}",
    overrides,
  });
}
`;
}

function indexTs(entry) {
  return `export * from "./app.ts";
export * from "./client.ts";
export * from "./config.ts";
export { default as catalogJson } from "./catalog.json" with { type: "json" };
`;
}

function servicePackageJson(entry) {
  return (
    JSON.stringify(
      {
        name: `clawjs-${entry.id}`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "tsx watch src/bin/server.ts",
          build:
            "tsup src/bin/server.ts src/bin/cli.ts --format esm --target node20 --out-dir dist --clean",
          start: "node dist/server.js",
          cli: "node dist/cli.js",
          test: `node --import tsx --test tests/e2e/${entry.id}.e2e.test.ts`,
        },
        dependencies: {
          [entry.packageName]: `file:../packages/clawjs-${entry.id}`,
          "@clawjs/tracking-core": "file:../packages/clawjs-tracking-core",
          "@clawjs/tracking-runtime": "file:../packages/clawjs-tracking-runtime",
          "better-sqlite3": "^12.9.0",
          fastify: "^5.6.1",
        },
        devDependencies: {
          "@types/node": "^22.19.15",
          tsup: "^8.5.1",
          tsx: "^4.20.6",
          typescript: "^5.9.3",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function serviceTsconfig() {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "nodenext",
          moduleResolution: "nodenext",
          lib: ["esnext"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
        },
        include: ["src/**/*.ts", "tests/**/*.ts"],
      },
      null,
      2,
    ) + "\n"
  );
}

function serverTs(entry) {
  return `import { build${pascalize(entry.id)}App } from "${entry.packageName}";

const { app, config } = build${pascalize(entry.id)}App();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(\`${entry.id} service listening on http://\${host}:\${port}\\n\`);
  })
  .catch((error) => {
    process.stderr.write(\`${entry.id} service failed to start: \${(error as Error).message}\\n\`);
    process.exit(1);
  });
`;
}

function cliTs(entry) {
  return `import { ${pascalize(entry.id)}Client, load${pascalize(entry.id)}Config } from "${entry.packageName}";

async function main(): Promise<void> {
  const config = load${pascalize(entry.id)}Config();
  const client = new ${pascalize(entry.id)}Client({
    baseUrl: \`http://\${config.host}:\${config.port}\`,
    token: config.sharedSecret,
  });
  const subcommand = process.argv[2];
  switch (subcommand) {
    case "catalog": {
      const items = await client.catalog();
      process.stdout.write(JSON.stringify(items, null, 2) + "\\n");
      return;
    }
    case "observations": {
      const items = await client.listObservations();
      process.stdout.write(JSON.stringify(items, null, 2) + "\\n");
      return;
    }
    case "health":
    default: {
      const health = await client.health();
      process.stdout.write(JSON.stringify(health, null, 2) + "\\n");
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(\`${entry.id} cli error: \${(error as Error).message}\\n\`);
  process.exit(1);
});
`;
}

function e2eTest(entry) {
  return `import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { build${pascalize(entry.id)}App, ${pascalize(entry.id)}Client } from "${entry.packageName}";

test("${entry.id} CRUD smoke", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "${entry.id}-e2e-"));
  const dbPath = path.join(tmpDir, "${entry.id}.sqlite");
  const sharedSecret = "test-secret";

  const { app, config } = build${pascalize(entry.id)}App({
    configOverrides: {
      dataDir: tmpDir,
      dbPath,
      sharedSecret,
      host: "127.0.0.1",
      port: 0,
    },
  });

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const baseUrl = address;
    const client = new ${pascalize(entry.id)}Client({ baseUrl, token: sharedSecret });

    const health = await client.health();
    assert.equal(health.ok, true);
    assert.equal(health.service, "${entry.id}");

    const catalog = await client.catalog();
    assert.ok(catalog.items.length >= 1, "catalog must seed at least one entry");

    const variable = catalog.items[0];
    const observation = await client.upsertObservation({
      variableId: variable.id,
      value: variable.valueType === "numeric" ? 42 : variable.valueType === "boolean" ? true : "hello",
      recordedAt: Date.now(),
      source: "manual",
    });
    assert.ok(observation.id);

    const list = await client.listObservations({ variableId: variable.id });
    assert.equal(list.items.length, 1);

    const deleted = await client.deleteObservation(observation.id);
    assert.equal(deleted.deleted, true);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
`;
}

function readme(entry) {
  return `# ${entry.packageName}

${entry.description}

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (\`src/catalog.json\`) with curated variables for ${entry.label}.
- A Fastify factory \`build${pascalize(entry.id)}App\` backed by SQLite.
- A typed HTTP client \`${pascalize(entry.id)}Client\` for consumers.

The runtime, schema, and HTTP routes live in \`@clawjs/tracking-runtime\`; this
package is intentionally thin so all 80 verticals share the same shape.
`;
}

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

let created = 0;
let skipped = 0;

for (const entry of registry.entries) {
  const pkgDir = path.join(ROOT, "packages", `clawjs-${entry.id}`);
  const svcDir = path.join(ROOT, entry.id);

  const files = [
    [path.join(pkgDir, "package.json"), packageJsonForLib(entry)],
    [path.join(pkgDir, "tsconfig.json"), tsconfig()],
    [path.join(pkgDir, "README.md"), readme(entry)],
    [path.join(pkgDir, "src", "index.ts"), indexTs(entry)],
    [path.join(pkgDir, "src", "app.ts"), appTs(entry)],
    [path.join(pkgDir, "src", "client.ts"), clientTs(entry)],
    [path.join(pkgDir, "src", "config.ts"), configTs(entry)],
    [path.join(pkgDir, "src", "catalog.json"), catalogJson(entry)],
    [path.join(svcDir, "package.json"), servicePackageJson(entry)],
    [path.join(svcDir, "tsconfig.json"), serviceTsconfig()],
    [path.join(svcDir, "src", "bin", "server.ts"), serverTs(entry)],
    [path.join(svcDir, "src", "bin", "cli.ts"), cliTs(entry)],
    [path.join(svcDir, "tests", "e2e", `${entry.id}.e2e.test.ts`), e2eTest(entry)],
  ];

  for (const [filePath, content] of files) {
    if (writeIfMissing(filePath, content)) created += 1;
    else skipped += 1;
  }
}

process.stdout.write(`scaffold-tracking-verticals: created ${created}, skipped ${skipped}\n`);
