import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SkillsPracticeClientOptions = Omit<SignalsClientOptions, "domain">;

export class SkillsPracticeClient extends SignalsApiClient {
  constructor(options: SkillsPracticeClientOptions) {
    super({ ...options, domain: "skills-practice" });
  }
}
