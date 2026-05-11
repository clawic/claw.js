import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildSmsApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "sms", transport: stubChannelTransport, config: options.config });
}
