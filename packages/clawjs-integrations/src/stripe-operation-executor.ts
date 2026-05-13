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
    body: valuesForApiKeys(values, spec.body ?? []),
    responseSchema: {
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
