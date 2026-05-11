import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildSlackApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "slack", transport: stubChannelTransport, config: options.config });
}
