import fs from "fs";
import path from "path";

import type { SkillSpec, SkillSyncMode, SkillSyncReport, SkillSyncTarget } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import type { SkillsStore } from "./store.ts";

export interface SyncEngineOptions {
  store: SkillsStore;
  filesystem?: NodeFileSystemHost;
}

/**
 * Materialize each skill's `metadata.clawjs.syncTo` into actual filesystem
 * entries inside registered sync targets. Idempotent. Removes orphan links
 * for skills no longer requesting that target.
 */
export class SkillsSyncEngine {
  private readonly store: SkillsStore;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: SyncEngineOptions) {
    this.store = options.store;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  async sync(opts: { targets?: string[] } = {}): Promise<SkillSyncReport> {
    const targets = this.store.syncTargets();
    const filterIds = opts.targets && opts.targets.length > 0 ? new Set(opts.targets) : null;
    const activeTargets = filterIds ? targets.filter((t) => filterIds.has(t.id)) : targets;
    const report: SkillSyncReport = { synced: [], removed: [], warnings: [] };
    const skills = this.store.list();

    for (const target of activeTargets) {
      try {
        await this.syncTarget(target, skills, report);
      } catch (err) {
        report.warnings.push(`target ${target.id}: ${(err as Error).message}`);
      }
    }
    return report;
  }

  private async syncTarget(target: SkillSyncTarget, skills: SkillSpec[], report: SkillSyncReport): Promise<void> {
    const targetHome = target.home;
    try {
      this.filesystem.ensureDir(targetHome);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        report.warnings.push(`target ${target.id}: cannot create ${targetHome} (${code})`);
        return;
      }
      throw err;
    }

    const desired = new Map<string, { spec: SkillSpec; mode: SkillSyncMode }>();
    for (const spec of skills) {
      const syncTo = spec.frontmatter.metadata.clawjs.syncTo ?? [];
      if (!syncTo.includes(target.id)) continue;
      const mode: SkillSyncMode = spec.frontmatter.metadata.clawjs.syncMode ?? target.mode ?? "symlink";
      desired.set(spec.slug, { spec, mode });
    }

    // Remove orphans: only entries whose readlink points to our central skills dir,
    // or marked-managed copies (we don't aggressively delete unrelated user data).
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(targetHome, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const entryName = entry.name;
      const entryPath = path.join(targetHome, entryName);
      if (desired.has(entryName)) continue;
      // Only remove if it's a symlink we own (points into central skills dir).
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(entryPath);
          const resolved = path.isAbsolute(linkTarget) ? linkTarget : path.resolve(targetHome, linkTarget);
          if (resolved.startsWith(this.store.skillsDir)) {
            fs.unlinkSync(entryPath);
            report.removed.push({ slug: entryName, target: target.id });
          }
        }
      } catch {
        // ignore
      }
    }

    for (const [slug, { spec, mode }] of desired) {
      const dest = path.join(targetHome, slug);
      const sourceDir = path.dirname(spec.filePath);
      try {
        if (mode === "symlink") {
          this.ensureSymlink(sourceDir, dest);
        } else {
          this.ensureCopy(sourceDir, dest);
        }
        report.synced.push({ slug, target: target.id, mode });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EACCES") {
          // Fallback to copy mode
          try {
            this.ensureCopy(sourceDir, dest);
            report.synced.push({ slug, target: target.id, mode: "copy" });
            report.warnings.push(`target ${target.id}/${slug}: symlink not permitted, used copy fallback`);
          } catch (err2) {
            report.warnings.push(`target ${target.id}/${slug}: ${(err2 as Error).message}`);
          }
        } else {
          report.warnings.push(`target ${target.id}/${slug}: ${(err as Error).message}`);
        }
      }
    }
  }

  private ensureSymlink(source: string, dest: string): void {
    try {
      const stat = fs.lstatSync(dest);
      if (stat.isSymbolicLink()) {
        const current = fs.readlinkSync(dest);
        const resolvedCurrent = path.isAbsolute(current) ? current : path.resolve(path.dirname(dest), current);
        if (resolvedCurrent === source) return;
        fs.unlinkSync(dest);
      } else {
        // Existing dir/file in our path: replace with symlink only if it looks like our previous copy.
        if (stat.isDirectory()) {
          fs.rmSync(dest, { recursive: true, force: true });
        } else {
          fs.unlinkSync(dest);
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    this.filesystem.ensureDir(path.dirname(dest));
    fs.symlinkSync(source, dest, "dir");
  }

  private ensureCopy(source: string, dest: string): void {
    try {
      const stat = fs.lstatSync(dest);
      if (stat.isSymbolicLink()) fs.unlinkSync(dest);
      else if (stat.isDirectory()) fs.rmSync(dest, { recursive: true, force: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    this.filesystem.ensureDir(dest);
    copyDirRecursive(source, dest);
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(srcPath);
      try {
        fs.symlinkSync(link, destPath);
      } catch {
        fs.copyFileSync(srcPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
