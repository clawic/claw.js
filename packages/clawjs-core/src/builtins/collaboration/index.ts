import type { BuiltinFamilyDefinition } from "../_types.ts";

import { REACTIONS } from "./reactions.ts";
import { DOCUMENTS } from "./documents.ts";
import { DOCUMENT_BLOCKS } from "./document_blocks.ts";
import { DOCUMENT_PROPERTIES } from "./document_properties.ts";
import { RESTRICTIONS } from "./restrictions.ts";
import { SHARE_INVITATIONS } from "./share_invitations.ts";
import { MENTIONS } from "./mentions.ts";

export const COLLABORATION_FAMILY: BuiltinFamilyDefinition = {
  name: "collaboration",
  displayName: "Collaboration",
  description: "Reactions, hierarchical documents, blocks, access restrictions and share invitations.",
  collections: [
    REACTIONS,
    DOCUMENTS,
    DOCUMENT_BLOCKS,
    DOCUMENT_PROPERTIES,
    RESTRICTIONS,
    SHARE_INVITATIONS,
    MENTIONS,
  ],
};

export { REACTIONS, DOCUMENTS, DOCUMENT_BLOCKS, DOCUMENT_PROPERTIES, RESTRICTIONS, SHARE_INVITATIONS, MENTIONS };
