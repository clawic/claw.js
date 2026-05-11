import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildImessageApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "imessage", transport: stubChannelTransport, config: options.config });
}
