import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MeetingsClientOptions = Omit<SignalsClientOptions, "domain">;

export class MeetingsClient extends SignalsApiClient {
  constructor(options: MeetingsClientOptions) {
    super({ ...options, domain: "meetings" });
  }
}
