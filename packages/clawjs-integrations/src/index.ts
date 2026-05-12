// Public surface of @clawjs/integrations.
//
// Today the package ships a Telegram adapter (long-polling bot API) and
// a manager that resolves every inbound message to the agent whose
// integration binding matches the `(connectionId, channelRef)` pair.
// New adapters plug into the same `IntegrationAdapter` contract; pass
// them via `new IntegrationManager({ adapters: { slack: slackAdapter } })`.

export {
  ConnectorCatalogError,
  findConnectorApp,
  findConnectorOperation,
  loadConnectorCatalogFromFile,
  normalizeConnectorCatalog,
  searchConnectorCatalog,
  summarizeConnectorCatalog,
} from "./catalog.js";
export { IntegrationManager } from "./manager.js";
export { runConnectorOperation } from "./operation-runner.js";
export type {
  ConnectorCatalogSearchOptions,
  ConnectorCatalogSearchResult,
} from "./catalog.js";
export type {
  IntegrationManagerOptions,
  IntegrationDeliveryContext,
} from "./manager.js";
export type {
  ConnectorExecutionContext,
  ConnectorExecutor,
  ConnectorOperationDryRun,
  ConnectorOperationRunResult,
  ConnectorSecretResolver,
  RunConnectorOperationOptions,
} from "./operation-runner.js";
export { telegramAdapter } from "./telegram.js";
export {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
  executeTelegramOperation,
  sendTelegramRequest,
} from "./telegram-operation-executor.js";
export type {
  TelegramOperationExecutorOptions,
  TelegramRequestPlan,
} from "./telegram-operation-executor.js";
export type {
  ConnectorAppDefinition,
  ConnectorCatalog,
  ConnectorCatalogSummary,
  ConnectorComponentKind,
  ConnectorFieldDefinition,
  ConnectorFieldOption,
  ConnectorOperationDefinition,
  ConnectorOperationInput,
  IntegrationAdapter,
  IntegrationInboundMessage,
  IntegrationJson,
  IntegrationOutboundMessage,
} from "./types.js";
