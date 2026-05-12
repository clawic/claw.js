import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type HomeClientOptions = Omit<TrackingClientOptions, "domain">;

export class HomeClient extends TrackingApiClient {
  constructor(options: HomeClientOptions) {
    super({ ...options, domain: "home" });
  }
}
