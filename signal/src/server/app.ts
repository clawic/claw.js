import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildSignalApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "signal", transport: stubChannelTransport, config: options.config });
}
