import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type NutritionClientOptions = Omit<SignalsClientOptions, "domain">;

export class NutritionClient extends SignalsApiClient {
  constructor(options: NutritionClientOptions) {
    super({ ...options, domain: "nutrition" });
  }
}
