import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type ScreenTimeClientOptions = Omit<SignalsClientOptions, "domain">;

export class ScreenTimeClient extends SignalsApiClient {
  constructor(options: ScreenTimeClientOptions) {
    super({ ...options, domain: "screen-time" });
  }
}
