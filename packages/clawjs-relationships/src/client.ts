import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type RelationshipsClientOptions = Omit<SignalsClientOptions, "domain">;

export class RelationshipsClient extends SignalsApiClient {
  constructor(options: RelationshipsClientOptions) {
    super({ ...options, domain: "relationships" });
  }
}
