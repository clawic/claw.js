import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type CareerClientOptions = Omit<SignalsClientOptions, "domain">;

export class CareerClient extends SignalsApiClient {
  constructor(options: CareerClientOptions) {
    super({ ...options, domain: "career" });
  }
}
