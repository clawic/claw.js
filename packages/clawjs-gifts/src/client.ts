import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type GiftsClientOptions = Omit<SignalsClientOptions, "domain">;

export class GiftsClient extends SignalsApiClient {
  constructor(options: GiftsClientOptions) {
    super({ ...options, domain: "gifts" });
  }
}
