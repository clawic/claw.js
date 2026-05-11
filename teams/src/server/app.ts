import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildTeamsApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "teams", transport: stubChannelTransport, config: options.config });
}
