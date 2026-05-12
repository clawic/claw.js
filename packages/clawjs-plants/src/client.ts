import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PlantsClientOptions = Omit<TrackingClientOptions, "domain">;

export class PlantsClient extends TrackingApiClient {
  constructor(options: PlantsClientOptions) {
    super({ ...options, domain: "plants" });
  }
}
