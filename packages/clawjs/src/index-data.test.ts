import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import { clawStorageFiles, resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_OK, runCli } from "./index.ts";
import { resolveClawjsDataRoot, resolveClawjsFilesDir, resolveClawjsMainDbPath } from "./v1-data.ts";
import { ensureV1MainSchema, writeMcpServers } from "./v1-data-core.ts";
import { captureStream, runInternalV1Cli, useIsolatedClawDataRoot, withPatchedEnv } from "./index-test-utils.ts";

function parseCliJsonPayload<T>(output: string): T {
  const parsed = JSON.parse(output) as { ok?: boolean; data?: unknown; meta?: Record<string, unknown> };
  assert.equal(parsed.ok, true);
  assert.equal(typeof parsed.meta?.canonicalCommand, "string");
  assert.equal(parsed.meta?.schemaVersion, 1);
  return parsed.data as T;
}

test("V2 main data paths default to the Claw home data namespace", () => {
  assert.equal(resolveClawjsDataRoot({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length)));
  assert.equal(resolveClawjsMainDbPath({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length), "core.sqlite"));
  assert.equal(resolveClawjsFilesDir({} as NodeJS.ProcessEnv), path.join(os.homedir(), resolveClawPersistentSurfacePath("claw.global.data").slice("~/".length), "files"));

  const explicit = path.join(os.tmpdir(), "clawjs-explicit-root");
  assert.equal(resolveClawjsDataRoot({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), explicit);
  assert.equal(resolveClawjsMainDbPath({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), path.join(explicit, "core.sqlite"));
  assert.equal(
    resolveClawjsDataRoot({
      CLAW_HOME: path.join(os.tmpdir(), "claw-home"),
      CLAW_DATA_DIR: explicit,
    } as NodeJS.ProcessEnv),
    explicit,
  );
  assert.equal(
    resolveClawjsDataRoot({ CLAW_HOME: path.join(os.tmpdir(), "claw-home") } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "claw-home", "data"),
  );
  assert.equal(
    resolveClawjsMainDbPath({
      CLAW_DATA_DIR: explicit,
      CLAW_DB_PATH: path.join(os.tmpdir(), "custom-core.sqlite"),
    } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "custom-core.sqlite"),
  );
});

test("mcp config writes refuse Codex-owned config paths", () => {
  const codexConfig = path.join(os.homedir(), ".codex", `clawjs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`);
  assert.equal(fs.existsSync(codexConfig), false);
  assert.throws(
    () => writeMcpServers(codexConfig, [{ id: "browser", command: "npx" }]),
    /Refusing write operation inside ~\/\.codex/,
  );
  assert.equal(fs.existsSync(codexConfig), false);
});

test("app-state projects persist opaque resource ids alongside paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-"));
  let restoreEnv: (() => void) | undefined;
  const dataRoot = useIsolatedClawDataRoot({ after: (fn) => { restoreEnv = fn; } }, workspaceRoot);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-cwd-"));
  const stdout = captureStream();
  assert.equal(await runInternalV1Cli(["app-state", "project", "upsert", "proj-local", "--resource-id", "res_projectxyz", "--name", "Project", "--path", cwd, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const project = parseCliJsonPayload(stdout.getOutput()) as { id: string; resourceId: string; path: string };
  assert.equal(project.resourceId, "res_projectxyz");
  const sqlitePath = path.join(dataRoot, clawStorageFiles.mainDatabase);
  const sqlite = new Database(sqlitePath);
  try {
    assert.deepEqual(sqlite.prepare("SELECT resource_id, path FROM app_projects WHERE id = ?").get("proj-local"), { resource_id: "res_projectxyz", path: cwd });
  } finally {
    sqlite.close();
    restoreEnv?.();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("V2 main schema upgrades app project resource ids before indexing them", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-schema-upgrade-"));
  await withPatchedEnv({ CLAW_DATA_DIR: tempRoot }, async () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE app_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL DEFAULT '',
          sort_order INTEGER,
          hidden INTEGER NOT NULL DEFAULT 0,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      ensureV1MainSchema(sqlite);
      const columns = sqlite.prepare("PRAGMA table_info(app_projects)").all() as Array<{ name: string }>;
      assert.equal(columns.some((column) => column.name === "resource_id"), true);
      const indexes = sqlite.prepare("PRAGMA index_list(app_projects)").all() as Array<{ name: string }>;
      assert.equal(indexes.some((index) => index.name === "app_projects_resource_id_idx"), true);
    } finally {
      sqlite.close();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("runCli manages V2 knowledge, notes, profile, business, and search domains in the main sqlite", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-data-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-data-cwd-"));
    const notesStdout = captureStream();
    assert.equal(await runCli(["notes", "record-note", "Server runbook", "--body", "Deploy from the release branch", "--tags", "ops,runbook", "--json"], {
      stdout: notesStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const page = parseCliJsonPayload(notesStdout.getOutput()) as { id: string; title: string; tags: string[]; blocks: Array<{ text: string }> };
    assert.equal(page.title, "Server runbook");
    assert.deepEqual(page.tags, ["ops", "runbook"]);
    assert.equal(page.blocks[0]?.text, "Deploy from the release branch");

    const journalStdout = captureStream();
    assert.equal(await runCli(["notes", "create", "Private journal", "--body", "Therapy reflection stays private", "--space", "journal", "--sensitivity", "sensitive", "--json"], {
      stdout: journalStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const journal = parseCliJsonPayload(journalStdout.getOutput()) as { id: string; space: string; sensitivity: string };
    assert.equal(journal.space, "journal");
    assert.equal(journal.sensitivity, "sensitive");

    const notesSearchStdout = captureStream();
    assert.equal(await runCli(["notes", "search", "Therapy reflection", "--json"], {
      stdout: notesSearchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const notesSearch = parseCliJsonPayload(notesSearchStdout.getOutput()) as { items: Array<{ id: string }> };
    assert.deepEqual(notesSearch.items.map((item) => item.id), [journal.id]);

    const wikiStdout = captureStream();
    assert.equal(await runCli(["wiki", "create", "Ops handbook", "--body", "Runbooks live as wiki pages backed by Notes", "--json"], {
      stdout: wikiStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const wikiPage = parseCliJsonPayload(wikiStdout.getOutput()) as { id: string; space: string; surface: string };
    assert.equal(wikiPage.space, "wiki");
    assert.equal(wikiPage.surface, "wiki_page");
    const wikiSearchStdout = captureStream();
    assert.equal(await runCli(["wiki", "search", "Runbooks", "--json"], {
      stdout: wikiSearchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const wikiSearch = parseCliJsonPayload(wikiSearchStdout.getOutput()) as { items: Array<{ id: string; space: string }> };
    assert.deepEqual(wikiSearch.items.map((item) => item.id), [wikiPage.id]);
    assert.deepEqual(wikiSearch.items.map((item) => item.space), ["wiki"]);

    const exportStdout = captureStream();
    assert.equal(await runCli(["notes", "export", page.id, "--json"], {
      stdout: exportStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.match((parseCliJsonPayload(exportStdout.getOutput()) as { markdown: string }).markdown, /# Server runbook/);

    assert.equal(await runCli(["knowledge", "fact", "--predicate", "prefers_response_style", "--value", "direct", "--confidence", "0.9", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const profileStdout = captureStream();
    assert.equal(await runCli(["profile", "get", "--json"], {
      stdout: profileStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const profile = parseCliJsonPayload(profileStdout.getOutput()) as { items: Array<{ section: string; contentText: string }> };
    assert.deepEqual(profile.items.map((item) => item.section), ["prefers_response_style"]);
    assert.equal(profile.items[0]?.contentText, "direct");
    assert.equal(profile.items.some((item) => /Therapy reflection/.test(item.contentText)), false);

    const businessStdout = captureStream();
    assert.equal(await runInternalV1Cli(["business", "upsert", "--id", "customer-1", "--kind", "customer", "--name", "Acme", "--notes", "Primary account", "--json"], {
      stdout: businessStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(businessStdout.getOutput()) as { pageId: string }).pageId, "page-customer-1");

    const financeStdout = captureStream();
    assert.equal(await runInternalV1Cli(["finance", "upsert", "--id", "txn-1", "--amount", "-19.99", "--currency", "USD", "--merchant", "Coffee", "--category", "food", "--json"], {
      stdout: financeStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const finance = parseCliJsonPayload(financeStdout.getOutput()) as { id: string; amount: number; merchant: string; category: string };
    assert.equal(finance.id, "txn-1");
    assert.equal(finance.amount, -19.99);
    assert.equal(finance.merchant, "Coffee");
    assert.equal(finance.category, "food");

    const ledgerEntryStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ledger", "entry", "upsert", "--id", "invoice-1", "--description", "Invoice paid", "--date", "2026-05-13", "--json"], {
      stdout: ledgerEntryStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(ledgerEntryStdout.getOutput()) as { id: string; entryDate: string }).entryDate, "2026-05-13");

    const ledgerLineStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ledger", "line", "add", "--entry-id", "invoice-1", "--account-code", "1010", "--amount", "1200", "--currency", "USD", "--json"], {
      stdout: ledgerLineStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const ledgerLine = parseCliJsonPayload(ledgerLineStdout.getOutput()) as { entryId: string; accountCode: string; amountCents: number; side: string };
    assert.equal(ledgerLine.entryId, "invoice-1");
    assert.equal(ledgerLine.accountCode, "1010");
    assert.equal(ledgerLine.amountCents, 120000);
    assert.equal(ledgerLine.side, "debit");

    const agentStdout = captureStream();
    assert.equal(await runCli(["agents", "upsert", "agent-ops", "--name", "Ops", "--secret-ref", "vault://agents/ops", "--json"], {
      stdout: agentStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const agent = parseCliJsonPayload(agentStdout.getOutput()) as { id: string; secretAllowlist: unknown };
    assert.equal(agent.id, "agent-ops");
    assert.equal(agent.secretAllowlist, "[REDACTED]");
    const agentHostStdout = captureStream();
    assert.equal(await runCli(["agents", "get", "agent-ops", "--for-host", "true", "--json"], {
      stdout: agentHostStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliJsonPayload(agentHostStdout.getOutput()) as { secretAllowlist: string[] }).secretAllowlist, ["vault://agents/ops"]);

    const agentsSchemaStdout = captureStream();
    assert.equal(await runCli(["agents", "schema", "--json"], {
      stdout: agentsSchemaStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const agentsSchema = parseCliJsonPayload(agentsSchemaStdout.getOutput()) as { canonicalCollection: string; subentities: string[]; defaultPosture: string };
    assert.equal(agentsSchema.canonicalCollection, "agents");
    assert.equal(agentsSchema.subentities.includes("agent_assignments"), true);
    assert.equal(agentsSchema.subentities.includes("agent_resource_grants"), true);
    assert.equal(agentsSchema.defaultPosture, "empty_sandbox_respond_only");

    const accessStdout = captureStream();
    const accessRecord = {
      requested: { resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" },
      agentGrants: [{ id: "agent", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
      assignmentGrants: [{ id: "assignment", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
      executionProfileGrants: [{ id: "execution", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
      connectorGrants: [{ id: "connector", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
      hostGrants: [{ id: "host", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
      runScopeGrants: [{ id: "run", resourceType: "contact", action: "read", scopeType: "customer", scopeId: "customer_1" }],
    };
    assert.equal(await runCli(["agents", "evaluate-access", "--record", JSON.stringify(accessRecord), "--json"], {
      stdout: accessStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(accessStdout.getOutput()) as { allowed: boolean }).allowed, true);

    const routeStdout = captureStream();
    const routeRecord = {
      assignment: {
        id: "assignment.web",
        agentId: "agent-ops",
        kind: "external_web_chat",
        status: "paused",
        channel: "chat",
        externalDisclosure: "transparent_agent",
      },
      kind: "external_web_chat",
      channel: "chat",
    };
    assert.equal(await runCli(["agents", "route-check", "--record", JSON.stringify(routeRecord), "--json"], {
      stdout: routeStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const routeResult = parseCliJsonPayload(routeStdout.getOutput()) as { allowed: boolean; reasons: string[]; disclosureRequired: boolean };
    assert.equal(routeResult.allowed, false);
    assert.deepEqual(routeResult.reasons, ["assignment: status paused"]);
    assert.equal(routeResult.disclosureRequired, true);

    const identityStdout = captureStream();
    assert.equal(await runCli(["agents", "resolve-external-identity", "--record", JSON.stringify({
      provider: "web",
      externalId: "visitor-strong",
      email: "visitor@example.com",
      customerId: "customer_1",
      ip: "203.0.113.20",
      privacyPolicy: "hashed",
    }), "--json"], {
      stdout: identityStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const identity = parseCliJsonPayload(identityStdout.getOutput()) as {
      externalUserId: string;
      actorId: string;
      contactProjection: string;
      telemetry: Record<string, string>;
      boundary: { scopeId: string };
    };
    assert.equal(identity.contactProjection, "create_or_update");
    assert.equal(identity.boundary.scopeId, "customer_1");
    assert.equal(typeof identity.telemetry.ipHash, "string");

    const supportProjectionStdout = captureStream();
    assert.equal(await runCli(["agents", "project-support-inbox", "--record", JSON.stringify({
      sessionId: "session_1",
      assignment: { ...routeRecord.assignment, status: "active" },
      identity,
      initialMessage: "Need help",
      now: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: supportProjectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const supportProjection = parseCliJsonPayload(supportProjectionStdout.getOutput()) as { conversation: { externalUserId: string; metadata: { sessionId: string } }; message: { direction: string } };
    assert.equal(supportProjection.conversation.externalUserId, identity.externalUserId);
    assert.equal(supportProjection.conversation.metadata.sessionId, "session_1");
    assert.equal(supportProjection.message.direction, "inbound");

    const memoryStdout = captureStream();
    assert.equal(await runCli(["agents", "memory-check", "--record", JSON.stringify({
      policy: {
        readScopes: [{ layer: "customer", scopeId: "customer_2", access: "read" }],
        writeScopes: [],
        writePolicy: "none",
        crossUserBoundary: "explicit_grant_only",
      },
      request: {
        operation: "read",
        layer: "customer",
        scopeId: "customer_2",
        boundary: { scopeType: "customer", scopeId: "customer_1" },
      },
    }), "--json"], {
      stdout: memoryStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const memoryResult = parseCliJsonPayload(memoryStdout.getOutput()) as { allowed: boolean; reasons: string[] };
    assert.equal(memoryResult.allowed, false);
    assert.deepEqual(memoryResult.reasons, ["memory: cross-boundary access requires explicit grant"]);

    const personalityStdout = captureStream();
    assert.equal(await runCli(["personalities", "upsert", "personality.review", "--name", "Reviewer", "--prompt", "Review with concrete evidence", "--json"], {
      stdout: personalityStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const personality = parseCliJsonPayload(personalityStdout.getOutput()) as { id: string; promptMarkdown: string };
    assert.equal(personality.id, "personality.review");
    assert.equal(personality.promptMarkdown, "Review with concrete evidence");

    const collectionStdout = captureStream();
    assert.equal(await runCli(["skill-collections", "upsert", "collection.review", "--name", "Review", "--tags", "review,code", "--json"], {
      stdout: collectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const collection = parseCliJsonPayload(collectionStdout.getOutput()) as { id: string; includedTags: string[] };
    assert.equal(collection.id, "collection.review");
    assert.deepEqual(collection.includedTags, ["review", "code"]);

    const skillStdout = captureStream();
    assert.equal(await runCli(["skills", "upsert", "deploy", "--name", "Deploy", "--body", "Use deployment APIs by reference", "--secret-refs", "vault://skills/deploy-token", "--json"], {
      stdout: skillStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(skillStdout.getOutput()) as { secretRefs: unknown }).secretRefs, "[REDACTED]");
    const skillGetStdout = captureStream();
    assert.equal(await runCli(["skills", "get", "deploy", "--json"], {
      stdout: skillGetStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(skillGetStdout.getOutput()) as { slug: string; body: string }).body, "Use deployment APIs by reference");

    const connectionStdout = captureStream();
    assert.equal(await runCli(["connections", "upsert", "github", "--provider", "github", "--label", "GitHub", "--secret-ref", "vault://connections/github", "--json"], {
      stdout: connectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.match((parseCliJsonPayload(connectionStdout.getOutput()) as { secretRef: string }).secretRef, /^\*+thub$/);

    const routingStdout = captureStream();
    assert.equal(await runCli(["providers", "routing", "set", "quickask", "--capability", "chat", "--provider", "provider_alpha", "--model", "generic-chat-large", "--account-ref", "vault://providers/provider_alpha/main", "--json"], {
      stdout: routingStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const routing = parseCliJsonPayload(routingStdout.getOutput()) as { feature: string; provider: string; accountRef: string };
    assert.equal(routing.feature, "quickask");
    assert.equal(routing.provider, "provider_alpha");
    assert.equal(routing.accountRef, "vault://providers/provider_alpha/main");

    const providerSettingsStdout = captureStream();
    assert.equal(await runCli(["providers", "settings", "set", "provider_alpha", "--enabled", "false", "--json"], {
      stdout: providerSettingsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const providerSettings = parseCliJsonPayload(providerSettingsStdout.getOutput()) as { provider: string; enabled: boolean };
    assert.equal(providerSettings.provider, "provider_alpha");
    assert.equal(providerSettings.enabled, false);

    const snippetStdout = captureStream();
    assert.equal(await runCli(["snippets", "upsert", "quickask-review", "--title", "QuickAsk Review", "--body", "Review the current selection", "--kind", "prompt", "--skill-refs", "skill:review", "--json"], {
      stdout: snippetStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const snippet = parseCliJsonPayload(snippetStdout.getOutput()) as { slug: string; kind: string; skillRefs: string[] };
    assert.equal(snippet.slug, "quickask-review");
    assert.equal(snippet.kind, "prompt");
    assert.deepEqual(snippet.skillRefs, ["skill:review"]);

    const snippetDeleteStdout = captureStream();
    assert.equal(await runCli(["snippets", "delete", "quickask-review", "--json"], {
      stdout: snippetDeleteStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const deletedSnippet = parseCliJsonPayload(snippetDeleteStdout.getOutput()) as { slug: string; deleted: boolean };
    assert.equal(deletedSnippet.slug, "quickask-review");
    assert.equal(deletedSnippet.deleted, true);

    const routingDeleteStdout = captureStream();
    assert.equal(await runCli(["providers", "routing", "delete", "quickask", "--capability", "chat", "--json"], {
      stdout: routingDeleteStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const deletedRouting = parseCliJsonPayload(routingDeleteStdout.getOutput()) as { feature: string; deleted: boolean };
    assert.equal(deletedRouting.feature, "quickask");
    assert.equal(deletedRouting.deleted, true);

    const iotStdout = captureStream();
    assert.equal(await runCli(["iot", "config", "set", "thermostat", "--name", "Hall thermostat", "--kind", "climate", "--secret-ref", "vault://iot/thermostat", "--json"], {
      stdout: iotStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const iot = parseCliJsonPayload(iotStdout.getOutput()) as { id: string; kind: string; secretRef: string };
    assert.equal(iot.id, "thermostat");
    assert.equal(iot.kind, "climate");
    assert.match(iot.secretRef, /^\*+stat$/);

    const marketplaceStdout = captureStream();
    assert.equal(await runCli(["marketplace", "choice", "upsert", "--target", "default-ai-provider", "--choice", "openai", "--kind", "provider", "--json"], {
      stdout: marketplaceStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const marketplace = parseCliJsonPayload(marketplaceStdout.getOutput()) as { target: string; choice: string; kind: string };
    assert.equal(marketplace.target, "default-ai-provider");
    assert.equal(marketplace.choice, "openai");
    assert.equal(marketplace.kind, "provider");

    const contactsStdout = captureStream();
    assert.equal(await runCli(["db", "contacts", "create", "--data", JSON.stringify({ companyId: "company-demo", email: "demo@example.com", firstName: "Demo" }), "--json"], {
      stdout: contactsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const contact = parseCliJsonPayload(contactsStdout.getOutput()) as { companyId: string; email: string; firstName: string };
    assert.equal(contact.companyId, "company-demo");
    assert.equal(contact.email, "demo@example.com");
    assert.equal(contact.firstName, "Demo");

    const lifeCatalogStdout = captureStream();
    assert.equal(await runCli(["life", "catalog", "--json"], {
      stdout: lifeCatalogStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const lifeCatalog = parseCliJsonPayload(lifeCatalogStdout.getOutput()) as { items: unknown[] };
    assert.equal(Array.isArray(lifeCatalog.items), true);

    const appStdout = captureStream();
    assert.equal(await runCli(["apps", "upsert", "demo-app", "--name", "Demo App", "--path", "apps/demo-app", "--json"], {
      stdout: appStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const app = parseCliJsonPayload(appStdout.getOutput()) as { slug: string; name: string; rootPath: string };
    assert.equal(app.slug, "demo-app");
    assert.equal(app.name, "Demo App");
    assert.equal(app.rootPath, path.join(cwd, "apps/demo-app"));

    const appsListStdout = captureStream();
    assert.equal(await runCli(["apps", "list", "--json"], {
      stdout: appsListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(appsListStdout.getOutput()) as { items: Array<{ slug: string }> }).items.some((item) => item.slug === "demo-app"), true);

    const designStdout = captureStream();
    assert.equal(await runCli(["design", "upsert", "style", "style.demo", "--name", "Demo Style", "--path", "design/style.demo", "--json"], {
      stdout: designStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const design = parseCliJsonPayload(designStdout.getOutput()) as { id: string; kind: string; name: string };
    assert.equal(design.id, "style.demo");
    assert.equal(design.kind, "style");
    assert.equal(design.name, "Demo Style");

    const designListStdout = captureStream();
    assert.equal(await runCli(["design", "list", "--json"], {
      stdout: designListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(designListStdout.getOutput()) as { items: Array<{ id: string }> }).items.some((item) => item.id === "style.demo"), true);

    const mcpConfig = path.join(cwd, "config.toml");
    fs.writeFileSync(mcpConfig, "model = \"gpt\"\n\n[mcp_servers.old]\ncommand = \"old\"\n");
    const mcpUpsertStdout = captureStream();
    assert.equal(await runCli([
      "mcp", "upsert", "browser",
      "--command", "npx",
      "--args", "@modelcontextprotocol/server-browser",
      "--cwd", "/tmp/browser",
      "--env-passthrough", "PATH,HOME",
      "--config", mcpConfig,
      "--json",
    ], {
      stdout: mcpUpsertStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpHttpStdout = captureStream();
    assert.equal(await runCli([
      "mcp", "upsert", "api",
      "--url", "https://example.invalid/mcp",
      "--bearer-token-env-var", "API_TOKEN",
      "--headers", "{\"X-Test\":\"1\"}",
      "--headers-from-env", "{\"Authorization\":\"API_AUTH_HEADER\"}",
      "--enabled", "false",
      "--config", mcpConfig,
      "--json",
    ], {
      stdout: mcpHttpStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpListStdout = captureStream();
    assert.equal(await runCli(["mcp", "list", "--config", mcpConfig, "--json"], {
      stdout: mcpListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpList = parseCliJsonPayload(mcpListStdout.getOutput()) as { items: Array<{ id: string; command?: string; url?: string; args?: string[]; cwd?: string; env_passthrough?: string[]; bearer_token_env_var?: string; headers?: Record<string, string>; headers_from_env?: Record<string, string>; enabled?: boolean }> };
    assert.deepEqual(mcpList.items.map((server) => server.id), ["old", "browser", "api"]);
    const mcpPathStdout = captureStream();
    assert.equal(await runCli(["mcp", "config-path", "--config", mcpConfig, "--json"], {
      stdout: mcpPathStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const mcpPath = parseCliJsonPayload(mcpPathStdout.getOutput()) as { configPath: string; exists: boolean };
    assert.equal(mcpPath.configPath, mcpConfig);
    assert.equal(mcpPath.exists, true);
    const browserServer = mcpList.items.find((server) => server.id === "browser");
    assert.equal(browserServer?.command, "npx");
    assert.deepEqual(browserServer?.args, ["@modelcontextprotocol/server-browser"]);
    assert.equal(browserServer?.cwd, "/tmp/browser");
    assert.deepEqual(browserServer?.env_passthrough, ["PATH", "HOME"]);
    const apiServer = mcpList.items.find((server) => server.id === "api");
    assert.equal(apiServer?.url, "https://example.invalid/mcp");
    assert.equal(apiServer?.bearer_token_env_var, "API_TOKEN");
    assert.deepEqual(apiServer?.headers, { "X-Test": "1" });
    assert.deepEqual(apiServer?.headers_from_env, { Authorization: "API_AUTH_HEADER" });
    assert.equal(apiServer?.enabled, false);
    assert.match(fs.readFileSync(mcpConfig, "utf8"), /^model = "gpt"/);
    assert.match(fs.readFileSync(mcpConfig, "utf8"), /enabled = false/);

    const main = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv), { readonly: true });
    try {
      const agentRow = main.prepare("SELECT secret_ref, agency_mode, autonomy_profile FROM agents WHERE id = ?").get("agent-ops") as { secret_ref: string; agency_mode: string; autonomy_profile: string };
      assert.equal(agentRow.secret_ref, "vault://agents/ops");
      assert.equal(agentRow.agency_mode, "assistant");
      assert.equal(agentRow.autonomy_profile, "act_limited");
      const agentTables = main.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_%' ORDER BY name").all() as Array<{ name: string }>;
      assert.equal(agentTables.some((row) => row.name === "agent_assignments"), true);
      assert.equal(agentTables.some((row) => row.name === "agent_resource_grants"), true);
      assert.equal((main.prepare("SELECT prompt FROM personalities WHERE id = ?").get("personality.review") as { prompt: string }).prompt, "Review with concrete evidence");
      assert.deepEqual(JSON.parse((main.prepare("SELECT metadata_json FROM skill_collections WHERE id = ?").get("collection.review") as { metadata_json: string }).metadata_json), { includedTags: ["review", "code"] });
      assert.deepEqual(JSON.parse((main.prepare("SELECT secret_refs_json FROM skills WHERE slug = ?").get("deploy") as { secret_refs_json: string }).secret_refs_json), ["vault://skills/deploy-token"]);
      assert.equal((main.prepare("SELECT secret_ref FROM connections WHERE id = ?").get("github") as { secret_ref: string }).secret_ref, "vault://connections/github");
      assert.equal((main.prepare("SELECT secret_ref FROM iot_config WHERE id = ?").get("thermostat") as { secret_ref: string }).secret_ref, "vault://iot/thermostat");
      assert.equal((main.prepare("SELECT choice FROM marketplace_choices WHERE target = ?").get("default-ai-provider") as { choice: string }).choice, "openai");
      assert.equal((main.prepare("SELECT root_path FROM apps WHERE slug = ?").get("demo-app") as { root_path: string }).root_path, path.join(cwd, "apps/demo-app"));
      assert.equal((main.prepare("SELECT root_path FROM design_resources WHERE id = ?").get("style.demo") as { root_path: string }).root_path, path.join(cwd, "design/style.demo"));
    } finally {
      main.close();
    }
    const skillDeleteStdout = captureStream();
    assert.equal(await runCli(["skills", "delete", "deploy", "--json"], {
      stdout: skillDeleteStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(skillDeleteStdout.getOutput()) as { slug: string; deleted: boolean }).deleted, true);
    assert.equal(fs.existsSync(path.join(tempRoot, "home", "agents", "agent-ops", "agent.yaml")), true);
    assert.equal(fs.existsSync(path.join(tempRoot, "home", "personalities", "personality.review", "personality.yaml")), true);
    assert.equal(fs.existsSync(path.join(tempRoot, "home", "skill-collections", "collection.review", "collection.yaml")), true);
    assert.equal(fs.existsSync(path.join(tempRoot, "home", "connections", "github", "connection.yaml")), true);

    assert.equal(await runInternalV1Cli(["search", "rebuild", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searchStdout = captureStream();
    assert.equal(await runInternalV1Cli(["search", "query", "release branch", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const search = parseCliJsonPayload(searchStdout.getOutput()) as { pages: Array<{ id: string }> };
    assert.deepEqual(search.pages.map((item) => item.id), [page.id]);

    const doctorStdout = captureStream();
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: doctorStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const doctor = parseCliJsonPayload(doctorStdout.getOutput()) as { version: number; logicalDomains: { mainDb: string[]; sidecars: string[] }; registry: Array<{ domain: string; id: string }> };
    assert.equal(doctor.version, 2);
    assert.ok(doctor.logicalDomains.mainDb.includes("knowledge"));
    assert.ok(doctor.logicalDomains.sidecars.includes("conversation-artifacts"));
    assert.ok(doctor.registry.some((entry) => entry.domain === "conversation-artifacts" && entry.id === "audio"));
  });
});

test("runCli indexes external Codex session artifacts without owning their raw bodies", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v1-sessions-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: path.join(tempRoot, "data"),
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v1-sessions-cwd-"));
    const sessionsRoot = path.join(tempRoot, "codex-sessions");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "11111111-2222-4333-8444-555555555555";
    const artifactPath = path.join(sessionsRoot, `rollout-${sessionId}.jsonl`);
    fs.writeFileSync(artifactPath, [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd, timestamp: "2026-05-12T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Index the large rollout and preserve raw JSONL outside sqlite" } }),
      "",
    ].join("\n"));

    const indexStdout = captureStream();
    assert.equal(await runCli(["sessions", "index", "--root", sessionsRoot, "--json"], {
      stdout: indexStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(indexStdout.getOutput()) as { indexed: number }).indexed, 1);

    const getStdout = captureStream();
    assert.equal(await runCli(["sessions", "get", sessionId, "--json"], {
      stdout: getStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const row = parseCliJsonPayload(getStdout.getOutput()) as { artifactPath: string; source: string; snippet: string; metadata: { artifactKind: string } };
    assert.equal(row.artifactPath, artifactPath);
    assert.equal(row.source, "codex");
    assert.match(row.snippet, /preserve raw JSONL outside sqlite/);
    assert.equal(row.metadata.artifactKind, "codex-rollout");

    const listStdout = captureStream();
    assert.equal(await runCli(["sessions", "list", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const listed = parseCliJsonPayload(listStdout.getOutput()) as { items: Array<{ sessionId: string }> };
    assert.deepEqual(listed.items.map((item) => item.sessionId), [sessionId]);

    const searchStdout = captureStream();
    assert.equal(await runCli(["sessions", "search", "--query", "large rollout", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searched = parseCliJsonPayload(searchStdout.getOutput()) as { items: Array<{ sessionId: string }> };
    assert.deepEqual(searched.items.map((item) => item.sessionId), [sessionId]);

    const sidecarPath = path.join(tempRoot, "data", "sessions.sqlite");
    const sidecar = new Database(sidecarPath, { readonly: true });
    try {
      const sidecarSession = sidecar.prepare("SELECT session_id, artifact_path FROM conversation_sessions WHERE session_id = ?").get(sessionId) as { session_id: string; artifact_path: string };
      assert.equal(sidecarSession.artifact_path, artifactPath);
      const sidecarMessages = sidecar.prepare("SELECT role, text FROM conversation_messages WHERE session_id = ?").all(sessionId) as Array<{ role: string; text: string }>;
      assert.equal(sidecarMessages[0]?.role, "user");
      assert.match(sidecarMessages[0]?.text ?? "", /large rollout/);
    } finally {
      sidecar.close();
    }
  });
});

test("runCli manages V2 conversation artifact sidecars for audio, drive, runtime, search, and backup reset", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecars-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: path.join(tempRoot, "data"),
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecars-cwd-"));
    const audioPath = path.join(cwd, "voice.wav");
    const drivePath = path.join(cwd, "brief.md");
    fs.writeFileSync(audioPath, "fake audio bytes");
    fs.writeFileSync(drivePath, "# Launch brief\n\nAttachment content");

    const audioStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "index", "--file", audioPath, "--session-id", "session-1", "--transcript", "voice note about launch timing", "--json"], {
      stdout: audioStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const audio = parseCliJsonPayload(audioStdout.getOutput()) as { id: string; sidecar: string };
    assert.equal(audio.sidecar, "audio.sqlite");

    const driveStdout = captureStream();
    assert.equal(await runInternalV1Cli(["drive", "index", "--file", drivePath, "--session-id", "session-1", "--json"], {
      stdout: driveStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const drive = parseCliJsonPayload(driveStdout.getOutput()) as { id: string; sidecar: string };
    assert.equal(drive.sidecar, "drive.sqlite");

    const runtimeStdout = captureStream();
    assert.equal(await runInternalV1Cli(["runtime", "queue", "Distill conversation", "--kind", "distillation", "--json"], {
      stdout: runtimeStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(runtimeStdout.getOutput()) as { status: string }).status, "queued");

    const notifyStdout = captureStream();
    assert.equal(await runInternalV1Cli(["notify", "event", "--kind", "delivery", "--message", "Webhook delivered", "--json"], {
      stdout: notifyStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(notifyStdout.getOutput()) as { sidecar: string }).sidecar, "notify.sqlite");

    const monitorStdout = captureStream();
    assert.equal(await runInternalV1Cli(["monitor", "event", "--kind", "heartbeat", "--message", "Worker alive", "--json"], {
      stdout: monitorStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(monitorStdout.getOutput()) as { sidecar: string }).sidecar, "monitor.sqlite");

    const infraStdout = captureStream();
    assert.equal(await runInternalV1Cli(["infra", "event", "--kind", "provider-cache", "--message", "Cache refresh", "--json"], {
      stdout: infraStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(infraStdout.getOutput()) as { sidecar: string }).sidecar, "infra.sqlite");

    const opsStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "metric", "--kind", "api-latency", "--metadata", "{\"p95Ms\":42}", "--json"], {
      stdout: opsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(opsStdout.getOutput()) as { sidecar: string }).sidecar, "ops.sqlite");

    const opsListStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--kind", "api-latency", "--json"], {
      stdout: opsListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const opsList = parseCliJsonPayload(opsListStdout.getOutput()) as { items: Array<{ kind: string; metadata: { p95Ms: number } }> };
    assert.equal(opsList.items[0]?.kind, "api-latency");
    assert.equal(opsList.items[0]?.metadata.p95Ms, 42);

    assert.equal(await runInternalV1Cli(["search", "rebuild", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const searchStdout = captureStream();
    assert.equal(await runInternalV1Cli(["search", "query", "launch timing", "--json"], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const search = parseCliJsonPayload(searchStdout.getOutput()) as { global: Array<{ domain: string; sourceId: string }> };
    assert.ok(search.global.some((item) => item.domain === "audio" && item.sourceId === audio.id));

    const backupDir = path.join(tempRoot, "backup");
    const backupStdout = captureStream();
    assert.equal(await runInternalV1Cli(["data", "backup", "--out", backupDir, "--json"], {
      stdout: backupStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const backup = parseCliJsonPayload(backupStdout.getOutput()) as { copied: string[] };
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/audio.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/drive.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/runtime.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/notify.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/monitor.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/infra.sqlite")));
    assert.ok(backup.copied.some((entry) => entry.endsWith("sidecars/ops.sqlite")));

    assert.equal(await runInternalV1Cli(["data", "reset", "--domain", "conversation-artifacts", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const audioListStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "artifact", "list", "--json"], {
      stdout: audioListStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliJsonPayload(audioListStdout.getOutput()) as { items: unknown[] }).items, []);

    assert.equal(await runInternalV1Cli(["data", "reset", "--domain", "ops", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const opsAfterResetStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--json"], {
      stdout: opsAfterResetStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliJsonPayload(opsAfterResetStdout.getOutput()) as { items: unknown[] }).items, []);

    assert.equal(await runInternalV1Cli(["data", "restore", "--from", backupDir, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const restoredAudioStdout = captureStream();
    assert.equal(await runInternalV1Cli(["audio", "artifact", "list", "--session-id", "session-1", "--json"], {
      stdout: restoredAudioStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(restoredAudioStdout.getOutput()) as { items: unknown[] }).items.length, 1);
    const restoredOpsStdout = captureStream();
    assert.equal(await runInternalV1Cli(["ops", "list", "--kind", "api-latency", "--json"], {
      stdout: restoredOpsStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    assert.equal((parseCliJsonPayload(restoredOpsStdout.getOutput()) as { items: unknown[] }).items.length, 1);
  });
});

test("runCli reset covers V2 main DB retired service tables when present", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-reset-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-reset-cwd-"));
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const tables = [
      "user_profile_items",
      "user_profile_meta",
      "user_profile_history",
      "system_variables",
      "user_variables",
      "observations",
      "sessions",
      "healthkit_sync_state",
      "hidden_system_variables",
      "temporal_items",
      "temporal_executions",
      "temporal_run_log",
      "temporal_projections",
      "wiki_spaces",
    ];
    const primaryCorePath = path.join(tempRoot, "core.sqlite");
    const db = new Database(primaryCorePath);
    try {
      for (const table of tables) {
        db.exec(["CREATE", "TABLE IF NOT EXISTS", table, "(id TEXT PRIMARY KEY)"].join(" "));
        db.prepare(`INSERT OR REPLACE INTO ${table} (id) VALUES (?)`).run(`${table}-1`);
      }
      db.prepare(`
        INSERT OR REPLACE INTO pages (id, title, space, surface, tags_json, properties_json, created_at, updated_at)
        VALUES ('wiki-page-1', 'Wiki page', 'main', 'wiki', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `).run();
    } finally {
      db.close();
    }

    for (const domain of ["user-model", "signals", "time", "wiki"]) {
      assert.equal(await runInternalV1Cli(["data", "reset", "--domain", domain, "--json"], {
        stdout: captureStream().stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);
    }

    const readonlyCorePath = path.join(tempRoot, "core.sqlite");
    const readonly = new Database(readonlyCorePath, { readonly: true });
    try {
      for (const table of tables) {
        assert.equal((readonly.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0, table);
      }
      assert.equal((readonly.prepare("SELECT COUNT(*) AS count FROM pages WHERE surface = 'wiki'").get() as { count: number }).count, 0, "wiki pages");
    } finally {
      readonly.close();
    }
  });
});

test("runCli reset clears V2 sidecar service tables when present", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecar-reset-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-sidecar-reset-cwd-"));
    assert.equal(await runInternalV1Cli(["data", "doctor", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);

    const sidecars = [
      { filename: "audio.sqlite", domain: "audio", table: "voice_tts_runs" },
      { filename: "drive.sqlite", domain: "drive", table: "storage_objects" },
      { filename: "runtime.sqlite", domain: "runtime", table: "sandbox_runs" },
    ];
    for (const sidecar of sidecars) {
      const writableSidecarDbPath = path.join(tempRoot, sidecar.filename);
      const db = new Database(writableSidecarDbPath);
      try {
        db.exec(["CREATE", "TABLE IF NOT EXISTS", sidecar.table, "(id TEXT PRIMARY KEY)"].join(" "));
        db.prepare(`INSERT OR REPLACE INTO ${sidecar.table} (id) VALUES (?)`).run(`${sidecar.table}-1`);
      } finally {
        db.close();
      }
      assert.equal(await runInternalV1Cli(["data", "reset", "--domain", sidecar.domain, "--json"], {
        stdout: captureStream().stream,
        stderr: captureStream().stream,
        cwd,
      }), CLI_EXIT_OK);
      const readonlySidecarPath = path.join(tempRoot, sidecar.filename);
      const readonly = new Database(readonlySidecarPath, { readonly: true });
      try {
        assert.equal((readonly.prepare(`SELECT COUNT(*) AS count FROM ${sidecar.table}`).get() as { count: number }).count, 0, sidecar.table);
      } finally {
        readonly.close();
      }
    }
  });
});

test("runCli mirrors local memory into V2 knowledge and profile projection", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-memory-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-v2-memory-workspace-"));
    const saveStdout = captureStream();
    assert.equal(await runCli([
      "knowledge",
      "memories",
      "save",
      "User prefers concise answers with citations",
      "--workspace", workspaceRoot,
      "--title", "Response preference",
      "--tags", "preference,style",
      "--confidence", "0.8",
      "--json",
    ], {
      stdout: saveStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const saved = parseCliJsonPayload(saveStdout.getOutput()) as { id: string };

    const factsStdout = captureStream();
    assert.equal(await runCli(["knowledge", "list", "--json"], {
      stdout: factsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    const facts = parseCliJsonPayload(factsStdout.getOutput()) as { items: Array<{ id: string; predicate: string; objectValue: { content: string } }> };
    assert.equal(facts.items[0]?.id, `memory:${saved.id}`);
    assert.equal(facts.items[0]?.predicate, "preference");
    assert.match(facts.items[0]?.objectValue.content ?? "", /concise answers/);

    const profileStdout = captureStream();
    assert.equal(await runCli(["profile", "get", "--json"], {
      stdout: profileStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    const profile = parseCliJsonPayload(profileStdout.getOutput()) as { items: Array<{ section: string; contentText: string }> };
    assert.equal(profile.items[0]?.section, "preference");
    assert.match(profile.items[0]?.contentText ?? "", /concise answers/);

    assert.equal(await runCli(["knowledge", "memories", "delete", saved.id, "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const afterDeleteStdout = captureStream();
    assert.equal(await runCli(["knowledge", "list", "--json"], {
      stdout: afterDeleteStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceRoot,
    }), CLI_EXIT_OK);
    assert.deepEqual((parseCliJsonPayload(afterDeleteStdout.getOutput()) as { items: unknown[] }).items, []);
  });
});
