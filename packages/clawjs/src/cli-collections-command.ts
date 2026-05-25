import { PRODUCTIVITY_COLLECTION_DEFINITIONS } from "@clawjs/core";
import { BUILTIN_COLLECTIONS } from "@clawjs/core/catalogs";

import type { CliContext } from "./index.ts";
import { CORE_PRODUCTIVITY_DB_COLLECTIONS } from "./cli-constants.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { activeCollectionFilterForModules, readEffectiveModuleConfigForCli } from "./cli-modules-command.ts";

export async function runCollectionsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  runCli: (argv: string[], context: CliContext) => Promise<number>;
}): Promise<number> {
  const [, command, collectionName] = input.positionals;
  if (command !== "list") {
    if (command === "schema" && collectionName) {
      return await input.runCli(["db", collectionName, "schema", ...input.argv.slice(3)], input.context);
    }
    return await input.runCli(["db", ...input.argv.slice(1)], input.context);
  }

  const limit = parseCollectionsLimit(input.flags.limit);
  const includeAvailable = readBooleanFlag(input.argv, input.flags, "available", false);
  const moduleConfig = readEffectiveModuleConfigForCli(input.flags, input.context.cwd);
  const activeFilter = activeCollectionFilterForModules(moduleConfig);
  const productivityCollections = PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => ({
    name: collection.name,
    displayName: collection.displayName,
    family: "productivity",
    moduleId: activeFilter.collectionNames.has(collection.name) ? "basic-productivity" : null,
    state: activeFilter.collectionNames.has(collection.name) ? "enabled" : "available",
    aliases: Object.entries(CORE_PRODUCTIVITY_DB_COLLECTIONS)
      .filter(([, canonicalName]) => canonicalName === collection.name)
      .map(([alias]) => alias)
      .sort(),
    fieldCount: collection.fields.length,
  }));
  const builtinCollections = BUILTIN_COLLECTIONS.map((collection) => ({
    name: collection.name,
    displayName: collection.displayName,
    family: collection.family,
    moduleId: activeFilter.families.has(collection.family) ? collection.family : null,
    state: activeFilter.families.has(collection.family) ? "enabled" : "available",
    aliases: collection.aliases ?? [],
    fieldCount: collection.fields?.length ?? 0,
  }));
  const byName = new Map([...productivityCollections, ...builtinCollections].map((collection) => [collection.name, collection]));
  const collections = [...byName.values()]
    .filter((collection) => includeAvailable || collection.state === "enabled")
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((collection) => ({
      name: collection.name,
      displayName: collection.displayName,
      family: collection.family,
      state: collection.state,
      moduleId: collection.moduleId,
      aliases: collection.aliases,
      fieldCount: collection.fieldCount,
      commands: {
        schema: `claw collections ${collection.name} schema --json`,
        list: `claw db ${collection.name} list --json`,
        query: `claw db ${collection.name} query <text> --json`,
      },
    }));
  const payload = {
    collections,
    total: byName.size,
    returned: collections.length,
    visibility: includeAvailable ? "available" : "active",
    mode: moduleConfig.mode,
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "database", payload, {
      invokedCommand: "collections",
      subcommand: "list",
    });
  } else {
    input.context.stdout.write(`${formatCliTable(collections.map((collection) => ({
      name: collection.name,
      family: collection.family,
      fields: String(collection.fieldCount),
    })))}\n`);
  }
  return CLI_EXIT_OK;
}

function parseCollectionsLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit < 0) {
    throw new CliHandledError("invalid_collections_limit", `Expected --limit to be a non-negative number, got ${raw}.`, CLI_EXIT_USAGE, {
      location: "cli.collections.limit",
      suggestion: "Pass a non-negative limit such as --limit 20.",
      safeNextStep: "Rerun claw collections list with a non-negative --limit value.",
    });
  }
  return Math.floor(limit);
}
