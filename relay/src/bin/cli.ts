#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { RelayAuthService } from "../server/auth.ts";
import { PreauthKeyService } from "../server/auth/preauth-keys.ts";
import { loadRelayConfig } from "../server/config.ts";
import { RelayDatabase } from "../server/db.ts";
import { IrohRelayHost, loadIrohRelayHostOptions } from "../server/iroh-relay-host.ts";
import { RelayLogger } from "../server/logger.ts";

interface Command {
  name: string;
  description: string;
  run: (args: string[]) => Promise<void> | void;
}

function usage(commands: Command[]): void {
  const lines = ["clawix-relay <command> [...args]", "", "Commands:"];
  for (const cmd of commands) lines.push(`  ${cmd.name.padEnd(28)}${cmd.description}`);
  lines.push("", "Run `clawix-relay <command> --help` for command-specific options.");
  console.log(lines.join("\n"));
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function withDatabase<T>(handler: (db: RelayDatabase, logger: RelayLogger) => Promise<T>): Promise<T> {
  const config = loadRelayConfig();
  const logger = new RelayLogger();
  const db = new RelayDatabase(config.dbPath);
  try {
    return await handler(db, logger);
  } finally {
    db.close();
  }
}

async function promptInteractive(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || defaultValue || "";
}

const initCommand: Command = {
  name: "init",
  description: "Generate a starter .env for the coordinator",
  async run(args) {
    const flags = parseFlags(args);
    const target = typeof flags.path === "string" ? flags.path : path.join(process.cwd(), ".env");
    if (existsSync(target) && !flags.force) {
      console.error(`Refusing to overwrite ${target}. Pass --force to overwrite.`);
      process.exit(1);
    }
    const publicHost = typeof flags.host === "string"
      ? flags.host
      : await promptInteractive("Public hostname (FQDN, no scheme)", "relay.example.com");
    const adminEmail = typeof flags.email === "string"
      ? flags.email
      : await promptInteractive("Owner email for magic-link sign-in", "you@example.com");
    const tenant = typeof flags.tenant === "string"
      ? flags.tenant
      : await promptInteractive("Tenant id", "default-tenant");
    const jwt = typeof flags["jwt-secret"] === "string"
      ? flags["jwt-secret"]
      : Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
    const lines = [
      `PORT=4410`,
      `RELAY_HOST=0.0.0.0`,
      `RELAY_PUBLIC_BASE_URL=https://${publicHost}`,
      `RELAY_JWT_SECRETS=${jwt}`,
      `RELAY_MAGIC_LINK_TENANT_ID=${tenant}`,
      `RELAY_MAGIC_LINK_FROM=relay@${publicHost}`,
      `RELAY_MAGIC_LINK_DRIVER=console`,
      `# Set RELAY_MAGIC_LINK_DRIVER=resend and RELAY_RESEND_API_KEY=... to enable email delivery`,
      `# Or RELAY_MAGIC_LINK_DRIVER=smtp with RELAY_SMTP_HOST, RELAY_SMTP_PORT, RELAY_SMTP_USER, RELAY_SMTP_PASSWORD`,
      `RELAY_IROH_RELAY_BIN=/usr/local/bin/iroh-relay`,
      `RELAY_IROH_RELAY_PUBLIC_URL=https://${publicHost}/v1/iroh-relay`,
      `RELAY_OWNER_EMAIL=${adminEmail}`,
      `RELAY_DB_PATH=/var/lib/clawix-relay/relay.sqlite`,
    ];
    writeFileSync(target, lines.join("\n") + "\n");
    console.log(`Wrote starter env to ${target}`);
  },
};

const authkeyCommand: Command = {
  name: "authkey",
  description: "Manage pre-auth keys (subcommands: create, list, revoke)",
  async run(args) {
    const sub = args[0];
    const rest = args.slice(1);
    if (sub === "create") {
      const flags = parseFlags(rest);
      await withDatabase(async (db) => {
        const service = new PreauthKeyService(db);
        const issued = service.create({
          tenantId: typeof flags.tenant === "string" ? flags.tenant : "demo-tenant",
          ...(typeof flags.label === "string" ? { label: flags.label } : {}),
          reusable: flags.reusable === true,
          ...(typeof flags["ttl-sec"] === "string" ? { ttlSec: Number(flags["ttl-sec"]) } : {}),
          ...(typeof flags["max-uses"] === "string" ? { maxUses: Number(flags["max-uses"]) } : {}),
        });
        console.log(JSON.stringify({ keyId: issued.keyId, token: issued.token, expiresAt: issued.expiresAt }, null, 2));
      });
      return;
    }
    if (sub === "list") {
      const flags = parseFlags(rest);
      await withDatabase(async (db) => {
        const service = new PreauthKeyService(db);
        const items = service.list(typeof flags.tenant === "string" ? flags.tenant : "demo-tenant");
        console.log(JSON.stringify(items, null, 2));
      });
      return;
    }
    if (sub === "revoke") {
      const flags = parseFlags(rest);
      if (typeof flags.key !== "string") {
        console.error("--key <keyId> is required");
        process.exit(1);
      }
      await withDatabase(async (db) => {
        const service = new PreauthKeyService(db);
        const ok = service.revoke(
          typeof flags.tenant === "string" ? flags.tenant : "demo-tenant",
          flags.key as string,
        );
        console.log(JSON.stringify({ revoked: ok }));
      });
      return;
    }
    console.error("Subcommand required: create | list | revoke");
    process.exit(1);
  },
};

const usersCommand: Command = {
  name: "users",
  description: "Inspect/invite users (subcommands: list, invite, revoke)",
  async run(args) {
    const sub = args[0];
    const rest = args.slice(1);
    if (sub === "list") {
      const flags = parseFlags(rest);
      await withDatabase(async (db) => {
        const items = db.listTenantMembers(typeof flags.tenant === "string" ? flags.tenant : "demo-tenant");
        console.log(JSON.stringify(items, null, 2));
      });
      return;
    }
    if (sub === "invite") {
      const flags = parseFlags(rest);
      if (typeof flags.email !== "string") {
        console.error("--email <addr> is required");
        process.exit(1);
      }
      const tenantId = typeof flags.tenant === "string" ? flags.tenant : "demo-tenant";
      await withDatabase(async (db, logger) => {
        db.ensureTenant(tenantId, tenantId);
        const created = db.createMagicLinkToken({
          email: (flags.email as string).toLowerCase(),
          tenantId,
          purpose: "sign-in",
          ttlSec: 60 * 60 * 24,
        });
        logger.info(`Invite token for ${flags.email}: ${created.token}`);
        console.log(JSON.stringify({ token: created.token, expiresAt: created.expiresAt }, null, 2));
      });
      return;
    }
    if (sub === "revoke") {
      const flags = parseFlags(rest);
      if (typeof flags.email !== "string") {
        console.error("--email <addr> is required");
        process.exit(1);
      }
      const tenantId = typeof flags.tenant === "string" ? flags.tenant : "demo-tenant";
      await withDatabase(async (db) => {
        const members = db.listTenantMembers(tenantId);
        const target = members.find((m) => m.email === (flags.email as string).toLowerCase());
        if (!target) {
          console.error("user_not_found");
          process.exit(1);
        }
        db.sqlite.prepare("DELETE FROM memberships WHERE user_id = ? AND tenant_id = ?")
          .run(target.userId, tenantId);
        console.log(JSON.stringify({ revoked: true }));
      });
      return;
    }
    console.error("Subcommand required: list | invite | revoke");
    process.exit(1);
  },
};

const relayUrlCommand: Command = {
  name: "relay-url",
  description: "Print the iroh-relay URL exposed by this coordinator",
  async run() {
    const config = loadRelayConfig();
    const logger = new RelayLogger();
    const host = new IrohRelayHost(config, logger, loadIrohRelayHostOptions());
    const info = host.describe();
    console.log(JSON.stringify({
      publicBaseUrl: config.publicBaseUrl,
      irohRelay: info,
    }, null, 2));
  },
};

const versionCommand: Command = {
  name: "version",
  description: "Print version info",
  run() {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string; name?: string };
      console.log(`${pkg.name ?? "clawix-relay"} ${pkg.version ?? "0.0.0"}`);
    } catch {
      console.log("clawix-relay (version unknown)");
    }
  },
};

async function main(): Promise<void> {
  const commands: Command[] = [initCommand, authkeyCommand, usersCommand, relayUrlCommand, versionCommand];
  const [, , name, ...rest] = process.argv;
  if (!name || name === "--help" || name === "-h") {
    usage(commands);
    return;
  }
  const cmd = commands.find((entry) => entry.name === name);
  if (!cmd) {
    usage(commands);
    process.exit(1);
  }
  await cmd.run(rest);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
