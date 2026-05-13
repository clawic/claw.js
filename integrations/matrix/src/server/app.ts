import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildMatrixApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "matrix", transport: stubChannelTransport, config: options.config });
}
