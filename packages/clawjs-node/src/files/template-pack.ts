import fs from "fs";
import path from "path";
import { templatePackSchema, type TemplateMutation, type TemplatePack } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import { resolveWorkspaceFileLockPath } from "../workspace/manager.ts";
import { applyTextMutation } from "./managed-blocks.ts";

export interface ApplyTemplatePackOptions {
  workspaceDir: string;
  backupDir?: string;
  filesystem?: NodeFileSystemHost;
}

export interface AppliedTemplateMutation {
  targetFile: string;
  changed: boolean;
}

export function loadTemplatePack(templatePackPath: string): TemplatePack {
  const raw = fs.readFileSync(templatePackPath, "utf8");
  return templatePackSchema.parse(JSON.parse(raw));
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function existingPathAtOrAbove(targetPath: string, boundaryPath: string): string | null {
  let currentPath = targetPath;
  while (isPathInside(boundaryPath, currentPath)) {
    if (fs.existsSync(currentPath)) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  return null;
}

function assertSafeRelativeTemplatePath(targetFile: string): void {
  const normalized = targetFile.replace(/\\/g, "/");
  if (path.isAbsolute(targetFile) || path.win32.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Template target file must be relative and cannot include absolute paths or .. segments: ${targetFile}`);
  }
}

function resolveTemplateWorkspacePath(workspaceDir: string, targetFile: string): string {
  assertSafeRelativeTemplatePath(targetFile);
  const workspaceRoot = path.resolve(workspaceDir);
  const filePath = path.resolve(workspaceRoot, targetFile);
  if (!isPathInside(workspaceRoot, filePath)) {
    throw new Error(`Template target file must stay inside the workspace: ${targetFile}`);
  }
  if (fs.existsSync(workspaceRoot)) {
    const realWorkspaceRoot = fs.realpathSync(workspaceRoot);
    const existingParent = existingPathAtOrAbove(path.dirname(filePath), workspaceRoot);
    if (existingParent) {
      const realExistingParent = fs.realpathSync(existingParent);
      if (!isPathInside(realWorkspaceRoot, realExistingParent)) {
        throw new Error(`Template target file must stay inside the workspace: ${targetFile}`);
      }
    }
  }
  return filePath;
}

function resolveTemplateSidecarPath(templatePackPath: string, targetFile: string): string {
  assertSafeRelativeTemplatePath(targetFile);
  const packDir = fs.realpathSync(path.dirname(templatePackPath));
  const sidecarPath = path.resolve(packDir, targetFile);
  if (!isPathInside(packDir, sidecarPath)) {
    throw new Error(`Template sidecar file must stay inside the template pack: ${targetFile}`);
  }
  if (!fs.existsSync(sidecarPath)) {
    throw new Error(`Missing template content for ${targetFile}`);
  }
  const realSidecarPath = fs.realpathSync(sidecarPath);
  if (!isPathInside(packDir, realSidecarPath)) {
    throw new Error(`Template sidecar file must stay inside the template pack: ${targetFile}`);
  }
  return sidecarPath;
}

function resolveMutationContent(templatePackPath: string, mutation: TemplateMutation): string {
  if (typeof mutation.content === "string") {
    return mutation.content;
  }

  const sidecarPath = resolveTemplateSidecarPath(templatePackPath, mutation.targetFile);
  return fs.readFileSync(sidecarPath, "utf8");
}

export function applyTemplatePack(templatePackPath: string, options: ApplyTemplatePackOptions): AppliedTemplateMutation[] {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const pack = loadTemplatePack(templatePackPath);
  const results: AppliedTemplateMutation[] = [];

  for (const mutation of pack.mutations) {
    const filePath = resolveTemplateWorkspacePath(options.workspaceDir, mutation.targetFile);
    const before = filesystem.tryReadText(filePath);
    const after = applyTextMutation({
      originalContent: before,
      mode: mutation.mode,
      content: resolveMutationContent(templatePackPath, mutation),
      anchor: mutation.anchor,
      blockId: mutation.blockId,
    });
    const result = filesystem.withLock(resolveWorkspaceFileLockPath(options.workspaceDir, mutation.targetFile), () => filesystem.writeTextAtomic(filePath, after, {
      backupDir: options.backupDir,
    }));
    results.push({
      targetFile: mutation.targetFile,
      changed: result.changed,
    });
  }

  return results;
}
