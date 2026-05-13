import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type JournalClientOptions = Omit<SignalsClientOptions, "domain">;

export class JournalClient extends SignalsApiClient {
  constructor(options: JournalClientOptions) {
    super({ ...options, domain: "journal" });
  }
}
