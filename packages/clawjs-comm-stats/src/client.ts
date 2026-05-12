import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type CommStatsClientOptions = Omit<TrackingClientOptions, "domain">;

export class CommStatsClient extends TrackingApiClient {
  constructor(options: CommStatsClientOptions) {
    super({ ...options, domain: "comm-stats" });
  }
}
