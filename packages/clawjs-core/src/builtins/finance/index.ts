import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BILL_PAYMENTS } from "./bill_payments.ts";
import { BILLS } from "./bills.ts";
import { BUDGET_CATEGORIES } from "./budget_categories.ts";
import { BUDGETS } from "./budgets.ts";
import { CRYPTO_HOLDINGS } from "./crypto_holdings.ts";
import { CRYPTO_WALLETS } from "./crypto_wallets.ts";
import { CURRENCIES } from "./currencies.ts";
import { DEBTS } from "./debts.ts";
import { FINANCIAL_ACCOUNTS } from "./financial_accounts.ts";
import { FINANCIAL_DOCUMENTS } from "./financial_documents.ts";
import { INVESTMENT_HOLDINGS } from "./investment_holdings.ts";
import { INVESTMENT_TRANSACTIONS } from "./investment_transactions.ts";
import { LOANS } from "./loans.ts";
import { NET_WORTH_SNAPSHOTS } from "./net_worth_snapshots.ts";
import { PERSONAL_SUBSCRIPTIONS } from "./personal_subscriptions.ts";
import { REAL_ESTATE_OWNED } from "./real_estate_owned.ts";
import { RECURRING_EXPENSES } from "./recurring_expenses.ts";
import { RECURRING_INCOMES } from "./recurring_incomes.ts";
import { RETIREMENT_ACCOUNTS } from "./retirement_accounts.ts";
import { SAVINGS_GOALS } from "./savings_goals.ts";
import { TAX_FILINGS } from "./tax_filings.ts";
import { TRANSACTIONS } from "./transactions.ts";
import { TRUST_FUNDS } from "./trust_funds.ts";

export const FINANCE_FAMILY: BuiltinFamilyDefinition = {
  name: "finance",
  displayName: "Personal Finance",
  description: "Accounts, transactions, budgets, subscriptions, investments, debts, bills.",
  collections: [BILL_PAYMENTS, BILLS, BUDGET_CATEGORIES, BUDGETS, CRYPTO_HOLDINGS, CRYPTO_WALLETS, CURRENCIES, DEBTS, FINANCIAL_ACCOUNTS, FINANCIAL_DOCUMENTS, INVESTMENT_HOLDINGS, INVESTMENT_TRANSACTIONS, LOANS, NET_WORTH_SNAPSHOTS, PERSONAL_SUBSCRIPTIONS, REAL_ESTATE_OWNED, RECURRING_EXPENSES, RECURRING_INCOMES, RETIREMENT_ACCOUNTS, SAVINGS_GOALS, TAX_FILINGS, TRANSACTIONS, TRUST_FUNDS],
};

export { BILL_PAYMENTS, BILLS, BUDGET_CATEGORIES, BUDGETS, CRYPTO_HOLDINGS, CRYPTO_WALLETS, CURRENCIES, DEBTS, FINANCIAL_ACCOUNTS, FINANCIAL_DOCUMENTS, INVESTMENT_HOLDINGS, INVESTMENT_TRANSACTIONS, LOANS, NET_WORTH_SNAPSHOTS, PERSONAL_SUBSCRIPTIONS, REAL_ESTATE_OWNED, RECURRING_EXPENSES, RECURRING_INCOMES, RETIREMENT_ACCOUNTS, SAVINGS_GOALS, TAX_FILINGS, TRANSACTIONS, TRUST_FUNDS };
