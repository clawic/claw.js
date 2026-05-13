import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type StripeField = ConnectorFieldDefinition;

export interface StripeGenericOperationSpec {
  slug: string;
  method: "GET" | "POST" | "DELETE";
  endpoint: string;
  fields: StripeField[];
  bodyEncoding?: "form" | "multipart";
  responseBodyEncoding?: ConnectorRuntimeRequestPlan["responseBodyEncoding"];
  responseSchema?: ConnectorRuntimeRequestPlan["responseSchema"];
  query?: string[];
  body?: string[];
  requiredPaths?: string[];
}

export const STRIPE_CORE_ACTION_SLUGS = [
  "list-customers",
  "get-customer",
  "create-customer",
  "list-payment-intents",
  "get-payment-intent",
  "create-payment-intent",
  "list-products",
  "get-product",
  "create-product",
  "update-product",
  "delete-product",
  "search-products",
  "list-prices",
  "get-price",
  "create-price",
  "update-price",
  "search-prices",
  "list-subscriptions",
  "get-subscription",
  "create-subscription",
  "update-subscription",
  "cancel-subscription",
  "resume-subscription",
  "search-subscriptions",
  "list-checkout-sessions",
  "get-checkout-session",
  "create-checkout-session",
  "expire-checkout-session",
  "list-checkout-session-line-items",
  "list-refunds",
  "get-refund",
  "create-refund",
  "update-refund",
  "list-charges",
  "get-charge",
  "capture-charge",
] as const;

const PAGE_FIELDS = [
  integerField("limit", { optional: true, default: 10, min: 1, max: 100 }),
  stringField("startingAfter", { optional: true, default: "" }),
  stringField("endingBefore", { optional: true, default: "" }),
];

const SEARCH_FIELDS = [
  stringField("query", { default: "metadata['order_id']:'sample'" }),
  integerField("limit", { optional: true, default: 10, min: 1, max: 100 }),
  stringField("page", { optional: true, default: "next_page" }),
];

export const STRIPE_EXTRA_ACTION_SPECS = [
  spec("update-customer", "POST", "customers/{customerId}", [stringField("customerId", { default: "cus_sample" }), stringField("email", { optional: true, default: "person@example.invalid" }), stringField("name", { optional: true, default: "Sample Person" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["email", "name", "metadata"] }),
  spec("delete-customer", "DELETE", "customers/{customerId}", [stringField("customerId", { default: "cus_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("search-customers", "GET", "customers/search", SEARCH_FIELDS, { query: ["query", "limit", "page"], requiredPaths: ["object", "data"] }),
  spec("update-payment-intent", "POST", "payment_intents/{paymentIntentId}", [stringField("paymentIntentId", { default: "pi_sample" }), integerField("amount", { optional: true, default: 1200 }), stringField("currency", { optional: true, default: "usd" }), stringField("customer", { optional: true, default: "cus_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["amount", "currency", "customer", "payment_method", "metadata"], requiredPaths: ["id", "object", "status"] }),
  spec("cancel-payment-intent", "POST", "payment_intents/{paymentIntentId}/cancel", [stringField("paymentIntentId", { default: "pi_sample" }), stringField("cancellation_reason", { optional: true, default: "requested_by_customer" })], { body: ["cancellation_reason"], requiredPaths: ["id", "object", "status"] }),
  spec("capture-payment-intent", "POST", "payment_intents/{paymentIntentId}/capture", [stringField("paymentIntentId", { default: "pi_sample" }), integerField("amount_to_capture", { optional: true, default: 1200 }), stringField("statement_descriptor", { optional: true, default: "Sample" })], { body: ["amount_to_capture", "statement_descriptor"], requiredPaths: ["id", "object", "status"] }),
  spec("confirm-payment-intent", "POST", "payment_intents/{paymentIntentId}/confirm", [stringField("paymentIntentId", { default: "pi_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" }), stringField("return_url", { optional: true, default: "https://example.invalid/return" })], { body: ["payment_method", "return_url"], requiredPaths: ["id", "object", "status"] }),
  spec("increment-payment-intent-authorization", "POST", "payment_intents/{paymentIntentId}/increment_authorization", [stringField("paymentIntentId", { default: "pi_sample" }), integerField("amount", { default: 1400 })], { body: ["amount"], requiredPaths: ["id", "object", "status"] }),
  spec("apply-payment-intent-customer-balance", "POST", "payment_intents/{paymentIntentId}/apply_customer_balance", [stringField("paymentIntentId", { default: "pi_sample" }), integerField("amount", { optional: true, default: 500 })], { body: ["amount"], requiredPaths: ["id", "object", "status"] }),
  spec("list-payment-intent-line-items", "GET", "payment_intents/{paymentIntentId}/amount_details_line_items", [stringField("paymentIntentId", { default: "pi_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("search-payment-intents", "GET", "payment_intents/search", SEARCH_FIELDS, { query: ["query", "limit", "page"], requiredPaths: ["object", "data"] }),
  spec("verify-payment-intent-microdeposits", "POST", "payment_intents/{paymentIntentId}/verify_microdeposits", [stringField("paymentIntentId", { default: "pi_sample" }), arrayField("amounts", [32, 45], { optional: true }), stringField("descriptor_code", { optional: true, default: "SM11AA" })], { body: ["amounts", "descriptor_code"], requiredPaths: ["id", "object", "status"] }),
  spec("list-setup-intents", "GET", "setup_intents", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" })], { query: ["limit", "starting_after", "ending_before", "customer"], requiredPaths: ["object", "data"] }),
  spec("get-setup-intent", "GET", "setup_intents/{setupIntentId}", [stringField("setupIntentId", { default: "seti_sample" })], { requiredPaths: ["id", "object", "status"] }),
  spec("create-setup-intent", "POST", "setup_intents", [stringField("customer", { optional: true, default: "cus_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" }), stringField("usage", { optional: true, default: "off_session" }), booleanField("confirm", { optional: true, default: false }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer", "payment_method", "usage", "confirm", "metadata"], requiredPaths: ["id", "object", "status"] }),
  spec("update-setup-intent", "POST", "setup_intents/{setupIntentId}", [stringField("setupIntentId", { default: "seti_sample" }), stringField("customer", { optional: true, default: "cus_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer", "payment_method", "metadata"], requiredPaths: ["id", "object", "status"] }),
  spec("cancel-setup-intent", "POST", "setup_intents/{setupIntentId}/cancel", [stringField("setupIntentId", { default: "seti_sample" }), stringField("cancellation_reason", { optional: true, default: "abandoned" })], { body: ["cancellation_reason"], requiredPaths: ["id", "object", "status"] }),
  spec("confirm-setup-intent", "POST", "setup_intents/{setupIntentId}/confirm", [stringField("setupIntentId", { default: "seti_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" }), stringField("return_url", { optional: true, default: "https://example.invalid/return" })], { body: ["payment_method", "return_url"], requiredPaths: ["id", "object", "status"] }),
  spec("verify-setup-intent-microdeposits", "POST", "setup_intents/{setupIntentId}/verify_microdeposits", [stringField("setupIntentId", { default: "seti_sample" }), arrayField("amounts", [32, 45], { optional: true }), stringField("descriptor_code", { optional: true, default: "SM11AA" })], { body: ["amounts", "descriptor_code"], requiredPaths: ["id", "object", "status"] }),
  spec("list-payment-methods", "GET", "payment_methods", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" }), stringField("type", { optional: true, default: "card" })], { query: ["limit", "starting_after", "ending_before", "customer", "type"], requiredPaths: ["object", "data"] }),
  spec("get-payment-method", "GET", "payment_methods/{paymentMethodId}", [stringField("paymentMethodId", { default: "pm_sample" })]),
  spec("create-payment-method", "POST", "payment_methods", [stringField("type", { default: "card" }), objectField("card", { token: "tok_visa" }, { optional: true }), stringField("billing_email", { optional: true, default: "person@example.invalid" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["type", "card", "billing_email", "metadata"] }),
  spec("update-payment-method", "POST", "payment_methods/{paymentMethodId}", [stringField("paymentMethodId", { default: "pm_sample" }), objectField("billing_details", { email: "person@example.invalid" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["billing_details", "metadata"] }),
  spec("attach-payment-method", "POST", "payment_methods/{paymentMethodId}/attach", [stringField("paymentMethodId", { default: "pm_sample" }), stringField("customer", { default: "cus_sample" })], { body: ["customer"] }),
  spec("detach-payment-method", "POST", "payment_methods/{paymentMethodId}/detach", [stringField("paymentMethodId", { default: "pm_sample" })]),
  spec("list-payment-links", "GET", "payment_links", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true })], { query: ["limit", "starting_after", "ending_before", "active"], requiredPaths: ["object", "data"] }),
  spec("create-payment-link", "POST", "payment_links", [arrayField("line_items", [{ price: "price_sample", quantity: 1 }]), objectField("metadata", { order_id: "sample" }, { optional: true }), booleanField("allow_promotion_codes", { optional: true, default: true }), stringField("submit_type", { optional: true, default: "pay" })], { body: ["line_items", "metadata", "allow_promotion_codes", "submit_type"] }),
  spec("get-payment-link", "GET", "payment_links/{payment_link}", [stringField("paymentLink", { default: "plink_sample" })]),
  spec("update-payment-link", "POST", "payment_links/{payment_link}", [stringField("paymentLink", { default: "plink_sample" }), booleanField("active", { optional: true, default: true }), objectField("metadata", { order_id: "sample" }, { optional: true }), stringField("inactive_message", { optional: true, default: "Unavailable" })], { body: ["active", "metadata", "inactive_message"] }),
  spec("list-payment-link-line-items", "GET", "payment_links/{payment_link}/line_items", [stringField("paymentLink", { default: "plink_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-balance", "GET", "balance", [], { requiredPaths: ["object"] }),
  spec("list-balance-transactions", "GET", "balance_transactions", [...PAGE_FIELDS, stringField("type", { optional: true, default: "charge" })], { query: ["limit", "starting_after", "ending_before", "type"], requiredPaths: ["object", "data"] }),
  spec("get-balance-transaction", "GET", "balance_transactions/{balanceTransactionId}", [stringField("balanceTransactionId", { default: "txn_sample" })]),
  spec("list-application-fees", "GET", "application_fees", [...PAGE_FIELDS, stringField("charge", { optional: true, default: "ch_sample" })], { query: ["limit", "starting_after", "ending_before", "charge"], requiredPaths: ["object", "data"] }),
  spec("get-application-fee", "GET", "application_fees/{applicationFeeId}", [stringField("applicationFeeId", { default: "fee_sample" })]),
  spec("refund-application-fee", "POST", "application_fees/{applicationFeeId}/refund", [stringField("applicationFeeId", { default: "fee_sample" }), integerField("amount", { optional: true, default: 500 })], { body: ["amount"] }),
  spec("list-application-fee-refunds", "GET", "application_fees/{applicationFeeId}/refunds", [stringField("applicationFeeId", { default: "fee_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("create-application-fee-refund", "POST", "application_fees/{applicationFeeId}/refunds", [stringField("applicationFeeId", { default: "fee_sample" }), integerField("amount", { optional: true, default: 500 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["amount", "metadata"] }),
  spec("get-application-fee-refund", "GET", "application_fees/{applicationFeeId}/refunds/{refundId}", [stringField("applicationFeeId", { default: "fee_sample" }), stringField("refundId", { default: "fr_sample" })]),
  spec("update-application-fee-refund", "POST", "application_fees/{applicationFeeId}/refunds/{refundId}", [stringField("applicationFeeId", { default: "fee_sample" }), stringField("refundId", { default: "fr_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["metadata"] }),
  spec("list-files", "GET", "files", [...PAGE_FIELDS, stringField("purpose", { optional: true, default: "business_logo" })], { query: ["limit", "starting_after", "ending_before", "purpose"], requiredPaths: ["object", "data"] }),
  spec("create-file", "POST", "files", [stringField("file", { default: "sample-file" }), stringField("purpose", { default: "business_logo" }), objectField("file_link_data", { create: true }, { optional: true })], { body: ["file", "purpose", "file_link_data"], bodyEncoding: "multipart" }),
  spec("get-file", "GET", "files/{file}", [stringField("file", { default: "file_sample" })]),
  spec("list-file-links", "GET", "file_links", [...PAGE_FIELDS, stringField("file", { optional: true, default: "file_sample" }), booleanField("expired", { optional: true, default: false })], { query: ["limit", "starting_after", "ending_before", "file", "expired"], requiredPaths: ["object", "data"] }),
  spec("create-file-link", "POST", "file_links", [stringField("file", { default: "file_sample" }), integerField("expires_at", { optional: true, default: 1893456000 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["file", "expires_at", "metadata"] }),
  spec("get-file-link", "GET", "file_links/{link}", [stringField("link", { default: "link_sample" })]),
  spec("update-file-link", "POST", "file_links/{link}", [stringField("link", { default: "link_sample" }), integerField("expires_at", { optional: true, default: 1893456000 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["expires_at", "metadata"] }),
  spec("list-country-specs", "GET", "country_specs", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-country-spec", "GET", "country_specs/{country}", [stringField("country", { default: "US" })]),
  spec("list-exchange-rates", "GET", "exchange_rates", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-exchange-rate", "GET", "exchange_rates/{rate_id}", [stringField("rateId", { default: "usd" })]),
  spec("create-token", "POST", "tokens", [objectField("cvc_update", { cvc: "123" }, { optional: true })], { body: ["cvc_update"] }),
  spec("get-token", "GET", "tokens/{token}", [stringField("token", { default: "tok_sample" })]),
  spec("create-ephemeral-key", "POST", "ephemeral_keys", [stringField("customer", { optional: true, default: "cus_sample" })], { body: ["customer"] }),
  spec("delete-ephemeral-key", "DELETE", "ephemeral_keys/{key}", [stringField("key", { default: "ephkey_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("get-confirmation-token", "GET", "confirmation_tokens/{confirmation_token}", [stringField("confirmationToken", { default: "ctoken_sample" })]),
  spec("list-events", "GET", "events", [...PAGE_FIELDS, stringField("type", { optional: true, default: "payment_intent.succeeded" })], { query: ["limit", "starting_after", "ending_before", "type"], requiredPaths: ["object", "data"] }),
  spec("get-event", "GET", "events/{eventId}", [stringField("eventId", { default: "evt_sample" })]),
  spec("list-disputes", "GET", "disputes", [...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-dispute", "GET", "disputes/{disputeId}", [stringField("disputeId", { default: "dp_sample" })]),
  spec("update-dispute", "POST", "disputes/{disputeId}", [stringField("disputeId", { default: "dp_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true }), objectField("evidence", { customer_name: "Sample Person" }, { optional: true })], { body: ["metadata", "evidence"] }),
  spec("close-dispute", "POST", "disputes/{disputeId}/close", [stringField("disputeId", { default: "dp_sample" })]),
  spec("list-credit-notes", "GET", "credit_notes", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" }), stringField("invoice", { optional: true, default: "in_sample" })], { query: ["limit", "starting_after", "ending_before", "customer", "invoice"], requiredPaths: ["object", "data"] }),
  spec("create-credit-note", "POST", "credit_notes", [stringField("invoice", { default: "in_sample" }), integerField("amount", { optional: true, default: 500 }), stringField("memo", { optional: true, default: "Sample credit" }), objectField("metadata", { order_id: "sample" }, { optional: true }), stringField("reason", { optional: true, default: "order_change" })], { body: ["invoice", "amount", "memo", "metadata", "reason"] }),
  spec("preview-credit-note", "GET", "credit_notes/preview", [stringField("invoice", { default: "in_sample" }), integerField("amount", { optional: true, default: 500 }), stringField("memo", { optional: true, default: "Sample credit" }), stringField("reason", { optional: true, default: "order_change" })], { query: ["invoice", "amount", "memo", "reason"] }),
  spec("list-credit-note-preview-lines", "GET", "credit_notes/preview/lines", [stringField("invoice", { default: "in_sample" }), integerField("amount", { optional: true, default: 500 }), ...PAGE_FIELDS], { query: ["invoice", "amount", "limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-credit-note", "GET", "credit_notes/{id}", [stringField("id", { default: "cn_sample" })]),
  spec("update-credit-note", "POST", "credit_notes/{id}", [stringField("id", { default: "cn_sample" }), stringField("memo", { optional: true, default: "Updated credit" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["memo", "metadata"] }),
  spec("void-credit-note", "POST", "credit_notes/{id}/void", [stringField("id", { default: "cn_sample" })]),
  spec("list-credit-note-lines", "GET", "credit_notes/{credit_note}/lines", [stringField("creditNote", { default: "cn_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("list-quotes", "GET", "quotes", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" }), stringField("status", { optional: true, default: "draft" })], { query: ["limit", "starting_after", "ending_before", "customer", "status"], requiredPaths: ["object", "data"] }),
  spec("create-quote", "POST", "quotes", [stringField("customer", { default: "cus_sample" }), arrayField("line_items", [{ price: "price_sample", quantity: 1 }], { optional: true }), stringField("description", { optional: true, default: "Sample quote" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer", "line_items", "description", "metadata"] }),
  spec("get-quote", "GET", "quotes/{quote}", [stringField("quote", { default: "qt_sample" })]),
  spec("update-quote", "POST", "quotes/{quote}", [stringField("quote", { default: "qt_sample" }), stringField("description", { optional: true, default: "Updated quote" }), integerField("expires_at", { optional: true, default: 1893456000 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["description", "expires_at", "metadata"] }),
  spec("accept-quote", "POST", "quotes/{quote}/accept", [stringField("quote", { default: "qt_sample" })]),
  spec("cancel-quote", "POST", "quotes/{quote}/cancel", [stringField("quote", { default: "qt_sample" })]),
  spec("finalize-quote", "POST", "quotes/{quote}/finalize", [stringField("quote", { default: "qt_sample" }), integerField("expires_at", { optional: true, default: 1893456000 })], { body: ["expires_at"] }),
  spec("list-quote-line-items", "GET", "quotes/{quote}/line_items", [stringField("quote", { default: "qt_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("list-quote-computed-upfront-line-items", "GET", "quotes/{quote}/computed_upfront_line_items", [stringField("quote", { default: "qt_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("download-quote-pdf", "GET", "quotes/{quote}/pdf", [stringField("quote", { default: "qt_sample" })], { responseBodyEncoding: "base64", responseSchema: { type: "string" } }),
  spec("list-subscription-schedules", "GET", "subscription_schedules", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" }), stringField("scheduled", { optional: true, default: "true" })], { query: ["limit", "starting_after", "ending_before", "customer", "scheduled"], requiredPaths: ["object", "data"] }),
  spec("create-subscription-schedule", "POST", "subscription_schedules", [stringField("customer", { default: "cus_sample" }), integerField("start_date", { optional: true, default: 1893456000 }), arrayField("phases", [{ items: [{ price: "price_sample", quantity: 1 }] }], { optional: true }), stringField("end_behavior", { optional: true, default: "release" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer", "start_date", "phases", "end_behavior", "metadata"], requiredPaths: ["id", "object", "status"] }),
  spec("get-subscription-schedule", "GET", "subscription_schedules/{schedule}", [stringField("schedule", { default: "sub_sched_sample" })], { requiredPaths: ["id", "object", "status"] }),
  spec("update-subscription-schedule", "POST", "subscription_schedules/{schedule}", [stringField("schedule", { default: "sub_sched_sample" }), arrayField("phases", [{ items: [{ price: "price_sample", quantity: 1 }] }], { optional: true }), stringField("end_behavior", { optional: true, default: "release" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["phases", "end_behavior", "metadata"], requiredPaths: ["id", "object", "status"] }),
  spec("cancel-subscription-schedule", "POST", "subscription_schedules/{schedule}/cancel", [stringField("schedule", { default: "sub_sched_sample" }), booleanField("invoice_now", { optional: true, default: false }), booleanField("prorate", { optional: true, default: true })], { body: ["invoice_now", "prorate"], requiredPaths: ["id", "object", "status"] }),
  spec("release-subscription-schedule", "POST", "subscription_schedules/{schedule}/release", [stringField("schedule", { default: "sub_sched_sample" }), booleanField("preserve_cancel_date", { optional: true, default: false })], { body: ["preserve_cancel_date"], requiredPaths: ["id", "object", "status"] }),
  spec("get-account", "GET", "account", [], { requiredPaths: ["id", "object"] }),
  spec("list-accounts", "GET", "accounts", [...PAGE_FIELDS, stringField("email", { optional: true, default: "account@example.invalid" })], { query: ["limit", "starting_after", "ending_before", "email"], requiredPaths: ["object", "data"] }),
  spec("create-account", "POST", "accounts", [stringField("type", { default: "express" }), stringField("country", { optional: true, default: "US" }), stringField("email", { optional: true, default: "account@example.invalid" }), objectField("capabilities", { card_payments: { requested: true }, transfers: { requested: true } }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["type", "country", "email", "capabilities", "metadata"] }),
  spec("get-connected-account", "GET", "accounts/{account}", [stringField("account", { default: "acct_sample" })]),
  spec("update-account", "POST", "accounts/{account}", [stringField("account", { default: "acct_sample" }), stringField("email", { optional: true, default: "account@example.invalid" }), objectField("business_profile", { name: "Sample Business" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["email", "business_profile", "metadata"] }),
  spec("delete-account", "DELETE", "accounts/{account}", [stringField("account", { default: "acct_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("reject-account", "POST", "accounts/{account}/reject", [stringField("account", { default: "acct_sample" }), stringField("reason", { default: "fraud" })], { body: ["reason"] }),
  spec("create-account-login-link", "POST", "accounts/{account}/login_links", [stringField("account", { default: "acct_sample" })], { requiredPaths: ["object", "url"] }),
  spec("list-account-capabilities", "GET", "accounts/{account}/capabilities", [stringField("account", { default: "acct_sample" })], { requiredPaths: ["object", "data"] }),
  spec("get-account-capability", "GET", "accounts/{account}/capabilities/{capability}", [stringField("account", { default: "acct_sample" }), stringField("capability", { default: "card_payments" })]),
  spec("update-account-capability", "POST", "accounts/{account}/capabilities/{capability}", [stringField("account", { default: "acct_sample" }), stringField("capability", { default: "card_payments" }), booleanField("requested", { optional: true, default: true })], { body: ["requested"] }),
  spec("list-account-external-accounts", "GET", "accounts/{account}/external_accounts", [stringField("account", { default: "acct_sample" }), ...PAGE_FIELDS, stringField("object", { optional: true, default: "bank_account" })], { query: ["limit", "starting_after", "ending_before", "object"], requiredPaths: ["object", "data"] }),
  spec("create-account-external-account", "POST", "accounts/{account}/external_accounts", [stringField("account", { default: "acct_sample" }), stringField("external_account", { default: "btok_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["external_account", "metadata"] }),
  spec("get-account-external-account", "GET", "accounts/{account}/external_accounts/{id}", [stringField("account", { default: "acct_sample" }), stringField("id", { default: "ba_sample" })]),
  spec("update-account-external-account", "POST", "accounts/{account}/external_accounts/{id}", [stringField("account", { default: "acct_sample" }), stringField("id", { default: "ba_sample" }), stringField("account_holder_name", { optional: true, default: "Sample Person" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["account_holder_name", "metadata"] }),
  spec("delete-account-external-account", "DELETE", "accounts/{account}/external_accounts/{id}", [stringField("account", { default: "acct_sample" }), stringField("id", { default: "ba_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-account-people", "GET", "accounts/{account}/people", [stringField("account", { default: "acct_sample" }), ...PAGE_FIELDS, stringField("relationship", { optional: true, default: "representative" })], { query: ["limit", "starting_after", "ending_before", "relationship"], requiredPaths: ["object", "data"] }),
  spec("create-account-person", "POST", "accounts/{account}/people", [stringField("account", { default: "acct_sample" }), stringField("first_name", { optional: true, default: "Sample" }), stringField("last_name", { optional: true, default: "Person" }), objectField("relationship", { representative: true }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["first_name", "last_name", "relationship", "metadata"] }),
  spec("get-account-person", "GET", "accounts/{account}/people/{person}", [stringField("account", { default: "acct_sample" }), stringField("person", { default: "person_sample" })]),
  spec("update-account-person", "POST", "accounts/{account}/people/{person}", [stringField("account", { default: "acct_sample" }), stringField("person", { default: "person_sample" }), stringField("first_name", { optional: true, default: "Updated" }), stringField("last_name", { optional: true, default: "Person" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["first_name", "last_name", "metadata"] }),
  spec("delete-account-person", "DELETE", "accounts/{account}/people/{person}", [stringField("account", { default: "acct_sample" }), stringField("person", { default: "person_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("create-account-link", "POST", "account_links", [stringField("account", { default: "acct_sample" }), stringField("refresh_url", { default: "https://example.invalid/refresh" }), stringField("return_url", { default: "https://example.invalid/return" }), stringField("type", { default: "account_onboarding" })], { body: ["account", "refresh_url", "return_url", "type"], requiredPaths: ["object", "url"] }),
  spec("create-account-session", "POST", "account_sessions", [stringField("account", { default: "acct_sample" }), objectField("components", { account_onboarding: { enabled: true } }, { optional: true })], { body: ["account", "components"], requiredPaths: ["object", "client_secret"] }),
  spec("list-setup-attempts", "GET", "setup_attempts", [...PAGE_FIELDS, stringField("setup_intent", { optional: true, default: "seti_sample" })], { query: ["limit", "starting_after", "ending_before", "setup_intent"], requiredPaths: ["object", "data"] }),
  spec("get-mandate", "GET", "mandates/{mandate}", [stringField("mandate", { default: "mandate_sample" })]),
  spec("list-invoice-payments", "GET", "invoice_payments", [...PAGE_FIELDS, stringField("invoice", { optional: true, default: "in_sample" }), stringField("payment", { optional: true, default: "py_sample" })], { query: ["limit", "starting_after", "ending_before", "invoice", "payment"], requiredPaths: ["object", "data"] }),
  spec("get-invoice-payment", "GET", "invoice_payments/{invoice_payment}", [stringField("invoicePayment", { default: "inpay_sample" })]),
  spec("list-payment-method-domains", "GET", "payment_method_domains", [...PAGE_FIELDS, booleanField("enabled", { optional: true, default: true })], { query: ["limit", "starting_after", "ending_before", "enabled"], requiredPaths: ["object", "data"] }),
  spec("create-payment-method-domain", "POST", "payment_method_domains", [stringField("domain_name", { default: "pay.example.invalid" }), booleanField("enabled", { optional: true, default: true })], { body: ["domain_name", "enabled"] }),
  spec("get-payment-method-domain", "GET", "payment_method_domains/{payment_method_domain}", [stringField("paymentMethodDomain", { default: "pmd_sample" })]),
  spec("update-payment-method-domain", "POST", "payment_method_domains/{payment_method_domain}", [stringField("paymentMethodDomain", { default: "pmd_sample" }), booleanField("enabled", { optional: true, default: true })], { body: ["enabled"] }),
  spec("validate-payment-method-domain", "POST", "payment_method_domains/{payment_method_domain}/validate", [stringField("paymentMethodDomain", { default: "pmd_sample" })]),
  spec("list-payment-method-configurations", "GET", "payment_method_configurations", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true })], { query: ["limit", "starting_after", "ending_before", "active"], requiredPaths: ["object", "data"] }),
  spec("create-payment-method-configuration", "POST", "payment_method_configurations", [stringField("name", { default: "Sample configuration" }), booleanField("active", { optional: true, default: true }), objectField("card", { display_preference: { preference: "on" } }, { optional: true })], { body: ["name", "active", "card"] }),
  spec("get-payment-method-configuration", "GET", "payment_method_configurations/{configuration}", [stringField("configuration", { default: "pmc_sample" })]),
  spec("update-payment-method-configuration", "POST", "payment_method_configurations/{configuration}", [stringField("configuration", { default: "pmc_sample" }), booleanField("active", { optional: true, default: true }), objectField("card", { display_preference: { preference: "on" } }, { optional: true })], { body: ["active", "card"] }),
  spec("list-financial-connection-accounts", "GET", "financial_connections/accounts", [...PAGE_FIELDS, objectField("account_holder", { customer: "cus_sample" }, { optional: true }), stringField("session", { optional: true, default: "fcsess_sample" })], { query: ["limit", "starting_after", "ending_before", "account_holder", "session"], requiredPaths: ["object", "data"] }),
  spec("get-financial-connection-account", "GET", "financial_connections/accounts/{account}", [stringField("account", { default: "fca_sample" })]),
  spec("disconnect-financial-connection-account", "POST", "financial_connections/accounts/{account}/disconnect", [stringField("account", { default: "fca_sample" })]),
  spec("list-financial-connection-account-owners", "GET", "financial_connections/accounts/{account}/owners", [stringField("account", { default: "fca_sample" }), stringField("ownership", { default: "fcaowns_sample" }), ...PAGE_FIELDS], { query: ["ownership", "limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("refresh-financial-connection-account", "POST", "financial_connections/accounts/{account}/refresh", [stringField("account", { default: "fca_sample" }), arrayField("features", ["balance", "transactions"])], { body: ["features"] }),
  spec("subscribe-financial-connection-account", "POST", "financial_connections/accounts/{account}/subscribe", [stringField("account", { default: "fca_sample" }), arrayField("features", ["transactions"])], { body: ["features"] }),
  spec("unsubscribe-financial-connection-account", "POST", "financial_connections/accounts/{account}/unsubscribe", [stringField("account", { default: "fca_sample" }), arrayField("features", ["transactions"])], { body: ["features"] }),
  spec("create-financial-connection-session", "POST", "financial_connections/sessions", [objectField("account_holder", { type: "customer", customer: "cus_sample" }), arrayField("permissions", ["balances", "transactions"]), objectField("filters", { countries: ["US"] }, { optional: true }), arrayField("prefetch", ["transactions"], { optional: true }), stringField("return_url", { optional: true, default: "https://example.invalid/return" })], { body: ["account_holder", "permissions", "filters", "prefetch", "return_url"], requiredPaths: ["id", "object", "client_secret"] }),
  spec("get-financial-connection-session", "GET", "financial_connections/sessions/{session}", [stringField("session", { default: "fcsess_sample" })]),
  spec("list-financial-connection-transactions", "GET", "financial_connections/transactions", [stringField("account", { default: "fca_sample" }), ...PAGE_FIELDS, objectField("transacted_at", { gte: 1704067200 }, { optional: true }), objectField("transaction_refresh", { after: "fctxnref_sample" }, { optional: true })], { query: ["account", "limit", "starting_after", "ending_before", "transacted_at", "transaction_refresh"], requiredPaths: ["object", "data"] }),
  spec("get-financial-connection-transaction", "GET", "financial_connections/transactions/{transaction}", [stringField("transaction", { default: "fctxn_sample" })]),
  spec("list-identity-verification-reports", "GET", "identity/verification_reports", [...PAGE_FIELDS, stringField("client_reference_id", { optional: true, default: "identity_ref_sample" }), stringField("type", { optional: true, default: "document" }), stringField("verification_session", { optional: true, default: "vs_sample" })], { query: ["limit", "starting_after", "ending_before", "client_reference_id", "type", "verification_session"], requiredPaths: ["object", "data"] }),
  spec("get-identity-verification-report", "GET", "identity/verification_reports/{report}", [stringField("report", { default: "vr_sample" })]),
  spec("list-identity-verification-sessions", "GET", "identity/verification_sessions", [...PAGE_FIELDS, stringField("client_reference_id", { optional: true, default: "identity_ref_sample" }), stringField("related_customer", { optional: true, default: "cus_sample" }), stringField("related_customer_account", { optional: true, default: "acct_sample" }), stringField("status", { optional: true, default: "verified" })], { query: ["limit", "starting_after", "ending_before", "client_reference_id", "related_customer", "related_customer_account", "status"], requiredPaths: ["object", "data"] }),
  spec("create-identity-verification-session", "POST", "identity/verification_sessions", [stringField("type", { optional: true, default: "document" }), stringField("client_reference_id", { optional: true, default: "identity_ref_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true }), objectField("options", { document: { require_matching_selfie: true } }, { optional: true }), objectField("provided_details", { email: "person@example.invalid" }, { optional: true }), stringField("related_customer", { optional: true, default: "cus_sample" }), stringField("return_url", { optional: true, default: "https://example.invalid/return" })], { body: ["type", "client_reference_id", "metadata", "options", "provided_details", "related_customer", "return_url"], requiredPaths: ["id", "object", "status"] }),
  spec("get-identity-verification-session", "GET", "identity/verification_sessions/{session}", [stringField("session", { default: "vs_sample" })], { requiredPaths: ["id", "object", "status"] }),
  spec("update-identity-verification-session", "POST", "identity/verification_sessions/{session}", [stringField("session", { default: "vs_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true }), objectField("options", { document: { require_matching_selfie: true } }, { optional: true }), objectField("provided_details", { email: "person@example.invalid" }, { optional: true }), stringField("type", { optional: true, default: "document" })], { body: ["metadata", "options", "provided_details", "type"], requiredPaths: ["id", "object", "status"] }),
  spec("cancel-identity-verification-session", "POST", "identity/verification_sessions/{session}/cancel", [stringField("session", { default: "vs_sample" })], { requiredPaths: ["id", "object", "status"] }),
  spec("redact-identity-verification-session", "POST", "identity/verification_sessions/{session}/redact", [stringField("session", { default: "vs_sample" })], { requiredPaths: ["id", "object", "status"] }),
  spec("list-entitlement-active-entitlements", "GET", "entitlements/active_entitlements", [stringField("customer", { default: "cus_sample" }), ...PAGE_FIELDS], { query: ["customer", "limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-entitlement-active-entitlement", "GET", "entitlements/active_entitlements/{id}", [stringField("id", { default: "ent_active_sample" })]),
  spec("list-entitlement-features", "GET", "entitlements/features", [...PAGE_FIELDS, booleanField("archived", { optional: true, default: false }), stringField("lookup_key", { optional: true, default: "feature_sample" })], { query: ["limit", "starting_after", "ending_before", "archived", "lookup_key"], requiredPaths: ["object", "data"] }),
  spec("create-entitlement-feature", "POST", "entitlements/features", [stringField("lookup_key", { default: "feature_sample" }), stringField("name", { default: "Sample feature" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["lookup_key", "name", "metadata"] }),
  spec("get-entitlement-feature", "GET", "entitlements/features/{id}", [stringField("id", { default: "feat_sample" })]),
  spec("update-entitlement-feature", "POST", "entitlements/features/{id}", [stringField("id", { default: "feat_sample" }), booleanField("active", { optional: true, default: true }), stringField("name", { optional: true, default: "Updated feature" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["active", "name", "metadata"] }),
  spec("list-forwarding-requests", "GET", "forwarding/requests", [...PAGE_FIELDS, objectField("created", { gte: 1704067200 }, { optional: true })], { query: ["limit", "starting_after", "ending_before", "created"], requiredPaths: ["object", "data"] }),
  spec("create-forwarding-request", "POST", "forwarding/requests", [stringField("payment_method", { default: "pm_sample" }), arrayField("replacements", [{ field: "card_number", token: "tok_sample" }]), objectField("request", { headers: [{ name: "Authorization", value: "Bearer token_sample" }] }, { optional: true }), stringField("url", { default: "https://example.invalid/forward" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["payment_method", "replacements", "request", "url", "metadata"] }),
  spec("get-forwarding-request", "GET", "forwarding/requests/{id}", [stringField("id", { default: "fwdreq_sample" })]),
  spec("list-terminal-configurations", "GET", "terminal/configurations", [...PAGE_FIELDS, booleanField("is_account_default", { optional: true, default: false })], { query: ["limit", "starting_after", "ending_before", "is_account_default"], requiredPaths: ["object", "data"] }),
  spec("create-terminal-configuration", "POST", "terminal/configurations", [stringField("name", { default: "Sample terminal configuration" }), objectField("tipping", { aud: { fixed_amounts: [100, 200] } }, { optional: true }), objectField("offline", { enabled: false }, { optional: true }), objectField("wifi", { enterprise_eap_peap: { ca_certificate_file: "file_sample" } }, { optional: true })], { body: ["name", "tipping", "offline", "wifi"] }),
  spec("get-terminal-configuration", "GET", "terminal/configurations/{configuration}", [stringField("configuration", { default: "tmc_sample" })]),
  spec("update-terminal-configuration", "POST", "terminal/configurations/{configuration}", [stringField("configuration", { default: "tmc_sample" }), stringField("name", { optional: true, default: "Updated terminal configuration" }), objectField("tipping", { aud: { fixed_amounts: [100, 200] } }, { optional: true }), objectField("offline", { enabled: false }, { optional: true })], { body: ["name", "tipping", "offline"] }),
  spec("delete-terminal-configuration", "DELETE", "terminal/configurations/{configuration}", [stringField("configuration", { default: "tmc_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("create-terminal-connection-token", "POST", "terminal/connection_tokens", [stringField("location", { optional: true, default: "tml_sample" })], { body: ["location"], requiredPaths: ["object", "secret"] }),
  spec("list-terminal-locations", "GET", "terminal/locations", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("create-terminal-location", "POST", "terminal/locations", [stringField("display_name", { default: "Sample store" }), objectField("address", { line1: "123 Test St", city: "San Francisco", country: "US", postal_code: "94111", state: "CA" }), stringField("phone", { optional: true, default: "+14155550100" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["display_name", "address", "phone", "metadata"] }),
  spec("get-terminal-location", "GET", "terminal/locations/{location}", [stringField("location", { default: "tml_sample" })]),
  spec("update-terminal-location", "POST", "terminal/locations/{location}", [stringField("location", { default: "tml_sample" }), stringField("display_name", { optional: true, default: "Updated store" }), objectField("address", { line1: "123 Test St", city: "San Francisco", country: "US", postal_code: "94111", state: "CA" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["display_name", "address", "metadata"] }),
  spec("delete-terminal-location", "DELETE", "terminal/locations/{location}", [stringField("location", { default: "tml_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("create-terminal-onboarding-link", "POST", "terminal/onboarding_links", [stringField("link_type", { default: "apple_terms_and_conditions" }), objectField("link_options", { apple_terms_and_conditions: { country: "US" } }), stringField("on_behalf_of", { optional: true, default: "acct_sample" })], { body: ["link_type", "link_options", "on_behalf_of"], requiredPaths: ["object", "url"] }),
  spec("list-terminal-readers", "GET", "terminal/readers", [...PAGE_FIELDS, stringField("location", { optional: true, default: "tml_sample" }), stringField("status", { optional: true, default: "online" }), stringField("device_type", { optional: true, default: "bbpos_wisepad3" }), stringField("serial_number", { optional: true, default: "123-456-789" })], { query: ["limit", "starting_after", "ending_before", "location", "status", "device_type", "serial_number"], requiredPaths: ["object", "data"] }),
  spec("create-terminal-reader", "POST", "terminal/readers", [stringField("registration_code", { default: "simulated-wpe" }), stringField("label", { optional: true, default: "Front desk" }), stringField("location", { optional: true, default: "tml_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["registration_code", "label", "location", "metadata"] }),
  spec("get-terminal-reader", "GET", "terminal/readers/{reader}", [stringField("reader", { default: "tmr_sample" })]),
  spec("update-terminal-reader", "POST", "terminal/readers/{reader}", [stringField("reader", { default: "tmr_sample" }), stringField("label", { optional: true, default: "Updated reader" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["label", "metadata"] }),
  spec("delete-terminal-reader", "DELETE", "terminal/readers/{reader}", [stringField("reader", { default: "tmr_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("cancel-terminal-reader-action", "POST", "terminal/readers/{reader}/cancel_action", [stringField("reader", { default: "tmr_sample" })]),
  spec("collect-terminal-reader-inputs", "POST", "terminal/readers/{reader}/collect_inputs", [stringField("reader", { default: "tmr_sample" }), arrayField("inputs", [{ type: "selection", custom_text: { title: "Choose receipt" }, selection: { choices: [{ style: "primary", text: "Email" }] } }]), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["inputs", "metadata"] }),
  spec("collect-terminal-reader-payment-method", "POST", "terminal/readers/{reader}/collect_payment_method", [stringField("reader", { default: "tmr_sample" }), stringField("payment_intent", { default: "pi_sample" }), objectField("collect_config", { enable_customer_cancellation: true }, { optional: true })], { body: ["payment_intent", "collect_config"] }),
  spec("confirm-terminal-reader-payment-intent", "POST", "terminal/readers/{reader}/confirm_payment_intent", [stringField("reader", { default: "tmr_sample" }), stringField("payment_intent", { default: "pi_sample" }), objectField("confirm_config", { return_url: "https://example.invalid/return" }, { optional: true })], { body: ["payment_intent", "confirm_config"] }),
  spec("process-terminal-reader-payment-intent", "POST", "terminal/readers/{reader}/process_payment_intent", [stringField("reader", { default: "tmr_sample" }), stringField("payment_intent", { default: "pi_sample" }), objectField("process_config", { enable_customer_cancellation: true }, { optional: true })], { body: ["payment_intent", "process_config"] }),
  spec("process-terminal-reader-setup-intent", "POST", "terminal/readers/{reader}/process_setup_intent", [stringField("reader", { default: "tmr_sample" }), stringField("setup_intent", { default: "seti_sample" }), stringField("allow_redisplay", { default: "unspecified" }), objectField("process_config", { enable_customer_cancellation: true }, { optional: true })], { body: ["setup_intent", "allow_redisplay", "process_config"] }),
  spec("refund-terminal-reader-payment", "POST", "terminal/readers/{reader}/refund_payment", [stringField("reader", { default: "tmr_sample" }), stringField("payment_intent", { optional: true, default: "pi_sample" }), stringField("charge", { optional: true, default: "ch_sample" }), integerField("amount", { optional: true, default: 500 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["payment_intent", "charge", "amount", "metadata"] }),
  spec("set-terminal-reader-display", "POST", "terminal/readers/{reader}/set_reader_display", [stringField("reader", { default: "tmr_sample" }), stringField("type", { default: "cart" }), objectField("cart", { currency: "usd", line_items: [{ amount: 500, description: "Sample", quantity: 1 }] })], { body: ["type", "cart"] }),
  spec("create-terminal-refund", "POST", "terminal/refunds", [stringField("payment_intent", { optional: true, default: "pi_sample" }), stringField("charge", { optional: true, default: "ch_sample" }), integerField("amount", { optional: true, default: 500 }), stringField("reason", { optional: true, default: "requested_by_customer" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["payment_intent", "charge", "amount", "reason", "metadata"] }),
  spec("list-climate-orders", "GET", "climate/orders", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("create-climate-order", "POST", "climate/orders", [integerField("amount", { optional: true, default: 1200 }), stringField("currency", { optional: true, default: "usd" }), stringField("product", { default: "climsku_sample" }), stringField("metric_tons", { optional: true, default: "1.0" }), objectField("beneficiary", { public_name: "Sample Organization" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["amount", "currency", "product", "metric_tons", "beneficiary", "metadata"] }),
  spec("get-climate-order", "GET", "climate/orders/{order}", [stringField("order", { default: "climorder_sample" })]),
  spec("update-climate-order", "POST", "climate/orders/{order}", [stringField("order", { default: "climorder_sample" }), objectField("beneficiary", { public_name: "Sample Organization" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["beneficiary", "metadata"] }),
  spec("cancel-climate-order", "POST", "climate/orders/{order}/cancel", [stringField("order", { default: "climorder_sample" })]),
  spec("list-climate-products", "GET", "climate/products", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-climate-product", "GET", "climate/products/{product}", [stringField("product", { default: "climsku_sample" })]),
  spec("list-climate-suppliers", "GET", "climate/suppliers", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-climate-supplier", "GET", "climate/suppliers/{supplier}", [stringField("supplier", { default: "climsup_sample" })]),
  spec("list-report-runs", "GET", "reporting/report_runs", [...PAGE_FIELDS, objectField("created", { gte: 1700000000 }, { optional: true })], { query: ["limit", "starting_after", "ending_before", "created"], requiredPaths: ["object", "data"] }),
  spec("create-report-run", "POST", "reporting/report_runs", [stringField("report_type", { default: "balance.summary.1" }), objectField("parameters", { interval_start: 1700000000, interval_end: 1700086400 }, { optional: true })], { body: ["report_type", "parameters"] }),
  spec("get-report-run", "GET", "reporting/report_runs/{report_run}", [stringField("reportRun", { default: "frr_sample" })]),
  spec("list-report-types", "GET", "reporting/report_types", [], { requiredPaths: ["object", "data"] }),
  spec("get-report-type", "GET", "reporting/report_types/{report_type}", [stringField("reportType", { default: "balance.summary.1" })]),
  spec("find-tax-associations", "GET", "tax/associations/find", [stringField("payment_intent", { default: "pi_sample" })], { query: ["payment_intent"], requiredPaths: ["object", "data"] }),
  spec("create-tax-calculation", "POST", "tax/calculations", [stringField("currency", { default: "usd" }), arrayField("line_items", [{ amount: 1200, reference: "line_1", tax_behavior: "exclusive", tax_code: "txcd_sample" }]), objectField("customer_details", { address: { country: "US", postal_code: "94111" }, address_source: "billing" }, { optional: true }), objectField("shipping_cost", { amount: 500 }, { optional: true })], { body: ["currency", "line_items", "customer_details", "shipping_cost"] }),
  spec("get-tax-calculation", "GET", "tax/calculations/{calculation}", [stringField("calculation", { default: "taxcalc_sample" })]),
  spec("list-tax-calculation-line-items", "GET", "tax/calculations/{calculation}/line_items", [stringField("calculation", { default: "taxcalc_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("list-tax-registrations", "GET", "tax/registrations", [...PAGE_FIELDS, stringField("status", { optional: true, default: "active" })], { query: ["limit", "starting_after", "ending_before", "status"], requiredPaths: ["object", "data"] }),
  spec("create-tax-registration", "POST", "tax/registrations", [stringField("country", { default: "US" }), stringField("active_from", { default: "now" }), objectField("country_options", { us: { type: "local_amusement_tax" } })], { body: ["country", "active_from", "country_options"] }),
  spec("get-tax-registration", "GET", "tax/registrations/{id}", [stringField("id", { default: "taxreg_sample" })]),
  spec("update-tax-registration", "POST", "tax/registrations/{id}", [stringField("id", { default: "taxreg_sample" }), stringField("active_from", { optional: true, default: "now" }), integerField("expires_at", { optional: true, default: 1893456000 })], { body: ["active_from", "expires_at"] }),
  spec("get-tax-settings", "GET", "tax/settings", [], { requiredPaths: ["object"] }),
  spec("update-tax-settings", "POST", "tax/settings", [objectField("defaults", { tax_code: "txcd_sample", tax_behavior: "exclusive" }, { optional: true }), objectField("head_office", { address: { country: "US", postal_code: "94111" } }, { optional: true })], { body: ["defaults", "head_office"], requiredPaths: ["object"] }),
  spec("create-tax-transaction-from-calculation", "POST", "tax/transactions/create_from_calculation", [stringField("calculation", { default: "taxcalc_sample" }), stringField("reference", { default: "order_123" }), integerField("posted_at", { optional: true, default: 1700000000 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["calculation", "reference", "posted_at", "metadata"] }),
  spec("create-tax-transaction-reversal", "POST", "tax/transactions/create_reversal", [stringField("mode", { default: "full" }), stringField("original_transaction", { default: "taxtxn_sample" }), stringField("reference", { default: "refund_123" }), integerField("flat_amount", { optional: true, default: 500 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["mode", "original_transaction", "reference", "flat_amount", "metadata"] }),
  spec("get-tax-transaction", "GET", "tax/transactions/{transaction}", [stringField("transaction", { default: "taxtxn_sample" })]),
  spec("list-tax-transaction-line-items", "GET", "tax/transactions/{transaction}/line_items", [stringField("transaction", { default: "taxtxn_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("list-early-fraud-warnings", "GET", "radar/early_fraud_warnings", [...PAGE_FIELDS, stringField("charge", { optional: true, default: "ch_sample" }), stringField("payment_intent", { optional: true, default: "pi_sample" }), objectField("created", { gte: 1700000000 }, { optional: true })], { query: ["limit", "starting_after", "ending_before", "charge", "payment_intent", "created"], requiredPaths: ["object", "data"] }),
  spec("get-early-fraud-warning", "GET", "radar/early_fraud_warnings/{early_fraud_warning}", [stringField("earlyFraudWarning", { default: "issfr_sample" })]),
  spec("create-payment-evaluation", "POST", "radar/payment_evaluations", [objectField("customer_details", { email: "person@example.invalid", ip_address: "203.0.113.1" }), objectField("payment_details", { amount: 1200, currency: "usd" }), objectField("client_device_metadata_details", { user_agent: "Sample" }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer_details", "payment_details", "client_device_metadata_details", "metadata"] }),
  spec("list-radar-value-lists", "GET", "radar/value_lists", [...PAGE_FIELDS, stringField("alias", { optional: true, default: "blocked_cards" }), stringField("contains", { optional: true, default: "4242" })], { query: ["limit", "starting_after", "ending_before", "alias", "contains"], requiredPaths: ["object", "data"] }),
  spec("create-radar-value-list", "POST", "radar/value_lists", [stringField("alias", { default: "blocked_cards" }), stringField("name", { default: "Blocked cards" }), stringField("item_type", { optional: true, default: "card_fingerprint" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["alias", "name", "item_type", "metadata"] }),
  spec("get-radar-value-list", "GET", "radar/value_lists/{value_list}", [stringField("valueList", { default: "rsl_sample" })]),
  spec("update-radar-value-list", "POST", "radar/value_lists/{value_list}", [stringField("valueList", { default: "rsl_sample" }), stringField("alias", { optional: true, default: "blocked_cards" }), stringField("name", { optional: true, default: "Updated blocked cards" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["alias", "name", "metadata"] }),
  spec("delete-radar-value-list", "DELETE", "radar/value_lists/{value_list}", [stringField("valueList", { default: "rsl_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-radar-value-list-items", "GET", "radar/value_list_items", [...PAGE_FIELDS, stringField("value_list", { default: "rsl_sample" }), stringField("value", { optional: true, default: "424242" })], { query: ["limit", "starting_after", "ending_before", "value_list", "value"], requiredPaths: ["object", "data"] }),
  spec("create-radar-value-list-item", "POST", "radar/value_list_items", [stringField("value_list", { default: "rsl_sample" }), stringField("value", { default: "424242" })], { body: ["value_list", "value"] }),
  spec("get-radar-value-list-item", "GET", "radar/value_list_items/{item}", [stringField("item", { default: "rsli_sample" })]),
  spec("delete-radar-value-list-item", "DELETE", "radar/value_list_items/{item}", [stringField("item", { default: "rsli_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-apple-pay-domains", "GET", "apple_pay/domains", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("create-apple-pay-domain", "POST", "apple_pay/domains", [stringField("domain_name", { default: "pay.example.invalid" })], { body: ["domain_name"] }),
  spec("get-apple-pay-domain", "GET", "apple_pay/domains/{domain}", [stringField("domain", { default: "apwc_sample" })]),
  spec("delete-apple-pay-domain", "DELETE", "apple_pay/domains/{domain}", [stringField("domain", { default: "apwc_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-tax-ids", "GET", "tax_ids", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" })], { query: ["limit", "starting_after", "ending_before", "customer"], requiredPaths: ["object", "data"] }),
  spec("create-tax-id", "POST", "tax_ids", [stringField("type", { default: "eu_vat" }), stringField("value", { default: "DE123456789" }), stringField("customer", { optional: true, default: "cus_sample" })], { body: ["type", "value", "customer"] }),
  spec("get-tax-id", "GET", "tax_ids/{id}", [stringField("id", { default: "txi_sample" })]),
  spec("delete-tax-id", "DELETE", "tax_ids/{id}", [stringField("id", { default: "txi_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-invoice-rendering-templates", "GET", "invoice_rendering_templates", [...PAGE_FIELDS, stringField("status", { optional: true, default: "active" })], { query: ["limit", "starting_after", "ending_before", "status"], requiredPaths: ["object", "data"] }),
  spec("get-invoice-rendering-template", "GET", "invoice_rendering_templates/{template}", [stringField("template", { default: "irt_sample" })]),
  spec("archive-invoice-rendering-template", "POST", "invoice_rendering_templates/{template}/archive", [stringField("template", { default: "irt_sample" })]),
  spec("unarchive-invoice-rendering-template", "POST", "invoice_rendering_templates/{template}/unarchive", [stringField("template", { default: "irt_sample" })]),
  spec("list-invoices", "GET", "invoices", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" }), stringField("status", { optional: true, default: "draft" })], { query: ["limit", "starting_after", "ending_before", "customer", "status"], requiredPaths: ["object", "data"] }),
  spec("get-invoice", "GET", "invoices/{invoiceId}", [stringField("invoiceId", { default: "in_sample" })]),
  spec("create-invoice", "POST", "invoices", [stringField("customer", { default: "cus_sample" }), stringField("description", { optional: true, default: "Sample invoice" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["customer", "description", "metadata"] }),
  spec("update-invoice", "POST", "invoices/{invoiceId}", [stringField("invoiceId", { default: "in_sample" }), stringField("description", { optional: true, default: "Updated invoice" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["description", "metadata"] }),
  spec("delete-invoice", "DELETE", "invoices/{invoiceId}", [stringField("invoiceId", { default: "in_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("finalize-invoice", "POST", "invoices/{invoiceId}/finalize", [stringField("invoiceId", { default: "in_sample" })]),
  spec("pay-invoice", "POST", "invoices/{invoiceId}/pay", [stringField("invoiceId", { default: "in_sample" }), stringField("payment_method", { optional: true, default: "pm_sample" })], { body: ["payment_method"] }),
  spec("send-invoice", "POST", "invoices/{invoiceId}/send", [stringField("invoiceId", { default: "in_sample" })]),
  spec("void-invoice", "POST", "invoices/{invoiceId}/void", [stringField("invoiceId", { default: "in_sample" })]),
  spec("mark-invoice-uncollectible", "POST", "invoices/{invoiceId}/mark_uncollectible", [stringField("invoiceId", { default: "in_sample" })]),
  spec("search-invoices", "GET", "invoices/search", SEARCH_FIELDS, { query: ["query", "limit", "page"], requiredPaths: ["object", "data"] }),
  spec("list-invoice-line-items", "GET", "invoices/{invoiceId}/lines", [stringField("invoiceId", { default: "in_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("list-invoice-items", "GET", "invoiceitems", [...PAGE_FIELDS, stringField("customer", { optional: true, default: "cus_sample" })], { query: ["limit", "starting_after", "ending_before", "customer"], requiredPaths: ["object", "data"] }),
  spec("get-invoice-item", "GET", "invoiceitems/{invoiceItemId}", [stringField("invoiceItemId", { default: "ii_sample" })]),
  spec("create-invoice-item", "POST", "invoiceitems", [stringField("customer", { default: "cus_sample" }), integerField("amount", { default: 1200 }), stringField("currency", { default: "usd" }), stringField("description", { optional: true, default: "Sample item" })], { body: ["customer", "amount", "currency", "description"] }),
  spec("update-invoice-item", "POST", "invoiceitems/{invoiceItemId}", [stringField("invoiceItemId", { default: "ii_sample" }), stringField("description", { optional: true, default: "Updated item" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["description", "metadata"] }),
  spec("delete-invoice-item", "DELETE", "invoiceitems/{invoiceItemId}", [stringField("invoiceItemId", { default: "ii_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-coupons", "GET", "coupons", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-coupon", "GET", "coupons/{couponId}", [stringField("couponId", { default: "coupon_sample" })]),
  spec("create-coupon", "POST", "coupons", [stringField("id", { optional: true, default: "coupon_sample" }), integerField("percent_off", { optional: true, default: 10 }), stringField("duration", { default: "once" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["id", "percent_off", "duration", "metadata"] }),
  spec("update-coupon", "POST", "coupons/{couponId}", [stringField("couponId", { default: "coupon_sample" }), stringField("name", { optional: true, default: "Sample Coupon" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["name", "metadata"] }),
  spec("delete-coupon", "DELETE", "coupons/{couponId}", [stringField("couponId", { default: "coupon_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-plans", "GET", "plans", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true }), stringField("product", { optional: true, default: "prod_sample" })], { query: ["limit", "starting_after", "ending_before", "active", "product"], requiredPaths: ["object", "data"] }),
  spec("create-plan", "POST", "plans", [stringField("currency", { default: "usd" }), stringField("interval", { default: "month" }), integerField("amount", { optional: true, default: 1200 }), stringField("product", { optional: true, default: "prod_sample" }), stringField("nickname", { optional: true, default: "Sample plan" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["currency", "interval", "amount", "product", "nickname", "metadata"] }),
  spec("get-plan", "GET", "plans/{plan}", [stringField("plan", { default: "plan_sample" })]),
  spec("update-plan", "POST", "plans/{plan}", [stringField("plan", { default: "plan_sample" }), booleanField("active", { optional: true, default: true }), stringField("nickname", { optional: true, default: "Updated plan" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["active", "nickname", "metadata"] }),
  spec("delete-plan", "DELETE", "plans/{plan}", [stringField("plan", { default: "plan_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-promotion-codes", "GET", "promotion_codes", [...PAGE_FIELDS, stringField("coupon", { optional: true, default: "coupon_sample" })], { query: ["limit", "starting_after", "ending_before", "coupon"], requiredPaths: ["object", "data"] }),
  spec("get-promotion-code", "GET", "promotion_codes/{promotionCodeId}", [stringField("promotionCodeId", { default: "promo_sample" })]),
  spec("create-promotion-code", "POST", "promotion_codes", [stringField("coupon", { default: "coupon_sample" }), stringField("code", { optional: true, default: "SAVE10" }), booleanField("active", { optional: true, default: true })], { body: ["coupon", "code", "active"] }),
  spec("update-promotion-code", "POST", "promotion_codes/{promotionCodeId}", [stringField("promotionCodeId", { default: "promo_sample" }), booleanField("active", { optional: true, default: true }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["active", "metadata"] }),
  spec("list-shipping-rates", "GET", "shipping_rates", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true }), stringField("currency", { optional: true, default: "usd" })], { query: ["limit", "starting_after", "ending_before", "active", "currency"], requiredPaths: ["object", "data"] }),
  spec("create-shipping-rate", "POST", "shipping_rates", [stringField("display_name", { default: "Sample shipping" }), objectField("fixed_amount", { amount: 500, currency: "usd" }, { optional: true }), stringField("tax_behavior", { optional: true, default: "exclusive" }), stringField("tax_code", { optional: true, default: "txcd_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["display_name", "fixed_amount", "tax_behavior", "tax_code", "metadata"] }),
  spec("get-shipping-rate", "GET", "shipping_rates/{shipping_rate_token}", [stringField("shippingRateToken", { default: "shr_sample" })]),
  spec("update-shipping-rate", "POST", "shipping_rates/{shipping_rate_token}", [stringField("shippingRateToken", { default: "shr_sample" }), booleanField("active", { optional: true, default: true }), objectField("fixed_amount", { amount: 500, currency: "usd" }, { optional: true }), stringField("tax_behavior", { optional: true, default: "exclusive" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["active", "fixed_amount", "tax_behavior", "metadata"] }),
  spec("list-tax-codes", "GET", "tax_codes", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-tax-code", "GET", "tax_codes/{id}", [stringField("id", { default: "txcd_sample" })]),
  spec("list-tax-rates", "GET", "tax_rates", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true })], { query: ["limit", "starting_after", "ending_before", "active"], requiredPaths: ["object", "data"] }),
  spec("get-tax-rate", "GET", "tax_rates/{taxRateId}", [stringField("taxRateId", { default: "txr_sample" })]),
  spec("create-tax-rate", "POST", "tax_rates", [stringField("display_name", { default: "VAT" }), integerField("percentage", { default: 20 }), booleanField("inclusive", { default: false }), stringField("country", { optional: true, default: "ES" })], { body: ["display_name", "percentage", "inclusive", "country"] }),
  spec("update-tax-rate", "POST", "tax_rates/{taxRateId}", [stringField("taxRateId", { default: "txr_sample" }), booleanField("active", { optional: true, default: true }), stringField("display_name", { optional: true, default: "VAT" })], { body: ["active", "display_name"] }),
  spec("list-topups", "GET", "topups", [...PAGE_FIELDS, integerField("amount", { optional: true, default: 1200 }), stringField("status", { optional: true, default: "succeeded" })], { query: ["limit", "starting_after", "ending_before", "amount", "status"], requiredPaths: ["object", "data"] }),
  spec("create-topup", "POST", "topups", [integerField("amount", { default: 1200 }), stringField("currency", { default: "usd" }), stringField("description", { optional: true, default: "Sample topup" }), objectField("metadata", { order_id: "sample" }, { optional: true }), stringField("source", { optional: true, default: "src_sample" }), stringField("statement_descriptor", { optional: true, default: "Sample" }), stringField("transfer_group", { optional: true, default: "group_sample" })], { body: ["amount", "currency", "description", "metadata", "source", "statement_descriptor", "transfer_group"] }),
  spec("get-topup", "GET", "topups/{topup}", [stringField("topup", { default: "tu_sample" })]),
  spec("update-topup", "POST", "topups/{topup}", [stringField("topup", { default: "tu_sample" }), stringField("description", { optional: true, default: "Updated topup" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["description", "metadata"] }),
  spec("cancel-topup", "POST", "topups/{topup}/cancel", [stringField("topup", { default: "tu_sample" })]),
  spec("list-reviews", "GET", "reviews", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-review", "GET", "reviews/{review}", [stringField("review", { default: "prv_sample" })]),
  spec("approve-review", "POST", "reviews/{review}/approve", [stringField("review", { default: "prv_sample" })]),
  spec("list-payouts", "GET", "payouts", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-payout", "GET", "payouts/{payoutId}", [stringField("payoutId", { default: "po_sample" })]),
  spec("create-payout", "POST", "payouts", [integerField("amount", { default: 1200 }), stringField("currency", { default: "usd" }), stringField("description", { optional: true, default: "Sample payout" })], { body: ["amount", "currency", "description"] }),
  spec("update-payout", "POST", "payouts/{payoutId}", [stringField("payoutId", { default: "po_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["metadata"] }),
  spec("cancel-payout", "POST", "payouts/{payoutId}/cancel", [stringField("payoutId", { default: "po_sample" })]),
  spec("reverse-payout", "POST", "payouts/{payoutId}/reverse", [stringField("payoutId", { default: "po_sample" })]),
  spec("list-transfers", "GET", "transfers", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-transfer", "GET", "transfers/{transferId}", [stringField("transferId", { default: "tr_sample" })]),
  spec("create-transfer", "POST", "transfers", [integerField("amount", { default: 1200 }), stringField("currency", { default: "usd" }), stringField("destination", { default: "acct_sample" }), stringField("description", { optional: true, default: "Sample transfer" })], { body: ["amount", "currency", "destination", "description"] }),
  spec("update-transfer", "POST", "transfers/{transferId}", [stringField("transferId", { default: "tr_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["metadata"] }),
  spec("list-transfer-reversals", "GET", "transfers/{transferId}/reversals", [stringField("transferId", { default: "tr_sample" }), ...PAGE_FIELDS], { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-transfer-reversal", "GET", "transfers/{transferId}/reversals/{reversalId}", [stringField("transferId", { default: "tr_sample" }), stringField("reversalId", { default: "trr_sample" })]),
  spec("create-transfer-reversal", "POST", "transfers/{transferId}/reversals", [stringField("transferId", { default: "tr_sample" }), integerField("amount", { optional: true, default: 500 }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["amount", "metadata"] }),
  spec("update-transfer-reversal", "POST", "transfers/{transferId}/reversals/{reversalId}", [stringField("transferId", { default: "tr_sample" }), stringField("reversalId", { default: "trr_sample" }), objectField("metadata", { order_id: "sample" }, { optional: true })], { body: ["metadata"] }),
  spec("list-subscription-items", "GET", "subscription_items", [...PAGE_FIELDS, stringField("subscription", { default: "sub_sample" })], { query: ["limit", "starting_after", "ending_before", "subscription"], requiredPaths: ["object", "data"] }),
  spec("get-subscription-item", "GET", "subscription_items/{subscriptionItemId}", [stringField("subscriptionItemId", { default: "si_sample" })]),
  spec("create-subscription-item", "POST", "subscription_items", [stringField("subscription", { default: "sub_sample" }), stringField("price", { default: "price_sample" }), integerField("quantity", { optional: true, default: 1 })], { body: ["subscription", "price", "quantity"] }),
  spec("update-subscription-item", "POST", "subscription_items/{subscriptionItemId}", [stringField("subscriptionItemId", { default: "si_sample" }), stringField("price", { optional: true, default: "price_sample" }), integerField("quantity", { optional: true, default: 1 })], { body: ["price", "quantity"] }),
  spec("delete-subscription-item", "DELETE", "subscription_items/{subscriptionItemId}", [stringField("subscriptionItemId", { default: "si_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
  spec("list-billing-portal-configurations", "GET", "billing_portal/configurations", [...PAGE_FIELDS, booleanField("active", { optional: true, default: true }), booleanField("is_default", { optional: true, default: false })], { query: ["limit", "starting_after", "ending_before", "active", "is_default"], requiredPaths: ["object", "data"] }),
  spec("create-billing-portal-configuration", "POST", "billing_portal/configurations", [objectField("features", { customer_update: { enabled: true } }), stringField("default_return_url", { optional: true, default: "https://example.invalid/return" }), objectField("metadata", { order_id: "sample" }, { optional: true }), stringField("name", { optional: true, default: "Sample portal" })], { body: ["features", "default_return_url", "metadata", "name"] }),
  spec("get-billing-portal-configuration", "GET", "billing_portal/configurations/{configuration}", [stringField("configuration", { default: "bpc_sample" })]),
  spec("update-billing-portal-configuration", "POST", "billing_portal/configurations/{configuration}", [stringField("configuration", { default: "bpc_sample" }), booleanField("active", { optional: true, default: true }), objectField("features", { customer_update: { enabled: true } }, { optional: true }), objectField("metadata", { order_id: "sample" }, { optional: true }), stringField("name", { optional: true, default: "Updated portal" })], { body: ["active", "features", "metadata", "name"] }),
  spec("create-billing-portal-session", "POST", "billing_portal/sessions", [stringField("customer", { optional: true, default: "cus_sample" }), stringField("configuration", { optional: true, default: "bpc_sample" }), stringField("return_url", { optional: true, default: "https://example.invalid/return" })], { body: ["customer", "configuration", "return_url"] }),
  spec("create-customer-session", "POST", "customer_sessions", [stringField("customer", { optional: true, default: "cus_sample" }), objectField("components", { pricing_table: { enabled: true } })], { body: ["customer", "components"] }),
  spec("list-webhook-endpoints", "GET", "webhook_endpoints", PAGE_FIELDS, { query: ["limit", "starting_after", "ending_before"], requiredPaths: ["object", "data"] }),
  spec("get-webhook-endpoint", "GET", "webhook_endpoints/{webhookEndpointId}", [stringField("webhookEndpointId", { default: "we_sample" })]),
  spec("create-webhook-endpoint", "POST", "webhook_endpoints", [stringField("url", { default: "https://example.invalid/stripe/webhook" }), arrayField("enabled_events", ["payment_intent.succeeded"]), stringField("description", { optional: true, default: "Sample endpoint" })], { body: ["url", "enabled_events", "description"] }),
  spec("update-webhook-endpoint", "POST", "webhook_endpoints/{webhookEndpointId}", [stringField("webhookEndpointId", { default: "we_sample" }), stringField("url", { optional: true, default: "https://example.invalid/stripe/webhook" }), arrayField("enabled_events", ["payment_intent.succeeded"], { optional: true })], { body: ["url", "enabled_events"] }),
  spec("delete-webhook-endpoint", "DELETE", "webhook_endpoints/{webhookEndpointId}", [stringField("webhookEndpointId", { default: "we_sample" })], { requiredPaths: ["id", "object", "deleted"] }),
] as const satisfies readonly StripeGenericOperationSpec[];

export const STRIPE_ACTION_SLUGS = [
  ...STRIPE_CORE_ACTION_SLUGS,
  ...STRIPE_EXTRA_ACTION_SPECS.map((item) => item.slug),
] as const;

export type StripeRuntimeOperation = typeof STRIPE_ACTION_SLUGS[number];

const STRIPE_OPERATION_SET = new Set<string>(STRIPE_ACTION_SLUGS);
const STRIPE_EXTRA_SPEC_BY_SLUG = new Map(STRIPE_EXTRA_ACTION_SPECS.map((item) => [item.slug, item]));
const STRIPE_OPERATION_ALIASES: Record<string, StripeRuntimeOperation> = {
  "retrieve-customer": "get-customer",
  "retrieve-payment-intent": "get-payment-intent",
  "retrieve-product": "get-product",
  "retrieve-price": "get-price",
  "retrieve-subscription": "get-subscription",
  "retrieve-checkout-session": "get-checkout-session",
  "retrieve-refund": "get-refund",
  "retrieve-charge": "get-charge",
  "retrieve-setup-intent": "get-setup-intent",
  "retrieve-payment-method": "get-payment-method",
  "retrieve-balance-transaction": "get-balance-transaction",
  "retrieve-event": "get-event",
  "retrieve-dispute": "get-dispute",
  "retrieve-invoice": "get-invoice",
  "retrieve-invoice-item": "get-invoice-item",
  "retrieve-coupon": "get-coupon",
  "retrieve-promotion-code": "get-promotion-code",
  "retrieve-tax-rate": "get-tax-rate",
  "retrieve-payout": "get-payout",
  "retrieve-account": "get-connected-account",
  "retrieve-account-capability": "get-account-capability",
  "retrieve-account-external-account": "get-account-external-account",
  "retrieve-account-person": "get-account-person",
  "retrieve-financial-connection-account": "get-financial-connection-account",
  "retrieve-financial-connection-session": "get-financial-connection-session",
  "retrieve-financial-connection-transaction": "get-financial-connection-transaction",
  "retrieve-identity-verification-report": "get-identity-verification-report",
  "retrieve-identity-verification-session": "get-identity-verification-session",
  "retrieve-entitlement-active-entitlement": "get-entitlement-active-entitlement",
  "retrieve-entitlement-feature": "get-entitlement-feature",
  "retrieve-forwarding-request": "get-forwarding-request",
  "retrieve-terminal-configuration": "get-terminal-configuration",
  "retrieve-terminal-location": "get-terminal-location",
  "retrieve-terminal-reader": "get-terminal-reader",
  "retrieve-climate-order": "get-climate-order",
  "retrieve-climate-product": "get-climate-product",
  "retrieve-climate-supplier": "get-climate-supplier",
  "retrieve-report-run": "get-report-run",
  "retrieve-report-type": "get-report-type",
  "retrieve-tax-calculation": "get-tax-calculation",
  "retrieve-tax-registration": "get-tax-registration",
  "retrieve-tax-transaction": "get-tax-transaction",
  "retrieve-early-fraud-warning": "get-early-fraud-warning",
  "retrieve-radar-value-list": "get-radar-value-list",
  "retrieve-radar-value-list-item": "get-radar-value-list-item",
  "retrieve-transfer": "get-transfer",
  "retrieve-transfer-reversal": "get-transfer-reversal",
  "retrieve-subscription-item": "get-subscription-item",
  "retrieve-webhook-endpoint": "get-webhook-endpoint",
};

export function isStripeActionOperationSupported(operationId: string): boolean {
  return stripeRuntimeOperation(operationId) !== null;
}

export function buildStripeOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = stripeRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Stripe operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = { accept: "application/json" };
  const genericSpec = STRIPE_EXTRA_SPEC_BY_SLUG.get(runtimeOperation);
  if (genericSpec) return genericStripePlan(genericSpec, values, auth, headers);

  switch (runtimeOperation) {
    case "list-customers":
      return listPlan("customers", values, auth, headers);
    case "get-customer":
      return {
        method: "GET",
        endpoint: `customers/${pathSegment(requiredString(firstValue(values.customerId, values.customer), "customerId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "create-customer":
      return {
        method: "POST",
        endpoint: "customers",
        auth,
        headers,
        bodyEncoding: "form",
        body: removeEmptyValues({
          email: values.email,
          name: values.name,
          description: values.description,
          phone: values.phone,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-payment-intents":
      return listPlan("payment_intents", values, auth, headers);
    case "get-payment-intent":
      return {
        method: "GET",
        endpoint: `payment_intents/${pathSegment(requiredString(firstValue(values.paymentIntentId, values.payment_intent), "paymentIntentId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "create-payment-intent":
      return {
        method: "POST",
        endpoint: "payment_intents",
        auth,
        headers,
        bodyEncoding: "form",
        body: removeEmptyValues({
          amount: requiredInteger(values.amount, "amount"),
          currency: requiredString(values.currency, "currency").toLowerCase(),
          customer: values.customerId ?? values.customer,
          description: values.description,
          confirm: values.confirm,
          receipt_email: values.receiptEmail ?? values.receipt_email,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "list-products":
      return listPlan("products", values, auth, headers);
    case "get-product":
      return retrievePlan("products", firstValue(values.productId, values.product), "productId", auth, headers);
    case "create-product":
      return postFormPlan("products", removeEmptyValues({
        name: requiredString(values.name, "name"),
        description: values.description,
        active: values.active,
        default_price_data: values.defaultPriceData ?? values.default_price_data,
        images: values.images,
        metadata: values.metadata,
        tax_code: values.taxCode ?? values.tax_code,
        url: values.url,
      }), auth, headers, ["id", "object"]);
    case "update-product":
      return postFormPlan(`products/${pathSegment(requiredString(firstValue(values.productId, values.product), "productId"))}`, removeEmptyValues({
        name: values.name,
        description: values.description,
        active: values.active,
        default_price: values.defaultPrice ?? values.default_price,
        images: values.images,
        metadata: values.metadata,
        tax_code: values.taxCode ?? values.tax_code,
        url: values.url,
      }), auth, headers, ["id", "object"]);
    case "delete-product":
      return {
        method: "DELETE",
        endpoint: `products/${pathSegment(requiredString(firstValue(values.productId, values.product), "productId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "deleted"],
        },
      };
    case "search-products":
      return searchPlan("products/search", values, auth, headers);
    case "list-prices":
      return listPlan("prices", values, auth, headers);
    case "get-price":
      return retrievePlan("prices", firstValue(values.priceId, values.price), "priceId", auth, headers);
    case "create-price":
      return postFormPlan("prices", removeEmptyValues({
        currency: requiredString(values.currency, "currency").toLowerCase(),
        product: requiredString(firstValue(values.productId, values.product), "productId"),
        unit_amount: values.unitAmount ?? values.unit_amount,
        unit_amount_decimal: values.unitAmountDecimal ?? values.unit_amount_decimal,
        recurring: values.recurring,
        billing_scheme: values.billingScheme ?? values.billing_scheme,
        nickname: values.nickname,
        tax_behavior: values.taxBehavior ?? values.tax_behavior,
        lookup_key: values.lookupKey ?? values.lookup_key,
        metadata: values.metadata,
      }), auth, headers, ["id", "object"]);
    case "update-price":
      return postFormPlan(`prices/${pathSegment(requiredString(firstValue(values.priceId, values.price), "priceId"))}`, removeEmptyValues({
        active: values.active,
        nickname: values.nickname,
        lookup_key: values.lookupKey ?? values.lookup_key,
        metadata: values.metadata,
        tax_behavior: values.taxBehavior ?? values.tax_behavior,
      }), auth, headers, ["id", "object"]);
    case "search-prices":
      return searchPlan("prices/search", values, auth, headers);
    case "list-subscriptions":
      return listPlan("subscriptions", values, auth, headers);
    case "get-subscription":
      return retrievePlan("subscriptions", firstValue(values.subscriptionId, values.subscription), "subscriptionId", auth, headers);
    case "create-subscription":
      return postFormPlan("subscriptions", removeEmptyValues({
        customer: requiredString(firstValue(values.customerId, values.customer), "customerId"),
        items: requiredJson(values.items, "items"),
        collection_method: values.collectionMethod ?? values.collection_method,
        description: values.description,
        metadata: values.metadata,
        payment_behavior: values.paymentBehavior ?? values.payment_behavior,
        trial_end: values.trialEnd ?? values.trial_end,
        trial_period_days: values.trialPeriodDays ?? values.trial_period_days,
      }), auth, headers, ["id", "object", "status"]);
    case "update-subscription":
      return postFormPlan(`subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}`, removeEmptyValues({
        items: values.items,
        metadata: values.metadata,
        pause_collection: values.pauseCollection ?? values.pause_collection,
        proration_behavior: values.prorationBehavior ?? values.proration_behavior,
        trial_end: values.trialEnd ?? values.trial_end,
      }), auth, headers, ["id", "object", "status"]);
    case "cancel-subscription":
      return {
        method: "DELETE",
        endpoint: `subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "resume-subscription":
      return postFormPlan(`subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}/resume`, removeEmptyValues({
        billing_cycle_anchor: values.billingCycleAnchor ?? values.billing_cycle_anchor,
        proration_behavior: values.prorationBehavior ?? values.proration_behavior,
      }), auth, headers, ["id", "object", "status"]);
    case "search-subscriptions":
      return searchPlan("subscriptions/search", values, auth, headers);
    case "list-checkout-sessions":
      return listPlan("checkout/sessions", values, auth, headers);
    case "get-checkout-session":
      return retrievePlan("checkout/sessions", firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId", auth, headers, ["id", "object", "mode"]);
    case "create-checkout-session":
      return postFormPlan("checkout/sessions", removeEmptyValues({
        mode: requiredString(values.mode, "mode"),
        success_url: requiredString(firstValue(values.successUrl, values.success_url), "successUrl"),
        cancel_url: values.cancelUrl ?? values.cancel_url,
        line_items: values.lineItems ?? values.line_items,
        customer: values.customerId ?? values.customer,
        client_reference_id: values.clientReferenceId ?? values.client_reference_id,
        metadata: values.metadata,
        payment_intent_data: values.paymentIntentData ?? values.payment_intent_data,
        subscription_data: values.subscriptionData ?? values.subscription_data,
      }), auth, headers, ["id", "object", "mode"]);
    case "expire-checkout-session":
      return postFormPlan(`checkout/sessions/${pathSegment(requiredString(firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId"))}/expire`, {}, auth, headers, ["id", "object", "mode"]);
    case "list-checkout-session-line-items":
      return listPlan(`checkout/sessions/${pathSegment(requiredString(firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId"))}/line_items`, values, auth, headers);
    case "list-refunds":
      return listPlan("refunds", values, auth, headers);
    case "get-refund":
      return retrievePlan("refunds", firstValue(values.refundId, values.refund), "refundId", auth, headers);
    case "create-refund":
      return postFormPlan("refunds", removeEmptyValues({
        charge: values.chargeId ?? values.charge,
        payment_intent: values.paymentIntentId ?? values.payment_intent,
        amount: values.amount,
        reason: values.reason,
        metadata: values.metadata,
      }), auth, headers, ["id", "object", "status"]);
    case "update-refund":
      return postFormPlan(`refunds/${pathSegment(requiredString(firstValue(values.refundId, values.refund), "refundId"))}`, removeEmptyValues({
        metadata: values.metadata,
      }), auth, headers, ["id", "object", "status"]);
    case "list-charges":
      return listPlan("charges", values, auth, headers);
    case "get-charge":
      return retrievePlan("charges", firstValue(values.chargeId, values.charge), "chargeId", auth, headers);
    case "capture-charge":
      return postFormPlan(`charges/${pathSegment(requiredString(firstValue(values.chargeId, values.charge), "chargeId"))}/capture`, removeEmptyValues({
        amount: values.amount,
        receipt_email: values.receiptEmail ?? values.receipt_email,
        statement_descriptor: values.statementDescriptor ?? values.statement_descriptor,
      }), auth, headers, ["id", "object", "status"]);
  }
}

function spec(
  slug: string,
  method: StripeGenericOperationSpec["method"],
  endpoint: string,
  fields: StripeField[],
  options: {
    bodyEncoding?: StripeGenericOperationSpec["bodyEncoding"];
    responseBodyEncoding?: StripeGenericOperationSpec["responseBodyEncoding"];
    responseSchema?: StripeGenericOperationSpec["responseSchema"];
    query?: string[];
    body?: string[];
    requiredPaths?: string[];
  } = {},
): StripeGenericOperationSpec {
  return {
    slug,
    method,
    endpoint,
    fields,
    bodyEncoding: options.bodyEncoding,
    responseBodyEncoding: options.responseBodyEncoding,
    responseSchema: options.responseSchema,
    query: options.query,
    body: options.body,
    requiredPaths: options.requiredPaths,
  };
}

function genericStripePlan(
  spec: StripeGenericOperationSpec,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return {
    method: spec.method,
    endpoint: interpolateEndpoint(spec.endpoint, values),
    auth,
    headers,
    query: valuesForApiKeys(values, spec.query ?? []),
    bodyEncoding: spec.method === "POST" ? spec.bodyEncoding ?? "form" : undefined,
    ...(spec.responseBodyEncoding ? { responseBodyEncoding: spec.responseBodyEncoding } : {}),
    body: valuesForApiKeys(values, spec.body ?? []),
    responseSchema: spec.responseSchema ?? {
      type: "object",
      requiredPaths: spec.requiredPaths ?? ["id", "object"],
    },
  };
}

function listPlan(
  endpoint: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues({
      limit: values.limit ?? 10,
      starting_after: values.startingAfter ?? values.starting_after,
      ending_before: values.endingBefore ?? values.ending_before,
      customer: values.customerId ?? values.customer,
      active: values.active,
      product: values.productId ?? values.product,
      price: values.priceId ?? values.price,
      subscription: values.subscriptionId ?? values.subscription,
      payment_intent: values.paymentIntentId ?? values.payment_intent,
      status: values.status,
    }),
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths: ["object", "data"],
    },
  };
}

function retrievePlan(
  endpoint: string,
  id: IntegrationJson,
  name: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  requiredPaths: string[] = ["id", "object"],
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint: `${endpoint}/${pathSegment(requiredString(id, name))}`,
    auth,
    headers,
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function postFormPlan(
  endpoint: string,
  body: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return {
    method: "POST",
    endpoint,
    auth,
    headers,
    bodyEncoding: "form",
    body,
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function searchPlan(
  endpoint: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues({
      query: requiredString(values.query, "query"),
      limit: values.limit ?? 10,
      page: values.page,
    }),
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths: ["object", "data"],
    },
  };
}

function stripeRuntimeOperation(operationId: string): StripeRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  const resolved = slug ? STRIPE_OPERATION_ALIASES[slug] ?? slug : null;
  if (resolved && STRIPE_OPERATION_SET.has(resolved)) return resolved as StripeRuntimeOperation;
  return null;
}

function interpolateEndpoint(endpoint: string, values: Record<string, IntegrationJson>): string {
  return endpoint.replaceAll(/\{([^}]+)\}/g, (_, key: string) => pathSegment(requiredString(valueForApiKey(values, key), key)));
}

function valuesForApiKeys(values: Record<string, IntegrationJson>, keys: readonly string[]): Record<string, IntegrationJson> {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = valueForApiKey(values, key);
    return value === undefined || value === null || value === "" ? [] : [[key, value]];
  }));
}

function valueForApiKey(values: Record<string, IntegrationJson>, key: string): IntegrationJson | undefined {
  const camel = camelCase(key);
  const candidates = [
    key,
    camel,
    `${camel}Id`,
    key.endsWith("_id") ? camelCase(key.slice(0, -3)) : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(values, candidate)) return values[candidate];
  }
  return undefined;
}

function camelCase(key: string): string {
  return key.replaceAll(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`Stripe ${name} is required`);
}

function requiredInteger(value: IntegrationJson, name: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  throw new Error(`Stripe ${name} must be an integer`);
}

function requiredJson(value: IntegrationJson | undefined, name: string): IntegrationJson {
  if (value == null || value === "") throw new Error(`Stripe ${name} is required`);
  return value;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}

function stringField(name: string, options: { optional?: boolean; default: string }): StripeField {
  return { name, type: "string", optional: options.optional ?? false, default: options.default };
}

function integerField(name: string, options: { optional?: boolean; default: number; min?: number; max?: number }): StripeField {
  return { name, type: "integer", optional: options.optional ?? false, default: options.default, ...(options.min ? { min: options.min } : {}), ...(options.max ? { max: options.max } : {}) };
}

function booleanField(name: string, options: { optional?: boolean; default: boolean }): StripeField {
  return { name, type: "boolean", optional: options.optional ?? false, default: options.default };
}

function arrayField(name: string, defaultValue: IntegrationJson[], options: { optional?: boolean } = {}): StripeField {
  return { name, type: "array", optional: options.optional ?? false, default: defaultValue };
}

function objectField(name: string, defaultValue: Record<string, IntegrationJson>, options: { optional?: boolean } = {}): StripeField {
  return { name, type: "object", optional: options.optional ?? false, default: defaultValue };
}
