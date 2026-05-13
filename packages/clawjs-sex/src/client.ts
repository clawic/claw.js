import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SexClientOptions = Omit<SignalsClientOptions, "domain">;

export class SexClient extends SignalsApiClient {
  constructor(options: SexClientOptions) {
    super({ ...options, domain: "sex" });
  }
}
