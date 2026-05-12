import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type VolunteeringClientOptions = Omit<TrackingClientOptions, "domain">;

export class VolunteeringClient extends TrackingApiClient {
  constructor(options: VolunteeringClientOptions) {
    super({ ...options, domain: "volunteering" });
  }
}
