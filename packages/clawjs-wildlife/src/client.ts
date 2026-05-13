import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type WildlifeClientOptions = Omit<SignalsClientOptions, "domain">;

export class WildlifeClient extends SignalsApiClient {
  constructor(options: WildlifeClientOptions) {
    super({ ...options, domain: "wildlife" });
  }
}
