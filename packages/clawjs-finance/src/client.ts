import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type FinanceClientOptions = Omit<SignalsClientOptions, "domain">;

export class FinanceClient extends SignalsApiClient {
  constructor(options: FinanceClientOptions) {
    super({ ...options, domain: "finance" });
  }
}
