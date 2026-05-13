import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type RecurringProblemsClientOptions = Omit<SignalsClientOptions, "domain">;

export class RecurringProblemsClient extends SignalsApiClient {
  constructor(options: RecurringProblemsClientOptions) {
    super({ ...options, domain: "recurring-problems" });
  }
}
