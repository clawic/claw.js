import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type GoalsClientOptions = Omit<TrackingClientOptions, "domain">;

export class GoalsClient extends TrackingApiClient {
  constructor(options: GoalsClientOptions) {
    super({ ...options, domain: "goals" });
  }
}
