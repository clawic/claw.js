export type BrokerDeclaredField = { secretName: string; fieldName: string; placement: "query" | "body" | "header" };

export function inferBrokerDeclaredFields(input: { url: string; headers?: Record<string, string>; body?: string }): BrokerDeclaredField[] {
  const template = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const declared = new Map<string, BrokerDeclaredField>();
  const queryText = querySecretPlaceholderSource(input.url, template);
  const sources: Array<[string | undefined, BrokerDeclaredField["placement"]]> = [
    [queryText, "query"],
    [input.body, "body"],
    ...Object.values(input.headers ?? {}).map((value): [string, BrokerDeclaredField["placement"]] => [value, "header"]),
  ];
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

function querySecretPlaceholderSource(url: string, template: RegExp): string | undefined {
  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");
  const queryEnd = hashStart === -1 ? url.length : hashStart;
  for (const match of url.matchAll(template)) {
    const index = match.index ?? -1;
    if (queryStart >= 0 && index > queryStart && index < queryEnd) continue;
    throw new Error(`Secret placeholder ${match[0]} is only supported in URL query parameters, headers, or body fields`);
  }
  return queryStart >= 0 ? url.slice(queryStart + 1, queryEnd) : undefined;
}
