import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type DonationsClientOptions = Omit<TrackingClientOptions, "domain">;

export class DonationsClient extends TrackingApiClient {
  constructor(options: DonationsClientOptions) {
    super({ ...options, domain: "donations" });
  }
}
