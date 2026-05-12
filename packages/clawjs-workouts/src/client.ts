import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type WorkoutsClientOptions = Omit<TrackingClientOptions, "domain">;

export class WorkoutsClient extends TrackingApiClient {
  constructor(options: WorkoutsClientOptions) {
    super({ ...options, domain: "workouts" });
  }
}
