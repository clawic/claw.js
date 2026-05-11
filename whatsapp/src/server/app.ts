import { buildChannelApp, stubChannelTransport } from "@clawjs/channel-base";

export function buildWhatsappApp(options: { config?: Parameters<typeof buildChannelApp>[0]["config"] } = {}) {
  return buildChannelApp({ channel: "whatsapp", transport: stubChannelTransport, config: options.config });
}
