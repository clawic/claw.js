import type { BuiltinFamilyDefinition } from "../_types.ts";

import { NEWSLETTERS } from "./newsletters.ts";
import { NEWSLETTER_SUBSCRIBERS } from "./newsletter_subscribers.ts";
import { NEWSLETTER_POSTS } from "./newsletter_posts.ts";
import { EMAIL_SEQUENCES } from "./email_sequences.ts";
import { EMAIL_CAMPAIGNS } from "./email_campaigns.ts";
import { FORMS } from "./forms.ts";
import { FORM_SUBMISSIONS } from "./form_submissions.ts";
import { REFERRALS } from "./referrals.ts";

export const MARKETING_FAMILY: BuiltinFamilyDefinition = {
  name: "marketing",
  displayName: "Marketing & Content",
  description: "Newsletters, subscribers, drip sequences, campaigns, forms, submissions and referrals.",
  collections: [
    NEWSLETTERS,
    NEWSLETTER_SUBSCRIBERS,
    NEWSLETTER_POSTS,
    EMAIL_SEQUENCES,
    EMAIL_CAMPAIGNS,
    FORMS,
    FORM_SUBMISSIONS,
    REFERRALS,
  ],
};

export { NEWSLETTERS, NEWSLETTER_SUBSCRIBERS, NEWSLETTER_POSTS, EMAIL_SEQUENCES, EMAIL_CAMPAIGNS, FORMS, FORM_SUBMISSIONS, REFERRALS };
