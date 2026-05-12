import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type CareerClientOptions = Omit<TrackingClientOptions, "domain">;

export class CareerClient extends TrackingApiClient {
  constructor(options: CareerClientOptions) {
    super({ ...options, domain: "career" });
  }
}
