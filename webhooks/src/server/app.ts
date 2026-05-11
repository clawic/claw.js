import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildWebhooksApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "webhooks", transport: stubChannelTransport, config: options.config });
}
