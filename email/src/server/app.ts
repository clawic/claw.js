import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildEmailApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "email", transport: stubChannelTransport, config: options.config });
}
