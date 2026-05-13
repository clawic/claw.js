import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type GoalsClientOptions = Omit<SignalsClientOptions, "domain">;

export class GoalsClient extends SignalsApiClient {
  constructor(options: GoalsClientOptions) {
    super({ ...options, domain: "goals" });
  }
}
