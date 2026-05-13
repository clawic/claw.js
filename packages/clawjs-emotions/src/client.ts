import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type EmotionsClientOptions = Omit<SignalsClientOptions, "domain">;

export class EmotionsClient extends SignalsApiClient {
  constructor(options: EmotionsClientOptions) {
    super({ ...options, domain: "emotions" });
  }
}
