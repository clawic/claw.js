import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveClawGlobalDataDir } from "@clawjs/core";

import { createSkillsStore, resolveSkillsHome } from "./store.ts";
import { compileSkills } from "./compile.ts";
import { SkillsSyncEngine } from "./sync.ts";

test("skills-v2 home defaults through the shared global storage helper", () => {
  assert.equal(resolveSkillsHome({ env: {} }), resolveClawGlobalDataDir({ homeDir: os.homedir() }));
  assert.equal(resolveSkillsHome({ homeDir: "~", env: {} }), os.homedir());
  assert.equal(resolveSkillsHome({ homeDir: "~/custom-skills-home", env: {} }), path.join(os.homedir(), "custom-skills-home"));
  assert.equal(resolveSkillsHome({ env: { CLAW_HOME: "~/env-skills-home" } }), path.join(os.homedir(), "env-skills-home"));
});

test("skills-v2 store: create, get, list, search, update, remove", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-store-"));
  const store = createSkillsStore({ homeDir: home });

  const created = store.create({
    slug: "cold-email",
    kind: "procedure",
    description: "Write a cold email.",
    body: "Be concise. Single CTA.",
    tags: ["email", "sales"],
    syncTo: ["target-x"],
  });
  assert.equal(created.kind, "procedure");
  assert.equal(created.slug, "cold-email");
  assert.equal(created.frontmatter.metadata.clawjs.syncTo?.[0], "target-x");

  const fetched = store.get("cold-email");
  assert.ok(fetched);
  assert.equal(fetched?.body.includes("Single CTA"), true);

  const list = store.list();
  assert.equal(list.length, 1);

  const search = store.search("email");
  assert.equal(search[0].slug, "cold-email");

  const updated = store.update("cold-email", { tags: ["email", "sales", "outreach"] });
  assert.deepEqual(updated.frontmatter.metadata.clawjs.tags, ["email", "sales", "outreach"]);

  const removed = store.remove("cold-email");
  assert.equal(removed, true);
  assert.equal(store.get("cold-email"), null);
});

test("skills-v2 store: activate / resolveActive respects scope hierarchy", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-active-"));
  const store = createSkillsStore({ homeDir: home });
  store.create({ slug: "g1", kind: "procedure", description: "Global skill", body: "G1" });
  store.create({ slug: "p1", kind: "procedure", description: "Project skill", body: "P1" });
  store.create({ slug: "c1", kind: "procedure", description: "Session skill", body: "C1" });

  store.activate("g1", { kind: "global" });
  store.activate("p1", { kind: "project", projectIds: ["proj-a"] });
  store.activate("c1", { kind: "session", sessionId: "session-x" });

  const noCtx = store.resolveActive();
  assert.deepEqual(noCtx.map((s) => s.slug), ["g1"]);

  const projOnly = store.resolveActive({ projectId: "proj-a" });
  // session > project > global ordering
  assert.deepEqual(projOnly.map((s) => s.slug).sort(), ["g1", "p1"].sort());

  const sessionCtx = store.resolveActive({ projectId: "proj-a", sessionId: "session-x" });
  assert.equal(sessionCtx[0].slug, "c1");
  assert.equal(sessionCtx.length, 3);
});

test("skills-v2: instantiate + freeze produces inline body", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-instance-"));
  const store = createSkillsStore({ homeDir: home });
  store.create({
    slug: "email-template",
    kind: "procedure",
    description: "Email template",
    body: "Write {{tone}} email of length {{length}}.",
  });
  const inst = store.instantiate("email-template", { tone: "formal", length: "short" }, { saveAs: "my-email", freeze: false });
  assert.equal(inst.frontmatter.metadata.clawjs.instance?.frozen, false);
  // Body is empty when not frozen; compile resolves via template.
  const compiledLazy = compileSkills(store, ["my-email"]);
  assert.equal(compiledLazy.includes("Write formal email of length short"), true);

  const frozen = store.freeze("my-email");
  assert.equal(frozen.frontmatter.metadata.clawjs.instance?.frozen, true);
  assert.equal(frozen.body.includes("Write formal email of length short"), true);
});

test("skills-v2: list filters by kind, tags, scope", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-filter-"));
  const store = createSkillsStore({ homeDir: home });
  store.create({ slug: "p", kind: "personality", description: "P", body: "P", tags: ["x"] });
  store.create({ slug: "q", kind: "procedure", description: "Q", body: "Q", tags: ["y"] });
  store.create({ slug: "r", kind: "snippet", description: "R", body: "R", tags: ["x", "y"] });
  assert.deepEqual(store.list({ kinds: ["personality"] }).map((s) => s.slug), ["p"]);
  assert.deepEqual(store.list({ tags: ["y"] }).map((s) => s.slug).sort(), ["q", "r"].sort());
});

test("skills-v2: composite role expands children at compile time", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-role-"));
  const store = createSkillsStore({ homeDir: home });
  store.create({ slug: "a", kind: "snippet", description: "A", body: "alpha" });
  store.create({ slug: "b", kind: "snippet", description: "B", body: "bravo" });
  store.create({ slug: "ab", kind: "role", description: "AB", body: "", children: ["a", "b"] });
  const out = compileSkills(store, ["ab"]);
  assert.equal(out.includes("alpha"), true);
  assert.equal(out.includes("bravo"), true);
});

test("skills-v2: capsule rendering precedes full bodies, sorted by priority", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-capsule-"));
  const store = createSkillsStore({ homeDir: home });
  store.create({ slug: "high", kind: "snippet", description: "H", body: "high body", capsule: { text: "high cap", priority: 100 } });
  store.create({ slug: "low", kind: "snippet", description: "L", body: "low body", capsule: { text: "low cap", priority: 10 } });
  const out = compileSkills(store, ["low", "high"]);
  const highCapIdx = out.indexOf("high cap");
  const lowCapIdx = out.indexOf("low cap");
  const highBodyIdx = out.indexOf("high body");
  assert.ok(highCapIdx < lowCapIdx);
  assert.ok(lowCapIdx < highBodyIdx);
});

test("skills-v2 sync preserves unmanaged target directories with matching slugs", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-sync-conflict-"));
  const targetHome = path.join(home, "external-target");
  const store = createSkillsStore({ homeDir: home });
  store.create({
    slug: "cold-email",
    kind: "procedure",
    description: "Write a cold email.",
    body: "Central skill body.",
    syncTo: ["external"],
  });
  store.registerSyncTarget({ id: "external", home: targetHome, mode: "symlink" });
  assert.equal(store.syncTargets().some((target) => target.id === "external"), true);

  const unmanagedDir = path.join(targetHome, "cold-email");
  fs.mkdirSync(unmanagedDir, { recursive: true });
  fs.writeFileSync(path.join(unmanagedDir, "SKILL.md"), "user owned skill\n");

  const report = await new SkillsSyncEngine({ store }).sync({ targets: ["external"] });

  assert.equal(fs.lstatSync(unmanagedDir).isDirectory(), true);
  assert.equal(fs.readFileSync(path.join(unmanagedDir, "SKILL.md"), "utf8"), "user owned skill\n");
  assert.equal(report.synced.some((entry) => entry.slug === "cold-email"), false);
  assert.equal(report.warnings.some((warning) => warning.includes("refusing to replace unmanaged target")), true);
});

test("skills-v2 sync reports unknown target filters", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skills-v2-sync-missing-target-"));
  const store = createSkillsStore({ homeDir: home });
  const targetHome = path.join(home, "external-target");
  store.registerSyncTarget({ id: "external", home: targetHome, mode: "copy" });

  const report = await new SkillsSyncEngine({ store }).sync({ targets: ["missing"] });

  assert.deepEqual(report.synced, []);
  assert.deepEqual(report.removed, []);
  assert.equal(report.warnings.includes("target missing: sync target not registered"), true);
});
