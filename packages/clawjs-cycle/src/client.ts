import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type CycleClientOptions = Omit<SignalsClientOptions, "domain">;

export class CycleClient extends SignalsApiClient {
  constructor(options: CycleClientOptions) {
    super({ ...options, domain: "cycle" });
  }
}
