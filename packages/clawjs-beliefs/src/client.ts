import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type BeliefsClientOptions = Omit<TrackingClientOptions, "domain">;

export class BeliefsClient extends TrackingApiClient {
  constructor(options: BeliefsClientOptions) {
    super({ ...options, domain: "beliefs" });
  }
}
