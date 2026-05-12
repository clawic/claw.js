import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type QuotesClientOptions = Omit<TrackingClientOptions, "domain">;

export class QuotesClient extends TrackingApiClient {
  constructor(options: QuotesClientOptions) {
    super({ ...options, domain: "quotes" });
  }
}
