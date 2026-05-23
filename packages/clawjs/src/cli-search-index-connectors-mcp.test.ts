import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runCliCapture, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { runSearchDocsPagesCliWriteScenario, runSearchDocsPagesEventScenario, runSearchDocsPagesScenario } from "./cli-search-docs-pages-test-utils.ts";
import { runSearchLocalFilesEventScenario } from "./cli-search-local-files-test-utils.ts";
import { runSearchSurfaceRouteGraphContractsScenario } from "./cli-search-surface-routes-test-utils.ts";
import { runSearchExternalCacheEventScenario, runSearchWebIngestedEventScenario } from "./cli-search-web-external-test-utils.ts";
import {
  runSearchAgentCatalogFastPathScenario,
  runSearchBusinessRecordFastPathScenario,
  runSearchContentSocialIotFastPathScenario,
  runSearchMarketplaceChoiceFastPathScenario,
  runSearchProvidersSnippetsFastPathScenario,
} from "./cli-search-framework-fast-path-test-utils.ts";
import { ensureV1MainSchema, resolveClawjsMainDbPath } from "./v1-data-core.ts";
test("search rebuild indexes connectors.catalog from control-plane operations without secrets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-connectors-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T12:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
        VALUES ('openai', 'OpenAI', 'external_saas', 1, '{"region":"us"}', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_capabilities (id, domain, action, facet, summary, created_at, updated_at)
        VALUES ('image.edit.background', 'image', 'edit', 'background', 'Edit image backgrounds through a brokered connector.', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_network_policies (id, required, egress_profile_id, vpn_profile_id, allowed_hosts_json, created_at, updated_at)
        VALUES ('openai-egress', 1, 'egress.default', 'vpn.openai', '["api.openai.com"]', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (
          'openai.images.edit', 'openai', 'api', 'supported', 'images.edit',
          '["image.edit.background"]', '["cost"]', 1, 'cost', 1,
          'openai-egress', '{"notes":"background replacement connector operation","workflow":"connectors-metadata-fragment-needle","credentials":{"token":"connectors-metadata-secret-never-index"}}', ?, ?
        )
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_credential_bindings (id, provider_id, secret_ref, scopes_json, operation_ids_json, created_at, updated_at)
        VALUES ('openai.key.admin', 'openai', 'vault://connectors/openai/admin', '["images"]', '["openai.images.edit"]', ?, ?)
      `).run(now, now);
    } finally {
      sqlite.close();
    }
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "connectors.catalog": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("connectors.catalog"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("connectors.catalog"), false);
    assert.equal(rebuildPayload.data.indexedBySource["connectors.catalog"], 1);
    const query = await runCliCapture(["search", "query", "image backgrounds", "--domains", "connectors", "--filters", "metadata.provider=openai", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { provider?: string; support?: string; requiresApproval?: boolean; costRisk?: string; capabilityId?: string[] };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
      };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "OpenAI images.edit");
    assert.equal(result?.source, "connectors.catalog");
    assert.equal(result?.domain, "connectors");
    assert.equal(result?.type, "operation");
    assert.equal(result?.metadata?.provider, "openai");
    assert.equal(result?.metadata?.support, "supported");
    assert.equal(result?.metadata?.requiresApproval, true);
    assert.equal(result?.metadata?.costRisk, "cost");
    assert.deepEqual(result?.metadata?.capabilityId, ["image.edit.background"]);
    assert.equal(result?.actions?.some((action) => action.id === "execute" && action.kind === "custom" && action.requiresApproval === true && action.grant === "search.connectors.execute"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "image.edit.background" && fragment.snippet?.includes("brokered connector")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("connectors-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(result).includes("vault://connectors/openai/admin"), false);
    const metadataQuery = await runCliCapture(["search", "query", "connectors-metadata-fragment-needle", "--sources", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "connectors.catalog" && entry.title === "OpenAI images.edit");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("connectors-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture(["search", "query", "connectors-metadata-secret-never-index", "--sources", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "connectors.catalog" && entry.title === "OpenAI images.edit"), false);
  });
});
test("search service resource jobs refresh only the targeted connector operation", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-connectors-resource-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T12:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
        VALUES ('openai', 'OpenAI', 'external_saas', 1, '{}', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_capabilities (id, domain, action, facet, summary, created_at, updated_at)
        VALUES ('image.edit.background', 'image', 'edit', 'background', 'Edit image backgrounds through a brokered connector.', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (?, 'openai', 'api', 'supported', ?, '["image.edit.background"]', '["cost"]', 1, 'cost', 1, NULL, ?, ?, ?)
      `).run("openai.images.edit", "images.edit", JSON.stringify({ notes: "needle connector alpha only" }), now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (?, 'openai', 'api', 'supported', ?, '["image.edit.background"]', '["cost"]', 1, 'cost', 1, NULL, ?, ?, ?)
      `).run("openai.images.generate", "images.generate", JSON.stringify({ notes: "needle connector beta only" }), now, now);
    } finally {
      sqlite.close();
    }
    const scheduled = await runCliCapture([
      "search",
      "jobs",
      "schedule",
      "upsert",
      "--source",
      "connectors.catalog",
      "--resource-id",
      "openai.images.edit",
      "--payload",
      JSON.stringify({ operationId: "openai.images.edit" }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item: { source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; operationId?: string } } };
    };
    assert.equal(scheduledPayload.data.item.source, "connectors.catalog");
    assert.equal(scheduledPayload.data.item.operation, "upsert");
    assert.equal(scheduledPayload.data.item.resourceId, "openai.images.edit");
    assert.equal(scheduledPayload.data.item.payload.eventDriven, true);
    assert.equal(scheduledPayload.data.item.payload.operationId, "openai.images.edit");
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "connectors.catalog");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);
    const store = new SearchStore(registeredSearchDatabasePath(dataRoot));
    try {
      assert.equal(store.query({ query: "images edit", sources: ["connectors.catalog"] }).results.length, 1);
      const generatedRow = store.db.prepare("SELECT id FROM search_documents WHERE source = ? AND resource_id = ? AND deleted_at IS NULL").get("connectors.catalog", "openai.images.generate");
      assert.equal(generatedRow, undefined);
    } finally {
      store.close();
    }
    const deleteSqlite = new Database(resolveClawjsMainDbPath());
    try {
      deleteSqlite.prepare("DELETE FROM connector_operations WHERE id = ?").run("openai.images.edit");
    } finally {
      deleteSqlite.close();
    }
    const deleted = await runCliCapture([
      "search",
      "jobs",
      "schedule",
      "delete",
      "--source",
      "connectors.catalog",
      "--resource-id",
      "openai.images.edit",
      "--payload",
      JSON.stringify({ operationId: "openai.images.edit" }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const connectorDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "connectors.catalog");
    assert.deepEqual({ source: connectorDeleteRunItem?.source, operation: connectorDeleteRunItem?.operation, status: connectorDeleteRunItem?.status, indexed: connectorDeleteRunItem?.indexed }, { source: "connectors.catalog", operation: "delete", status: "done", indexed: 1 });
    const afterConnectorDelete = await runCliCapture(["search", "query", "alpha", "--sources", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterConnectorDelete.code, CLI_EXIT_DEGRADED, afterConnectorDelete.stderr || afterConnectorDelete.stdout);
    const afterConnectorDeletePayload = JSON.parse(afterConnectorDelete.stdout) as any;
    assert.equal(afterConnectorDeletePayload.data.results.some((entry: any) => entry.source === "connectors.catalog" && entry.resourceId === "openai.images.edit"), false);
  });
});
test("connector operation writes enqueue and tombstone connectors catalog search events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-connectors-writes-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const upserted = await runCliCapture([
      "connectors",
      "operation",
      "upsert",
      "openai.images.edit",
      "--provider",
      "openai",
      "--provider-name",
      "OpenAI",
      "--runtime-kind",
      "api",
      "--support",
      "supported",
      "--native-name",
      "images.edit",
      "--capabilities",
      "image.edit.background",
      "--cost-risk",
      "cost",
      "--requires-approval",
      "true",
      "--metadata",
      JSON.stringify({ notes: "evented connector operation metadata needle" }),
      "--json",
    ], workspaceRoot);
    assert.equal(upserted.code, CLI_EXIT_OK, upserted.stderr || upserted.stdout);
    const upsertJobs = await runCliCapture(["search", "jobs", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(upsertJobs.code, CLI_EXIT_OK);
    const upsertJobsPayload = JSON.parse(upsertJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; operationId?: string } }> };
    };
    const upsertJob = upsertJobsPayload.data.items.find((job) => job.resourceId === "openai.images.edit" && job.operation === "upsert");
    assert.equal(upsertJob?.source, "connectors.catalog");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload.eventDriven, true);
    assert.equal(upsertJob?.payload.operationId, "openai.images.edit");
    const upsertRun = await runCliCapture(["search", "service", "run-once", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(upsertRun.code, CLI_EXIT_OK);
    const upsertRunItem = (JSON.parse(upsertRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "connectors.catalog");
    assert.deepEqual({ source: upsertRunItem?.source, operation: upsertRunItem?.operation, status: upsertRunItem?.status, indexed: upsertRunItem?.indexed }, { source: "connectors.catalog", operation: "upsert", status: "done", indexed: 1 });
    const query = await runCliCapture(["search", "query", "evented connector operation metadata needle", "--sources", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
    const queryPayload = JSON.parse(query.stdout) as any;
    assert.equal(queryPayload.data.results.some((entry: any) => entry.source === "connectors.catalog" && entry.resourceId === "openai.images.edit"), true);
    const deleted = await runCliCapture(["connectors", "operation", "delete", "openai.images.edit", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; operationId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === "openai.images.edit" && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.operationId, "openai.images.edit");
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunItem = (JSON.parse(deleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "connectors.catalog");
    assert.deepEqual({ source: deleteRunItem?.source, operation: deleteRunItem?.operation, status: deleteRunItem?.status, indexed: deleteRunItem?.indexed }, { source: "connectors.catalog", operation: "delete", status: "done", indexed: 1 });
    const afterDelete = await runCliCapture(["search", "query", "evented connector operation metadata needle", "--sources", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED, afterDelete.stderr || afterDelete.stdout);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as any;
    assert.equal(afterDeletePayload.data.results.some((entry: any) => entry.source === "connectors.catalog" && entry.resourceId === "openai.images.edit"), false);
  });
});
test("search rebuild indexes mcp.servers without secret values", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const configPath = path.join(workspaceRoot, [["co", "dex"].join(""), "config.toml"].join("-"));
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const envSecretFixture = ["super", "secret", "env", "value"].join("-");
    const headerSecretFixture = ["super", "secret", "header", "value"].join("-");
    const argSecretFixture = ["secret", "arg", "value"].join("-");
    fs.writeFileSync(configPath, [
      "[mcp_servers.docs]",
      "command = \"node\"",
      `args = ["server.js", "--token", "${argSecretFixture}"]`,
      "cwd = \"/tmp/docs-server\"",
      "env_passthrough = [\"SAFE_TOKEN\"]",
      "",
      "[mcp_servers.docs.env]",
      `API_TOKEN = "${envSecretFixture}"`,
      "",
      "[mcp_servers.docs.headers]",
      `Authorization = "Bearer ${headerSecretFixture}"`,
      "",
      "[mcp_servers.docs.headers_from_env]",
      "X_API_KEY = \"DOCS_API_KEY\"",
    ].join("\n"));
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "mcp.servers", "--mcp-config", configPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "mcp.servers": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("mcp.servers"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("mcp.servers"), false);
    assert.equal(rebuildPayload.data.indexedBySource["mcp.servers"], 1);
    const query = await runCliCapture(["search", "query", "docs node API_TOKEN", "--domains", "mcp", "--mcp-config", configPath, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { transport?: string; enabled?: boolean; envKey?: unknown; headerKey?: unknown; headersFromEnvKey?: unknown };
          fragments?: Array<{ title?: string; snippet?: string; metadata?: { redactedValues?: boolean } }>;
        }>;
      };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "docs");
    assert.equal(result?.source, "mcp.servers");
    assert.equal(result?.domain, "mcp");
    assert.equal(result?.type, "server");
    assert.equal(result?.metadata?.transport, "stdio");
    assert.equal(result?.metadata?.enabled, true);
    assert.equal(result?.metadata?.envKey, "[REDACTED]");
    assert.equal(result?.metadata?.headerKey, "[REDACTED]");
    assert.equal(result?.metadata?.headersFromEnvKey, "[REDACTED]");
    const redactedConfigFragment = result?.fragments?.find((fragment) => fragment.title === "redacted config");
    assert.ok(redactedConfigFragment);
    assert.equal(redactedConfigFragment?.snippet?.includes("API_TOKEN"), true);
    assert.equal(redactedConfigFragment?.snippet?.includes("X_API_KEY"), true);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(envSecretFixture), false);
    assert.equal(serialized.includes(headerSecretFixture), false);
    assert.equal(serialized.includes(`Bearer ${headerSecretFixture}`), false);
    assert.equal(serialized.includes(argSecretFixture), false);
  });
});
test("mcp writes enqueue and refresh mcp.servers jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-events-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const configPath = path.join(workspaceRoot, "codex-config.toml");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const upsert = await runInternalV1Cli([
      "mcp",
      "upsert",
      "localdocs",
      "--command",
      "node",
      "--args",
      JSON.stringify(["server.js"]),
      "--env",
      JSON.stringify({ DOCS_TOKEN: "hidden-token" }),
      "--config",
      configPath,
      "--json",
    ], { stdout: stdout.stream, stderr: stderr.stream, cwd: workspaceRoot });
    assert.equal(upsert, CLI_EXIT_OK);
    const jobs = await runCliCapture(["search", "jobs", "--source", "mcp.servers", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; serverId?: string; configPath?: string } }> };
    };
    const job = jobsPayload.data.items.find((item) => item.resourceId === "localdocs");
    assert.equal(job?.source, "mcp.servers");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.shard, "hot");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.serverId, "localdocs");
    assert.equal(job?.payload.configPath, configPath);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "mcp.servers", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const query = await runCliCapture(["search", "query", "localdocs DOCS_TOKEN", "--domains", "mcp", "--mcp-config", configPath, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { envKey?: unknown }; fragments?: Array<{ snippet?: string; metadata?: { redactedValues?: boolean } }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "localdocs");
    assert.equal(result?.source, "mcp.servers");
    assert.equal(result?.domain, "mcp");
    assert.equal(result?.type, "server");
    assert.equal(result?.metadata?.envKey, "[REDACTED]");
    assert.equal(JSON.stringify(result).includes("hidden-token"), false);
    const deleteStdout = captureStream();
    const deleteStderr = captureStream();
    const deleted = await runInternalV1Cli(["mcp", "delete", "localdocs", "--config", configPath, "--json"], { stdout: deleteStdout.stream, stderr: deleteStderr.stream, cwd: workspaceRoot });
    assert.equal(deleted, CLI_EXIT_OK);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "mcp.servers", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const mcpDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "mcp.servers");
    assert.deepEqual({ source: mcpDeleteRunItem?.source, operation: mcpDeleteRunItem?.operation, status: mcpDeleteRunItem?.status, indexed: mcpDeleteRunItem?.indexed }, { source: "mcp.servers", operation: "delete", status: "done", indexed: 1 });
    const afterMcpDelete = await runCliCapture(["search", "query", "localdocs DOCS_TOKEN", "--domains", "mcp", "--mcp-config", configPath, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterMcpDelete.code, CLI_EXIT_DEGRADED, afterMcpDelete.stderr || afterMcpDelete.stdout);
    const afterMcpDeletePayload = JSON.parse(afterMcpDelete.stdout) as any;
    assert.equal(afterMcpDeletePayload.data.results.some((entry: any) => entry.source === "mcp.servers" && entry.title === "localdocs"), false);
  });
});
