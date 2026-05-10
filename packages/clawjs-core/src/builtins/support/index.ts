import type { BuiltinFamilyDefinition } from "../_types.ts";

import { HELP_CENTERS } from "./help_centers.ts";
import { MAILBOXES } from "./mailboxes.ts";
import { SUPPORT_CONVERSATIONS } from "./support_conversations.ts";
import { SUPPORT_MESSAGES } from "./support_messages.ts";
import { SUPPORT_TICKETS } from "./support_tickets.ts";
import { SUPPORT_TAGS } from "./support_tags.ts";
import { SUPPORT_CUSTOM_ATTRIBUTES } from "./support_custom_attributes.ts";
import { SATISFACTION_RATINGS } from "./satisfaction_ratings.ts";
import { KNOWLEDGE_ARTICLES } from "./knowledge_articles.ts";
import { SUPPORT_MACROS } from "./support_macros.ts";
import { SIDE_CONVERSATIONS } from "./side_conversations.ts";

export const SUPPORT_FAMILY: BuiltinFamilyDefinition = {
  name: "support",
  displayName: "Customer Support",
  description: "Conversations, tickets, mailboxes, knowledge base, macros and CSAT.",
  collections: [
    HELP_CENTERS,
    MAILBOXES,
    SUPPORT_CONVERSATIONS,
    SUPPORT_MESSAGES,
    SUPPORT_TICKETS,
    SUPPORT_TAGS,
    SUPPORT_CUSTOM_ATTRIBUTES,
    SATISFACTION_RATINGS,
    KNOWLEDGE_ARTICLES,
    SUPPORT_MACROS,
    SIDE_CONVERSATIONS,
  ],
};

export { HELP_CENTERS, MAILBOXES, SUPPORT_CONVERSATIONS, SUPPORT_MESSAGES, SUPPORT_TICKETS, SUPPORT_TAGS, SUPPORT_CUSTOM_ATTRIBUTES, SATISFACTION_RATINGS, KNOWLEDGE_ARTICLES, SUPPORT_MACROS, SIDE_CONVERSATIONS };
