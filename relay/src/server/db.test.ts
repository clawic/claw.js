import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { RelayDatabase } from "./db.ts";

function createDb(): RelayDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-db-"));
  return new RelayDatabase(path.join(dir, "infra.sqlite"));
}

test("closing a superseded connector session keeps the active replacement online", () => {
  const db = createDb();
  try {
    const tenantId = "demo-tenant";
    const connectorId = "demo-connector";
    const agentId = "demo-agent";

    db.upsertConnector(tenantId, connectorId, agentId, "Demo Connector");
    db.markConnectorOnline({
      sessionId: "old-session",
      credentialId: "old-credential",
      tenantId,
      connectorId,
      agentId,
      capabilities: ["sessions"],
      version: "old",
    });
    db.markConnectorOnline({
      sessionId: "new-session",
      credentialId: "new-credential",
      tenantId,
      connectorId,
      agentId,
      capabilities: ["sessions"],
      version: "new",
    });

    db.markConnectorOffline("old-session");
    assert.equal(db.getConnector(tenantId, connectorId)?.status, "online");

    db.markConnectorOffline("new-session");
    assert.equal(db.getConnector(tenantId, connectorId)?.status, "offline");
  } finally {
    db.close();
  }
});
