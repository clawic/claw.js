import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type RelationshipsClientOptions = Omit<TrackingClientOptions, "domain">;

export class RelationshipsClient extends TrackingApiClient {
  constructor(options: RelationshipsClientOptions) {
    super({ ...options, domain: "relationships" });
  }
}
