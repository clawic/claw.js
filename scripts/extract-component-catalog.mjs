#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args.source ?? process.env.CLAWJS_COMPONENTS_SOURCE_DIR ?? "");
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
  const appFile = fs.readdirSync(appDir).find((name) => name.endsWith(".app.mjs") || name.endsWith(".app.js"));
  if (!appFile) return null;
  const appPath = path.join(appDir, appFile);
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
    const propRef = scrubIdentifier(firstMatch(readTopLevelValue(body, "propDefinition") ?? "", /\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s));
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
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...optionalJson("default", readDefault(body)),
      ...optionalOptions(readOptions(body)),
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

function readOptions(body) {
  const raw = readTopLevelValue(body, "options");
  if (!raw) return [];
  const entries = [];
  for (const match of raw.matchAll(/{([^{}]+)}/g)) {
    const optionBody = match[1] ?? "";
    const value = parseLiteral(firstMatch(optionBody, /\bvalue:\s*([^,\n}]+)/)?.trim() ?? "");
    if (!["string", "number", "boolean"].includes(typeof value)) continue;
    entries.push({
      ...optionalString("label", cleanText(firstMatch(optionBody, /\blabel:\s*["'`]([^"'`]+)["'`]/))),
      value,
      ...optionalString("description", cleanText(firstMatch(optionBody, /\bdescription:\s*["'`]([^"'`]+)["'`]/))),
    });
  }
  if (!entries.length) {
    for (const match of raw.matchAll(/["']([^"']+)["']/g)) {
      entries.push({ value: cleanText(match[1]) ?? match[1] });
    }
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
