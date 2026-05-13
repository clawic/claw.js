import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type VehicleClientOptions = Omit<SignalsClientOptions, "domain">;

export class VehicleClient extends SignalsApiClient {
  constructor(options: VehicleClientOptions) {
    super({ ...options, domain: "vehicle" });
  }
}
