import type { BuiltinFamilyDefinition } from "../_types.ts";
import { FINANCIAL_ACCOUNTS } from "./financial_accounts.ts";
import { TRANSACTIONS } from "./transactions.ts";
import { BUDGETS } from "./budgets.ts";
import { BUDGET_CATEGORIES } from "./budget_categories.ts";
import { PERSONAL_SUBSCRIPTIONS } from "./personal_subscriptions.ts";
import { RECURRING_EXPENSES } from "./recurring_expenses.ts";
import { RECURRING_INCOMES } from "./recurring_incomes.ts";
import { INVESTMENT_HOLDINGS } from "./investment_holdings.ts";
import { INVESTMENT_TRANSACTIONS } from "./investment_transactions.ts";
import { SAVINGS_GOALS } from "./savings_goals.ts";
import { DEBTS } from "./debts.ts";
import { LOANS } from "./loans.ts";
import { BILLS } from "./bills.ts";
import { BILL_PAYMENTS } from "./bill_payments.ts";
import { CURRENCIES } from "./currencies.ts";
import { FINANCIAL_DOCUMENTS } from "./financial_documents.ts";

export const FINANCE_FAMILY: BuiltinFamilyDefinition = {
  name: "finance",
  displayName: "Personal Finance",
  description: "Accounts, transactions, budgets, subscriptions, investments, debts, bills.",
  collections: [FINANCIAL_ACCOUNTS, TRANSACTIONS, BUDGETS, BUDGET_CATEGORIES, PERSONAL_SUBSCRIPTIONS, RECURRING_EXPENSES, RECURRING_INCOMES, INVESTMENT_HOLDINGS, INVESTMENT_TRANSACTIONS, SAVINGS_GOALS, DEBTS, LOANS, BILLS, BILL_PAYMENTS, CURRENCIES, FINANCIAL_DOCUMENTS],
};

export { FINANCIAL_ACCOUNTS, TRANSACTIONS, BUDGETS, BUDGET_CATEGORIES, PERSONAL_SUBSCRIPTIONS, RECURRING_EXPENSES, RECURRING_INCOMES, INVESTMENT_HOLDINGS, INVESTMENT_TRANSACTIONS, SAVINGS_GOALS, DEBTS, LOANS, BILLS, BILL_PAYMENTS, CURRENCIES, FINANCIAL_DOCUMENTS };
