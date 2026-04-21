import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CLI_PATH = path.resolve(__dirname, "../cli.js");

export function createTestWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-test-"));
  runCli(["init", "--dir", workspace], workspace);
  return workspace;
}

export function runCli(args: string[], cwd: string) {
  const output = execFileSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8"
  });
  return JSON.parse(output);
}

export function runCliExpectFailure(args: string[], cwd: string): string {
  try {
    execFileSync(process.execPath, [CLI_PATH, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    assert.fail("Expected command to fail");
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? "").trim();
  }
}

export function writeNote(workspace: string, bucket: "entities" | "memories", fileName: string, content: string) {
  fs.writeFileSync(path.join(workspace, ".memory", "notes", bucket, fileName), content, "utf8");
}

export function seedStandardNotes(workspace: string) {
  runCli(["new", "entity", "technology", "--id", "tech_react", "--title", "React"], workspace);

  writeNote(workspace, "entities", "person_ana.md", `---
id: person_ana
slug: ana
kind: entity
type: person
title: Ana
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
aliases:
  - ana
  - ana-dev
role: engineer
timezone: Europe/Madrid
works_on:
  - project_memory
---

Ana is the main engineer for Memory.
`);

  writeNote(workspace, "entities", "project_memory.md", `---
id: project_memory
slug: memory
kind: entity
type: project
title: Memory
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
uses:
  - target: tech_flutter
    confidence: 0.9
    since: 2026-04-15
---

Markdown-first memory system.
`);

  writeNote(workspace, "entities", "tech_flutter.md", `---
id: tech_flutter
slug: flutter-sdk
kind: entity
type: technology
title: Flutter SDK
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
aliases:
  - flutter
technologyKind: framework
related_topics:
  - topic_ui
---

Framework UI multiplataforma.
`);

  writeNote(workspace, "entities", "topic_ui.md", `---
id: topic_ui
slug: ui
kind: entity
type: topic
title: UI
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
domain: frontend
---

Interface design and implementation.
`);

  writeNote(workspace, "entities", "src_kickoff_chat.md", `---
id: src_kickoff_chat
slug: kickoff-chat
kind: entity
type: source
title: Kickoff chat
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
sourceKind: conversation
---

Initial planning conversation.
`);

  writeNote(workspace, "memories", "mem_ana_flutter_preference.md", `---
id: mem_ana_flutter_preference
slug: ana-prefers-flutter
kind: memory
type: preference_note
title: Ana prefiere Flutter
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
observedAt: 2026-04-15
subject: person_ana
about:
  - tech_flutter
prefers:
  - target: tech_flutter
    confidence: 0.95
    since: 2026-04-15
    context: ui iteration
stability: high
source:
  - src_kickoff_chat
---

Ana prefiere Flutter cuando quiere iterar interfaces rapido.
`);

  writeNote(workspace, "memories", "mem_source_extract.md", `---
id: mem_source_extract
slug: kickoff-extract
kind: memory
type: source_extract
title: Kickoff extract
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
source:
  - src_kickoff_chat
about:
  - project_memory
quote: |
  Flutter is the default for demos.
  Keep iteration speed high.
---

Captured evidence from the kickoff chat.
`);
}
