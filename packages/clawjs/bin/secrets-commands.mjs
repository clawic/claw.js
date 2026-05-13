// Secrets subcommands for the Clawix CLI. Implemented as a small HTTP
// client against the local Secrets server (default 127.0.0.1:7793).

import readline from "node:readline/promises";
import process from "node:process";

const DEFAULT_BASE = process.env.SECRETS_BASE_URL ?? process.env.CLAW_SECRETS_BASE ?? "http://127.0.0.1:7793";
const DEFAULT_TENANT = process.env.SECRETS_TENANT_ID ?? process.env.CLAW_SECRETS_TENANT ?? "clawix-local";

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
    const assign = (value) => {
      if (out.flags[key] === undefined) out.flags[key] = value;
      else if (Array.isArray(out.flags[key])) out.flags[key].push(value);
      else out.flags[key] = [out.flags[key], value];
    };
    if (next === undefined || next.startsWith("--")) {
      assign(true);
    } else {
      assign(next);
      i++;
    }
  }
  return out;
}

async function fetchJson(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = process.env.SECRETS_TOKEN ?? process.env.SECRETS_ADMIN_TOKEN ?? process.env.CLAW_SECRETS_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;
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

const HELP = `claw secrets <command>

  secrets setup                              initialize the secrets (interactive password)
  secrets unlock                             unlock with password
  secrets lock                               lock the in-memory keys
  secrets recover                            recover via 24-word phrase
  secrets change-password                    rotate password (issues new recovery phrase)
  secrets doctor                             health + integrity report
  secrets state                              show locked/unlocked state

  secrets list [--search <q>] [--folder <id>]
  secrets folders list
  secrets folders create --name <name> [--icon <icon>] [--color <hex>]
  secrets folders rename <id> --name <name>
  secrets folders trash <id>
  secrets describe <name>
  secrets create --file <draft.json>       payload as JSON file
  secrets reveal <name> --field <f> [--purpose uiCopy|uiReveal]
  secrets archive <name> [--off]           archive/unarchive
  secrets compromise <name> [--reason <r>]
  secrets trash <name>
  secrets restore <name>
  secrets execute <name> --executor <id> --args <args.json>
  secrets broker-http --method <m> --url <url> [--header <k:v>] [--body <file>] [--timeout-ms <n>]
  secrets sync <name>                      trigger brand sync
  secrets types                            list registered typeIds
  secrets plugins                          list registered plugins
  secrets backup export --file <path>
  secrets backup import --file <path>

  secrets grants issue --secret <name> --agent <id> --capability <kind> [--scope <json>] [--secrets-caps <list>] [--reason <r>] [--minutes <n>]
  secrets grants list
  secrets grants revoke <id>

  secrets leases issue --secret <name> --mode process|browser [--minutes <n>]
  secrets leases list
  secrets leases revoke <id>

  secrets policies list
  secrets policies create --subject-type <t> --subject-id <id> --secret <name> --capability <c> --effect allow|deny
  secrets policies delete <id>

  secrets audit query [--kinds <csv>] [--since <iso>] [--limit <n>]
  secrets audit verify-integrity

Env: SECRETS_BASE_URL (${DEFAULT_BASE}), SECRETS_TENANT_ID (${DEFAULT_TENANT}), SECRETS_TOKEN
`;

async function secretsSetup() {
  const password = await prompt("Master password: ", true);
  const confirm = await prompt("Confirm password: ", true);
  if (password !== confirm) {
    console.error("Passwords do not match.");
    return 1;
  }
  const res = await fetchJson("/v1/secrets/setup", { method: "POST", body: JSON.stringify({ password }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Secrets initialized.");
  console.log("\nRecovery phrase (write it down NOW, it is shown ONCE):\n");
  console.log(`  ${res.body.recoveryPhrase}\n`);
  return 0;
}

async function secretsUnlock() {
  const password = await prompt("Master password: ", true);
  const res = await fetchJson("/v1/secrets/unlock", { method: "POST", body: JSON.stringify({ password }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Secrets unlocked.");
  return 0;
}

async function secretsLock() {
  const res = await fetchJson("/v1/secrets/lock", { method: "POST" });
  console.log(res.ok ? "Secrets locked." : fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsRecover() {
  const phrase = await prompt("Recovery phrase (24 words): ");
  const res = await fetchJson("/v1/secrets/recover", { method: "POST", body: JSON.stringify({ phrase }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Secrets unlocked via recovery phrase.");
  return 0;
}

async function secretsChangePassword() {
  const oldPassword = await prompt("Current password: ", true);
  const newPassword = await prompt("New password: ", true);
  const res = await fetchJson("/v1/secrets/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log("Password rotated.");
  console.log("\nNew recovery phrase (write it down NOW):\n");
  console.log(`  ${res.body.recoveryPhrase}\n`);
  return 0;
}

async function secretsDoctor() {
  const res = await fetchJson("/v1/secrets/doctor");
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function secretsState() {
  const res = await fetchJson("/v1/secrets/state");
  console.log(fmt(res.body));
  return 0;
}

async function secretsList(flags) {
  const q = new URLSearchParams();
  if (flags.search) q.set("search", String(flags.search));
  if (flags.folder) q.set("folderId", String(flags.folder));
  if (flags["include-trashed"]) q.set("includeTrashed", "true");
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/secrets?${q.toString()}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  for (const s of res.body.secrets ?? []) {
    console.log(`${s.internalName.padEnd(30)} ${s.title.padEnd(30)} ${s.typeId ?? "-"}`);
  }
  return 0;
}

async function foldersList() {
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/folders`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  for (const f of res.body.folders ?? []) {
    console.log(`${f.id}  ${f.name}`);
  }
  return 0;
}

async function foldersCreate(args) {
  const name = args.flags.name;
  if (!name) { console.error("--name required"); return 1; }
  const body = {
    name: String(name),
    ...(args.flags.icon ? { icon: String(args.flags.icon) } : {}),
    ...(args.flags.color ? { color: String(args.flags.color) } : {}),
  };
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/folders`, { method: "POST", body: JSON.stringify(body) });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function foldersRename(args) {
  const id = args._[2];
  const name = args.flags.name;
  if (!id || !name) { console.error("id and --name required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: String(name) }),
  });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

async function foldersTrash(args) {
  const id = args._[2];
  if (!id) { console.error("id required"); return 1; }
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
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

async function secretsBrokerHttp(args) {
  const method = args.flags.method;
  const url = args.flags.url;
  if (!method || !url) { console.error("--method and --url required"); return 1; }
  const fs = await import("node:fs");
  const headers = {};
  const headerFlags = args.flags.header === undefined
    ? []
    : Array.isArray(args.flags.header) ? args.flags.header : [args.flags.header];
  for (const entry of headerFlags) {
    const idx = String(entry).indexOf(":");
    if (idx <= 0) { console.error("--header must be key:value"); return 1; }
    headers[String(entry).slice(0, idx).trim()] = String(entry).slice(idx + 1).trim();
  }
  const body = args.flags.body ? fs.readFileSync(String(args.flags.body), "utf8") : undefined;
  const res = await fetchJson(`/v1/tenants/${DEFAULT_TENANT}/broker/http`, {
    method: "POST",
    body: JSON.stringify({
      method: String(method),
      url: String(url),
      headers,
      ...(body !== undefined ? { body } : {}),
      ...(args.flags["timeout-ms"] ? { timeoutMs: Number(args.flags["timeout-ms"]) } : {}),
    }),
  });
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
    secretsCapabilities: args.flags["secrets-caps"] ? String(args.flags["secrets-caps"]).split(",") : [],
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
  const id = args._[2];
  if (!id) { console.error("id required"); return 1; }
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
  const id = args._[2];
  if (!id) { console.error("id required"); return 1; }
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
  const id = args._[2];
  if (!id) { console.error("id required"); return 1; }
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

async function backupExport(args) {
  const file = args.flags.file;
  if (!file) { console.error("--file required"); return 1; }
  const passphrase = await prompt("Backup passphrase: ", true);
  const confirm = await prompt("Confirm backup passphrase: ", true);
  if (passphrase !== confirm) { console.error("Passphrases do not match."); return 1; }
  const res = await fetchJson("/v1/secrets/backup/export", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  const fs = await import("node:fs");
  fs.writeFileSync(String(file), JSON.stringify(res.body.backup, null, 2));
  console.log(`Secrets backup exported to ${file}`);
  return 0;
}

async function backupImport(args) {
  const file = args.flags.file;
  if (!file) { console.error("--file required"); return 1; }
  const passphrase = await prompt("Backup passphrase: ", true);
  const fs = await import("node:fs");
  const backup = JSON.parse(fs.readFileSync(String(file), "utf8"));
  const res = await fetchJson("/v1/secrets/backup/import", {
    method: "POST",
    body: JSON.stringify({ passphrase, backup }),
  });
  console.log(fmt(res.body));
  return res.ok ? 0 : 1;
}

export async function runSecretsCli(rawArgs) {
  if (rawArgs.length === 0 || rawArgs[0] === "--help" || rawArgs[0] === "-h") {
    console.log(HELP);
    return 0;
  }
  if (rawArgs[0] !== "secrets") {
    console.log(HELP);
    return 1;
  }
  const [, sub, nested, ...rest] = rawArgs;
  const args = parseFlags([sub ?? "", nested ?? "", ...rest].filter(Boolean));

  try {
    switch (sub) {
      case "setup": return await secretsSetup();
      case "unlock": return await secretsUnlock();
      case "lock": return await secretsLock();
      case "recover": return await secretsRecover();
      case "change-password": return await secretsChangePassword();
      case "doctor": return await secretsDoctor();
      case "state": return await secretsState();
      case "list": return await secretsList(args.flags);
      case "folders":
        switch (nested) {
          case "list": return await foldersList();
          case "create": return await foldersCreate(args);
          case "rename": return await foldersRename(args);
          case "trash": return await foldersTrash(args);
          default: console.log(HELP); return 1;
        }
      case "describe": return await secretsDescribe(args);
      case "create": return await secretsCreate(args);
      case "reveal": return await secretsReveal(args);
      case "archive": return await secretsArchive(args);
      case "compromise": return await secretsCompromise(args);
      case "trash": return await secretsTrash(args);
      case "restore": return await secretsRestore(args);
      case "execute": return await secretsExecute(args);
      case "broker-http": return await secretsBrokerHttp(args);
      case "sync": return await secretsSync(args);
      case "types": return await secretsTypes();
      case "plugins": return await secretsPlugins();
      case "backup":
        switch (nested) {
          case "export": return await backupExport(args);
          case "import": return await backupImport(args);
          default: console.log(HELP); return 1;
        }
      case "grants":
        switch (nested) {
          case "issue": return await grantsIssue(args);
          case "list": return await grantsList();
          case "revoke": return await grantsRevoke(args);
          default: console.log(HELP); return 1;
        }
      case "leases":
        switch (nested) {
          case "issue": return await leasesIssue(args);
          case "list": return await leasesList();
          case "revoke": return await leasesRevoke(args);
          default: console.log(HELP); return 1;
        }
      case "policies":
        switch (nested) {
          case "list": return await policiesList();
          case "create": return await policiesCreate(args);
          case "delete": return await policiesDelete(args);
          default: console.log(HELP); return 1;
        }
      case "audit":
        switch (nested) {
          case "query": return await auditQuery(args);
          case "verify-integrity": return await auditVerify();
          default: console.log(HELP); return 1;
        }
      default:
        console.log(HELP);
        return 1;
    }
  } catch (err) {
    console.error("[claw secrets]", err?.message ?? err);
    return 1;
  }
}

export const SECRETS_GROUPS = new Set(["secrets"]);
