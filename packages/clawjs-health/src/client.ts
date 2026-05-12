import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type HealthClientOptions = Omit<TrackingClientOptions, "domain">;

export class HealthClient extends TrackingApiClient {
  constructor(options: HealthClientOptions) {
    super({ ...options, domain: "health" });
  }
}
