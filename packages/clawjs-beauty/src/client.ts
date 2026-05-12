import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type BeautyClientOptions = Omit<TrackingClientOptions, "domain">;

export class BeautyClient extends TrackingApiClient {
  constructor(options: BeautyClientOptions) {
    super({ ...options, domain: "beauty" });
  }
}
