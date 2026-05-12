import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type DatingClientOptions = Omit<TrackingClientOptions, "domain">;

export class DatingClient extends TrackingApiClient {
  constructor(options: DatingClientOptions) {
    super({ ...options, domain: "dating" });
  }
}
