import type { BuiltinFamilyDefinition } from "../_types.ts";

import { INTEGRATIONS } from "./integrations.ts";
import { WEBHOOKS_OUTBOUND } from "./webhooks_outbound.ts";
import { WEBHOOK_DELIVERIES } from "./webhook_deliveries.ts";
import { SYNCED_EXTERNAL_ENTITIES } from "./synced_external_entities.ts";
import { EXTERNAL_THREADS } from "./external_threads.ts";
import { PULL_REQUESTS } from "./pull_requests.ts";
import { PULL_REQUEST_ISSUES } from "./pull_request_issues.ts";
import { COMMITS } from "./commits.ts";
import { BRANCHES } from "./branches.ts";

export const INTEGRATIONS_FAMILY: BuiltinFamilyDefinition = {
  name: "integrations",
  displayName: "Integrations & Webhooks",
  description: "Integration registry, outbound webhooks, external entity sync and source-control links.",
  collections: [
    INTEGRATIONS,
    WEBHOOKS_OUTBOUND,
    WEBHOOK_DELIVERIES,
    SYNCED_EXTERNAL_ENTITIES,
    EXTERNAL_THREADS,
    PULL_REQUESTS,
    PULL_REQUEST_ISSUES,
    COMMITS,
    BRANCHES,
  ],
};

export { INTEGRATIONS, WEBHOOKS_OUTBOUND, WEBHOOK_DELIVERIES, SYNCED_EXTERNAL_ENTITIES, EXTERNAL_THREADS, PULL_REQUESTS, PULL_REQUEST_ISSUES, COMMITS, BRANCHES };
