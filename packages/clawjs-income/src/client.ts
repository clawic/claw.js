import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type IncomeClientOptions = Omit<SignalsClientOptions, "domain">;

export class IncomeClient extends SignalsApiClient {
  constructor(options: IncomeClientOptions) {
    super({ ...options, domain: "income" });
  }
}
