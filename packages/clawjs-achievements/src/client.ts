import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type AchievementsClientOptions = Omit<SignalsClientOptions, "domain">;

export class AchievementsClient extends SignalsApiClient {
  constructor(options: AchievementsClientOptions) {
    super({ ...options, domain: "achievements" });
  }
}
