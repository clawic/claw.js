import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BALANCE_TRANSACTIONS: BuiltinCollectionDefinition = {
  name: "balance_transactions",
  displayName: "Balance Transactions",
  family: "billing",
  aliases: ["ledger","balance_transaction","balance_transactions"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "type", type: "select", required: true, options: ["charge","refund","payout","adjustment","transfer","dispute","fee","processor_fee","application_fee"] },
    { name: "amountCents", type: "number", aliases: ["balanceTransactionAmountCents"] },
    { name: "currency", type: "text" },
    { name: "feeCents", type: "number", aliases: ["processingFeeCents"] },
    { name: "netCents", type: "number" },
    { name: "sourceKind", type: "text" },
    { name: "sourceId", type: "text" },
    { name: "availableOn", type: "date" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "bal_tx_company_idx", fields: ["companyId"] },
    { name: "bal_tx_type_idx", fields: ["type"] },
    { name: "bal_tx_source_idx", fields: ["sourceKind","sourceId"] },
  ],
};
