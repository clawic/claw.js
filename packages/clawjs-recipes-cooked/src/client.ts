import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type RecipesCookedClientOptions = Omit<SignalsClientOptions, "domain">;

export class RecipesCookedClient extends SignalsApiClient {
  constructor(options: RecipesCookedClientOptions) {
    super({ ...options, domain: "recipes-cooked" });
  }
}
