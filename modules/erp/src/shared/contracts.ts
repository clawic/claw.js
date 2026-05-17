import frontendContractFixture from "../../docs/fixtures/frontend-contract.json" with { type: "json" };
import formQuoteFixture from "../../docs/fixtures/form-sales-quote-create.json" with { type: "json" };

export interface AppScreenDefinition {
  id: string;
  route: string;
  purpose: string;
  testIds: string[];
}

interface AppFormField {
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
};

export const staticFormSchemas: Record<string, AppFormSchema> = {
  "sales.quote.create": formQuoteFixture as AppFormSchema,
};
