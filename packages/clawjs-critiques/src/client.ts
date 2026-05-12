import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type CritiquesClientOptions = Omit<TrackingClientOptions, "domain">;

export class CritiquesClient extends TrackingApiClient {
  constructor(options: CritiquesClientOptions) {
    super({ ...options, domain: "critiques" });
  }
}
