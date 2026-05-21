import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsServiceStore } from "./store.ts";

test("sidebarBootstrap returns old pins plus capped recent active sessions", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-sidebar-bootstrap-"));
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  const visibleProject = store.createProject({ displayName: "Visible", path: path.join(rootDir, "visible") });
  store.createProject({ displayName: "Hidden", path: path.join(rootDir, "hidden"), hidden: true });
  store.createProject({ displayName: "Archived", path: path.join(rootDir, "archived"), archived: true });

  store.createSession({ id: "pin-old", agent: "codex", projectId: visibleProject.id, createdAt: 1_000, title: "Old pin" });
  store.createSession({ id: "pin-new", agent: "codex", projectId: visibleProject.id, createdAt: 5_000, title: "New pin" });
  store.createSession({ id: "recent-1", agent: "codex", projectId: visibleProject.id, createdAt: 4_000, title: "Recent 1" });
  store.createSession({ id: "recent-2", agent: "codex", projectId: visibleProject.id, createdAt: 3_000, title: "Recent 2" });
  store.createSession({ id: "recent-3", agent: "codex", projectId: visibleProject.id, createdAt: 2_000, title: "Recent 3" });
  store.createSession({ id: "archived-pin", agent: "codex", projectId: visibleProject.id, createdAt: 6_000, title: "Archived pin" });
  store.createSession({ id: "hidden-recent", agent: "codex", projectId: visibleProject.id, createdAt: 7_000, title: "Hidden recent" });
  store.setPinned("pin-old", true);
  store.setPinned("pin-new", true);
  store.setPinned("archived-pin", true);
  store.setArchived("archived-pin", true);
  store.setSidebarVisibility("hidden-recent", false);

  const bootstrap = store.sidebarBootstrap({ recentLimit: 2 });

  assert.deepEqual(bootstrap.projects.map((project) => project.id), [visibleProject.id]);
  assert.deepEqual(bootstrap.pinned.map((session) => session.id), ["pin-new", "pin-old"]);
  assert.deepEqual(bootstrap.recent.map((session) => session.id), ["recent-1", "recent-2"]);
  assert.equal(bootstrap.totalActiveVisible, 5);
  store.close();
});
