import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SkillsPracticeClientOptions = Omit<TrackingClientOptions, "domain">;

export class SkillsPracticeClient extends TrackingApiClient {
  constructor(options: SkillsPracticeClientOptions) {
    super({ ...options, domain: "skills-practice" });
  }
}
