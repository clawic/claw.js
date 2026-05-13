import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type BirthdaysClientOptions = Omit<SignalsClientOptions, "domain">;

export class BirthdaysClient extends SignalsApiClient {
  constructor(options: BirthdaysClientOptions) {
    super({ ...options, domain: "birthdays" });
  }
}
