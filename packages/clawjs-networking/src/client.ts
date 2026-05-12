import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type NetworkingClientOptions = Omit<TrackingClientOptions, "domain">;

export class NetworkingClient extends TrackingApiClient {
  constructor(options: NetworkingClientOptions) {
    super({ ...options, domain: "networking" });
  }
}
