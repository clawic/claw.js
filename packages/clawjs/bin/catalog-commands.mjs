import {
  BUILTIN_FAMILIES,
  BUILTIN_COLLECTIONS_BY_NAME,
  BUILTIN_FAMILY_BY_COLLECTION,
  resolveBuiltinCollectionName,
} from "@clawjs/core";

export const CATALOG_GROUPS = new Set(["catalog"]);

function wantsJson(args) {
  return args.includes("--json");
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function listFamilies(json) {
  if (json) {
    writeJson(
      BUILTIN_FAMILIES.map((family) => ({
        name: family.name,
        displayName: family.displayName,
        description: family.description,
        collectionCount: family.collections.length,
      })),
    );
    return 0;
  }
  if (BUILTIN_FAMILIES.length === 0) {
    process.stdout.write("No built-in B2C families registered yet.\n");
    return 0;
  }
  const rows = BUILTIN_FAMILIES.map((family) => ({
    name: family.name,
    display: family.displayName,
    count: String(family.collections.length),
    description: family.description,
  }));
  const widths = {
    name: Math.max("FAMILY".length, ...rows.map((row) => row.name.length)),
    display: Math.max("DISPLAY NAME".length, ...rows.map((row) => row.display.length)),
    count: Math.max("ITEMS".length, ...rows.map((row) => row.count.length)),
  };
  const header = [
    "FAMILY".padEnd(widths.name),
    "DISPLAY NAME".padEnd(widths.display),
    "ITEMS".padEnd(widths.count),
    "DESCRIPTION",
  ].join("  ");
  process.stdout.write(`${header}\n`);
  for (const row of rows) {
    process.stdout.write(
      `${row.name.padEnd(widths.name)}  ${row.display.padEnd(widths.display)}  ${row.count.padEnd(widths.count)}  ${row.description}\n`,
    );
  }
  return 0;
}

function listFamilyCollections(familyName, json) {
  const family = BUILTIN_FAMILIES.find((entry) => entry.name === familyName);
  if (!family) {
    process.stderr.write(`Unknown family "${familyName}". Run \`claw catalog\` to list families.\n`);
    return 1;
  }
  if (json) {
    writeJson({
      family: family.name,
      displayName: family.displayName,
      description: family.description,
      collections: family.collections.map((collection) => ({
        name: collection.name,
        displayName: collection.displayName,
        aliases: collection.aliases,
        fieldCount: collection.fields.length,
      })),
    });
    return 0;
  }
  process.stdout.write(`${family.displayName} (${family.name})\n${family.description}\n\n`);
  if (family.collections.length === 0) {
    process.stdout.write("(no collections registered yet)\n");
    return 0;
  }
  const rows = family.collections.map((collection) => ({
    name: collection.name,
    display: collection.displayName,
    aliases: collection.aliases.join(", "),
  }));
  const widths = {
    name: Math.max("COLLECTION".length, ...rows.map((row) => row.name.length)),
    display: Math.max("DISPLAY NAME".length, ...rows.map((row) => row.display.length)),
  };
  const header = [
    "COLLECTION".padEnd(widths.name),
    "DISPLAY NAME".padEnd(widths.display),
    "ALIASES",
  ].join("  ");
  process.stdout.write(`${header}\n`);
  for (const row of rows) {
    process.stdout.write(
      `${row.name.padEnd(widths.name)}  ${row.display.padEnd(widths.display)}  ${row.aliases}\n`,
    );
  }
  return 0;
}

function describeCollection(target, json) {
  const canonical = BUILTIN_COLLECTIONS_BY_NAME.has(target)
    ? target
    : resolveBuiltinCollectionName(target);
  if (!canonical) return null;
  const collection = BUILTIN_COLLECTIONS_BY_NAME.get(canonical);
  if (!collection) return null;
  const family = BUILTIN_FAMILY_BY_COLLECTION.get(canonical);
  if (json) {
    writeJson({
      family,
      ...collection,
    });
    return 0;
  }
  process.stdout.write(`collection: ${collection.name}\n`);
  process.stdout.write(`displayName: ${collection.displayName}\n`);
  process.stdout.write(`family: ${family}\n`);
  process.stdout.write(`aliases: ${collection.aliases.join(", ")}\n`);
  process.stdout.write("fields:\n");
  for (const field of collection.fields) {
    const suffix = [field.type];
    if (field.required) suffix.push("required");
    if (field.relation?.collectionName) suffix.push(`-> ${field.relation.collectionName}`);
    if (field.options?.length) suffix.push(field.options.join("|"));
    process.stdout.write(`  - ${field.name}: ${suffix.join(", ")}\n`);
  }
  if (collection.indexes.length > 0) {
    process.stdout.write("indexes:\n");
    for (const index of collection.indexes) {
      const flag = index.unique ? " (unique)" : "";
      process.stdout.write(`  - ${index.name}: ${index.fields.join(", ")}${flag}\n`);
    }
  }
  return 0;
}

export async function runCatalogCli(args) {
  const subject = args.slice(1).find((arg) => !arg.startsWith("--"));
  const json = wantsJson(args);
  if (!subject) return listFamilies(json);
  const familyMatch = BUILTIN_FAMILIES.find((family) => family.name === subject);
  if (familyMatch) return listFamilyCollections(subject, json);
  const describeResult = describeCollection(subject, json);
  if (describeResult !== null) return describeResult;
  process.stderr.write(`Unknown family or collection "${subject}".\n`);
  process.stderr.write("Run `claw catalog` to list available families.\n");
  return 1;
}
