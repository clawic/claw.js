import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildGoogleOperationRequest,
  GOOGLE_ACTION_SPECS,
  isGoogleActionOperationSupported,
} from "./google-operation-executor.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const GOOGLE_ACTIONS = GOOGLE_ACTION_SPECS.map((spec) => ({
  id: `google.action.${spec.slug}`,
  appId: "google",
  kind: "action" as const,
  name: titleize(spec.slug),
  fields: spec.fields,
  authFieldNames: ["googleAccessToken"],
}));

const GOOGLE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "google",
    name: "Google",
    authFieldNames: ["googleAccessToken"],
    fields: [{
      name: "googleAccessToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: GOOGLE_ACTIONS,
  }],
});

const auth = [{ type: "secret" as const, field: "googleAccessToken", placement: "bearer" as const }];
const headers = { accept: "application/json" };

describe("google operation runtime", () => {
  it("builds Google Drive, Gmail, Calendar, Sheets, Docs, Forms, and Tasks plans", () => {
    assert.equal(isGoogleActionOperationSupported("google.action.list-drive-files"), true);
    assert.equal(isGoogleActionOperationSupported("google.action.send-gmail-message"), true);
    assert.equal(isGoogleActionOperationSupported("google.action.fly-to-moon"), false);

    assert.deepEqual(buildGoogleOperationRequest(operation("google.action.list-drive-files"), {
      pageSize: 25,
      pageToken: "cursor-1",
      q: "trashed = false",
    }), {
      method: "GET",
      endpoint: "drive/v3/files",
      auth,
      headers,
      query: {
        pageSize: 25,
        pageToken: "cursor-1",
        q: "trashed = false",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["files"],
      },
      pagination: {
        mode: "cursor",
        itemsPath: "files",
        nextCursorPath: "nextPageToken",
        cursorParam: "pageToken",
        limitParam: "pageSize",
        pageSize: 100,
        maxPages: 1,
      },
    });

    assert.deepEqual(buildGoogleOperationRequest(operation("google.action.send-gmail-message"), {
      userId: "me",
      raw: "UmF3",
    }), {
      method: "POST",
      endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      auth,
      headers,
      query: {},
      body: { raw: "UmF3" },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildGoogleOperationRequest(operation("google.action.create-calendar-event"), {
      calendarId: "primary",
      summary: "Planning",
      start: { dateTime: "2026-05-13T09:00:00Z" },
      end: { dateTime: "2026-05-13T10:00:00Z" },
      attendees: [{ email: "person@example.invalid" }],
    }), {
      method: "POST",
      endpoint: "calendar/v3/calendars/primary/events",
      auth,
      headers,
      query: {},
      body: {
        summary: "Planning",
        start: { dateTime: "2026-05-13T09:00:00Z" },
        end: { dateTime: "2026-05-13T10:00:00Z" },
        attendees: [{ email: "person@example.invalid" }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "summary"],
      },
    });

    assert.deepEqual(buildGoogleOperationRequest(operation("google.action.update-sheet-values"), {
      spreadsheetId: "sheet-123",
      range: "Sheet1!A1:B2",
      valueInputOption: "RAW",
      values: [["A", "B"]],
    }), {
      method: "PUT",
      endpoint: "https://sheets.googleapis.com/v4/spreadsheets/sheet-123/values/Sheet1!A1%3AB2",
      auth,
      headers,
      query: {
        valueInputOption: "RAW",
      },
      body: {
        range: "Sheet1!A1:B2",
        values: [["A", "B"]],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["spreadsheetId", "updatedCells"],
      },
    });

    assert.deepEqual(buildGoogleOperationRequest(operation("google.action.batch-update-document"), {
      documentId: "doc-123",
      requests: [{ insertText: { location: { index: 1 }, text: "Hello" } }],
    }), {
      method: "POST",
      endpoint: "https://docs.googleapis.com/v1/documents/doc-123:batchUpdate",
      auth,
      headers,
      query: {},
      body: {
        requests: [{ insertText: { location: { index: 1 }, text: "Hello" } }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["documentId", "replies"],
      },
    });
  });

  it("covers Google operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GOOGLE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GOOGLE_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GOOGLE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GOOGLE_ACTIONS.map((action) => action.id).sort(),
    );
  });
});

function operation(operationId: string): ConnectorOperationDefinition {
  const found = GOOGLE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
