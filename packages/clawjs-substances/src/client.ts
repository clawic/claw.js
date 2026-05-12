import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SubstancesClientOptions = Omit<TrackingClientOptions, "domain">;

export class SubstancesClient extends TrackingApiClient {
  constructor(options: SubstancesClientOptions) {
    super({ ...options, domain: "substances" });
  }
}
