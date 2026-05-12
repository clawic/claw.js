import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SpiritualityClientOptions = Omit<TrackingClientOptions, "domain">;

export class SpiritualityClient extends TrackingApiClient {
  constructor(options: SpiritualityClientOptions) {
    super({ ...options, domain: "spirituality" });
  }
}
