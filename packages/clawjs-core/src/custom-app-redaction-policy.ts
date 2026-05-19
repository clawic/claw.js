export const CUSTOM_APP_REDACTION_POLICY_ID = "claw.customApps.redaction.v1";

export const CUSTOM_APP_SENSITIVE_FIELD_TOKENS = [
  "secret",
  "password",
  "credential",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "privatetoken",
  "privatekey",
] as const;

export interface CustomAppRedactionResult<T> {
  data: Record<string, T>;
  redactedFields: string[];
  policyId: typeof CUSTOM_APP_REDACTION_POLICY_ID;
}

export function normalizeCustomAppFieldName(field: string): string {
  return field.toLowerCase().replace(/[_\-\s]/g, "");
}

export function isCustomAppSensitiveField(field: string): boolean {
  const normalized = normalizeCustomAppFieldName(field);
  return CUSTOM_APP_SENSITIVE_FIELD_TOKENS.some((token) => normalized.includes(token));
}

export function redactCustomAppRecord<T>(data: Record<string, T>): CustomAppRedactionResult<T> {
  const visible: Record<string, T> = {};
  const redactedFields: string[] = [];
  for (const [field, value] of Object.entries(data)) {
    if (isCustomAppSensitiveField(field)) {
      redactedFields.push(field);
      continue;
    }
    visible[field] = value;
  }
  return {
    data: visible,
    redactedFields: redactedFields.sort(),
    policyId: CUSTOM_APP_REDACTION_POLICY_ID,
  };
}
