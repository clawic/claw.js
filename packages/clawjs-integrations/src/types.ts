// Shared types used by every integration watcher. The shape stays
// intentionally narrow so each service implementation (Telegram bot,
// Slack RTM, ...) only has to translate its native event payload into
// `IntegrationInboundMessage` and let the dispatcher do the routing.

import type { Connection } from "@clawjs/agents";

export type IntegrationJson =
  | null
  | boolean
  | number
  | string
  | IntegrationJson[]
  | { [key: string]: IntegrationJson };

export type ConnectorComponentKind = "action" | "source";

export interface ConnectorFieldOption {
  label?: string;
  value: string | number | boolean;
  description?: string;
}

export interface ConnectorFieldDynamicOptions {
  paginated: boolean;
  usesPreviousContext: boolean;
  contextKeys: string[];
}

export interface ConnectorFieldDefinition {
  name: string;
  type: string;
  label?: string;
  description?: string;
  optional: boolean;
  default?: IntegrationJson;
  options?: ConnectorFieldOption[];
  dynamicOptions?: ConnectorFieldDynamicOptions;
  hidden?: boolean;
  disabled?: boolean;
  reloadProps?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  useQuery?: boolean;
  withLabel?: boolean;
  accessMode?: "read" | "write";
  sync?: boolean;
  secret?: boolean;
  managed?: boolean;
}

export interface ConnectorOperationAnnotations {
  destructiveHint?: boolean;
  readOnlyHint?: boolean;
  openWorldHint?: boolean;
}

export interface ConnectorAdditionalPropsMetadata {
  mode: "object" | "function";
  fieldNames: string[];
  contextKeys: string[];
  usesPreviousProps: boolean;
  usesThis: boolean;
}

export interface ConnectorOperationRuntime {
  hasRun: boolean;
  hasHooks: boolean;
  hookNames?: string[];
  hasAdditionalProps: boolean;
  additionalProps?: ConnectorAdditionalPropsMetadata;
  hasMethods: boolean;
  methodNames?: string[];
  dedupe?: string;
}

export type ConnectorSourceDeliveryMode = "polling" | "webhook" | "hybrid" | "manual";

export interface ConnectorSourceCapabilities {
  delivery: ConnectorSourceDeliveryMode;
  usesTimer: boolean;
  usesHttp: boolean;
  usesServiceDb: boolean;
}

export interface ConnectorOperationDefinition {
  id: string;
  appId: string;
  kind: ConnectorComponentKind;
  key?: string;
  name: string;
  description?: string;
  version?: string;
  fields: ConnectorFieldDefinition[];
  authFieldNames: string[];
  annotations?: ConnectorOperationAnnotations;
  runtime?: ConnectorOperationRuntime;
  source?: ConnectorSourceCapabilities;
  sourcePath?: string;
}

export interface ConnectorAppDefinition {
  id: string;
  name: string;
  description?: string;
  authType?: string;
  authFieldNames: string[];
  fields: ConnectorFieldDefinition[];
  operations: ConnectorOperationDefinition[];
}

export interface ConnectorCatalog {
  version: 1;
  generatedAt?: string;
  sourceRevision?: string;
  apps: ConnectorAppDefinition[];
}

export interface ConnectorCatalogSummary {
  apps: number;
  actions: number;
  sources: number;
  fields: number;
  authFields: number;
  managedFields: number;
  defaults: number;
  options: number;
  hiddenFields: number;
  disabledFields: number;
  reloadFields: number;
  boundedFields: number;
  placeholderFields: number;
  queryFields: number;
  labelFields: number;
  readAccessFields: number;
  writeAccessFields: number;
  syncedFields: number;
  annotatedOperations: number;
  destructiveOperations: number;
  readOnlyOperations: number;
  openWorldOperations: number;
  runnableOperations: number;
  hookSources: number;
  dedupedSources: number;
  pollingSources: number;
  webhookSources: number;
  hybridSources: number;
  statefulSources: number;
  dynamicPropOperations: number;
  dynamicPropFields: number;
  dynamicOptionFields: number;
  methodOperations: number;
}

export interface ConnectorOperationInput {
  values?: Record<string, IntegrationJson>;
  secretRefs?: Record<string, string>;
}

export interface IntegrationInboundMessage {
  /** ID of the connection that produced the message
   * (`Connection.id`). */
  connectionId: string;
  /** Service-specific channel reference (chat_id for Telegram, channel
   * id for Slack, etc.) — matches `AgentIntegrationBinding.channelRef`
   * the user typed when binding an agent. */
  channelRef: string;
  /** Stable id minted by the service. Watchers DEDUPE by this id so an
   * at-least-once polling source doesn't fire a prompt twice. */
  externalId: string;
  /** User-visible text of the message. Watchers extract this once;
   * the dispatcher passes it through to the agent unchanged. */
  text: string;
  /** Service-provided display name of the sender (e.g. Telegram
   * `from.first_name`). Optional — not every service exposes one. */
  senderName?: string;
  /** When the message was emitted by the service, ISO-8601. */
  timestamp: string;
}

export interface IntegrationOutboundMessage {
  connectionId: string;
  channelRef: string;
  text: string;
}

/** Adapter contract every per-service watcher implements. */
export interface IntegrationAdapter {
  readonly service: Connection["service"];

  /** Start the watcher loop. Implementations are expected to:
   *  - resolve the auth token via `auth` (XOR-decoded by the caller),
   *  - poll / subscribe according to the service's API,
   *  - emit `onMessage` for each new inbound event,
   *  - return a stop function the caller invokes on shutdown. */
  start(opts: {
    connection: Connection;
    auth: string;
    onMessage: (msg: IntegrationInboundMessage) => void | Promise<void>;
  }): Promise<() => void>;

  /** Push an outbound message back to the channel that produced an
   * inbound one (e.g. assistant reply). */
  send(opts: {
    connection: Connection;
    auth: string;
    message: IntegrationOutboundMessage;
  }): Promise<void>;
}
