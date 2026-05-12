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
const countDynamicOptions = (fields) => Array.isArray(fields) ? fields.filter((field) => isRecord(field) && isRecord(field.dynamicOptions)).length : 0;
const expected = readExpected(componentsDir);
const catalog = JSON.parse(readText(catalogPath));
const errors = verify(catalog, expected);
const summary = summarize(catalog.apps ?? []);

for (const error of errors.slice(0, maxErrors)) console.error(`FAIL ${error}`);
if (errors.length > maxErrors) console.error(`FAIL ... ${errors.length - maxErrors} additional errors hidden`);
console.error(`apps=${summary.apps} actions=${summary.actions} sources=${summary.sources} fields=${summary.fields} authFields=${summary.authFields} managedFields=${summary.managedFields} defaults=${summary.defaults} options=${summary.options} dynamicOptions=${summary.dynamicOptionFields} annotations=${summary.annotatedOperations} destructive=${summary.destructiveOperations} readOnly=${summary.readOnlyOperations} openWorld=${summary.openWorldOperations} runnable=${summary.runnableOperations} hooks=${summary.hookSources} dedupe=${summary.dedupedSources} polling=${summary.pollingSources} webhooks=${summary.webhookSources} hybrid=${summary.hybridSources} stateful=${summary.statefulSources} dynamicProps=${summary.dynamicPropOperations} dynamicPropFields=${summary.dynamicPropFields} methods=${summary.methodOperations}`);
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
    const appPath = path.join(appDir, appFile);
    const source = readText(appPath);
    const id = scrub(firstMatch(source, /\bapp:\s*["']([^"']+)["']/) ?? entry.name);
    const fields = readFields(source, id, [], appPath);
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
    .filter(isOperationFile)
    .map((file) => {
      const source = readText(file);
      const fields = readFields(source, appId, appFields, file);
      const runtime = readRuntime(source, file);
      const slug = scrub(operationSlug(root, file));
      return {
        id: `${appId}.${kind}.${slug}`,
        kind,
        fields: names(fields),
        fieldStats: summarizeFields(fields),
        annotations: readAnnotations(source),
        runtime,
        sourceCapabilities: readSourceCapabilities(kind, fields, runtime),
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
  if (actualSummary.managedFields !== expectedSummary.managedFields) errors.push(`managedFields ${actualSummary.managedFields} expected ${expectedSummary.managedFields}`);
  if (actualSummary.options !== expectedSummary.options) errors.push(`options ${actualSummary.options} expected ${expectedSummary.options}`);
  if (actualSummary.dynamicOptionFields !== expectedSummary.dynamicOptionFields) errors.push(`dynamicOptions ${actualSummary.dynamicOptionFields} expected ${expectedSummary.dynamicOptionFields}`);
  if (actualSummary.annotatedOperations !== expectedSummary.annotatedOperations) errors.push(`annotations ${actualSummary.annotatedOperations} expected ${expectedSummary.annotatedOperations}`);
  if (actualSummary.destructiveOperations !== expectedSummary.destructiveOperations) errors.push(`destructive ${actualSummary.destructiveOperations} expected ${expectedSummary.destructiveOperations}`);
  if (actualSummary.readOnlyOperations !== expectedSummary.readOnlyOperations) errors.push(`readOnly ${actualSummary.readOnlyOperations} expected ${expectedSummary.readOnlyOperations}`);
  if (actualSummary.openWorldOperations !== expectedSummary.openWorldOperations) errors.push(`openWorld ${actualSummary.openWorldOperations} expected ${expectedSummary.openWorldOperations}`);
  if (actualSummary.runnableOperations !== expectedSummary.runnableOperations) errors.push(`runnable ${actualSummary.runnableOperations} expected ${expectedSummary.runnableOperations}`);
  if (actualSummary.hookSources !== expectedSummary.hookSources) errors.push(`hookSources ${actualSummary.hookSources} expected ${expectedSummary.hookSources}`);
  if (actualSummary.dedupedSources !== expectedSummary.dedupedSources) errors.push(`dedupedSources ${actualSummary.dedupedSources} expected ${expectedSummary.dedupedSources}`);
  if (actualSummary.pollingSources !== expectedSummary.pollingSources) errors.push(`pollingSources ${actualSummary.pollingSources} expected ${expectedSummary.pollingSources}`);
  if (actualSummary.webhookSources !== expectedSummary.webhookSources) errors.push(`webhookSources ${actualSummary.webhookSources} expected ${expectedSummary.webhookSources}`);
  if (actualSummary.hybridSources !== expectedSummary.hybridSources) errors.push(`hybridSources ${actualSummary.hybridSources} expected ${expectedSummary.hybridSources}`);
  if (actualSummary.statefulSources !== expectedSummary.statefulSources) errors.push(`statefulSources ${actualSummary.statefulSources} expected ${expectedSummary.statefulSources}`);
  if (actualSummary.dynamicPropOperations !== expectedSummary.dynamicPropOperations) errors.push(`dynamicProps ${actualSummary.dynamicPropOperations} expected ${expectedSummary.dynamicPropOperations}`);
  if (actualSummary.dynamicPropFields !== expectedSummary.dynamicPropFields) errors.push(`dynamicPropFields ${actualSummary.dynamicPropFields} expected ${expectedSummary.dynamicPropFields}`);
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
      compareSourceCapabilities(operationId, expectedOperation.sourceCapabilities, operation.source, errors);
    }
  }

  const expectedOperationIds = new Set([...expectedApps.values()].flatMap((app) => [...app.operations.keys()]));
  const expectedPaths = new Set([...expectedApps.values()].flatMap((app) => [...app.operations.values()].map((op) => op.sourcePath)));
  for (const id of actualApps.keys()) if (!expectedApps.has(id)) errors.push(`extra app ${id}`);
  for (const id of actualOps.keys()) if (!expectedOperationIds.has(id)) errors.push(`extra operation ${id}`);
  for (const sourcePath of actualPaths) if (!expectedPaths.has(sourcePath)) errors.push(`extra sourcePath ${sourcePath}`);
  return errors;
}

function readFields(source, appId, appFields = [], filePath, seen = new Set()) {
  const fields = new Map();
  for (const match of source.matchAll(/import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+["'][^"']+\.app\.mjs["']/g)) {
    const name = scrub(match[1]);
    if (name) fields.set(name, { name, type: "app", optional: false, secret: true });
  }
  if (filePath && !seen.has(filePath)) {
    seen.add(filePath);
    for (const imported of readPropImports(source, filePath)) {
      if (!fs.existsSync(imported.file)) continue;
      for (const field of readFields(readText(imported.file), appId, appFields, imported.file, seen)) {
        fields.set(field.name, field);
      }
    }
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
    const dynamicOptions = readDynamicOptions(body);
    const type = inherited?.type ?? readTopLevelString(body, "type") ?? "string";
    fields.set(name, {
      ...(inherited ?? {}),
      name,
      type,
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(options.length ? { options } : {}),
      ...(dynamicOptions ?? inherited?.dynamicOptions ? { dynamicOptions: dynamicOptions ?? inherited.dynamicOptions } : {}),
      ...(inherited?.secret || isSecretField(name, body, appId) ? { secret: true } : {}),
      ...(inherited?.managed || type.startsWith("$.") ? { managed: true } : {}),
    });
  }
  for (const entry of readManagedStringFieldEntries(source)) {
    if (!fields.has(entry.name)) {
      fields.set(entry.name, {
        name: entry.name,
        type: entry.type,
        optional: false,
        managed: true,
      });
    }
  }
  return [...fields.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function readPropImports(source, filePath) {
  const imported = [];
  const hasOwnProps = hasComponentMember(source, "props");
  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g)) {
    const binding = match[1];
    const specifier = match[2];
    const spreadsProps = source.includes(`...${binding}.props`);
    const spreadsComponent = !hasOwnProps && source.includes(`...${binding}`);
    if (!spreadsProps && !spreadsComponent) continue;
    const resolved = resolveLocalImport(filePath, specifier);
    if (resolved) imported.push({ binding, file: resolved });
  }
  return imported;
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

function readManagedStringFieldEntries(source) {
  const entries = [];
  for (const match of source.matchAll(/(?:^|[\n,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["'](\$\.[^"']+)["']/g)) {
    const name = scrub(match[1]);
    const type = match[2];
    if (name && type) entries.push({ name, type });
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

function findMatchingDelimiter(source, openIndex, openChar, closeChar) {
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
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
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
    summary.managedFields += Array.isArray(app.fields) ? app.fields.filter((field) => field.managed).length : 0;
    summary.defaults += countDefaults(app.fields);
    summary.options += countOptions(app.fields);
    summary.dynamicOptionFields += countDynamicOptions(app.fields);
    for (const operation of Array.isArray(app.operations) ? app.operations : []) {
      if (!isRecord(operation)) continue;
      if (operation.kind === "source") summary.sources += 1;
      else summary.actions += 1;
      summary.fields += Array.isArray(operation.fields) ? operation.fields.length : 0;
      summary.authFields += Array.isArray(operation.authFieldNames) ? operation.authFieldNames.length : 0;
      summary.managedFields += Array.isArray(operation.fields) ? operation.fields.filter((field) => field.managed).length : 0;
      summary.defaults += countDefaults(operation.fields);
      summary.options += countOptions(operation.fields);
      summary.dynamicOptionFields += countDynamicOptions(operation.fields);
      if (isRecord(operation.annotations)) summary.annotatedOperations += 1;
      if (operation.annotations?.destructiveHint === true) summary.destructiveOperations += 1;
      if (operation.annotations?.readOnlyHint === true) summary.readOnlyOperations += 1;
      if (operation.annotations?.openWorldHint === true) summary.openWorldOperations += 1;
      if (operation.runtime?.hasRun === true) summary.runnableOperations += 1;
      if (operation.kind === "source" && operation.runtime?.hasHooks === true) summary.hookSources += 1;
      if (operation.kind === "source" && operation.runtime?.dedupe) summary.dedupedSources += 1;
      if (operation.source?.delivery === "polling") summary.pollingSources += 1;
      if (operation.source?.delivery === "webhook") summary.webhookSources += 1;
      if (operation.source?.delivery === "hybrid") summary.hybridSources += 1;
      if (operation.source?.usesServiceDb === true) summary.statefulSources += 1;
      if (operation.runtime?.hasAdditionalProps === true) summary.dynamicPropOperations += 1;
      summary.dynamicPropFields += operation.runtime?.additionalProps?.fieldNames?.length ?? 0;
      if (operation.runtime?.hasMethods === true) summary.methodOperations += 1;
    }
    return summary;
  }, {
    apps: 0,
    actions: 0,
    sources: 0,
    fields: 0,
    authFields: 0,
    managedFields: 0,
    defaults: 0,
    options: 0,
    annotatedOperations: 0,
    destructiveOperations: 0,
    readOnlyOperations: 0,
    openWorldOperations: 0,
    runnableOperations: 0,
    hookSources: 0,
    dedupedSources: 0,
    pollingSources: 0,
    webhookSources: 0,
    hybridSources: 0,
    statefulSources: 0,
    dynamicPropOperations: 0,
    dynamicPropFields: 0,
    dynamicOptionFields: 0,
    methodOperations: 0,
  });
}

function summarizeExpected(apps) {
  const summary = {
    defaults: 0,
    options: 0,
    managedFields: 0,
    annotatedOperations: 0,
    destructiveOperations: 0,
    readOnlyOperations: 0,
    openWorldOperations: 0,
    runnableOperations: 0,
    hookSources: 0,
    dedupedSources: 0,
    pollingSources: 0,
    webhookSources: 0,
    hybridSources: 0,
    statefulSources: 0,
    dynamicPropOperations: 0,
    dynamicPropFields: 0,
    dynamicOptionFields: 0,
    methodOperations: 0,
  };
  for (const app of apps.values()) {
    summary.defaults += app.fieldStats.defaults;
    summary.options += app.fieldStats.options;
    summary.dynamicOptionFields += app.fieldStats.dynamicOptions;
    summary.managedFields += app.fieldStats.managed;
    for (const operation of app.operations.values()) {
      summary.defaults += operation.fieldStats.defaults;
      summary.options += operation.fieldStats.options;
      summary.dynamicOptionFields += operation.fieldStats.dynamicOptions;
      summary.managedFields += operation.fieldStats.managed;
      if (Object.keys(operation.annotations).length) summary.annotatedOperations += 1;
      if (operation.annotations.destructiveHint === true) summary.destructiveOperations += 1;
      if (operation.annotations.readOnlyHint === true) summary.readOnlyOperations += 1;
      if (operation.annotations.openWorldHint === true) summary.openWorldOperations += 1;
      if (operation.runtime.hasRun === true) summary.runnableOperations += 1;
      if (operation.kind === "source" && operation.runtime.hasHooks === true) summary.hookSources += 1;
      if (operation.kind === "source" && operation.runtime.dedupe) summary.dedupedSources += 1;
      if (operation.sourceCapabilities?.delivery === "polling") summary.pollingSources += 1;
      if (operation.sourceCapabilities?.delivery === "webhook") summary.webhookSources += 1;
      if (operation.sourceCapabilities?.delivery === "hybrid") summary.hybridSources += 1;
      if (operation.sourceCapabilities?.usesServiceDb === true) summary.statefulSources += 1;
      if (operation.runtime.hasAdditionalProps === true) summary.dynamicPropOperations += 1;
      summary.dynamicPropFields += operation.runtime.additionalProps?.fieldNames?.length ?? 0;
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
  const expectedMethods = new Set(expected.methodNames ?? []);
  const actualMethods = new Set(Array.isArray(actual?.methodNames) ? actual.methodNames : []);
  compareSets(`operation ${operationId} methods`, expectedMethods, actualMethods, errors);
  compareAdditionalProps(operationId, expected.additionalProps, actual?.additionalProps, errors);
}

function compareAdditionalProps(operationId, expected, actual, errors) {
  if (!expected && !actual) return;
  if (!expected || !actual) {
    errors.push(`operation ${operationId} additionalProps ${actual ? "present" : "<missing>"} expected ${expected ? "present" : "<missing>"}`);
    return;
  }
  for (const key of ["mode", "usesPreviousProps", "usesThis"]) {
    if (expected[key] !== actual[key]) errors.push(`operation ${operationId} additionalProps ${key} ${actual[key]} expected ${expected[key]}`);
  }
  compareSets(`operation ${operationId} additionalProps fields`, new Set(expected.fieldNames ?? []), new Set(actual.fieldNames ?? []), errors);
  compareSets(`operation ${operationId} additionalProps context`, new Set(expected.contextKeys ?? []), new Set(actual.contextKeys ?? []), errors);
}

function compareSourceCapabilities(operationId, expected, actual, errors) {
  if (!expected && !actual) return;
  for (const key of ["delivery", "usesTimer", "usesHttp", "usesServiceDb"]) {
    if (expected?.[key] !== actual?.[key]) errors.push(`operation ${operationId} source ${key} ${actual?.[key] ?? "<missing>"} expected ${expected?.[key] ?? "<missing>"}`);
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
    dynamicOptions: fields.filter((field) => field.dynamicOptions).length,
    managed: fields.filter((field) => field.managed).length,
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
  const additionalProps = readAdditionalPropsMetadata(source);
  const runtime = {
    hasRun: hasComponentMember(source, "run"),
    hasHooks: hasComponentMember(source, "hooks"),
    hasAdditionalProps: Boolean(additionalProps),
    ...optionalAdditionalProps(additionalProps),
    hasMethods: hasComponentMember(source, "methods"),
    methodNames: readMethodNames(source),
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
    runtime.additionalProps = mergeAdditionalProps(runtime.additionalProps, inherited.additionalProps);
    runtime.hasMethods ||= inherited.hasMethods;
    runtime.methodNames = [...runtime.methodNames, ...inherited.methodNames].filter(unique).sort();
    if (!runtime.dedupe && inherited.dedupe) runtime.dedupe = inherited.dedupe;
  }
  return runtime;
}

function optionalAdditionalProps(metadata) {
  return metadata ? { additionalProps: metadata } : {};
}

function mergeAdditionalProps(current, inherited) {
  if (!current) return inherited;
  if (!inherited) return current;
  return {
    mode: current.mode === "function" || inherited.mode === "function" ? "function" : "object",
    fieldNames: [...current.fieldNames, ...inherited.fieldNames].filter(unique).sort(),
    contextKeys: [...current.contextKeys, ...inherited.contextKeys].filter(unique).sort(),
    usesPreviousProps: current.usesPreviousProps || inherited.usesPreviousProps,
    usesThis: current.usesThis || inherited.usesThis,
  };
}

function readAdditionalPropsMetadata(source) {
  const body = readExportObjectBody(source);
  if (!body) return undefined;
  const raw = readTopLevelValue(body, "additionalProps");
  const method = readTopLevelMethod(body, "additionalProps");
  if (!raw && !method) return undefined;
  const value = raw ?? method?.body ?? "";
  const params = method?.params ?? readFunctionParams(value.trim()) ?? "";
  const objectBody = objectBodyFromValue(value);
  const functionBody = method?.body ?? value;
  const thisKeys = readThisKeys(functionBody);
  const contextKeys = [...contextKeysFromParams(params), ...thisKeys].filter(unique).sort();
  return {
    mode: objectBody && !method && value.trim().startsWith("{") ? "object" : "function",
    fieldNames: objectBody ? readObjectKeys(objectBody) : readReturnObjectKeys(functionBody),
    contextKeys,
    usesPreviousProps: contextKeysFromParams(params).some((key) => /^(prev|previous|prevContext)$/.test(key)),
    usesThis: thisKeys.length > 0,
  };
}

function readExportObjectBody(source) {
  const match = /(?:export\s+default|module\.exports\s*=)\s*{/.exec(source);
  if (!match) return undefined;
  const openIndex = source.indexOf("{", match.index);
  const closeIndex = findMatchingBrace(source, openIndex);
  return closeIndex < 0 ? undefined : source.slice(openIndex + 1, closeIndex);
}

function readTopLevelMethod(body, key) {
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
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 0 || body.slice(index, index + key.length) !== key) continue;
    const rest = body.slice(index + key.length);
    const parenOffset = rest.search(/\s*\(/);
    if (parenOffset !== 0) continue;
    const openParen = index + key.length + rest.indexOf("(");
    const closeParen = findMatchingDelimiter(body, openParen, "(", ")");
    if (closeParen < 0) return undefined;
    const openBrace = body.indexOf("{", closeParen);
    if (openBrace < 0) return undefined;
    const closeBrace = findMatchingBrace(body, openBrace);
    if (closeBrace < 0) return undefined;
    return {
      params: body.slice(openParen + 1, closeParen),
      body: body.slice(openBrace + 1, closeBrace),
    };
  }
  return undefined;
}

function objectBodyFromValue(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return undefined;
  const closeIndex = findMatchingBrace(trimmed, 0);
  return closeIndex < 0 ? undefined : trimmed.slice(1, closeIndex);
}

function readReturnObjectKeys(body) {
  const keys = [];
  for (const match of body.matchAll(/\breturn\s*{/g)) {
    const openIndex = match.index + match[0].lastIndexOf("{");
    const closeIndex = findMatchingBrace(body, openIndex);
    if (closeIndex < 0) continue;
    keys.push(...readObjectKeys(body.slice(openIndex + 1, closeIndex)));
  }
  return keys.filter(unique).sort();
}

function readThisKeys(body) {
  return [...body.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)]
    .map((match) => scrub(match[1]))
    .filter(unique)
    .sort();
}

function readMethodNames(source) {
  const match = /\bmethods\s*:\s*{/.exec(source);
  if (!match) return [];
  const bodyStart = match.index + match[0].length;
  const bodyEnd = findMatchingBrace(source, bodyStart - 1);
  if (bodyEnd < 0) return [];
  return readObjectKeys(source.slice(bodyStart, bodyEnd));
}

function readObjectKeys(body) {
  const keys = [];
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
    if (char === "{" || char === "[" || char === "(") depth += 1;
    else if (char === "}" || char === "]" || char === ")") depth -= 1;
    if (depth !== 0 || !/[A-Za-z_$]/.test(char)) continue;
    const rest = body.slice(index);
    const match = /^([A-Za-z_$][\w$]*)\s*(?::|\()/.exec(rest);
    if (!match) continue;
    keys.push(scrub(match[1]));
    index += match[1].length - 1;
  }
  return keys.filter(unique).sort();
}

function readSourceCapabilities(kind, fields, runtime) {
  if (kind !== "source") return null;
  const usesTimer = fields.some((field) => field.type === "$.interface.timer");
  const usesHttp = fields.some((field) => field.type === "$.interface.http");
  const usesServiceDb = fields.some((field) => field.type === "$.service.db");
  return {
    delivery: sourceDeliveryMode({ usesTimer, usesHttp, runtime }),
    usesTimer,
    usesHttp,
    usesServiceDb,
  };
}

function sourceDeliveryMode({ usesTimer, usesHttp, runtime }) {
  if (usesTimer && usesHttp) return "hybrid";
  if (usesTimer) return "polling";
  if (usesHttp || runtime.hasHooks) return "webhook";
  if (runtime.hasRun) return "polling";
  return "manual";
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

function readDynamicOptions(body) {
  const methodParams = firstMatch(body, /(?:^|[\n,{])\s*(?:async\s+)?options\s*\(([^)]*)\)/);
  const raw = readTopLevelValue(body, "options");
  const arrowParams = raw ? readFunctionParams(raw.trim()) : undefined;
  const params = methodParams ?? arrowParams;
  const hasDynamic = Boolean(methodParams)
    || Boolean(raw && /^(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(raw.trim()));
  if (!hasDynamic) return undefined;
  const contextKeys = contextKeysFromParams(params ?? "");
  const haystack = `${params ?? ""}\n${raw ?? ""}`;
  return {
    paginated: /\bpage\b/.test(haystack),
    usesPreviousContext: /\bprevContext\b/.test(haystack),
    contextKeys,
  };
}

function readFunctionParams(value) {
  const match = /^(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/.exec(value);
  return match?.[1] ?? match?.[2];
}

function contextKeysFromParams(params) {
  const trimmed = params.trim();
  if (!trimmed) return [];
  const destructured = /^\s*{([^}]*)}/.exec(trimmed)?.[1];
  if (destructured) {
    return destructured
      .split(",")
      .map((part) => part.split(":")[0]?.replace(/[.\s{}[\]=]/g, "").trim())
      .filter(Boolean)
      .filter(unique)
      .sort();
  }
  const first = /^[A-Za-z_$][\w$]*/.exec(trimmed)?.[0];
  return first ? [first] : [];
}

function unique(value, index, array) {
  return array.indexOf(value) === index;
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

function isOperationFile(file) {
  if (!/\.(mjs|js|ts)$/i.test(file)) return false;
  if (file.endsWith("test-event.mjs")) return false;
  if (file.includes(`${path.sep}common${path.sep}`)) return false;
  return !["common.mjs", "common.js", "common.ts", "base.mjs", "base.js", "base.ts", "utils.mjs", "utils.js", "utils.ts"].includes(path.basename(file));
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
