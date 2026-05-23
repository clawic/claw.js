import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import { test } from "vitest";

import { SearchStore, type SearchIndexJob } from "@clawjs/search";

import * as searchEvents from "./cli-search-events.ts";

test("Search event schedulers create hot event-driven upsert and delete jobs for every framework source", () => {
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
    schedule: (operation: "upsert" | "delete") => { ok: boolean; job?: SearchIndexJob; error?: string };
  }> = [
    {
      label: "sessions.chats",
      source: "sessions.chats",
      resourceId: "session-alpha",
      schedule: (operation) => searchEvents.scheduleSessionChatSearchEvent({ operation, sessionId: "session-alpha", dataDir, observedAt }),
    },
    {
      label: "sessions.events",
      source: "sessions.events",
      resourceId: "session-alpha",
      schedule: (operation) => searchEvents.scheduleSessionEventsSearchEvent({ operation, sessionId: "session-alpha", dataDir, observedAt }),
    },
    {
      label: "sessions.turns",
      source: "sessions.turns",
      resourceId: "session-alpha",
      schedule: (operation) => searchEvents.scheduleSessionTurnsSearchEvent({ operation, sessionId: "session-alpha", dataDir, observedAt }),
    },
    {
      label: "database.records",
      source: "database.records",
      resourceId: "main:contacts:ada",
      schedule: (operation) => searchEvents.scheduleDatabaseRecordSearchEvent({ operation, namespaceId: "main", collectionName: "contacts", recordId: "ada", dataDir, observedAt }),
    },
    {
      label: "work.items",
      source: "work.items",
      resourceId: "main:tasks:task-alpha",
      schedule: (operation) => searchEvents.scheduleWorkItemsSearchEvent({ operation, namespaceId: "main", collectionName: "tasks", recordId: "task-alpha", dataDir, observedAt }),
    },
    {
      label: "documents.blocks",
      source: "documents.blocks",
      resourceId: "main:documents:doc-alpha",
      schedule: (operation) => searchEvents.scheduleDocumentBlocksSearchEvent({ operation, namespaceId: "main", documentId: "doc-alpha", collectionName: "documents", recordId: "doc-alpha", dataDir, observedAt }),
    },
    {
      label: "notes.pages",
      source: "notes.pages",
      resourceId: "note-alpha",
      schedule: (operation) => searchEvents.scheduleNotesPagesSearchEvent({ operation, pageId: "note-alpha", dataDir, observedAt }),
    },
    {
      label: "knowledge.graph",
      source: "knowledge.graph",
      resourceId: "entity:person.ada",
      schedule: (operation) => searchEvents.scheduleKnowledgeGraphSearchEvent({ operation, kind: "entity", id: "person.ada", dataDir, observedAt }),
    },
    {
      label: "signals.observations",
      source: "signals.observations",
      resourceId: "observation:obs-alpha",
      schedule: (operation) => searchEvents.scheduleSignalsObservationsSearchEvent({ operation, kind: "observation", id: "obs-alpha", dataDir, observedAt }),
    },
    {
      label: "calendar.events",
      source: "calendar.events",
      resourceId: "event-alpha",
      schedule: (operation) => searchEvents.scheduleCalendarEventsSearchEvent({ operation, eventId: "event-alpha", dataDir, observedAt }),
    },
    {
      label: "finance.records",
      source: "finance.records",
      resourceId: "main:finance_records:fin-alpha",
      schedule: (operation) => searchEvents.scheduleFinanceRecordsSearchEvent({ operation, namespaceId: "main", collectionName: "finance_records", recordId: "fin-alpha", dataDir, observedAt }),
    },
    {
      label: "eln.records",
      source: "eln.records",
      resourceId: "main:eln_entries:eln-alpha",
      schedule: (operation) => searchEvents.scheduleElnRecordsSearchEvent({ operation, namespaceId: "main", collectionName: "eln_entries", recordId: "eln-alpha", dataDir, observedAt }),
    },
    {
      label: "images.derived",
      source: "images.derived",
      resourceId: "image-alpha",
      schedule: (operation) => searchEvents.scheduleImageDerivedSearchEvent({ operation, imageId: "image-alpha", dataDir, observedAt }),
    },
    {
      label: "media.assets",
      source: "media.assets",
      resourceId: "media-alpha",
      schedule: (operation) => searchEvents.scheduleMediaAssetSearchEvent({ operation, mediaId: "media-alpha", dataDir, observedAt }),
    },
    {
      label: "slides.decks",
      source: "slides.decks",
      resourceId: "deck-alpha",
      schedule: (operation) => searchEvents.scheduleSlidesDeckSearchEvent({ operation, deckId: "deck-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "sheets.workbooks",
      source: "sheets.workbooks",
      resourceId: "workbook-alpha",
      schedule: (operation) => searchEvents.scheduleSheetsWorkbookSearchEvent({ operation, workbookId: "workbook-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "generations.artifacts",
      source: "generations.artifacts",
      resourceId: "generation-alpha",
      schedule: (operation) => searchEvents.scheduleGenerationArtifactSearchEvent({ operation, generationId: "generation-alpha", dataDir, observedAt }),
    },
    {
      label: "code.symbols",
      source: "code.symbols",
      resourceId: "src/app.ts",
      schedule: (operation) => searchEvents.scheduleCodeSymbolsSearchEvent({ operation, root: codeRoot, filePath: path.join(codeRoot, "src", "app.ts"), dataDir, observedAt }),
    },
    {
      label: "docs.pages",
      source: "docs.pages",
      resourceId: "docs/guide.md",
      schedule: (operation) => searchEvents.scheduleDocsPagesSearchEvent({ operation, workspaceRoot, filePath: path.join(workspaceRoot, "docs", "guide.md"), dataDir, observedAt }),
    },
    {
      label: "skills.registry",
      source: "skills.registry",
      resourceId: "skill-alpha",
      schedule: (operation) => searchEvents.scheduleSkillsRegistrySearchEvent({ operation, slug: "skill-alpha", dataDir, observedAt }),
    },
    {
      label: "providers.routing",
      source: "providers.routing",
      resourceId: "routing:chat:llm",
      schedule: (operation) => searchEvents.scheduleProvidersRoutingSearchEvent({ operation, kind: "routing", feature: "chat", capability: "llm", dataDir, observedAt }),
    },
    {
      label: "snippets.library",
      source: "snippets.library",
      resourceId: "snippet-alpha",
      schedule: (operation) => searchEvents.scheduleSnippetsLibrarySearchEvent({ operation, slug: "snippet-alpha", dataDir, observedAt }),
    },
    {
      label: "agents.catalog",
      source: "agents.catalog",
      resourceId: "agent:agent-alpha",
      schedule: (operation) => searchEvents.scheduleAgentsCatalogSearchEvent({ operation, kind: "agent", id: "agent-alpha", dataDir, observedAt }),
    },
    {
      label: "marketplace.choices",
      source: "marketplace.choices",
      resourceId: "choice-alpha",
      schedule: (operation) => searchEvents.scheduleMarketplaceChoicesSearchEvent({ operation, id: "choice-alpha", dataDir, observedAt }),
    },
    {
      label: "content.items",
      source: "content.items",
      resourceId: "item-alpha",
      schedule: (operation) => searchEvents.scheduleContentItemsSearchEvent({ operation, itemId: "item-alpha", dataDir, observedAt }),
    },
    {
      label: "business.records",
      source: "business.records",
      resourceId: "business-alpha",
      schedule: (operation) => searchEvents.scheduleBusinessRecordsSearchEvent({ operation, recordId: "business-alpha", dataDir, observedAt }),
    },
    {
      label: "social.posts",
      source: "social.posts",
      resourceId: "post-alpha",
      schedule: (operation) => searchEvents.scheduleSocialPostsSearchEvent({ operation, postId: "post-alpha", dataDir, observedAt }),
    },
    {
      label: "iot.config",
      source: "iot.config",
      resourceId: "config-alpha",
      schedule: (operation) => searchEvents.scheduleIotConfigSearchEvent({ operation, configId: "config-alpha", dataDir, observedAt }),
    },
    {
      label: "connectors.catalog",
      source: "connectors.catalog",
      resourceId: "openai.images.generate",
      schedule: (operation) => searchEvents.scheduleConnectorCatalogSearchEvent({ operation, operationId: "openai.images.generate", dataDir, observedAt }),
    },
    {
      label: "mcp.servers",
      source: "mcp.servers",
      resourceId: "docs-server",
      schedule: (operation) => searchEvents.scheduleMcpServersSearchEvent({ operation, serverId: "docs-server", configPath: path.join(workspaceRoot, "mcp.json"), dataDir, observedAt }),
    },
    {
      label: "apps.catalog",
      source: "apps.catalog",
      resourceId: "app-alpha",
      schedule: (operation) => searchEvents.scheduleAppsCatalogSearchEvent({ operation, appId: "app-alpha", dataDir, observedAt }),
    },
    {
      label: "design.resources",
      source: "design.resources",
      resourceId: "design-alpha",
      schedule: (operation) => searchEvents.scheduleDesignResourcesSearchEvent({ operation, resourceId: "design-alpha", workspaceRoot, dataDir, observedAt }),
    },
    {
      label: "runtime.events",
      source: "runtime.events",
      resourceId: "operational:monitor:runtime-alpha",
      schedule: (operation) => searchEvents.scheduleRuntimeEventsSearchEvent({ operation, kind: "operational", domain: "monitor", id: "runtime-alpha", dataDir, observedAt }),
    },
    {
      label: "surfaces.routes",
      source: "surfaces.routes",
      resourceId: "route-alpha",
      schedule: (operation) => searchEvents.scheduleSurfaceRouteSearchEvent({ operation, routeId: "route-alpha", dataDir, observedAt }),
    },
    {
      label: "local.files",
      source: "local.files",
      resourceId: "docs/file.txt",
      schedule: (operation) => searchEvents.scheduleLocalFileSearchEvent({ operation, root: fileRoot, filePath: path.join(fileRoot, "docs", "file.txt"), dataDir, observedAt }),
    },
    {
      label: "web.ingested",
      source: "web.ingested",
      resourceId: "pages/example.json",
      schedule: (operation) => searchEvents.scheduleWebIngestedSearchEvent({ operation, root: webRoot, filePath: path.join(webRoot, "pages", "example.json"), dataDir, observedAt }),
    },
    {
      label: "external.cache",
      source: "external.cache",
      resourceId: "providers/example.json",
      schedule: (operation) => searchEvents.scheduleExternalCacheSearchEvent({ operation, root: externalRoot, filePath: path.join(externalRoot, "providers", "example.json"), dataDir, observedAt }),
    },
  ];

  try {
    for (const entry of cases) {
      for (const operation of ["upsert", "delete"] as const) {
        const scheduled = entry.schedule(operation);
        assert.equal(scheduled.ok, true, scheduled.error ?? `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.source, entry.source, `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.resourceId, entry.resourceId, `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.operation, operation, `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.shard, "hot", `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.priority, operation === "delete" ? 80 : 60, `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.payload.eventDriven, true, `${entry.label}:${operation}`);
        assert.equal(scheduled.job?.payload.observedAt, observedAt, `${entry.label}:${operation}`);
      }
    }

    const store = new SearchStore(registeredSearchDatabasePath(dataDir));
    try {
      const jobs = store.listIndexJobs({ limit: 500 });
      for (const entry of cases) {
        for (const operation of ["upsert", "delete"] as const) {
          assert.ok(
            jobs.some((job) => job.source === entry.source && job.resourceId === entry.resourceId && job.operation === operation && job.status === "queued"),
            `${entry.label}:${operation}`,
          );
        }
      }
    } finally {
      store.close();
    }
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
