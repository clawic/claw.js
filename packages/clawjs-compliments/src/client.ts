import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type ComplimentsClientOptions = Omit<SignalsClientOptions, "domain">;

export class ComplimentsClient extends SignalsApiClient {
  constructor(options: ComplimentsClientOptions) {
    super({ ...options, domain: "compliments" });
  }
}
