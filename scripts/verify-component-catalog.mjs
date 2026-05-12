#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args.source ?? process.env.CLAWJS_COMPONENTS_SOURCE_DIR ?? "");
const catalogPath = path.resolve(args.catalog ?? process.env.CLAWJS_CONNECTOR_CATALOG_PATH ?? "");
const maxErrors = Number.parseInt(args["max-errors"] ?? "50", 10);

if (!sourceRoot || !fs.existsSync(sourceRoot) || !catalogPath || !fs.existsSync(catalogPath)) {
  console.error("Usage: node scripts/verify-component-catalog.mjs --source <checkout> --catalog <catalog.json>");
  process.exit(1);
}
const componentsDir = path.join(sourceRoot, "components");
if (!fs.existsSync(componentsDir)) throw new Error(`Missing components directory: ${componentsDir}`);

const fieldNames = (fields) => Array.isArray(fields) ? fields.filter(isRecord).map((field) => field.name).filter((name) => typeof name === "string") : [];
const names = (fields) => new Set(fields.map((field) => field.name));
const strings = (values) => Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
const operationSlug = (root, file) => path.relative(root, file).replace(/\.(mjs|js|ts)$/i, "").split(path.sep).filter(Boolean).join("-");
const scrub = (value) => typeof value === "string" ? scrubBrand(value).trim() : value;
const scrubPath = (value) => value.split("/").map(scrub).join("/");
const scrubBrand = (value) => value.replace(new RegExp(String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109), "gi"), "component");
const firstMatch = (source, regex) => regex.exec(source)?.[1];
const readText = (filePath) => fs.readFileSync(filePath, "utf8");

const expected = readExpected(componentsDir);
const catalog = JSON.parse(readText(catalogPath));
const errors = verify(catalog, expected);
const summary = summarize(catalog.apps ?? []);

for (const error of errors.slice(0, maxErrors)) console.error(`FAIL ${error}`);
if (errors.length > maxErrors) console.error(`FAIL ... ${errors.length - maxErrors} additional errors hidden`);
console.error(`apps=${summary.apps} actions=${summary.actions} sources=${summary.sources} fields=${summary.fields} authFields=${summary.authFields}`);
if (errors.length > 0) {
  console.error(`catalog verification failed with ${errors.length} error(s)`);
  process.exit(1);
}
console.error("catalog verification passed");

function readExpected(root) {
  const apps = new Map();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appDir = path.join(root, entry.name);
    const appFile = fs.readdirSync(appDir).find((name) => name.endsWith(".app.mjs") || name.endsWith(".app.js"));
    if (!appFile) continue;
    const source = readText(path.join(appDir, appFile));
    const id = scrub(firstMatch(source, /\bapp:\s*["']([^"']+)["']/) ?? entry.name);
    const fields = readFields(source, id);
    const auth = fields.filter((field) => field.secret).map((field) => field.name);
    const app = { fields: names(fields), auth: new Set(auth), operations: new Map() };
    for (const kind of ["action", "source"]) {
      for (const operation of readExpectedOperations(appDir, id, kind, auth, fields)) app.operations.set(operation.id, operation);
    }
    apps.set(id, app);
  }
  return apps;
}

function readExpectedOperations(appDir, appId, kind, appAuth, appFields) {
  const root = path.join(appDir, kind === "action" ? "actions" : "sources");
  if (!fs.existsSync(root)) return [];
  return listFiles(root)
    .filter((file) => /\.(mjs|js|ts)$/i.test(file))
    .filter((file) => !file.endsWith("test-event.mjs") && !file.includes(`${path.sep}common${path.sep}`))
    .map((file) => {
      const fields = readFields(readText(file), appId, appFields);
      const slug = scrub(operationSlug(root, file));
      return {
        id: `${appId}.${kind}.${slug}`,
        kind,
        fields: names(fields),
        auth: new Set([...appAuth, ...fields.filter((field) => field.secret).map((field) => field.name)]),
        sourcePath: scrubPath(path.relative(path.dirname(appDir), file).replaceAll(path.sep, "/")),
      };
    });
}

function verify(catalog, expectedApps) {
  const errors = [];
  const actualApps = new Map();
  const actualOps = new Map();
  const actualPaths = new Set();
  const forbidden = new RegExp(String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109), "i");
  if (forbidden.test(JSON.stringify(catalog))) errors.push("catalog contains forbidden upstream brand text");

  for (const app of Array.isArray(catalog.apps) ? catalog.apps : []) {
    if (!isRecord(app) || typeof app.id !== "string" || !app.id.trim()) {
      errors.push("catalog has app without a valid id");
      continue;
    }
    if (actualApps.has(app.id)) errors.push(`duplicate app id ${app.id}`);
    actualApps.set(app.id, app);
    findDuplicates(`app ${app.id} fields`, fieldNames(app.fields), errors);
    findDuplicates(`app ${app.id} authFieldNames`, strings(app.authFieldNames), errors);
    for (const operation of Array.isArray(app.operations) ? app.operations : []) {
      if (!isRecord(operation) || typeof operation.id !== "string" || !operation.id.trim()) {
        errors.push(`app ${app.id} has operation without a valid id`);
        continue;
      }
      if (operation.appId !== app.id) errors.push(`operation ${operation.id} points at ${operation.appId}, expected ${app.id}`);
      if (actualOps.has(operation.id)) errors.push(`duplicate operation id ${operation.id}`);
      actualOps.set(operation.id, operation);
      if (typeof operation.sourcePath === "string") actualPaths.add(operation.sourcePath);
      findDuplicates(`operation ${operation.id} fields`, fieldNames(operation.fields), errors);
      findDuplicates(`operation ${operation.id} authFieldNames`, strings(operation.authFieldNames), errors);
    }
  }

  for (const [id, expectedApp] of expectedApps) {
    const app = actualApps.get(id);
    if (!app) {
      errors.push(`missing app ${id}`);
      continue;
    }
    compareSets(`app ${id} fields`, expectedApp.fields, new Set(fieldNames(app.fields)), errors);
    compareSets(`app ${id} auth fields`, expectedApp.auth, new Set(strings(app.authFieldNames)), errors);
    for (const [operationId, expectedOperation] of expectedApp.operations) {
      const operation = actualOps.get(operationId);
      if (!operation) {
        errors.push(`missing ${expectedOperation.kind} ${operationId}`);
        continue;
      }
      compareSets(`operation ${operationId} fields`, expectedOperation.fields, new Set(fieldNames(operation.fields)), errors);
      compareSets(`operation ${operationId} auth fields`, expectedOperation.auth, new Set(strings(operation.authFieldNames)), errors);
      if (operation.sourcePath !== expectedOperation.sourcePath) {
        errors.push(`operation ${operationId} sourcePath ${operation.sourcePath ?? "<missing>"} expected ${expectedOperation.sourcePath}`);
      }
    }
  }

  const expectedOperationIds = new Set([...expectedApps.values()].flatMap((app) => [...app.operations.keys()]));
  const expectedPaths = new Set([...expectedApps.values()].flatMap((app) => [...app.operations.values()].map((op) => op.sourcePath)));
  for (const id of actualApps.keys()) if (!expectedApps.has(id)) errors.push(`extra app ${id}`);
  for (const id of actualOps.keys()) if (!expectedOperationIds.has(id)) errors.push(`extra operation ${id}`);
  for (const sourcePath of actualPaths) if (!expectedPaths.has(sourcePath)) errors.push(`extra sourcePath ${sourcePath}`);
  return errors;
}

function readFields(source, appId, appFields = []) {
  const fields = new Map();
  for (const match of source.matchAll(/import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+["'][^"']+\.app\.mjs["']/g)) {
    const name = scrub(match[1]);
    if (name) fields.set(name, { name, type: "app", optional: false, secret: true });
  }
  const appFieldByName = new Map(appFields.map((field) => [field.name, field]));
  for (const match of source.matchAll(/(?:^|[\n,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*{([^{}]*(?:\btype\b|\blabel\b|\bpropDefinition\b)[^{}]*)}/gs)) {
    const name = scrub(match[1]);
    if (!name || ["props", "propDefinitions", "options"].includes(name)) continue;
    const body = match[2] ?? "";
    const propRef = scrub(firstMatch(body, /\bpropDefinition:\s*\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s));
    const inherited = propRef ? appFieldByName.get(propRef) : null;
    fields.set(name, {
      ...(inherited ?? {}),
      name,
      type: inherited?.type ?? firstMatch(body, /\btype:\s*["']([^"']+)["']/) ?? "string",
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...(inherited?.secret || isSecretField(name, body, appId) ? { secret: true } : {}),
    });
  }
  return [...fields.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isSecretField(name, body, appId) {
  if (body.includes('type: "app"') || body.includes("type: 'app'")) return true;
  const scrubbedBody = scrubBrand(body);
  if (scrubbedBody.includes(`app: "${appId}"`) || scrubbedBody.includes(`app: '${appId}'`)) return true;
  return /token|secret|api[_-]?key|password|credential/i.test(name);
}

function summarize(apps) {
  return apps.reduce((summary, app) => {
    if (!isRecord(app)) return summary;
    summary.apps += 1;
    summary.fields += Array.isArray(app.fields) ? app.fields.length : 0;
    summary.authFields += Array.isArray(app.authFieldNames) ? app.authFieldNames.length : 0;
    for (const operation of Array.isArray(app.operations) ? app.operations : []) {
      if (!isRecord(operation)) continue;
      if (operation.kind === "source") summary.sources += 1;
      else summary.actions += 1;
      summary.fields += Array.isArray(operation.fields) ? operation.fields.length : 0;
      summary.authFields += Array.isArray(operation.authFieldNames) ? operation.authFieldNames.length : 0;
    }
    return summary;
  }, { apps: 0, actions: 0, sources: 0, fields: 0, authFields: 0 });
}

function compareSets(label, expected, actual, errors) {
  for (const value of expected) if (!actual.has(value)) errors.push(`${label} missing ${value}`);
  for (const value of actual) if (!expected.has(value)) errors.push(`${label} extra ${value}`);
}

function findDuplicates(label, values, errors) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} duplicates ${value}`);
    seen.add(value);
  }
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[token.slice(2)] = value;
      index += 1;
    }
  }
  return parsed;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
