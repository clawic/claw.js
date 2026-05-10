import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ACCOUNTS } from "./accounts.ts";
import { CONTACTS } from "./contacts.ts";
import { LEADS } from "./leads.ts";
import { PIPELINES } from "./pipelines.ts";
import { PIPELINE_STAGES } from "./pipeline_stages.ts";
import { DEALS } from "./deals.ts";
import { DEAL_LINE_ITEMS } from "./deal_line_items.ts";
import { ACTIVITIES } from "./activities.ts";
import { MEETINGS } from "./meetings.ts";
import { EMAIL_THREADS } from "./email_threads.ts";
import { EMAIL_MESSAGES } from "./email_messages.ts";
import { QUOTES } from "./quotes.ts";
import { QUOTE_LINE_ITEMS } from "./quote_line_items.ts";
import { CONTRACTS } from "./contracts.ts";
import { ASSETS } from "./assets.ts";
import { CAMPAIGNS } from "./campaigns.ts";
import { CAMPAIGN_MEMBERS } from "./campaign_members.ts";
import { ASSOCIATIONS } from "./associations.ts";

export const CRM_FAMILY: BuiltinFamilyDefinition = {
  name: "crm",
  displayName: "Sales & CRM",
  description: "Contacts, accounts, leads, deals, pipelines, activities, meetings, quotes and contracts.",
  collections: [
    ACCOUNTS,
    CONTACTS,
    LEADS,
    PIPELINES,
    PIPELINE_STAGES,
    DEALS,
    DEAL_LINE_ITEMS,
    ACTIVITIES,
    MEETINGS,
    EMAIL_THREADS,
    EMAIL_MESSAGES,
    QUOTES,
    QUOTE_LINE_ITEMS,
    CONTRACTS,
    ASSETS,
    CAMPAIGNS,
    CAMPAIGN_MEMBERS,
    ASSOCIATIONS,
  ],
};

export { ACCOUNTS, CONTACTS, LEADS, PIPELINES, PIPELINE_STAGES, DEALS, DEAL_LINE_ITEMS, ACTIVITIES, MEETINGS, EMAIL_THREADS, EMAIL_MESSAGES, QUOTES, QUOTE_LINE_ITEMS, CONTRACTS, ASSETS, CAMPAIGNS, CAMPAIGN_MEMBERS, ASSOCIATIONS };
