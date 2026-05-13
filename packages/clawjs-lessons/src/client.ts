import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type LessonsClientOptions = Omit<SignalsClientOptions, "domain">;

export class LessonsClient extends SignalsApiClient {
  constructor(options: LessonsClientOptions) {
    super({ ...options, domain: "lessons" });
  }
}
