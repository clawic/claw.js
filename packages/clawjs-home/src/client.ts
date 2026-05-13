import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type HomeClientOptions = Omit<SignalsClientOptions, "domain">;

export class HomeClient extends SignalsApiClient {
  constructor(options: HomeClientOptions) {
    super({ ...options, domain: "home" });
  }
}
