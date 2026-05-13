import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SpiritualityClientOptions = Omit<SignalsClientOptions, "domain">;

export class SpiritualityClient extends SignalsApiClient {
  constructor(options: SpiritualityClientOptions) {
    super({ ...options, domain: "spirituality" });
  }
}
