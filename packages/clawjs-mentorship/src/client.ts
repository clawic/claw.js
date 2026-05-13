import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MentorshipClientOptions = Omit<SignalsClientOptions, "domain">;

export class MentorshipClient extends SignalsApiClient {
  constructor(options: MentorshipClientOptions) {
    super({ ...options, domain: "mentorship" });
  }
}
