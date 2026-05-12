import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type HydrationClientOptions = Omit<TrackingClientOptions, "domain">;

export class HydrationClient extends TrackingApiClient {
  constructor(options: HydrationClientOptions) {
    super({ ...options, domain: "hydration" });
  }
}
