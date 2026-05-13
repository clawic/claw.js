import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type WorkoutsClientOptions = Omit<SignalsClientOptions, "domain">;

export class WorkoutsClient extends SignalsApiClient {
  constructor(options: WorkoutsClientOptions) {
    super({ ...options, domain: "workouts" });
  }
}
