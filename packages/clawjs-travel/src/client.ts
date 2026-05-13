import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type TravelClientOptions = Omit<SignalsClientOptions, "domain">;

export class TravelClient extends SignalsApiClient {
  constructor(options: TravelClientOptions) {
    super({ ...options, domain: "travel" });
  }
}
