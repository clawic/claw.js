import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PainMapClientOptions = Omit<TrackingClientOptions, "domain">;

export class PainMapClient extends TrackingApiClient {
  constructor(options: PainMapClientOptions) {
    super({ ...options, domain: "pain-map" });
  }
}
