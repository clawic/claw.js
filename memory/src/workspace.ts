import fs from "node:fs";
import path from "node:path";
import { CORE_SCHEMA } from "./core-ontology";
import { AppConfig, WorkspacePaths } from "./types";
import { ensureDir, readJsonFile, resolveWorkspaceRoot, writeJsonFile } from "./utils";

export function getWorkspacePaths(root: string): WorkspacePaths {
  const memoryDir = path.join(root, ".memory");
  const notesDir = path.join(memoryDir, "notes");
  return {
    root,
    memoryDir,
    configPath: path.join(memoryDir, "config.json"),
    schemaDir: path.join(memoryDir, "schema"),
    notesDir,
    entitiesDir: path.join(notesDir, "entities"),
    memoriesDir: path.join(notesDir, "memories"),
    capturesDir: path.join(memoryDir, "captures"),
    indexDbPath: path.join(memoryDir, "search.sqlite")
  };
}

export function initWorkspace(root: string, force = false): WorkspacePaths {
  const paths = getWorkspacePaths(root);
  ensureDir(paths.memoryDir);
  ensureDir(paths.schemaDir);
  ensureDir(paths.entitiesDir);
  ensureDir(paths.memoriesDir);
  ensureDir(paths.capturesDir);

  const config: AppConfig = {
    version: 3,
    format: "markdown-first",
    activeMemory: {
      enabled: true,
      maxResults: 6,
      maxSummaryChars: 220,
      minScore: 0.02,
      semanticSearch: false
    }
  };

  if (force || !fs.existsSync(paths.configPath)) {
    writeJsonFile(paths.configPath, config);
  }

  const corePath = path.join(paths.schemaDir, "core.json");
  if (force || !fs.existsSync(corePath)) {
    writeJsonFile(corePath, CORE_SCHEMA);
  }

  return paths;
}

export function loadWorkspace(startDir: string): WorkspacePaths {
  const root = resolveWorkspaceRoot(startDir);
  const paths = getWorkspacePaths(root);
  if (!fs.existsSync(paths.configPath)) {
    throw new Error(`Workspace config not found at ${paths.configPath}`);
  }
  return paths;
}

export function loadWorkspaceConfig(paths: WorkspacePaths): AppConfig {
  return readJsonFile<AppConfig>(paths.configPath);
}
