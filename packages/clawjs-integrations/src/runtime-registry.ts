import {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
  isTelegramActionOperationSupported,
  TELEGRAM_ACTION_SLUGS,
} from "./telegram-operation-executor.ts";
import {
  isTelegramSourceOperationSupported,
  TELEGRAM_POLL_UPDATE_TYPES,
  TELEGRAM_SOURCE_KINDS,
} from "./telegram-source.ts";
import {
  buildSlackOperationRequest,
  isSlackActionOperationSupported,
  SLACK_ACTION_SLUGS,
} from "./slack-operation-executor.ts";
import {
  buildSlackSourcePlan,
  isSlackSourceOperationSupported,
  SLACK_SOURCE_OPERATION_SLUGS,
} from "./slack-source.ts";
import {
  buildGitHubOperationRequest,
  GITHUB_ACTION_SLUGS,
  isGitHubActionOperationSupported,
} from "./github-operation-executor.ts";
import {
  buildGitHubSourcePlan,
  GITHUB_SOURCE_SLUGS,
  isGitHubSourceOperationSupported,
} from "./github-source.ts";
import {
  buildGoogleOperationRequest,
  GOOGLE_ACTION_SLUGS,
  isGoogleActionOperationSupported,
} from "./google-operation-executor.ts";
import {
  buildGoogleSourcePlan,
  GOOGLE_SOURCE_SLUGS,
  isGoogleSourceOperationSupported,
} from "./google-source.ts";
import {
  buildAirtableOperationRequest,
  AIRTABLE_ACTION_SLUGS,
  isAirtableActionOperationSupported,
} from "./airtable-operation-executor.ts";
import {
  buildAirtableSourcePlan,
  AIRTABLE_SOURCE_SLUGS,
  isAirtableSourceOperationSupported,
} from "./airtable-source.ts";
import {
  buildGitLabOperationRequest,
  GITLAB_EXTRA_ACTION_SPECS,
  isGitLabActionOperationSupported,
} from "./gitlab-operation-executor.ts";
import {
  buildGitLabSourcePlan,
  GITLAB_SOURCE_SLUGS,
  isGitLabSourceOperationSupported,
} from "./gitlab-source.ts";
import {
  buildHubSpotOperationRequest,
  HUBSPOT_ACTION_SLUGS,
  isHubSpotActionOperationSupported,
} from "./hubspot-operation-executor.ts";
import {
  buildHubSpotSourcePlan,
  HUBSPOT_SOURCE_SLUGS,
  isHubSpotSourceOperationSupported,
} from "./hubspot-source.ts";
import {
  buildSalesforceOperationRequest,
  isSalesforceActionOperationSupported,
  SALESFORCE_ACTION_SLUGS,
} from "./salesforce-operation-executor.ts";
import {
  buildSalesforceSourcePlan,
  isSalesforceSourceOperationSupported,
  SALESFORCE_SOURCE_SLUGS,
} from "./salesforce-source.ts";
import {
  buildStripeOperationRequest,
  isStripeActionOperationSupported,
  STRIPE_ACTION_SLUGS,
} from "./stripe-operation-executor.ts";
import {
  buildStripeSourcePlan,
  isStripeSourceOperationSupported,
} from "./stripe-source.ts";
import {
  buildNotionOperationRequest,
  isNotionActionOperationSupported,
} from "./notion-operation-executor.ts";
import {
  buildNotionSourcePlan,
  isNotionSourceOperationSupported,
} from "./notion-source.ts";
import {
  buildDiscordOperationRequest,
  isDiscordActionOperationSupported,
} from "./discord-operation-executor.ts";
import {
  buildDiscordSourcePlan,
  isDiscordSourceOperationSupported,
} from "./discord-source.ts";
import {
  buildWhatsAppOperationRequest,
  isWhatsAppActionOperationSupported,
  WHATSAPP_ACTION_SLUGS,
} from "./whatsapp-operation-executor.ts";
import {
  buildWhatsAppSourcePlan,
  isWhatsAppSourceOperationSupported,
} from "./whatsapp-source.ts";
import {
  createTelegramSourceExecutor,
} from "./telegram-source-executor.ts";
import {
  executeConnectorRuntimePaginatedRequestPlan,
  executeConnectorRuntimeRequestPlan,
  type ConnectorRuntimeHttpOptions,
} from "./runtime-http.ts";
import type {
  ConnectorExecutor,
} from "./operation-runner.js";
import type {
  ConnectorSourceExecutor,
} from "./source-runner.js";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export interface ConnectorRuntimeExecutorOptions extends ConnectorRuntimeHttpOptions {}

export type ConnectorRuntimeAuthPlacement = "bearer" | "header" | "query" | "path" | "cookie";

export interface ConnectorRuntimeAuthBinding {
  type: "secret";
  field: string;
  placement?: ConnectorRuntimeAuthPlacement;
  name?: string;
  prefix?: string;
}

export interface ConnectorRuntimeRequestPlan {
  method: string;
  url?: string;
  endpoint: string;
  auth: ConnectorRuntimeAuthBinding[];
  headers?: Record<string, string>;
  query?: Record<string, IntegrationJson>;
  querySerialization?: Record<string, ConnectorRuntimeQuerySerialization>;
  body: Record<string, IntegrationJson>;
  bodyValue?: IntegrationJson;
  bodyEncoding?: "json" | "form" | "multipart" | "text" | "none";
  responseBodyEncoding?: "json" | "text" | "base64";
  pagination?: ConnectorRuntimePaginationPlan;
  responseSchema?: ConnectorRuntimeOutputSchema;
}

export interface ConnectorRuntimeQuerySerialization {
  style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";
  explode?: boolean;
}

export type ConnectorRuntimeJsonType = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface ConnectorRuntimeOutputSchemaVariant {
  type: ConnectorRuntimeJsonType;
  requiredPaths?: string[];
}

export interface ConnectorRuntimeOutputSchema {
  type?: ConnectorRuntimeJsonType;
  requiredPaths?: string[];
  oneOf?: ConnectorRuntimeOutputSchemaVariant[];
}

export type ConnectorRuntimePaginationMode = "cursor" | "offset" | "next_url";

export interface ConnectorRuntimePaginationPlan {
  mode: ConnectorRuntimePaginationMode;
  itemsPath?: string;
  nextCursorPath?: string;
  nextUrlPath?: string;
  cursorParam?: string;
  offsetParam?: string;
  limitParam?: string;
  pageSize?: number;
  maxPages?: number;
}

export interface ConnectorRuntimeSourcePlan {
  delivery: string;
  dedupe?: string;
  hooks: string[];
  eventsPath?: string;
  nextCursorPath?: string;
  nextOffsetPath?: string;
}

export type ConnectorRuntimeSourceEventExtraction = Record<string, IntegrationJson> & {
  events: IntegrationJson[];
};

export interface ConnectorRuntimePlanDetails {
  requestPlan?: ConnectorRuntimeRequestPlan;
  sourcePlan?: ConnectorRuntimeSourcePlan;
}

export type ConnectorRuntimePlanKind = "request" | "source";

export type ConnectorRuntimeFixtureKind = "request" | "response" | "source_event";

export interface ConnectorRuntimeFixture {
  kind: ConnectorRuntimeFixtureKind;
  path: string;
  operationId?: string;
}

export interface ConnectorRuntimeImplementation {
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId: string;
  baseUrl?: string;
  offlineValidated: boolean;
  evidence: string[];
  fixtures?: ConnectorRuntimeFixture[];
  planKinds: ConnectorRuntimePlanKind[];
  supports(operation: ConnectorOperationDefinition): boolean;
  createExecutor?(options?: ConnectorRuntimeExecutorOptions): ConnectorExecutor;
  createSourceExecutor?(options?: ConnectorRuntimeExecutorOptions): ConnectorSourceExecutor;
  buildPlan?(
    operation: ConnectorOperationDefinition,
    values: Record<string, IntegrationJson>,
  ): ConnectorRuntimePlanDetails;
}

const TELEGRAM_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-operation-executor.test.ts",
];

const TELEGRAM_ACTION_FIXTURES: ConnectorRuntimeFixture[] = TELEGRAM_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `telegram_bot_api.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/telegram-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `telegram_bot_api.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/telegram-${name}-response.json`,
  },
]);

const TELEGRAM_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-source.test.ts",
];

const TELEGRAM_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = TELEGRAM_SOURCE_KINDS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `telegram_bot_api.source.${name}`,
    path: `packages/clawjs-integrations/fixtures/telegram-source-${name}-request.json`,
  },
  {
    kind: "source_event" as const,
    operationId: `telegram_bot_api.source.${name}`,
    path: `packages/clawjs-integrations/fixtures/telegram-source-${name}.json`,
  },
]);

const SLACK_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/slack-operation-executor.test.ts",
];

const SLACK_ACTION_FIXTURES: ConnectorRuntimeFixture[] = SLACK_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `slack.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/slack-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `slack.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/slack-${name}-response.json`,
  },
]);

const SLACK_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/slack-source.test.ts",
];

const SLACK_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = SLACK_SOURCE_OPERATION_SLUGS.map((name) => ({
  kind: "source_event",
  operationId: `slack.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/slack-source-${name}.json`,
}));

const GITHUB_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/github-operation-executor.test.ts",
];

const GITHUB_ACTION_FIXTURES: ConnectorRuntimeFixture[] = GITHUB_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `github.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/github-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `github.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/github-${name}-response.json`,
  },
]);

const GITHUB_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/github-source.test.ts",
];

const GITHUB_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = GITHUB_SOURCE_SLUGS.map((name) => ({
  kind: "source_event",
  operationId: `github.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/github-source-${name}.json`,
}));

const GOOGLE_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/google-operation-executor.test.ts",
];

const GOOGLE_ACTION_FIXTURES: ConnectorRuntimeFixture[] = GOOGLE_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `google.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/google-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `google.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/google-${name}-response.json`,
  },
]);

const GOOGLE_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/google-source.test.ts",
];

const GOOGLE_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = GOOGLE_SOURCE_SLUGS.map((name) => ({
  kind: "source_event" as const,
  operationId: `google.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/google-source-${name}.json`,
}));

const AIRTABLE_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/airtable-operation-executor.test.ts",
];

const AIRTABLE_ACTION_FIXTURES: ConnectorRuntimeFixture[] = AIRTABLE_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `airtable.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/airtable-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `airtable.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/airtable-${name}-response.json`,
  },
]);

const AIRTABLE_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/airtable-source.test.ts",
];

const AIRTABLE_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = AIRTABLE_SOURCE_SLUGS.map((name) => ({
  kind: "source_event" as const,
  operationId: `airtable.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/airtable-source-${name}.json`,
}));

const DISCORD_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/discord-operation-executor.test.ts",
];

const DISCORD_ACTION_FIXTURE_NAMES = [
  "get-current-user",
  "get-user",
  "modify-current-user",
  "list-current-user-guilds",
  "get-current-user-guild-member",
  "leave-guild",
  "create-dm",
  "create-group-dm",
  "get-current-user-connections",
  "get-current-user-application-role-connection",
  "update-current-user-application-role-connection",
  "get-gateway",
  "get-gateway-bot",
  "get-current-bot-application-information",
  "get-current-authorization-information",
  "get-guild",
  "get-guild-preview",
  "modify-guild",
  "get-guild-voice-regions",
  "list-guild-channels",
  "create-guild-channel",
  "modify-guild-channel-positions",
  "get-guild-template",
  "list-guild-templates",
  "create-guild-template",
  "sync-guild-template",
  "update-guild-template",
  "delete-guild-template",
  "send-soundboard-sound",
  "list-default-soundboard-sounds",
  "list-guild-soundboard-sounds",
  "get-guild-soundboard-sound",
  "create-guild-soundboard-sound",
  "update-guild-soundboard-sound",
  "delete-guild-soundboard-sound",
  "get-current-application",
  "edit-current-application",
  "get-application-activity-instance",
  "get-application-role-connection-metadata",
  "update-application-role-connection-metadata",
  "list-entitlements",
  "get-entitlement",
  "consume-entitlement",
  "create-test-entitlement",
  "delete-test-entitlement",
  "list-skus",
  "list-sku-subscriptions",
  "get-sku-subscription",
  "get-guild-audit-log",
  "list-guild-emojis",
  "get-guild-emoji",
  "create-guild-emoji",
  "update-guild-emoji",
  "delete-guild-emoji",
  "get-sticker",
  "list-sticker-packs",
  "get-sticker-pack",
  "list-guild-stickers",
  "get-guild-sticker",
  "create-guild-sticker",
  "update-guild-sticker",
  "delete-guild-sticker",
  "list-voice-regions",
  "get-current-user-voice-state",
  "get-user-voice-state",
  "modify-current-user-voice-state",
  "modify-user-voice-state",
  "create-lobby",
  "get-lobby",
  "modify-lobby",
  "delete-lobby",
  "add-lobby-member",
  "bulk-update-lobby-members",
  "remove-lobby-member",
  "leave-lobby",
  "link-channel-to-lobby",
  "unlink-channel-from-lobby",
  "update-lobby-message-moderation-metadata",
  "get-channel",
  "update-channel",
  "set-voice-channel-status",
  "delete-channel",
  "edit-channel-permissions",
  "delete-channel-permission",
  "follow-announcement-channel",
  "trigger-typing-indicator",
  "group-dm-add-recipient",
  "group-dm-remove-recipient",
  "list-messages",
  "search-guild-messages",
  "get-message",
  "send-message",
  "edit-message",
  "delete-message",
  "bulk-delete-messages",
  "crosspost-message",
  "list-pinned-messages",
  "pin-message",
  "unpin-message",
  "create-reaction",
  "delete-own-reaction",
  "delete-user-reaction",
  "list-reactions",
  "delete-all-reactions",
  "delete-all-reactions-for-emoji",
  "get-answer-voters",
  "end-poll",
  "start-thread-from-message",
  "start-thread-without-message",
  "start-thread-in-forum-or-media-channel",
  "list-active-threads",
  "list-public-archived-threads",
  "list-private-archived-threads",
  "list-joined-private-archived-threads",
  "join-thread",
  "leave-thread",
  "add-thread-member",
  "remove-thread-member",
  "get-thread-member",
  "list-thread-members",
  "add-guild-member",
  "list-guild-members",
  "get-guild-member",
  "search-guild-members",
  "modify-guild-member",
  "modify-current-member",
  "modify-current-user-nick",
  "remove-guild-member",
  "list-guild-roles",
  "get-guild-role",
  "get-guild-role-member-counts",
  "create-guild-role",
  "modify-guild-role-positions",
  "update-guild-role",
  "delete-guild-role",
  "add-guild-member-role",
  "remove-guild-member-role",
  "list-guild-bans",
  "get-guild-ban",
  "create-guild-ban",
  "remove-guild-ban",
  "bulk-ban-guild-users",
  "get-guild-prune-count",
  "begin-guild-prune",
  "get-guild-integrations",
  "delete-guild-integration",
  "get-guild-widget-settings",
  "modify-guild-widget",
  "get-guild-widget",
  "get-guild-widget-image",
  "get-guild-vanity-url",
  "get-guild-welcome-screen",
  "modify-guild-welcome-screen",
  "get-guild-onboarding",
  "modify-guild-onboarding",
  "modify-guild-incident-actions",
  "list-auto-moderation-rules",
  "get-auto-moderation-rule",
  "create-auto-moderation-rule",
  "update-auto-moderation-rule",
  "delete-auto-moderation-rule",
  "list-guild-invites",
  "list-channel-invites",
  "create-channel-invite",
  "list-guild-scheduled-events",
  "create-guild-scheduled-event",
  "get-guild-scheduled-event",
  "update-guild-scheduled-event",
  "delete-guild-scheduled-event",
  "list-guild-scheduled-event-users",
  "create-stage-instance",
  "get-stage-instance",
  "update-stage-instance",
  "delete-stage-instance",
  "get-invite",
  "delete-invite",
  "get-invite-target-users",
  "update-invite-target-users",
  "get-invite-target-users-job-status",
  "list-channel-webhooks",
  "list-guild-webhooks",
  "create-webhook",
  "get-webhook",
  "update-webhook",
  "delete-webhook",
  "get-webhook-with-token",
  "update-webhook-with-token",
  "delete-webhook-with-token",
  "execute-webhook",
  "execute-slack-compatible-webhook",
  "execute-github-compatible-webhook",
  "get-webhook-message",
  "edit-webhook-message",
  "delete-webhook-message",
  "create-interaction-response",
  "get-original-interaction-response",
  "edit-original-interaction-response",
  "delete-original-interaction-response",
  "create-followup-message",
  "get-followup-message",
  "edit-followup-message",
  "delete-followup-message",
  "list-global-application-commands",
  "create-global-application-command",
  "get-global-application-command",
  "update-global-application-command",
  "delete-global-application-command",
  "bulk-overwrite-global-application-commands",
  "list-application-emojis",
  "get-application-emoji",
  "create-application-emoji",
  "update-application-emoji",
  "delete-application-emoji",
  "list-guild-application-commands",
  "create-guild-application-command",
  "get-guild-application-command",
  "update-guild-application-command",
  "delete-guild-application-command",
  "bulk-overwrite-guild-application-commands",
  "get-guild-application-command-permissions",
  "get-application-command-permissions",
  "edit-application-command-permissions",
] as const;

const DISCORD_ACTION_FIXTURES: ConnectorRuntimeFixture[] = DISCORD_ACTION_FIXTURE_NAMES.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `discord.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/discord-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `discord.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/discord-${name}-response.json`,
  },
]);

const DISCORD_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/discord-source.test.ts",
];

const DISCORD_SOURCE_FIXTURE_NAMES = [
  "event",
  "application-authorized",
  "application-deauthorized",
  "entitlement-create",
  "entitlement-update",
  "entitlement-delete",
  "lobby-message-create",
  "lobby-message-update",
  "lobby-message-delete",
  "game-direct-message-create",
  "game-direct-message-update",
  "game-direct-message-delete",
  "channel-create",
  "channel-update",
  "channel-delete",
  "channel-info",
  "channel-pins-update",
  "voice-channel-status-update",
  "voice-channel-start-time-update",
  "message-create",
  "message-update",
  "message-delete",
  "message-delete-bulk",
  "message-reaction-add",
  "message-reaction-remove",
  "message-reaction-remove-all",
  "message-reaction-remove-emoji",
  "typing-start",
  "presence-update",
  "user-update",
  "message-poll-vote-add",
  "message-poll-vote-remove",
  "guild-create",
  "guild-update",
  "guild-delete",
  "guild-audit-log-entry-create",
  "guild-ban-add",
  "guild-ban-remove",
  "guild-integrations-update",
  "integration-create",
  "integration-update",
  "integration-delete",
  "webhooks-update",
  "invite-create",
  "invite-delete",
  "application-command-permissions-update",
  "auto-moderation-rule-create",
  "auto-moderation-rule-update",
  "auto-moderation-rule-delete",
  "auto-moderation-action-execution",
  "guild-emojis-update",
  "guild-stickers-update",
  "guild-member-add",
  "guild-member-remove",
  "guild-member-update",
  "guild-members-chunk",
  "guild-role-create",
  "guild-role-update",
  "guild-role-delete",
  "guild-scheduled-event-create",
  "guild-scheduled-event-update",
  "guild-scheduled-event-delete",
  "guild-scheduled-event-user-add",
  "guild-scheduled-event-user-remove",
  "guild-soundboard-sound-create",
  "guild-soundboard-sound-update",
  "guild-soundboard-sound-delete",
  "guild-soundboard-sounds-update",
  "soundboard-sounds",
  "voice-channel-effect-send",
  "voice-state-update",
  "voice-server-update",
  "stage-instance-create",
  "stage-instance-update",
  "stage-instance-delete",
  "subscription-create",
  "subscription-update",
  "subscription-delete",
  "interaction-create",
  "thread-create",
  "thread-update",
  "thread-delete",
  "thread-list-sync",
  "thread-member-update",
  "thread-members-update",
  "reaction-add",
] as const;

const DISCORD_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = DISCORD_SOURCE_FIXTURE_NAMES.map((name) => ({
  kind: "source_event",
  operationId: `discord.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/discord-source-${name}.json`,
}));

const GITLAB_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/gitlab-operation-executor.test.ts",
];

const GITLAB_ACTION_FIXTURE_NAMES = [
  "get-current-user",
  "get-user",
  "list-users",
  "list-projects",
  "get-project",
  "create-project",
  "update-project",
  "delete-project",
  "archive-project",
  "unarchive-project",
  "star-project",
  "unstar-project",
  "fork-project",
  "list-groups",
  "get-group",
  "create-group",
  "update-group",
  "delete-group",
  "list-group-projects",
  "list-project-issues",
  "get-project-issue",
  "create-issue",
  "update-issue",
  "delete-issue",
  "list-issue-notes",
  "create-issue-note",
  "update-issue-note",
  "delete-issue-note",
  "list-project-merge-requests",
  "get-merge-request",
  "create-merge-request",
  "update-merge-request",
  "merge-merge-request",
  "delete-merge-request",
  "list-merge-request-notes",
  "create-merge-request-note",
  "update-merge-request-note",
  "delete-merge-request-note",
  "list-branches",
  "get-branch",
  "create-branch",
  "delete-branch",
  "protect-branch",
  "unprotect-branch",
  "list-tags",
  "get-tag",
  "create-tag",
  "delete-tag",
  "list-repository-tree",
  "get-repository-file",
  "create-repository-file",
  "update-repository-file",
  "delete-repository-file",
  "list-commits",
  "get-commit",
  "create-commit",
  "cherry-pick-commit",
  "revert-commit",
  "list-pipelines",
  "get-pipeline",
  "create-pipeline",
  "retry-pipeline",
  "cancel-pipeline",
  "delete-pipeline",
  "list-jobs",
  "get-job",
  "retry-job",
  "cancel-job",
  "erase-job",
  "play-job",
  "list-releases",
  "get-release",
  "create-release",
  "update-release",
  "delete-release",
  "list-labels",
  "create-label",
  "update-label",
  "delete-label",
  "list-milestones",
  "get-milestone",
  "create-milestone",
  "update-milestone",
  "delete-milestone",
  "list-project-members",
  "add-project-member",
  "update-project-member",
  "remove-project-member",
  "list-project-hooks",
  "get-project-hook",
  "create-project-hook",
  "update-project-hook",
  "delete-project-hook",
  "list-project-variables",
  "get-project-variable",
  "create-project-variable",
  "update-project-variable",
  "delete-project-variable",
] as const;

const GITLAB_ACTION_FIXTURES: ConnectorRuntimeFixture[] = GITLAB_ACTION_FIXTURE_NAMES.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `gitlab.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/gitlab-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `gitlab.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/gitlab-${name}-response.json`,
  },
]);

const GITLAB_EXTRA_ACTION_FIXTURES: ConnectorRuntimeFixture[] = GITLAB_EXTRA_ACTION_SPECS.flatMap((operation) => [
  {
    kind: "request" as const,
    operationId: `gitlab.action.${operation.slug}`,
    path: `packages/clawjs-integrations/fixtures/gitlab-${operation.slug}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `gitlab.action.${operation.slug}`,
    path: `packages/clawjs-integrations/fixtures/gitlab-${operation.slug}-response.json`,
  },
]);

const GITLAB_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/gitlab-source.test.ts",
];

const GITLAB_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = GITLAB_SOURCE_SLUGS.map((name) => ({
  kind: "source_event" as const,
  operationId: `gitlab.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/gitlab-source-${name}.json`,
}));

const HUBSPOT_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/hubspot-operation-executor.test.ts",
];

const HUBSPOT_ACTION_FIXTURES: ConnectorRuntimeFixture[] = HUBSPOT_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `hubspot.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/hubspot-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `hubspot.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/hubspot-${name}-response.json`,
  },
]);

const HUBSPOT_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/hubspot-source.test.ts",
];

const HUBSPOT_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = HUBSPOT_SOURCE_SLUGS.map((name) => ({
  kind: "source_event" as const,
  operationId: `hubspot.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/hubspot-source-${name}.json`,
}));

const SALESFORCE_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/salesforce-operation-executor.test.ts",
];

const SALESFORCE_ACTION_FIXTURES: ConnectorRuntimeFixture[] = SALESFORCE_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `salesforce.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/salesforce-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `salesforce.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/salesforce-${name}-response.json`,
  },
]);

const SALESFORCE_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/salesforce-source.test.ts",
];

const SALESFORCE_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = SALESFORCE_SOURCE_SLUGS.map((name) => ({
  kind: "source_event" as const,
  operationId: `salesforce.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/salesforce-source-${name}.json`,
}));

const STRIPE_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/stripe-operation-executor.test.ts",
];

const STRIPE_ACTION_FIXTURES: ConnectorRuntimeFixture[] = STRIPE_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `stripe.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/stripe-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `stripe.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/stripe-${name}-response.json`,
  },
]);

const STRIPE_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/stripe-source.test.ts",
];

const STRIPE_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = [
  {
    kind: "source_event",
    operationId: "stripe.source.event",
    path: "packages/clawjs-integrations/fixtures/stripe-webhook-event.json",
  },
];

const NOTION_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/notion-operation-executor.test.ts",
];

const NOTION_ACTION_FIXTURE_NAMES = [
  "get-block",
  "list-block-children",
  "append-block-children",
  "update-block",
  "delete-block",
  "search",
  "get-page",
  "create-page",
  "update-page",
  "get-page-property",
  "get-database",
  "create-database",
  "update-database",
  "get-data-source",
  "create-data-source",
  "update-data-source",
  "query-data-source",
  "list-data-source-templates",
  "get-comment",
  "list-comments",
  "create-comment",
  "update-comment",
  "delete-comment",
  "list-users",
  "get-user",
  "get-self",
  "list-views",
  "get-view",
  "create-view",
  "update-view",
  "delete-view",
  "create-view-query",
  "get-view-query-results",
  "delete-view-query",
  "create-file-upload",
  "send-file-upload",
  "complete-file-upload",
  "get-file-upload",
  "list-file-uploads",
  "list-custom-emojis",
] as const;

const NOTION_ACTION_FIXTURES: ConnectorRuntimeFixture[] = NOTION_ACTION_FIXTURE_NAMES.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `notion.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/notion-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `notion.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/notion-${name}-response.json`,
  },
]);

const NOTION_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/notion-source.test.ts",
];

const NOTION_SOURCE_FIXTURE_NAMES = [
  "page-event",
  "data-source-event",
  "comment-event",
  "file-upload-event",
  "view-event",
] as const;

const NOTION_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = NOTION_SOURCE_FIXTURE_NAMES.map((name) => ({
  kind: "source_event" as const,
  operationId: `notion.source.${name}`,
  path: `packages/clawjs-integrations/fixtures/notion-webhook-${name}.json`,
}));

const WHATSAPP_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/whatsapp-operation-executor.test.ts",
];

const WHATSAPP_ACTION_FIXTURES: ConnectorRuntimeFixture[] = WHATSAPP_ACTION_SLUGS.flatMap((name) => [
  {
    kind: "request" as const,
    operationId: `whatsapp.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/whatsapp-${name}-request.json`,
  },
  {
    kind: "response" as const,
    operationId: `whatsapp.action.${name}`,
    path: `packages/clawjs-integrations/fixtures/whatsapp-${name}-response.json`,
  },
]);

const WHATSAPP_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/whatsapp-source.test.ts",
];

const WHATSAPP_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = [
  {
    kind: "source_event",
    operationId: "whatsapp.source.new-message",
    path: "packages/clawjs-integrations/fixtures/whatsapp-webhook-message-event.json",
  },
  {
    kind: "source_event",
    operationId: "whatsapp.source.message-status",
    path: "packages/clawjs-integrations/fixtures/whatsapp-webhook-status-event.json",
  },
];

export const CONNECTOR_RUNTIME_REGISTRY: readonly ConnectorRuntimeImplementation[] = [
  {
    appId: "discord",
    kind: "action",
    executorId: "discord.channel-api.http",
    baseUrl: "https://discord.com/api/v10/",
    offlineValidated: true,
    evidence: DISCORD_ACTION_EVIDENCE,
    fixtures: DISCORD_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isDiscordActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildDiscordOperationRequest(operation, values),
    }),
  },
  {
    appId: "discord",
    kind: "source",
    executorId: "discord.webhook",
    offlineValidated: true,
    evidence: DISCORD_SOURCE_EVIDENCE,
    fixtures: DISCORD_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isDiscordSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildDiscordSourcePlan(operation),
    }),
  },
  {
    appId: "github",
    kind: "action",
    executorId: "github.issues-api.http",
    baseUrl: "https://api.github.com/",
    offlineValidated: true,
    evidence: GITHUB_ACTION_EVIDENCE,
    fixtures: GITHUB_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isGitHubActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildGitHubOperationRequest(operation, values),
    }),
  },
  {
    appId: "github",
    kind: "source",
    executorId: "github.webhook",
    offlineValidated: true,
    evidence: GITHUB_SOURCE_EVIDENCE,
    fixtures: GITHUB_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isGitHubSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildGitHubSourcePlan(operation),
    }),
  },
  {
    appId: "google",
    kind: "action",
    executorId: "google.workspace-api.http",
    baseUrl: "https://www.googleapis.com/",
    offlineValidated: true,
    evidence: GOOGLE_ACTION_EVIDENCE,
    fixtures: GOOGLE_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isGoogleActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildGoogleOperationRequest(operation, values),
    }),
  },
  {
    appId: "google",
    kind: "source",
    executorId: "google.workspace-events",
    offlineValidated: true,
    evidence: GOOGLE_SOURCE_EVIDENCE,
    fixtures: GOOGLE_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isGoogleSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildGoogleSourcePlan(operation),
    }),
  },
  {
    appId: "airtable",
    kind: "action",
    executorId: "airtable.web-api.http",
    baseUrl: "https://api.airtable.com/",
    offlineValidated: true,
    evidence: AIRTABLE_ACTION_EVIDENCE,
    fixtures: AIRTABLE_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isAirtableActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildAirtableOperationRequest(operation, values),
    }),
  },
  {
    appId: "airtable",
    kind: "source",
    executorId: "airtable.webhook",
    offlineValidated: true,
    evidence: AIRTABLE_SOURCE_EVIDENCE,
    fixtures: AIRTABLE_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isAirtableSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildAirtableSourcePlan(operation),
    }),
  },
  {
    appId: "hubspot",
    kind: "action",
    executorId: "hubspot.core-api.http",
    baseUrl: "https://api.hubapi.com/",
    offlineValidated: true,
    evidence: HUBSPOT_ACTION_EVIDENCE,
    fixtures: HUBSPOT_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isHubSpotActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildHubSpotOperationRequest(operation, values),
    }),
  },
  {
    appId: "hubspot",
    kind: "source",
    executorId: "hubspot.webhook",
    offlineValidated: true,
    evidence: HUBSPOT_SOURCE_EVIDENCE,
    fixtures: HUBSPOT_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isHubSpotSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildHubSpotSourcePlan(operation),
    }),
  },
  {
    appId: "salesforce",
    kind: "action",
    executorId: "salesforce.platform-api.http",
    baseUrl: "https://example.my.salesforce.com/",
    offlineValidated: true,
    evidence: SALESFORCE_ACTION_EVIDENCE,
    fixtures: SALESFORCE_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isSalesforceActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildSalesforceOperationRequest(operation, values),
    }),
  },
  {
    appId: "salesforce",
    kind: "source",
    executorId: "salesforce.event-relay",
    offlineValidated: true,
    evidence: SALESFORCE_SOURCE_EVIDENCE,
    fixtures: SALESFORCE_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isSalesforceSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildSalesforceSourcePlan(operation),
    }),
  },
  {
    appId: "gitlab",
    kind: "action",
    executorId: "gitlab.core-api.http",
    baseUrl: "https://gitlab.com/api/v4/",
    offlineValidated: true,
    evidence: GITLAB_ACTION_EVIDENCE,
    fixtures: [...GITLAB_ACTION_FIXTURES, ...GITLAB_EXTRA_ACTION_FIXTURES],
    planKinds: ["request"],
    supports: (operation) => isGitLabActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildGitLabOperationRequest(operation, values),
    }),
  },
  {
    appId: "gitlab",
    kind: "source",
    executorId: "gitlab.webhook",
    offlineValidated: true,
    evidence: GITLAB_SOURCE_EVIDENCE,
    fixtures: GITLAB_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isGitLabSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildGitLabSourcePlan(operation),
    }),
  },
  {
    appId: "stripe",
    kind: "action",
    executorId: "stripe.core-api.http",
    baseUrl: "https://api.stripe.com/v1/",
    offlineValidated: true,
    evidence: STRIPE_ACTION_EVIDENCE,
    fixtures: STRIPE_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isStripeActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildStripeOperationRequest(operation, values),
    }),
  },
  {
    appId: "stripe",
    kind: "source",
    executorId: "stripe.webhook",
    offlineValidated: true,
    evidence: STRIPE_SOURCE_EVIDENCE,
    fixtures: STRIPE_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isStripeSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildStripeSourcePlan(operation),
    }),
  },
  {
    appId: "notion",
    kind: "action",
    executorId: "notion.core-api.http",
    baseUrl: "https://api.notion.com/v1/",
    offlineValidated: true,
    evidence: NOTION_ACTION_EVIDENCE,
    fixtures: NOTION_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isNotionActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildNotionOperationRequest(operation, values),
    }),
  },
  {
    appId: "notion",
    kind: "source",
    executorId: "notion.webhook",
    offlineValidated: true,
    evidence: NOTION_SOURCE_EVIDENCE,
    fixtures: NOTION_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isNotionSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildNotionSourcePlan(operation),
    }),
  },
  {
    appId: "slack",
    kind: "action",
    executorId: "slack.action.http",
    baseUrl: "https://slack.com/api/",
    offlineValidated: true,
    evidence: SLACK_ACTION_EVIDENCE,
    fixtures: SLACK_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isSlackActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildSlackOperationRequest(operation, values),
    }),
  },
  {
    appId: "slack",
    kind: "source",
    executorId: "slack.events.webhook",
    offlineValidated: true,
    evidence: SLACK_SOURCE_EVIDENCE,
    fixtures: SLACK_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isSlackSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildSlackSourcePlan(operation),
    }),
  },
  {
    appId: "whatsapp",
    kind: "action",
    executorId: "whatsapp.business-api.http",
    baseUrl: "https://graph.facebook.com/v21.0/",
    offlineValidated: true,
    evidence: WHATSAPP_ACTION_EVIDENCE,
    fixtures: WHATSAPP_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isWhatsAppActionOperationSupported(operation.id),
    buildPlan: (operation, values) => ({
      requestPlan: buildWhatsAppOperationRequest(operation, values),
    }),
  },
  {
    appId: "whatsapp",
    kind: "source",
    executorId: "whatsapp.business-api.webhook",
    offlineValidated: true,
    evidence: WHATSAPP_SOURCE_EVIDENCE,
    fixtures: WHATSAPP_SOURCE_FIXTURES,
    planKinds: ["source"],
    supports: (operation) => isWhatsAppSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: buildWhatsAppSourcePlan(operation),
    }),
  },
  {
    appId: "telegram_bot_api",
    kind: "action",
    executorId: "telegram-bot-api.action.http",
    offlineValidated: true,
    evidence: TELEGRAM_ACTION_EVIDENCE,
    fixtures: TELEGRAM_ACTION_FIXTURES,
    planKinds: ["request"],
    supports: (operation) => isTelegramActionOperationSupported(operation.id),
    createExecutor: (options) => createTelegramOperationExecutor(options),
    buildPlan: (operation, values) => {
      const request = buildTelegramOperationRequest(operation.id, values);
      return {
        requestPlan: {
          method: request.method,
          endpoint: request.endpoint,
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
          body: request.body,
          responseSchema: {
            type: "object",
            requiredPaths: ["ok"],
          },
        },
      };
    },
  },
  {
    appId: "telegram_bot_api",
    kind: "source",
    executorId: "telegram-bot-api.source.polling",
    offlineValidated: true,
    evidence: TELEGRAM_SOURCE_EVIDENCE,
    fixtures: TELEGRAM_SOURCE_FIXTURES,
    planKinds: ["request", "source"],
    supports: (operation) => isTelegramSourceOperationSupported(operation.id),
    createSourceExecutor: (options) => createTelegramSourceExecutor(options),
    buildPlan: (operation, values) => ({
      requestPlan: {
        method: "GET",
        endpoint: "getUpdates",
        auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
        headers: { accept: "application/json" },
        query: {
          timeout: "0",
          allowed_updates: JSON.stringify(TELEGRAM_POLL_UPDATE_TYPES),
          ...(values.offset == null || values.offset === "" ? {} : { offset: values.offset }),
          ...(values.limit == null || values.limit === "" ? {} : { limit: values.limit }),
        },
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["ok"],
        },
      },
      sourcePlan: {
        delivery: operation.source?.delivery ?? "manual",
        ...(operation.runtime?.dedupe ? { dedupe: operation.runtime.dedupe } : {}),
        hooks: operation.runtime?.hookNames ?? [],
      },
    }),
  },
];

export function findConnectorRuntimeImplementation(
  operation: ConnectorOperationDefinition,
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorRuntimeImplementation | null {
  return registry.find((implementation) => (
    implementation.appId === operation.appId
    && implementation.kind === operation.kind
    && implementation.supports(operation)
  )) ?? null;
}

export function createConnectorOperationExecutor(
  operation: ConnectorOperationDefinition,
  options: ConnectorRuntimeExecutorOptions = {},
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorExecutor | null {
  if (operation.kind !== "action") return null;
  const implementation = findConnectorRuntimeImplementation(operation, registry);
  if (!implementation) return null;
  return implementation.createExecutor?.(options)
    ?? createHttpConnectorOperationExecutor(implementation, options);
}

export function createConnectorSourceExecutor(
  operation: ConnectorOperationDefinition,
  options: ConnectorRuntimeExecutorOptions = {},
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorSourceExecutor | null {
  if (operation.kind !== "source") return null;
  const implementation = findConnectorRuntimeImplementation(operation, registry);
  if (!implementation) return null;
  return implementation.createSourceExecutor?.(options)
    ?? createHttpConnectorSourceExecutor(implementation, options);
}

function createHttpConnectorOperationExecutor(
  implementation: ConnectorRuntimeImplementation,
  options: ConnectorRuntimeExecutorOptions,
): ConnectorExecutor | null {
  if (!implementation.baseUrl || !implementation.buildPlan || !implementation.planKinds.includes("request")) return null;
  return {
    async execute(ctx) {
      const details = implementation.buildPlan?.(ctx.operation, ctx.values);
      if (!details?.requestPlan) {
        throw new Error(`Connector runtime implementation ${implementation.executorId} did not build a request plan.`);
      }
      const baseUrl = options.baseUrl ?? implementation.baseUrl;
      if (details.requestPlan.pagination) {
        const result = await executeConnectorRuntimePaginatedRequestPlan({
          ...httpOptions(options),
          baseUrl,
          plan: details.requestPlan,
          secrets: ctx.secrets,
        });
        return {
          items: result.items,
          responses: result.responses as unknown as IntegrationJson,
        };
      }
      const response = await executeConnectorRuntimeRequestPlan({
        ...httpOptions(options),
        baseUrl,
        plan: details.requestPlan,
        secrets: ctx.secrets,
      });
      return recordFromRuntimeOutput(response.body);
    },
  };
}

function createHttpConnectorSourceExecutor(
  implementation: ConnectorRuntimeImplementation,
  options: ConnectorRuntimeExecutorOptions,
): ConnectorSourceExecutor | null {
  if (!implementation.baseUrl || !implementation.buildPlan || !implementation.planKinds.includes("request") || !implementation.planKinds.includes("source")) {
    return null;
  }
  return {
    async start(ctx) {
      const details = implementation.buildPlan?.(ctx.operation, ctx.values);
      if (!details?.requestPlan || !details.sourcePlan) {
        throw new Error(`Connector runtime implementation ${implementation.executorId} did not build a source request plan.`);
      }
      const baseUrl = options.baseUrl ?? implementation.baseUrl;
      if (details.requestPlan.pagination) {
        const result = await executeConnectorRuntimePaginatedRequestPlan({
          ...httpOptions(options),
          baseUrl,
          plan: details.requestPlan,
          secrets: ctx.secrets,
        });
        return {
          events: result.items,
          responses: result.responses as unknown as IntegrationJson,
        };
      }
      const response = await executeConnectorRuntimeRequestPlan({
        ...httpOptions(options),
        baseUrl,
        plan: details.requestPlan,
        secrets: ctx.secrets,
      });
      return extractConnectorRuntimeSourceEvents(response.body, details.sourcePlan);
    },
  };
}

export function extractConnectorRuntimeSourceEvents(
  body: IntegrationJson,
  sourcePlan: ConnectorRuntimeSourcePlan,
): ConnectorRuntimeSourceEventExtraction {
  return {
    events: eventsFromRuntimeSourceResponse(body, sourcePlan.eventsPath),
    ...cursorOutputsFromRuntimeSourceResponse(body, sourcePlan),
  };
}

function httpOptions(options: ConnectorRuntimeExecutorOptions): ConnectorRuntimeHttpOptions {
  return {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(typeof options.maxRetries === "number" ? { maxRetries: options.maxRetries } : {}),
    ...(typeof options.retryDelayMs === "number" ? { retryDelayMs: options.retryDelayMs } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  };
}

function recordFromRuntimeOutput(output: IntegrationJson): Record<string, IntegrationJson> {
  return output && typeof output === "object" && !Array.isArray(output)
    ? output as Record<string, IntegrationJson>
    : { result: output };
}

function eventsFromRuntimeSourceResponse(body: IntegrationJson, eventsPath: string | undefined): IntegrationJson[] {
  return valuesAtRuntimePath(body, eventsPath).flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  });
}

function cursorOutputsFromRuntimeSourceResponse(
  body: IntegrationJson,
  sourcePlan: ConnectorRuntimeSourcePlan,
): Record<string, IntegrationJson> {
  return {
    ...(sourcePlan.nextCursorPath ? optionalOutput("nextCursor", valueAtRuntimePath(body, sourcePlan.nextCursorPath)) : {}),
    ...(sourcePlan.nextOffsetPath ? optionalOutput("nextOffset", valueAtRuntimePath(body, sourcePlan.nextOffsetPath)) : {}),
  };
}

function optionalOutput(key: string, value: IntegrationJson | undefined): Record<string, IntegrationJson> {
  return value == null || value === "" ? {} : { [key]: value };
}

function valueAtRuntimePath(value: IntegrationJson, path: string | undefined): IntegrationJson | undefined {
  if (!path) return value;
  let current: IntegrationJson | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function valuesAtRuntimePath(value: IntegrationJson, path: string | undefined): IntegrationJson[] {
  if (!path) return [value];
  return valuesAtRuntimePathSegments(value, path.split(".").filter(Boolean));
}

function valuesAtRuntimePathSegments(value: IntegrationJson | undefined, segments: string[]): IntegrationJson[] {
  if (value == null) return [];
  if (segments.length === 0) return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => valuesAtRuntimePathSegments(entry, segments));
  }
  if (typeof value !== "object") return [];
  const [segment, ...rest] = segments;
  return valuesAtRuntimePathSegments(value[segment], rest);
}
