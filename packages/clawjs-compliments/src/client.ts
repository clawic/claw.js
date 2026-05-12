import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ComplimentsClientOptions = Omit<TrackingClientOptions, "domain">;

export class ComplimentsClient extends TrackingApiClient {
  constructor(options: ComplimentsClientOptions) {
    super({ ...options, domain: "compliments" });
  }
}
