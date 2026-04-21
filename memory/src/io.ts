export function printOutput(payload: unknown, format: "json" | "table" = "json"): void {
  if (format === "table") {
    renderTable(payload);
    return;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function renderTable(payload: unknown): void {
  if (Array.isArray(payload)) {
    console.table(payload);
    return;
  }
  if (payload && typeof payload === "object") {
    const entries = Object.entries(payload as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value)
    }));
    console.table(entries);
    return;
  }
  process.stdout.write(`${String(payload)}\n`);
}
