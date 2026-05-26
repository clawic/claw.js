import fs from "node:fs";
import path from "node:path";

import {
  clawInstructionsSchemaVersion,
  materializeSeedAsInstruction,
  validateInstructionShape,
  type CatalogSeedEntry,
  type ClawInstruction,
  type SeedInstruction,
} from "@clawjs/core/catalogs";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

interface PluginManifest {
  id?: unknown;
  instructions?: unknown;
}

function readPluginManifest(filePath: string): PluginManifest {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as PluginManifest;
  } catch (error) {
    throw new CliHandledError(
      "plugin_instructions_invalid",
      `Plugin manifest ${filePath} is not valid JSON: ${(error as Error).message}`,
      CLI_EXIT_USAGE,
    );
  }
}

function validatePluginSeed(pluginId: string, index: number, seed: unknown): SeedInstruction {
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    throw new CliHandledError(
      "plugin_instructions_invalid",
      `Plugin ${pluginId} instruction ${index} must be an object.`,
      CLI_EXIT_USAGE,
    );
  }
  const candidate = seed as SeedInstruction;
  const validation = validateInstructionShape({
    schemaVersion: candidate.schemaVersion ?? clawInstructionsSchemaVersion,
    target: candidate.target,
    trigger: candidate.trigger,
    activation: candidate.activation,
    priority: candidate.priority,
    severity: candidate.severity,
    useWhen: candidate.useWhen,
    useNot: candidate.useNot,
    readPolicy: candidate.readPolicy,
    writePolicy: candidate.writePolicy,
    before: candidate.before,
    after: candidate.after,
    forbid: candidate.forbid,
    notes: candidate.notes,
    validations: candidate.validations,
  });
  if (!validation.ok) {
    throw new CliHandledError(
      "plugin_instructions_invalid",
      `Plugin ${pluginId} instruction ${index} failed validation: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
      CLI_EXIT_USAGE,
    );
  }
  return {
    ...candidate,
    schemaVersion: candidate.schemaVersion ?? clawInstructionsSchemaVersion,
  };
}

export function listPluginMaterializedSeedInstructions(cwd: string): ClawInstruction[] {
  const pluginsRoot = path.join(cwd, "clawhub-plugins");
  if (!fs.existsSync(pluginsRoot)) return [];
  const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const seeds: ClawInstruction[] = [];
  for (const pluginDir of entries) {
    const manifestPath = path.join(pluginsRoot, pluginDir, "openclaw.plugin.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = readPluginManifest(manifestPath);
    const pluginId = typeof manifest.id === "string" && manifest.id.trim() ? manifest.id.trim() : pluginDir;
    if (manifest.instructions === undefined) continue;
    if (!Array.isArray(manifest.instructions)) {
      throw new CliHandledError(
        "plugin_instructions_invalid",
        `Plugin ${pluginId} instructions must be an array.`,
        CLI_EXIT_USAGE,
      );
    }
    for (const [index, rawSeed] of manifest.instructions.entries()) {
      const catalogEntry: CatalogSeedEntry = {
        source: `plugin:${pluginId}:${index}`,
        seed: validatePluginSeed(pluginId, index, rawSeed),
      };
      seeds.push(materializeSeedAsInstruction(catalogEntry, "1970-01-01T00:00:00.000Z"));
    }
  }
  return seeds;
}
