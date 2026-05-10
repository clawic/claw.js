import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TAX_FILINGS: BuiltinCollectionDefinition = {
  name: "tax_filings",
  displayName: "Tax Filings",
  family: "finance",
  aliases: ["tax_filing","tax_filings"],
  fields: [
    { name: "year", type: "number", required: true },
    { name: "jurisdiction", type: "text" },
    { name: "filedAt", type: "date" },
    { name: "totalIncome", type: "money" },
    { name: "totalTax", type: "money" },
    { name: "refund", type: "money" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "tax_filings_year_idx", fields: ["year"] },
  ],
};
