import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type ConflictsClientOptions = Omit<SignalsClientOptions, "domain">;

export class ConflictsClient extends SignalsApiClient {
  constructor(options: ConflictsClientOptions) {
    super({ ...options, domain: "conflicts" });
  }
}
