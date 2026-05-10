import type { BuiltinFamilyDefinition } from "../_types.ts";
import { JOB_APPLICATIONS } from "./job_applications.ts";
import { INTERVIEWS } from "./interviews.ts";
import { JOB_OFFERS } from "./job_offers.ts";
import { COMPANIES_OF_INTEREST } from "./companies_of_interest.ts";
import { CONTACTS_PROFESSIONAL } from "./contacts_professional.ts";
import { CERTIFICATIONS_PERSONAL } from "./certifications_personal.ts";
import { SKILL_ASSESSMENTS } from "./skill_assessments.ts";
import { RESUMES } from "./resumes.ts";
import { COVER_LETTERS } from "./cover_letters.ts";
import { CAREER_GOALS } from "./career_goals.ts";

export const CAREER_FAMILY: BuiltinFamilyDefinition = {
  name: "career",
  displayName: "Career",
  description: "Job applications, interviews, offers, certifications, resumes.",
  collections: [JOB_APPLICATIONS, INTERVIEWS, JOB_OFFERS, COMPANIES_OF_INTEREST, CONTACTS_PROFESSIONAL, CERTIFICATIONS_PERSONAL, SKILL_ASSESSMENTS, RESUMES, COVER_LETTERS, CAREER_GOALS],
};

export { JOB_APPLICATIONS, INTERVIEWS, JOB_OFFERS, COMPANIES_OF_INTEREST, CONTACTS_PROFESSIONAL, CERTIFICATIONS_PERSONAL, SKILL_ASSESSMENTS, RESUMES, COVER_LETTERS, CAREER_GOALS };
