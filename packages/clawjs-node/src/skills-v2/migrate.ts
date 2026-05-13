// Auto-migration of legacy state into the unified skills-v2 layout.
// Runs at startup, idempotent via `.migrated` markers in workspace dir.

import fs from "fs";
import path from "path";

import type { SoulSpec } from "@clawjs/core";

import type { NodeFileSystemHost } from "../host/filesystem.ts";
import type { SkillsStore } from "./store.ts";
import { CLAW_DIR } from "../workspace/manifest.ts";

export interface MigrateOptions {
  workspaceDir: string;
  store: SkillsStore;
  filesystem: NodeFileSystemHost;
  /** Render a SoulSpec to prose body (provided by soul/store.ts to avoid circular deps). */
  renderSoulMarkdown: (spec: SoulSpec) => string;
}

interface MigrationReport {
  souls: number;
  library: number;
  intentSkills: number;
  warnings: string[];
}

const MIGRATED_MARKER = ".skills-v2.migrated";

export function migrateLegacyState(options: MigrateOptions): MigrationReport {
  const report: MigrationReport = { souls: 0, library: 0, intentSkills: 0, warnings: [] };
  const stateDir = path.join(options.workspaceDir, CLAW_DIR);
  const marker = path.join(stateDir, MIGRATED_MARKER);
  if (fs.existsSync(marker)) return report;

  try {
    report.souls = migrateSouls(options);
  } catch (err) {
    report.warnings.push(`souls: ${(err as Error).message}`);
  }
  try {
    report.library = migrateLibrary(options);
  } catch (err) {
    report.warnings.push(`library: ${(err as Error).message}`);
  }
  try {
    report.intentSkills = migrateSkillsIntent(options);
  } catch (err) {
    report.warnings.push(`skills: ${(err as Error).message}`);
  }

  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } catch {
    // marker write failed: next run will try again. Acceptable.
  }
  return report;
}

function migrateSouls(options: MigrateOptions): number {
  const soulsPath = path.join(options.workspaceDir, CLAW_DIR, "souls.json");
  if (!fs.existsSync(soulsPath)) return 0;
  let parsed: { specs?: SoulSpec[] };
  try {
    parsed = JSON.parse(fs.readFileSync(soulsPath, "utf8")) as { specs?: SoulSpec[] };
  } catch {
    return 0;
  }
  let count = 0;
  for (const spec of parsed.specs ?? []) {
    if (!spec || typeof spec !== "object") continue;
    const slug = spec.id;
    if (!slug) continue;
    if (options.store.get(slug)) continue;
    const body = options.renderSoulMarkdown(spec);
    options.store.create({
      slug,
      name: spec.title || slug,
      description: spec.description || `Personality skill: ${spec.title || slug}`,
      kind: "personality",
      version: "0.1.0",
      body,
      soul: { presetId: spec.presetId, modules: spec.modules as unknown as Record<string, unknown> },
      tags: ["migrated", "personality"],
    });
    count++;
  }
  return count;
}

function migrateLibrary(options: MigrateOptions): number {
  // Best-effort: don't fail if library asset shape varies.
  const libraryStateCandidates = [
    path.join(options.workspaceDir, CLAW_DIR, "library", "library.json"),
  ];
  let migrated = 0;
  for (const candidate of libraryStateCandidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8")) as { assets?: Array<Record<string, unknown>> };
      for (const asset of raw.assets ?? []) {
        const id = String(asset.id ?? "").trim();
        if (!id || options.store.get(id)) continue;
        const kind = asset.kind === "bundle" ? "role" : asset.kind === "instruction" ? "snippet" : "procedure";
        options.store.create({
          slug: id,
          name: String(asset.title ?? id),
          description: String(asset.description ?? `Imported library asset: ${id}`),
          kind,
          tags: Array.isArray(asset.tags) ? asset.tags as string[] : undefined,
          ...(asset.context && typeof asset.context === "object"
            ? { capsule: { text: String((asset.context as Record<string, unknown>).capsule ?? ""), priority: Number((asset.context as Record<string, unknown>).priority ?? 100) } }
            : {}),
          ...(asset.kind === "bundle" && Array.isArray(asset.bundleAssetIds) ? { children: asset.bundleAssetIds as string[] } : {}),
        });
        migrated++;
      }
    } catch {
      // ignore broken file
    }
  }
  return migrated;
}

function migrateSkillsIntent(options: MigrateOptions): number {
  const skillsPath = path.join(options.workspaceDir, CLAW_DIR, "skills.json");
  if (!fs.existsSync(skillsPath)) return 0;
  // The legacy intent file is a record of preferences, not skill content.
  // We don't need to materialize it as skills; assignments are migrated only
  // if the user opted into skills-v2 explicitly.
  // Touch is enough to mark the migration step.
  try {
    JSON.parse(fs.readFileSync(skillsPath, "utf8"));
  } catch {
    // ignore
  }
  return 0;
}
