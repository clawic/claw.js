// Public surface of @clawjs/integrations.
//
// Today the package ships a Telegram adapter (long-polling bot API) and
// a manager that resolves every inbound message to the agent whose
// integration binding matches the `(connectionId, channelRef)` pair.
// New adapters plug into the same `IntegrationAdapter` contract; pass
// them via `new IntegrationManager({ adapters: { slack: slackAdapter } })`.

export { IntegrationManager } from "./manager.js";
export type {
  IntegrationManagerOptions,
  IntegrationDeliveryContext,
} from "./manager.js";
export { telegramAdapter } from "./telegram.js";
export type {
  IntegrationAdapter,
  IntegrationInboundMessage,
  IntegrationOutboundMessage,
} from "./types.js";
