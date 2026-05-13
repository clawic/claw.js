import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SkyClientOptions = Omit<SignalsClientOptions, "domain">;

export class SkyClient extends SignalsApiClient {
  constructor(options: SkyClientOptions) {
    super({ ...options, domain: "sky" });
  }
}
