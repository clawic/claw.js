import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type HabitsClientOptions = Omit<TrackingClientOptions, "domain">;

export class HabitsClient extends TrackingApiClient {
  constructor(options: HabitsClientOptions) {
    super({ ...options, domain: "habits" });
  }
}
