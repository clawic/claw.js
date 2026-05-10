import type { BuiltinFamilyDefinition } from "../_types.ts";

import { BILLING_CUSTOMERS } from "./billing_customers.ts";
import { PRODUCTS_CATALOG } from "./products_catalog.ts";
import { PRICES } from "./prices.ts";
import { PRICING_TIERS } from "./pricing_tiers.ts";
import { SUBSCRIPTIONS } from "./subscriptions.ts";
import { SUBSCRIPTION_ITEMS } from "./subscription_items.ts";
import { INVOICES } from "./invoices.ts";
import { INVOICE_LINE_ITEMS } from "./invoice_line_items.ts";
import { PAYMENT_INTENTS } from "./payment_intents.ts";
import { CHARGES } from "./charges.ts";
import { REFUNDS } from "./refunds.ts";
import { PAYMENT_METHODS } from "./payment_methods.ts";
import { COUPONS } from "./coupons.ts";
import { DISCOUNTS_APPLIED } from "./discounts_applied.ts";
import { USAGE_RECORDS } from "./usage_records.ts";
import { LICENSE_KEYS } from "./license_keys.ts";
import { BALANCE_TRANSACTIONS } from "./balance_transactions.ts";
import { PAYOUTS } from "./payouts.ts";
import { DISPUTES } from "./disputes.ts";
import { MRR_COHORTS } from "./mrr_cohorts.ts";
import { CHURN_ANALYSES } from "./churn_analyses.ts";

export const BILLING_FAMILY: BuiltinFamilyDefinition = {
  name: "billing",
  displayName: "Billing & Subscriptions",
  description: "Customers, products, prices, subscriptions, invoices, charges, coupons, payouts and MRR cohorts.",
  collections: [
    BILLING_CUSTOMERS,
    PRODUCTS_CATALOG,
    PRICES,
    PRICING_TIERS,
    SUBSCRIPTIONS,
    SUBSCRIPTION_ITEMS,
    INVOICES,
    INVOICE_LINE_ITEMS,
    PAYMENT_INTENTS,
    CHARGES,
    REFUNDS,
    PAYMENT_METHODS,
    COUPONS,
    DISCOUNTS_APPLIED,
    USAGE_RECORDS,
    LICENSE_KEYS,
    BALANCE_TRANSACTIONS,
    PAYOUTS,
    DISPUTES,
    MRR_COHORTS,
    CHURN_ANALYSES,
  ],
};

export { BILLING_CUSTOMERS, PRODUCTS_CATALOG, PRICES, PRICING_TIERS, SUBSCRIPTIONS, SUBSCRIPTION_ITEMS, INVOICES, INVOICE_LINE_ITEMS, PAYMENT_INTENTS, CHARGES, REFUNDS, PAYMENT_METHODS, COUPONS, DISCOUNTS_APPLIED, USAGE_RECORDS, LICENSE_KEYS, BALANCE_TRANSACTIONS, PAYOUTS, DISPUTES, MRR_COHORTS, CHURN_ANALYSES };
