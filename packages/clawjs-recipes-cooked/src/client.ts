import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type RecipesCookedClientOptions = Omit<TrackingClientOptions, "domain">;

export class RecipesCookedClient extends TrackingApiClient {
  constructor(options: RecipesCookedClientOptions) {
    super({ ...options, domain: "recipes-cooked" });
  }
}
