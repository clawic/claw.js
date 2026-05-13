#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args.source ?? process.env.CLAW_COMPONENTS_SOURCE_DIR ?? "");
const outPath = args.out ? path.resolve(args.out) : "";

if (!sourceRoot || !fs.existsSync(sourceRoot)) {
  console.error("Usage: node scripts/extract-component-catalog.mjs --source <checkout> --out <catalog.json>");
  process.exit(1);
}
if (!outPath) {
  console.error("Missing --out <catalog.json>");
  process.exit(1);
}

const componentsDir = path.join(sourceRoot, "components");
if (!fs.existsSync(componentsDir)) {
  throw new Error(`Missing components directory: ${componentsDir}`);
}

const sourceRevision = readRevision(sourceRoot);
const apps = fs.readdirSync(componentsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readApp(path.join(componentsDir, entry.name), entry.name))
  .filter(Boolean)
  .sort((left, right) => left.name.localeCompare(right.name));

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...(sourceRevision ? { sourceRevision } : {}),
  apps,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.error(`wrote ${apps.length} apps, ${apps.reduce((sum, app) => sum + app.operations.length, 0)} operations`);

function readApp(appDir, fallbackId) {
  const appFile = findAppFile(appDir);
  if (!appFile) return null;
  const appPath = appFile;
  const source = readText(appPath);
  const packageJson = readJson(path.join(appDir, "package.json"));
  const id = scrubIdentifier(firstMatch(source, /\bapp:\s*["']([^"']+)["']/) ?? fallbackId);
  const name = cleanText(
    firstMatch(source, /\bname:\s*["']([^"']+)["']/)
    ?? packageJson?.displayName
    ?? id,
  );
  const fields = readFields(source, id, [], appPath);
  const appAuthFields = fields.filter((field) => field.secret).map((field) => field.name);
  return {
    id,
    name,
    ...optionalString("description", cleanText(firstMatch(source, /\bdescription:\s*["'`]([^"'`]+)["'`]/))),
    ...optionalString("packageVersion", packageJson?.version),
    ...optionalString("authType", firstMatch(source, /\bauth:\s*{[^}]*\btype:\s*["']([^"']+)["']/s)),
    authFieldNames: appAuthFields,
    fields,
    operations: [
      ...readOperations(appDir, id, "action", appAuthFields, fields),
      ...readOperations(appDir, id, "source", appAuthFields, fields),
    ].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function readOperations(appDir, appId, kind, appAuthFields, appFields) {
  const dir = path.join(appDir, kind === "action" ? "actions" : "sources");
  if (!fs.existsSync(dir)) return [];
  const files = listFiles(dir).filter(isOperationFile);
  return files
    .map((file) => {
      const source = readText(file);
      const slug = operationSlug(dir, file);
      const key = scrubIdentifier(firstMatch(source, /\bkey:\s*["']([^"']+)["']/) ?? `${appId}-${slug}`);
      const fields = readFields(source, appId, appFields, file);
      const runtime = readRuntime(source, file);
      const authFieldNames = [
        ...appAuthFields,
        ...fields.filter((field) => field.secret).map((field) => field.name),
      ].filter(unique);
      const sampleEvent = kind === "source" ? readSampleEventMetadata(file) : undefined;
      const eventSummary = kind === "source" ? readEventSummaryMetadata(source) : undefined;
      return {
        id: `${appId}.${kind}.${scrubIdentifier(slug)}`,
        appId,
        kind,
        key,
        name: cleanText(firstMatch(source, /\bname:\s*["'`]([^"'`]+)["'`]/) ?? titleize(slug)),
        ...optionalString("description", cleanText(firstMatch(source, /\bdescription:\s*["'`]([^"'`]+)["'`]/))),
        ...optionalString("version", firstMatch(source, /\bversion:\s*["']([^"']+)["']/)),
        fields,
        authFieldNames,
        ...optionalAnnotations(readAnnotations(source)),
        runtime,
        ...optionalSourceCapabilities(kind, fields, runtime),
        ...optionalSampleEvent(sampleEvent),
        ...optionalEventSummary(eventSummary),
        sourcePath: scrubPath(path.relative(path.dirname(appDir), file).replaceAll(path.sep, "/")),
      };
    });
}

function readFields(source, appId, appFields = [], filePath, seen = new Set()) {
  const fields = new Map();
  for (const match of source.matchAll(/import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+["'][^"']+\.app\.mjs["']/g)) {
    const name = scrubIdentifier(match[1]);
    if (name) {
      fields.set(name, {
        name,
        type: "app",
        optional: false,
        secret: true,
      });
    }
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
    const name = scrubIdentifier(entry.name);
    if (!name || ["props", "propDefinitions", "options"].includes(name)) continue;
    const body = entry.body;
    const propDefinitionValue = readTopLevelValue(body, "propDefinition") ?? "";
    const propRef = scrubIdentifier(firstMatch(propDefinitionValue, /\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s));
    const inherited = propRef ? appFieldByName.get(propRef) : null;
    const type = readTopLevelString(body, "type") ?? (body.includes("type: \"app\"") ? "app" : "string");
    const dynamicOptions = readDynamicOptions(body);
    const min = readNumber(body, "min");
    const max = readNumber(body, "max");
    const field = {
      ...(inherited ?? {}),
      name,
      type: inherited?.type ?? type,
      ...optionalString("label", cleanText(readTopLevelString(body, "label"))),
      ...optionalString("description", cleanText(readTopLevelString(body, "description"))),
      ...optionalString("alertType", cleanText(readTopLevelString(body, "alertType") ?? inherited?.alertType)),
      ...optionalString("content", cleanText(readTopLevelText(body, "content") ?? inherited?.content)),
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...optionalJson("default", readDefault(body)),
      ...optionalOptions(readOptions(body, source, filePath)),
      ...optionalPropDefinition(readPropDefinitionMetadata(propDefinitionValue, propRef)),
      ...optionalDynamicOptions(dynamicOptions ?? inherited?.dynamicOptions),
      ...optionalBoolean("hidden", readBoolean(body, "hidden") ?? inherited?.hidden),
      ...optionalBoolean("disabled", readBoolean(body, "disabled") ?? inherited?.disabled),
      ...optionalBoolean("reloadProps", readBoolean(body, "reloadProps") ?? inherited?.reloadProps),
      ...optionalNumber("min", min ?? inherited?.min),
      ...optionalNumber("max", max ?? inherited?.max),
      ...optionalString("placeholder", cleanText(readTopLevelString(body, "placeholder") ?? inherited?.placeholder)),
      ...optionalBoolean("useQuery", readBoolean(body, "useQuery") ?? inherited?.useQuery),
      ...optionalBoolean("withLabel", readBoolean(body, "withLabel") ?? inherited?.withLabel),
      ...optionalAccessMode(readTopLevelString(body, "accessMode") ?? inherited?.accessMode),
      ...optionalBoolean("sync", readBoolean(body, "sync") ?? inherited?.sync),
      ...optionalBoolean("customResponse", readBoolean(body, "customResponse") ?? inherited?.customResponse),
      ...(inherited?.secret || readBoolean(body, "secret") === true || isSecretField(name, body, appId) ? { secret: true } : {}),
      ...(inherited?.managed || type.startsWith("$.") ? { managed: true } : {}),
    };
    fields.set(name, field);
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
    const name = scrubIdentifier(match[1]);
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
  const scrubbedBody = scrubBrandedText(body);
  if (scrubbedBody.includes(`app: "${appId}"`) || scrubbedBody.includes(`app: '${appId}'`)) return true;
  return /token|secret|api[_-]?key|password|credential/i.test(name);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function isOperationFile(file) {
  if (!/\.(mjs|js|ts)$/i.test(file)) return false;
  if (file.endsWith("test-event.mjs")) return false;
  if (file.includes(`${path.sep}common${path.sep}`)) return false;
  return !["common.mjs", "common.js", "common.ts", "base.mjs", "base.js", "base.ts", "utils.mjs", "utils.js", "utils.ts"].includes(path.basename(file));
}

function cleanText(value) {
  if (typeof value !== "string") return undefined;
  const cleaned = scrubBrandedText(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function scrubIdentifier(value) {
  if (typeof value !== "string") return value;
  return scrubBrandedText(value).trim();
}

function scrubPath(value) {
  return value.split("/").map(scrubIdentifier).join("/");
}

function scrubBrandedText(value) {
  const branded = new RegExp(String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109), "gi");
  return value.replace(branded, "component");
}

function titleize(value) {
  return value.split(/[-_]+/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function operationSlug(root, file) {
  return path.relative(root, file)
    .replace(/\.(mjs|js|ts)$/i, "")
    .split(path.sep)
    .filter(Boolean)
    .join("-");
}

function optionalString(key, value) {
  return typeof value === "string" && value.trim() ? { [key]: value.trim() } : {};
}

function optionalJson(key, value) {
  return value === undefined ? {} : { [key]: value };
}

function optionalOptions(options) {
  return options.length ? { options } : {};
}

function optionalDynamicOptions(options) {
  return options ? { dynamicOptions: options } : {};
}

function optionalPropDefinition(metadata) {
  return metadata ? { propDefinition: metadata } : {};
}

function optionalAnnotations(annotations) {
  return Object.keys(annotations).length ? { annotations } : {};
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
    hookNames: readHookNames(source),
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
    runtime.hookNames = [...runtime.hookNames, ...inherited.hookNames].filter(unique).sort();
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

function readPropDefinitionMetadata(value, fieldName) {
  if (!value || !fieldName) return undefined;
  const items = readArrayItems(value);
  const contextSource = items.slice(2).join(",");
  return {
    fieldName,
    contextKeys: contextSource ? readObjectKeysFromExpression(contextSource) : [],
    dependsOn: contextSource ? readDependencyKeys(contextSource) : [],
  };
}

function readArrayItems(value) {
  const openIndex = value.indexOf("[");
  if (openIndex < 0) return [];
  const closeIndex = findMatchingDelimiter(value, openIndex, "[", "]");
  if (closeIndex < 0) return [];
  const body = value.slice(openIndex + 1, closeIndex);
  const items = [];
  let depth = 0;
  let quote = "";
  let escaped = false;
  let start = 0;
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
    else if (char === "," && depth === 0) {
      items.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(body.slice(start).trim());
  return items.filter(Boolean);
}

function readObjectKeysFromExpression(value) {
  const match = /=>\s*\({/.exec(value) ?? /return\s*{/.exec(value);
  if (!match) return [];
  const openIndex = value.indexOf("{", match.index);
  const closeIndex = findMatchingBrace(value, openIndex);
  if (closeIndex < 0) return [];
  return readObjectKeys(value.slice(openIndex + 1, closeIndex));
}

function readDependencyKeys(value) {
  const keys = [];
  for (const match of value.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    if (["this", "app", "Math", "Object", "Array", "JSON", "Date", "String", "Number", "Boolean"].includes(match[1])) continue;
    keys.push(scrubIdentifier(match[2]));
  }
  const destructured = /^\s*\(?\s*{([^}]*)}/.exec(value)?.[1];
  if (destructured) {
    for (const part of destructured.split(",")) {
      const key = part.split(":")[0]?.replace(/[.\s{}[\]=]/g, "").trim();
      if (key) keys.push(scrubIdentifier(key));
    }
  }
  return keys.filter(unique).sort();
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
    .map((match) => scrubIdentifier(match[1]))
    .filter(unique)
    .sort();
}

function readHookNames(source) {
  const match = /\bhooks\s*:\s*{/.exec(source);
  if (!match) return [];
  const bodyStart = match.index + match[0].length;
  const bodyEnd = findMatchingBrace(source, bodyStart - 1);
  if (bodyEnd < 0) return [];
  return readObjectKeys(source.slice(bodyStart, bodyEnd));
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
    keys.push(scrubIdentifier(match[1]));
    index += match[1].length - 1;
  }
  return keys.filter(unique).sort();
}

function optionalSourceCapabilities(kind, fields, runtime) {
  if (kind !== "source") return {};
  const usesTimer = fields.some((field) => field.type === "$.interface.timer");
  const usesHttp = fields.some((field) => field.type === "$.interface.http");
  const usesServiceDb = fields.some((field) => field.type === "$.service.db");
  return {
    source: {
      delivery: sourceDeliveryMode({ usesTimer, usesHttp, runtime }),
      usesTimer,
      usesHttp,
      usesServiceDb,
    },
  };
}

function optionalSampleEvent(metadata) {
  return metadata ? { sampleEvent: metadata } : {};
}

function optionalEventSummary(metadata) {
  return metadata ? { eventSummary: metadata } : {};
}

function readSampleEventMetadata(sourceFile) {
  const samplePath = path.join(path.dirname(sourceFile), "test-event.mjs");
  if (!fs.existsSync(samplePath)) return undefined;
  const source = readText(samplePath);
  const value = readDefaultExportExpression(source);
  if (!value) return { shape: "unknown", keys: [] };
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    const body = objectBodyFromValue(trimmed);
    return {
      shape: "object",
      keys: body ? readObjectKeys(body) : [],
    };
  }
  if (trimmed.startsWith("[")) {
    const items = readArrayItems(trimmed);
    const firstObject = items.find((item) => item.trim().startsWith("{"));
    const body = firstObject ? objectBodyFromValue(firstObject.trim()) : undefined;
    return {
      shape: "array",
      keys: body ? readObjectKeys(body) : [],
    };
  }
  if (/^JSON\.parse\s*\(/.test(trimmed)) {
    const jsonText = parseStringContent(trimmed.slice(trimmed.indexOf("(") + 1, trimmed.lastIndexOf(")")).trim());
    if (jsonText) {
      try {
        const parsed = JSON.parse(scrubBrandedText(jsonText));
        return sampleEventMetadataFromValue(parsed);
      } catch {
        return { shape: "unknown", keys: [] };
      }
    }
  }
  if (/^["'`]/.test(trimmed)) return { shape: "string", keys: [] };
  return { shape: "unknown", keys: [] };
}

function readEventSummaryMetadata(source) {
  const templates = [];
  let count = 0;
  for (const match of source.matchAll(/\bsummary\s*:/g)) {
    const raw = source.slice(match.index + match[0].length, findExpressionValueEnd(source, match.index + match[0].length)).trim();
    if (!raw) continue;
    count += 1;
    const text = cleanText(parseStringContent(raw));
    if (text) templates.push(text);
  }
  if (!count) return undefined;
  return {
    count,
    templates: templates.filter(unique).sort(),
    dynamic: count > templates.length,
  };
}

function sampleEventMetadataFromValue(value) {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object" && !Array.isArray(item));
    return { shape: "array", keys: first ? Object.keys(first).map(scrubIdentifier).sort() : [] };
  }
  if (value && typeof value === "object") {
    return { shape: "object", keys: Object.keys(value).map(scrubIdentifier).sort() };
  }
  if (typeof value === "string") return { shape: "string", keys: [] };
  return { shape: "unknown", keys: [] };
}

function readDefaultExportExpression(source) {
  const match = /export\s+default\s+/.exec(source);
  if (!match) return undefined;
  return source.slice(match.index + match[0].length).trim().replace(/;?\s*$/, "");
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
  if (!specifier.startsWith(".")) return resolveExternalComponentImport(specifier);
  const base = path.resolve(path.dirname(filePath), specifier);
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, path.join(base, "index.mjs"), path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function resolveExternalComponentImport(specifier) {
  const scope = `@${String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109).toLowerCase()}/`;
  if (!specifier.startsWith(scope)) return null;
  const [componentId, ...subpath] = specifier.slice(scope.length).split("/");
  if (!componentId || componentId === "platform" || componentId === "types") return null;
  const componentDir = path.join(componentsDir, componentId);
  if (!fs.existsSync(componentDir)) return null;
  if (!subpath.length) return findAppFile(componentDir);
  const base = path.join(componentDir, ...subpath);
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, path.join(base, "index.mjs"), path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function findAppFile(appDir) {
  const rootFile = fs.readdirSync(appDir).find((name) => name.endsWith(".app.mjs") || name.endsWith(".app.js") || name.endsWith(".app.ts"));
  if (rootFile) return path.join(appDir, rootFile);
  const nestedDir = path.join(appDir, "app");
  if (!fs.existsSync(nestedDir)) return null;
  const nestedFile = fs.readdirSync(nestedDir).find((name) => name.endsWith(".app.mjs") || name.endsWith(".app.js") || name.endsWith(".app.ts"));
  return nestedFile ? path.join(nestedDir, nestedFile) : null;
}

function optionalBoolean(key, value) {
  return typeof value === "boolean" ? { [key]: value } : {};
}

function optionalNumber(key, value) {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } : {};
}

function optionalAccessMode(value) {
  return value === "read" || value === "write" ? { accessMode: value } : {};
}

function readBoolean(body, key) {
  const raw = readTopLevelValue(body, key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function readNumber(body, key) {
  const raw = readTopLevelValue(body, key);
  const value = raw ? parseLiteral(raw.trim()) : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readDefault(body) {
  const raw = readTopLevelValue(body, "default");
  if (!raw) return undefined;
  return parseLiteral(raw.trim());
}

function readOptions(body, source, filePath) {
  const raw = readTopLevelValue(body, "options");
  if (!raw) return [];
  const entries = [
    ...parseStaticOptionsValue(raw),
    ...parseStaticOptionsValue(resolveStaticValueFromExpression(raw, source, filePath)),
  ];
  return entries.filter((entry, index, array) => array.findIndex((candidate) => candidate.value === entry.value) === index);
}

function parseStaticOptionsValue(value) {
  if (typeof value !== "string") return [];
  const trimmed = stripOptionExpression(value.trim());
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return parseOptionsArray(trimmed);
  if (trimmed.startsWith("{")) return parseObjectValuesAsOptions(trimmed);
  const objectValues = /^Object\.values\s*\((.+)\)(?:\s*\.map\s*\(.+)?$/s.exec(trimmed);
  if (objectValues) {
    return parseStaticOptionsValue(resolveStaticValueFromExpression(objectValues[1]));
  }
  return [];
}

function parseOptionsArray(value) {
  const items = readArrayItems(value);
  const entries = [];
  for (const item of items) {
    const option = parseOptionItem(item);
    if (option) entries.push(option);
  }
  return entries;
}

function parseObjectValuesAsOptions(value) {
  const body = objectBodyFromValue(value);
  if (!body) return [];
  const entries = [];
  for (const key of readObjectKeys(body)) {
    const raw = readTopLevelValue(body, key);
    const option = parseOptionItem(raw);
    if (option) entries.push(option);
  }
  return entries;
}

function parseOptionItem(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = stripOptionExpression(value.trim());
  if (trimmed.startsWith("{")) {
    const body = objectBodyFromValue(trimmed);
    if (!body) return undefined;
    const literal = parseLiteral(readTopLevelValue(body, "value")?.trim() ?? "");
    if (!["string", "number", "boolean"].includes(typeof literal)) return undefined;
    return {
      ...optionalString("label", cleanText(readTopLevelString(body, "label"))),
      value: literal,
      ...optionalString("description", cleanText(readTopLevelString(body, "description"))),
    };
  }
  const literal = parseLiteral(trimmed);
  if (!["string", "number", "boolean"].includes(typeof literal)) return undefined;
  return { value: literal };
}

function stripOptionExpression(value) {
  const objectValues = /^Object\.values\s*\((.+)\)(?:\s*\.map\s*\(.+)?$/s.exec(value);
  if (objectValues) return `Object.values(${objectValues[1]})`;
  return value;
}

function resolveStaticValueFromExpression(value, source, filePath, seen = new Set()) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const objectValues = /^Object\.values\s*\((.+)\)(?:\s*\.map\s*\(.+)?$/s.exec(trimmed);
  if (objectValues) return resolveStaticValueFromExpression(objectValues[1], source, filePath, seen);
  const ref = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/.exec(trimmed)?.[1];
  if (!ref || !source || !filePath) return undefined;
  return resolveStaticRef(ref.split("."), source, filePath, seen);
}

function resolveStaticRef(parts, source, filePath, seen = new Set()) {
  const [head, ...tail] = parts;
  if (!head) return undefined;
  const key = `${filePath}:${parts.join(".")}`;
  if (seen.has(key)) return undefined;
  seen.add(key);

  const imports = readImportBindings(source, filePath);
  const imported = imports.get(head);
  if (imported && fs.existsSync(imported.file)) {
    const importedSource = readText(imported.file);
    if (imported.kind === "namespace") {
      return resolveStaticRef(tail, importedSource, imported.file, seen);
    }
    const base = imported.kind === "default"
      ? readDefaultExportValue(importedSource, imported.file, seen)
      : readStaticBindingValue(importedSource, imported.imported, imported.file, seen);
    return resolveStaticMember(base, tail, importedSource, imported.file, seen);
  }

  const local = readStaticBindingValue(source, head, filePath, seen);
  return resolveStaticMember(local, tail, source, filePath, seen);
}

function resolveStaticMember(value, parts, source, filePath, seen) {
  let current = value;
  for (const part of parts) {
    const body = objectBodyFromValue(current ?? "");
    if (!body) return undefined;
    const raw = readObjectPropertyValue(body, part, source, filePath, seen);
    if (!raw) return undefined;
    current = raw;
  }
  return current;
}

function readStaticBindingValue(source, name, filePath, seen) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=`, "m").exec(source);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const raw = readInitializerValue(source, start);
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(raw)) {
    return resolveStaticValueFromExpression(raw, source, filePath, seen);
  }
  return raw;
}

function readDefaultExportValue(source, filePath, seen) {
  const match = /export\s+default\s+/.exec(source);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const raw = readInitializerValue(source, start);
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(raw)) {
    return resolveStaticValueFromExpression(raw, source, filePath, seen);
  }
  return raw;
}

function readObjectPropertyValue(body, key, source, filePath, seen) {
  const raw = readTopLevelValue(body, key);
  if (raw) return raw;
  return objectHasShorthandKey(body, key) ? resolveStaticValueFromExpression(key, source, filePath, seen) : undefined;
}

function readImportBindings(source, filePath) {
  const imports = new Map();
  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*,?\s*(?:{([^}]+)})?\s+from\s+["']([^"']+)["']/g)) {
    const resolved = resolveLocalImport(filePath, match[3]);
    if (!resolved) continue;
    imports.set(match[1], { kind: "default", imported: "default", file: resolved });
    if (match[2]) readNamedImportBindings(match[2], resolved, imports);
  }
  for (const match of source.matchAll(/import\s+{([^}]+)}\s+from\s+["']([^"']+)["']/g)) {
    const resolved = resolveLocalImport(filePath, match[2]);
    if (resolved) readNamedImportBindings(match[1], resolved, imports);
  }
  for (const match of source.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g)) {
    const resolved = resolveLocalImport(filePath, match[2]);
    if (resolved) imports.set(match[1], { kind: "namespace", imported: "*", file: resolved });
  }
  return imports;
}

function readNamedImportBindings(body, file, imports) {
  for (const part of body.split(",")) {
    const [imported, local = imported] = part.split(/\s+as\s+/).map((value) => value.trim()).filter(Boolean);
    if (imported && local) imports.set(local, { kind: "named", imported, file });
  }
}

function readInitializerValue(source, start) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index += 1;
  const opener = source[index];
  if (opener === "{" || opener === "[") {
    const closer = opener === "{" ? "}" : "]";
    const end = findMatchingDelimiter(source, index, opener, closer);
    return end < 0 ? "" : source.slice(index, end + 1).trim();
  }
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (source[cursor] === ";" || source[cursor] === "\n") {
      return source.slice(index, cursor).trim();
    }
  }
  return source.slice(index).trim();
}

function objectHasShorthandKey(body, key) {
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
    const match = /^([A-Za-z_$][\w$]*)/.exec(body.slice(index));
    if (!match) continue;
    const name = match[1];
    const rest = body.slice(index + name.length).trimStart();
    if (name === key && (rest.startsWith(",") || rest === "")) return true;
    index += name.length - 1;
  }
  return false;
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

function parseLiteral(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const stringValue = /^["'`]([^"'`]*)["'`]$/.exec(raw)?.[1];
  return stringValue === undefined ? undefined : (cleanText(stringValue) ?? "");
}

function readTopLevelString(body, key) {
  const raw = readTopLevelValue(body, key);
  return raw ? /^["'`]([^"'`]*)["'`]$/.exec(raw.trim())?.[1] : undefined;
}

function readTopLevelText(body, key) {
  const raw = readTopLevelValue(body, key);
  if (!raw) return undefined;
  return parseStringContent(raw.trim());
}

function parseStringContent(raw) {
  const quote = raw[0];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return undefined;
  if (raw[raw.length - 1] !== quote) return undefined;
  let value = "";
  let escaped = false;
  for (let index = 1; index < raw.length - 1; index += 1) {
    const char = raw[index];
    if (escaped) {
      if (char === "n") value += "\n";
      else if (char === "t") value += "\t";
      else value += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else {
      value += char;
    }
  }
  return value;
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

function findExpressionValueEnd(body, start) {
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
    if (char === "{" || char === "[" || char === "(") depth += 1;
    else if (char === "}" || char === "]" || char === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
    else if (char === "," && depth === 0) return index;
  }
  return body.length;
}

function unique(value, index, array) {
  return array.indexOf(value) === index;
}

function firstMatch(source, regex) {
  return regex.exec(source)?.[1];
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return null;
  }
}

function readRevision(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}
