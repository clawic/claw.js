import { BUILTIN_COLLECTIONS, PRODUCTIVITY_COLLECTION_DEFINITIONS } from "@clawjs/core";

import type { CliContext } from "./index.ts";
import { CORE_PRODUCTIVITY_DB_COLLECTIONS } from "./cli-constants.ts";
import { CLI_EXIT_OK } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

export async function runCollectionsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  runCli: (argv: string[], context: CliContext) => Promise<number>;
}): Promise<number> {
  const [, command] = input.positionals;
  if (command !== "list") {
    return await input.runCli(["db", ...input.argv.slice(1)], input.context);
  }

  const limit = input.flags.limit ? Math.max(0, Number(input.flags.limit)) : undefined;
  const productivityCollections = PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => ({
    name: collection.name,
    displayName: collection.displayName,
    family: "productivity",
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
    aliases: collection.aliases ?? [],
    fieldCount: collection.fields?.length ?? 0,
  }));
  const byName = new Map([...productivityCollections, ...builtinCollections].map((collection) => [collection.name, collection]));
  const collections = [...byName.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((collection) => ({
      name: collection.name,
      displayName: collection.displayName,
      family: collection.family,
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
