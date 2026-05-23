#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceConversationId = "source:remote-gateway-sync";
const sourcePlanId = "plan:remote-gateway-sync";
const sourceQaReviewPath = path.join(rootDir, "docs/governance/remote-gateway-sync/source-review.json");

const requiredEvidence = [
  { qaId: "QA-001", decisionKey: "relay_boundary", allOf: ["Separar capas (Recommended)"] },
  { qaId: "QA-002", decisionKey: "server_trust_model", allOf: ["Doble modo (Recommended)"] },
  { qaId: "QA-003", decisionKey: "remote_surface_parity", allOf: ["Todo clasificable (Recommended)"] },
  { qaId: "QA-004", decisionKey: "topology_priority", allOf: ["red de nodos heterogeneos", "un Mac con movil"] },
  { qaId: "QA-005", decisionKey: "sync_authority_model", allOf: ["autoridad sera por recurso"] },
  { qaId: "QA-006", decisionKey: "remote_secrets_model", allOf: ["secretos no se replican como plaintext", "referencias, capacidades y leases auditados"] },
  { qaId: "QA-007", decisionKey: "transport_contract", allOf: ["Adaptador principal (Recommended)"] },
  { qaId: "QA-008", decisionKey: "remote_api_shape", allOf: ["Misma API proyectada (Recommended)"] },
  { qaId: "QA-009", decisionKey: "offline_behavior", allOf: ["Separar comando/sync (Recommended)"] },
  { qaId: "QA-010", decisionKey: "remote_actor_model", allOf: ["Autoridad unificada (Recommended)"] },
  { qaId: "QA-011", decisionKey: "headless_host_model", allOf: ["Host completo (Recommended)"] },
  { qaId: "QA-012", decisionKey: "first_vertical_slice", allOf: ["chat, la sincronizacion, la busqueda", "referencias de secretos", "ejecutable al 100%"] },
  { qaId: "QA-013", decisionKey: "sync_substrate", allOf: ["manifest", "change log", "sincronizaciones de cualquier tipo"] },
  { qaId: "QA-014", decisionKey: "conflict_default", allOf: ["Detectar y elevar (Recommended)"] },
  { qaId: "QA-015", decisionKey: "client_cache_policy", allOf: ["Cache cifrada minima (Recommended)"] },
  { qaId: "QA-016", decisionKey: "guardrail_strictness", allOf: ["Fail cerrado (Recommended)"] },
  { qaId: "QA-017", decisionKey: "compat_policy", allOf: ["Compat con adaptadores (Recommended)"] },
  { qaId: "QA-018", decisionKey: "hosted_service_position", allOf: ["Paridad total"] },
  { qaId: "QA-019", decisionKey: "layer_names", allOf: ["Coordinator/Gateway/Connector/Sync (Recommended)"] },
  { qaId: "QA-020", decisionKey: "mesh_collaboration_scope", allOf: ["Primitivas si (Recommended)"] },
  { qaId: "QA-021", decisionKey: "agent_service_model", allOf: ["Multi-tenant gobernado (Recommended)"] },
  { qaId: "QA-022", decisionKey: "sync_lateral_domains", allOf: ["skills", "memoria compartida", "drive, o los archivos", "bases de datos"] },
  { qaId: "QA-023", decisionKey: "goal_closure_gate", allOf: ["hasta que no este 100% finalizado", "revisar una a una todas las preguntas - respuestas"] },
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function sessionPathFromArgs() {
  const sessionFlagIndex = process.argv.indexOf("--session");
  if (sessionFlagIndex >= 0) return process.argv[sessionFlagIndex + 1];
  const inlineFlag = process.argv.find((arg) => arg.startsWith("--session="));
  if (inlineFlag) return inlineFlag.slice("--session=".length);
  return process.env.REMOTE_SYNC_SOURCE_SESSION;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") {
    strings.push(value);
    return strings;
  }
  if (!value || typeof value !== "object") return strings;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
    return strings;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "encrypted_content") continue;
    collectStrings(item, strings);
  }
  return strings;
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loadJson(relativePath, absolutePath) {
  const targetPath = absolutePath ?? path.join(rootDir, relativePath);
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    fail(`${relativePath} must be valid JSON`);
    return {};
  }
}

const sessionPath = sessionPathFromArgs();
if (!sessionPath) {
  console.error("usage: REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> node scripts/verify-remote-sync-source-session.mjs");
  console.error("   or: node scripts/verify-remote-sync-source-session.mjs --session <local-source-session-jsonl>");
  process.exit(1);
}

if (!fs.existsSync(sessionPath)) {
  console.error(`remote sync source session not found: ${sessionPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(sessionPath, "utf8").split(/\n/).filter((line) => line.trim().length > 0);
const parsedRecords = [];
for (let index = 0; index < lines.length; index += 1) {
  try {
    parsedRecords.push({ lineNumber: index + 1, value: JSON.parse(lines[index]) });
  } catch (error) {
    fail(`session line ${index + 1} must be valid JSON`);
  }
}

const sessionMeta = parsedRecords.find((record) => record.value?.type === "session_meta")?.value?.payload;
if (!sessionMeta?.id) {
  fail("session_meta id must be present");
}

let sawClosureRequest = false;
const sourceWindowRecords = [];
for (const record of parsedRecords) {
  sourceWindowRecords.push(record);
  const recordText = collectStrings(record.value).join("\n");
  if (recordText.includes("hasta que no") && recordText.includes("100% finalizado")) sawClosureRequest = true;
  if (sawClosureRequest) break;
}

if (!sawClosureRequest) fail("source session must include the goal closure request");

const sourceWindowText = normalizeText(sourceWindowRecords.flatMap((record) => collectStrings(record.value)).join("\n"));

for (const check of requiredEvidence) {
  if (!check.allOf.every((needle) => sourceWindowText.includes(normalizeText(needle)))) {
    fail(`${check.qaId} ${check.decisionKey} missing required source-session evidence`);
  }
}

const qaReview = loadJson("docs/governance/remote-gateway-sync/source-review.json", sourceQaReviewPath);
if (qaReview.sourceConversationId !== sourceConversationId) {
  fail("source Q/A review must bind the source conversation id");
}
if (qaReview.sourcePlanId !== sourcePlanId) {
  fail("source Q/A review must bind the source plan id");
}
if (!Array.isArray(qaReview.items) || qaReview.items.length !== requiredEvidence.length) {
  fail(`source Q/A review must contain ${requiredEvidence.length} items`);
}

const reviewItems = new Map((qaReview.items ?? []).map((item) => [item.qaId, item]));
for (const check of requiredEvidence) {
  const reviewItem = reviewItems.get(check.qaId);
  if (!reviewItem) {
    fail(`source Q/A review missing ${check.qaId}`);
    continue;
  }
  if (reviewItem.decisionKey !== check.decisionKey) {
    fail(`${check.qaId} decision key must be ${check.decisionKey}`);
  }
  if (!Array.isArray(reviewItem.evidenceRefs) || reviewItem.evidenceRefs.length === 0) {
    fail(`${check.qaId} must keep at least one evidence ref`);
  }
}

if (failures.length > 0) {
  console.error("remote sync source session verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`remote sync source session verification passed (${requiredEvidence.length} Q/A rows)`);
