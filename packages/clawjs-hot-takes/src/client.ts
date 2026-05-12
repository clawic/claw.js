import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type HotTakesClientOptions = Omit<TrackingClientOptions, "domain">;

export class HotTakesClient extends TrackingApiClient {
  constructor(options: HotTakesClientOptions) {
    super({ ...options, domain: "hot-takes" });
  }
}
