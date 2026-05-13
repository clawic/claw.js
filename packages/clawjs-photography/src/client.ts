import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PhotographyClientOptions = Omit<SignalsClientOptions, "domain">;

export class PhotographyClient extends SignalsApiClient {
  constructor(options: PhotographyClientOptions) {
    super({ ...options, domain: "photography" });
  }
}
