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
export {
  ConnectorSourceScheduler,
  runConnectorSource,
  sourceSubscriptionFromPlan,
} from "./source-runner.js";
export {
  buildConnectorRuntimeAudit,
  ConnectorRuntimeCoverageError,
  buildConnectorOperationRuntimePlan,
  evaluateConnectorRuntimeCoverage,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.js";
export {
  CONNECTOR_RUNTIME_REGISTRY,
  createConnectorOperationExecutor,
  createConnectorSourceExecutor,
  extractConnectorRuntimeSourceEvents,
  findConnectorRuntimeImplementation,
} from "./runtime-registry.js";
export {
  ConnectorRuntimeHttpError,
  buildConnectorRuntimeFetchRequest,
  executeConnectorRuntimePaginatedRequestPlan,
  executeConnectorRuntimeRequestPlan,
} from "./runtime-http.js";
export {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.js";
export {
  buildOpenApiConnectorCatalog,
  createOpenApiConnectorRuntimeImplementation,
} from "./openapi-runtime.js";
export {
  validateConnectorRuntimeOutput,
} from "./runtime-output.js";
export {
  createConnectorRuntimeFixtureFetch,
  loadConnectorRuntimeFixture,
  loadConnectorRuntimeFixtures,
} from "./runtime-fixtures.js";
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
export type {
  ConnectorManagedInterface,
  ConnectorManagedInterfaceRole,
  ConnectorSourceExecutionContext,
  ConnectorSourceExecutor,
  ConnectorSourcePlan,
  ConnectorSourceRunResult,
  ConnectorSourceSubscription,
  ConnectorSourceSubscriptionBlockReason,
  ConnectorSourceSubscriptionStatus,
  RunConnectorSourceOptions,
  RegisterConnectorSourceOptions,
} from "./source-runner.js";
export type {
  ConnectorRuntimeAuditOperation,
  ConnectorRuntimeAuditProvider,
  ConnectorRuntimeAuditReport,
  ConnectorRuntimeAuditStatus,
  ConnectorRuntimeAuditSummary,
  ConnectorRuntimeOfflineExecutionReport,
  ConnectorRuntimeOfflineExecutionResult,
  ConnectorOperationRuntimePlan,
  ConnectorRuntimeCoverageEntry,
  ConnectorRuntimeCoverageReport,
  ConnectorRuntimeCoverageStatus,
  ConnectorRuntimeCoverageSummary,
  VerifyConnectorRuntimeCoverageOptions,
  VerifyConnectorRuntimeOfflineExecutionOptions,
} from "./runtime-coverage.js";
export type {
  ConnectorRuntimeAuthBinding,
  ConnectorRuntimeAuthPlacement,
  ConnectorRuntimeExecutorOptions,
  ConnectorRuntimeFixture,
  ConnectorRuntimeFixtureKind,
  ConnectorRuntimeImplementation,
  ConnectorRuntimeJsonType,
  ConnectorRuntimeOutputSchema,
  ConnectorRuntimePlanKind,
  ConnectorRuntimePlanDetails,
  ConnectorRuntimePaginationMode,
  ConnectorRuntimePaginationPlan,
  ConnectorRuntimeRequestPlan,
  ConnectorRuntimeSourceEventExtraction,
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.js";
export type {
  ConnectorRuntimeHttpInput,
  ConnectorRuntimeHttpOptions,
  ConnectorRuntimeHttpPaginationResult,
  ConnectorRuntimeRateLimitInfo,
  ConnectorRuntimeHttpResponse,
} from "./runtime-http.js";
export type {
  ConnectorRuntimeWebhookInput,
  ConnectorRuntimeWebhookResult,
} from "./runtime-webhook.js";
export type {
  OpenApiConnectorRuntimeOptions,
} from "./openapi-runtime.js";
export type {
  ConnectorRuntimeFixtureFetchOptions,
  ConnectorRuntimeLoadedFixture,
  LoadConnectorRuntimeFixturesOptions,
} from "./runtime-fixtures.js";
export { telegramAdapter } from "./telegram.js";
export {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
  executeTelegramOperation,
  isTelegramActionOperationSupported,
  sendTelegramRequest,
} from "./telegram-operation-executor.js";
export {
  TELEGRAM_POLL_UPDATE_TYPES,
  isTelegramSourceOperationSupported,
  telegramInboundMessageFromUpdate,
  telegramSourceEventsForUpdate,
} from "./telegram-source.js";
export {
  createTelegramSourceExecutor,
  executeTelegramSource,
} from "./telegram-source-executor.js";
export type {
  TelegramOperationExecutorOptions,
  TelegramRequestPlan,
} from "./telegram-operation-executor.js";
export type {
  TelegramMessage,
  TelegramSourceEvent,
  TelegramSourceKind,
  TelegramUpdate,
} from "./telegram-source.js";
export type {
  TelegramSourceExecutorOptions,
} from "./telegram-source-executor.js";
export type {
  ConnectorAppDefinition,
  ConnectorCatalog,
  ConnectorCatalogSummary,
  ConnectorComponentKind,
  ConnectorAdditionalPropsMetadata,
  ConnectorFieldDefinition,
  ConnectorFieldDynamicOptions,
  ConnectorFieldOption,
  ConnectorFieldPropDefinitionMetadata,
  ConnectorOperationDefinition,
  ConnectorOperationRuntime,
  ConnectorUnsupportedRealRuntimeReason,
  ConnectorOperationInput,
  ConnectorSourceCapabilities,
  ConnectorSourceDeliveryMode,
  IntegrationAdapter,
  IntegrationInboundMessage,
  IntegrationJson,
  IntegrationOutboundMessage,
} from "./types.js";
