import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type TravelClientOptions = Omit<TrackingClientOptions, "domain">;

export class TravelClient extends TrackingApiClient {
  constructor(options: TravelClientOptions) {
    super({ ...options, domain: "travel" });
  }
}
