import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MemorableMomentsClientOptions = Omit<SignalsClientOptions, "domain">;

export class MemorableMomentsClient extends SignalsApiClient {
  constructor(options: MemorableMomentsClientOptions) {
    super({ ...options, domain: "memorable-moments" });
  }
}
