import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type CycleClientOptions = Omit<TrackingClientOptions, "domain">;

export class CycleClient extends TrackingApiClient {
  constructor(options: CycleClientOptions) {
    super({ ...options, domain: "cycle" });
  }
}
