import fs from "fs";
import path from "path";

import type { SkillFrontmatter, SkillImportReport, SkillKind } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import type { SkillsStore } from "./store.ts";
import { buildSkillMd } from "./yaml.ts";
import { splitFrontmatter } from "./yaml-parse.ts";

export interface ImporterOptions {
  store: SkillsStore;
  filesystem?: NodeFileSystemHost;
  /** External directories to scan. Defaults to ~/.codex/skills + ~/.hermes/skills. */
  externalDirs?: string[];
}

const DEFAULT_EXTERNAL_DIRS = ["~/.codex/skills", "~/.hermes/skills"];

export class SkillsImporter {
  private readonly store: SkillsStore;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: ImporterOptions) {
    this.store = options.store;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  async importExternal(opts: { dirs?: string[] } = {}): Promise<SkillImportReport> {
    const dirs = opts.dirs ?? this.store.externalDirs(DEFAULT_EXTERNAL_DIRS);
    const report: SkillImportReport = { imported: [], skipped: [], warnings: [] };
    for (const dir of dirs) {
      try {
        await this.importDir(dir, report);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        report.warnings.push(`${dir}: ${(err as Error).message}`);
      }
    }
    return report;
  }

  private async importDir(dir: string, report: SkillImportReport): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const entryPath = path.join(dir, entry.name);
      // Skip if already a symlink into our central skills dir
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          const link = fs.readlinkSync(entryPath);
          const resolved = path.isAbsolute(link) ? link : path.resolve(dir, link);
          if (resolved.startsWith(this.store.skillsDir)) continue;
        }
      } catch {
        continue;
      }
      const skillMd = path.join(entryPath, "SKILL.md");
      if (!fs.existsSync(skillMd)) {
        report.skipped.push({ path: entryPath, reason: "no SKILL.md" });
        continue;
      }
      try {
        const result = this.importSingleSkill(entryPath, skillMd);
        if (result) {
          report.imported.push({ slug: result.slug, from: dir, kind: result.kind });
        } else {
          report.skipped.push({ path: entryPath, reason: "duplicate or invalid" });
        }
      } catch (err) {
        report.warnings.push(`${entryPath}: ${(err as Error).message}`);
      }
    }
  }

  private importSingleSkill(externalDir: string, skillMd: string): { slug: string; kind: SkillKind } | null {
    const raw = fs.readFileSync(skillMd, "utf8");
    const { frontmatter, body } = splitFrontmatter(raw);
    if (!frontmatter) {
      // Try to import a skill that has only standard agentskills.io fields without our metadata.
      const fallback = this.tryImportLegacy(externalDir, raw);
      if (fallback) return fallback;
      return null;
    }
    const inferredKind = inferKind(frontmatter);
    const slug = this.store["constructor"]
      ? slugFromFrontmatter(frontmatter, externalDir)
      : path.basename(externalDir);
    const existing = this.store.get(slug);
    if (existing) {
      // Conflict: don't overwrite
      return null;
    }
    const fm = ensureClawjsMetadata(frontmatter, inferredKind, externalDir);
    const targetDir = path.join(this.store.skillsDir, inferredKind, path.basename(externalDir));
    const targetFile = path.join(targetDir, "SKILL.md");
    this.filesystem.ensureDir(targetDir);
    this.filesystem.writeTextAtomic(targetFile, buildSkillMd(fm, body));
    // Copy the rest of the directory contents (references, scripts, etc.).
    copyAuxFiles(externalDir, targetDir);
    // Replace the original location with a symlink back to central.
    try {
      fs.rmSync(externalDir, { recursive: true, force: true });
      fs.symlinkSync(targetDir, externalDir, "dir");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES") {
        // Best-effort: leave both copies in place if we can't symlink back.
      }
    }
    return { slug, kind: inferredKind };
  }

  private tryImportLegacy(externalDir: string, raw: string): { slug: string; kind: SkillKind } | null {
    // Even without frontmatter, if a SKILL.md exists with a minimal title line, treat as a snippet.
    const slug = path.basename(externalDir).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    if (!slug) return null;
    if (this.store.get(slug)) return null;
    const titleMatch = raw.match(/^#\s*(.+)\s*$/m);
    const title = titleMatch?.[1]?.trim() || slug;
    const fm: SkillFrontmatter = {
      name: slug,
      description: title,
      version: "0.1.0",
      metadata: {
        clawjs: {
          schemaVersion: 1,
          kind: "snippet",
          importedFrom: externalDir,
        },
      },
    };
    const targetDir = path.join(this.store.skillsDir, "snippet", slug);
    const targetFile = path.join(targetDir, "SKILL.md");
    this.filesystem.ensureDir(targetDir);
    this.filesystem.writeTextAtomic(targetFile, buildSkillMd(fm, raw));
    copyAuxFiles(externalDir, targetDir);
    try {
      fs.rmSync(externalDir, { recursive: true, force: true });
      fs.symlinkSync(targetDir, externalDir, "dir");
    } catch {
      // best-effort
    }
    return { slug, kind: "snippet" };
  }
}

function slugFromFrontmatter(frontmatter: Record<string, unknown>, fallbackDir: string): string {
  const name = typeof frontmatter.name === "string" ? frontmatter.name : "";
  const candidate = name.trim() || path.basename(fallbackDir);
  return candidate.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || path.basename(fallbackDir);
}

function inferKind(frontmatter: Record<string, unknown>): SkillKind {
  const fmAny = frontmatter as Record<string, any>;
  const declared = fmAny?.metadata?.clawjs?.kind;
  if (declared === "personality" || declared === "procedure" || declared === "snippet" || declared === "role") {
    return declared;
  }
  // Heuristics: if it looks like a soul (has "soul:" or "personality" tag), classify accordingly.
  if (fmAny?.metadata?.clawjs?.soul) return "personality";
  return "procedure";
}

function ensureClawjsMetadata(
  frontmatter: Record<string, unknown>,
  kind: SkillKind,
  importedFrom: string,
): SkillFrontmatter {
  const fmAny = frontmatter as Record<string, any>;
  const out: any = { ...fmAny };
  if (typeof out.name !== "string" || !out.name) {
    out.name = path.basename(importedFrom).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  }
  if (typeof out.description !== "string" || !out.description) {
    out.description = `Imported skill: ${out.name}`;
  }
  if (!out.version) out.version = "0.1.0";
  out.metadata = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
  out.metadata.clawjs = out.metadata.clawjs && typeof out.metadata.clawjs === "object" ? { ...out.metadata.clawjs } : {};
  out.metadata.clawjs.schemaVersion = 1;
  out.metadata.clawjs.kind = kind;
  out.metadata.clawjs.importedFrom = importedFrom;
  return out as SkillFrontmatter;
}

function copyAuxFiles(src: string, dest: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "SKILL.md") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyAuxFiles(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
      } catch {
        try { fs.copyFileSync(srcPath, destPath); } catch { /* ignore */ }
      }
    } else {
      try { fs.copyFileSync(srcPath, destPath); } catch { /* ignore */ }
    }
  }
}
