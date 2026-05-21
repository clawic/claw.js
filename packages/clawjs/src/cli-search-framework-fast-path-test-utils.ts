import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { captureStream, runCliCapture, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";

export async function runSearchProvidersSnippetsFastPathScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-providers-snippets-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const providerRoute = await runCliCapture([
      "providers",
      "routing",
      "set",
      "quickask",
      "--capability",
      "chat",
      "--provider",
      "provider_alpha",
      "--model",
      "generic-chat-large",
      "--account-ref",
      "vault://providers/provider_alpha/main",
      "--policy",
      JSON.stringify({ maxCost: "low", approval: "auto", credentials: { apiKey: "provider-secret-never-index" } }),
      "--json",
    ], workspaceRoot);
    assert.equal(providerRoute.code, CLI_EXIT_OK, providerRoute.stderr || providerRoute.stdout);
    const providerSetting = await runCliCapture([
      "providers",
      "settings",
      "set",
      "provider_alpha",
      "--enabled",
      "true",
      "--policy",
      JSON.stringify({ region: "local", credentials: { apiKey: "setting-secret-never-index" } }),
      "--json",
    ], workspaceRoot);
    assert.equal(providerSetting.code, CLI_EXIT_OK, providerSetting.stderr || providerSetting.stdout);
    const snippet = await runCliCapture([
      "snippets",
      "upsert",
      "quickask-review",
      "--title",
      "QuickAsk Review",
      "--body",
      "Review the current selection before sending the provider request",
      "--kind",
      "prompt",
      "--shortcut",
      "qa-review",
      "--skill-refs",
      "skill:review",
      "--scope",
      JSON.stringify({ kind: "editor", surface: "selection-scope-fragment-needle", credentials: { apiKey: "snippet-scope-secret-never-index" } }),
      "--metadata",
      JSON.stringify({ audience: "snippet-metadata-fragment-needle", token: "snippet-token-never-index" }),
      "--json",
    ], workspaceRoot);
    assert.equal(snippet.code, CLI_EXIT_OK, snippet.stderr || snippet.stdout);
    const providerJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(providerJobs.code, CLI_EXIT_OK);
    const providerJobsPayload = JSON.parse(providerJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; provider?: string; feature?: string; capability?: string } }> };
    };
    const routeJob = providerJobsPayload.data.items.find((job: any) => job.resourceId === "routing:quickask:chat");
    assert.equal(routeJob?.source, "providers.routing");
    assert.equal(routeJob?.operation, "upsert");
    assert.equal(routeJob?.payload.eventDriven, true);
    assert.equal(routeJob?.payload.feature, "quickask");
    const settingJob = providerJobsPayload.data.items.find((job: any) => job.resourceId === "setting:provider_alpha");
    assert.equal(settingJob?.payload.kind, "setting");
    assert.equal(settingJob?.payload.provider, "provider_alpha");
    const snippetJobs = await runCliCapture(["search", "jobs", "--source", "snippets.library", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(snippetJobs.code, CLI_EXIT_OK);
    const snippetJobsPayload = JSON.parse(snippetJobs.stdout) as any;
    const snippetJob = snippetJobsPayload.data.items.find((job: any) => job.resourceId === "quickask-review");
    assert.deepEqual({ source: snippetJob?.source, operation: snippetJob?.operation, eventDriven: snippetJob?.payload.eventDriven, slug: snippetJob?.payload.slug }, { source: "snippets.library", operation: "upsert", eventDriven: true, slug: "quickask-review" });
    const providerRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "2"], workspaceRoot);
    assert.equal(providerRun.code, CLI_EXIT_OK);
    const snippetRun = await runCliCapture(["search", "service", "run-once", "--source", "snippets.library", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(snippetRun.code, CLI_EXIT_OK);
    const providerQuery = await runCliCapture(["search", "query", "quickask generic-chat-large", "--domains", "providers", "--filters", "metadata.hasAccountRef=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(providerQuery.code, CLI_EXIT_OK);
    const providerQueryPayload = JSON.parse(providerQuery.stdout) as any;
    const providerResult = providerQueryPayload.data.results.find((entry: any) => entry.type === "routing_rule");
    assert.deepEqual({ source: providerResult?.source, domain: providerResult?.domain, provider: providerResult?.metadata?.provider, hasAccountRef: providerResult?.metadata?.hasAccountRef }, { source: "providers.routing", domain: "providers", provider: "provider_alpha", hasAccountRef: true });
    assert.equal(providerResult?.fragments?.some((fragment: any) => fragment.title === "policy" && fragment.snippet?.includes("approval")), true);
    assert.equal(JSON.stringify(providerQueryPayload.data.results).includes("vault://providers/provider_alpha/main"), false);
    assert.equal(JSON.stringify(providerQueryPayload.data.results).includes("provider-secret-never-index"), false);
    const providerSettingQuery = await runCliCapture(["search", "query", "provider_alpha local", "--sources", "providers.routing", "--filters", "metadata.kind=setting", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(providerSettingQuery.code, CLI_EXIT_OK);
    const providerSettingPayload = JSON.parse(providerSettingQuery.stdout) as any;
    const providerSettingResult = providerSettingPayload.data.results.find((entry: any) => entry.type === "provider_setting");
    assert.deepEqual({ source: providerSettingResult?.source, provider: providerSettingResult?.metadata?.provider, enabled: providerSettingResult?.metadata?.enabled }, { source: "providers.routing", provider: "provider_alpha", enabled: true });
    assert.equal(providerSettingResult?.fragments?.some((fragment: any) => fragment.title === "policy" && fragment.snippet?.includes("local")), true);
    assert.equal(JSON.stringify(providerSettingPayload.data.results).includes("setting-secret-never-index"), false);
    const snippetQuery = await runCliCapture(["search", "query", "current selection", "--domains", "snippets", "--filters", "metadata.kind=prompt", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(snippetQuery.code, CLI_EXIT_OK);
    const snippetQueryPayload = JSON.parse(snippetQuery.stdout) as any;
    const snippetResult = snippetQueryPayload.data.results.find((entry: any) => entry.title === "QuickAsk Review");
    assert.deepEqual({ source: snippetResult?.source, domain: snippetResult?.domain, type: snippetResult?.type, shortcut: snippetResult?.metadata?.shortcut, skillRef: snippetResult?.metadata?.skillRef }, { source: "snippets.library", domain: "snippets", type: "prompt", shortcut: "qa-review", skillRef: ["skill:review"] });
    assert.equal(snippetResult?.fragments?.some((fragment: any) => fragment.snippet?.includes("current selection")), true);
    assert.equal(snippetResult?.fragments?.some((fragment: any) => fragment.title === "scope" && fragment.snippet?.includes("selection-scope-fragment-needle")), true);
    assert.equal(snippetResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("snippet-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(snippetQueryPayload.data.results).includes("snippet-scope-secret-never-index"), false);
    assert.equal(JSON.stringify(snippetQueryPayload.data.results).includes("snippet-token-never-index"), false);
    const snippetMetadataQuery = await runCliCapture(["search", "query", "snippet-metadata-fragment-needle", "--sources", "snippets.library", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(snippetMetadataQuery.code, CLI_EXIT_OK);
    const snippetMetadataPayload = JSON.parse(snippetMetadataQuery.stdout) as any;
    const snippetMetadataResult = snippetMetadataPayload.data.results.find((entry: any) => entry.title === "QuickAsk Review");
    assert.equal(snippetMetadataResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("snippet-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(snippetMetadataPayload.data.results).includes("snippet-token-never-index"), false);
    const deletedSnippet = await runCliCapture(["snippets", "delete", "quickask-review", "--json"], workspaceRoot);
    assert.equal(deletedSnippet.code, CLI_EXIT_OK);
    const deletedRoute = await runCliCapture(["providers", "routing", "delete", "quickask", "--capability", "chat", "--json"], workspaceRoot);
    assert.equal(deletedRoute.code, CLI_EXIT_OK);
    const providerDeleteJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(providerDeleteJobs.code, CLI_EXIT_OK);
    const providerDeleteJobsPayload = JSON.parse(providerDeleteJobs.stdout) as any;
    const providerDeleteJob = providerDeleteJobsPayload.data.items.find((job: any) => job.resourceId === "routing:quickask:chat" && job.operation === "delete");
    assert.deepEqual({ priority: providerDeleteJob?.priority, eventDriven: providerDeleteJob?.payload.eventDriven, kind: providerDeleteJob?.payload.kind, feature: providerDeleteJob?.payload.feature, capability: providerDeleteJob?.payload.capability }, { priority: 80, eventDriven: true, kind: "routing", feature: "quickask", capability: "chat" });
    const providerDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(providerDeleteRun.code, CLI_EXIT_OK, providerDeleteRun.stderr || providerDeleteRun.stdout);
    const providerDeleteRunPayload = JSON.parse(providerDeleteRun.stdout) as any;
    const providerDeleteRunItem = providerDeleteRunPayload.data.worker?.items?.[0];
    assert.deepEqual({ claimed: providerDeleteRunPayload.data.service.worker?.claimed, completed: providerDeleteRunPayload.data.service.worker?.completed, source: providerDeleteRunItem?.source, operation: providerDeleteRunItem?.operation, status: providerDeleteRunItem?.status, indexed: providerDeleteRunItem?.indexed }, { claimed: 1, completed: 1, source: "providers.routing", operation: "delete", status: "done", indexed: 1 });
    const afterProviderDelete = await runCliCapture(["search", "query", "quickask generic-chat-large", "--sources", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterProviderDelete.code, CLI_EXIT_DEGRADED, afterProviderDelete.stderr || afterProviderDelete.stdout);
    const afterProviderDeletePayload = JSON.parse(afterProviderDelete.stdout) as any;
    assert.equal(afterProviderDeletePayload.data.results.some((entry: any) => entry.type === "routing_rule" && entry.metadata?.feature === "quickask" && entry.metadata?.capability === "chat"), false);
    const deletedProviderSetting = await runCliCapture(["providers", "settings", "delete", "provider_alpha", "--json"], workspaceRoot);
    assert.equal(deletedProviderSetting.code, CLI_EXIT_OK);
    const settingDeleteJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(settingDeleteJobs.code, CLI_EXIT_OK);
    const settingDeleteJobsPayload = JSON.parse(settingDeleteJobs.stdout) as any;
    const settingDeleteJob = settingDeleteJobsPayload.data.items.find((job: any) => job.resourceId === "setting:provider_alpha" && job.operation === "delete");
    assert.deepEqual({ priority: settingDeleteJob?.priority, eventDriven: settingDeleteJob?.payload.eventDriven, kind: settingDeleteJob?.payload.kind, provider: settingDeleteJob?.payload.provider }, { priority: 80, eventDriven: true, kind: "setting", provider: "provider_alpha" });
    const settingDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(settingDeleteRun.code, CLI_EXIT_OK);
    const settingDeleteRunItem = (JSON.parse(settingDeleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: settingDeleteRunItem?.source, operation: settingDeleteRunItem?.operation, status: settingDeleteRunItem?.status, indexed: settingDeleteRunItem?.indexed }, { source: "providers.routing", operation: "delete", status: "done", indexed: 1 });
    const afterSettingDelete = await runCliCapture(["search", "query", "provider_alpha local", "--sources", "providers.routing", "--filters", "metadata.kind=setting", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSettingDelete.code, CLI_EXIT_DEGRADED, afterSettingDelete.stderr || afterSettingDelete.stdout);
    const afterSettingDeletePayload = JSON.parse(afterSettingDelete.stdout) as any;
    assert.equal(afterSettingDeletePayload.data.results.some((entry: any) => entry.type === "provider_setting" && entry.metadata?.provider === "provider_alpha"), false);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "snippets.library", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as any;
    const deleteJob = deleteJobsPayload.data.items.find((job: any) => job.resourceId === "quickask-review" && job.operation === "delete");
    assert.deepEqual({ eventDriven: deleteJob?.payload.eventDriven, slug: deleteJob?.payload.slug }, { eventDriven: true, slug: "quickask-review" });
    const snippetDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "snippets.library", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(snippetDeleteRun.code, CLI_EXIT_OK, snippetDeleteRun.stderr || snippetDeleteRun.stdout);
    const snippetDeleteRunItem = (JSON.parse(snippetDeleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: snippetDeleteRunItem?.source, operation: snippetDeleteRunItem?.operation, status: snippetDeleteRunItem?.status, indexed: snippetDeleteRunItem?.indexed }, { source: "snippets.library", operation: "delete", status: "done", indexed: 1 });
    const afterSnippetDelete = await runCliCapture(["search", "query", "current selection", "--sources", "snippets.library", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSnippetDelete.code, CLI_EXIT_DEGRADED, afterSnippetDelete.stderr || afterSnippetDelete.stdout);
    const afterSnippetDeletePayload = JSON.parse(afterSnippetDelete.stdout) as any;
    assert.equal(afterSnippetDeletePayload.data.results.some((entry: any) => entry.source === "snippets.library" && entry.title === "QuickAsk Review"), false);
  });
}

export async function runSearchAgentCatalogFastPathScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-agents-catalog-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const agent = await runCliCapture([
      "agents",
      "upsert",
      "agent.ops",
      "--name",
      "Ops Sentinel",
      "--role",
      "Support",
      "--runtime",
      "codex",
      "--model",
      "generic-agent",
      "--instructions",
      "Investigate ops-agent-config-fragment-needle before escalation",
      "--secret-ref",
      "vault://agents/ops",
      "--json",
    ], workspaceRoot);
    assert.equal(agent.code, CLI_EXIT_OK);
    const personality = await runCliCapture([
      "personalities",
      "upsert",
      "personality.review",
      "--name",
      "Evidence Reviewer",
      "--prompt",
      "Review changes with concrete evidence before escalation",
      "--json",
    ], workspaceRoot);
    assert.equal(personality.code, CLI_EXIT_OK);
    const collection = await runCliCapture([
      "skill-collections",
      "upsert",
      "collection.review",
      "--name",
      "Review Toolkit",
      "--description",
      "Reusable review and code evidence skills",
      "--tags",
      "review,code",
      "--json",
    ], workspaceRoot);
    assert.equal(collection.code, CLI_EXIT_OK);
    const connection = await runCliCapture([
      "connections",
      "upsert",
      "github.ops",
      "--provider",
      "github",
      "--label",
      "GitHub Ops",
      "--secret-ref",
      "vault://connections/github",
      "--scopes",
      "issues,pulls",
      "--json",
    ], workspaceRoot);
    assert.equal(connection.code, CLI_EXIT_OK);
    const jobs = await runCliCapture(["search", "jobs", "--source", "agents.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; id?: string } }> };
    };
    const agentJob = jobsPayload.data.items.find((job: any) => job.resourceId === "agent:agent.ops");
    assert.equal(agentJob?.source, "agents.catalog");
    assert.equal(agentJob?.operation, "upsert");
    assert.equal(agentJob?.payload.eventDriven, true);
    assert.equal(agentJob?.payload.kind, "agent");
    assert.equal(agentJob?.payload.id, "agent.ops");
    assert.equal(jobsPayload.data.items.some((job: any) => job.resourceId === "personality:personality.review"), true);
    assert.equal(jobsPayload.data.items.some((job: any) => job.resourceId === "skill_collection:collection.review"), true);
    assert.equal(jobsPayload.data.items.some((job: any) => job.resourceId === "connection:github.ops"), true);
    const run = await runCliCapture(["search", "service", "run-once", "--source", "agents.catalog", "--data-dir", dataRoot, "--json", "--limit", "4"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "Ops Sentinel generic-agent", "--domains", "agents", "--filters", "metadata.kind=agent", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { kind?: string; runtime?: string; model?: string; hasProtectedRef?: boolean }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const agentResult = queryPayload.data.results.find((entry: any) => entry.title === "Ops Sentinel");
    assert.equal(agentResult?.source, "agents.catalog");
    assert.equal(agentResult?.domain, "agents");
    assert.equal(agentResult?.type, "agent");
    assert.equal(agentResult?.metadata?.runtime, "codex");
    assert.equal(agentResult?.metadata?.model, "generic-agent");
    assert.equal(agentResult?.metadata?.hasProtectedRef, true);
    assert.equal(agentResult?.fragments?.some((fragment: any) => fragment.title === "configuration"), true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("vault://agents/ops"), false);
    const agentConfigQuery = await runCliCapture(["search", "query", "ops-agent-config-fragment-needle", "--domains", "agents", "--filters", "metadata.kind=agent", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(agentConfigQuery.code, CLI_EXIT_OK);
    const agentConfigPayload = JSON.parse(agentConfigQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const agentConfigResult = agentConfigPayload.data.results.find((entry: any) => entry.title === "Ops Sentinel");
    assert.equal(agentConfigResult?.fragments?.some((fragment: any) => fragment.title === "configuration" && fragment.snippet?.includes("ops-agent-config-fragment-needle")), true);
    assert.equal(JSON.stringify(agentConfigPayload.data.results).includes("vault://agents/ops"), false);
    const connectionQuery = await runCliCapture(["search", "query", "GitHub Ops pulls", "--domains", "agents", "--filters", "metadata.kind=connection", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(connectionQuery.code, CLI_EXIT_OK);
    const connectionPayload = JSON.parse(connectionQuery.stdout) as {
      data: { results: Array<{ type: string; title: string; metadata?: { provider?: string; hasProtectedRef?: boolean; scopes?: string[] }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const connectionResult = connectionPayload.data.results.find((entry: any) => entry.title === "GitHub Ops");
    assert.equal(connectionResult?.type, "connection");
    assert.equal(connectionResult?.metadata?.provider, "github");
    assert.equal(connectionResult?.metadata?.hasProtectedRef, true);
    assert.deepEqual(connectionResult?.metadata?.scopes, ["issues", "pulls"]);
    assert.equal(connectionResult?.fragments?.some((fragment: any) => fragment.title === "scopes" && fragment.snippet?.includes("pulls")), true);
    assert.equal(connectionResult?.fragments?.some((fragment: any) => fragment.title === "configuration" && fragment.snippet?.includes("github")), true);
    assert.equal(JSON.stringify(connectionPayload.data.results).includes("vault://connections/github"), false);
    const deleted = await runCliCapture(["connections", "delete", "github.ops", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "agents.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; id?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job: any) => job.resourceId === "connection:github.ops" && job.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.kind, "connection");
    assert.equal(deleteJob?.payload.id, "github.ops");
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "agents.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK, deleteRun.stderr || deleteRun.stdout);
    const deleteRunItem = (JSON.parse(deleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: deleteRunItem?.source, operation: deleteRunItem?.operation, status: deleteRunItem?.status, indexed: deleteRunItem?.indexed }, { source: "agents.catalog", operation: "delete", status: "done", indexed: 1 });
    const afterConnectionDelete = await runCliCapture(["search", "query", "GitHub Ops pulls", "--sources", "agents.catalog", "--filters", "metadata.kind=connection", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterConnectionDelete.code, CLI_EXIT_DEGRADED, afterConnectionDelete.stderr || afterConnectionDelete.stdout);
    const afterConnectionDeletePayload = JSON.parse(afterConnectionDelete.stdout) as any;
    assert.equal(afterConnectionDeletePayload.data.results.some((entry: any) => entry.type === "connection" && entry.title === "GitHub Ops"), false);
  });
}

export async function runSearchMarketplaceChoiceFastPathScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-marketplace-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const choice = await runCliCapture([
      "marketplace",
      "choice",
      "upsert",
      "choice.provider.default",
      "--target",
      "default-ai-provider",
      "--choice",
      "provider_alpha",
      "--kind",
      "provider",
      "--rationale",
      "Use provider alpha for local low-cost routing",
      "--metadata",
      JSON.stringify({ market: "marketplace-metadata-fragment-needle", credentials: { apiKey: "marketplace-secret-never-index" } }),
      "--json",
    ], workspaceRoot);
    assert.equal(choice.code, CLI_EXIT_OK);
    const jobs = await runCliCapture(["search", "jobs", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; choiceId?: string } }> };
    };
    const job = jobsPayload.data.items.find((entry: any) => entry.resourceId === "choice.provider.default");
    assert.equal(job?.source, "marketplace.choices");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.choiceId, "choice.provider.default");
    const run = await runCliCapture(["search", "service", "run-once", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);
    const query = await runCliCapture(["search", "query", "default-ai-provider provider alpha", "--domains", "marketplace", "--filters", "metadata.kind=provider", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { target?: string; choice?: string; status?: string }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const result = queryPayload.data.results.find((entry: any) => entry.title === "default-ai-provider: provider_alpha");
    assert.equal(result?.source, "marketplace.choices");
    assert.equal(result?.domain, "marketplace");
    assert.equal(result?.type, "provider");
    assert.equal(result?.metadata?.target, "default-ai-provider");
    assert.equal(result?.metadata?.choice, "provider_alpha");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.fragments?.some((fragment: any) => fragment.snippet?.includes("low-cost routing")), true);
    assert.equal(result?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("marketplace-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("marketplace-secret-never-index"), false);
    const metadataQuery = await runCliCapture(["search", "query", "marketplace-metadata-fragment-needle", "--sources", "marketplace.choices", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK);
    const metadataPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataPayload.data.results.find((entry: any) => entry.title === "default-ai-provider: provider_alpha");
    assert.equal(metadataResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("marketplace-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(metadataPayload.data.results).includes("marketplace-secret-never-index"), false);
    const deleted = await runCliCapture(["marketplace", "choice", "delete", "choice.provider.default", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; choiceId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((entry: any) => entry.resourceId === "choice.provider.default" && entry.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.choiceId, "choice.provider.default");
    const marketplaceDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(marketplaceDeleteRun.code, CLI_EXIT_OK);
    const marketplaceDeleteRunPayload = JSON.parse(marketplaceDeleteRun.stdout) as {
      data: { service: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed: number }> } } };
    };
    const marketplaceDeleteRunItem = marketplaceDeleteRunPayload.data.service.worker?.items.find((entry: any) => entry.source === "marketplace.choices");
    assert.deepEqual({ source: marketplaceDeleteRunItem?.source, operation: marketplaceDeleteRunItem?.operation, status: marketplaceDeleteRunItem?.status, indexed: marketplaceDeleteRunItem?.indexed }, { source: "marketplace.choices", operation: "delete", status: "done", indexed: 1 });
    const afterMarketplaceDelete = await runCliCapture(["search", "query", "default-ai-provider provider alpha", "--sources", "marketplace.choices", "--filters", "metadata.kind=provider", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterMarketplaceDelete.code, CLI_EXIT_DEGRADED, afterMarketplaceDelete.stderr || afterMarketplaceDelete.stdout);
    const afterMarketplaceDeletePayload = JSON.parse(afterMarketplaceDelete.stdout) as {
      data: { results: Array<{ source: string; title: string }> };
    };
    assert.equal(afterMarketplaceDeletePayload.data.results.some((entry: any) => entry.source === "marketplace.choices" && entry.title === "default-ai-provider: provider_alpha"), false);
  });
}

export async function runSearchContentSocialIotFastPathScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-content-social-iot-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const contentStdout = captureStream();
    const contentStderr = captureStream();
    const content = await runInternalV1Cli([
      "content",
      "upsert",
      "--id",
      "content.launch",
      "--title",
      "Launch Narrative",
      "--kind",
      "campaign_item",
      "--status",
      "draft",
      "--brand-id",
      "brand.alpha",
      "--campaign-id",
      "campaign.spring",
      "--body",
      "Publish the launch story with evidence from the product team",
      "--metadata",
      JSON.stringify({ audience: "content-metadata-fragment-needle", credentials: { apiKey: "content-secret-never-index" } }),
      "--json",
    ], { stdout: contentStdout.stream, stderr: contentStderr.stream, cwd: workspaceRoot });
    assert.equal(content, CLI_EXIT_OK);
    const socialStdout = captureStream();
    const socialStderr = captureStream();
    const social = await runInternalV1Cli([
      "social",
      "upsert",
      "--id",
      "post.launch",
      "--title",
      "Launch Social Draft",
      "--status",
      "scheduled",
      "--channel",
      JSON.stringify({ name: "linkedin", audience: "social-channel-fragment-needle", credentials: { apiKey: "social-channel-secret-never-index" } }),
      "--scheduled-at",
      "2026-05-20T10:00:00.000Z",
      "--body",
      "Share the launch story with builder notes",
      "--metadata",
      JSON.stringify({ campaign: "social-metadata-fragment-needle", credentials: { token: "social-metadata-secret-never-index" } }),
      "--json",
    ], { stdout: socialStdout.stream, stderr: socialStderr.stream, cwd: workspaceRoot });
    assert.equal(social, CLI_EXIT_OK);
    const iotStdout = captureStream();
    const iotStderr = captureStream();
    const iot = await runInternalV1Cli([
      "iot",
      "config",
      "set",
      "thermostat.lab",
      "--name",
      "Lab Thermostat",
      "--kind",
      "thermostat",
      "--config",
      JSON.stringify({ room: "lab", mode: "eco", apiKey: "iot-secret-token" }),
      "--secret-ref",
      "vault://iot/thermostat",
      "--json",
    ], { stdout: iotStdout.stream, stderr: iotStderr.stream, cwd: workspaceRoot });
    assert.equal(iot, CLI_EXIT_OK);
    const contentJobs = await runCliCapture(["search", "jobs", "--source", "content.items", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(contentJobs.code, CLI_EXIT_OK);
    const contentJobsPayload = JSON.parse(contentJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; itemId?: string } }> };
    };
    const contentJob = contentJobsPayload.data.items.find((entry: any) => entry.resourceId === "content.launch");
    assert.equal(contentJob?.source, "content.items");
    assert.equal(contentJob?.operation, "upsert");
    assert.equal(contentJob?.payload.eventDriven, true);
    assert.equal(contentJob?.payload.itemId, "content.launch");
    const socialJobs = await runCliCapture(["search", "jobs", "--source", "social.posts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(socialJobs.code, CLI_EXIT_OK);
    const socialJobsPayload = JSON.parse(socialJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; postId?: string } }> };
    };
    const socialJob = socialJobsPayload.data.items.find((entry: any) => entry.resourceId === "post.launch");
    assert.equal(socialJob?.source, "social.posts");
    assert.equal(socialJob?.operation, "upsert");
    assert.equal(socialJob?.payload.eventDriven, true);
    assert.equal(socialJob?.payload.postId, "post.launch");
    const iotJobs = await runCliCapture(["search", "jobs", "--source", "iot.config", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(iotJobs.code, CLI_EXIT_OK);
    const iotJobsPayload = JSON.parse(iotJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; configId?: string } }> };
    };
    const iotJob = iotJobsPayload.data.items.find((entry: any) => entry.resourceId === "thermostat.lab");
    assert.equal(iotJob?.source, "iot.config");
    assert.equal(iotJob?.operation, "upsert");
    assert.equal(iotJob?.payload.eventDriven, true);
    assert.equal(iotJob?.payload.configId, "thermostat.lab");
    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "content.items", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);
    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "social.posts", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);
    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "iot.config", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);
    const contentQuery = await runCliCapture(["search", "query", "product team", "--domains", "content", "--filters", "metadata.kind=campaign_item", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(contentQuery.code, CLI_EXIT_OK);
    const contentPayload = JSON.parse(contentQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; metadata?: { brandId?: string; campaignId?: string }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const contentResult = contentPayload.data.results.find((entry: any) => entry.title === "Launch Narrative");
    assert.equal(contentResult?.source, "content.items");
    assert.equal(contentResult?.metadata?.brandId, "brand.alpha");
    assert.equal(contentResult?.metadata?.campaignId, "campaign.spring");
    assert.equal(contentResult?.fragments?.some((fragment: any) => fragment.snippet?.includes("product team")), true);
    assert.equal(contentResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("content-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(contentPayload.data.results).includes("content-secret-never-index"), false);
    const contentMetadataQuery = await runCliCapture(["search", "query", "content-metadata-fragment-needle", "--sources", "content.items", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(contentMetadataQuery.code, CLI_EXIT_OK);
    const contentMetadataPayload = JSON.parse(contentMetadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const contentMetadataResult = contentMetadataPayload.data.results.find((entry: any) => entry.title === "Launch Narrative");
    assert.equal(contentMetadataResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("content-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(contentMetadataPayload.data.results).includes("content-secret-never-index"), false);
    const socialQuery = await runCliCapture(["search", "query", "builder notes", "--domains", "social", "--filters", "metadata.channel=linkedin", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(socialQuery.code, CLI_EXIT_OK);
    const socialPayload = JSON.parse(socialQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; metadata?: { channel?: string; scheduled?: boolean }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const socialResult = socialPayload.data.results.find((entry: any) => entry.title === "Launch Social Draft");
    assert.equal(socialResult?.source, "social.posts");
    assert.equal(socialResult?.metadata?.channel, "linkedin");
    assert.equal(socialResult?.metadata?.scheduled, true);
    assert.equal(socialResult?.fragments?.some((fragment: any) => fragment.title === "channel" && fragment.snippet?.includes("social-channel-fragment-needle")), true);
    assert.equal(socialResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("social-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(socialPayload.data.results).includes("social-channel-secret-never-index"), false);
    assert.equal(JSON.stringify(socialPayload.data.results).includes("social-metadata-secret-never-index"), false);
    const socialMetadataQuery = await runCliCapture(["search", "query", "social-metadata-fragment-needle", "--sources", "social.posts", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(socialMetadataQuery.code, CLI_EXIT_OK);
    const socialMetadataPayload = JSON.parse(socialMetadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const socialMetadataResult = socialMetadataPayload.data.results.find((entry: any) => entry.title === "Launch Social Draft");
    assert.equal(socialMetadataResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("social-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(socialMetadataPayload.data.results).includes("social-metadata-secret-never-index"), false);
    const iotQuery = await runCliCapture(["search", "query", "Lab Thermostat", "--domains", "iot", "--filters", "metadata.enabled=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(iotQuery.code, CLI_EXIT_OK);
    const iotPayload = JSON.parse(iotQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; metadata?: { enabled?: boolean; hasProtectedRef?: boolean }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const iotResult = iotPayload.data.results.find((entry: any) => entry.title === "Lab Thermostat");
    assert.equal(iotResult?.source, "iot.config");
    assert.equal(iotResult?.metadata?.enabled, true);
    assert.equal(iotResult?.metadata?.hasProtectedRef, true);
    assert.equal(iotResult?.fragments?.some((fragment: any) => fragment.title === "config" && fragment.snippet?.includes("eco")), true);
    assert.equal(JSON.stringify(iotPayload.data.results).includes("vault://iot/thermostat"), false);
    assert.equal(JSON.stringify(iotPayload.data.results).includes("iot-secret-token"), false);
    const iotConfigQuery = await runCliCapture(["search", "query", "eco", "--sources", "iot.config", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(iotConfigQuery.code, CLI_EXIT_OK);
    const iotConfigPayload = JSON.parse(iotConfigQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const iotConfigResult = iotConfigPayload.data.results.find((entry: any) => entry.title === "Lab Thermostat");
    assert.equal(iotConfigResult?.fragments?.some((fragment: any) => fragment.title === "config" && fragment.snippet?.includes("eco")), true);
    assert.equal(JSON.stringify(iotConfigPayload.data.results).includes("iot-secret-token"), false);
    assert.equal(await runInternalV1Cli(["content", "delete", "content.launch", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    assert.equal(await runInternalV1Cli(["social", "delete", "post.launch", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    assert.equal(await runInternalV1Cli(["iot", "config", "delete", "thermostat.lab", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    const deleteContentJobs = await runCliCapture(["search", "jobs", "--source", "content.items", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteContentJobs.code, CLI_EXIT_OK);
    const deleteContentJobsPayload = JSON.parse(deleteContentJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; itemId?: string } }> };
    };
    const deleteContentJob = deleteContentJobsPayload.data.items.find((entry: any) => entry.resourceId === "content.launch" && entry.operation === "delete");
    assert.equal(deleteContentJob?.payload.eventDriven, true);
    assert.equal(deleteContentJob?.payload.itemId, "content.launch");
    const deleteSocialJobs = await runCliCapture(["search", "jobs", "--source", "social.posts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteSocialJobs.code, CLI_EXIT_OK);
    const deleteSocialJobsPayload = JSON.parse(deleteSocialJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; postId?: string } }> };
    };
    const deleteSocialJob = deleteSocialJobsPayload.data.items.find((entry: any) => entry.resourceId === "post.launch" && entry.operation === "delete");
    assert.equal(deleteSocialJob?.payload.eventDriven, true);
    assert.equal(deleteSocialJob?.payload.postId, "post.launch");
    const deleteIotJobs = await runCliCapture(["search", "jobs", "--source", "iot.config", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteIotJobs.code, CLI_EXIT_OK);
    const deleteIotJobsPayload = JSON.parse(deleteIotJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; configId?: string } }> };
    };
    const deleteIotJob = deleteIotJobsPayload.data.items.find((entry: any) => entry.resourceId === "thermostat.lab" && entry.operation === "delete");
    assert.equal(deleteIotJob?.payload.eventDriven, true);
    assert.equal(deleteIotJob?.payload.configId, "thermostat.lab");
    const contentDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "content.items", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(contentDeleteRun.code, CLI_EXIT_OK);
    const contentDeleteRunItem = (JSON.parse(contentDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "content.items");
    assert.deepEqual({ source: contentDeleteRunItem?.source, operation: contentDeleteRunItem?.operation, status: contentDeleteRunItem?.status, indexed: contentDeleteRunItem?.indexed }, { source: "content.items", operation: "delete", status: "done", indexed: 1 });
    const socialDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "social.posts", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(socialDeleteRun.code, CLI_EXIT_OK);
    const socialDeleteRunItem = (JSON.parse(socialDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "social.posts");
    assert.deepEqual({ source: socialDeleteRunItem?.source, operation: socialDeleteRunItem?.operation, status: socialDeleteRunItem?.status, indexed: socialDeleteRunItem?.indexed }, { source: "social.posts", operation: "delete", status: "done", indexed: 1 });
    const iotDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "iot.config", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(iotDeleteRun.code, CLI_EXIT_OK);
    const iotDeleteRunItem = (JSON.parse(iotDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "iot.config");
    assert.deepEqual({ source: iotDeleteRunItem?.source, operation: iotDeleteRunItem?.operation, status: iotDeleteRunItem?.status, indexed: iotDeleteRunItem?.indexed }, { source: "iot.config", operation: "delete", status: "done", indexed: 1 });
    const afterContentDelete = await runCliCapture(["search", "query", "product team", "--sources", "content.items", "--filters", "metadata.kind=campaign_item", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterContentDelete.code, CLI_EXIT_DEGRADED, afterContentDelete.stderr || afterContentDelete.stdout);
    const afterContentDeletePayload = JSON.parse(afterContentDelete.stdout) as any;
    assert.equal(afterContentDeletePayload.data.results.some((entry: any) => entry.source === "content.items" && entry.title === "Launch Narrative"), false);
    const afterSocialDelete = await runCliCapture(["search", "query", "builder notes", "--sources", "social.posts", "--filters", "metadata.channel=linkedin", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSocialDelete.code, CLI_EXIT_DEGRADED, afterSocialDelete.stderr || afterSocialDelete.stdout);
    const afterSocialDeletePayload = JSON.parse(afterSocialDelete.stdout) as any;
    assert.equal(afterSocialDeletePayload.data.results.some((entry: any) => entry.source === "social.posts" && entry.title === "Launch Social Draft"), false);
    const afterIotDelete = await runCliCapture(["search", "query", "Lab Thermostat", "--sources", "iot.config", "--filters", "metadata.enabled=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterIotDelete.code, CLI_EXIT_DEGRADED, afterIotDelete.stderr || afterIotDelete.stdout);
    const afterIotDeletePayload = JSON.parse(afterIotDelete.stdout) as any;
    assert.equal(afterIotDeletePayload.data.results.some((entry: any) => entry.source === "iot.config" && entry.title === "Lab Thermostat"), false);
  });
}

export async function runSearchBusinessRecordFastPathScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-business-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
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
      "business",
      "upsert",
      "--id",
      "biz.customer.alpha",
      "--name",
      "Alpha Customer",
      "--kind",
      "customer",
      "--status",
      "active",
      "--body",
      "Customer renewal evidence and account notes",
      "--metadata",
      JSON.stringify({ segment: "business-metadata-fragment-needle", credentials: { apiKey: "business-secret-never-index" } }),
      "--json",
    ], { stdout: stdout.stream, stderr: stderr.stream, cwd: workspaceRoot });
    assert.equal(upsert, CLI_EXIT_OK);
    const jobs = await runCliCapture(["search", "jobs", "--source", "business.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; recordId?: string } }> };
    };
    const job = jobsPayload.data.items.find((entry: any) => entry.resourceId === "biz.customer.alpha");
    assert.equal(job?.source, "business.records");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.recordId, "biz.customer.alpha");
    const run = await runCliCapture(["search", "service", "run-once", "--source", "business.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);
    const query = await runCliCapture(["search", "query", "renewal evidence", "--domains", "business", "--filters", "metadata.kind=customer", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { status?: string }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const result = queryPayload.data.results.find((entry: any) => entry.title === "Alpha Customer");
    assert.equal(result?.source, "business.records");
    assert.equal(result?.domain, "business");
    assert.equal(result?.type, "customer");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.fragments?.some((fragment: any) => fragment.snippet?.includes("account notes")), true);
    assert.equal(result?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("business-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("business-secret-never-index"), false);
    const metadataQuery = await runCliCapture(["search", "query", "business-metadata-fragment-needle", "--sources", "business.records", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK);
    const metadataPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataPayload.data.results.find((entry: any) => entry.title === "Alpha Customer");
    assert.equal(metadataResult?.fragments?.some((fragment: any) => fragment.title === "metadata" && fragment.snippet?.includes("business-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(metadataPayload.data.results).includes("business-secret-never-index"), false);
    const deleted = await runInternalV1Cli(["business", "delete", "biz.customer.alpha", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(deleted, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "business.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((entry: any) => entry.resourceId === "biz.customer.alpha" && entry.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.recordId, "biz.customer.alpha");
    const businessDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "business.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(businessDeleteRun.code, CLI_EXIT_OK);
    const businessDeleteRunItem = (JSON.parse(businessDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "business.records");
    assert.deepEqual({ source: businessDeleteRunItem?.source, operation: businessDeleteRunItem?.operation, status: businessDeleteRunItem?.status, indexed: businessDeleteRunItem?.indexed }, { source: "business.records", operation: "delete", status: "done", indexed: 1 });
    const afterBusinessDelete = await runCliCapture(["search", "query", "renewal evidence", "--sources", "business.records", "--filters", "metadata.kind=customer", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterBusinessDelete.code, CLI_EXIT_DEGRADED, afterBusinessDelete.stderr || afterBusinessDelete.stdout);
    const afterBusinessDeletePayload = JSON.parse(afterBusinessDelete.stdout) as any;
    assert.equal(afterBusinessDeletePayload.data.results.some((entry: any) => entry.source === "business.records" && entry.title === "Alpha Customer"), false);
  });
}
