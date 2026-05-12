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
  const fields = readFields(source, id);
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
  const files = listFiles(dir).filter((file) => file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".ts"));
  return files
    .filter((file) => !file.endsWith("test-event.mjs") && !file.includes(`${path.sep}common${path.sep}`))
    .map((file) => {
      const source = readText(file);
      const slug = operationSlug(dir, file);
      const key = scrubIdentifier(firstMatch(source, /\bkey:\s*["']([^"']+)["']/) ?? `${appId}-${slug}`);
      const fields = readFields(source, appId, appFields);
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
        runtime: readRuntime(source),
        sourcePath: scrubPath(path.relative(path.dirname(appDir), file).replaceAll(path.sep, "/")),
      };
    });
}

function readFields(source, appId, appFields = []) {
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
  const appFieldByName = new Map(appFields.map((field) => [field.name, field]));
  for (const entry of readFieldEntries(source)) {
    const name = scrubIdentifier(entry.name);
    if (!name || ["props", "propDefinitions", "options"].includes(name)) continue;
    const body = entry.body;
    const propRef = scrubIdentifier(firstMatch(readTopLevelValue(body, "propDefinition") ?? "", /\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s));
    const inherited = propRef ? appFieldByName.get(propRef) : null;
    const type = readTopLevelString(body, "type") ?? (body.includes("type: \"app\"") ? "app" : "string");
    const field = {
      ...(inherited ?? {}),
      name,
      type: inherited?.type ?? type,
      ...optionalString("label", cleanText(readTopLevelString(body, "label"))),
      ...optionalString("description", cleanText(readTopLevelString(body, "description"))),
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...optionalJson("default", readDefault(body)),
      ...optionalOptions(readOptions(body)),
      ...(inherited?.secret || isSecretField(name, body, appId) ? { secret: true } : {}),
    };
    fields.set(name, field);
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

function readRuntime(source) {
  return {
    hasRun: hasComponentMember(source, "run"),
    hasHooks: hasComponentMember(source, "hooks"),
    hasAdditionalProps: /\badditionalProps\s*[:(]/.test(source),
    hasMethods: hasComponentMember(source, "methods"),
    ...optionalString("dedupe", firstMatch(source, /\bdedupe\s*:\s*["'`]([^"'`]+)["'`]/)),
  };
}

function hasComponentMember(source, name) {
  const member = new RegExp(`(?:^|[\\n,{])\\s*(?:async\\s+)?${name}\\s*(?:[:(])`, "m");
  return member.test(source);
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
