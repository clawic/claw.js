import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ISSUE_AFFECTS_VERSIONS: BuiltinCollectionDefinition = {
  name: "issue_affects_versions",
  displayName: "Issue Affects Versions",
  family: "work",
  aliases: ["issue_affects_version","issue_affects_versions"],
  fields: [
    { name: "issueId", type: "relation", required: true, relation: { collectionName: "issues" } },
    { name: "versionId", type: "relation", required: true, relation: { collectionName: "versions" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "iss_aff_ver_unique", fields: ["issueId","versionId"], unique: true },
    { name: "iss_aff_ver_version_idx", fields: ["versionId"] },
  ],
};
