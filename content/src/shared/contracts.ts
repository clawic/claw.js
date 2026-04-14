import frontendContractFixture from "../../docs/fixtures/frontend-contract.json" with { type: "json" };
import dashboardFixture from "../../docs/fixtures/dashboard.json" with { type: "json" };
import calendarFixture from "../../docs/fixtures/calendar.json" with { type: "json" };
import composerFixture from "../../docs/fixtures/composer.json" with { type: "json" };
import entryDetailFixture from "../../docs/fixtures/entry-detail.json" with { type: "json" };
import approvalsFixture from "../../docs/fixtures/approvals.json" with { type: "json" };
import publicationFixture from "../../docs/fixtures/publication-run-detail.json" with { type: "json" };
import formEntryCreateFixture from "../../docs/fixtures/form-entry-create.json" with { type: "json" };
import formVariantEditFixture from "../../docs/fixtures/form-variant-edit.json" with { type: "json" };
import formDestinationCreateFixture from "../../docs/fixtures/form-destination-create.json" with { type: "json" };
import formPublishPlanCreateFixture from "../../docs/fixtures/form-publish-plan-create.json" with { type: "json" };

export interface AppScreenDefinition {
  id: string;
  route: string;
  purpose: string;
  testIds: string[];
}

export interface AppFormField {
  key: string;
  label: string;
  component: string;
  required: boolean;
  group: string;
  order: number;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | number | boolean | null;
}

export interface AppFormSchema {
  id: string;
  title: string;
  submitLabel: string;
  fields: AppFormField[];
  validations: Record<string, string>;
  visibilityRules: Array<Record<string, unknown>>;
  sideEffects: string[];
}

export const frontendContract = frontendContractFixture as {
  version: string;
  shell: Record<string, unknown>;
  modules: Array<Record<string, unknown>>;
  screens: AppScreenDefinition[];
  globalStates: Record<string, unknown>;
  badges: Record<string, unknown>;
};

export const staticReadModels = {
  dashboard: dashboardFixture as Record<string, unknown>,
  calendar: calendarFixture as Record<string, unknown>,
  composer: composerFixture as Record<string, unknown>,
  entryDetail: entryDetailFixture as Record<string, unknown>,
  approvals: approvalsFixture as Record<string, unknown>,
  publicationRunDetail: publicationFixture as Record<string, unknown>,
};

export const staticFormSchemas: Record<string, AppFormSchema> = {
  "entry.create": formEntryCreateFixture as AppFormSchema,
  "variant.edit": formVariantEditFixture as AppFormSchema,
  "destination.create": formDestinationCreateFixture as AppFormSchema,
  "publish-plan.create": formPublishPlanCreateFixture as AppFormSchema,
};
