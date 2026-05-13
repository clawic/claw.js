// Publishable mapping for the `career` signals module.
//
// Career records hold roles, skills, certifications. Publishing them as
// blocks lets a Profile back a `service-offer/v1` block (a freelance ad), a
// `profile-page/v1` block (about me), or a hiring `want/v1` block.

import type {
  PublishableField, PublishableProvider, PublishableSnapshot, PublishableUpdateListener,
} from "@clawjs/signals";

export const CAREER_MODULE = "career" as const;

export const CAREER_PUBLISHABLE_FIELDS: PublishableField[] = Object.freeze([
  { id: "career.headline", label: "Headline", defaultAudience: "public", match: true },
  { id: "career.summary", label: "Summary", defaultAudience: "public" },
  { id: "career.current_role", label: "Current role", defaultAudience: "public" },
  { id: "career.years_experience", label: "Years of experience", defaultAudience: "public" },
  { id: "career.skills", label: "Skills", defaultAudience: "public", match: true },
  { id: "career.certifications", label: "Certifications", defaultAudience: "public" },
  { id: "career.languages", label: "Languages", defaultAudience: "public" },
  { id: "career.geo_zone", label: "Base location", defaultAudience: "public" },
  { id: "career.remote_ok", label: "Open to remote", defaultAudience: "public" },
  { id: "career.rate_hint_eur", label: "Rate hint (EUR)", defaultAudience: "public", match: true },
  { id: "career.salary_history", label: "Salary history", defaultAudience: "inner-circle" },
]) as PublishableField[];

export interface CareerPublishableLookup {
  snapshot: (recordId: string) => Record<string, string | number | boolean | null> | null;
  list: (filter?: { limit?: number }) => { recordId: string; label: string }[];
  subscribe?: (recordId: string, listener: PublishableUpdateListener) => () => void;
}

export function buildCareerPublishableProvider(lookup: CareerPublishableLookup): PublishableProvider {
  return {
    module: CAREER_MODULE,
    publishableFields: () => [...CAREER_PUBLISHABLE_FIELDS],
    getPublishableSnapshot: (recordId): PublishableSnapshot | null => {
      const fields = lookup.snapshot(recordId);
      if (!fields) return null;
      return { module: CAREER_MODULE, recordId, takenAt: Math.floor(Date.now() / 1000), fields };
    },
    listPublishableRecords: (filter) => lookup.list(filter),
    onRecordUpdated: (recordId, listener) => {
      if (lookup.subscribe) return lookup.subscribe(recordId, listener);
      return () => undefined;
    },
  };
}
