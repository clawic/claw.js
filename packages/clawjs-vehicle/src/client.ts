import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type VehicleClientOptions = Omit<TrackingClientOptions, "domain">;

export class VehicleClient extends TrackingApiClient {
  constructor(options: VehicleClientOptions) {
    super({ ...options, domain: "vehicle" });
  }
}
