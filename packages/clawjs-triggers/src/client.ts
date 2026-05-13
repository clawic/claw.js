import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type TriggersClientOptions = Omit<SignalsClientOptions, "domain">;

export class TriggersClient extends SignalsApiClient {
  constructor(options: TriggersClientOptions) {
    super({ ...options, domain: "triggers" });
  }
}
