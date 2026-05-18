import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore, type SearchIndexJob } from "@clawjs/search";

import * as searchEvents from "./cli-search-events.ts";

test("Search event schedulers create hot event-driven jobs for every framework source", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-events-"));
  const dataDir = path.join(workspaceRoot, "data");
  const codeRoot = path.join(workspaceRoot, "code");
  const fileRoot = path.join(workspaceRoot, "files");
  const webRoot = path.join(workspaceRoot, "web-cache");
  const externalRoot = path.join(workspaceRoot, "external-cache");
  const observedAt = "2026-05-18T12:00:00.000Z";
  const cases: Array<{
    label: string;
    source: string;
    resourceId: string;
    schedule: () => { ok: boolean; job?: SearchIndexJob; error?: string };
  }> = [
    {
      label: "sessions.chats",
      source: "sessions.chats",
      resourceId: "session-alpha",
      schedule: () => searchEvents.scheduleSessionChatSearchEvent({ operation: "upsert", sessionId: "session-alpha", dataDir, observedAt }),
    },
    {
      label: "database.records",
      source: "database.records",
      resourceId: "main:contacts:ada",
      schedule: () => searchEvents.scheduleDatabaseRecordSearchEvent({ operation: "upsert", namespaceId: "main", collectionName: "contacts", recordId: "ada", dataDir, observedAt }),
    },
    {
      label: "work.items",
      source: "work.items",
      resourceId: "main:tasks:task-alpha",
      schedule: () => searchEvents.scheduleWorkItemsSearchEvent({ operation: "upsert", namespaceId: "main", collectionName: "tasks", recordId: "task-alpha", dataDir, observedAt }),
    },
    {
      label: "documents.blocks",
      source: "documents.blocks",
      resourceId: "main:documents:doc-alpha",
      schedule: () => searchEvents.scheduleDocumentBlocksSearchEvent({ operation: "upsert", namespaceId: "main", documentId: "doc-alpha", collectionName: "documents", recordId: "doc-alpha", dataDir, observedAt }),
    },
    {
      label: "notes.pages",
      source: "notes.pages",
      resourceId: "note-alpha",
      schedule: () => searchEvents.scheduleNotesPagesSearchEvent({ operation: "upsert", pageId: "note-alpha", dataDir, observedAt }),
    },
    {
      label: "knowledge.graph",
      source: "knowledge.graph",
      resourceId: "entity:person.ada",
      schedule: () => searchEvents.scheduleKnowledgeGraphSearchEvent({ operation: "upsert", kind: "entity", id: "person.ada", dataDir, observedAt }),
    },
    {
      label: "signals.observations",
      source: "signals.observations",
      resourceId: "observation:obs-alpha",
      schedule: () => searchEvents.scheduleSignalsObservationsSearchEvent({ operation: "upsert", kind: "observation", id: "obs-alpha", dataDir, observedAt }),
    },
    {
      label: "calendar.events",
      source: "calendar.events",
      resourceId: "event-alpha",
      schedule: () => searchEvents.scheduleCalendarEventsSearchEvent({ operation: "upsert", eventId: "event-alpha", dataDir, observedAt }),
    },
    {
      label: "finance.records",
      source: "finance.records",
      resourceId: "main:finance_records:fin-alpha",
      schedule: () => searchEvents.scheduleFinanceRecordsSearchEvent({ operation: "upsert", namespaceId: "main", collectionName: "finance_records", recordId: "fin-alpha", dataDir, observedAt }),
    },
    {
      label: "eln.records",
      source: "eln.records",
      resourceId: "main:eln_entries:eln-alpha",
      schedule: () => searchEvents.scheduleElnRecordsSearchEvent({ operation: "upsert", namespaceId: "main", collectionName: "eln_entries", recordId: "eln-alpha", dataDir, observedAt }),
    },
    {
      label: "images.derived",
      source: "images.derived",
      resourceId: "image-alpha",
      schedule: () => searchEvents.scheduleImageDerivedSearchEvent({ operation: "upsert", imageId: "image-alpha", dataDir, observedAt }),
    },
    {
      label: "media.assets",
      source: "media.assets",
      resourceId: "media-alpha",
      schedule: () => searchEvents.scheduleMediaAssetSearchEvent({ operation: "upsert", mediaId: "media-alpha", dataDir, observedAt }),
    },
    {
      label: "slides.decks",
      source: "slides.decks",
      resourceId: "deck-alpha",
      schedule: () => searchEvents.scheduleSlidesDeckSearchEvent({ operation: "upsert", deckId: "deck-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "sheets.workbooks",
      source: "sheets.workbooks",
      resourceId: "workbook-alpha",
      schedule: () => searchEvents.scheduleSheetsWorkbookSearchEvent({ operation: "upsert", workbookId: "workbook-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "generations.artifacts",
      source: "generations.artifacts",
      resourceId: "generation-alpha",
      schedule: () => searchEvents.scheduleGenerationArtifactSearchEvent({ operation: "upsert", generationId: "generation-alpha", dataDir, observedAt }),
    },
    {
      label: "code.symbols",
      source: "code.symbols",
      resourceId: "src/app.ts",
      schedule: () => searchEvents.scheduleCodeSymbolsSearchEvent({ operation: "upsert", root: codeRoot, filePath: path.join(codeRoot, "src", "app.ts"), dataDir, observedAt }),
    },
    {
      label: "docs.pages",
      source: "docs.pages",
      resourceId: "docs/guide.md",
      schedule: () => searchEvents.scheduleDocsPagesSearchEvent({ operation: "upsert", workspaceRoot, filePath: path.join(workspaceRoot, "docs", "guide.md"), dataDir, observedAt }),
    },
    {
      label: "skills.registry",
      source: "skills.registry",
      resourceId: "skill-alpha",
      schedule: () => searchEvents.scheduleSkillsRegistrySearchEvent({ operation: "upsert", slug: "skill-alpha", dataDir, observedAt }),
    },
    {
      label: "providers.routing",
      source: "providers.routing",
      resourceId: "routing:chat:llm",
      schedule: () => searchEvents.scheduleProvidersRoutingSearchEvent({ operation: "upsert", kind: "routing", feature: "chat", capability: "llm", dataDir, observedAt }),
    },
    {
      label: "snippets.library",
      source: "snippets.library",
      resourceId: "snippet-alpha",
      schedule: () => searchEvents.scheduleSnippetsLibrarySearchEvent({ operation: "upsert", slug: "snippet-alpha", dataDir, observedAt }),
    },
    {
      label: "agents.catalog",
      source: "agents.catalog",
      resourceId: "agent:agent-alpha",
      schedule: () => searchEvents.scheduleAgentsCatalogSearchEvent({ operation: "upsert", kind: "agent", id: "agent-alpha", dataDir, observedAt }),
    },
    {
      label: "marketplace.choices",
      source: "marketplace.choices",
      resourceId: "choice-alpha",
      schedule: () => searchEvents.scheduleMarketplaceChoicesSearchEvent({ operation: "upsert", id: "choice-alpha", dataDir, observedAt }),
    },
    {
      label: "content.items",
      source: "content.items",
      resourceId: "item-alpha",
      schedule: () => searchEvents.scheduleContentItemsSearchEvent({ operation: "upsert", itemId: "item-alpha", dataDir, observedAt }),
    },
    {
      label: "business.records",
      source: "business.records",
      resourceId: "business-alpha",
      schedule: () => searchEvents.scheduleBusinessRecordsSearchEvent({ operation: "upsert", recordId: "business-alpha", dataDir, observedAt }),
    },
    {
      label: "social.posts",
      source: "social.posts",
      resourceId: "post-alpha",
      schedule: () => searchEvents.scheduleSocialPostsSearchEvent({ operation: "upsert", postId: "post-alpha", dataDir, observedAt }),
    },
    {
      label: "iot.config",
      source: "iot.config",
      resourceId: "config-alpha",
      schedule: () => searchEvents.scheduleIotConfigSearchEvent({ operation: "upsert", configId: "config-alpha", dataDir, observedAt }),
    },
    {
      label: "connectors.catalog",
      source: "connectors.catalog",
      resourceId: "openai.images.generate",
      schedule: () => searchEvents.scheduleConnectorCatalogSearchEvent({ operation: "upsert", operationId: "openai.images.generate", dataDir, observedAt }),
    },
    {
      label: "mcp.servers",
      source: "mcp.servers",
      resourceId: "docs-server",
      schedule: () => searchEvents.scheduleMcpServersSearchEvent({ operation: "upsert", serverId: "docs-server", configPath: path.join(workspaceRoot, "mcp.json"), dataDir, observedAt }),
    },
    {
      label: "apps.catalog",
      source: "apps.catalog",
      resourceId: "app-alpha",
      schedule: () => searchEvents.scheduleAppsCatalogSearchEvent({ operation: "upsert", appId: "app-alpha", dataDir, observedAt }),
    },
    {
      label: "design.resources",
      source: "design.resources",
      resourceId: "design-alpha",
      schedule: () => searchEvents.scheduleDesignResourcesSearchEvent({ operation: "upsert", resourceId: "design-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "runtime.events",
      source: "runtime.events",
      resourceId: "operational:monitor:runtime-alpha",
      schedule: () => searchEvents.scheduleRuntimeEventsSearchEvent({ operation: "upsert", kind: "operational", domain: "monitor", id: "runtime-alpha", dataDir, observedAt }),
    },
    {
      label: "surfaces.routes",
      source: "surfaces.routes",
      resourceId: "route-alpha",
      schedule: () => searchEvents.scheduleSurfaceRouteSearchEvent({ operation: "upsert", routeId: "route-alpha", dataDir, observedAt }),
    },
    {
      label: "local.files",
      source: "local.files",
      resourceId: "docs/file.txt",
      schedule: () => searchEvents.scheduleLocalFileSearchEvent({ operation: "upsert", root: fileRoot, filePath: path.join(fileRoot, "docs", "file.txt"), dataDir, observedAt }),
    },
    {
      label: "web.ingested",
      source: "web.ingested",
      resourceId: "pages/example.json",
      schedule: () => searchEvents.scheduleWebIngestedSearchEvent({ operation: "upsert", root: webRoot, filePath: path.join(webRoot, "pages", "example.json"), dataDir, observedAt }),
    },
    {
      label: "external.cache",
      source: "external.cache",
      resourceId: "providers/example.json",
      schedule: () => searchEvents.scheduleExternalCacheSearchEvent({ operation: "upsert", root: externalRoot, filePath: path.join(externalRoot, "providers", "example.json"), dataDir, observedAt }),
    },
  ];

  try {
    for (const entry of cases) {
      const scheduled = entry.schedule();
      assert.equal(scheduled.ok, true, scheduled.error ?? entry.label);
      assert.equal(scheduled.job?.source, entry.source, entry.label);
      assert.equal(scheduled.job?.resourceId, entry.resourceId, entry.label);
      assert.equal(scheduled.job?.operation, "upsert", entry.label);
      assert.equal(scheduled.job?.shard, "hot", entry.label);
      assert.equal(scheduled.job?.priority, 60, entry.label);
      assert.equal(scheduled.job?.payload.eventDriven, true, entry.label);
      assert.equal(scheduled.job?.payload.observedAt, observedAt, entry.label);
    }

    const store = new SearchStore(path.join(dataDir, "search.sqlite"));
    try {
      const jobs = store.listIndexJobs({ limit: 200 });
      for (const entry of cases) {
        assert.ok(
          jobs.some((job) => job.source === entry.source && job.resourceId === entry.resourceId && job.status === "queued"),
          entry.label,
        );
      }
    } finally {
      store.close();
    }
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
