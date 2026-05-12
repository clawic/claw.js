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
const countDefaults = (fields) => Array.isArray(fields) ? fields.filter((field) => isRecord(field) && field.default !== undefined).length : 0;
const countOptions = (fields) => Array.isArray(fields) ? fields.filter((field) => isRecord(field) && Array.isArray(field.options) && field.options.length > 0).length : 0;
const expected = readExpected(componentsDir);
const catalog = JSON.parse(readText(catalogPath));
const errors = verify(catalog, expected);
const summary = summarize(catalog.apps ?? []);

for (const error of errors.slice(0, maxErrors)) console.error(`FAIL ${error}`);
if (errors.length > maxErrors) console.error(`FAIL ... ${errors.length - maxErrors} additional errors hidden`);
console.error(`apps=${summary.apps} actions=${summary.actions} sources=${summary.sources} fields=${summary.fields} authFields=${summary.authFields} defaults=${summary.defaults} options=${summary.options} annotations=${summary.annotatedOperations} destructive=${summary.destructiveOperations} readOnly=${summary.readOnlyOperations} openWorld=${summary.openWorldOperations} runnable=${summary.runnableOperations} hooks=${summary.hookSources} dedupe=${summary.dedupedSources} dynamicProps=${summary.dynamicPropOperations} methods=${summary.methodOperations}`);
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
    const app = { fields: names(fields), fieldStats: summarizeFields(fields), auth: new Set(auth), operations: new Map() };
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
      const source = readText(file);
      const fields = readFields(source, appId, appFields);
      const slug = scrub(operationSlug(root, file));
      return {
        id: `${appId}.${kind}.${slug}`,
        kind,
        fields: names(fields),
        fieldStats: summarizeFields(fields),
        annotations: readAnnotations(source),
        runtime: readRuntime(source, file),
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
  const actualSummary = summarize(catalog.apps ?? []);
  const expectedSummary = summarizeExpected(expectedApps);
  const forbidden = new RegExp(String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109), "i");
  if (forbidden.test(JSON.stringify(catalog))) errors.push("catalog contains forbidden upstream brand text");
  if (actualSummary.defaults !== expectedSummary.defaults) errors.push(`defaults ${actualSummary.defaults} expected ${expectedSummary.defaults}`);
  if (actualSummary.options !== expectedSummary.options) errors.push(`options ${actualSummary.options} expected ${expectedSummary.options}`);
  if (actualSummary.annotatedOperations !== expectedSummary.annotatedOperations) errors.push(`annotations ${actualSummary.annotatedOperations} expected ${expectedSummary.annotatedOperations}`);
  if (actualSummary.destructiveOperations !== expectedSummary.destructiveOperations) errors.push(`destructive ${actualSummary.destructiveOperations} expected ${expectedSummary.destructiveOperations}`);
  if (actualSummary.readOnlyOperations !== expectedSummary.readOnlyOperations) errors.push(`readOnly ${actualSummary.readOnlyOperations} expected ${expectedSummary.readOnlyOperations}`);
  if (actualSummary.openWorldOperations !== expectedSummary.openWorldOperations) errors.push(`openWorld ${actualSummary.openWorldOperations} expected ${expectedSummary.openWorldOperations}`);
  if (actualSummary.runnableOperations !== expectedSummary.runnableOperations) errors.push(`runnable ${actualSummary.runnableOperations} expected ${expectedSummary.runnableOperations}`);
  if (actualSummary.hookSources !== expectedSummary.hookSources) errors.push(`hookSources ${actualSummary.hookSources} expected ${expectedSummary.hookSources}`);
  if (actualSummary.dedupedSources !== expectedSummary.dedupedSources) errors.push(`dedupedSources ${actualSummary.dedupedSources} expected ${expectedSummary.dedupedSources}`);
  if (actualSummary.dynamicPropOperations !== expectedSummary.dynamicPropOperations) errors.push(`dynamicProps ${actualSummary.dynamicPropOperations} expected ${expectedSummary.dynamicPropOperations}`);
  if (actualSummary.methodOperations !== expectedSummary.methodOperations) errors.push(`methods ${actualSummary.methodOperations} expected ${expectedSummary.methodOperations}`);

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
      compareAnnotations(operationId, expectedOperation.annotations, operation.annotations, errors);
      compareRuntime(operationId, expectedOperation.runtime, operation.runtime, errors);
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
  for (const entry of readFieldEntries(source)) {
    const name = scrub(entry.name);
    if (!name || ["props", "propDefinitions", "options"].includes(name)) continue;
    const body = entry.body;
    const propRef = scrub(firstMatch(readTopLevelValue(body, "propDefinition") ?? "", /\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s));
    const inherited = propRef ? appFieldByName.get(propRef) : null;
    const defaultValue = readDefault(body);
    const options = readOptions(body);
    fields.set(name, {
      ...(inherited ?? {}),
      name,
      type: inherited?.type ?? readTopLevelString(body, "type") ?? "string",
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(options.length ? { options } : {}),
      ...(inherited?.secret || isSecretField(name, body, appId) ? { secret: true } : {}),
    });
  }
  return [...fields.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function readFieldEntries(source) {
  const entries = [];
  for (const match of source.matchAll(/(?:^|[\n,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*{/g)) {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findMatchingBrace(source, bodyStart - 1);
    if (bodyEnd < 0) continue;
    const body = source.slice(bodyStart, bodyEnd);
    if (!/\b(type|label|propDefinition)\b/.test(body)) continue;
    entries.push({ name: match[1], body });
  }
  return entries;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
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
    summary.defaults += countDefaults(app.fields);
    summary.options += countOptions(app.fields);
    for (const operation of Array.isArray(app.operations) ? app.operations : []) {
      if (!isRecord(operation)) continue;
      if (operation.kind === "source") summary.sources += 1;
      else summary.actions += 1;
      summary.fields += Array.isArray(operation.fields) ? operation.fields.length : 0;
      summary.authFields += Array.isArray(operation.authFieldNames) ? operation.authFieldNames.length : 0;
      summary.defaults += countDefaults(operation.fields);
      summary.options += countOptions(operation.fields);
      if (isRecord(operation.annotations)) summary.annotatedOperations += 1;
      if (operation.annotations?.destructiveHint === true) summary.destructiveOperations += 1;
      if (operation.annotations?.readOnlyHint === true) summary.readOnlyOperations += 1;
      if (operation.annotations?.openWorldHint === true) summary.openWorldOperations += 1;
      if (operation.runtime?.hasRun === true) summary.runnableOperations += 1;
      if (operation.kind === "source" && operation.runtime?.hasHooks === true) summary.hookSources += 1;
      if (operation.kind === "source" && operation.runtime?.dedupe) summary.dedupedSources += 1;
      if (operation.runtime?.hasAdditionalProps === true) summary.dynamicPropOperations += 1;
      if (operation.runtime?.hasMethods === true) summary.methodOperations += 1;
    }
    return summary;
  }, {
    apps: 0,
    actions: 0,
    sources: 0,
    fields: 0,
    authFields: 0,
    defaults: 0,
    options: 0,
    annotatedOperations: 0,
    destructiveOperations: 0,
    readOnlyOperations: 0,
    openWorldOperations: 0,
    runnableOperations: 0,
    hookSources: 0,
    dedupedSources: 0,
    dynamicPropOperations: 0,
    methodOperations: 0,
  });
}

function summarizeExpected(apps) {
  const summary = {
    defaults: 0,
    options: 0,
    annotatedOperations: 0,
    destructiveOperations: 0,
    readOnlyOperations: 0,
    openWorldOperations: 0,
    runnableOperations: 0,
    hookSources: 0,
    dedupedSources: 0,
    dynamicPropOperations: 0,
    methodOperations: 0,
  };
  for (const app of apps.values()) {
    summary.defaults += app.fieldStats.defaults;
    summary.options += app.fieldStats.options;
    for (const operation of app.operations.values()) {
      summary.defaults += operation.fieldStats.defaults;
      summary.options += operation.fieldStats.options;
      if (Object.keys(operation.annotations).length) summary.annotatedOperations += 1;
      if (operation.annotations.destructiveHint === true) summary.destructiveOperations += 1;
      if (operation.annotations.readOnlyHint === true) summary.readOnlyOperations += 1;
      if (operation.annotations.openWorldHint === true) summary.openWorldOperations += 1;
      if (operation.runtime.hasRun === true) summary.runnableOperations += 1;
      if (operation.kind === "source" && operation.runtime.hasHooks === true) summary.hookSources += 1;
      if (operation.kind === "source" && operation.runtime.dedupe) summary.dedupedSources += 1;
      if (operation.runtime.hasAdditionalProps === true) summary.dynamicPropOperations += 1;
      if (operation.runtime.hasMethods === true) summary.methodOperations += 1;
    }
  }
  return summary;
}

function compareSets(label, expected, actual, errors) {
  for (const value of expected) if (!actual.has(value)) errors.push(`${label} missing ${value}`);
  for (const value of actual) if (!expected.has(value)) errors.push(`${label} extra ${value}`);
}

function compareAnnotations(operationId, expected, actual, errors) {
  for (const key of ["destructiveHint", "readOnlyHint", "openWorldHint"]) {
    if (expected[key] !== actual?.[key]) errors.push(`operation ${operationId} annotation ${key} ${actual?.[key] ?? "<missing>"} expected ${expected[key]}`);
  }
}

function compareRuntime(operationId, expected, actual, errors) {
  for (const key of ["hasRun", "hasHooks", "hasAdditionalProps", "hasMethods", "dedupe"]) {
    if (expected[key] !== actual?.[key]) errors.push(`operation ${operationId} runtime ${key} ${actual?.[key] ?? "<missing>"} expected ${expected[key]}`);
  }
}

function findDuplicates(label, values, errors) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} duplicates ${value}`);
    seen.add(value);
  }
}

function summarizeFields(fields) {
  return {
    defaults: fields.filter((field) => field.default !== undefined).length,
    options: fields.filter((field) => field.options?.length > 0).length,
  };
}

function readDefault(body) {
  const raw = readTopLevelValue(body, "default");
  return raw ? parseLiteral(raw.trim()) : undefined;
}

function readAnnotations(source) {
  const match = /\bannotations\s*:\s*{/.exec(source);
  if (!match) return {};
  const bodyStart = match.index + match[0].length;
  const bodyEnd = findMatchingBrace(source, bodyStart - 1);
  if (bodyEnd < 0) return {};
  const body = source.slice(bodyStart, bodyEnd);
  return {
    ...optionalBoolean("destructiveHint", readBoolean(body, "destructiveHint")),
    ...optionalBoolean("readOnlyHint", readBoolean(body, "readOnlyHint")),
    ...optionalBoolean("openWorldHint", readBoolean(body, "openWorldHint")),
  };
}

function readRuntime(source, filePath, seen = new Set()) {
  const runtime = {
    hasRun: hasComponentMember(source, "run"),
    hasHooks: hasComponentMember(source, "hooks"),
    hasAdditionalProps: /\badditionalProps\s*[:(]/.test(source),
    hasMethods: hasComponentMember(source, "methods"),
    ...optionalString("dedupe", firstMatch(source, /\bdedupe\s*:\s*["'`]([^"'`]+)["'`]/)),
  };
  if (!filePath) return runtime;
  if (seen.has(filePath)) return runtime;
  seen.add(filePath);
  for (const imported of readSpreadImports(source, filePath)) {
    if (!fs.existsSync(imported.file)) continue;
    const inherited = readRuntime(readText(imported.file), imported.file, seen);
    runtime.hasRun ||= inherited.hasRun;
    runtime.hasHooks ||= inherited.hasHooks;
    runtime.hasAdditionalProps ||= inherited.hasAdditionalProps;
    runtime.hasMethods ||= inherited.hasMethods;
    if (!runtime.dedupe && inherited.dedupe) runtime.dedupe = inherited.dedupe;
  }
  return runtime;
}

function hasComponentMember(source, name) {
  const member = new RegExp(`(?:^|[\\n,{])\\s*(?:async\\s+)?${name}\\s*(?:[:(])`, "m");
  return member.test(source);
}

function readSpreadImports(source, filePath) {
  const imported = [];
  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g)) {
    const binding = match[1];
    const specifier = match[2];
    if (!source.includes(`...${binding}`)) continue;
    const resolved = resolveLocalImport(filePath, specifier);
    if (resolved) imported.push({ binding, file: resolved });
  }
  return imported;
}

function resolveLocalImport(filePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(filePath), specifier);
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, path.join(base, "index.mjs"), path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function optionalString(key, value) {
  return typeof value === "string" && value.trim() ? { [key]: value.trim() } : {};
}

function optionalBoolean(key, value) {
  return typeof value === "boolean" ? { [key]: value } : {};
}

function readBoolean(body, key) {
  const raw = readTopLevelValue(body, key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function readOptions(body) {
  const raw = readTopLevelValue(body, "options");
  if (!raw) return [];
  const entries = [];
  for (const match of raw.matchAll(/{([^{}]+)}/g)) {
    const value = parseLiteral(firstMatch(match[1] ?? "", /\bvalue:\s*([^,\n}]+)/)?.trim() ?? "");
    if (["string", "number", "boolean"].includes(typeof value)) entries.push({ value });
  }
  if (!entries.length) {
    for (const match of raw.matchAll(/["']([^"']+)["']/g)) entries.push({ value: scrub(match[1]) });
  }
  return entries.filter((entry, index, array) => array.findIndex((candidate) => candidate.value === entry.value) === index);
}

function parseLiteral(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return /^["'`]([^"'`]*)["'`]$/.exec(raw)?.[1];
}

function readTopLevelString(body, key) {
  const raw = readTopLevelValue(body, key);
  return raw ? /^["'`]([^"'`]*)["'`]$/.exec(raw.trim())?.[1] : undefined;
}

function readTopLevelValue(body, key) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    if (depth !== 0 || !isPropertyAt(body, index, key)) continue;
    const colon = body.indexOf(":", index + key.length);
    if (colon < 0) return undefined;
    return body.slice(colon + 1, findTopLevelValueEnd(body, colon + 1)).trim();
  }
  return undefined;
}

function isPropertyAt(body, index, key) {
  if (body.slice(index, index + key.length) !== key) return false;
  const before = body[index - 1];
  const after = body[index + key.length];
  return (!before || !/[A-Za-z0-9_$]/.test(before)) && /\s*:/.test(body.slice(index + key.length, index + key.length + 3)) && (!after || !/[A-Za-z0-9_$]/.test(after));
}

function findTopLevelValueEnd(body, start) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) return index;
  }
  return body.length;
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
