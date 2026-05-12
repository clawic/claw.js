import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type NutritionClientOptions = Omit<TrackingClientOptions, "domain">;

export class NutritionClient extends TrackingApiClient {
  constructor(options: NutritionClientOptions) {
    super({ ...options, domain: "nutrition" });
  }
}
