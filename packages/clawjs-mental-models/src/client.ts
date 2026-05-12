import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MentalModelsClientOptions = Omit<TrackingClientOptions, "domain">;

export class MentalModelsClient extends TrackingApiClient {
  constructor(options: MentalModelsClientOptions) {
    super({ ...options, domain: "mental-models" });
  }
}
