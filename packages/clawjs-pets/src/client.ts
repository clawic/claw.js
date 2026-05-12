import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PetsClientOptions = Omit<TrackingClientOptions, "domain">;

export class PetsClient extends TrackingApiClient {
  constructor(options: PetsClientOptions) {
    super({ ...options, domain: "pets" });
  }
}
