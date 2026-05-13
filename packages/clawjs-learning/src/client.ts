import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type LearningClientOptions = Omit<SignalsClientOptions, "domain">;

export class LearningClient extends SignalsApiClient {
  constructor(options: LearningClientOptions) {
    super({ ...options, domain: "learning" });
  }
}
