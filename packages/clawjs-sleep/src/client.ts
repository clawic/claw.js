import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SleepClientOptions = Omit<TrackingClientOptions, "domain">;

export class SleepClient extends TrackingApiClient {
  constructor(options: SleepClientOptions) {
    super({ ...options, domain: "sleep" });
  }
}
