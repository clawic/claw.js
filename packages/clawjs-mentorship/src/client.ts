import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MentorshipClientOptions = Omit<TrackingClientOptions, "domain">;

export class MentorshipClient extends TrackingApiClient {
  constructor(options: MentorshipClientOptions) {
    super({ ...options, domain: "mentorship" });
  }
}
