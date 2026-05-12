import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type RestaurantsClientOptions = Omit<TrackingClientOptions, "domain">;

export class RestaurantsClient extends TrackingApiClient {
  constructor(options: RestaurantsClientOptions) {
    super({ ...options, domain: "restaurants" });
  }
}
