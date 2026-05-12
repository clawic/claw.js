import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SkyClientOptions = Omit<TrackingClientOptions, "domain">;

export class SkyClient extends TrackingApiClient {
  constructor(options: SkyClientOptions) {
    super({ ...options, domain: "sky" });
  }
}
