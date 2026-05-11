import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildDiscordApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "discord", transport: stubChannelTransport, config: options.config });
}
