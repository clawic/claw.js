export type BrokerDeclaredField = { secretName: string; fieldName: string; placement: "query" | "body" | "header" };

export function inferBrokerDeclaredFields(input: { url: string; headers?: Record<string, string>; body?: string }): BrokerDeclaredField[] {
  const template = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const declared = new Map<string, BrokerDeclaredField>();
  const sources: Array<[string | undefined, BrokerDeclaredField["placement"]]> = [[input.url, "query"], [input.body, "body"], ...Object.values(input.headers ?? {}).map((value) => [value, "header"] as const)];
  for (const [text, placement] of sources) {
    if (!text) continue;
    for (const match of text.matchAll(template)) {
      const ref = match[1];
      const fieldSeparator = ref.lastIndexOf(".");
      if (fieldSeparator <= 0 || fieldSeparator === ref.length - 1) throw new Error(`Secret placeholder ${match[0]} must include an explicit field`);
      const secretName = ref.slice(0, fieldSeparator);
      const fieldName = ref.slice(fieldSeparator + 1);
      declared.set(`${secretName}.${fieldName}:${placement}`, { secretName, fieldName, placement });
    }
  }
  return [...declared.values()];
}
