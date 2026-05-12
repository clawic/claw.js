import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SexClientOptions = Omit<TrackingClientOptions, "domain">;

export class SexClient extends TrackingApiClient {
  constructor(options: SexClientOptions) {
    super({ ...options, domain: "sex" });
  }
}
