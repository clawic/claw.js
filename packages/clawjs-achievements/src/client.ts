import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type AchievementsClientOptions = Omit<TrackingClientOptions, "domain">;

export class AchievementsClient extends TrackingApiClient {
  constructor(options: AchievementsClientOptions) {
    super({ ...options, domain: "achievements" });
  }
}
