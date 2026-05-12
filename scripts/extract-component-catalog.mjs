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
  const id = firstMatch(source, /\bapp:\s*["']([^"']+)["']/) ?? fallbackId;
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
      const key = firstMatch(source, /\bkey:\s*["']([^"']+)["']/) ?? `${appId}-${slug}`;
      const fields = readFields(source, appId, appFields);
      const authFieldNames = [
        ...appAuthFields,
        ...fields.filter((field) => field.secret).map((field) => field.name),
      ].filter(unique);
      return {
        id: `${appId}.${kind}.${slug}`,
        appId,
        kind,
        key,
        name: cleanText(firstMatch(source, /\bname:\s*["'`]([^"'`]+)["'`]/) ?? titleize(slug)),
        ...optionalString("description", cleanText(firstMatch(source, /\bdescription:\s*["'`]([^"'`]+)["'`]/))),
        ...optionalString("version", firstMatch(source, /\bversion:\s*["']([^"']+)["']/)),
        fields,
        authFieldNames,
        sourcePath: path.relative(path.dirname(appDir), file).replaceAll(path.sep, "/"),
      };
    });
}

function readFields(source, appId, appFields = []) {
  const fields = new Map();
  for (const match of source.matchAll(/import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+["'][^"']+\.app\.mjs["']/g)) {
    const name = match[1];
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
  for (const match of source.matchAll(/(?:^|[\n,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*{([^{}]*(?:\btype\b|\blabel\b|\bpropDefinition\b)[^{}]*)}/gs)) {
    const name = match[1];
    if (!name || ["props", "propDefinitions", "options"].includes(name)) continue;
    const body = match[2] ?? "";
    const propRef = firstMatch(body, /\bpropDefinition:\s*\[\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*["']([^"']+)["']/s);
    const inherited = propRef ? appFieldByName.get(propRef) : null;
    const type = firstMatch(body, /\btype:\s*["']([^"']+)["']/) ?? (body.includes("type: \"app\"") ? "app" : "string");
    const field = {
      ...(inherited ?? {}),
      name,
      type: inherited?.type ?? type,
      ...optionalString("label", cleanText(firstMatch(body, /\blabel:\s*["'`]([^"'`]+)["'`]/))),
      ...optionalString("description", cleanText(firstMatch(body, /\bdescription:\s*["'`]([^"'`]+)["'`]/))),
      optional: inherited?.optional ?? /\boptional:\s*true\b/.test(body),
      ...(inherited?.secret || isSecretField(name, body, appId) ? { secret: true } : {}),
    };
    fields.set(name, field);
  }
  return [...fields.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isSecretField(name, body, appId) {
  if (body.includes('type: "app"') || body.includes("type: 'app'")) return true;
  if (body.includes(`app: "${appId}"`) || body.includes(`app: '${appId}'`)) return true;
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
  const branded = new RegExp(String.fromCharCode(80, 105, 112, 101, 100, 114, 101, 97, 109), "gi");
  const cleaned = value.replace(branded, "component").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
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
