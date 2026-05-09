// Vault subcommands for the Clawix CLI. Implemented as a small HTTP
// client against the local Vault server (default 127.0.0.1:7793).

import readline from "node:readline/promises";
import process from "node:process";

const DEFAULT_BASE = process.env.CLAWJS_VAULT_BASE ?? "http://127.0.0.1:7793";
const DEFAULT_TENANT = process.env.CLAWJS_VAULT_TENANT ?? "clawix-local";

function parseFlags(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out.flags[key] = true;
    } else {
      out.flags[key] = next;
      i++;
    }
  }
  return out;
}

async function fetchJson(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (process.env.CLAWJS_VAULT_TOKEN) headers["Authorization"] = `Bearer ${process.env.CLAWJS_VAULT_TOKEN}`;
  const res = await fetch(`${DEFAULT_BASE}${path}`, { ...init, headers });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

async function prompt(question, hidden = false) {
  if (hidden && process.stdin.isTTY) {
    process.stdout.write(question);
    return await new Promise((resolve) => {
      const stdin = process.stdin;
      const previous = stdin.isRaw;
      stdin.setRawMode?.(true);
      stdin.resume();
      let data = "";
      const onData = (chunk) => {
        const s = chunk.toString("utf8");
        if (s === "\n" || s === "\r" || s === "\r\n" || s === "") {
          stdin.removeListener("data", onData);
          stdin.setRawMode?.(previous ?? false);
          stdin.pause();
          process.stdout.write("\n");
          resolve(data);
        } else if (s === "") {
          process.exit(130);
        } else if (s === "" || s === "\b") {
          if (data.length > 0) data = data.slice(0, -1);
        } else {
          data += s;
        }
      };
      stdin.on("data", onData);
    });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(question); } finally { rl.close(); }
}

function fmt(value) {
  return JSON.stringify(value, null, 2);
}

const HELP = `claw vault | secrets | grants | leases | policies | audit

  vault setup                              initialize the vault (interactive password)
  vault unlock                             unlock with password
  vault lock                               lock the in-memory keys
  vault recover                            recover via 12-word phrase
  vault change-password                    rotate password (issues new recovery phrase)
  vault doctor                             health + integrity report
  vault state                              show locked/unlocked state

  secrets list [--search <q>] [--vault <id>]
  secrets describe <name>
  secrets create --file <draft.json>       payload as JSON file
  secrets reveal <name> --field <f> [--purpose uiCopy|uiReveal]
  secrets archive <name> [--off]           archive/unarchive
  secrets compromise <name> [--reason <r>]
  secrets trash <name>
  secrets restore <name>
  secrets execute <name> --executor <id> --args <args.json>
  secrets sync <name>                      trigger brand sync
  secrets types                            list registered typeIds
  secrets plugins                          list registered plugins

  grants issue --secret <name> --agent <id> --capability <kind> [--scope <json>] [--vault-caps <list>] [--reason <r>] [--minutes <n>]
  grants list
  grants revoke <id>

  leases issue --secret <name> --mode process|browser [--minutes <n>]
  leases list
  leases revoke <id>

  policies list
  policies create --subject-type <t> --subject-id <id> --secret <name> --capability <c> --effect allow|deny
  policies delete <id>

  audit query [--kinds <csv>] [--since <iso>] [--limit <n>]
  audit verify-integrity

Env: CLAWJS_VAULT_BASE (${DEFAULT_BASE}), CLAWJS_VAULT_TENANT (${DEFAULT_TENANT}), CLAWJS_VAULT_TOKEN
`;

async function vaultSetup() {
  const password = await prompt("Master password: ", true);
  const confirm = await prompt("Confirm password: ", true);
  if (password !== confirm) {
    console.error("Passwords do not match.");
    return 1;
  }
  const res = await fetchJson("/v1/vault/setup", { method: "POST", body: JSON.stringify({ password }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Vault initialized.");
  console.log("\nRecovery phrase (write it down NOW, it is shown ONCE):\n");
  console.log(`  ${res.body.recoveryPhrase}\n`);
  return 0;
}

async function vaultUnlock() {
  const password = await prompt("Master password: ", true);
  const res = await fetchJson("/v1/vault/unlock", { method: "POST", body: JSON.stringify({ password }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Vault unlocked.");
  return 0;
}

async function vaultLock() {
  const res = await fetchJson("/v1/vault/lock", { method: "POST" });
  console.log(res.ok ? "Vault locked." : fmt(res.body));
  return res.ok ? 0 : 1;
}

async function vaultRecover() {
  const phrase = await prompt("Recovery phrase (12 words): ");
  const res = await fetchJson("/v1/vault/recover", { method: "POST", body: JSON.stringify({ phrase }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Vault unlocked via recovery phrase.");
  return 0;
}

async function vaultChangePassword() {
  const oldPassword = await prompt("Current password: ", true);
  const newPassword = await prompt("New password: ", true);
  const res = await fetchJson("/v1/vault/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Password rotated.");
  console.log("\nNew recovery phrase (write it down NOW):\n");
  console.log(`  ${res.body.recoveryPhrase}\n`);
  return 0;
}

async function vaultDoctor() {
  const res = await fetchJson("/v1/vault/doctor");
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function vaultState() {
  const res = await fetchJson("/v1/vault/state");
  console.log(fmt(res.body));
  return 0;
}

async function secretsList(flags) {
  const q = new URLSearchParams();
  if (flags.search) q.set("search", String(flags.search));
  if (flags.vault) q.set("vaultId", String(flags.vault));
  if (flags["include-trashed"]) q.set("includeTrashed", "true");
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets?${q.toString()}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  for (const s of res.body.secrets ?? []) {
    console.log(`${s.internalName.padEnd(30)} ${s.title.padEnd(30)} ${s.typeId ?? "-"}`);
  }
  return 0;
}

async function secretsDescribe(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body.secret));
  return 0;
}

async function secretsCreate(args) {
  const file = args.flags.file;
  if (!file) { console.error("--file <draft.json> required"); return 1; }
  const fs = await import("node:fs");
  const draft = JSON.parse(fs.readFileSync(String(file), "utf8"));
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets`, {
    method: "POST", body: JSON.stringify({ draft }),
  });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsReveal(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const field = args.flags.field;
  if (!field) { console.error("--field required"); return 1; }
  const purpose = args.flags.purpose ?? "uiReveal";
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/reveal-field`, {
    method: "POST",
    body: JSON.stringify({ field: String(field), purpose: String(purpose) }),
  });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(res.body.value?.value ?? "");
  return 0;
}

async function secretsArchive(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const archived = args.flags.off ? false : true;
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/archive`, {
    method: "POST", body: JSON.stringify({ archived }),
  });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsCompromise(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/compromise`, {
    method: "POST", body: JSON.stringify({ compromised: true, reason: args.flags.reason ?? null }),
  });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsTrash(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}`, { method: "DELETE" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsRestore(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/restore`, { method: "POST" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsExecute(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const executor = args.flags.executor;
  if (!executor) { console.error("--executor required"); return 1; }
  let body = {};
  if (args.flags.args) {
    const fs = await import("node:fs");
    body = { args: JSON.parse(fs.readFileSync(String(args.flags.args), "utf8")) };
  }
  const res = await fetchJson(
    `/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/execute/${encodeURIComponent(String(executor))}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsSync(args) {
  const name = args._[1];
  if (!name) { console.error("name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets/${encodeURIComponent(name)}/sync`, { method: "POST" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsTypes() {
  const res = await fetchJson("/v1/secret-types");
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  for (const t of res.body.types ?? []) {
    console.log(`${t.typeId.padEnd(30)} ${t.label}`);
  }
  return 0;
}

async function secretsPlugins() {
  const res = await fetchJson("/v1/plugins");
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function grantsIssue(args) {
  const body = {
    secretName: args.flags.secret,
    agent: args.flags.agent,
    capability: { kind: args.flags.capability, ...(args.flags.scope ? JSON.parse(String(args.flags.scope)) : {}) },
    vaultCapabilities: args.flags["vault-caps"] ? String(args.flags["vault-caps"]).split(",") : [],
    reason: args.flags.reason ?? "issued via CLI",
    durationMinutes: args.flags.minutes ? Number(args.flags.minutes) : 10,
  };
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/grants`, { method: "POST", body: JSON.stringify(body) });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function grantsList() {
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/grants`);
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function grantsRevoke(args) {
  const id = args._[1];
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/grants/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function leasesIssue(args) {
  const body = {
    secretName: args.flags.secret,
    mode: args.flags.mode,
    durationMinutes: args.flags.minutes ? Number(args.flags.minutes) : 10,
  };
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/leases`, { method: "POST", body: JSON.stringify(body) });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function leasesList() {
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/leases`);
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function leasesRevoke(args) {
  const id = args._[1];
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/leases/${encodeURIComponent(id)}/revoke`, { method: "POST" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function policiesList() {
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/policies`);
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function policiesCreate(args) {
  const body = {
    subjectType: args.flags["subject-type"],
    subjectId: args.flags["subject-id"],
    secretName: args.flags.secret,
    capability: args.flags.capability,
    effect: args.flags.effect,
  };
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/policies`, { method: "POST", body: JSON.stringify(body) });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function policiesDelete(args) {
  const id = args._[1];
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/policies/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function auditQuery(args) {
  const q = new URLSearchParams();
  if (args.flags.kinds) q.set("kinds", String(args.flags.kinds));
  if (args.flags.since) q.set("since", String(args.flags.since));
  if (args.flags.limit) q.set("limit", String(args.flags.limit));
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/audit?${q.toString()}`);
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function auditVerify() {
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/audit/verify-integrity`, { method: "POST" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

export async function runVaultCli(rawArgs) {
  if (rawArgs.length === 0 || rawArgs[0] === "--help" || rawArgs[0] === "-h") {
    console.log(HELP);
    return 0;
  }
  const [group, sub, ...rest] = rawArgs;
  const args = parseFlags([sub ?? "", ...rest].filter(Boolean));

  try {
    switch (group) {
      case "vault":
        switch (sub) {
          case "setup": return await vaultSetup();
          case "unlock": return await vaultUnlock();
          case "lock": return await vaultLock();
          case "recover": return await vaultRecover();
          case "change-password": return await vaultChangePassword();
          case "doctor": return await vaultDoctor();
          case "state": return await vaultState();
          default: console.log(HELP); return 1;
        }
      case "secrets":
        switch (sub) {
          case "list": return await secretsList(args.flags);
          case "describe": return await secretsDescribe(args);
          case "create": return await secretsCreate(args);
          case "reveal": return await secretsReveal(args);
          case "archive": return await secretsArchive(args);
          case "compromise": return await secretsCompromise(args);
          case "trash": return await secretsTrash(args);
          case "restore": return await secretsRestore(args);
          case "execute": return await secretsExecute(args);
          case "sync": return await secretsSync(args);
          case "types": return await secretsTypes();
          case "plugins": return await secretsPlugins();
          default: console.log(HELP); return 1;
        }
      case "grants":
        switch (sub) {
          case "issue": return await grantsIssue(args);
          case "list": return await grantsList();
          case "revoke": return await grantsRevoke(args);
          default: console.log(HELP); return 1;
        }
      case "leases":
        switch (sub) {
          case "issue": return await leasesIssue(args);
          case "list": return await leasesList();
          case "revoke": return await leasesRevoke(args);
          default: console.log(HELP); return 1;
        }
      case "policies":
        switch (sub) {
          case "list": return await policiesList();
          case "create": return await policiesCreate(args);
          case "delete": return await policiesDelete(args);
          default: console.log(HELP); return 1;
        }
      case "audit":
        switch (sub) {
          case "query": return await auditQuery(args);
          case "verify-integrity": return await auditVerify();
          default: console.log(HELP); return 1;
        }
      default:
        console.log(HELP);
        return 1;
    }
  } catch (err) {
    console.error("[claw vault]", err?.message ?? err);
    return 1;
  }
}

export const VAULT_GROUPS = new Set(["vault", "secrets", "grants", "leases", "policies", "audit"]);
