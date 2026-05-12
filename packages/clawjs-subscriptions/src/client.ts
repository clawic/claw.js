import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SubscriptionsClientOptions = Omit<TrackingClientOptions, "domain">;

export class SubscriptionsClient extends TrackingApiClient {
  constructor(options: SubscriptionsClientOptions) {
    super({ ...options, domain: "subscriptions" });
  }
}
