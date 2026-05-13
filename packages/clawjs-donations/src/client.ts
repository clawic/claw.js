import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type DonationsClientOptions = Omit<SignalsClientOptions, "domain">;

export class DonationsClient extends SignalsApiClient {
  constructor(options: DonationsClientOptions) {
    super({ ...options, domain: "donations" });
  }
}
