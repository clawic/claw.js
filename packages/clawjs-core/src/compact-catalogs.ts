// @generated compact catalog snapshot.
// This file is intentionally a derived, import-light data surface. The
// catalog-boundary tests compare it against the canonical heavy catalogs.

export interface CompactBuiltinCollectionSummary {
  name: string;
  displayName: string;
  family: string;
  aliases: readonly string[];
  fieldCount: number;
}

export interface CompactBuiltinFamilySummary {
  name: string;
  displayName: string;
  description: string;
  collectionCount: number;
  collections: readonly CompactBuiltinCollectionSummary[];
}

export interface CompactBuiltinCollectionAlias {
  alias: string;
  canonicalName: string;
}

export interface CompactCliCommandSummary {
  name: string;
  kind: "canonical" | "portal" | "alias";
  target?: string;
  advanced?: boolean;
}

export const compactBuiltinFamilies: readonly CompactBuiltinFamilySummary[] = [
  {
    "name": "data_foundation",
    "displayName": "Data Foundation",
    "description": "Shared dense-data primitives for identities, roles, evidence, provenance, gaps, semantic views, intents, vocabularies, units, instruments, and responses.",
    "collectionCount": 17,
    "collections": [
      {
        "name": "domain_systems",
        "displayName": "Domain Systems",
        "family": "data_foundation",
        "aliases": [
          "domain_system",
          "domain_systems"
        ],
        "fieldCount": 12
      },
      {
        "name": "domain_packs",
        "displayName": "Domain Packs",
        "family": "data_foundation",
        "aliases": [
          "domain_pack",
          "domain_packs"
        ],
        "fieldCount": 10
      },
      {
        "name": "domain_roles",
        "displayName": "Domain Roles",
        "family": "data_foundation",
        "aliases": [
          "domain_role",
          "domain_roles"
        ],
        "fieldCount": 7
      },
      {
        "name": "domain_profiles",
        "displayName": "Domain Profiles",
        "family": "data_foundation",
        "aliases": [
          "domain_profile",
          "domain_profiles",
          "typed_profile",
          "typed_profiles"
        ],
        "fieldCount": 11
      },
      {
        "name": "evidence_sources",
        "displayName": "Evidence Sources",
        "family": "data_foundation",
        "aliases": [
          "evidence_source",
          "evidence_sources",
          "evidence"
        ],
        "fieldCount": 11
      },
      {
        "name": "provenance_events",
        "displayName": "Provenance Events",
        "family": "data_foundation",
        "aliases": [
          "provenance_event",
          "provenance_events",
          "provenance"
        ],
        "fieldCount": 10
      },
      {
        "name": "quality_gaps",
        "displayName": "Quality Gaps",
        "family": "data_foundation",
        "aliases": [
          "quality_gap",
          "quality_gaps",
          "data_gap",
          "data_gaps"
        ],
        "fieldCount": 12
      },
      {
        "name": "canonical_operations",
        "displayName": "Canonical Operations",
        "family": "data_foundation",
        "aliases": [
          "canonical_operation",
          "canonical_operations"
        ],
        "fieldCount": 9
      },
      {
        "name": "semantic_views",
        "displayName": "Semantic Views",
        "family": "data_foundation",
        "aliases": [
          "semantic_view",
          "semantic_views"
        ],
        "fieldCount": 11
      },
      {
        "name": "domain_intents",
        "displayName": "Domain Intents",
        "family": "data_foundation",
        "aliases": [
          "domain_intent",
          "domain_intents",
          "intent_coverage"
        ],
        "fieldCount": 11
      },
      {
        "name": "vocabularies",
        "displayName": "Vocabularies",
        "family": "data_foundation",
        "aliases": [
          "vocabulary",
          "vocabularies"
        ],
        "fieldCount": 8
      },
      {
        "name": "concepts",
        "displayName": "Concepts",
        "family": "data_foundation",
        "aliases": [
          "concept",
          "concepts"
        ],
        "fieldCount": 8
      },
      {
        "name": "concept_mappings",
        "displayName": "Concept Mappings",
        "family": "data_foundation",
        "aliases": [
          "concept_mapping",
          "concept_mappings"
        ],
        "fieldCount": 7
      },
      {
        "name": "units",
        "displayName": "Units",
        "family": "data_foundation",
        "aliases": [
          "unit",
          "units"
        ],
        "fieldCount": 8
      },
      {
        "name": "instruments",
        "displayName": "Instruments",
        "family": "data_foundation",
        "aliases": [
          "instrument",
          "instruments"
        ],
        "fieldCount": 7
      },
      {
        "name": "instrument_items",
        "displayName": "Instrument Items",
        "family": "data_foundation",
        "aliases": [
          "instrument_item",
          "instrument_items"
        ],
        "fieldCount": 9
      },
      {
        "name": "instrument_responses",
        "displayName": "Instrument Responses",
        "family": "data_foundation",
        "aliases": [
          "instrument_response",
          "instrument_responses"
        ],
        "fieldCount": 12
      }
    ]
  },
  {
    "name": "cooking",
    "displayName": "Cooking & Food",
    "description": "Recipes, meal plans, groceries, restaurants and food diary.",
    "collectionCount": 19,
    "collections": [
      {
        "name": "brewing_batches",
        "displayName": "Brewing Batches",
        "family": "cooking",
        "aliases": [
          "brewing_batch",
          "brewing_batches"
        ],
        "fieldCount": 7
      },
      {
        "name": "cookbooks",
        "displayName": "Cookbooks",
        "family": "cooking",
        "aliases": [
          "cookbook",
          "cookbooks"
        ],
        "fieldCount": 7
      },
      {
        "name": "dietary_preferences",
        "displayName": "Dietary Preferences",
        "family": "cooking",
        "aliases": [
          "dietary_preference",
          "dietary_preferences"
        ],
        "fieldCount": 5
      },
      {
        "name": "food_diary_entries",
        "displayName": "Food Diary Entries",
        "family": "cooking",
        "aliases": [
          "food_diary_entry",
          "food_diary_entries",
          "food_log"
        ],
        "fieldCount": 9
      },
      {
        "name": "grocery_items",
        "displayName": "Grocery Items",
        "family": "cooking",
        "aliases": [
          "grocery_item",
          "grocery_items"
        ],
        "fieldCount": 9
      },
      {
        "name": "grocery_lists",
        "displayName": "Grocery Lists",
        "family": "cooking",
        "aliases": [
          "grocery_list",
          "grocery_lists"
        ],
        "fieldCount": 4
      },
      {
        "name": "ingredients",
        "displayName": "Ingredients (catalog)",
        "family": "cooking",
        "aliases": [
          "ingredient",
          "ingredients"
        ],
        "fieldCount": 5
      },
      {
        "name": "kitchen_tools",
        "displayName": "Kitchen Tools",
        "family": "cooking",
        "aliases": [
          "kitchen_tool",
          "kitchen_tools"
        ],
        "fieldCount": 7
      },
      {
        "name": "meal_plan_entries",
        "displayName": "Meal Plan Entries",
        "family": "cooking",
        "aliases": [
          "meal_plan_entry",
          "meal_plan_entries"
        ],
        "fieldCount": 7
      },
      {
        "name": "meal_plans",
        "displayName": "Meal Plans",
        "family": "cooking",
        "aliases": [
          "meal_plan",
          "meal_plans"
        ],
        "fieldCount": 6
      },
      {
        "name": "pantry_items",
        "displayName": "Pantry Items",
        "family": "cooking",
        "aliases": [
          "pantry_item",
          "pantry_items"
        ],
        "fieldCount": 7
      },
      {
        "name": "recipe_collections",
        "displayName": "Recipe Collections",
        "family": "cooking",
        "aliases": [
          "recipe_collection",
          "recipe_collections"
        ],
        "fieldCount": 5
      },
      {
        "name": "recipe_ingredients",
        "displayName": "Recipe Ingredients",
        "family": "cooking",
        "aliases": [
          "recipe_ingredient",
          "recipe_ingredients"
        ],
        "fieldCount": 7
      },
      {
        "name": "recipe_steps",
        "displayName": "Recipe Steps",
        "family": "cooking",
        "aliases": [
          "recipe_step",
          "recipe_steps"
        ],
        "fieldCount": 5
      },
      {
        "name": "recipes",
        "displayName": "Recipes",
        "family": "cooking",
        "aliases": [
          "recipe",
          "recipes"
        ],
        "fieldCount": 13
      },
      {
        "name": "restaurant_visits",
        "displayName": "Restaurant Visits",
        "family": "cooking",
        "aliases": [
          "restaurant_visit",
          "restaurant_visits"
        ],
        "fieldCount": 7
      },
      {
        "name": "restaurants",
        "displayName": "Restaurants",
        "family": "cooking",
        "aliases": [
          "restaurant",
          "restaurants"
        ],
        "fieldCount": 11
      },
      {
        "name": "tasting_notes",
        "displayName": "Tasting Notes",
        "family": "cooking",
        "aliases": [
          "tasting_note",
          "tasting_notes"
        ],
        "fieldCount": 8
      },
      {
        "name": "wine_pairings",
        "displayName": "Wine Pairings",
        "family": "cooking",
        "aliases": [
          "wine_pairing",
          "wine_pairings"
        ],
        "fieldCount": 8
      }
    ]
  },
  {
    "name": "identity",
    "displayName": "Identity & Permissions",
    "description": "Actors, teams, roles, SSO, audit log and authentication primitives.",
    "collectionCount": 15,
    "collections": [
      {
        "name": "actors",
        "displayName": "Actors",
        "family": "identity",
        "aliases": [
          "actor",
          "actors"
        ],
        "fieldCount": 11
      },
      {
        "name": "external_users",
        "displayName": "External Users",
        "family": "identity",
        "aliases": [
          "external_user",
          "external_users"
        ],
        "fieldCount": 13
      },
      {
        "name": "auth_identity_providers",
        "displayName": "Auth Identity Providers",
        "family": "identity",
        "aliases": [
          "idp",
          "auth_identity_provider",
          "auth_identity_providers"
        ],
        "fieldCount": 16
      },
      {
        "name": "scim_provisioning_state",
        "displayName": "SCIM Provisioning State",
        "family": "identity",
        "aliases": [
          "scim",
          "scim_state",
          "scim_provisioning_state"
        ],
        "fieldCount": 11
      },
      {
        "name": "api_keys",
        "displayName": "API Keys",
        "family": "identity",
        "aliases": [
          "apikey",
          "apikeys",
          "api_key",
          "api_keys"
        ],
        "fieldCount": 11
      },
      {
        "name": "oauth_apps",
        "displayName": "OAuth Apps",
        "family": "identity",
        "aliases": [
          "oauth_app",
          "oauth_apps",
          "app",
          "apps"
        ],
        "fieldCount": 14
      },
      {
        "name": "oauth_app_approvals",
        "displayName": "OAuth App Approvals",
        "family": "identity",
        "aliases": [
          "oauth_app_approval",
          "oauth_app_approvals"
        ],
        "fieldCount": 9
      },
      {
        "name": "magic_auth_tokens",
        "displayName": "Magic Auth Tokens",
        "family": "identity",
        "aliases": [
          "magic_link",
          "magic_auth_token",
          "magic_auth_tokens"
        ],
        "fieldCount": 11
      },
      {
        "name": "organization_invites",
        "displayName": "Organization Invites",
        "family": "identity",
        "aliases": [
          "invite",
          "invites",
          "organization_invite",
          "organization_invites"
        ],
        "fieldCount": 12
      },
      {
        "name": "roles",
        "displayName": "Roles",
        "family": "identity",
        "aliases": [
          "role",
          "roles"
        ],
        "fieldCount": 10
      },
      {
        "name": "project_roles",
        "displayName": "Project Roles",
        "family": "identity",
        "aliases": [
          "project_role",
          "project_roles"
        ],
        "fieldCount": 9
      },
      {
        "name": "role_assignments",
        "displayName": "Role Assignments",
        "family": "identity",
        "aliases": [
          "role_assignment",
          "role_assignments"
        ],
        "fieldCount": 11
      },
      {
        "name": "audit_log",
        "displayName": "Audit Log",
        "family": "identity",
        "aliases": [
          "audit",
          "audit_log"
        ],
        "fieldCount": 13
      },
      {
        "name": "teams",
        "displayName": "Teams",
        "family": "identity",
        "aliases": [
          "team",
          "teams"
        ],
        "fieldCount": 17
      },
      {
        "name": "team_memberships",
        "displayName": "Team Memberships",
        "family": "identity",
        "aliases": [
          "team_member",
          "team_membership",
          "team_memberships"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "work",
    "displayName": "Work Tracking",
    "description": "Configurable workflow states, typed issue relations, labels, components and product versions.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "workflow_states",
        "displayName": "Workflow States",
        "family": "work",
        "aliases": [
          "state",
          "states",
          "workflow_state",
          "workflow_states"
        ],
        "fieldCount": 11
      },
      {
        "name": "entity_relations",
        "displayName": "Entity Relations",
        "family": "work",
        "aliases": [
          "relation",
          "relations",
          "entity_relation",
          "entity_relations",
          "universal_relation",
          "universal_relations"
        ],
        "fieldCount": 10
      },
      {
        "name": "labels",
        "displayName": "Labels",
        "family": "work",
        "aliases": [
          "label",
          "labels"
        ],
        "fieldCount": 13
      },
      {
        "name": "entity_labels",
        "displayName": "Entity Labels",
        "family": "work",
        "aliases": [
          "entity_label",
          "entity_labels"
        ],
        "fieldCount": 7
      },
      {
        "name": "components",
        "displayName": "Components",
        "family": "work",
        "aliases": [
          "component",
          "components"
        ],
        "fieldCount": 10
      },
      {
        "name": "entity_components",
        "displayName": "Entity Components",
        "family": "work",
        "aliases": [
          "entity_component",
          "entity_components"
        ],
        "fieldCount": 7
      },
      {
        "name": "versions",
        "displayName": "Versions",
        "family": "work",
        "aliases": [
          "version",
          "versions"
        ],
        "fieldCount": 11
      },
      {
        "name": "issue_affects_versions",
        "displayName": "Issue Affects Versions",
        "family": "work",
        "aliases": [
          "issue_affects_version",
          "issue_affects_versions"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "collaboration",
    "displayName": "Collaboration",
    "description": "Reactions, hierarchical documents, blocks, access restrictions and share invitations.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "reactions",
        "displayName": "Reactions",
        "family": "collaboration",
        "aliases": [
          "reaction",
          "reactions"
        ],
        "fieldCount": 8
      },
      {
        "name": "documents",
        "displayName": "Documents",
        "family": "collaboration",
        "aliases": [
          "doc",
          "docs",
          "document",
          "documents"
        ],
        "fieldCount": 17
      },
      {
        "name": "document_blocks",
        "displayName": "Document Blocks",
        "family": "collaboration",
        "aliases": [
          "block",
          "blocks",
          "document_block",
          "document_blocks"
        ],
        "fieldCount": 9
      },
      {
        "name": "document_properties",
        "displayName": "Document Properties",
        "family": "collaboration",
        "aliases": [
          "doc_property",
          "doc_properties",
          "document_property",
          "document_properties"
        ],
        "fieldCount": 7
      },
      {
        "name": "restrictions",
        "displayName": "Restrictions",
        "family": "collaboration",
        "aliases": [
          "restriction",
          "restrictions"
        ],
        "fieldCount": 10
      },
      {
        "name": "share_invitations",
        "displayName": "Share Invitations",
        "family": "collaboration",
        "aliases": [
          "share",
          "shares",
          "share_invitation",
          "share_invitations"
        ],
        "fieldCount": 13
      },
      {
        "name": "mentions",
        "displayName": "Mentions",
        "family": "collaboration",
        "aliases": [
          "mention",
          "mentions"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "customer_intake",
    "displayName": "Customer Intake & Triage",
    "description": "Customers, customer requests linked to issues, tiers, triage rotations and intake channels.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "customer_tiers",
        "displayName": "Customer Tiers",
        "family": "customer_intake",
        "aliases": [
          "tier",
          "tiers",
          "customer_tier",
          "customer_tiers"
        ],
        "fieldCount": 8
      },
      {
        "name": "customers",
        "displayName": "Customers",
        "family": "customer_intake",
        "aliases": [
          "customer",
          "customers"
        ],
        "fieldCount": 18
      },
      {
        "name": "customer_requests",
        "displayName": "Customer Requests",
        "family": "customer_intake",
        "aliases": [
          "need",
          "needs",
          "customer_request",
          "customer_requests",
          "customer_need",
          "customer_needs"
        ],
        "fieldCount": 16
      },
      {
        "name": "triage_responsibilities",
        "displayName": "Triage Responsibilities",
        "family": "customer_intake",
        "aliases": [
          "triage",
          "triage_responsibility",
          "triage_responsibilities"
        ],
        "fieldCount": 9
      },
      {
        "name": "intake_addresses",
        "displayName": "Intake Addresses",
        "family": "customer_intake",
        "aliases": [
          "intake",
          "intakes",
          "intake_address",
          "intake_addresses"
        ],
        "fieldCount": 10
      },
      {
        "name": "web_form_submissions",
        "displayName": "Web Form Submissions",
        "family": "customer_intake",
        "aliases": [
          "submission",
          "submissions",
          "web_form_submission",
          "web_form_submissions"
        ],
        "fieldCount": 11
      }
    ]
  },
  {
    "name": "flow",
    "displayName": "Flow Configuration",
    "description": "Favorites, automations, SLA policies and Git automation per team.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "favorites",
        "displayName": "Favorites",
        "family": "flow",
        "aliases": [
          "favorite",
          "favorites",
          "fav",
          "favs"
        ],
        "fieldCount": 12
      },
      {
        "name": "automations",
        "displayName": "Automations",
        "family": "flow",
        "aliases": [
          "automation",
          "automations"
        ],
        "fieldCount": 15
      },
      {
        "name": "automation_recipes",
        "displayName": "Automation Recipes",
        "family": "flow",
        "aliases": [
          "automation_recipe",
          "automation_recipes"
        ],
        "fieldCount": 13
      },
      {
        "name": "sla_policies",
        "displayName": "SLA Policies",
        "family": "flow",
        "aliases": [
          "sla",
          "slas",
          "sla_policy",
          "sla_policies"
        ],
        "fieldCount": 13
      },
      {
        "name": "issue_sla_state",
        "displayName": "Issue SLA State",
        "family": "flow",
        "aliases": [
          "issue_sla",
          "issue_sla_state"
        ],
        "fieldCount": 12
      },
      {
        "name": "git_automation_states",
        "displayName": "Git Automation States",
        "family": "flow",
        "aliases": [
          "git_automation",
          "git_automation_state",
          "git_automation_states"
        ],
        "fieldCount": 11
      }
    ]
  },
  {
    "name": "audit",
    "displayName": "Audit & Project Health",
    "description": "Project & initiative health updates, pulses and multi-parent initiative graph.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "pulse_updates",
        "displayName": "Pulse Updates",
        "family": "audit",
        "aliases": [
          "pulse",
          "pulses",
          "pulse_update",
          "pulse_updates"
        ],
        "fieldCount": 12
      },
      {
        "name": "project_updates",
        "displayName": "Project Updates",
        "family": "audit",
        "aliases": [
          "project_update",
          "project_updates"
        ],
        "fieldCount": 11
      },
      {
        "name": "initiative_updates",
        "displayName": "Initiative Updates",
        "family": "audit",
        "aliases": [
          "initiative_update",
          "initiative_updates"
        ],
        "fieldCount": 11
      },
      {
        "name": "initiative_parents",
        "displayName": "Initiative Parents (multi)",
        "family": "audit",
        "aliases": [
          "initiative_parent",
          "initiative_parents"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "integrations",
    "displayName": "Integrations & Webhooks",
    "description": "Integration registry, outbound webhooks, external entity sync and source-control links.",
    "collectionCount": 9,
    "collections": [
      {
        "name": "integrations",
        "displayName": "Integrations",
        "family": "integrations",
        "aliases": [
          "integration",
          "integrations"
        ],
        "fieldCount": 13
      },
      {
        "name": "webhooks_outbound",
        "displayName": "Outbound Webhooks",
        "family": "integrations",
        "aliases": [
          "webhook",
          "webhooks",
          "webhooks_outbound",
          "outbound_webhook"
        ],
        "fieldCount": 15
      },
      {
        "name": "webhook_deliveries",
        "displayName": "Webhook Deliveries",
        "family": "integrations",
        "aliases": [
          "delivery",
          "deliveries",
          "webhook_delivery",
          "webhook_deliveries"
        ],
        "fieldCount": 12
      },
      {
        "name": "synced_external_entities",
        "displayName": "Synced External Entities",
        "family": "integrations",
        "aliases": [
          "synced",
          "synced_external_entity",
          "synced_external_entities"
        ],
        "fieldCount": 14
      },
      {
        "name": "external_threads",
        "displayName": "External Threads",
        "family": "integrations",
        "aliases": [
          "external_thread",
          "external_threads"
        ],
        "fieldCount": 12
      },
      {
        "name": "pull_requests",
        "displayName": "Pull Requests",
        "family": "integrations",
        "aliases": [
          "pr",
          "prs",
          "pull_request",
          "pull_requests"
        ],
        "fieldCount": 19
      },
      {
        "name": "pull_request_issues",
        "displayName": "PR ↔ Issues",
        "family": "integrations",
        "aliases": [
          "pr_issue",
          "pr_issues",
          "pull_request_issue",
          "pull_request_issues"
        ],
        "fieldCount": 6
      },
      {
        "name": "commits",
        "displayName": "Commits",
        "family": "integrations",
        "aliases": [
          "commit",
          "commits"
        ],
        "fieldCount": 11
      },
      {
        "name": "branches",
        "displayName": "Branches",
        "family": "integrations",
        "aliases": [
          "branch",
          "branches"
        ],
        "fieldCount": 8
      }
    ]
  },
  {
    "name": "billing",
    "displayName": "Billing & Subscriptions",
    "description": "Customers, products, prices, subscriptions, invoices, charges, coupons, payouts and MRR cohorts.",
    "collectionCount": 21,
    "collections": [
      {
        "name": "billing_customers",
        "displayName": "Billing Customers",
        "family": "billing",
        "aliases": [
          "billing_customer",
          "billing_customers",
          "buyer",
          "buyers"
        ],
        "fieldCount": 16
      },
      {
        "name": "products_catalog",
        "displayName": "Products Catalog",
        "family": "billing",
        "aliases": [
          "product",
          "products",
          "products_catalog",
          "catalog_product"
        ],
        "fieldCount": 11
      },
      {
        "name": "prices",
        "displayName": "Prices",
        "family": "billing",
        "aliases": [
          "price",
          "prices"
        ],
        "fieldCount": 15
      },
      {
        "name": "pricing_tiers",
        "displayName": "Pricing Tiers",
        "family": "billing",
        "aliases": [
          "pricing_tier",
          "pricing_tiers",
          "plan",
          "plans"
        ],
        "fieldCount": 10
      },
      {
        "name": "subscriptions",
        "displayName": "Subscriptions",
        "family": "billing",
        "aliases": [
          "subscription",
          "subscriptions",
          "sub",
          "subs"
        ],
        "fieldCount": 16
      },
      {
        "name": "subscription_items",
        "displayName": "Subscription Items",
        "family": "billing",
        "aliases": [
          "subscription_item",
          "subscription_items"
        ],
        "fieldCount": 7
      },
      {
        "name": "invoices",
        "displayName": "Invoices",
        "family": "billing",
        "aliases": [
          "invoice",
          "invoices"
        ],
        "fieldCount": 21
      },
      {
        "name": "invoice_line_items",
        "displayName": "Invoice Line Items",
        "family": "billing",
        "aliases": [
          "invoice_line",
          "invoice_lines",
          "invoice_line_item",
          "invoice_line_items"
        ],
        "fieldCount": 12
      },
      {
        "name": "payment_intents",
        "displayName": "Payment Intents",
        "family": "billing",
        "aliases": [
          "payment_intent",
          "payment_intents",
          "intent",
          "intents"
        ],
        "fieldCount": 14
      },
      {
        "name": "charges",
        "displayName": "Charges",
        "family": "billing",
        "aliases": [
          "charge",
          "charges"
        ],
        "fieldCount": 15
      },
      {
        "name": "refunds",
        "displayName": "Refunds",
        "family": "billing",
        "aliases": [
          "refund",
          "refunds"
        ],
        "fieldCount": 10
      },
      {
        "name": "payment_methods",
        "displayName": "Payment Methods",
        "family": "billing",
        "aliases": [
          "payment_method",
          "payment_methods",
          "card",
          "cards"
        ],
        "fieldCount": 13
      },
      {
        "name": "coupons",
        "displayName": "Coupons",
        "family": "billing",
        "aliases": [
          "coupon",
          "coupons"
        ],
        "fieldCount": 15
      },
      {
        "name": "discounts_applied",
        "displayName": "Applied Discounts",
        "family": "billing",
        "aliases": [
          "discount",
          "discounts",
          "discount_applied",
          "discounts_applied"
        ],
        "fieldCount": 10
      },
      {
        "name": "usage_records",
        "displayName": "Usage Records",
        "family": "billing",
        "aliases": [
          "usage",
          "usage_record",
          "usage_records"
        ],
        "fieldCount": 8
      },
      {
        "name": "license_keys",
        "displayName": "License Keys",
        "family": "billing",
        "aliases": [
          "license",
          "licenses",
          "license_key",
          "license_keys"
        ],
        "fieldCount": 13
      },
      {
        "name": "balance_transactions",
        "displayName": "Balance Transactions",
        "family": "billing",
        "aliases": [
          "ledger",
          "balance_transaction",
          "balance_transactions"
        ],
        "fieldCount": 14
      },
      {
        "name": "payouts",
        "displayName": "Payouts",
        "family": "billing",
        "aliases": [
          "payout",
          "payouts"
        ],
        "fieldCount": 12
      },
      {
        "name": "disputes",
        "displayName": "Disputes",
        "family": "billing",
        "aliases": [
          "dispute",
          "disputes",
          "chargeback",
          "chargebacks"
        ],
        "fieldCount": 13
      },
      {
        "name": "mrr_cohorts",
        "displayName": "MRR Cohorts",
        "family": "billing",
        "aliases": [
          "mrr",
          "mrr_cohort",
          "mrr_cohorts"
        ],
        "fieldCount": 14
      },
      {
        "name": "churn_analyses",
        "displayName": "Churn Analyses",
        "family": "billing",
        "aliases": [
          "churn",
          "churn_analysis",
          "churn_analyses"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "crm",
    "displayName": "Sales & CRM",
    "description": "Contacts, accounts, leads, deals, pipelines, activities, meetings, quotes and contracts.",
    "collectionCount": 19,
    "collections": [
      {
        "name": "companies",
        "displayName": "Companies",
        "family": "crm",
        "aliases": [
          "company",
          "companies",
          "organization",
          "organizations",
          "org",
          "orgs"
        ],
        "fieldCount": 14
      },
      {
        "name": "accounts",
        "displayName": "Accounts (B2B)",
        "family": "crm",
        "aliases": [
          "account",
          "accounts"
        ],
        "fieldCount": 16
      },
      {
        "name": "contacts",
        "displayName": "Contacts",
        "family": "crm",
        "aliases": [
          "contact",
          "contacts"
        ],
        "fieldCount": 15
      },
      {
        "name": "leads",
        "displayName": "Leads",
        "family": "crm",
        "aliases": [
          "lead",
          "leads"
        ],
        "fieldCount": 18
      },
      {
        "name": "pipelines",
        "displayName": "Pipelines",
        "family": "crm",
        "aliases": [
          "pipeline",
          "pipelines"
        ],
        "fieldCount": 9
      },
      {
        "name": "pipeline_stages",
        "displayName": "Pipeline Stages",
        "family": "crm",
        "aliases": [
          "stage",
          "stages",
          "pipeline_stage",
          "pipeline_stages"
        ],
        "fieldCount": 9
      },
      {
        "name": "deals",
        "displayName": "Deals",
        "family": "crm",
        "aliases": [
          "deal",
          "deals",
          "opportunity",
          "opportunities"
        ],
        "fieldCount": 18
      },
      {
        "name": "deal_line_items",
        "displayName": "Deal Line Items",
        "family": "crm",
        "aliases": [
          "deal_line",
          "deal_lines",
          "deal_line_item",
          "deal_line_items"
        ],
        "fieldCount": 11
      },
      {
        "name": "activities",
        "displayName": "CRM Activities",
        "family": "crm",
        "aliases": [
          "activity",
          "activities"
        ],
        "fieldCount": 16
      },
      {
        "name": "meetings",
        "displayName": "Meetings",
        "family": "crm",
        "aliases": [
          "meeting",
          "meetings"
        ],
        "fieldCount": 15
      },
      {
        "name": "email_threads",
        "displayName": "Email Threads",
        "family": "crm",
        "aliases": [
          "email_thread",
          "email_threads"
        ],
        "fieldCount": 11
      },
      {
        "name": "email_messages",
        "displayName": "Email Messages",
        "family": "crm",
        "aliases": [
          "email_message",
          "email_messages",
          "email",
          "emails"
        ],
        "fieldCount": 16
      },
      {
        "name": "quotes",
        "displayName": "Quotes",
        "family": "crm",
        "aliases": [
          "quote",
          "quotes"
        ],
        "fieldCount": 15
      },
      {
        "name": "quote_line_items",
        "displayName": "Quote Line Items",
        "family": "crm",
        "aliases": [
          "quote_line",
          "quote_lines",
          "quote_line_item",
          "quote_line_items"
        ],
        "fieldCount": 11
      },
      {
        "name": "contracts",
        "displayName": "Contracts",
        "family": "crm",
        "aliases": [
          "contract",
          "contracts"
        ],
        "fieldCount": 16
      },
      {
        "name": "assets",
        "displayName": "Customer Assets",
        "family": "crm",
        "aliases": [
          "asset",
          "assets"
        ],
        "fieldCount": 12
      },
      {
        "name": "campaigns",
        "displayName": "Campaigns",
        "family": "crm",
        "aliases": [
          "campaign",
          "campaigns"
        ],
        "fieldCount": 12
      },
      {
        "name": "campaign_members",
        "displayName": "Campaign Members",
        "family": "crm",
        "aliases": [
          "campaign_member",
          "campaign_members"
        ],
        "fieldCount": 8
      },
      {
        "name": "associations",
        "displayName": "Associations Graph",
        "family": "crm",
        "aliases": [
          "association",
          "associations"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "legal",
    "displayName": "Legal",
    "description": "Matters, cases, evidence, filings, deadlines, and legal documents.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "legal_cases",
        "displayName": "Legal Cases",
        "family": "legal",
        "aliases": [
          "case",
          "cases",
          "legal_case",
          "legal_cases",
          "matter",
          "matters"
        ],
        "fieldCount": 15
      },
      {
        "name": "legal_clients",
        "displayName": "Legal Clients",
        "family": "legal",
        "aliases": [
          "legal-client",
          "legal-clients",
          "legal_client",
          "legal_clients"
        ],
        "fieldCount": 12
      },
      {
        "name": "case_evidence",
        "displayName": "Case Evidence",
        "family": "legal",
        "aliases": [
          "case_evidence",
          "evidence_item",
          "evidence_items"
        ],
        "fieldCount": 11
      }
    ]
  },
  {
    "name": "ops",
    "displayName": "Operations / ITSM",
    "description": "Operational services, incidents, evidence, ownership, dependencies, and timeline-ready records.",
    "collectionCount": 1,
    "collections": [
      {
        "name": "services",
        "displayName": "Services",
        "family": "ops",
        "aliases": [
          "service",
          "services",
          "itsm_service",
          "itsm_services"
        ],
        "fieldCount": 13
      }
    ]
  },
  {
    "name": "support",
    "displayName": "Customer Support",
    "description": "Conversations, tickets, mailboxes, knowledge base, macros and CSAT.",
    "collectionCount": 11,
    "collections": [
      {
        "name": "help_centers",
        "displayName": "Help Centers",
        "family": "support",
        "aliases": [
          "help_center",
          "help_centers",
          "kb",
          "knowledge_base"
        ],
        "fieldCount": 9
      },
      {
        "name": "mailboxes",
        "displayName": "Mailboxes",
        "family": "support",
        "aliases": [
          "mailbox",
          "mailboxes"
        ],
        "fieldCount": 11
      },
      {
        "name": "support_conversations",
        "displayName": "Support Conversations",
        "family": "support",
        "aliases": [
          "conversation",
          "conversations",
          "support_conversation",
          "support_conversations"
        ],
        "fieldCount": 18
      },
      {
        "name": "support_messages",
        "displayName": "Support Messages",
        "family": "support",
        "aliases": [
          "support_message",
          "support_messages"
        ],
        "fieldCount": 12
      },
      {
        "name": "support_tickets",
        "displayName": "Support Tickets",
        "family": "support",
        "aliases": [
          "ticket",
          "tickets",
          "support_ticket",
          "support_tickets"
        ],
        "fieldCount": 16
      },
      {
        "name": "support_tags",
        "displayName": "Support Tags",
        "family": "support",
        "aliases": [
          "support_tag",
          "support_tags"
        ],
        "fieldCount": 8
      },
      {
        "name": "support_custom_attributes",
        "displayName": "Support Custom Attributes",
        "family": "support",
        "aliases": [
          "support_attribute",
          "support_attributes",
          "support_custom_attribute",
          "support_custom_attributes"
        ],
        "fieldCount": 10
      },
      {
        "name": "satisfaction_ratings",
        "displayName": "Satisfaction Ratings",
        "family": "support",
        "aliases": [
          "csat",
          "nps",
          "satisfaction_rating",
          "satisfaction_ratings"
        ],
        "fieldCount": 12
      },
      {
        "name": "knowledge_articles",
        "displayName": "Knowledge Articles",
        "family": "support",
        "aliases": [
          "article",
          "articles",
          "knowledge_article",
          "knowledge_articles"
        ],
        "fieldCount": 17
      },
      {
        "name": "support_macros",
        "displayName": "Support Macros",
        "family": "support",
        "aliases": [
          "macro",
          "macros",
          "support_macro",
          "support_macros"
        ],
        "fieldCount": 10
      },
      {
        "name": "side_conversations",
        "displayName": "Side Conversations",
        "family": "support",
        "aliases": [
          "side_conversation",
          "side_conversations"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "analytics",
    "displayName": "Product Analytics",
    "description": "Events, persons, cohorts, funnels, retention, feature flags, experiments, surveys and dashboards.",
    "collectionCount": 19,
    "collections": [
      {
        "name": "analytics_events",
        "displayName": "Analytics Events",
        "family": "analytics",
        "aliases": [
          "analytics_event",
          "analytics_events"
        ],
        "fieldCount": 14
      },
      {
        "name": "analytics_persons",
        "displayName": "Analytics Persons",
        "family": "analytics",
        "aliases": [
          "analytics_person",
          "analytics_persons"
        ],
        "fieldCount": 12
      },
      {
        "name": "analytics_groups",
        "displayName": "Analytics Groups",
        "family": "analytics",
        "aliases": [
          "analytics_group",
          "analytics_groups"
        ],
        "fieldCount": 8
      },
      {
        "name": "cohorts",
        "displayName": "Cohorts",
        "family": "analytics",
        "aliases": [
          "cohort",
          "cohorts"
        ],
        "fieldCount": 11
      },
      {
        "name": "cohort_memberships",
        "displayName": "Cohort Memberships",
        "family": "analytics",
        "aliases": [
          "cohort_membership",
          "cohort_memberships"
        ],
        "fieldCount": 7
      },
      {
        "name": "funnels",
        "displayName": "Funnels",
        "family": "analytics",
        "aliases": [
          "funnel",
          "funnels"
        ],
        "fieldCount": 10
      },
      {
        "name": "funnel_runs",
        "displayName": "Funnel Runs",
        "family": "analytics",
        "aliases": [
          "funnel_run",
          "funnel_runs"
        ],
        "fieldCount": 10
      },
      {
        "name": "retention_analyses",
        "displayName": "Retention Analyses",
        "family": "analytics",
        "aliases": [
          "retention",
          "retention_analysis",
          "retention_analyses"
        ],
        "fieldCount": 12
      },
      {
        "name": "feature_flags",
        "displayName": "Feature Flags",
        "family": "analytics",
        "aliases": [
          "flag",
          "flags",
          "feature_flag",
          "feature_flags"
        ],
        "fieldCount": 13
      },
      {
        "name": "feature_flag_evaluations",
        "displayName": "Feature Flag Evaluations",
        "family": "analytics",
        "aliases": [
          "flag_eval",
          "flag_evals",
          "feature_flag_evaluation",
          "feature_flag_evaluations"
        ],
        "fieldCount": 8
      },
      {
        "name": "experiments",
        "displayName": "Experiments",
        "family": "analytics",
        "aliases": [
          "experiment",
          "experiments",
          "ab_test"
        ],
        "fieldCount": 15
      },
      {
        "name": "experiment_metrics",
        "displayName": "Experiment Metrics",
        "family": "analytics",
        "aliases": [
          "experiment_metric",
          "experiment_metrics"
        ],
        "fieldCount": 11
      },
      {
        "name": "segments",
        "displayName": "Segments",
        "family": "analytics",
        "aliases": [
          "segment",
          "segments"
        ],
        "fieldCount": 9
      },
      {
        "name": "holdouts",
        "displayName": "Holdouts",
        "family": "analytics",
        "aliases": [
          "holdout",
          "holdouts"
        ],
        "fieldCount": 10
      },
      {
        "name": "surveys",
        "displayName": "Surveys",
        "family": "analytics",
        "aliases": [
          "survey",
          "surveys"
        ],
        "fieldCount": 10
      },
      {
        "name": "survey_responses",
        "displayName": "Survey Responses",
        "family": "analytics",
        "aliases": [
          "survey_response",
          "survey_responses"
        ],
        "fieldCount": 8
      },
      {
        "name": "session_recordings",
        "displayName": "Session Recordings",
        "family": "analytics",
        "aliases": [
          "recording",
          "recordings",
          "session_recording",
          "session_recordings"
        ],
        "fieldCount": 13
      },
      {
        "name": "dashboards",
        "displayName": "Dashboards",
        "family": "analytics",
        "aliases": [
          "dashboard",
          "dashboards"
        ],
        "fieldCount": 15
      },
      {
        "name": "insight_definitions",
        "displayName": "Insight Definitions",
        "family": "analytics",
        "aliases": [
          "insight",
          "insights",
          "insight_definition",
          "insight_definitions"
        ],
        "fieldCount": 10
      }
    ]
  },
  {
    "name": "observability",
    "displayName": "Observability",
    "description": "Error issues, traces, alerts, monitors, SLOs, replays and code owners.",
    "collectionCount": 10,
    "collections": [
      {
        "name": "error_issues",
        "displayName": "Error Issues",
        "family": "observability",
        "aliases": [
          "error",
          "errors",
          "error_issue",
          "error_issues"
        ],
        "fieldCount": 17
      },
      {
        "name": "error_events",
        "displayName": "Error Events",
        "family": "observability",
        "aliases": [
          "error_event",
          "error_events"
        ],
        "fieldCount": 13
      },
      {
        "name": "alert_rules",
        "displayName": "Alert Rules",
        "family": "observability",
        "aliases": [
          "alert",
          "alerts",
          "alert_rule",
          "alert_rules"
        ],
        "fieldCount": 12
      },
      {
        "name": "monitors",
        "displayName": "Monitors",
        "family": "observability",
        "aliases": [
          "monitor",
          "monitors"
        ],
        "fieldCount": 12
      },
      {
        "name": "slos",
        "displayName": "SLOs",
        "family": "observability",
        "aliases": [
          "slo",
          "slos"
        ],
        "fieldCount": 13
      },
      {
        "name": "slo_calculations",
        "displayName": "SLO Calculations",
        "family": "observability",
        "aliases": [
          "slo_calculation",
          "slo_calculations"
        ],
        "fieldCount": 11
      },
      {
        "name": "suspect_commits",
        "displayName": "Suspect Commits",
        "family": "observability",
        "aliases": [
          "suspect_commit",
          "suspect_commits"
        ],
        "fieldCount": 8
      },
      {
        "name": "replays",
        "displayName": "Replays",
        "family": "observability",
        "aliases": [
          "replay",
          "replays"
        ],
        "fieldCount": 11
      },
      {
        "name": "spans",
        "displayName": "Spans (Distributed Tracing)",
        "family": "observability",
        "aliases": [
          "span",
          "spans",
          "trace",
          "traces"
        ],
        "fieldCount": 15
      },
      {
        "name": "code_owners",
        "displayName": "Code Owners",
        "family": "observability",
        "aliases": [
          "code_owner",
          "code_owners",
          "codeowner",
          "codeowners"
        ],
        "fieldCount": 8
      }
    ]
  },
  {
    "name": "infra",
    "displayName": "Deployment & Infrastructure",
    "description": "Repositories, environments, deployments, domains, secrets, CI runs and release pipelines.",
    "collectionCount": 10,
    "collections": [
      {
        "name": "repositories",
        "displayName": "Repositories",
        "family": "infra",
        "aliases": [
          "repo",
          "repos",
          "repository",
          "repositories"
        ],
        "fieldCount": 13
      },
      {
        "name": "infra_environments",
        "displayName": "Infra Environments",
        "family": "infra",
        "aliases": [
          "env",
          "envs",
          "environment",
          "environments",
          "infra_environment",
          "infra_environments"
        ],
        "fieldCount": 9
      },
      {
        "name": "deployments",
        "displayName": "Deployments",
        "family": "infra",
        "aliases": [
          "deploy",
          "deploys",
          "deployment",
          "deployments"
        ],
        "fieldCount": 15
      },
      {
        "name": "infra_domains",
        "displayName": "Infra Domains",
        "family": "infra",
        "aliases": [
          "domain",
          "domains",
          "infra_domain",
          "infra_domains"
        ],
        "fieldCount": 10
      },
      {
        "name": "infra_secrets",
        "displayName": "Infra Secrets / Env Vars",
        "family": "infra",
        "aliases": [
          "secret",
          "secrets",
          "infra_secret",
          "infra_secrets",
          "env_var"
        ],
        "fieldCount": 10
      },
      {
        "name": "action_runs",
        "displayName": "CI/CD Action Runs",
        "family": "infra",
        "aliases": [
          "ci",
          "ci_run",
          "action_run",
          "action_runs"
        ],
        "fieldCount": 19
      },
      {
        "name": "redirects",
        "displayName": "Redirects",
        "family": "infra",
        "aliases": [
          "redirect",
          "redirects"
        ],
        "fieldCount": 9
      },
      {
        "name": "release_pipelines",
        "displayName": "Release Pipelines",
        "family": "infra",
        "aliases": [
          "release_pipeline",
          "release_pipelines"
        ],
        "fieldCount": 9
      },
      {
        "name": "release_stages",
        "displayName": "Release Stages",
        "family": "infra",
        "aliases": [
          "release_stage",
          "release_stages"
        ],
        "fieldCount": 9
      },
      {
        "name": "release_runs",
        "displayName": "Release Runs",
        "family": "infra",
        "aliases": [
          "release_run",
          "release_runs"
        ],
        "fieldCount": 10
      }
    ]
  },
  {
    "name": "marketing",
    "displayName": "Marketing & Content",
    "description": "Newsletters, subscribers, drip sequences, campaigns, forms, submissions and referrals.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "newsletters",
        "displayName": "Newsletters",
        "family": "marketing",
        "aliases": [
          "newsletter",
          "newsletters"
        ],
        "fieldCount": 11
      },
      {
        "name": "newsletter_subscribers",
        "displayName": "Newsletter Subscribers",
        "family": "marketing",
        "aliases": [
          "subscriber",
          "subscribers",
          "newsletter_subscriber",
          "newsletter_subscribers"
        ],
        "fieldCount": 12
      },
      {
        "name": "newsletter_posts",
        "displayName": "Newsletter Posts",
        "family": "marketing",
        "aliases": [
          "newsletter_post",
          "newsletter_posts"
        ],
        "fieldCount": 16
      },
      {
        "name": "email_sequences",
        "displayName": "Email Sequences",
        "family": "marketing",
        "aliases": [
          "sequence",
          "sequences",
          "email_sequence",
          "email_sequences",
          "drip"
        ],
        "fieldCount": 10
      },
      {
        "name": "email_campaigns",
        "displayName": "Email Campaigns",
        "family": "marketing",
        "aliases": [
          "email_campaign",
          "email_campaigns",
          "broadcast",
          "broadcasts"
        ],
        "fieldCount": 14
      },
      {
        "name": "forms",
        "displayName": "Forms",
        "family": "marketing",
        "aliases": [
          "form",
          "forms"
        ],
        "fieldCount": 11
      },
      {
        "name": "form_submissions",
        "displayName": "Form Submissions",
        "family": "marketing",
        "aliases": [
          "form_submission",
          "form_submissions"
        ],
        "fieldCount": 13
      },
      {
        "name": "referrals",
        "displayName": "Referrals",
        "family": "marketing",
        "aliases": [
          "referral",
          "referrals"
        ],
        "fieldCount": 12
      }
    ]
  },
  {
    "name": "content",
    "displayName": "Content / CMS",
    "description": "CMS brands, destinations, campaigns, entries, revisions, variants, approvals, publications, evidence, and gaps.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "content_brands",
        "displayName": "Content Brands",
        "family": "content",
        "aliases": [
          "content-brand",
          "content-brands",
          "content_brand",
          "content_brands",
          "brand-profile",
          "brand-profiles"
        ],
        "fieldCount": 12
      },
      {
        "name": "content_destinations",
        "displayName": "Content Destinations",
        "family": "content",
        "aliases": [
          "content-destination",
          "content-destinations",
          "content_destination",
          "content_destinations",
          "publishing-destination",
          "publishing-destinations"
        ],
        "fieldCount": 14
      },
      {
        "name": "content_campaigns",
        "displayName": "Content Campaigns",
        "family": "content",
        "aliases": [
          "content-campaign",
          "content-campaigns",
          "content_campaign",
          "content_campaigns",
          "editorial-campaign",
          "editorial-campaigns"
        ],
        "fieldCount": 12
      },
      {
        "name": "content_entries",
        "displayName": "Content Entries",
        "family": "content",
        "aliases": [
          "content-entry",
          "content-entries",
          "content_entry",
          "content_entries",
          "cms-entry",
          "cms-entries"
        ],
        "fieldCount": 17
      },
      {
        "name": "content_revisions",
        "displayName": "Content Revisions",
        "family": "content",
        "aliases": [
          "content-revision",
          "content-revisions",
          "content_revision",
          "content_revisions",
          "entry-revision",
          "entry-revisions"
        ],
        "fieldCount": 11
      },
      {
        "name": "content_variants",
        "displayName": "Content Variants",
        "family": "content",
        "aliases": [
          "content-variant",
          "content-variants",
          "content_variant",
          "content_variants",
          "entry-variant",
          "entry-variants"
        ],
        "fieldCount": 13
      },
      {
        "name": "content_approvals",
        "displayName": "Content Approvals",
        "family": "content",
        "aliases": [
          "content-approval",
          "content-approvals",
          "content_approval",
          "content_approvals",
          "entry-approval",
          "entry-approvals"
        ],
        "fieldCount": 13
      },
      {
        "name": "content_publications",
        "displayName": "Content Publications",
        "family": "content",
        "aliases": [
          "content-publication",
          "content-publications",
          "content_publication",
          "content_publications",
          "publication-plan",
          "publication-plans"
        ],
        "fieldCount": 15
      }
    ]
  },
  {
    "name": "agents",
    "displayName": "Agent Infrastructure",
    "description": "Canonical Agents V1 definitions, assignments, grants, execution profiles, runs, sessions, skills, evaluations, incidents, policy gates and persistent memory.",
    "collectionCount": 27,
    "collections": [
      {
        "name": "agents",
        "displayName": "Agents",
        "family": "agents",
        "aliases": [
          "agent",
          "agents"
        ],
        "fieldCount": 31
      },
      {
        "name": "agent_assignments",
        "displayName": "Agent Assignments",
        "family": "agents",
        "aliases": [
          "agent_assignment",
          "agent_assignments"
        ],
        "fieldCount": 19
      },
      {
        "name": "agent_execution_profiles",
        "displayName": "Agent Execution Profiles",
        "family": "agents",
        "aliases": [
          "agent_execution_profile",
          "agent_execution_profiles",
          "execution_profile"
        ],
        "fieldCount": 14
      },
      {
        "name": "agent_resource_grants",
        "displayName": "Agent Resource Grants",
        "family": "agents",
        "aliases": [
          "agent_resource_grant",
          "agent_resource_grants",
          "resource_grant"
        ],
        "fieldCount": 17
      },
      {
        "name": "agent_memory_policies",
        "displayName": "Agent Memory Policies",
        "family": "agents",
        "aliases": [
          "agent_memory_policy",
          "agent_memory_policies",
          "memory_policy"
        ],
        "fieldCount": 12
      },
      {
        "name": "agent_budgets",
        "displayName": "Agent Budgets",
        "family": "agents",
        "aliases": [
          "agent_budget",
          "agent_budgets"
        ],
        "fieldCount": 12
      },
      {
        "name": "agent_config_revisions",
        "displayName": "Agent Config Revisions",
        "family": "agents",
        "aliases": [
          "agent_config_revision",
          "agent_config_revisions",
          "config_revision"
        ],
        "fieldCount": 9
      },
      {
        "name": "agent_evaluations",
        "displayName": "Agent Evaluations",
        "family": "agents",
        "aliases": [
          "agent_evaluation",
          "agent_evaluations"
        ],
        "fieldCount": 11
      },
      {
        "name": "agent_incidents",
        "displayName": "Agent Incidents",
        "family": "agents",
        "aliases": [
          "agent_incident",
          "agent_incidents"
        ],
        "fieldCount": 18
      },
      {
        "name": "agent_blueprints",
        "displayName": "Agent Blueprints",
        "family": "agents",
        "aliases": [
          "agent_blueprint",
          "agent_blueprints",
          "agent_template"
        ],
        "fieldCount": 12
      },
      {
        "name": "agent_runs",
        "displayName": "Agent Runs",
        "family": "agents",
        "aliases": [
          "agent_run",
          "agent_runs",
          "run"
        ],
        "fieldCount": 15
      },
      {
        "name": "agent_sessions",
        "displayName": "Agent Sessions",
        "family": "agents",
        "aliases": [
          "session",
          "sessions",
          "agent_session",
          "agent_sessions"
        ],
        "fieldCount": 24
      },
      {
        "name": "agent_session_activities",
        "displayName": "Agent Session Activities",
        "family": "agents",
        "aliases": [
          "agent_activity",
          "agent_activities",
          "agent_session_activity",
          "agent_session_activities"
        ],
        "fieldCount": 9
      },
      {
        "name": "agent_session_pull_requests",
        "displayName": "Agent Session ↔ Pull Requests",
        "family": "agents",
        "aliases": [
          "agent_session_pr",
          "agent_session_pull_request",
          "agent_session_pull_requests"
        ],
        "fieldCount": 6
      },
      {
        "name": "run_costs",
        "displayName": "Run Costs",
        "family": "agents",
        "aliases": [
          "run_cost",
          "run_costs"
        ],
        "fieldCount": 14
      },
      {
        "name": "tool_invocations",
        "displayName": "Tool Invocations",
        "family": "agents",
        "aliases": [
          "tool_call",
          "tool_calls",
          "tool_invocation",
          "tool_invocations"
        ],
        "fieldCount": 14
      },
      {
        "name": "agent_skills",
        "displayName": "Agent Skills",
        "family": "agents",
        "aliases": [
          "skill",
          "skills",
          "agent_skill",
          "agent_skills"
        ],
        "fieldCount": 16
      },
      {
        "name": "evaluations",
        "displayName": "Evaluations",
        "family": "agents",
        "aliases": [
          "eval",
          "evals",
          "evaluation",
          "evaluations"
        ],
        "fieldCount": 13
      },
      {
        "name": "eval_datasets",
        "displayName": "Eval Datasets",
        "family": "agents",
        "aliases": [
          "eval_dataset",
          "eval_datasets",
          "dataset",
          "datasets"
        ],
        "fieldCount": 10
      },
      {
        "name": "eval_test_cases",
        "displayName": "Eval Test Cases",
        "family": "agents",
        "aliases": [
          "test_case",
          "test_cases",
          "eval_test_case",
          "eval_test_cases"
        ],
        "fieldCount": 7
      },
      {
        "name": "feedback_loops",
        "displayName": "Feedback Loops",
        "family": "agents",
        "aliases": [
          "feedback_loop",
          "feedback_loops"
        ],
        "fieldCount": 13
      },
      {
        "name": "policy_gates",
        "displayName": "Policy Gates",
        "family": "agents",
        "aliases": [
          "policy",
          "policies",
          "policy_gate",
          "policy_gates"
        ],
        "fieldCount": 12
      },
      {
        "name": "memory_blocks",
        "displayName": "Memory Blocks",
        "family": "agents",
        "aliases": [
          "memory",
          "memories",
          "memory_block",
          "memory_blocks"
        ],
        "fieldCount": 13
      },
      {
        "name": "memory_indices",
        "displayName": "Memory Indices",
        "family": "agents",
        "aliases": [
          "memory_index",
          "memory_indices"
        ],
        "fieldCount": 9
      },
      {
        "name": "knowledge_graphs",
        "displayName": "Knowledge Graphs",
        "family": "agents",
        "aliases": [
          "kg",
          "knowledge_graph",
          "knowledge_graphs"
        ],
        "fieldCount": 11
      },
      {
        "name": "knowledge_graph_relations",
        "displayName": "Knowledge Graph Relations",
        "family": "agents",
        "aliases": [
          "kg_relation",
          "knowledge_graph_relation",
          "knowledge_graph_relations"
        ],
        "fieldCount": 10
      },
      {
        "name": "coding_sandboxes",
        "displayName": "Coding Sandboxes",
        "family": "agents",
        "aliases": [
          "sandbox",
          "sandboxes",
          "coding_sandbox",
          "coding_sandboxes"
        ],
        "fieldCount": 15
      }
    ]
  },
  {
    "name": "hr",
    "displayName": "HR & People Ops",
    "description": "Employees, contractors, payroll, time off, performance reviews, OKRs and recognition.",
    "collectionCount": 13,
    "collections": [
      {
        "name": "departments",
        "displayName": "Departments",
        "family": "hr",
        "aliases": [
          "department",
          "departments"
        ],
        "fieldCount": 9
      },
      {
        "name": "employees",
        "displayName": "Employees",
        "family": "hr",
        "aliases": [
          "employee",
          "employees"
        ],
        "fieldCount": 22
      },
      {
        "name": "contractors",
        "displayName": "Contractors",
        "family": "hr",
        "aliases": [
          "contractor",
          "contractors"
        ],
        "fieldCount": 17
      },
      {
        "name": "payroll_runs",
        "displayName": "Payroll Runs",
        "family": "hr",
        "aliases": [
          "payroll",
          "payrolls",
          "payroll_run",
          "payroll_runs"
        ],
        "fieldCount": 12
      },
      {
        "name": "pay_stubs",
        "displayName": "Pay Stubs",
        "family": "hr",
        "aliases": [
          "pay_stub",
          "pay_stubs",
          "paystub",
          "paystubs"
        ],
        "fieldCount": 12
      },
      {
        "name": "time_off_requests",
        "displayName": "Time Off Requests",
        "family": "hr",
        "aliases": [
          "pto",
          "time_off",
          "time_off_request",
          "time_off_requests"
        ],
        "fieldCount": 13
      },
      {
        "name": "benefits_enrollments",
        "displayName": "Benefits Enrollments",
        "family": "hr",
        "aliases": [
          "benefit",
          "benefits",
          "benefits_enrollment",
          "benefits_enrollments"
        ],
        "fieldCount": 10
      },
      {
        "name": "performance_reviews",
        "displayName": "Performance Reviews",
        "family": "hr",
        "aliases": [
          "review",
          "reviews",
          "performance_review",
          "performance_reviews"
        ],
        "fieldCount": 12
      },
      {
        "name": "one_on_ones",
        "displayName": "1-on-1s",
        "family": "hr",
        "aliases": [
          "1on1",
          "one_on_one",
          "one_on_ones"
        ],
        "fieldCount": 10
      },
      {
        "name": "praise",
        "displayName": "Praise / Recognition",
        "family": "hr",
        "aliases": [
          "kudos",
          "praise"
        ],
        "fieldCount": 10
      },
      {
        "name": "engagement_surveys",
        "displayName": "Engagement Surveys",
        "family": "hr",
        "aliases": [
          "engagement_survey",
          "engagement_surveys"
        ],
        "fieldCount": 11
      },
      {
        "name": "engagement_responses",
        "displayName": "Engagement Responses",
        "family": "hr",
        "aliases": [
          "engagement_response",
          "engagement_responses"
        ],
        "fieldCount": 9
      },
      {
        "name": "okrs",
        "displayName": "OKRs",
        "family": "hr",
        "aliases": [
          "okr",
          "okrs"
        ],
        "fieldCount": 16
      }
    ]
  },
  {
    "name": "calendar",
    "displayName": "Calendar & Bookings",
    "description": "Bookable meeting types, availability windows and confirmed booking slots.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "booking_meeting_types",
        "displayName": "Booking Meeting Types",
        "family": "calendar",
        "aliases": [
          "meeting_type",
          "meeting_types",
          "booking_meeting_type",
          "booking_meeting_types"
        ],
        "fieldCount": 16
      },
      {
        "name": "availability_windows",
        "displayName": "Availability Windows",
        "family": "calendar",
        "aliases": [
          "availability",
          "availability_window",
          "availability_windows"
        ],
        "fieldCount": 11
      },
      {
        "name": "booking_slots",
        "displayName": "Booking Slots",
        "family": "calendar",
        "aliases": [
          "booking",
          "bookings",
          "booking_slot",
          "booking_slots",
          "slot",
          "slots"
        ],
        "fieldCount": 15
      }
    ]
  },
  {
    "name": "commerce",
    "displayName": "Commerce",
    "description": "Product variants, orders with line items and shopping carts.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "product_variants",
        "displayName": "Product Variants",
        "family": "commerce",
        "aliases": [
          "variant",
          "variants",
          "product_variant",
          "product_variants"
        ],
        "fieldCount": 14
      },
      {
        "name": "orders",
        "displayName": "Orders",
        "family": "commerce",
        "aliases": [
          "order",
          "orders"
        ],
        "fieldCount": 30
      },
      {
        "name": "order_line_items",
        "displayName": "Order Line Items",
        "family": "commerce",
        "aliases": [
          "order_line",
          "order_lines",
          "order_line_item",
          "order_line_items"
        ],
        "fieldCount": 11
      },
      {
        "name": "shopping_carts",
        "displayName": "Shopping Carts",
        "family": "commerce",
        "aliases": [
          "cart",
          "carts",
          "shopping_cart",
          "shopping_carts"
        ],
        "fieldCount": 13
      }
    ]
  },
  {
    "name": "fitness",
    "displayName": "Fitness & Body",
    "description": "Workouts, exercises, body tracking, sleep, water, running routes.",
    "collectionCount": 19,
    "collections": [
      {
        "name": "body_measurements",
        "displayName": "Body Measurements",
        "family": "fitness",
        "aliases": [
          "body_measurement",
          "body_measurements"
        ],
        "fieldCount": 9
      },
      {
        "name": "exercises",
        "displayName": "Exercises (catalog)",
        "family": "fitness",
        "aliases": [
          "exercise",
          "exercises"
        ],
        "fieldCount": 7
      },
      {
        "name": "gym_sessions",
        "displayName": "Gym Sessions",
        "family": "fitness",
        "aliases": [
          "gym_session",
          "gym_sessions"
        ],
        "fieldCount": 6
      },
      {
        "name": "heart_rate_samples",
        "displayName": "Heart Rate Samples",
        "family": "fitness",
        "aliases": [
          "heart_rate_sample",
          "heart_rate_samples"
        ],
        "fieldCount": 4
      },
      {
        "name": "personal_records",
        "displayName": "Personal Records",
        "family": "fitness",
        "aliases": [
          "personal_record",
          "personal_records",
          "pr"
        ],
        "fieldCount": 7
      },
      {
        "name": "race_results",
        "displayName": "Race Results",
        "family": "fitness",
        "aliases": [
          "race_result",
          "race_results"
        ],
        "fieldCount": 7
      },
      {
        "name": "races_registered",
        "displayName": "Races Registered",
        "family": "fitness",
        "aliases": [
          "race_registered",
          "races_registered"
        ],
        "fieldCount": 7
      },
      {
        "name": "routine_workouts",
        "displayName": "Routine Workouts",
        "family": "fitness",
        "aliases": [
          "routine_workout",
          "routine_workouts"
        ],
        "fieldCount": 6
      },
      {
        "name": "routines",
        "displayName": "Workout Routines",
        "family": "fitness",
        "aliases": [
          "routine",
          "routines"
        ],
        "fieldCount": 6
      },
      {
        "name": "running_routes",
        "displayName": "Running Routes",
        "family": "fitness",
        "aliases": [
          "running_route",
          "running_routes"
        ],
        "fieldCount": 7
      },
      {
        "name": "sleep_logs",
        "displayName": "Sleep Logs",
        "family": "fitness",
        "aliases": [
          "sleep_log",
          "sleep_logs",
          "sleep"
        ],
        "fieldCount": 7
      },
      {
        "name": "step_logs",
        "displayName": "Step Logs",
        "family": "fitness",
        "aliases": [
          "step_log",
          "step_logs",
          "steps"
        ],
        "fieldCount": 5
      },
      {
        "name": "supplements_log",
        "displayName": "Supplements Log",
        "family": "fitness",
        "aliases": [
          "supplement_log",
          "supplements_log"
        ],
        "fieldCount": 5
      },
      {
        "name": "training_blocks",
        "displayName": "Training Blocks",
        "family": "fitness",
        "aliases": [
          "training_block",
          "training_blocks"
        ],
        "fieldCount": 6
      },
      {
        "name": "training_plan_templates",
        "displayName": "Training Plan Templates",
        "family": "fitness",
        "aliases": [
          "training_plan_template",
          "training_plan_templates"
        ],
        "fieldCount": 7
      },
      {
        "name": "water_intake_logs",
        "displayName": "Water Intake Logs",
        "family": "fitness",
        "aliases": [
          "water_intake_log",
          "water_intake_logs",
          "water"
        ],
        "fieldCount": 3
      },
      {
        "name": "weight_logs",
        "displayName": "Weight Logs",
        "family": "fitness",
        "aliases": [
          "weight_log",
          "weight_logs",
          "weight"
        ],
        "fieldCount": 4
      },
      {
        "name": "workout_exercises",
        "displayName": "Workout Exercises",
        "family": "fitness",
        "aliases": [
          "workout_exercise",
          "workout_exercises"
        ],
        "fieldCount": 10
      },
      {
        "name": "workouts",
        "displayName": "Workouts",
        "family": "fitness",
        "aliases": [
          "workout",
          "workouts"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "health",
    "displayName": "Health & Medical",
    "description": "Medications, symptoms, doctors, prescriptions, lab results, diagnoses.",
    "collectionCount": 21,
    "collections": [
      {
        "name": "allergies_diagnosed",
        "displayName": "Allergies",
        "family": "health",
        "aliases": [
          "allergy",
          "allergies",
          "allergies_diagnosed"
        ],
        "fieldCount": 6
      },
      {
        "name": "clinics",
        "displayName": "Clinics & Hospitals",
        "family": "health",
        "aliases": [
          "clinic",
          "clinics"
        ],
        "fieldCount": 6
      },
      {
        "name": "diagnoses",
        "displayName": "Diagnoses",
        "family": "health",
        "aliases": [
          "diagnosis",
          "diagnoses"
        ],
        "fieldCount": 6
      },
      {
        "name": "doctors",
        "displayName": "Doctors",
        "family": "health",
        "aliases": [
          "doctor",
          "doctors"
        ],
        "fieldCount": 7
      },
      {
        "name": "encounters",
        "displayName": "Encounters",
        "family": "health",
        "aliases": [
          "encounter",
          "encounters",
          "clinical_encounter",
          "clinical_encounters",
          "visit",
          "visits"
        ],
        "fieldCount": 14
      },
      {
        "name": "health_conditions",
        "displayName": "Health Conditions",
        "family": "health",
        "aliases": [
          "health_condition",
          "health_conditions"
        ],
        "fieldCount": 5
      },
      {
        "name": "lab_results",
        "displayName": "Lab Results",
        "family": "health",
        "aliases": [
          "lab_result",
          "lab_results"
        ],
        "fieldCount": 9
      },
      {
        "name": "lab_value_targets",
        "displayName": "Lab Value Targets",
        "family": "health",
        "aliases": [
          "lab_value_target",
          "lab_value_targets"
        ],
        "fieldCount": 6
      },
      {
        "name": "medical_appointments",
        "displayName": "Medical Appointments",
        "family": "health",
        "aliases": [
          "medical_appointment",
          "medical_appointments"
        ],
        "fieldCount": 6
      },
      {
        "name": "medical_costs_log",
        "displayName": "Medical Costs Log",
        "family": "health",
        "aliases": [
          "medical_cost_log_entry",
          "medical_costs_log"
        ],
        "fieldCount": 6
      },
      {
        "name": "medical_documents",
        "displayName": "Medical Documents",
        "family": "health",
        "aliases": [
          "medical_document",
          "medical_documents"
        ],
        "fieldCount": 6
      },
      {
        "name": "medical_procedures",
        "displayName": "Medical Procedures",
        "family": "health",
        "aliases": [
          "medical_procedure",
          "medical_procedures"
        ],
        "fieldCount": 7
      },
      {
        "name": "medication_doses",
        "displayName": "Medication Doses",
        "family": "health",
        "aliases": [
          "medication_dose",
          "medication_doses"
        ],
        "fieldCount": 6
      },
      {
        "name": "medications",
        "displayName": "Medications",
        "family": "health",
        "aliases": [
          "medication",
          "medications"
        ],
        "fieldCount": 10
      },
      {
        "name": "mood_logs",
        "displayName": "Mood Logs",
        "family": "health",
        "aliases": [
          "mood_log",
          "mood_logs",
          "mood"
        ],
        "fieldCount": 6
      },
      {
        "name": "patients",
        "displayName": "Patients",
        "family": "health",
        "aliases": [
          "patient",
          "patients"
        ],
        "fieldCount": 13
      },
      {
        "name": "period_logs",
        "displayName": "Period Logs",
        "family": "health",
        "aliases": [
          "period_log",
          "period_logs",
          "period"
        ],
        "fieldCount": 5
      },
      {
        "name": "prescriptions",
        "displayName": "Prescriptions",
        "family": "health",
        "aliases": [
          "prescription",
          "prescriptions"
        ],
        "fieldCount": 6
      },
      {
        "name": "referrals_received",
        "displayName": "Referrals Received",
        "family": "health",
        "aliases": [
          "referral_received",
          "referrals_received"
        ],
        "fieldCount": 6
      },
      {
        "name": "symptom_logs",
        "displayName": "Symptom Logs",
        "family": "health",
        "aliases": [
          "symptom",
          "symptom_log",
          "symptom_logs",
          "symptoms"
        ],
        "fieldCount": 8
      },
      {
        "name": "vaccinations_personal",
        "displayName": "Vaccinations",
        "family": "health",
        "aliases": [
          "vaccination",
          "vaccinations",
          "vaccinations_personal"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "research",
    "displayName": "Research / CTMS",
    "description": "Research studies, participants, cohorts, consent state, evidence, and analysis readiness.",
    "collectionCount": 2,
    "collections": [
      {
        "name": "studies",
        "displayName": "Studies",
        "family": "research",
        "aliases": [
          "study",
          "studies",
          "research_study",
          "research_studies",
          "trial",
          "trials"
        ],
        "fieldCount": 14
      },
      {
        "name": "participants",
        "displayName": "Participants",
        "family": "research",
        "aliases": [
          "participant",
          "participants",
          "research_subject",
          "research_subjects"
        ],
        "fieldCount": 12
      }
    ]
  },
  {
    "name": "biology",
    "displayName": "Biology",
    "description": "Biological organisms/entities, experiments, observations, evidence, and ELN-ready experiment records.",
    "collectionCount": 2,
    "collections": [
      {
        "name": "organisms",
        "displayName": "Organisms",
        "family": "biology",
        "aliases": [
          "organism",
          "organisms",
          "biological_entity",
          "biological_entities"
        ],
        "fieldCount": 10
      },
      {
        "name": "biology_experiments",
        "displayName": "Biology Experiments",
        "family": "biology",
        "aliases": [
          "biology_experiment",
          "biology_experiments",
          "bio_experiment",
          "bio_experiments"
        ],
        "fieldCount": 13
      }
    ]
  },
  {
    "name": "labs",
    "displayName": "Labs / LIMS",
    "description": "Samples, assays, provenance, custody, measured results, and lab quality gaps.",
    "collectionCount": 2,
    "collections": [
      {
        "name": "samples",
        "displayName": "Samples",
        "family": "labs",
        "aliases": [
          "sample",
          "samples",
          "specimen",
          "specimens"
        ],
        "fieldCount": 16
      },
      {
        "name": "assays",
        "displayName": "Assays",
        "family": "labs",
        "aliases": [
          "assay",
          "assays",
          "test",
          "tests"
        ],
        "fieldCount": 14
      }
    ]
  },
  {
    "name": "habits_journaling",
    "displayName": "Habits & Journaling",
    "description": "Habits, habit logs, journal entries, gratitude, intentions, reflections.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "habits",
        "displayName": "Habits",
        "family": "habits_journaling",
        "aliases": [
          "habit",
          "habits"
        ],
        "fieldCount": 9
      },
      {
        "name": "habit_logs",
        "displayName": "Habit Logs",
        "family": "habits_journaling",
        "aliases": [
          "habit_log",
          "habit_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "journal_entries",
        "displayName": "Journal Entries",
        "family": "habits_journaling",
        "aliases": [
          "journal_entry",
          "journal_entries",
          "journal"
        ],
        "fieldCount": 8
      },
      {
        "name": "gratitude_entries",
        "displayName": "Gratitude Entries",
        "family": "habits_journaling",
        "aliases": [
          "gratitude_entry",
          "gratitude_entries",
          "gratitude"
        ],
        "fieldCount": 6
      },
      {
        "name": "intentions",
        "displayName": "Intentions",
        "family": "habits_journaling",
        "aliases": [
          "intention",
          "intentions"
        ],
        "fieldCount": 6
      },
      {
        "name": "reflections",
        "displayName": "Reflections",
        "family": "habits_journaling",
        "aliases": [
          "reflection",
          "reflections"
        ],
        "fieldCount": 6
      },
      {
        "name": "mood_check_ins",
        "displayName": "Mood Check-Ins",
        "family": "habits_journaling",
        "aliases": [
          "mood_check_in",
          "mood_check_ins",
          "checkin"
        ],
        "fieldCount": 6
      },
      {
        "name": "dream_journals",
        "displayName": "Dream Journals",
        "family": "habits_journaling",
        "aliases": [
          "dream_journal",
          "dream_journals",
          "dream"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "finance",
    "displayName": "Personal Finance",
    "description": "Accounts, transactions, budgets, subscriptions, investments, debts, bills.",
    "collectionCount": 23,
    "collections": [
      {
        "name": "bill_payments",
        "displayName": "Bill Payments",
        "family": "finance",
        "aliases": [
          "bill_payment",
          "bill_payments"
        ],
        "fieldCount": 5
      },
      {
        "name": "bills",
        "displayName": "Bills",
        "family": "finance",
        "aliases": [
          "bill",
          "bills"
        ],
        "fieldCount": 9
      },
      {
        "name": "budget_categories",
        "displayName": "Budget Categories",
        "family": "finance",
        "aliases": [
          "budget_category",
          "budget_categories"
        ],
        "fieldCount": 7
      },
      {
        "name": "budgets",
        "displayName": "Budgets",
        "family": "finance",
        "aliases": [
          "budget",
          "budgets"
        ],
        "fieldCount": 7
      },
      {
        "name": "crypto_holdings",
        "displayName": "Crypto Holdings",
        "family": "finance",
        "aliases": [
          "crypto_holding",
          "crypto_holdings"
        ],
        "fieldCount": 6
      },
      {
        "name": "crypto_wallets",
        "displayName": "Crypto Wallets",
        "family": "finance",
        "aliases": [
          "crypto_wallet",
          "crypto_wallets"
        ],
        "fieldCount": 7
      },
      {
        "name": "currencies",
        "displayName": "Currencies (catalog)",
        "family": "finance",
        "aliases": [
          "currency",
          "currencies"
        ],
        "fieldCount": 4
      },
      {
        "name": "debts",
        "displayName": "Debts",
        "family": "finance",
        "aliases": [
          "debt",
          "debts"
        ],
        "fieldCount": 9
      },
      {
        "name": "financial_accounts",
        "displayName": "Financial Accounts",
        "family": "finance",
        "aliases": [
          "financial_account",
          "financial_accounts",
          "financial-account",
          "financial-accounts",
          "account"
        ],
        "fieldCount": 7
      },
      {
        "name": "financial_documents",
        "displayName": "Financial Documents",
        "family": "finance",
        "aliases": [
          "financial_document",
          "financial_documents"
        ],
        "fieldCount": 6
      },
      {
        "name": "investment_holdings",
        "displayName": "Investment Holdings",
        "family": "finance",
        "aliases": [
          "investment_holding",
          "investment_holdings",
          "holding"
        ],
        "fieldCount": 9
      },
      {
        "name": "investment_transactions",
        "displayName": "Investment Transactions",
        "family": "finance",
        "aliases": [
          "investment_transaction",
          "investment_transactions"
        ],
        "fieldCount": 8
      },
      {
        "name": "loans",
        "displayName": "Loans",
        "family": "finance",
        "aliases": [
          "loan",
          "loans"
        ],
        "fieldCount": 10
      },
      {
        "name": "net_worth_snapshots",
        "displayName": "Net Worth Snapshots",
        "family": "finance",
        "aliases": [
          "net_worth_snapshot",
          "net_worth_snapshots"
        ],
        "fieldCount": 5
      },
      {
        "name": "personal_subscriptions",
        "displayName": "Personal Subscriptions",
        "family": "finance",
        "aliases": [
          "personal_subscription",
          "personal_subscriptions"
        ],
        "fieldCount": 10
      },
      {
        "name": "real_estate_owned",
        "displayName": "Real Estate Owned",
        "family": "finance",
        "aliases": [
          "real_estate_owned_item",
          "real_estate_owned"
        ],
        "fieldCount": 7
      },
      {
        "name": "recurring_expenses",
        "displayName": "Recurring Expenses",
        "family": "finance",
        "aliases": [
          "recurring_expense",
          "recurring_expenses"
        ],
        "fieldCount": 7
      },
      {
        "name": "recurring_incomes",
        "displayName": "Recurring Incomes",
        "family": "finance",
        "aliases": [
          "recurring_income",
          "recurring_incomes"
        ],
        "fieldCount": 7
      },
      {
        "name": "retirement_accounts",
        "displayName": "Retirement Accounts",
        "family": "finance",
        "aliases": [
          "retirement_account",
          "retirement_accounts"
        ],
        "fieldCount": 5
      },
      {
        "name": "savings_goals",
        "displayName": "Savings Goals",
        "family": "finance",
        "aliases": [
          "savings_goal",
          "savings_goals"
        ],
        "fieldCount": 8
      },
      {
        "name": "tax_filings",
        "displayName": "Tax Filings",
        "family": "finance",
        "aliases": [
          "tax_filing",
          "tax_filings"
        ],
        "fieldCount": 8
      },
      {
        "name": "transactions",
        "displayName": "Transactions",
        "family": "finance",
        "aliases": [
          "transaction",
          "transactions"
        ],
        "fieldCount": 11
      },
      {
        "name": "trust_funds",
        "displayName": "Trust Funds",
        "family": "finance",
        "aliases": [
          "trust_fund",
          "trust_funds"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "possessions",
    "displayName": "Home & Possessions",
    "description": "Home inventory, appliances, maintenance, chores, warranties.",
    "collectionCount": 9,
    "collections": [
      {
        "name": "home_inventory_items",
        "displayName": "Home Inventory Items",
        "family": "possessions",
        "aliases": [
          "home_inventory_item",
          "home_inventory_items",
          "inventory"
        ],
        "fieldCount": 10
      },
      {
        "name": "appliances",
        "displayName": "Appliances",
        "family": "possessions",
        "aliases": [
          "appliance",
          "appliances"
        ],
        "fieldCount": 10
      },
      {
        "name": "appliance_maintenance",
        "displayName": "Appliance Maintenance",
        "family": "possessions",
        "aliases": [
          "appliance_maintenance"
        ],
        "fieldCount": 6
      },
      {
        "name": "chores",
        "displayName": "Chores",
        "family": "possessions",
        "aliases": [
          "chore",
          "chores"
        ],
        "fieldCount": 7
      },
      {
        "name": "chore_logs",
        "displayName": "Chore Logs",
        "family": "possessions",
        "aliases": [
          "chore_log",
          "chore_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "households",
        "displayName": "Households",
        "family": "possessions",
        "aliases": [
          "household",
          "households"
        ],
        "fieldCount": 5
      },
      {
        "name": "household_members",
        "displayName": "Household Members",
        "family": "possessions",
        "aliases": [
          "household_member",
          "household_members"
        ],
        "fieldCount": 7
      },
      {
        "name": "warranties",
        "displayName": "Warranties",
        "family": "possessions",
        "aliases": [
          "warranty",
          "warranties"
        ],
        "fieldCount": 7
      },
      {
        "name": "manuals",
        "displayName": "Manuals & Guides",
        "family": "possessions",
        "aliases": [
          "manual",
          "manuals"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "wardrobe",
    "displayName": "Wardrobe",
    "description": "Clothes, outfits, outfit logs, laundry.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "clothes",
        "displayName": "Clothes",
        "family": "wardrobe",
        "aliases": [
          "clothing",
          "clothes"
        ],
        "fieldCount": 10
      },
      {
        "name": "outfits",
        "displayName": "Outfits",
        "family": "wardrobe",
        "aliases": [
          "outfit",
          "outfits"
        ],
        "fieldCount": 7
      },
      {
        "name": "outfit_logs",
        "displayName": "Outfit Logs",
        "family": "wardrobe",
        "aliases": [
          "outfit_log",
          "outfit_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "laundry_logs",
        "displayName": "Laundry Logs",
        "family": "wardrobe",
        "aliases": [
          "laundry_log",
          "laundry_logs",
          "laundry"
        ],
        "fieldCount": 5
      }
    ]
  },
  {
    "name": "vehicles",
    "displayName": "Vehicles",
    "description": "Vehicles you own, fuel logs, maintenance, mileage, insurance, documents.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "vehicles",
        "displayName": "Vehicles",
        "family": "vehicles",
        "aliases": [
          "vehicle",
          "vehicles"
        ],
        "fieldCount": 11
      },
      {
        "name": "vehicle_maintenance",
        "displayName": "Vehicle Maintenance",
        "family": "vehicles",
        "aliases": [
          "vehicle_maintenance"
        ],
        "fieldCount": 8
      },
      {
        "name": "fuel_logs",
        "displayName": "Fuel Logs",
        "family": "vehicles",
        "aliases": [
          "fuel_log",
          "fuel_logs",
          "fuel"
        ],
        "fieldCount": 8
      },
      {
        "name": "mileage_logs",
        "displayName": "Mileage Logs",
        "family": "vehicles",
        "aliases": [
          "mileage_log",
          "mileage_logs",
          "mileage"
        ],
        "fieldCount": 6
      },
      {
        "name": "vehicle_documents",
        "displayName": "Vehicle Documents",
        "family": "vehicles",
        "aliases": [
          "vehicle_document",
          "vehicle_documents"
        ],
        "fieldCount": 7
      },
      {
        "name": "vehicle_insurance_policies",
        "displayName": "Vehicle Insurance Policies",
        "family": "vehicles",
        "aliases": [
          "vehicle_insurance_policy",
          "vehicle_insurance_policies"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "hobbies",
    "displayName": "Hobbies & Collections",
    "description": "Collectibles, wishlists, board games, plays.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "collectible_items",
        "displayName": "Collectible Items",
        "family": "hobbies",
        "aliases": [
          "collectible_item",
          "collectible_items",
          "collectible"
        ],
        "fieldCount": 9
      },
      {
        "name": "collection_groups",
        "displayName": "Collection Groups",
        "family": "hobbies",
        "aliases": [
          "collection_group",
          "collection_groups"
        ],
        "fieldCount": 5
      },
      {
        "name": "wishlists",
        "displayName": "Wishlists",
        "family": "hobbies",
        "aliases": [
          "wishlist",
          "wishlists"
        ],
        "fieldCount": 5
      },
      {
        "name": "wishlist_items",
        "displayName": "Wishlist Items",
        "family": "hobbies",
        "aliases": [
          "wishlist_item",
          "wishlist_items"
        ],
        "fieldCount": 8
      },
      {
        "name": "board_games",
        "displayName": "Board Games",
        "family": "hobbies",
        "aliases": [
          "board_game",
          "board_games"
        ],
        "fieldCount": 10
      },
      {
        "name": "board_game_plays",
        "displayName": "Board Game Plays",
        "family": "hobbies",
        "aliases": [
          "board_game_play",
          "board_game_plays"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "reading_media",
    "displayName": "Reading & Media",
    "description": "Books, articles, podcasts, watchlist, movies, shows, audiobooks.",
    "collectionCount": 22,
    "collections": [
      {
        "name": "article_progress",
        "displayName": "Article Progress",
        "family": "reading_media",
        "aliases": [
          "article_progress"
        ],
        "fieldCount": 4
      },
      {
        "name": "articles",
        "displayName": "Articles",
        "family": "reading_media",
        "aliases": [
          "article",
          "articles"
        ],
        "fieldCount": 7
      },
      {
        "name": "audiobook_progress",
        "displayName": "Audiobook Progress",
        "family": "reading_media",
        "aliases": [
          "audiobook_progress"
        ],
        "fieldCount": 5
      },
      {
        "name": "audiobooks",
        "displayName": "Audiobooks",
        "family": "reading_media",
        "aliases": [
          "audiobook",
          "audiobooks"
        ],
        "fieldCount": 9
      },
      {
        "name": "book_club_meetings",
        "displayName": "Book Club Meetings",
        "family": "reading_media",
        "aliases": [
          "book_club_meeting",
          "book_club_meetings"
        ],
        "fieldCount": 5
      },
      {
        "name": "book_clubs",
        "displayName": "Book Clubs",
        "family": "reading_media",
        "aliases": [
          "book_club",
          "book_clubs"
        ],
        "fieldCount": 5
      },
      {
        "name": "book_notes",
        "displayName": "Book Notes",
        "family": "reading_media",
        "aliases": [
          "book_note",
          "book_notes"
        ],
        "fieldCount": 6
      },
      {
        "name": "book_progress_logs",
        "displayName": "Book Progress Logs",
        "family": "reading_media",
        "aliases": [
          "book_progress_log",
          "book_progress_logs"
        ],
        "fieldCount": 6
      },
      {
        "name": "books",
        "displayName": "Books",
        "family": "reading_media",
        "aliases": [
          "book",
          "books"
        ],
        "fieldCount": 11
      },
      {
        "name": "highlights",
        "displayName": "Highlights",
        "family": "reading_media",
        "aliases": [
          "highlight",
          "highlights"
        ],
        "fieldCount": 8
      },
      {
        "name": "highlights_collections",
        "displayName": "Highlights Collections",
        "family": "reading_media",
        "aliases": [
          "highlights_collection",
          "highlights_collections"
        ],
        "fieldCount": 3
      },
      {
        "name": "libraries",
        "displayName": "Libraries",
        "family": "reading_media",
        "aliases": [
          "library",
          "libraries"
        ],
        "fieldCount": 4
      },
      {
        "name": "movies",
        "displayName": "Movies (catalog)",
        "family": "reading_media",
        "aliases": [
          "movie",
          "movies"
        ],
        "fieldCount": 7
      },
      {
        "name": "podcast_episodes",
        "displayName": "Podcast Episodes",
        "family": "reading_media",
        "aliases": [
          "podcast_episode",
          "podcast_episodes"
        ],
        "fieldCount": 6
      },
      {
        "name": "podcast_progress",
        "displayName": "Podcast Progress",
        "family": "reading_media",
        "aliases": [
          "podcast_progress"
        ],
        "fieldCount": 5
      },
      {
        "name": "podcasts",
        "displayName": "Podcasts",
        "family": "reading_media",
        "aliases": [
          "podcast",
          "podcasts"
        ],
        "fieldCount": 8
      },
      {
        "name": "reading_challenges",
        "displayName": "Reading Challenges",
        "family": "reading_media",
        "aliases": [
          "reading_challenge",
          "reading_challenges"
        ],
        "fieldCount": 6
      },
      {
        "name": "reading_lists",
        "displayName": "Reading Lists",
        "family": "reading_media",
        "aliases": [
          "reading_list",
          "reading_lists"
        ],
        "fieldCount": 5
      },
      {
        "name": "tv_episodes",
        "displayName": "TV Episodes",
        "family": "reading_media",
        "aliases": [
          "tv_episode",
          "tv_episodes"
        ],
        "fieldCount": 7
      },
      {
        "name": "tv_shows",
        "displayName": "TV Shows (catalog)",
        "family": "reading_media",
        "aliases": [
          "tv_show",
          "tv_shows"
        ],
        "fieldCount": 7
      },
      {
        "name": "watch_logs",
        "displayName": "Watch Logs",
        "family": "reading_media",
        "aliases": [
          "watch_log",
          "watch_logs"
        ],
        "fieldCount": 6
      },
      {
        "name": "watchlist_items",
        "displayName": "Watchlist Items",
        "family": "reading_media",
        "aliases": [
          "watchlist_item",
          "watchlist_items"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "learning",
    "displayName": "Learning",
    "description": "Courses, lessons, flashcards, vocabulary, languages, skills.",
    "collectionCount": 10,
    "collections": [
      {
        "name": "courses",
        "displayName": "Courses",
        "family": "learning",
        "aliases": [
          "course",
          "courses"
        ],
        "fieldCount": 9
      },
      {
        "name": "lessons",
        "displayName": "Lessons",
        "family": "learning",
        "aliases": [
          "lesson",
          "lessons"
        ],
        "fieldCount": 6
      },
      {
        "name": "study_sessions",
        "displayName": "Study Sessions",
        "family": "learning",
        "aliases": [
          "study_session",
          "study_sessions"
        ],
        "fieldCount": 6
      },
      {
        "name": "flashcards",
        "displayName": "Flashcards",
        "family": "learning",
        "aliases": [
          "flashcard",
          "flashcards"
        ],
        "fieldCount": 7
      },
      {
        "name": "flashcard_decks",
        "displayName": "Flashcard Decks",
        "family": "learning",
        "aliases": [
          "flashcard_deck",
          "flashcard_decks",
          "deck"
        ],
        "fieldCount": 6
      },
      {
        "name": "flashcard_reviews",
        "displayName": "Flashcard Reviews",
        "family": "learning",
        "aliases": [
          "flashcard_review",
          "flashcard_reviews"
        ],
        "fieldCount": 5
      },
      {
        "name": "vocabulary_items",
        "displayName": "Vocabulary Items",
        "family": "learning",
        "aliases": [
          "vocabulary_item",
          "vocabulary_items",
          "vocab"
        ],
        "fieldCount": 8
      },
      {
        "name": "languages_learning",
        "displayName": "Languages Learning",
        "family": "learning",
        "aliases": [
          "language_learning",
          "languages_learning",
          "language"
        ],
        "fieldCount": 7
      },
      {
        "name": "skills",
        "displayName": "Skills",
        "family": "learning",
        "aliases": [
          "skill",
          "skills"
        ],
        "fieldCount": 7
      },
      {
        "name": "skill_progress_logs",
        "displayName": "Skill Progress Logs",
        "family": "learning",
        "aliases": [
          "skill_progress_log",
          "skill_progress_logs"
        ],
        "fieldCount": 5
      }
    ]
  },
  {
    "name": "education",
    "displayName": "Education / LMS",
    "description": "Learner profiles, course participation, assessments, progress, and education quality gaps.",
    "collectionCount": 1,
    "collections": [
      {
        "name": "learners",
        "displayName": "Learners",
        "family": "education",
        "aliases": [
          "learner",
          "learners",
          "student",
          "students"
        ],
        "fieldCount": 9
      }
    ]
  },
  {
    "name": "manufacturing",
    "displayName": "Manufacturing / MES",
    "description": "Manufacturing work orders, operations, materials, equipment links, quality checks, and evidence.",
    "collectionCount": 1,
    "collections": [
      {
        "name": "work_orders",
        "displayName": "Work Orders",
        "family": "manufacturing",
        "aliases": [
          "work-order",
          "work-orders",
          "work_order",
          "work_orders",
          "production_order",
          "production_orders"
        ],
        "fieldCount": 16
      }
    ]
  },
  {
    "name": "bookmarks_misc",
    "displayName": "Bookmarks & Misc",
    "description": "Bookmarks, snippets, quotes, voice memos, personal notes.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "bookmarks",
        "displayName": "Bookmarks",
        "family": "bookmarks_misc",
        "aliases": [
          "bookmark",
          "bookmarks"
        ],
        "fieldCount": 8
      },
      {
        "name": "bookmark_collections",
        "displayName": "Bookmark Collections",
        "family": "bookmarks_misc",
        "aliases": [
          "bookmark_collection",
          "bookmark_collections"
        ],
        "fieldCount": 4
      },
      {
        "name": "snippets",
        "displayName": "Snippets",
        "family": "bookmarks_misc",
        "aliases": [
          "snippet",
          "snippets"
        ],
        "fieldCount": 6
      },
      {
        "name": "saved_quotes",
        "displayName": "Saved Quotes",
        "family": "bookmarks_misc",
        "aliases": [
          "saved_quote",
          "saved_quotes"
        ],
        "fieldCount": 6
      },
      {
        "name": "voice_memos",
        "displayName": "Voice Memos",
        "family": "bookmarks_misc",
        "aliases": [
          "voice_memo",
          "voice_memos"
        ],
        "fieldCount": 7
      },
      {
        "name": "personal_notes",
        "displayName": "Personal Notes",
        "family": "bookmarks_misc",
        "aliases": [
          "personal_note",
          "personal_notes"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "education_school",
    "displayName": "Education & School",
    "description": "Subjects, classes, assignments, exams, grades, study plans.",
    "collectionCount": 9,
    "collections": [
      {
        "name": "subjects",
        "displayName": "Subjects",
        "family": "education_school",
        "aliases": [
          "subject",
          "subjects"
        ],
        "fieldCount": 6
      },
      {
        "name": "classes",
        "displayName": "Classes",
        "family": "education_school",
        "aliases": [
          "class",
          "classes"
        ],
        "fieldCount": 6
      },
      {
        "name": "school_assignments",
        "displayName": "School Assignments",
        "family": "education_school",
        "aliases": [
          "school_assignment",
          "school_assignments"
        ],
        "fieldCount": 8
      },
      {
        "name": "exams",
        "displayName": "Exams",
        "family": "education_school",
        "aliases": [
          "exam",
          "exams"
        ],
        "fieldCount": 8
      },
      {
        "name": "school_grades",
        "displayName": "School Grades",
        "family": "education_school",
        "aliases": [
          "school_grade",
          "school_grades"
        ],
        "fieldCount": 8
      },
      {
        "name": "study_plans",
        "displayName": "Study Plans",
        "family": "education_school",
        "aliases": [
          "study_plan",
          "study_plans"
        ],
        "fieldCount": 7
      },
      {
        "name": "school_calendar_entries",
        "displayName": "School Calendar Entries",
        "family": "education_school",
        "aliases": [
          "school_calendar_entry",
          "school_calendar_entries"
        ],
        "fieldCount": 6
      },
      {
        "name": "teachers",
        "displayName": "Teachers",
        "family": "education_school",
        "aliases": [
          "teacher",
          "teachers"
        ],
        "fieldCount": 6
      },
      {
        "name": "schools",
        "displayName": "Schools",
        "family": "education_school",
        "aliases": [
          "school",
          "schools"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "career",
    "displayName": "Career",
    "description": "Job applications, interviews, offers, certifications, resumes.",
    "collectionCount": 10,
    "collections": [
      {
        "name": "job_applications",
        "displayName": "Job Applications",
        "family": "career",
        "aliases": [
          "job_application",
          "job_applications"
        ],
        "fieldCount": 7
      },
      {
        "name": "interviews",
        "displayName": "Interviews",
        "family": "career",
        "aliases": [
          "interview",
          "interviews"
        ],
        "fieldCount": 7
      },
      {
        "name": "job_offers",
        "displayName": "Job Offers",
        "family": "career",
        "aliases": [
          "job_offer",
          "job_offers"
        ],
        "fieldCount": 8
      },
      {
        "name": "companies_of_interest",
        "displayName": "Companies of Interest",
        "family": "career",
        "aliases": [
          "company_of_interest",
          "companies_of_interest"
        ],
        "fieldCount": 7
      },
      {
        "name": "contacts_professional",
        "displayName": "Professional Contacts",
        "family": "career",
        "aliases": [
          "contact_professional",
          "contacts_professional"
        ],
        "fieldCount": 8
      },
      {
        "name": "certifications_personal",
        "displayName": "Certifications",
        "family": "career",
        "aliases": [
          "certification",
          "certifications",
          "certifications_personal"
        ],
        "fieldCount": 8
      },
      {
        "name": "skill_assessments",
        "displayName": "Skill Assessments",
        "family": "career",
        "aliases": [
          "skill_assessment",
          "skill_assessments"
        ],
        "fieldCount": 7
      },
      {
        "name": "resumes",
        "displayName": "Resumes",
        "family": "career",
        "aliases": [
          "resume",
          "resumes",
          "cv"
        ],
        "fieldCount": 6
      },
      {
        "name": "cover_letters",
        "displayName": "Cover Letters",
        "family": "career",
        "aliases": [
          "cover_letter",
          "cover_letters"
        ],
        "fieldCount": 6
      },
      {
        "name": "career_goals",
        "displayName": "Career Goals",
        "family": "career",
        "aliases": [
          "career_goal",
          "career_goals"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "procurement",
    "displayName": "Procurement",
    "description": "Suppliers, purchase orders, purchase order lines, receiving status, evidence, and gaps.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "suppliers",
        "displayName": "Suppliers",
        "family": "procurement",
        "aliases": [
          "supplier",
          "suppliers",
          "vendor",
          "vendors"
        ],
        "fieldCount": 13
      },
      {
        "name": "purchase_orders",
        "displayName": "Purchase Orders",
        "family": "procurement",
        "aliases": [
          "purchase-order",
          "purchase-orders",
          "purchase_order",
          "purchase_orders",
          "po",
          "pos"
        ],
        "fieldCount": 15
      },
      {
        "name": "purchase_order_line_items",
        "displayName": "Purchase Order Line Items",
        "family": "procurement",
        "aliases": [
          "purchase-order-line-item",
          "purchase-order-line-items",
          "purchase_order_line_item",
          "purchase_order_line_items",
          "po-line",
          "po-lines"
        ],
        "fieldCount": 14
      }
    ]
  },
  {
    "name": "warehouse",
    "displayName": "Warehouse / WMS",
    "description": "Warehouses, inventory items, stock movements, evidence, quality gaps, and timeline views.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "warehouses",
        "displayName": "Warehouses",
        "family": "warehouse",
        "aliases": [
          "warehouse",
          "warehouses",
          "fulfillment-center",
          "fulfillment-centers"
        ],
        "fieldCount": 12
      },
      {
        "name": "inventory_items",
        "displayName": "Inventory Items",
        "family": "warehouse",
        "aliases": [
          "inventory_items",
          "inventory-item",
          "inventory-items",
          "stock-item",
          "stock-items",
          "warehouse-inventory",
          "warehouse-stock"
        ],
        "fieldCount": 15
      },
      {
        "name": "stock_movements",
        "displayName": "Stock Movements",
        "family": "warehouse",
        "aliases": [
          "stock_movements",
          "stock-movement",
          "stock-movements",
          "inventory-movement",
          "inventory-movements"
        ],
        "fieldCount": 14
      }
    ]
  },
  {
    "name": "supply_chain",
    "displayName": "Supply Chain / SCM",
    "description": "Supply plans, supply-plan items, risks, supplier/procurement/warehouse links, evidence, and gaps.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "supply_plans",
        "displayName": "Supply Plans",
        "family": "supply_chain",
        "aliases": [
          "supply-plan",
          "supply-plans",
          "supply_plan",
          "supply_plans",
          "replenishment-plan",
          "replenishment-plans"
        ],
        "fieldCount": 13
      },
      {
        "name": "supply_plan_items",
        "displayName": "Supply Plan Items",
        "family": "supply_chain",
        "aliases": [
          "supply-plan-item",
          "supply-plan-items",
          "supply_plan_item",
          "supply_plan_items",
          "replenishment-item",
          "replenishment-items"
        ],
        "fieldCount": 19
      },
      {
        "name": "supply_risks",
        "displayName": "Supply Risks",
        "family": "supply_chain",
        "aliases": [
          "supply-risk",
          "supply-risks",
          "supply_risk",
          "supply_risks",
          "supplier-risk",
          "supplier-risks"
        ],
        "fieldCount": 17
      }
    ]
  },
  {
    "name": "compliance",
    "displayName": "Compliance / GRC",
    "description": "Controls, obligations, assessments, findings, evidence, remediation, and gaps.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "compliance_controls",
        "displayName": "Compliance Controls",
        "family": "compliance",
        "aliases": [
          "control",
          "controls",
          "compliance-control",
          "compliance-controls",
          "compliance_control",
          "compliance_controls"
        ],
        "fieldCount": 15
      },
      {
        "name": "compliance_obligations",
        "displayName": "Compliance Obligations",
        "family": "compliance",
        "aliases": [
          "obligation",
          "obligations",
          "compliance-obligation",
          "compliance-obligations",
          "compliance_obligation",
          "compliance_obligations",
          "requirement",
          "requirements"
        ],
        "fieldCount": 14
      },
      {
        "name": "control_assessments",
        "displayName": "Control Assessments",
        "family": "compliance",
        "aliases": [
          "control-assessment",
          "control-assessments",
          "control_assessment",
          "control_assessments",
          "assessment",
          "assessments"
        ],
        "fieldCount": 16
      },
      {
        "name": "compliance_findings",
        "displayName": "Compliance Findings",
        "family": "compliance",
        "aliases": [
          "compliance-finding",
          "compliance-findings",
          "compliance_finding",
          "compliance_findings",
          "finding",
          "findings",
          "grc-finding",
          "grc-findings"
        ],
        "fieldCount": 16
      }
    ]
  },
  {
    "name": "government",
    "displayName": "Government",
    "description": "Agencies, public cases, permits, filings, evidence, and gaps for public-administration workflows.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "agencies",
        "displayName": "Agencies",
        "family": "government",
        "aliases": [
          "agency",
          "agencies",
          "public-agency",
          "public-agencies",
          "government-agency",
          "government-agencies"
        ],
        "fieldCount": 14
      },
      {
        "name": "public_cases",
        "displayName": "Public Cases",
        "family": "government",
        "aliases": [
          "public-case",
          "public-cases",
          "public_case",
          "public_cases",
          "government-case",
          "government-cases"
        ],
        "fieldCount": 18
      },
      {
        "name": "permits",
        "displayName": "Permits",
        "family": "government",
        "aliases": [
          "permit",
          "permits",
          "license-permit",
          "license-permits"
        ],
        "fieldCount": 17
      },
      {
        "name": "public_filings",
        "displayName": "Public Filings",
        "family": "government",
        "aliases": [
          "public-filing",
          "public-filings",
          "public_filing",
          "public_filings",
          "government-filing",
          "government-filings"
        ],
        "fieldCount": 17
      }
    ]
  },
  {
    "name": "product",
    "displayName": "Product / PIM / PLM",
    "description": "Product specifications, revisions, requirements, BOMs, evidence, and gaps for lifecycle management.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "product_specs",
        "displayName": "Product Specs",
        "family": "product",
        "aliases": [
          "product-spec",
          "product-specs",
          "product_spec",
          "product_specs",
          "pim-spec",
          "pim-specs"
        ],
        "fieldCount": 15
      },
      {
        "name": "product_revisions",
        "displayName": "Product Revisions",
        "family": "product",
        "aliases": [
          "product-revision",
          "product-revisions",
          "product_revision",
          "product_revisions",
          "engineering-revision",
          "engineering-revisions"
        ],
        "fieldCount": 15
      },
      {
        "name": "product_requirements",
        "displayName": "Product Requirements",
        "family": "product",
        "aliases": [
          "product-requirement",
          "product-requirements",
          "product_requirement",
          "product_requirements",
          "plm-requirement",
          "plm-requirements"
        ],
        "fieldCount": 15
      },
      {
        "name": "product_boms",
        "displayName": "Product BOMs",
        "family": "product",
        "aliases": [
          "product-bom",
          "product-boms",
          "product_bom",
          "product_boms",
          "bill-of-materials",
          "bills-of-materials"
        ],
        "fieldCount": 15
      }
    ]
  },
  {
    "name": "pharma",
    "displayName": "Pharma",
    "description": "Drug products, batch records, lot releases, adverse events, evidence, and gaps for regulated pharma workflows.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "drug_products",
        "displayName": "Drug Products",
        "family": "pharma",
        "aliases": [
          "drug-product",
          "drug-products",
          "drug_product",
          "drug_products",
          "pharma-product",
          "pharma-products"
        ],
        "fieldCount": 17
      },
      {
        "name": "batch_records",
        "displayName": "Batch Records",
        "family": "pharma",
        "aliases": [
          "batch-record",
          "batch-records",
          "batch_record",
          "batch_records",
          "manufacturing-batch",
          "manufacturing-batches"
        ],
        "fieldCount": 17
      },
      {
        "name": "lot_releases",
        "displayName": "Lot Releases",
        "family": "pharma",
        "aliases": [
          "lot-release",
          "lot-releases",
          "lot_release",
          "lot_releases",
          "batch-release",
          "batch-releases"
        ],
        "fieldCount": 15
      },
      {
        "name": "adverse_events",
        "displayName": "Adverse Events",
        "family": "pharma",
        "aliases": [
          "adverse-event",
          "adverse-events",
          "adverse_event",
          "adverse_events",
          "safety-event",
          "safety-events"
        ],
        "fieldCount": 17
      }
    ]
  },
  {
    "name": "iot",
    "displayName": "IoT",
    "description": "Things, devices, sensor readings, device commands, evidence, approvals, and physical-device gaps.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "iot_things",
        "displayName": "IoT Things",
        "family": "iot",
        "aliases": [
          "thing",
          "things",
          "iot-thing",
          "iot-things",
          "iot_thing",
          "iot_things"
        ],
        "fieldCount": 13
      },
      {
        "name": "iot_devices",
        "displayName": "IoT Devices",
        "family": "iot",
        "aliases": [
          "iot-device",
          "iot-devices",
          "iot_device",
          "iot_devices",
          "device",
          "devices"
        ],
        "fieldCount": 15
      },
      {
        "name": "sensor_readings",
        "displayName": "Sensor Readings",
        "family": "iot",
        "aliases": [
          "sensor-reading",
          "sensor-readings",
          "sensor_reading",
          "sensor_readings",
          "reading",
          "readings"
        ],
        "fieldCount": 14
      },
      {
        "name": "device_commands",
        "displayName": "Device Commands",
        "family": "iot",
        "aliases": [
          "device-command",
          "device-commands",
          "device_command",
          "device_commands",
          "iot-command",
          "iot-commands"
        ],
        "fieldCount": 16
      }
    ]
  },
  {
    "name": "construction",
    "displayName": "Construction",
    "description": "Construction projects, sites, RFIs, change orders, evidence, schedule/cost impact, and gaps.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "construction_projects",
        "displayName": "Construction Projects",
        "family": "construction",
        "aliases": [
          "construction-project",
          "construction-projects",
          "construction_project",
          "construction_projects",
          "build-project",
          "build-projects"
        ],
        "fieldCount": 16
      },
      {
        "name": "construction_sites",
        "displayName": "Construction Sites",
        "family": "construction",
        "aliases": [
          "construction-site",
          "construction-sites",
          "construction_site",
          "construction_sites",
          "job-site",
          "job-sites"
        ],
        "fieldCount": 13
      },
      {
        "name": "construction_rfis",
        "displayName": "Construction RFIs",
        "family": "construction",
        "aliases": [
          "construction-rfi",
          "construction-rfis",
          "construction_rfi",
          "construction_rfis",
          "rfi",
          "rfis"
        ],
        "fieldCount": 17
      },
      {
        "name": "construction_change_orders",
        "displayName": "Construction Change Orders",
        "family": "construction",
        "aliases": [
          "construction-change-order",
          "construction-change-orders",
          "construction_change_order",
          "construction_change_orders",
          "change-order",
          "change-orders"
        ],
        "fieldCount": 18
      }
    ]
  },
  {
    "name": "eln",
    "displayName": "Electronic Lab Notebook / ELN",
    "description": "Lab notebooks, authored entries, protocol runs, experiment observations, evidence, and gaps over research/biology/labs records.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "lab_notebooks",
        "displayName": "Lab Notebooks",
        "family": "eln",
        "aliases": [
          "lab-notebook",
          "lab-notebooks",
          "lab_notebook",
          "lab_notebooks",
          "eln-notebook",
          "eln-notebooks"
        ],
        "fieldCount": 15
      },
      {
        "name": "notebook_entries",
        "displayName": "Notebook Entries",
        "family": "eln",
        "aliases": [
          "notebook-entry",
          "notebook-entries",
          "notebook_entry",
          "notebook_entries",
          "eln-entry",
          "eln-entries"
        ],
        "fieldCount": 17
      },
      {
        "name": "protocol_runs",
        "displayName": "Protocol Runs",
        "family": "eln",
        "aliases": [
          "protocol-run",
          "protocol-runs",
          "protocol_run",
          "protocol_runs",
          "eln-protocol-run",
          "eln-protocol-runs"
        ],
        "fieldCount": 19
      },
      {
        "name": "experiment_observations",
        "displayName": "Experiment Observations",
        "family": "eln",
        "aliases": [
          "experiment-observation",
          "experiment-observations",
          "experiment_observation",
          "experiment_observations",
          "eln-observation",
          "eln-observations"
        ],
        "fieldCount": 20
      }
    ]
  },
  {
    "name": "transport",
    "displayName": "Transport / TMS",
    "description": "Carriers, shipments, shipment legs, freight rates, evidence, and gaps for transport management.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "carriers",
        "displayName": "Carriers",
        "family": "transport",
        "aliases": [
          "carrier",
          "carriers",
          "freight-carrier",
          "freight-carriers"
        ],
        "fieldCount": 12
      },
      {
        "name": "shipments",
        "displayName": "Shipments",
        "family": "transport",
        "aliases": [
          "shipment",
          "shipments",
          "freight-shipment",
          "freight-shipments"
        ],
        "fieldCount": 22
      },
      {
        "name": "shipment_legs",
        "displayName": "Shipment Legs",
        "family": "transport",
        "aliases": [
          "shipment-leg",
          "shipment-legs",
          "shipment_leg",
          "shipment_legs",
          "freight-leg",
          "freight-legs"
        ],
        "fieldCount": 18
      },
      {
        "name": "freight_rates",
        "displayName": "Freight Rates",
        "family": "transport",
        "aliases": [
          "freight-rate",
          "freight-rates",
          "freight_rate",
          "freight_rates",
          "transport-rate",
          "transport-rates"
        ],
        "fieldCount": 18
      }
    ]
  },
  {
    "name": "travel",
    "displayName": "Travel",
    "description": "Trips, itineraries, places, flights, accommodations, packing lists.",
    "collectionCount": 11,
    "collections": [
      {
        "name": "trips",
        "displayName": "Trips",
        "family": "travel",
        "aliases": [
          "trip",
          "trips"
        ],
        "fieldCount": 9
      },
      {
        "name": "trip_itinerary_items",
        "displayName": "Trip Itinerary Items",
        "family": "travel",
        "aliases": [
          "trip_itinerary_item",
          "trip_itinerary_items"
        ],
        "fieldCount": 7
      },
      {
        "name": "trip_packing_lists",
        "displayName": "Trip Packing Lists",
        "family": "travel",
        "aliases": [
          "trip_packing_list",
          "trip_packing_lists"
        ],
        "fieldCount": 4
      },
      {
        "name": "packing_items",
        "displayName": "Packing Items",
        "family": "travel",
        "aliases": [
          "packing_item",
          "packing_items"
        ],
        "fieldCount": 6
      },
      {
        "name": "places_visited",
        "displayName": "Places Visited",
        "family": "travel",
        "aliases": [
          "place_visited",
          "places_visited"
        ],
        "fieldCount": 8
      },
      {
        "name": "places_wishlist",
        "displayName": "Places Wishlist",
        "family": "travel",
        "aliases": [
          "place_wishlist",
          "places_wishlist",
          "bucket_list_place"
        ],
        "fieldCount": 7
      },
      {
        "name": "accommodations_booked",
        "displayName": "Accommodations",
        "family": "travel",
        "aliases": [
          "accommodation_booked",
          "accommodations_booked",
          "accommodation"
        ],
        "fieldCount": 8
      },
      {
        "name": "flights",
        "displayName": "Flights",
        "family": "travel",
        "aliases": [
          "flight",
          "flights"
        ],
        "fieldCount": 11
      },
      {
        "name": "transports_booked",
        "displayName": "Transports",
        "family": "travel",
        "aliases": [
          "transport_booked",
          "transports_booked",
          "transport"
        ],
        "fieldCount": 10
      },
      {
        "name": "travel_documents",
        "displayName": "Travel Documents",
        "family": "travel",
        "aliases": [
          "travel_document",
          "travel_documents"
        ],
        "fieldCount": 6
      },
      {
        "name": "countries_visited",
        "displayName": "Countries Visited",
        "family": "travel",
        "aliases": [
          "country_visited",
          "countries_visited"
        ],
        "fieldCount": 5
      }
    ]
  },
  {
    "name": "relationships",
    "displayName": "Relationships",
    "description": "Personal contacts, birthdays, gifts, important dates.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "personal_contacts",
        "displayName": "Personal Contacts",
        "family": "relationships",
        "aliases": [
          "personal_contact",
          "personal_contacts"
        ],
        "fieldCount": 10
      },
      {
        "name": "personal_relationships",
        "displayName": "Relationships",
        "family": "relationships",
        "aliases": [
          "personal_relationship",
          "personal_relationships"
        ],
        "fieldCount": 6
      },
      {
        "name": "birthdays",
        "displayName": "Birthdays",
        "family": "relationships",
        "aliases": [
          "birthday",
          "birthdays"
        ],
        "fieldCount": 6
      },
      {
        "name": "important_dates",
        "displayName": "Important Dates",
        "family": "relationships",
        "aliases": [
          "important_date",
          "important_dates"
        ],
        "fieldCount": 6
      },
      {
        "name": "gifts_given",
        "displayName": "Gifts Given",
        "family": "relationships",
        "aliases": [
          "gift_given",
          "gifts_given"
        ],
        "fieldCount": 7
      },
      {
        "name": "gifts_received",
        "displayName": "Gifts Received",
        "family": "relationships",
        "aliases": [
          "gift_received",
          "gifts_received"
        ],
        "fieldCount": 6
      },
      {
        "name": "gift_ideas",
        "displayName": "Gift Ideas",
        "family": "relationships",
        "aliases": [
          "gift_idea",
          "gift_ideas"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "family_care",
    "displayName": "Family & Care",
    "description": "Family members, kids, milestones, caregivers, dependents.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "family_members",
        "displayName": "Family Members",
        "family": "family_care",
        "aliases": [
          "family_member",
          "family_members"
        ],
        "fieldCount": 7
      },
      {
        "name": "children_profiles",
        "displayName": "Children Profiles",
        "family": "family_care",
        "aliases": [
          "children_profile",
          "children_profiles",
          "kid"
        ],
        "fieldCount": 6
      },
      {
        "name": "child_milestones",
        "displayName": "Child Milestones",
        "family": "family_care",
        "aliases": [
          "child_milestone",
          "child_milestones"
        ],
        "fieldCount": 6
      },
      {
        "name": "child_growth_logs",
        "displayName": "Child Growth Logs",
        "family": "family_care",
        "aliases": [
          "child_growth_log",
          "child_growth_logs"
        ],
        "fieldCount": 6
      },
      {
        "name": "school_events",
        "displayName": "School Events",
        "family": "family_care",
        "aliases": [
          "school_event",
          "school_events"
        ],
        "fieldCount": 6
      },
      {
        "name": "caregivers",
        "displayName": "Caregivers",
        "family": "family_care",
        "aliases": [
          "caregiver",
          "caregivers"
        ],
        "fieldCount": 7
      },
      {
        "name": "dependents",
        "displayName": "Dependents",
        "family": "family_care",
        "aliases": [
          "dependent",
          "dependents"
        ],
        "fieldCount": 5
      },
      {
        "name": "family_documents",
        "displayName": "Family Documents",
        "family": "family_care",
        "aliases": [
          "family_document",
          "family_documents"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "romance",
    "displayName": "Romance & Dating",
    "description": "Matches, dates, romantic partners, anniversaries.",
    "collectionCount": 5,
    "collections": [
      {
        "name": "dating_matches",
        "displayName": "Dating Matches",
        "family": "romance",
        "aliases": [
          "dating_match",
          "dating_matches",
          "match"
        ],
        "fieldCount": 5
      },
      {
        "name": "dates_log",
        "displayName": "Dates",
        "family": "romance",
        "aliases": [
          "date_log",
          "dates_log"
        ],
        "fieldCount": 7
      },
      {
        "name": "romantic_partners",
        "displayName": "Romantic Partners",
        "family": "romance",
        "aliases": [
          "romantic_partner",
          "romantic_partners",
          "partner"
        ],
        "fieldCount": 5
      },
      {
        "name": "anniversary_dates",
        "displayName": "Anniversary Dates",
        "family": "romance",
        "aliases": [
          "anniversary_date",
          "anniversary_dates",
          "anniversary"
        ],
        "fieldCount": 5
      },
      {
        "name": "romantic_gifts",
        "displayName": "Romantic Gifts",
        "family": "romance",
        "aliases": [
          "romantic_gift",
          "romantic_gifts"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "pets",
    "displayName": "Pets",
    "description": "Pets, vet visits, vaccinations, feeding, weight, medications.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "pets",
        "displayName": "Pets",
        "family": "pets",
        "aliases": [
          "pet",
          "pets"
        ],
        "fieldCount": 9
      },
      {
        "name": "pet_vet_visits",
        "displayName": "Pet Vet Visits",
        "family": "pets",
        "aliases": [
          "pet_vet_visit",
          "pet_vet_visits"
        ],
        "fieldCount": 8
      },
      {
        "name": "pet_vaccinations",
        "displayName": "Pet Vaccinations",
        "family": "pets",
        "aliases": [
          "pet_vaccination",
          "pet_vaccinations"
        ],
        "fieldCount": 6
      },
      {
        "name": "pet_feeding_schedules",
        "displayName": "Pet Feeding Schedules",
        "family": "pets",
        "aliases": [
          "pet_feeding_schedule",
          "pet_feeding_schedules"
        ],
        "fieldCount": 7
      },
      {
        "name": "pet_weight_logs",
        "displayName": "Pet Weight Logs",
        "family": "pets",
        "aliases": [
          "pet_weight_log",
          "pet_weight_logs"
        ],
        "fieldCount": 4
      },
      {
        "name": "pet_medications",
        "displayName": "Pet Medications",
        "family": "pets",
        "aliases": [
          "pet_medication",
          "pet_medications"
        ],
        "fieldCount": 8
      }
    ]
  },
  {
    "name": "garden",
    "displayName": "Garden & Plants",
    "description": "Plants, garden plots, care logs, harvests, seedlings.",
    "collectionCount": 5,
    "collections": [
      {
        "name": "plants",
        "displayName": "Plants",
        "family": "garden",
        "aliases": [
          "plant",
          "plants"
        ],
        "fieldCount": 8
      },
      {
        "name": "plant_care_logs",
        "displayName": "Plant Care Logs",
        "family": "garden",
        "aliases": [
          "plant_care_log",
          "plant_care_logs"
        ],
        "fieldCount": 4
      },
      {
        "name": "garden_plots",
        "displayName": "Garden Plots",
        "family": "garden",
        "aliases": [
          "garden_plot",
          "garden_plots"
        ],
        "fieldCount": 5
      },
      {
        "name": "harvests",
        "displayName": "Harvests",
        "family": "garden",
        "aliases": [
          "harvest",
          "harvests"
        ],
        "fieldCount": 6
      },
      {
        "name": "seedlings",
        "displayName": "Seedlings",
        "family": "garden",
        "aliases": [
          "seedling",
          "seedlings"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "events_memories",
    "displayName": "Events & Memories",
    "description": "Personal events, memories, curated photos, albums.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "personal_events",
        "displayName": "Personal Events",
        "family": "events_memories",
        "aliases": [
          "personal_event",
          "personal_events"
        ],
        "fieldCount": 8
      },
      {
        "name": "memories",
        "displayName": "Memories",
        "family": "events_memories",
        "aliases": [
          "memory",
          "memories"
        ],
        "fieldCount": 7
      },
      {
        "name": "photos_curated",
        "displayName": "Curated Photos",
        "family": "events_memories",
        "aliases": [
          "photo_curated",
          "photos_curated"
        ],
        "fieldCount": 8
      },
      {
        "name": "photo_albums",
        "displayName": "Photo Albums",
        "family": "events_memories",
        "aliases": [
          "photo_album",
          "photo_albums",
          "album"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "personal_documents",
    "displayName": "Personal Documents",
    "description": "IDs, passports, insurance, contracts, deeds, receipts, emergency contacts.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "identity_documents",
        "displayName": "Identity Documents",
        "family": "personal_documents",
        "aliases": [
          "identity_document",
          "identity_documents"
        ],
        "fieldCount": 8
      },
      {
        "name": "insurance_policies",
        "displayName": "Insurance Policies",
        "family": "personal_documents",
        "aliases": [
          "insurance_policy",
          "insurance_policies"
        ],
        "fieldCount": 10
      },
      {
        "name": "contracts_personal",
        "displayName": "Contracts",
        "family": "personal_documents",
        "aliases": [
          "contract_personal",
          "contracts_personal",
          "contract"
        ],
        "fieldCount": 7
      },
      {
        "name": "deeds_titles",
        "displayName": "Deeds & Titles",
        "family": "personal_documents",
        "aliases": [
          "deed_title",
          "deeds_titles",
          "deed"
        ],
        "fieldCount": 6
      },
      {
        "name": "important_receipts",
        "displayName": "Important Receipts",
        "family": "personal_documents",
        "aliases": [
          "important_receipt",
          "important_receipts",
          "receipt"
        ],
        "fieldCount": 8
      },
      {
        "name": "general_personal_documents",
        "displayName": "General Personal Documents",
        "family": "personal_documents",
        "aliases": [
          "general_personal_document",
          "general_personal_documents"
        ],
        "fieldCount": 5
      },
      {
        "name": "emergency_contacts",
        "displayName": "Emergency Contacts",
        "family": "personal_documents",
        "aliases": [
          "emergency_contact",
          "emergency_contacts"
        ],
        "fieldCount": 7
      },
      {
        "name": "legal_documents",
        "displayName": "Legal Documents",
        "family": "personal_documents",
        "aliases": [
          "legal_document",
          "legal_documents"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "marketplace_real_estate",
    "displayName": "Marketplace · Real Estate",
    "description": "Property listings, visits, offers, inspections.",
    "collectionCount": 4,
    "collections": [
      {
        "name": "property_listings",
        "displayName": "Property Listings",
        "family": "marketplace_real_estate",
        "aliases": [
          "property_listing",
          "property_listings",
          "property"
        ],
        "fieldCount": 14
      },
      {
        "name": "property_visits",
        "displayName": "Property Visits",
        "family": "marketplace_real_estate",
        "aliases": [
          "property_visit",
          "property_visits"
        ],
        "fieldCount": 5
      },
      {
        "name": "property_offers",
        "displayName": "Property Offers",
        "family": "marketplace_real_estate",
        "aliases": [
          "property_offer",
          "property_offers"
        ],
        "fieldCount": 7
      },
      {
        "name": "property_inspections",
        "displayName": "Property Inspections",
        "family": "marketplace_real_estate",
        "aliases": [
          "property_inspection",
          "property_inspections"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "marketplace_vehicles",
    "displayName": "Marketplace · Used Vehicles",
    "description": "Used vehicle listings, test drives, inspections.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "vehicle_listings",
        "displayName": "Vehicle Listings",
        "family": "marketplace_vehicles",
        "aliases": [
          "vehicle_listing",
          "vehicle_listings"
        ],
        "fieldCount": 14
      },
      {
        "name": "vehicle_test_drives",
        "displayName": "Vehicle Test Drives",
        "family": "marketplace_vehicles",
        "aliases": [
          "vehicle_test_drive",
          "vehicle_test_drives"
        ],
        "fieldCount": 5
      },
      {
        "name": "vehicle_inspections",
        "displayName": "Vehicle Inspections",
        "family": "marketplace_vehicles",
        "aliases": [
          "vehicle_inspection",
          "vehicle_inspections"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "marketplace_products",
    "displayName": "Marketplace · P2P Products",
    "description": "Generic P2P product listings, messages, offers.",
    "collectionCount": 3,
    "collections": [
      {
        "name": "product_listings",
        "displayName": "Product Listings",
        "family": "marketplace_products",
        "aliases": [
          "product_listing",
          "product_listings"
        ],
        "fieldCount": 10
      },
      {
        "name": "product_listing_messages",
        "displayName": "Product Listing Messages",
        "family": "marketplace_products",
        "aliases": [
          "product_listing_message",
          "product_listing_messages"
        ],
        "fieldCount": 6
      },
      {
        "name": "product_offers",
        "displayName": "Product Offers",
        "family": "marketplace_products",
        "aliases": [
          "product_offer",
          "product_offers"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "marketplace_services_rentals",
    "displayName": "Marketplace · Services & Rentals",
    "description": "Service listings, rentals, bookings, availability, reviews.",
    "collectionCount": 6,
    "collections": [
      {
        "name": "service_listings",
        "displayName": "Service Listings",
        "family": "marketplace_services_rentals",
        "aliases": [
          "service_listing",
          "service_listings"
        ],
        "fieldCount": 10
      },
      {
        "name": "rental_listings",
        "displayName": "Rental Listings",
        "family": "marketplace_services_rentals",
        "aliases": [
          "rental_listing",
          "rental_listings"
        ],
        "fieldCount": 10
      },
      {
        "name": "bookings",
        "displayName": "Bookings",
        "family": "marketplace_services_rentals",
        "aliases": [
          "booking",
          "bookings"
        ],
        "fieldCount": 9
      },
      {
        "name": "availability_slots",
        "displayName": "Availability Slots",
        "family": "marketplace_services_rentals",
        "aliases": [
          "availability_slot",
          "availability_slots"
        ],
        "fieldCount": 6
      },
      {
        "name": "reviews_received",
        "displayName": "Reviews Received",
        "family": "marketplace_services_rentals",
        "aliases": [
          "review_received",
          "reviews_received"
        ],
        "fieldCount": 7
      },
      {
        "name": "reviews_given",
        "displayName": "Reviews Given",
        "family": "marketplace_services_rentals",
        "aliases": [
          "review_given",
          "reviews_given"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "creativity",
    "displayName": "Creativity & Projects",
    "description": "Side projects, ideas, writing, music, art, inventions.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "creative_projects",
        "displayName": "Creative Projects",
        "family": "creativity",
        "aliases": [
          "creative_project",
          "creative_projects"
        ],
        "fieldCount": 9
      },
      {
        "name": "ideas",
        "displayName": "Ideas",
        "family": "creativity",
        "aliases": [
          "idea",
          "ideas"
        ],
        "fieldCount": 7
      },
      {
        "name": "writing_pieces",
        "displayName": "Writing Pieces",
        "family": "creativity",
        "aliases": [
          "writing_piece",
          "writing_pieces"
        ],
        "fieldCount": 7
      },
      {
        "name": "music_tracks",
        "displayName": "Music Tracks",
        "family": "creativity",
        "aliases": [
          "music_track",
          "music_tracks"
        ],
        "fieldCount": 8
      },
      {
        "name": "artworks",
        "displayName": "Artworks",
        "family": "creativity",
        "aliases": [
          "artwork",
          "artworks"
        ],
        "fieldCount": 6
      },
      {
        "name": "inventions",
        "displayName": "Inventions",
        "family": "creativity",
        "aliases": [
          "invention",
          "inventions"
        ],
        "fieldCount": 5
      },
      {
        "name": "creative_drafts",
        "displayName": "Creative Drafts",
        "family": "creativity",
        "aliases": [
          "creative_draft",
          "creative_drafts"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "communities_spirituality",
    "displayName": "Communities, Volunteering & Spirituality",
    "description": "Memberships, volunteering, donations, meditations, retreats.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "communities_membership",
        "displayName": "Community Memberships",
        "family": "communities_spirituality",
        "aliases": [
          "community_membership",
          "communities_membership",
          "community"
        ],
        "fieldCount": 7
      },
      {
        "name": "volunteer_activities",
        "displayName": "Volunteer Activities",
        "family": "communities_spirituality",
        "aliases": [
          "volunteer_activity",
          "volunteer_activities"
        ],
        "fieldCount": 7
      },
      {
        "name": "donations",
        "displayName": "Donations",
        "family": "communities_spirituality",
        "aliases": [
          "donation",
          "donations"
        ],
        "fieldCount": 7
      },
      {
        "name": "meditations",
        "displayName": "Meditations",
        "family": "communities_spirituality",
        "aliases": [
          "meditation",
          "meditations"
        ],
        "fieldCount": 5
      },
      {
        "name": "spiritual_practices",
        "displayName": "Spiritual Practices",
        "family": "communities_spirituality",
        "aliases": [
          "spiritual_practice",
          "spiritual_practices"
        ],
        "fieldCount": 6
      },
      {
        "name": "retreats_attended",
        "displayName": "Retreats Attended",
        "family": "communities_spirituality",
        "aliases": [
          "retreat_attended",
          "retreats_attended",
          "retreat"
        ],
        "fieldCount": 7
      },
      {
        "name": "religious_practices",
        "displayName": "Religious Practices",
        "family": "communities_spirituality",
        "aliases": [
          "religious_practice",
          "religious_practices"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "freelance_consumer",
    "displayName": "Freelance (Consumer Side)",
    "description": "Clients you bill as a freelancer, invoices, time entries, expenses.",
    "collectionCount": 5,
    "collections": [
      {
        "name": "freelance_clients",
        "displayName": "Freelance Clients",
        "family": "freelance_consumer",
        "aliases": [
          "freelance_client",
          "freelance_clients"
        ],
        "fieldCount": 9
      },
      {
        "name": "freelance_invoices",
        "displayName": "Freelance Invoices",
        "family": "freelance_consumer",
        "aliases": [
          "freelance_invoice",
          "freelance_invoices"
        ],
        "fieldCount": 10
      },
      {
        "name": "time_entries",
        "displayName": "Time Entries",
        "family": "freelance_consumer",
        "aliases": [
          "time_entry",
          "time_entries"
        ],
        "fieldCount": 10
      },
      {
        "name": "billable_expenses",
        "displayName": "Billable Expenses",
        "family": "freelance_consumer",
        "aliases": [
          "billable_expense",
          "billable_expenses"
        ],
        "fieldCount": 9
      },
      {
        "name": "contracts_freelance",
        "displayName": "Freelance Contracts",
        "family": "freelance_consumer",
        "aliases": [
          "contract_freelance",
          "contracts_freelance"
        ],
        "fieldCount": 10
      }
    ]
  },
  {
    "name": "luxury_and_collecting",
    "displayName": "Luxury & Collecting",
    "description": "Watches, jewelry, wine cellar, beer, spirits, cigars, fishing, hunting, geocaching, birdwatching, astronomy, antiques.",
    "collectionCount": 13,
    "collections": [
      {
        "name": "antiques_inventory",
        "displayName": "Antiques Inventory",
        "family": "luxury_and_collecting",
        "aliases": [
          "antique",
          "antiques_inventory"
        ],
        "fieldCount": 9
      },
      {
        "name": "astronomy_observations",
        "displayName": "Astronomy Observations",
        "family": "luxury_and_collecting",
        "aliases": [
          "astronomy_observation",
          "astronomy_observations"
        ],
        "fieldCount": 8
      },
      {
        "name": "beer_log",
        "displayName": "Beer Log",
        "family": "luxury_and_collecting",
        "aliases": [
          "beer_log_entry",
          "beer_log"
        ],
        "fieldCount": 10
      },
      {
        "name": "birdwatching_sightings",
        "displayName": "Birdwatching Sightings",
        "family": "luxury_and_collecting",
        "aliases": [
          "bird_sighting",
          "birdwatching_sightings"
        ],
        "fieldCount": 9
      },
      {
        "name": "cigars",
        "displayName": "Cigars",
        "family": "luxury_and_collecting",
        "aliases": [
          "cigar",
          "cigars"
        ],
        "fieldCount": 10
      },
      {
        "name": "cocktails_recipes",
        "displayName": "Cocktails Recipes",
        "family": "luxury_and_collecting",
        "aliases": [
          "cocktail",
          "cocktails_recipes"
        ],
        "fieldCount": 10
      },
      {
        "name": "fishing_catches",
        "displayName": "Fishing Catches",
        "family": "luxury_and_collecting",
        "aliases": [
          "fishing_catch",
          "fishing_catches"
        ],
        "fieldCount": 11
      },
      {
        "name": "geocaching_finds",
        "displayName": "Geocaching Finds",
        "family": "luxury_and_collecting",
        "aliases": [
          "geocache",
          "geocaching_finds"
        ],
        "fieldCount": 7
      },
      {
        "name": "hunting_log",
        "displayName": "Hunting Log",
        "family": "luxury_and_collecting",
        "aliases": [
          "hunting_log_entry",
          "hunting_log"
        ],
        "fieldCount": 10
      },
      {
        "name": "jewelry_items",
        "displayName": "Jewelry Items",
        "family": "luxury_and_collecting",
        "aliases": [
          "jewelry_item",
          "jewelry_items",
          "jewelry"
        ],
        "fieldCount": 10
      },
      {
        "name": "spirits_collection",
        "displayName": "Spirits Collection",
        "family": "luxury_and_collecting",
        "aliases": [
          "spirit",
          "spirits_collection"
        ],
        "fieldCount": 11
      },
      {
        "name": "watches",
        "displayName": "Watches",
        "family": "luxury_and_collecting",
        "aliases": [
          "watch",
          "watches"
        ],
        "fieldCount": 11
      },
      {
        "name": "wine_cellar_bottles",
        "displayName": "Wine Cellar Bottles",
        "family": "luxury_and_collecting",
        "aliases": [
          "wine_cellar_bottle",
          "wine_cellar_bottles"
        ],
        "fieldCount": 14
      }
    ]
  },
  {
    "name": "pregnancy_early_childhood",
    "displayName": "Pregnancy & Early Childhood",
    "description": "Pregnancies, prenatal visits, contractions, baby feeding, diapers, sleep, breastfeeding, pumping.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "baby_diaper_changes",
        "displayName": "Baby Diaper Changes",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "baby_diaper_change",
          "baby_diaper_changes"
        ],
        "fieldCount": 4
      },
      {
        "name": "baby_feeding_logs",
        "displayName": "Baby Feeding Logs",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "baby_feeding_log",
          "baby_feeding_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "baby_sleep_logs",
        "displayName": "Baby Sleep Logs",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "baby_sleep_log",
          "baby_sleep_logs"
        ],
        "fieldCount": 7
      },
      {
        "name": "breastfeeding_sessions",
        "displayName": "Breastfeeding Sessions",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "breastfeeding_session",
          "breastfeeding_sessions"
        ],
        "fieldCount": 6
      },
      {
        "name": "contractions_logs",
        "displayName": "Contractions Logs",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "contraction_log",
          "contractions_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "pregnancies",
        "displayName": "Pregnancies",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "pregnancy",
          "pregnancies"
        ],
        "fieldCount": 6
      },
      {
        "name": "prenatal_visits",
        "displayName": "Prenatal Visits",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "prenatal_visit",
          "prenatal_visits"
        ],
        "fieldCount": 8
      },
      {
        "name": "pumping_sessions",
        "displayName": "Pumping Sessions",
        "family": "pregnancy_early_childhood",
        "aliases": [
          "pumping_session",
          "pumping_sessions"
        ],
        "fieldCount": 7
      }
    ]
  },
  {
    "name": "mental_health_recovery",
    "displayName": "Mental Health & Recovery",
    "description": "Therapy, panic logs, mood episodes, sobriety trackers, cravings, dissociation, ED behaviors, self-harm urges.",
    "collectionCount": 10,
    "collections": [
      {
        "name": "cravings_logs",
        "displayName": "Cravings Logs",
        "family": "mental_health_recovery",
        "aliases": [
          "craving_log",
          "cravings_logs"
        ],
        "fieldCount": 7
      },
      {
        "name": "dissociation_events",
        "displayName": "Dissociation Events",
        "family": "mental_health_recovery",
        "aliases": [
          "dissociation_event",
          "dissociation_events"
        ],
        "fieldCount": 6
      },
      {
        "name": "eating_disorder_behaviors",
        "displayName": "Eating Disorder Behaviors",
        "family": "mental_health_recovery",
        "aliases": [
          "eating_disorder_behavior",
          "eating_disorder_behaviors"
        ],
        "fieldCount": 5
      },
      {
        "name": "mood_episodes",
        "displayName": "Mood Episodes",
        "family": "mental_health_recovery",
        "aliases": [
          "mood_episode",
          "mood_episodes"
        ],
        "fieldCount": 5
      },
      {
        "name": "panic_anxiety_logs",
        "displayName": "Panic & Anxiety Logs",
        "family": "mental_health_recovery",
        "aliases": [
          "panic_anxiety_log",
          "panic_anxiety_logs"
        ],
        "fieldCount": 7
      },
      {
        "name": "self_harm_urges",
        "displayName": "Self-Harm Urges",
        "family": "mental_health_recovery",
        "aliases": [
          "self_harm_urge",
          "self_harm_urges"
        ],
        "fieldCount": 5
      },
      {
        "name": "sobriety_slips",
        "displayName": "Sobriety Slips",
        "family": "mental_health_recovery",
        "aliases": [
          "sobriety_slip",
          "sobriety_slips"
        ],
        "fieldCount": 6
      },
      {
        "name": "sobriety_trackers",
        "displayName": "Sobriety Trackers",
        "family": "mental_health_recovery",
        "aliases": [
          "sobriety_tracker",
          "sobriety_trackers"
        ],
        "fieldCount": 7
      },
      {
        "name": "therapists",
        "displayName": "Therapists",
        "family": "mental_health_recovery",
        "aliases": [
          "therapist",
          "therapists"
        ],
        "fieldCount": 8
      },
      {
        "name": "therapy_sessions",
        "displayName": "Therapy Sessions",
        "family": "mental_health_recovery",
        "aliases": [
          "therapy_session",
          "therapy_sessions"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "social_culture",
    "displayName": "Social & Culture",
    "description": "Museums, exhibitions, concerts, theater, sport events, nightlife, festivals.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "concerts_attended",
        "displayName": "Concerts Attended",
        "family": "social_culture",
        "aliases": [
          "concert",
          "concerts_attended"
        ],
        "fieldCount": 10
      },
      {
        "name": "exhibitions_seen",
        "displayName": "Exhibitions Seen",
        "family": "social_culture",
        "aliases": [
          "exhibition",
          "exhibitions_seen"
        ],
        "fieldCount": 8
      },
      {
        "name": "festivals_attended",
        "displayName": "Festivals Attended",
        "family": "social_culture",
        "aliases": [
          "festival",
          "festivals_attended"
        ],
        "fieldCount": 10
      },
      {
        "name": "museums_visited",
        "displayName": "Museums Visited",
        "family": "social_culture",
        "aliases": [
          "museum",
          "museums_visited"
        ],
        "fieldCount": 8
      },
      {
        "name": "parties_nightlife_log",
        "displayName": "Parties & Nightlife Log",
        "family": "social_culture",
        "aliases": [
          "nightlife_entry",
          "parties_nightlife_log"
        ],
        "fieldCount": 9
      },
      {
        "name": "sport_events_attended",
        "displayName": "Sport Events Attended",
        "family": "social_culture",
        "aliases": [
          "sport_event_attendance",
          "sport_events_attended"
        ],
        "fieldCount": 8
      },
      {
        "name": "theater_opera_attended",
        "displayName": "Theater & Opera Attended",
        "family": "social_culture",
        "aliases": [
          "theater_attendance",
          "theater_opera_attended"
        ],
        "fieldCount": 8
      }
    ]
  },
  {
    "name": "identity_body_religious_fine",
    "displayName": "Identity, Body & Religious Practices",
    "description": "Body modifications, hair changes, granular prayer log, fasting, scripture reading, identity milestones, advocacy.",
    "collectionCount": 7,
    "collections": [
      {
        "name": "advocacy_log",
        "displayName": "Advocacy Log",
        "family": "identity_body_religious_fine",
        "aliases": [
          "advocacy_entry",
          "advocacy_log"
        ],
        "fieldCount": 6
      },
      {
        "name": "body_modifications",
        "displayName": "Body Modifications",
        "family": "identity_body_religious_fine",
        "aliases": [
          "body_modification",
          "body_modifications"
        ],
        "fieldCount": 10
      },
      {
        "name": "fasting_log",
        "displayName": "Fasting Log",
        "family": "identity_body_religious_fine",
        "aliases": [
          "fasting_log_entry",
          "fasting_log"
        ],
        "fieldCount": 6
      },
      {
        "name": "hair_changes",
        "displayName": "Hair Changes",
        "family": "identity_body_religious_fine",
        "aliases": [
          "hair_change",
          "hair_changes"
        ],
        "fieldCount": 8
      },
      {
        "name": "identity_journey_milestones",
        "displayName": "Identity Journey Milestones",
        "family": "identity_body_religious_fine",
        "aliases": [
          "identity_milestone",
          "identity_journey_milestones"
        ],
        "fieldCount": 6
      },
      {
        "name": "prayer_log_granular",
        "displayName": "Prayer Log (granular)",
        "family": "identity_body_religious_fine",
        "aliases": [
          "prayer_entry",
          "prayer_log_granular"
        ],
        "fieldCount": 7
      },
      {
        "name": "scripture_reading_log",
        "displayName": "Scripture Reading Log",
        "family": "identity_body_religious_fine",
        "aliases": [
          "scripture_reading_entry",
          "scripture_reading_log"
        ],
        "fieldCount": 6
      }
    ]
  },
  {
    "name": "reproductive_intimate",
    "displayName": "Reproductive & Intimate Health",
    "description": "Fertility cycles, BBT, ovulation tests, TTC, pregnancy losses, IVF, STI tests, contraceptives, intimate encounters.",
    "collectionCount": 9,
    "collections": [
      {
        "name": "bbt_logs",
        "displayName": "BBT Logs",
        "family": "reproductive_intimate",
        "aliases": [
          "bbt_log",
          "bbt_logs"
        ],
        "fieldCount": 4
      },
      {
        "name": "contraceptive_use",
        "displayName": "Contraceptive Use",
        "family": "reproductive_intimate",
        "aliases": [
          "contraceptive",
          "contraceptive_use"
        ],
        "fieldCount": 6
      },
      {
        "name": "fertility_cycles",
        "displayName": "Fertility Cycles",
        "family": "reproductive_intimate",
        "aliases": [
          "fertility_cycle",
          "fertility_cycles"
        ],
        "fieldCount": 6
      },
      {
        "name": "intimate_encounters",
        "displayName": "Intimate Encounters",
        "family": "reproductive_intimate",
        "aliases": [
          "intimate_encounter",
          "intimate_encounters"
        ],
        "fieldCount": 5
      },
      {
        "name": "ivf_cycles",
        "displayName": "IVF Cycles",
        "family": "reproductive_intimate",
        "aliases": [
          "ivf_cycle",
          "ivf_cycles"
        ],
        "fieldCount": 10
      },
      {
        "name": "ovulation_tests",
        "displayName": "Ovulation Tests",
        "family": "reproductive_intimate",
        "aliases": [
          "ovulation_test",
          "ovulation_tests"
        ],
        "fieldCount": 3
      },
      {
        "name": "pregnancy_losses",
        "displayName": "Pregnancy Losses",
        "family": "reproductive_intimate",
        "aliases": [
          "pregnancy_loss",
          "pregnancy_losses"
        ],
        "fieldCount": 5
      },
      {
        "name": "sti_tests",
        "displayName": "STI Tests",
        "family": "reproductive_intimate",
        "aliases": [
          "sti_test",
          "sti_tests"
        ],
        "fieldCount": 7
      },
      {
        "name": "ttc_logs",
        "displayName": "TTC Logs",
        "family": "reproductive_intimate",
        "aliases": [
          "ttc_log",
          "ttc_logs"
        ],
        "fieldCount": 4
      }
    ]
  },
  {
    "name": "personal_care_aesthetics",
    "displayName": "Personal Care & Aesthetics",
    "description": "Skincare routines, beauty appointments, fragrances, makeup, eyewear, hair logs, depilation.",
    "collectionCount": 8,
    "collections": [
      {
        "name": "beauty_appointments",
        "displayName": "Beauty Appointments",
        "family": "personal_care_aesthetics",
        "aliases": [
          "beauty_appointment",
          "beauty_appointments"
        ],
        "fieldCount": 6
      },
      {
        "name": "depilation_logs",
        "displayName": "Depilation Logs",
        "family": "personal_care_aesthetics",
        "aliases": [
          "depilation_log",
          "depilation_logs"
        ],
        "fieldCount": 6
      },
      {
        "name": "eyewear",
        "displayName": "Eyewear",
        "family": "personal_care_aesthetics",
        "aliases": [
          "eyewear_item",
          "eyewear"
        ],
        "fieldCount": 7
      },
      {
        "name": "fragrances_owned",
        "displayName": "Fragrances Owned",
        "family": "personal_care_aesthetics",
        "aliases": [
          "fragrance",
          "fragrances_owned"
        ],
        "fieldCount": 12
      },
      {
        "name": "hair_logs",
        "displayName": "Hair Logs",
        "family": "personal_care_aesthetics",
        "aliases": [
          "hair_log",
          "hair_logs"
        ],
        "fieldCount": 7
      },
      {
        "name": "makeup_catalog",
        "displayName": "Makeup Catalog",
        "family": "personal_care_aesthetics",
        "aliases": [
          "makeup_item",
          "makeup_catalog"
        ],
        "fieldCount": 9
      },
      {
        "name": "skincare_logs",
        "displayName": "Skincare Logs",
        "family": "personal_care_aesthetics",
        "aliases": [
          "skincare_log",
          "skincare_logs"
        ],
        "fieldCount": 5
      },
      {
        "name": "skincare_routines",
        "displayName": "Skincare Routines",
        "family": "personal_care_aesthetics",
        "aliases": [
          "skincare_routine",
          "skincare_routines"
        ],
        "fieldCount": 5
      }
    ]
  },
  {
    "name": "meta",
    "displayName": "CLI Self-Governance",
    "description": "System-level collections that hold the CLI's own operational metadata: instruction overrides, agent-proposed rules, and self-governance state.",
    "collectionCount": 1,
    "collections": [
      {
        "name": "instructions",
        "displayName": "CLI Instructions",
        "family": "meta",
        "aliases": [
          "instruction",
          "instructions",
          "claw_instruction",
          "claw_instructions"
        ],
        "fieldCount": 24
      }
    ]
  }
] as const;

export const compactBuiltinCollectionAliases: readonly CompactBuiltinCollectionAlias[] = [
  {
    "alias": "1on1",
    "canonicalName": "one_on_ones"
  },
  {
    "alias": "ab_test",
    "canonicalName": "experiments"
  },
  {
    "alias": "accommodation",
    "canonicalName": "accommodations_booked"
  },
  {
    "alias": "accommodation_booked",
    "canonicalName": "accommodations_booked"
  },
  {
    "alias": "accommodations_booked",
    "canonicalName": "accommodations_booked"
  },
  {
    "alias": "account",
    "canonicalName": "accounts"
  },
  {
    "alias": "accounts",
    "canonicalName": "accounts"
  },
  {
    "alias": "action_run",
    "canonicalName": "action_runs"
  },
  {
    "alias": "action_runs",
    "canonicalName": "action_runs"
  },
  {
    "alias": "activities",
    "canonicalName": "activities"
  },
  {
    "alias": "activity",
    "canonicalName": "activities"
  },
  {
    "alias": "actor",
    "canonicalName": "actors"
  },
  {
    "alias": "actors",
    "canonicalName": "actors"
  },
  {
    "alias": "adverse_event",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "adverse_events",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "adverse-event",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "adverse-events",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "advocacy_entry",
    "canonicalName": "advocacy_log"
  },
  {
    "alias": "advocacy_log",
    "canonicalName": "advocacy_log"
  },
  {
    "alias": "agencies",
    "canonicalName": "agencies"
  },
  {
    "alias": "agency",
    "canonicalName": "agencies"
  },
  {
    "alias": "agent",
    "canonicalName": "agents"
  },
  {
    "alias": "agent_activities",
    "canonicalName": "agent_session_activities"
  },
  {
    "alias": "agent_activity",
    "canonicalName": "agent_session_activities"
  },
  {
    "alias": "agent_assignment",
    "canonicalName": "agent_assignments"
  },
  {
    "alias": "agent_assignments",
    "canonicalName": "agent_assignments"
  },
  {
    "alias": "agent_blueprint",
    "canonicalName": "agent_blueprints"
  },
  {
    "alias": "agent_blueprints",
    "canonicalName": "agent_blueprints"
  },
  {
    "alias": "agent_budget",
    "canonicalName": "agent_budgets"
  },
  {
    "alias": "agent_budgets",
    "canonicalName": "agent_budgets"
  },
  {
    "alias": "agent_config_revision",
    "canonicalName": "agent_config_revisions"
  },
  {
    "alias": "agent_config_revisions",
    "canonicalName": "agent_config_revisions"
  },
  {
    "alias": "agent_evaluation",
    "canonicalName": "agent_evaluations"
  },
  {
    "alias": "agent_evaluations",
    "canonicalName": "agent_evaluations"
  },
  {
    "alias": "agent_execution_profile",
    "canonicalName": "agent_execution_profiles"
  },
  {
    "alias": "agent_execution_profiles",
    "canonicalName": "agent_execution_profiles"
  },
  {
    "alias": "agent_incident",
    "canonicalName": "agent_incidents"
  },
  {
    "alias": "agent_incidents",
    "canonicalName": "agent_incidents"
  },
  {
    "alias": "agent_memory_policies",
    "canonicalName": "agent_memory_policies"
  },
  {
    "alias": "agent_memory_policy",
    "canonicalName": "agent_memory_policies"
  },
  {
    "alias": "agent_resource_grant",
    "canonicalName": "agent_resource_grants"
  },
  {
    "alias": "agent_resource_grants",
    "canonicalName": "agent_resource_grants"
  },
  {
    "alias": "agent_run",
    "canonicalName": "agent_runs"
  },
  {
    "alias": "agent_runs",
    "canonicalName": "agent_runs"
  },
  {
    "alias": "agent_session",
    "canonicalName": "agent_sessions"
  },
  {
    "alias": "agent_session_activities",
    "canonicalName": "agent_session_activities"
  },
  {
    "alias": "agent_session_activity",
    "canonicalName": "agent_session_activities"
  },
  {
    "alias": "agent_session_pr",
    "canonicalName": "agent_session_pull_requests"
  },
  {
    "alias": "agent_session_pull_request",
    "canonicalName": "agent_session_pull_requests"
  },
  {
    "alias": "agent_session_pull_requests",
    "canonicalName": "agent_session_pull_requests"
  },
  {
    "alias": "agent_sessions",
    "canonicalName": "agent_sessions"
  },
  {
    "alias": "agent_skill",
    "canonicalName": "agent_skills"
  },
  {
    "alias": "agent_skills",
    "canonicalName": "agent_skills"
  },
  {
    "alias": "agent_template",
    "canonicalName": "agent_blueprints"
  },
  {
    "alias": "agents",
    "canonicalName": "agents"
  },
  {
    "alias": "album",
    "canonicalName": "photo_albums"
  },
  {
    "alias": "alert",
    "canonicalName": "alert_rules"
  },
  {
    "alias": "alert_rule",
    "canonicalName": "alert_rules"
  },
  {
    "alias": "alert_rules",
    "canonicalName": "alert_rules"
  },
  {
    "alias": "alerts",
    "canonicalName": "alert_rules"
  },
  {
    "alias": "allergies",
    "canonicalName": "allergies_diagnosed"
  },
  {
    "alias": "allergies_diagnosed",
    "canonicalName": "allergies_diagnosed"
  },
  {
    "alias": "allergy",
    "canonicalName": "allergies_diagnosed"
  },
  {
    "alias": "analytics_event",
    "canonicalName": "analytics_events"
  },
  {
    "alias": "analytics_events",
    "canonicalName": "analytics_events"
  },
  {
    "alias": "analytics_group",
    "canonicalName": "analytics_groups"
  },
  {
    "alias": "analytics_groups",
    "canonicalName": "analytics_groups"
  },
  {
    "alias": "analytics_person",
    "canonicalName": "analytics_persons"
  },
  {
    "alias": "analytics_persons",
    "canonicalName": "analytics_persons"
  },
  {
    "alias": "anniversary",
    "canonicalName": "anniversary_dates"
  },
  {
    "alias": "anniversary_date",
    "canonicalName": "anniversary_dates"
  },
  {
    "alias": "anniversary_dates",
    "canonicalName": "anniversary_dates"
  },
  {
    "alias": "antique",
    "canonicalName": "antiques_inventory"
  },
  {
    "alias": "antiques_inventory",
    "canonicalName": "antiques_inventory"
  },
  {
    "alias": "api_key",
    "canonicalName": "api_keys"
  },
  {
    "alias": "api_keys",
    "canonicalName": "api_keys"
  },
  {
    "alias": "apikey",
    "canonicalName": "api_keys"
  },
  {
    "alias": "apikeys",
    "canonicalName": "api_keys"
  },
  {
    "alias": "app",
    "canonicalName": "oauth_apps"
  },
  {
    "alias": "appliance",
    "canonicalName": "appliances"
  },
  {
    "alias": "appliance_maintenance",
    "canonicalName": "appliance_maintenance"
  },
  {
    "alias": "appliances",
    "canonicalName": "appliances"
  },
  {
    "alias": "apps",
    "canonicalName": "oauth_apps"
  },
  {
    "alias": "article",
    "canonicalName": "knowledge_articles"
  },
  {
    "alias": "article_progress",
    "canonicalName": "article_progress"
  },
  {
    "alias": "articles",
    "canonicalName": "knowledge_articles"
  },
  {
    "alias": "artwork",
    "canonicalName": "artworks"
  },
  {
    "alias": "artworks",
    "canonicalName": "artworks"
  },
  {
    "alias": "assay",
    "canonicalName": "assays"
  },
  {
    "alias": "assays",
    "canonicalName": "assays"
  },
  {
    "alias": "assessment",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "assessments",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "asset",
    "canonicalName": "assets"
  },
  {
    "alias": "assets",
    "canonicalName": "assets"
  },
  {
    "alias": "association",
    "canonicalName": "associations"
  },
  {
    "alias": "associations",
    "canonicalName": "associations"
  },
  {
    "alias": "astronomy_observation",
    "canonicalName": "astronomy_observations"
  },
  {
    "alias": "astronomy_observations",
    "canonicalName": "astronomy_observations"
  },
  {
    "alias": "audiobook",
    "canonicalName": "audiobooks"
  },
  {
    "alias": "audiobook_progress",
    "canonicalName": "audiobook_progress"
  },
  {
    "alias": "audiobooks",
    "canonicalName": "audiobooks"
  },
  {
    "alias": "audit",
    "canonicalName": "audit_log"
  },
  {
    "alias": "audit_log",
    "canonicalName": "audit_log"
  },
  {
    "alias": "auth_identity_provider",
    "canonicalName": "auth_identity_providers"
  },
  {
    "alias": "auth_identity_providers",
    "canonicalName": "auth_identity_providers"
  },
  {
    "alias": "automation",
    "canonicalName": "automations"
  },
  {
    "alias": "automation_recipe",
    "canonicalName": "automation_recipes"
  },
  {
    "alias": "automation_recipes",
    "canonicalName": "automation_recipes"
  },
  {
    "alias": "automations",
    "canonicalName": "automations"
  },
  {
    "alias": "availability",
    "canonicalName": "availability_windows"
  },
  {
    "alias": "availability_slot",
    "canonicalName": "availability_slots"
  },
  {
    "alias": "availability_slots",
    "canonicalName": "availability_slots"
  },
  {
    "alias": "availability_window",
    "canonicalName": "availability_windows"
  },
  {
    "alias": "availability_windows",
    "canonicalName": "availability_windows"
  },
  {
    "alias": "baby_diaper_change",
    "canonicalName": "baby_diaper_changes"
  },
  {
    "alias": "baby_diaper_changes",
    "canonicalName": "baby_diaper_changes"
  },
  {
    "alias": "baby_feeding_log",
    "canonicalName": "baby_feeding_logs"
  },
  {
    "alias": "baby_feeding_logs",
    "canonicalName": "baby_feeding_logs"
  },
  {
    "alias": "baby_sleep_log",
    "canonicalName": "baby_sleep_logs"
  },
  {
    "alias": "baby_sleep_logs",
    "canonicalName": "baby_sleep_logs"
  },
  {
    "alias": "balance_transaction",
    "canonicalName": "balance_transactions"
  },
  {
    "alias": "balance_transactions",
    "canonicalName": "balance_transactions"
  },
  {
    "alias": "batch_record",
    "canonicalName": "batch_records"
  },
  {
    "alias": "batch_records",
    "canonicalName": "batch_records"
  },
  {
    "alias": "batch-record",
    "canonicalName": "batch_records"
  },
  {
    "alias": "batch-records",
    "canonicalName": "batch_records"
  },
  {
    "alias": "batch-release",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "batch-releases",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "bbt_log",
    "canonicalName": "bbt_logs"
  },
  {
    "alias": "bbt_logs",
    "canonicalName": "bbt_logs"
  },
  {
    "alias": "beauty_appointment",
    "canonicalName": "beauty_appointments"
  },
  {
    "alias": "beauty_appointments",
    "canonicalName": "beauty_appointments"
  },
  {
    "alias": "beer_log",
    "canonicalName": "beer_log"
  },
  {
    "alias": "beer_log_entry",
    "canonicalName": "beer_log"
  },
  {
    "alias": "benefit",
    "canonicalName": "benefits_enrollments"
  },
  {
    "alias": "benefits",
    "canonicalName": "benefits_enrollments"
  },
  {
    "alias": "benefits_enrollment",
    "canonicalName": "benefits_enrollments"
  },
  {
    "alias": "benefits_enrollments",
    "canonicalName": "benefits_enrollments"
  },
  {
    "alias": "bill",
    "canonicalName": "bills"
  },
  {
    "alias": "bill_payment",
    "canonicalName": "bill_payments"
  },
  {
    "alias": "bill_payments",
    "canonicalName": "bill_payments"
  },
  {
    "alias": "bill-of-materials",
    "canonicalName": "product_boms"
  },
  {
    "alias": "billable_expense",
    "canonicalName": "billable_expenses"
  },
  {
    "alias": "billable_expenses",
    "canonicalName": "billable_expenses"
  },
  {
    "alias": "billing_customer",
    "canonicalName": "billing_customers"
  },
  {
    "alias": "billing_customers",
    "canonicalName": "billing_customers"
  },
  {
    "alias": "bills",
    "canonicalName": "bills"
  },
  {
    "alias": "bills-of-materials",
    "canonicalName": "product_boms"
  },
  {
    "alias": "bio_experiment",
    "canonicalName": "biology_experiments"
  },
  {
    "alias": "bio_experiments",
    "canonicalName": "biology_experiments"
  },
  {
    "alias": "biological_entities",
    "canonicalName": "organisms"
  },
  {
    "alias": "biological_entity",
    "canonicalName": "organisms"
  },
  {
    "alias": "biology_experiment",
    "canonicalName": "biology_experiments"
  },
  {
    "alias": "biology_experiments",
    "canonicalName": "biology_experiments"
  },
  {
    "alias": "bird_sighting",
    "canonicalName": "birdwatching_sightings"
  },
  {
    "alias": "birdwatching_sightings",
    "canonicalName": "birdwatching_sightings"
  },
  {
    "alias": "birthday",
    "canonicalName": "birthdays"
  },
  {
    "alias": "birthdays",
    "canonicalName": "birthdays"
  },
  {
    "alias": "block",
    "canonicalName": "document_blocks"
  },
  {
    "alias": "blocks",
    "canonicalName": "document_blocks"
  },
  {
    "alias": "board_game",
    "canonicalName": "board_games"
  },
  {
    "alias": "board_game_play",
    "canonicalName": "board_game_plays"
  },
  {
    "alias": "board_game_plays",
    "canonicalName": "board_game_plays"
  },
  {
    "alias": "board_games",
    "canonicalName": "board_games"
  },
  {
    "alias": "body_measurement",
    "canonicalName": "body_measurements"
  },
  {
    "alias": "body_measurements",
    "canonicalName": "body_measurements"
  },
  {
    "alias": "body_modification",
    "canonicalName": "body_modifications"
  },
  {
    "alias": "body_modifications",
    "canonicalName": "body_modifications"
  },
  {
    "alias": "book",
    "canonicalName": "books"
  },
  {
    "alias": "book_club",
    "canonicalName": "book_clubs"
  },
  {
    "alias": "book_club_meeting",
    "canonicalName": "book_club_meetings"
  },
  {
    "alias": "book_club_meetings",
    "canonicalName": "book_club_meetings"
  },
  {
    "alias": "book_clubs",
    "canonicalName": "book_clubs"
  },
  {
    "alias": "book_note",
    "canonicalName": "book_notes"
  },
  {
    "alias": "book_notes",
    "canonicalName": "book_notes"
  },
  {
    "alias": "book_progress_log",
    "canonicalName": "book_progress_logs"
  },
  {
    "alias": "book_progress_logs",
    "canonicalName": "book_progress_logs"
  },
  {
    "alias": "booking",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "booking_meeting_type",
    "canonicalName": "booking_meeting_types"
  },
  {
    "alias": "booking_meeting_types",
    "canonicalName": "booking_meeting_types"
  },
  {
    "alias": "booking_slot",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "booking_slots",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "bookings",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "bookmark",
    "canonicalName": "bookmarks"
  },
  {
    "alias": "bookmark_collection",
    "canonicalName": "bookmark_collections"
  },
  {
    "alias": "bookmark_collections",
    "canonicalName": "bookmark_collections"
  },
  {
    "alias": "bookmarks",
    "canonicalName": "bookmarks"
  },
  {
    "alias": "books",
    "canonicalName": "books"
  },
  {
    "alias": "branch",
    "canonicalName": "branches"
  },
  {
    "alias": "branches",
    "canonicalName": "branches"
  },
  {
    "alias": "brand-profile",
    "canonicalName": "content_brands"
  },
  {
    "alias": "brand-profiles",
    "canonicalName": "content_brands"
  },
  {
    "alias": "breastfeeding_session",
    "canonicalName": "breastfeeding_sessions"
  },
  {
    "alias": "breastfeeding_sessions",
    "canonicalName": "breastfeeding_sessions"
  },
  {
    "alias": "brewing_batch",
    "canonicalName": "brewing_batches"
  },
  {
    "alias": "brewing_batches",
    "canonicalName": "brewing_batches"
  },
  {
    "alias": "broadcast",
    "canonicalName": "email_campaigns"
  },
  {
    "alias": "broadcasts",
    "canonicalName": "email_campaigns"
  },
  {
    "alias": "bucket_list_place",
    "canonicalName": "places_wishlist"
  },
  {
    "alias": "budget",
    "canonicalName": "budgets"
  },
  {
    "alias": "budget_categories",
    "canonicalName": "budget_categories"
  },
  {
    "alias": "budget_category",
    "canonicalName": "budget_categories"
  },
  {
    "alias": "budgets",
    "canonicalName": "budgets"
  },
  {
    "alias": "build-project",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "build-projects",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "buyer",
    "canonicalName": "billing_customers"
  },
  {
    "alias": "buyers",
    "canonicalName": "billing_customers"
  },
  {
    "alias": "campaign",
    "canonicalName": "campaigns"
  },
  {
    "alias": "campaign_member",
    "canonicalName": "campaign_members"
  },
  {
    "alias": "campaign_members",
    "canonicalName": "campaign_members"
  },
  {
    "alias": "campaigns",
    "canonicalName": "campaigns"
  },
  {
    "alias": "canonical_operation",
    "canonicalName": "canonical_operations"
  },
  {
    "alias": "canonical_operations",
    "canonicalName": "canonical_operations"
  },
  {
    "alias": "card",
    "canonicalName": "payment_methods"
  },
  {
    "alias": "cards",
    "canonicalName": "payment_methods"
  },
  {
    "alias": "career_goal",
    "canonicalName": "career_goals"
  },
  {
    "alias": "career_goals",
    "canonicalName": "career_goals"
  },
  {
    "alias": "caregiver",
    "canonicalName": "caregivers"
  },
  {
    "alias": "caregivers",
    "canonicalName": "caregivers"
  },
  {
    "alias": "carrier",
    "canonicalName": "carriers"
  },
  {
    "alias": "carriers",
    "canonicalName": "carriers"
  },
  {
    "alias": "cart",
    "canonicalName": "shopping_carts"
  },
  {
    "alias": "carts",
    "canonicalName": "shopping_carts"
  },
  {
    "alias": "case",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "case_evidence",
    "canonicalName": "case_evidence"
  },
  {
    "alias": "cases",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "catalog_product",
    "canonicalName": "products_catalog"
  },
  {
    "alias": "certification",
    "canonicalName": "certifications_personal"
  },
  {
    "alias": "certifications",
    "canonicalName": "certifications_personal"
  },
  {
    "alias": "certifications_personal",
    "canonicalName": "certifications_personal"
  },
  {
    "alias": "change-order",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "change-orders",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "charge",
    "canonicalName": "charges"
  },
  {
    "alias": "chargeback",
    "canonicalName": "disputes"
  },
  {
    "alias": "chargebacks",
    "canonicalName": "disputes"
  },
  {
    "alias": "charges",
    "canonicalName": "charges"
  },
  {
    "alias": "checkin",
    "canonicalName": "mood_check_ins"
  },
  {
    "alias": "child_growth_log",
    "canonicalName": "child_growth_logs"
  },
  {
    "alias": "child_growth_logs",
    "canonicalName": "child_growth_logs"
  },
  {
    "alias": "child_milestone",
    "canonicalName": "child_milestones"
  },
  {
    "alias": "child_milestones",
    "canonicalName": "child_milestones"
  },
  {
    "alias": "children_profile",
    "canonicalName": "children_profiles"
  },
  {
    "alias": "children_profiles",
    "canonicalName": "children_profiles"
  },
  {
    "alias": "chore",
    "canonicalName": "chores"
  },
  {
    "alias": "chore_log",
    "canonicalName": "chore_logs"
  },
  {
    "alias": "chore_logs",
    "canonicalName": "chore_logs"
  },
  {
    "alias": "chores",
    "canonicalName": "chores"
  },
  {
    "alias": "churn",
    "canonicalName": "churn_analyses"
  },
  {
    "alias": "churn_analyses",
    "canonicalName": "churn_analyses"
  },
  {
    "alias": "churn_analysis",
    "canonicalName": "churn_analyses"
  },
  {
    "alias": "ci",
    "canonicalName": "action_runs"
  },
  {
    "alias": "ci_run",
    "canonicalName": "action_runs"
  },
  {
    "alias": "cigar",
    "canonicalName": "cigars"
  },
  {
    "alias": "cigars",
    "canonicalName": "cigars"
  },
  {
    "alias": "class",
    "canonicalName": "classes"
  },
  {
    "alias": "classes",
    "canonicalName": "classes"
  },
  {
    "alias": "claw_instruction",
    "canonicalName": "instructions"
  },
  {
    "alias": "claw_instructions",
    "canonicalName": "instructions"
  },
  {
    "alias": "clinic",
    "canonicalName": "clinics"
  },
  {
    "alias": "clinical_encounter",
    "canonicalName": "encounters"
  },
  {
    "alias": "clinical_encounters",
    "canonicalName": "encounters"
  },
  {
    "alias": "clinics",
    "canonicalName": "clinics"
  },
  {
    "alias": "clothes",
    "canonicalName": "clothes"
  },
  {
    "alias": "clothing",
    "canonicalName": "clothes"
  },
  {
    "alias": "cms-entries",
    "canonicalName": "content_entries"
  },
  {
    "alias": "cms-entry",
    "canonicalName": "content_entries"
  },
  {
    "alias": "cocktail",
    "canonicalName": "cocktails_recipes"
  },
  {
    "alias": "cocktails_recipes",
    "canonicalName": "cocktails_recipes"
  },
  {
    "alias": "code_owner",
    "canonicalName": "code_owners"
  },
  {
    "alias": "code_owners",
    "canonicalName": "code_owners"
  },
  {
    "alias": "codeowner",
    "canonicalName": "code_owners"
  },
  {
    "alias": "codeowners",
    "canonicalName": "code_owners"
  },
  {
    "alias": "coding_sandbox",
    "canonicalName": "coding_sandboxes"
  },
  {
    "alias": "coding_sandboxes",
    "canonicalName": "coding_sandboxes"
  },
  {
    "alias": "cohort",
    "canonicalName": "cohorts"
  },
  {
    "alias": "cohort_membership",
    "canonicalName": "cohort_memberships"
  },
  {
    "alias": "cohort_memberships",
    "canonicalName": "cohort_memberships"
  },
  {
    "alias": "cohorts",
    "canonicalName": "cohorts"
  },
  {
    "alias": "collectible",
    "canonicalName": "collectible_items"
  },
  {
    "alias": "collectible_item",
    "canonicalName": "collectible_items"
  },
  {
    "alias": "collectible_items",
    "canonicalName": "collectible_items"
  },
  {
    "alias": "collection_group",
    "canonicalName": "collection_groups"
  },
  {
    "alias": "collection_groups",
    "canonicalName": "collection_groups"
  },
  {
    "alias": "commit",
    "canonicalName": "commits"
  },
  {
    "alias": "commits",
    "canonicalName": "commits"
  },
  {
    "alias": "communities_membership",
    "canonicalName": "communities_membership"
  },
  {
    "alias": "community",
    "canonicalName": "communities_membership"
  },
  {
    "alias": "community_membership",
    "canonicalName": "communities_membership"
  },
  {
    "alias": "companies",
    "canonicalName": "companies"
  },
  {
    "alias": "companies_of_interest",
    "canonicalName": "companies_of_interest"
  },
  {
    "alias": "company",
    "canonicalName": "companies"
  },
  {
    "alias": "company_of_interest",
    "canonicalName": "companies_of_interest"
  },
  {
    "alias": "compliance_control",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "compliance_controls",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "compliance_finding",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "compliance_findings",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "compliance_obligation",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "compliance_obligations",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "compliance-control",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "compliance-controls",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "compliance-finding",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "compliance-findings",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "compliance-obligation",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "compliance-obligations",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "component",
    "canonicalName": "components"
  },
  {
    "alias": "components",
    "canonicalName": "components"
  },
  {
    "alias": "concept",
    "canonicalName": "concepts"
  },
  {
    "alias": "concept_mapping",
    "canonicalName": "concept_mappings"
  },
  {
    "alias": "concept_mappings",
    "canonicalName": "concept_mappings"
  },
  {
    "alias": "concepts",
    "canonicalName": "concepts"
  },
  {
    "alias": "concert",
    "canonicalName": "concerts_attended"
  },
  {
    "alias": "concerts_attended",
    "canonicalName": "concerts_attended"
  },
  {
    "alias": "config_revision",
    "canonicalName": "agent_config_revisions"
  },
  {
    "alias": "construction_change_order",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "construction_change_orders",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "construction_project",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "construction_projects",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "construction_rfi",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "construction_rfis",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "construction_site",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "construction_sites",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "construction-change-order",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "construction-change-orders",
    "canonicalName": "construction_change_orders"
  },
  {
    "alias": "construction-project",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "construction-projects",
    "canonicalName": "construction_projects"
  },
  {
    "alias": "construction-rfi",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "construction-rfis",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "construction-site",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "construction-sites",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "contact",
    "canonicalName": "contacts"
  },
  {
    "alias": "contact_professional",
    "canonicalName": "contacts_professional"
  },
  {
    "alias": "contacts",
    "canonicalName": "contacts"
  },
  {
    "alias": "contacts_professional",
    "canonicalName": "contacts_professional"
  },
  {
    "alias": "content_approval",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "content_approvals",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "content_brand",
    "canonicalName": "content_brands"
  },
  {
    "alias": "content_brands",
    "canonicalName": "content_brands"
  },
  {
    "alias": "content_campaign",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "content_campaigns",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "content_destination",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "content_destinations",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "content_entries",
    "canonicalName": "content_entries"
  },
  {
    "alias": "content_entry",
    "canonicalName": "content_entries"
  },
  {
    "alias": "content_publication",
    "canonicalName": "content_publications"
  },
  {
    "alias": "content_publications",
    "canonicalName": "content_publications"
  },
  {
    "alias": "content_revision",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "content_revisions",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "content_variant",
    "canonicalName": "content_variants"
  },
  {
    "alias": "content_variants",
    "canonicalName": "content_variants"
  },
  {
    "alias": "content-approval",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "content-approvals",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "content-brand",
    "canonicalName": "content_brands"
  },
  {
    "alias": "content-brands",
    "canonicalName": "content_brands"
  },
  {
    "alias": "content-campaign",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "content-campaigns",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "content-destination",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "content-destinations",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "content-entries",
    "canonicalName": "content_entries"
  },
  {
    "alias": "content-entry",
    "canonicalName": "content_entries"
  },
  {
    "alias": "content-publication",
    "canonicalName": "content_publications"
  },
  {
    "alias": "content-publications",
    "canonicalName": "content_publications"
  },
  {
    "alias": "content-revision",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "content-revisions",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "content-variant",
    "canonicalName": "content_variants"
  },
  {
    "alias": "content-variants",
    "canonicalName": "content_variants"
  },
  {
    "alias": "contraceptive",
    "canonicalName": "contraceptive_use"
  },
  {
    "alias": "contraceptive_use",
    "canonicalName": "contraceptive_use"
  },
  {
    "alias": "contract",
    "canonicalName": "contracts"
  },
  {
    "alias": "contract_freelance",
    "canonicalName": "contracts_freelance"
  },
  {
    "alias": "contract_personal",
    "canonicalName": "contracts_personal"
  },
  {
    "alias": "contraction_log",
    "canonicalName": "contractions_logs"
  },
  {
    "alias": "contractions_logs",
    "canonicalName": "contractions_logs"
  },
  {
    "alias": "contractor",
    "canonicalName": "contractors"
  },
  {
    "alias": "contractors",
    "canonicalName": "contractors"
  },
  {
    "alias": "contracts",
    "canonicalName": "contracts"
  },
  {
    "alias": "contracts_freelance",
    "canonicalName": "contracts_freelance"
  },
  {
    "alias": "contracts_personal",
    "canonicalName": "contracts_personal"
  },
  {
    "alias": "control",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "control_assessment",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "control_assessments",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "control-assessment",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "control-assessments",
    "canonicalName": "control_assessments"
  },
  {
    "alias": "controls",
    "canonicalName": "compliance_controls"
  },
  {
    "alias": "conversation",
    "canonicalName": "support_conversations"
  },
  {
    "alias": "conversations",
    "canonicalName": "support_conversations"
  },
  {
    "alias": "cookbook",
    "canonicalName": "cookbooks"
  },
  {
    "alias": "cookbooks",
    "canonicalName": "cookbooks"
  },
  {
    "alias": "countries_visited",
    "canonicalName": "countries_visited"
  },
  {
    "alias": "country_visited",
    "canonicalName": "countries_visited"
  },
  {
    "alias": "coupon",
    "canonicalName": "coupons"
  },
  {
    "alias": "coupons",
    "canonicalName": "coupons"
  },
  {
    "alias": "course",
    "canonicalName": "courses"
  },
  {
    "alias": "courses",
    "canonicalName": "courses"
  },
  {
    "alias": "cover_letter",
    "canonicalName": "cover_letters"
  },
  {
    "alias": "cover_letters",
    "canonicalName": "cover_letters"
  },
  {
    "alias": "craving_log",
    "canonicalName": "cravings_logs"
  },
  {
    "alias": "cravings_logs",
    "canonicalName": "cravings_logs"
  },
  {
    "alias": "creative_draft",
    "canonicalName": "creative_drafts"
  },
  {
    "alias": "creative_drafts",
    "canonicalName": "creative_drafts"
  },
  {
    "alias": "creative_project",
    "canonicalName": "creative_projects"
  },
  {
    "alias": "creative_projects",
    "canonicalName": "creative_projects"
  },
  {
    "alias": "crypto_holding",
    "canonicalName": "crypto_holdings"
  },
  {
    "alias": "crypto_holdings",
    "canonicalName": "crypto_holdings"
  },
  {
    "alias": "crypto_wallet",
    "canonicalName": "crypto_wallets"
  },
  {
    "alias": "crypto_wallets",
    "canonicalName": "crypto_wallets"
  },
  {
    "alias": "csat",
    "canonicalName": "satisfaction_ratings"
  },
  {
    "alias": "currencies",
    "canonicalName": "currencies"
  },
  {
    "alias": "currency",
    "canonicalName": "currencies"
  },
  {
    "alias": "customer",
    "canonicalName": "customers"
  },
  {
    "alias": "customer_need",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "customer_needs",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "customer_request",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "customer_requests",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "customer_tier",
    "canonicalName": "customer_tiers"
  },
  {
    "alias": "customer_tiers",
    "canonicalName": "customer_tiers"
  },
  {
    "alias": "customers",
    "canonicalName": "customers"
  },
  {
    "alias": "cv",
    "canonicalName": "resumes"
  },
  {
    "alias": "dashboard",
    "canonicalName": "dashboards"
  },
  {
    "alias": "dashboards",
    "canonicalName": "dashboards"
  },
  {
    "alias": "data_gap",
    "canonicalName": "quality_gaps"
  },
  {
    "alias": "data_gaps",
    "canonicalName": "quality_gaps"
  },
  {
    "alias": "dataset",
    "canonicalName": "eval_datasets"
  },
  {
    "alias": "datasets",
    "canonicalName": "eval_datasets"
  },
  {
    "alias": "date_log",
    "canonicalName": "dates_log"
  },
  {
    "alias": "dates_log",
    "canonicalName": "dates_log"
  },
  {
    "alias": "dating_match",
    "canonicalName": "dating_matches"
  },
  {
    "alias": "dating_matches",
    "canonicalName": "dating_matches"
  },
  {
    "alias": "deal",
    "canonicalName": "deals"
  },
  {
    "alias": "deal_line",
    "canonicalName": "deal_line_items"
  },
  {
    "alias": "deal_line_item",
    "canonicalName": "deal_line_items"
  },
  {
    "alias": "deal_line_items",
    "canonicalName": "deal_line_items"
  },
  {
    "alias": "deal_lines",
    "canonicalName": "deal_line_items"
  },
  {
    "alias": "deals",
    "canonicalName": "deals"
  },
  {
    "alias": "debt",
    "canonicalName": "debts"
  },
  {
    "alias": "debts",
    "canonicalName": "debts"
  },
  {
    "alias": "deck",
    "canonicalName": "flashcard_decks"
  },
  {
    "alias": "deed",
    "canonicalName": "deeds_titles"
  },
  {
    "alias": "deed_title",
    "canonicalName": "deeds_titles"
  },
  {
    "alias": "deeds_titles",
    "canonicalName": "deeds_titles"
  },
  {
    "alias": "deliveries",
    "canonicalName": "webhook_deliveries"
  },
  {
    "alias": "delivery",
    "canonicalName": "webhook_deliveries"
  },
  {
    "alias": "department",
    "canonicalName": "departments"
  },
  {
    "alias": "departments",
    "canonicalName": "departments"
  },
  {
    "alias": "dependent",
    "canonicalName": "dependents"
  },
  {
    "alias": "dependents",
    "canonicalName": "dependents"
  },
  {
    "alias": "depilation_log",
    "canonicalName": "depilation_logs"
  },
  {
    "alias": "depilation_logs",
    "canonicalName": "depilation_logs"
  },
  {
    "alias": "deploy",
    "canonicalName": "deployments"
  },
  {
    "alias": "deployment",
    "canonicalName": "deployments"
  },
  {
    "alias": "deployments",
    "canonicalName": "deployments"
  },
  {
    "alias": "deploys",
    "canonicalName": "deployments"
  },
  {
    "alias": "device",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "device_command",
    "canonicalName": "device_commands"
  },
  {
    "alias": "device_commands",
    "canonicalName": "device_commands"
  },
  {
    "alias": "device-command",
    "canonicalName": "device_commands"
  },
  {
    "alias": "device-commands",
    "canonicalName": "device_commands"
  },
  {
    "alias": "devices",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "diagnoses",
    "canonicalName": "diagnoses"
  },
  {
    "alias": "diagnosis",
    "canonicalName": "diagnoses"
  },
  {
    "alias": "dietary_preference",
    "canonicalName": "dietary_preferences"
  },
  {
    "alias": "dietary_preferences",
    "canonicalName": "dietary_preferences"
  },
  {
    "alias": "discount",
    "canonicalName": "discounts_applied"
  },
  {
    "alias": "discount_applied",
    "canonicalName": "discounts_applied"
  },
  {
    "alias": "discounts",
    "canonicalName": "discounts_applied"
  },
  {
    "alias": "discounts_applied",
    "canonicalName": "discounts_applied"
  },
  {
    "alias": "dispute",
    "canonicalName": "disputes"
  },
  {
    "alias": "disputes",
    "canonicalName": "disputes"
  },
  {
    "alias": "dissociation_event",
    "canonicalName": "dissociation_events"
  },
  {
    "alias": "dissociation_events",
    "canonicalName": "dissociation_events"
  },
  {
    "alias": "doc",
    "canonicalName": "documents"
  },
  {
    "alias": "doc_properties",
    "canonicalName": "document_properties"
  },
  {
    "alias": "doc_property",
    "canonicalName": "document_properties"
  },
  {
    "alias": "docs",
    "canonicalName": "documents"
  },
  {
    "alias": "doctor",
    "canonicalName": "doctors"
  },
  {
    "alias": "doctors",
    "canonicalName": "doctors"
  },
  {
    "alias": "document",
    "canonicalName": "documents"
  },
  {
    "alias": "document_block",
    "canonicalName": "document_blocks"
  },
  {
    "alias": "document_blocks",
    "canonicalName": "document_blocks"
  },
  {
    "alias": "document_properties",
    "canonicalName": "document_properties"
  },
  {
    "alias": "document_property",
    "canonicalName": "document_properties"
  },
  {
    "alias": "documents",
    "canonicalName": "documents"
  },
  {
    "alias": "domain",
    "canonicalName": "infra_domains"
  },
  {
    "alias": "domain_intent",
    "canonicalName": "domain_intents"
  },
  {
    "alias": "domain_intents",
    "canonicalName": "domain_intents"
  },
  {
    "alias": "domain_pack",
    "canonicalName": "domain_packs"
  },
  {
    "alias": "domain_packs",
    "canonicalName": "domain_packs"
  },
  {
    "alias": "domain_profile",
    "canonicalName": "domain_profiles"
  },
  {
    "alias": "domain_profiles",
    "canonicalName": "domain_profiles"
  },
  {
    "alias": "domain_role",
    "canonicalName": "domain_roles"
  },
  {
    "alias": "domain_roles",
    "canonicalName": "domain_roles"
  },
  {
    "alias": "domain_system",
    "canonicalName": "domain_systems"
  },
  {
    "alias": "domain_systems",
    "canonicalName": "domain_systems"
  },
  {
    "alias": "domains",
    "canonicalName": "infra_domains"
  },
  {
    "alias": "donation",
    "canonicalName": "donations"
  },
  {
    "alias": "donations",
    "canonicalName": "donations"
  },
  {
    "alias": "dream",
    "canonicalName": "dream_journals"
  },
  {
    "alias": "dream_journal",
    "canonicalName": "dream_journals"
  },
  {
    "alias": "dream_journals",
    "canonicalName": "dream_journals"
  },
  {
    "alias": "drip",
    "canonicalName": "email_sequences"
  },
  {
    "alias": "drug_product",
    "canonicalName": "drug_products"
  },
  {
    "alias": "drug_products",
    "canonicalName": "drug_products"
  },
  {
    "alias": "drug-product",
    "canonicalName": "drug_products"
  },
  {
    "alias": "drug-products",
    "canonicalName": "drug_products"
  },
  {
    "alias": "eating_disorder_behavior",
    "canonicalName": "eating_disorder_behaviors"
  },
  {
    "alias": "eating_disorder_behaviors",
    "canonicalName": "eating_disorder_behaviors"
  },
  {
    "alias": "editorial-campaign",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "editorial-campaigns",
    "canonicalName": "content_campaigns"
  },
  {
    "alias": "eln-entries",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "eln-entry",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "eln-notebook",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "eln-notebooks",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "eln-observation",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "eln-observations",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "eln-protocol-run",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "eln-protocol-runs",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "email",
    "canonicalName": "email_messages"
  },
  {
    "alias": "email_campaign",
    "canonicalName": "email_campaigns"
  },
  {
    "alias": "email_campaigns",
    "canonicalName": "email_campaigns"
  },
  {
    "alias": "email_message",
    "canonicalName": "email_messages"
  },
  {
    "alias": "email_messages",
    "canonicalName": "email_messages"
  },
  {
    "alias": "email_sequence",
    "canonicalName": "email_sequences"
  },
  {
    "alias": "email_sequences",
    "canonicalName": "email_sequences"
  },
  {
    "alias": "email_thread",
    "canonicalName": "email_threads"
  },
  {
    "alias": "email_threads",
    "canonicalName": "email_threads"
  },
  {
    "alias": "emails",
    "canonicalName": "email_messages"
  },
  {
    "alias": "emergency_contact",
    "canonicalName": "emergency_contacts"
  },
  {
    "alias": "emergency_contacts",
    "canonicalName": "emergency_contacts"
  },
  {
    "alias": "employee",
    "canonicalName": "employees"
  },
  {
    "alias": "employees",
    "canonicalName": "employees"
  },
  {
    "alias": "encounter",
    "canonicalName": "encounters"
  },
  {
    "alias": "encounters",
    "canonicalName": "encounters"
  },
  {
    "alias": "engagement_response",
    "canonicalName": "engagement_responses"
  },
  {
    "alias": "engagement_responses",
    "canonicalName": "engagement_responses"
  },
  {
    "alias": "engagement_survey",
    "canonicalName": "engagement_surveys"
  },
  {
    "alias": "engagement_surveys",
    "canonicalName": "engagement_surveys"
  },
  {
    "alias": "engineering-revision",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "engineering-revisions",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "entity_component",
    "canonicalName": "entity_components"
  },
  {
    "alias": "entity_components",
    "canonicalName": "entity_components"
  },
  {
    "alias": "entity_label",
    "canonicalName": "entity_labels"
  },
  {
    "alias": "entity_labels",
    "canonicalName": "entity_labels"
  },
  {
    "alias": "entity_relation",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "entity_relations",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "entry-approval",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "entry-approvals",
    "canonicalName": "content_approvals"
  },
  {
    "alias": "entry-revision",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "entry-revisions",
    "canonicalName": "content_revisions"
  },
  {
    "alias": "entry-variant",
    "canonicalName": "content_variants"
  },
  {
    "alias": "entry-variants",
    "canonicalName": "content_variants"
  },
  {
    "alias": "env",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "env_var",
    "canonicalName": "infra_secrets"
  },
  {
    "alias": "environment",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "environments",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "envs",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "error",
    "canonicalName": "error_issues"
  },
  {
    "alias": "error_event",
    "canonicalName": "error_events"
  },
  {
    "alias": "error_events",
    "canonicalName": "error_events"
  },
  {
    "alias": "error_issue",
    "canonicalName": "error_issues"
  },
  {
    "alias": "error_issues",
    "canonicalName": "error_issues"
  },
  {
    "alias": "errors",
    "canonicalName": "error_issues"
  },
  {
    "alias": "eval",
    "canonicalName": "evaluations"
  },
  {
    "alias": "eval_dataset",
    "canonicalName": "eval_datasets"
  },
  {
    "alias": "eval_datasets",
    "canonicalName": "eval_datasets"
  },
  {
    "alias": "eval_test_case",
    "canonicalName": "eval_test_cases"
  },
  {
    "alias": "eval_test_cases",
    "canonicalName": "eval_test_cases"
  },
  {
    "alias": "evals",
    "canonicalName": "evaluations"
  },
  {
    "alias": "evaluation",
    "canonicalName": "evaluations"
  },
  {
    "alias": "evaluations",
    "canonicalName": "evaluations"
  },
  {
    "alias": "evidence",
    "canonicalName": "evidence_sources"
  },
  {
    "alias": "evidence_item",
    "canonicalName": "case_evidence"
  },
  {
    "alias": "evidence_items",
    "canonicalName": "case_evidence"
  },
  {
    "alias": "evidence_source",
    "canonicalName": "evidence_sources"
  },
  {
    "alias": "evidence_sources",
    "canonicalName": "evidence_sources"
  },
  {
    "alias": "exam",
    "canonicalName": "exams"
  },
  {
    "alias": "exams",
    "canonicalName": "exams"
  },
  {
    "alias": "execution_profile",
    "canonicalName": "agent_execution_profiles"
  },
  {
    "alias": "exercise",
    "canonicalName": "exercises"
  },
  {
    "alias": "exercises",
    "canonicalName": "exercises"
  },
  {
    "alias": "exhibition",
    "canonicalName": "exhibitions_seen"
  },
  {
    "alias": "exhibitions_seen",
    "canonicalName": "exhibitions_seen"
  },
  {
    "alias": "experiment",
    "canonicalName": "experiments"
  },
  {
    "alias": "experiment_metric",
    "canonicalName": "experiment_metrics"
  },
  {
    "alias": "experiment_metrics",
    "canonicalName": "experiment_metrics"
  },
  {
    "alias": "experiment_observation",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "experiment_observations",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "experiment-observation",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "experiment-observations",
    "canonicalName": "experiment_observations"
  },
  {
    "alias": "experiments",
    "canonicalName": "experiments"
  },
  {
    "alias": "external_thread",
    "canonicalName": "external_threads"
  },
  {
    "alias": "external_threads",
    "canonicalName": "external_threads"
  },
  {
    "alias": "external_user",
    "canonicalName": "external_users"
  },
  {
    "alias": "external_users",
    "canonicalName": "external_users"
  },
  {
    "alias": "eyewear",
    "canonicalName": "eyewear"
  },
  {
    "alias": "eyewear_item",
    "canonicalName": "eyewear"
  },
  {
    "alias": "family_document",
    "canonicalName": "family_documents"
  },
  {
    "alias": "family_documents",
    "canonicalName": "family_documents"
  },
  {
    "alias": "family_member",
    "canonicalName": "family_members"
  },
  {
    "alias": "family_members",
    "canonicalName": "family_members"
  },
  {
    "alias": "fasting_log",
    "canonicalName": "fasting_log"
  },
  {
    "alias": "fasting_log_entry",
    "canonicalName": "fasting_log"
  },
  {
    "alias": "fav",
    "canonicalName": "favorites"
  },
  {
    "alias": "favorite",
    "canonicalName": "favorites"
  },
  {
    "alias": "favorites",
    "canonicalName": "favorites"
  },
  {
    "alias": "favs",
    "canonicalName": "favorites"
  },
  {
    "alias": "feature_flag",
    "canonicalName": "feature_flags"
  },
  {
    "alias": "feature_flag_evaluation",
    "canonicalName": "feature_flag_evaluations"
  },
  {
    "alias": "feature_flag_evaluations",
    "canonicalName": "feature_flag_evaluations"
  },
  {
    "alias": "feature_flags",
    "canonicalName": "feature_flags"
  },
  {
    "alias": "feedback_loop",
    "canonicalName": "feedback_loops"
  },
  {
    "alias": "feedback_loops",
    "canonicalName": "feedback_loops"
  },
  {
    "alias": "fertility_cycle",
    "canonicalName": "fertility_cycles"
  },
  {
    "alias": "fertility_cycles",
    "canonicalName": "fertility_cycles"
  },
  {
    "alias": "festival",
    "canonicalName": "festivals_attended"
  },
  {
    "alias": "festivals_attended",
    "canonicalName": "festivals_attended"
  },
  {
    "alias": "financial_account",
    "canonicalName": "financial_accounts"
  },
  {
    "alias": "financial_accounts",
    "canonicalName": "financial_accounts"
  },
  {
    "alias": "financial_document",
    "canonicalName": "financial_documents"
  },
  {
    "alias": "financial_documents",
    "canonicalName": "financial_documents"
  },
  {
    "alias": "financial-account",
    "canonicalName": "financial_accounts"
  },
  {
    "alias": "financial-accounts",
    "canonicalName": "financial_accounts"
  },
  {
    "alias": "finding",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "findings",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "fishing_catch",
    "canonicalName": "fishing_catches"
  },
  {
    "alias": "fishing_catches",
    "canonicalName": "fishing_catches"
  },
  {
    "alias": "flag",
    "canonicalName": "feature_flags"
  },
  {
    "alias": "flag_eval",
    "canonicalName": "feature_flag_evaluations"
  },
  {
    "alias": "flag_evals",
    "canonicalName": "feature_flag_evaluations"
  },
  {
    "alias": "flags",
    "canonicalName": "feature_flags"
  },
  {
    "alias": "flashcard",
    "canonicalName": "flashcards"
  },
  {
    "alias": "flashcard_deck",
    "canonicalName": "flashcard_decks"
  },
  {
    "alias": "flashcard_decks",
    "canonicalName": "flashcard_decks"
  },
  {
    "alias": "flashcard_review",
    "canonicalName": "flashcard_reviews"
  },
  {
    "alias": "flashcard_reviews",
    "canonicalName": "flashcard_reviews"
  },
  {
    "alias": "flashcards",
    "canonicalName": "flashcards"
  },
  {
    "alias": "flight",
    "canonicalName": "flights"
  },
  {
    "alias": "flights",
    "canonicalName": "flights"
  },
  {
    "alias": "food_diary_entries",
    "canonicalName": "food_diary_entries"
  },
  {
    "alias": "food_diary_entry",
    "canonicalName": "food_diary_entries"
  },
  {
    "alias": "food_log",
    "canonicalName": "food_diary_entries"
  },
  {
    "alias": "form",
    "canonicalName": "forms"
  },
  {
    "alias": "form_submission",
    "canonicalName": "form_submissions"
  },
  {
    "alias": "form_submissions",
    "canonicalName": "form_submissions"
  },
  {
    "alias": "forms",
    "canonicalName": "forms"
  },
  {
    "alias": "fragrance",
    "canonicalName": "fragrances_owned"
  },
  {
    "alias": "fragrances_owned",
    "canonicalName": "fragrances_owned"
  },
  {
    "alias": "freelance_client",
    "canonicalName": "freelance_clients"
  },
  {
    "alias": "freelance_clients",
    "canonicalName": "freelance_clients"
  },
  {
    "alias": "freelance_invoice",
    "canonicalName": "freelance_invoices"
  },
  {
    "alias": "freelance_invoices",
    "canonicalName": "freelance_invoices"
  },
  {
    "alias": "freight_rate",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "freight_rates",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "freight-carrier",
    "canonicalName": "carriers"
  },
  {
    "alias": "freight-carriers",
    "canonicalName": "carriers"
  },
  {
    "alias": "freight-leg",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "freight-legs",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "freight-rate",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "freight-rates",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "freight-shipment",
    "canonicalName": "shipments"
  },
  {
    "alias": "freight-shipments",
    "canonicalName": "shipments"
  },
  {
    "alias": "fuel",
    "canonicalName": "fuel_logs"
  },
  {
    "alias": "fuel_log",
    "canonicalName": "fuel_logs"
  },
  {
    "alias": "fuel_logs",
    "canonicalName": "fuel_logs"
  },
  {
    "alias": "fulfillment-center",
    "canonicalName": "warehouses"
  },
  {
    "alias": "fulfillment-centers",
    "canonicalName": "warehouses"
  },
  {
    "alias": "funnel",
    "canonicalName": "funnels"
  },
  {
    "alias": "funnel_run",
    "canonicalName": "funnel_runs"
  },
  {
    "alias": "funnel_runs",
    "canonicalName": "funnel_runs"
  },
  {
    "alias": "funnels",
    "canonicalName": "funnels"
  },
  {
    "alias": "garden_plot",
    "canonicalName": "garden_plots"
  },
  {
    "alias": "garden_plots",
    "canonicalName": "garden_plots"
  },
  {
    "alias": "general_personal_document",
    "canonicalName": "general_personal_documents"
  },
  {
    "alias": "general_personal_documents",
    "canonicalName": "general_personal_documents"
  },
  {
    "alias": "geocache",
    "canonicalName": "geocaching_finds"
  },
  {
    "alias": "geocaching_finds",
    "canonicalName": "geocaching_finds"
  },
  {
    "alias": "gift_given",
    "canonicalName": "gifts_given"
  },
  {
    "alias": "gift_idea",
    "canonicalName": "gift_ideas"
  },
  {
    "alias": "gift_ideas",
    "canonicalName": "gift_ideas"
  },
  {
    "alias": "gift_received",
    "canonicalName": "gifts_received"
  },
  {
    "alias": "gifts_given",
    "canonicalName": "gifts_given"
  },
  {
    "alias": "gifts_received",
    "canonicalName": "gifts_received"
  },
  {
    "alias": "git_automation",
    "canonicalName": "git_automation_states"
  },
  {
    "alias": "git_automation_state",
    "canonicalName": "git_automation_states"
  },
  {
    "alias": "git_automation_states",
    "canonicalName": "git_automation_states"
  },
  {
    "alias": "government-agencies",
    "canonicalName": "agencies"
  },
  {
    "alias": "government-agency",
    "canonicalName": "agencies"
  },
  {
    "alias": "government-case",
    "canonicalName": "public_cases"
  },
  {
    "alias": "government-cases",
    "canonicalName": "public_cases"
  },
  {
    "alias": "government-filing",
    "canonicalName": "public_filings"
  },
  {
    "alias": "government-filings",
    "canonicalName": "public_filings"
  },
  {
    "alias": "gratitude",
    "canonicalName": "gratitude_entries"
  },
  {
    "alias": "gratitude_entries",
    "canonicalName": "gratitude_entries"
  },
  {
    "alias": "gratitude_entry",
    "canonicalName": "gratitude_entries"
  },
  {
    "alias": "grc-finding",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "grc-findings",
    "canonicalName": "compliance_findings"
  },
  {
    "alias": "grocery_item",
    "canonicalName": "grocery_items"
  },
  {
    "alias": "grocery_items",
    "canonicalName": "grocery_items"
  },
  {
    "alias": "grocery_list",
    "canonicalName": "grocery_lists"
  },
  {
    "alias": "grocery_lists",
    "canonicalName": "grocery_lists"
  },
  {
    "alias": "gym_session",
    "canonicalName": "gym_sessions"
  },
  {
    "alias": "gym_sessions",
    "canonicalName": "gym_sessions"
  },
  {
    "alias": "habit",
    "canonicalName": "habits"
  },
  {
    "alias": "habit_log",
    "canonicalName": "habit_logs"
  },
  {
    "alias": "habit_logs",
    "canonicalName": "habit_logs"
  },
  {
    "alias": "habits",
    "canonicalName": "habits"
  },
  {
    "alias": "hair_change",
    "canonicalName": "hair_changes"
  },
  {
    "alias": "hair_changes",
    "canonicalName": "hair_changes"
  },
  {
    "alias": "hair_log",
    "canonicalName": "hair_logs"
  },
  {
    "alias": "hair_logs",
    "canonicalName": "hair_logs"
  },
  {
    "alias": "harvest",
    "canonicalName": "harvests"
  },
  {
    "alias": "harvests",
    "canonicalName": "harvests"
  },
  {
    "alias": "health_condition",
    "canonicalName": "health_conditions"
  },
  {
    "alias": "health_conditions",
    "canonicalName": "health_conditions"
  },
  {
    "alias": "heart_rate_sample",
    "canonicalName": "heart_rate_samples"
  },
  {
    "alias": "heart_rate_samples",
    "canonicalName": "heart_rate_samples"
  },
  {
    "alias": "help_center",
    "canonicalName": "help_centers"
  },
  {
    "alias": "help_centers",
    "canonicalName": "help_centers"
  },
  {
    "alias": "highlight",
    "canonicalName": "highlights"
  },
  {
    "alias": "highlights",
    "canonicalName": "highlights"
  },
  {
    "alias": "highlights_collection",
    "canonicalName": "highlights_collections"
  },
  {
    "alias": "highlights_collections",
    "canonicalName": "highlights_collections"
  },
  {
    "alias": "holding",
    "canonicalName": "investment_holdings"
  },
  {
    "alias": "holdout",
    "canonicalName": "holdouts"
  },
  {
    "alias": "holdouts",
    "canonicalName": "holdouts"
  },
  {
    "alias": "home_inventory_item",
    "canonicalName": "home_inventory_items"
  },
  {
    "alias": "home_inventory_items",
    "canonicalName": "home_inventory_items"
  },
  {
    "alias": "household",
    "canonicalName": "households"
  },
  {
    "alias": "household_member",
    "canonicalName": "household_members"
  },
  {
    "alias": "household_members",
    "canonicalName": "household_members"
  },
  {
    "alias": "households",
    "canonicalName": "households"
  },
  {
    "alias": "hunting_log",
    "canonicalName": "hunting_log"
  },
  {
    "alias": "hunting_log_entry",
    "canonicalName": "hunting_log"
  },
  {
    "alias": "idea",
    "canonicalName": "ideas"
  },
  {
    "alias": "ideas",
    "canonicalName": "ideas"
  },
  {
    "alias": "identity_document",
    "canonicalName": "identity_documents"
  },
  {
    "alias": "identity_documents",
    "canonicalName": "identity_documents"
  },
  {
    "alias": "identity_journey_milestones",
    "canonicalName": "identity_journey_milestones"
  },
  {
    "alias": "identity_milestone",
    "canonicalName": "identity_journey_milestones"
  },
  {
    "alias": "idp",
    "canonicalName": "auth_identity_providers"
  },
  {
    "alias": "important_date",
    "canonicalName": "important_dates"
  },
  {
    "alias": "important_dates",
    "canonicalName": "important_dates"
  },
  {
    "alias": "important_receipt",
    "canonicalName": "important_receipts"
  },
  {
    "alias": "important_receipts",
    "canonicalName": "important_receipts"
  },
  {
    "alias": "infra_domain",
    "canonicalName": "infra_domains"
  },
  {
    "alias": "infra_domains",
    "canonicalName": "infra_domains"
  },
  {
    "alias": "infra_environment",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "infra_environments",
    "canonicalName": "infra_environments"
  },
  {
    "alias": "infra_secret",
    "canonicalName": "infra_secrets"
  },
  {
    "alias": "infra_secrets",
    "canonicalName": "infra_secrets"
  },
  {
    "alias": "ingredient",
    "canonicalName": "ingredients"
  },
  {
    "alias": "ingredients",
    "canonicalName": "ingredients"
  },
  {
    "alias": "initiative_parent",
    "canonicalName": "initiative_parents"
  },
  {
    "alias": "initiative_parents",
    "canonicalName": "initiative_parents"
  },
  {
    "alias": "initiative_update",
    "canonicalName": "initiative_updates"
  },
  {
    "alias": "initiative_updates",
    "canonicalName": "initiative_updates"
  },
  {
    "alias": "insight",
    "canonicalName": "insight_definitions"
  },
  {
    "alias": "insight_definition",
    "canonicalName": "insight_definitions"
  },
  {
    "alias": "insight_definitions",
    "canonicalName": "insight_definitions"
  },
  {
    "alias": "insights",
    "canonicalName": "insight_definitions"
  },
  {
    "alias": "instruction",
    "canonicalName": "instructions"
  },
  {
    "alias": "instructions",
    "canonicalName": "instructions"
  },
  {
    "alias": "instrument",
    "canonicalName": "instruments"
  },
  {
    "alias": "instrument_item",
    "canonicalName": "instrument_items"
  },
  {
    "alias": "instrument_items",
    "canonicalName": "instrument_items"
  },
  {
    "alias": "instrument_response",
    "canonicalName": "instrument_responses"
  },
  {
    "alias": "instrument_responses",
    "canonicalName": "instrument_responses"
  },
  {
    "alias": "instruments",
    "canonicalName": "instruments"
  },
  {
    "alias": "insurance_policies",
    "canonicalName": "insurance_policies"
  },
  {
    "alias": "insurance_policy",
    "canonicalName": "insurance_policies"
  },
  {
    "alias": "intake",
    "canonicalName": "intake_addresses"
  },
  {
    "alias": "intake_address",
    "canonicalName": "intake_addresses"
  },
  {
    "alias": "intake_addresses",
    "canonicalName": "intake_addresses"
  },
  {
    "alias": "intakes",
    "canonicalName": "intake_addresses"
  },
  {
    "alias": "integration",
    "canonicalName": "integrations"
  },
  {
    "alias": "integrations",
    "canonicalName": "integrations"
  },
  {
    "alias": "intent",
    "canonicalName": "payment_intents"
  },
  {
    "alias": "intent_coverage",
    "canonicalName": "domain_intents"
  },
  {
    "alias": "intention",
    "canonicalName": "intentions"
  },
  {
    "alias": "intentions",
    "canonicalName": "intentions"
  },
  {
    "alias": "intents",
    "canonicalName": "payment_intents"
  },
  {
    "alias": "interview",
    "canonicalName": "interviews"
  },
  {
    "alias": "interviews",
    "canonicalName": "interviews"
  },
  {
    "alias": "intimate_encounter",
    "canonicalName": "intimate_encounters"
  },
  {
    "alias": "intimate_encounters",
    "canonicalName": "intimate_encounters"
  },
  {
    "alias": "invention",
    "canonicalName": "inventions"
  },
  {
    "alias": "inventions",
    "canonicalName": "inventions"
  },
  {
    "alias": "inventory",
    "canonicalName": "home_inventory_items"
  },
  {
    "alias": "inventory_items",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "inventory-item",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "inventory-items",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "inventory-movement",
    "canonicalName": "stock_movements"
  },
  {
    "alias": "inventory-movements",
    "canonicalName": "stock_movements"
  },
  {
    "alias": "investment_holding",
    "canonicalName": "investment_holdings"
  },
  {
    "alias": "investment_holdings",
    "canonicalName": "investment_holdings"
  },
  {
    "alias": "investment_transaction",
    "canonicalName": "investment_transactions"
  },
  {
    "alias": "investment_transactions",
    "canonicalName": "investment_transactions"
  },
  {
    "alias": "invite",
    "canonicalName": "organization_invites"
  },
  {
    "alias": "invites",
    "canonicalName": "organization_invites"
  },
  {
    "alias": "invoice",
    "canonicalName": "invoices"
  },
  {
    "alias": "invoice_line",
    "canonicalName": "invoice_line_items"
  },
  {
    "alias": "invoice_line_item",
    "canonicalName": "invoice_line_items"
  },
  {
    "alias": "invoice_line_items",
    "canonicalName": "invoice_line_items"
  },
  {
    "alias": "invoice_lines",
    "canonicalName": "invoice_line_items"
  },
  {
    "alias": "invoices",
    "canonicalName": "invoices"
  },
  {
    "alias": "iot_device",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "iot_devices",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "iot_thing",
    "canonicalName": "iot_things"
  },
  {
    "alias": "iot_things",
    "canonicalName": "iot_things"
  },
  {
    "alias": "iot-command",
    "canonicalName": "device_commands"
  },
  {
    "alias": "iot-commands",
    "canonicalName": "device_commands"
  },
  {
    "alias": "iot-device",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "iot-devices",
    "canonicalName": "iot_devices"
  },
  {
    "alias": "iot-thing",
    "canonicalName": "iot_things"
  },
  {
    "alias": "iot-things",
    "canonicalName": "iot_things"
  },
  {
    "alias": "issue_affects_version",
    "canonicalName": "issue_affects_versions"
  },
  {
    "alias": "issue_affects_versions",
    "canonicalName": "issue_affects_versions"
  },
  {
    "alias": "issue_sla",
    "canonicalName": "issue_sla_state"
  },
  {
    "alias": "issue_sla_state",
    "canonicalName": "issue_sla_state"
  },
  {
    "alias": "itsm_service",
    "canonicalName": "services"
  },
  {
    "alias": "itsm_services",
    "canonicalName": "services"
  },
  {
    "alias": "ivf_cycle",
    "canonicalName": "ivf_cycles"
  },
  {
    "alias": "ivf_cycles",
    "canonicalName": "ivf_cycles"
  },
  {
    "alias": "jewelry",
    "canonicalName": "jewelry_items"
  },
  {
    "alias": "jewelry_item",
    "canonicalName": "jewelry_items"
  },
  {
    "alias": "jewelry_items",
    "canonicalName": "jewelry_items"
  },
  {
    "alias": "job_application",
    "canonicalName": "job_applications"
  },
  {
    "alias": "job_applications",
    "canonicalName": "job_applications"
  },
  {
    "alias": "job_offer",
    "canonicalName": "job_offers"
  },
  {
    "alias": "job_offers",
    "canonicalName": "job_offers"
  },
  {
    "alias": "job-site",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "job-sites",
    "canonicalName": "construction_sites"
  },
  {
    "alias": "journal",
    "canonicalName": "journal_entries"
  },
  {
    "alias": "journal_entries",
    "canonicalName": "journal_entries"
  },
  {
    "alias": "journal_entry",
    "canonicalName": "journal_entries"
  },
  {
    "alias": "kb",
    "canonicalName": "help_centers"
  },
  {
    "alias": "kg",
    "canonicalName": "knowledge_graphs"
  },
  {
    "alias": "kg_relation",
    "canonicalName": "knowledge_graph_relations"
  },
  {
    "alias": "kid",
    "canonicalName": "children_profiles"
  },
  {
    "alias": "kitchen_tool",
    "canonicalName": "kitchen_tools"
  },
  {
    "alias": "kitchen_tools",
    "canonicalName": "kitchen_tools"
  },
  {
    "alias": "knowledge_article",
    "canonicalName": "knowledge_articles"
  },
  {
    "alias": "knowledge_articles",
    "canonicalName": "knowledge_articles"
  },
  {
    "alias": "knowledge_base",
    "canonicalName": "help_centers"
  },
  {
    "alias": "knowledge_graph",
    "canonicalName": "knowledge_graphs"
  },
  {
    "alias": "knowledge_graph_relation",
    "canonicalName": "knowledge_graph_relations"
  },
  {
    "alias": "knowledge_graph_relations",
    "canonicalName": "knowledge_graph_relations"
  },
  {
    "alias": "knowledge_graphs",
    "canonicalName": "knowledge_graphs"
  },
  {
    "alias": "kudos",
    "canonicalName": "praise"
  },
  {
    "alias": "lab_notebook",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "lab_notebooks",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "lab_result",
    "canonicalName": "lab_results"
  },
  {
    "alias": "lab_results",
    "canonicalName": "lab_results"
  },
  {
    "alias": "lab_value_target",
    "canonicalName": "lab_value_targets"
  },
  {
    "alias": "lab_value_targets",
    "canonicalName": "lab_value_targets"
  },
  {
    "alias": "lab-notebook",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "lab-notebooks",
    "canonicalName": "lab_notebooks"
  },
  {
    "alias": "label",
    "canonicalName": "labels"
  },
  {
    "alias": "labels",
    "canonicalName": "labels"
  },
  {
    "alias": "language",
    "canonicalName": "languages_learning"
  },
  {
    "alias": "language_learning",
    "canonicalName": "languages_learning"
  },
  {
    "alias": "languages_learning",
    "canonicalName": "languages_learning"
  },
  {
    "alias": "laundry",
    "canonicalName": "laundry_logs"
  },
  {
    "alias": "laundry_log",
    "canonicalName": "laundry_logs"
  },
  {
    "alias": "laundry_logs",
    "canonicalName": "laundry_logs"
  },
  {
    "alias": "lead",
    "canonicalName": "leads"
  },
  {
    "alias": "leads",
    "canonicalName": "leads"
  },
  {
    "alias": "learner",
    "canonicalName": "learners"
  },
  {
    "alias": "learners",
    "canonicalName": "learners"
  },
  {
    "alias": "ledger",
    "canonicalName": "balance_transactions"
  },
  {
    "alias": "legal_case",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "legal_cases",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "legal_client",
    "canonicalName": "legal_clients"
  },
  {
    "alias": "legal_clients",
    "canonicalName": "legal_clients"
  },
  {
    "alias": "legal_document",
    "canonicalName": "legal_documents"
  },
  {
    "alias": "legal_documents",
    "canonicalName": "legal_documents"
  },
  {
    "alias": "legal-client",
    "canonicalName": "legal_clients"
  },
  {
    "alias": "legal-clients",
    "canonicalName": "legal_clients"
  },
  {
    "alias": "lesson",
    "canonicalName": "lessons"
  },
  {
    "alias": "lessons",
    "canonicalName": "lessons"
  },
  {
    "alias": "libraries",
    "canonicalName": "libraries"
  },
  {
    "alias": "library",
    "canonicalName": "libraries"
  },
  {
    "alias": "license",
    "canonicalName": "license_keys"
  },
  {
    "alias": "license_key",
    "canonicalName": "license_keys"
  },
  {
    "alias": "license_keys",
    "canonicalName": "license_keys"
  },
  {
    "alias": "license-permit",
    "canonicalName": "permits"
  },
  {
    "alias": "license-permits",
    "canonicalName": "permits"
  },
  {
    "alias": "licenses",
    "canonicalName": "license_keys"
  },
  {
    "alias": "loan",
    "canonicalName": "loans"
  },
  {
    "alias": "loans",
    "canonicalName": "loans"
  },
  {
    "alias": "lot_release",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "lot_releases",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "lot-release",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "lot-releases",
    "canonicalName": "lot_releases"
  },
  {
    "alias": "macro",
    "canonicalName": "support_macros"
  },
  {
    "alias": "macros",
    "canonicalName": "support_macros"
  },
  {
    "alias": "magic_auth_token",
    "canonicalName": "magic_auth_tokens"
  },
  {
    "alias": "magic_auth_tokens",
    "canonicalName": "magic_auth_tokens"
  },
  {
    "alias": "magic_link",
    "canonicalName": "magic_auth_tokens"
  },
  {
    "alias": "mailbox",
    "canonicalName": "mailboxes"
  },
  {
    "alias": "mailboxes",
    "canonicalName": "mailboxes"
  },
  {
    "alias": "makeup_catalog",
    "canonicalName": "makeup_catalog"
  },
  {
    "alias": "makeup_item",
    "canonicalName": "makeup_catalog"
  },
  {
    "alias": "manual",
    "canonicalName": "manuals"
  },
  {
    "alias": "manuals",
    "canonicalName": "manuals"
  },
  {
    "alias": "manufacturing-batch",
    "canonicalName": "batch_records"
  },
  {
    "alias": "manufacturing-batches",
    "canonicalName": "batch_records"
  },
  {
    "alias": "match",
    "canonicalName": "dating_matches"
  },
  {
    "alias": "matter",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "matters",
    "canonicalName": "legal_cases"
  },
  {
    "alias": "meal_plan",
    "canonicalName": "meal_plans"
  },
  {
    "alias": "meal_plan_entries",
    "canonicalName": "meal_plan_entries"
  },
  {
    "alias": "meal_plan_entry",
    "canonicalName": "meal_plan_entries"
  },
  {
    "alias": "meal_plans",
    "canonicalName": "meal_plans"
  },
  {
    "alias": "medical_appointment",
    "canonicalName": "medical_appointments"
  },
  {
    "alias": "medical_appointments",
    "canonicalName": "medical_appointments"
  },
  {
    "alias": "medical_cost_log_entry",
    "canonicalName": "medical_costs_log"
  },
  {
    "alias": "medical_costs_log",
    "canonicalName": "medical_costs_log"
  },
  {
    "alias": "medical_document",
    "canonicalName": "medical_documents"
  },
  {
    "alias": "medical_documents",
    "canonicalName": "medical_documents"
  },
  {
    "alias": "medical_procedure",
    "canonicalName": "medical_procedures"
  },
  {
    "alias": "medical_procedures",
    "canonicalName": "medical_procedures"
  },
  {
    "alias": "medication",
    "canonicalName": "medications"
  },
  {
    "alias": "medication_dose",
    "canonicalName": "medication_doses"
  },
  {
    "alias": "medication_doses",
    "canonicalName": "medication_doses"
  },
  {
    "alias": "medications",
    "canonicalName": "medications"
  },
  {
    "alias": "meditation",
    "canonicalName": "meditations"
  },
  {
    "alias": "meditations",
    "canonicalName": "meditations"
  },
  {
    "alias": "meeting",
    "canonicalName": "meetings"
  },
  {
    "alias": "meeting_type",
    "canonicalName": "booking_meeting_types"
  },
  {
    "alias": "meeting_types",
    "canonicalName": "booking_meeting_types"
  },
  {
    "alias": "meetings",
    "canonicalName": "meetings"
  },
  {
    "alias": "memories",
    "canonicalName": "memory_blocks"
  },
  {
    "alias": "memory",
    "canonicalName": "memory_blocks"
  },
  {
    "alias": "memory_block",
    "canonicalName": "memory_blocks"
  },
  {
    "alias": "memory_blocks",
    "canonicalName": "memory_blocks"
  },
  {
    "alias": "memory_index",
    "canonicalName": "memory_indices"
  },
  {
    "alias": "memory_indices",
    "canonicalName": "memory_indices"
  },
  {
    "alias": "memory_policy",
    "canonicalName": "agent_memory_policies"
  },
  {
    "alias": "mention",
    "canonicalName": "mentions"
  },
  {
    "alias": "mentions",
    "canonicalName": "mentions"
  },
  {
    "alias": "mileage",
    "canonicalName": "mileage_logs"
  },
  {
    "alias": "mileage_log",
    "canonicalName": "mileage_logs"
  },
  {
    "alias": "mileage_logs",
    "canonicalName": "mileage_logs"
  },
  {
    "alias": "monitor",
    "canonicalName": "monitors"
  },
  {
    "alias": "monitors",
    "canonicalName": "monitors"
  },
  {
    "alias": "mood",
    "canonicalName": "mood_logs"
  },
  {
    "alias": "mood_check_in",
    "canonicalName": "mood_check_ins"
  },
  {
    "alias": "mood_check_ins",
    "canonicalName": "mood_check_ins"
  },
  {
    "alias": "mood_episode",
    "canonicalName": "mood_episodes"
  },
  {
    "alias": "mood_episodes",
    "canonicalName": "mood_episodes"
  },
  {
    "alias": "mood_log",
    "canonicalName": "mood_logs"
  },
  {
    "alias": "mood_logs",
    "canonicalName": "mood_logs"
  },
  {
    "alias": "movie",
    "canonicalName": "movies"
  },
  {
    "alias": "movies",
    "canonicalName": "movies"
  },
  {
    "alias": "mrr",
    "canonicalName": "mrr_cohorts"
  },
  {
    "alias": "mrr_cohort",
    "canonicalName": "mrr_cohorts"
  },
  {
    "alias": "mrr_cohorts",
    "canonicalName": "mrr_cohorts"
  },
  {
    "alias": "museum",
    "canonicalName": "museums_visited"
  },
  {
    "alias": "museums_visited",
    "canonicalName": "museums_visited"
  },
  {
    "alias": "music_track",
    "canonicalName": "music_tracks"
  },
  {
    "alias": "music_tracks",
    "canonicalName": "music_tracks"
  },
  {
    "alias": "need",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "needs",
    "canonicalName": "customer_requests"
  },
  {
    "alias": "net_worth_snapshot",
    "canonicalName": "net_worth_snapshots"
  },
  {
    "alias": "net_worth_snapshots",
    "canonicalName": "net_worth_snapshots"
  },
  {
    "alias": "newsletter",
    "canonicalName": "newsletters"
  },
  {
    "alias": "newsletter_post",
    "canonicalName": "newsletter_posts"
  },
  {
    "alias": "newsletter_posts",
    "canonicalName": "newsletter_posts"
  },
  {
    "alias": "newsletter_subscriber",
    "canonicalName": "newsletter_subscribers"
  },
  {
    "alias": "newsletter_subscribers",
    "canonicalName": "newsletter_subscribers"
  },
  {
    "alias": "newsletters",
    "canonicalName": "newsletters"
  },
  {
    "alias": "nightlife_entry",
    "canonicalName": "parties_nightlife_log"
  },
  {
    "alias": "notebook_entries",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "notebook_entry",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "notebook-entries",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "notebook-entry",
    "canonicalName": "notebook_entries"
  },
  {
    "alias": "nps",
    "canonicalName": "satisfaction_ratings"
  },
  {
    "alias": "oauth_app",
    "canonicalName": "oauth_apps"
  },
  {
    "alias": "oauth_app_approval",
    "canonicalName": "oauth_app_approvals"
  },
  {
    "alias": "oauth_app_approvals",
    "canonicalName": "oauth_app_approvals"
  },
  {
    "alias": "oauth_apps",
    "canonicalName": "oauth_apps"
  },
  {
    "alias": "obligation",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "obligations",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "okr",
    "canonicalName": "okrs"
  },
  {
    "alias": "okrs",
    "canonicalName": "okrs"
  },
  {
    "alias": "one_on_one",
    "canonicalName": "one_on_ones"
  },
  {
    "alias": "one_on_ones",
    "canonicalName": "one_on_ones"
  },
  {
    "alias": "opportunities",
    "canonicalName": "deals"
  },
  {
    "alias": "opportunity",
    "canonicalName": "deals"
  },
  {
    "alias": "order",
    "canonicalName": "orders"
  },
  {
    "alias": "order_line",
    "canonicalName": "order_line_items"
  },
  {
    "alias": "order_line_item",
    "canonicalName": "order_line_items"
  },
  {
    "alias": "order_line_items",
    "canonicalName": "order_line_items"
  },
  {
    "alias": "order_lines",
    "canonicalName": "order_line_items"
  },
  {
    "alias": "orders",
    "canonicalName": "orders"
  },
  {
    "alias": "org",
    "canonicalName": "companies"
  },
  {
    "alias": "organism",
    "canonicalName": "organisms"
  },
  {
    "alias": "organisms",
    "canonicalName": "organisms"
  },
  {
    "alias": "organization",
    "canonicalName": "companies"
  },
  {
    "alias": "organization_invite",
    "canonicalName": "organization_invites"
  },
  {
    "alias": "organization_invites",
    "canonicalName": "organization_invites"
  },
  {
    "alias": "organizations",
    "canonicalName": "companies"
  },
  {
    "alias": "orgs",
    "canonicalName": "companies"
  },
  {
    "alias": "outbound_webhook",
    "canonicalName": "webhooks_outbound"
  },
  {
    "alias": "outfit",
    "canonicalName": "outfits"
  },
  {
    "alias": "outfit_log",
    "canonicalName": "outfit_logs"
  },
  {
    "alias": "outfit_logs",
    "canonicalName": "outfit_logs"
  },
  {
    "alias": "outfits",
    "canonicalName": "outfits"
  },
  {
    "alias": "ovulation_test",
    "canonicalName": "ovulation_tests"
  },
  {
    "alias": "ovulation_tests",
    "canonicalName": "ovulation_tests"
  },
  {
    "alias": "packing_item",
    "canonicalName": "packing_items"
  },
  {
    "alias": "packing_items",
    "canonicalName": "packing_items"
  },
  {
    "alias": "panic_anxiety_log",
    "canonicalName": "panic_anxiety_logs"
  },
  {
    "alias": "panic_anxiety_logs",
    "canonicalName": "panic_anxiety_logs"
  },
  {
    "alias": "pantry_item",
    "canonicalName": "pantry_items"
  },
  {
    "alias": "pantry_items",
    "canonicalName": "pantry_items"
  },
  {
    "alias": "participant",
    "canonicalName": "participants"
  },
  {
    "alias": "participants",
    "canonicalName": "participants"
  },
  {
    "alias": "parties_nightlife_log",
    "canonicalName": "parties_nightlife_log"
  },
  {
    "alias": "partner",
    "canonicalName": "romantic_partners"
  },
  {
    "alias": "patient",
    "canonicalName": "patients"
  },
  {
    "alias": "patients",
    "canonicalName": "patients"
  },
  {
    "alias": "pay_stub",
    "canonicalName": "pay_stubs"
  },
  {
    "alias": "pay_stubs",
    "canonicalName": "pay_stubs"
  },
  {
    "alias": "payment_intent",
    "canonicalName": "payment_intents"
  },
  {
    "alias": "payment_intents",
    "canonicalName": "payment_intents"
  },
  {
    "alias": "payment_method",
    "canonicalName": "payment_methods"
  },
  {
    "alias": "payment_methods",
    "canonicalName": "payment_methods"
  },
  {
    "alias": "payout",
    "canonicalName": "payouts"
  },
  {
    "alias": "payouts",
    "canonicalName": "payouts"
  },
  {
    "alias": "payroll",
    "canonicalName": "payroll_runs"
  },
  {
    "alias": "payroll_run",
    "canonicalName": "payroll_runs"
  },
  {
    "alias": "payroll_runs",
    "canonicalName": "payroll_runs"
  },
  {
    "alias": "payrolls",
    "canonicalName": "payroll_runs"
  },
  {
    "alias": "paystub",
    "canonicalName": "pay_stubs"
  },
  {
    "alias": "paystubs",
    "canonicalName": "pay_stubs"
  },
  {
    "alias": "performance_review",
    "canonicalName": "performance_reviews"
  },
  {
    "alias": "performance_reviews",
    "canonicalName": "performance_reviews"
  },
  {
    "alias": "period",
    "canonicalName": "period_logs"
  },
  {
    "alias": "period_log",
    "canonicalName": "period_logs"
  },
  {
    "alias": "period_logs",
    "canonicalName": "period_logs"
  },
  {
    "alias": "permit",
    "canonicalName": "permits"
  },
  {
    "alias": "permits",
    "canonicalName": "permits"
  },
  {
    "alias": "personal_contact",
    "canonicalName": "personal_contacts"
  },
  {
    "alias": "personal_contacts",
    "canonicalName": "personal_contacts"
  },
  {
    "alias": "personal_event",
    "canonicalName": "personal_events"
  },
  {
    "alias": "personal_events",
    "canonicalName": "personal_events"
  },
  {
    "alias": "personal_note",
    "canonicalName": "personal_notes"
  },
  {
    "alias": "personal_notes",
    "canonicalName": "personal_notes"
  },
  {
    "alias": "personal_record",
    "canonicalName": "personal_records"
  },
  {
    "alias": "personal_records",
    "canonicalName": "personal_records"
  },
  {
    "alias": "personal_relationship",
    "canonicalName": "personal_relationships"
  },
  {
    "alias": "personal_relationships",
    "canonicalName": "personal_relationships"
  },
  {
    "alias": "personal_subscription",
    "canonicalName": "personal_subscriptions"
  },
  {
    "alias": "personal_subscriptions",
    "canonicalName": "personal_subscriptions"
  },
  {
    "alias": "pet",
    "canonicalName": "pets"
  },
  {
    "alias": "pet_feeding_schedule",
    "canonicalName": "pet_feeding_schedules"
  },
  {
    "alias": "pet_feeding_schedules",
    "canonicalName": "pet_feeding_schedules"
  },
  {
    "alias": "pet_medication",
    "canonicalName": "pet_medications"
  },
  {
    "alias": "pet_medications",
    "canonicalName": "pet_medications"
  },
  {
    "alias": "pet_vaccination",
    "canonicalName": "pet_vaccinations"
  },
  {
    "alias": "pet_vaccinations",
    "canonicalName": "pet_vaccinations"
  },
  {
    "alias": "pet_vet_visit",
    "canonicalName": "pet_vet_visits"
  },
  {
    "alias": "pet_vet_visits",
    "canonicalName": "pet_vet_visits"
  },
  {
    "alias": "pet_weight_log",
    "canonicalName": "pet_weight_logs"
  },
  {
    "alias": "pet_weight_logs",
    "canonicalName": "pet_weight_logs"
  },
  {
    "alias": "pets",
    "canonicalName": "pets"
  },
  {
    "alias": "pharma-product",
    "canonicalName": "drug_products"
  },
  {
    "alias": "pharma-products",
    "canonicalName": "drug_products"
  },
  {
    "alias": "photo_album",
    "canonicalName": "photo_albums"
  },
  {
    "alias": "photo_albums",
    "canonicalName": "photo_albums"
  },
  {
    "alias": "photo_curated",
    "canonicalName": "photos_curated"
  },
  {
    "alias": "photos_curated",
    "canonicalName": "photos_curated"
  },
  {
    "alias": "pim-spec",
    "canonicalName": "product_specs"
  },
  {
    "alias": "pim-specs",
    "canonicalName": "product_specs"
  },
  {
    "alias": "pipeline",
    "canonicalName": "pipelines"
  },
  {
    "alias": "pipeline_stage",
    "canonicalName": "pipeline_stages"
  },
  {
    "alias": "pipeline_stages",
    "canonicalName": "pipeline_stages"
  },
  {
    "alias": "pipelines",
    "canonicalName": "pipelines"
  },
  {
    "alias": "place_visited",
    "canonicalName": "places_visited"
  },
  {
    "alias": "place_wishlist",
    "canonicalName": "places_wishlist"
  },
  {
    "alias": "places_visited",
    "canonicalName": "places_visited"
  },
  {
    "alias": "places_wishlist",
    "canonicalName": "places_wishlist"
  },
  {
    "alias": "plan",
    "canonicalName": "pricing_tiers"
  },
  {
    "alias": "plans",
    "canonicalName": "pricing_tiers"
  },
  {
    "alias": "plant",
    "canonicalName": "plants"
  },
  {
    "alias": "plant_care_log",
    "canonicalName": "plant_care_logs"
  },
  {
    "alias": "plant_care_logs",
    "canonicalName": "plant_care_logs"
  },
  {
    "alias": "plants",
    "canonicalName": "plants"
  },
  {
    "alias": "plm-requirement",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "plm-requirements",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "po",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "po-line",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "po-lines",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "podcast",
    "canonicalName": "podcasts"
  },
  {
    "alias": "podcast_episode",
    "canonicalName": "podcast_episodes"
  },
  {
    "alias": "podcast_episodes",
    "canonicalName": "podcast_episodes"
  },
  {
    "alias": "podcast_progress",
    "canonicalName": "podcast_progress"
  },
  {
    "alias": "podcasts",
    "canonicalName": "podcasts"
  },
  {
    "alias": "policies",
    "canonicalName": "policy_gates"
  },
  {
    "alias": "policy",
    "canonicalName": "policy_gates"
  },
  {
    "alias": "policy_gate",
    "canonicalName": "policy_gates"
  },
  {
    "alias": "policy_gates",
    "canonicalName": "policy_gates"
  },
  {
    "alias": "pos",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "pr",
    "canonicalName": "pull_requests"
  },
  {
    "alias": "pr_issue",
    "canonicalName": "pull_request_issues"
  },
  {
    "alias": "pr_issues",
    "canonicalName": "pull_request_issues"
  },
  {
    "alias": "praise",
    "canonicalName": "praise"
  },
  {
    "alias": "prayer_entry",
    "canonicalName": "prayer_log_granular"
  },
  {
    "alias": "prayer_log_granular",
    "canonicalName": "prayer_log_granular"
  },
  {
    "alias": "pregnancies",
    "canonicalName": "pregnancies"
  },
  {
    "alias": "pregnancy",
    "canonicalName": "pregnancies"
  },
  {
    "alias": "pregnancy_loss",
    "canonicalName": "pregnancy_losses"
  },
  {
    "alias": "pregnancy_losses",
    "canonicalName": "pregnancy_losses"
  },
  {
    "alias": "prenatal_visit",
    "canonicalName": "prenatal_visits"
  },
  {
    "alias": "prenatal_visits",
    "canonicalName": "prenatal_visits"
  },
  {
    "alias": "prescription",
    "canonicalName": "prescriptions"
  },
  {
    "alias": "prescriptions",
    "canonicalName": "prescriptions"
  },
  {
    "alias": "price",
    "canonicalName": "prices"
  },
  {
    "alias": "prices",
    "canonicalName": "prices"
  },
  {
    "alias": "pricing_tier",
    "canonicalName": "pricing_tiers"
  },
  {
    "alias": "pricing_tiers",
    "canonicalName": "pricing_tiers"
  },
  {
    "alias": "product",
    "canonicalName": "products_catalog"
  },
  {
    "alias": "product_bom",
    "canonicalName": "product_boms"
  },
  {
    "alias": "product_boms",
    "canonicalName": "product_boms"
  },
  {
    "alias": "product_listing",
    "canonicalName": "product_listings"
  },
  {
    "alias": "product_listing_message",
    "canonicalName": "product_listing_messages"
  },
  {
    "alias": "product_listing_messages",
    "canonicalName": "product_listing_messages"
  },
  {
    "alias": "product_listings",
    "canonicalName": "product_listings"
  },
  {
    "alias": "product_offer",
    "canonicalName": "product_offers"
  },
  {
    "alias": "product_offers",
    "canonicalName": "product_offers"
  },
  {
    "alias": "product_requirement",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "product_requirements",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "product_revision",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "product_revisions",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "product_spec",
    "canonicalName": "product_specs"
  },
  {
    "alias": "product_specs",
    "canonicalName": "product_specs"
  },
  {
    "alias": "product_variant",
    "canonicalName": "product_variants"
  },
  {
    "alias": "product_variants",
    "canonicalName": "product_variants"
  },
  {
    "alias": "product-bom",
    "canonicalName": "product_boms"
  },
  {
    "alias": "product-boms",
    "canonicalName": "product_boms"
  },
  {
    "alias": "product-requirement",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "product-requirements",
    "canonicalName": "product_requirements"
  },
  {
    "alias": "product-revision",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "product-revisions",
    "canonicalName": "product_revisions"
  },
  {
    "alias": "product-spec",
    "canonicalName": "product_specs"
  },
  {
    "alias": "product-specs",
    "canonicalName": "product_specs"
  },
  {
    "alias": "production_order",
    "canonicalName": "work_orders"
  },
  {
    "alias": "production_orders",
    "canonicalName": "work_orders"
  },
  {
    "alias": "products",
    "canonicalName": "products_catalog"
  },
  {
    "alias": "products_catalog",
    "canonicalName": "products_catalog"
  },
  {
    "alias": "project_role",
    "canonicalName": "project_roles"
  },
  {
    "alias": "project_roles",
    "canonicalName": "project_roles"
  },
  {
    "alias": "project_update",
    "canonicalName": "project_updates"
  },
  {
    "alias": "project_updates",
    "canonicalName": "project_updates"
  },
  {
    "alias": "property",
    "canonicalName": "property_listings"
  },
  {
    "alias": "property_inspection",
    "canonicalName": "property_inspections"
  },
  {
    "alias": "property_inspections",
    "canonicalName": "property_inspections"
  },
  {
    "alias": "property_listing",
    "canonicalName": "property_listings"
  },
  {
    "alias": "property_listings",
    "canonicalName": "property_listings"
  },
  {
    "alias": "property_offer",
    "canonicalName": "property_offers"
  },
  {
    "alias": "property_offers",
    "canonicalName": "property_offers"
  },
  {
    "alias": "property_visit",
    "canonicalName": "property_visits"
  },
  {
    "alias": "property_visits",
    "canonicalName": "property_visits"
  },
  {
    "alias": "protocol_run",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "protocol_runs",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "protocol-run",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "protocol-runs",
    "canonicalName": "protocol_runs"
  },
  {
    "alias": "provenance",
    "canonicalName": "provenance_events"
  },
  {
    "alias": "provenance_event",
    "canonicalName": "provenance_events"
  },
  {
    "alias": "provenance_events",
    "canonicalName": "provenance_events"
  },
  {
    "alias": "prs",
    "canonicalName": "pull_requests"
  },
  {
    "alias": "pto",
    "canonicalName": "time_off_requests"
  },
  {
    "alias": "public_case",
    "canonicalName": "public_cases"
  },
  {
    "alias": "public_cases",
    "canonicalName": "public_cases"
  },
  {
    "alias": "public_filing",
    "canonicalName": "public_filings"
  },
  {
    "alias": "public_filings",
    "canonicalName": "public_filings"
  },
  {
    "alias": "public-agencies",
    "canonicalName": "agencies"
  },
  {
    "alias": "public-agency",
    "canonicalName": "agencies"
  },
  {
    "alias": "public-case",
    "canonicalName": "public_cases"
  },
  {
    "alias": "public-cases",
    "canonicalName": "public_cases"
  },
  {
    "alias": "public-filing",
    "canonicalName": "public_filings"
  },
  {
    "alias": "public-filings",
    "canonicalName": "public_filings"
  },
  {
    "alias": "publication-plan",
    "canonicalName": "content_publications"
  },
  {
    "alias": "publication-plans",
    "canonicalName": "content_publications"
  },
  {
    "alias": "publishing-destination",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "publishing-destinations",
    "canonicalName": "content_destinations"
  },
  {
    "alias": "pull_request",
    "canonicalName": "pull_requests"
  },
  {
    "alias": "pull_request_issue",
    "canonicalName": "pull_request_issues"
  },
  {
    "alias": "pull_request_issues",
    "canonicalName": "pull_request_issues"
  },
  {
    "alias": "pull_requests",
    "canonicalName": "pull_requests"
  },
  {
    "alias": "pulse",
    "canonicalName": "pulse_updates"
  },
  {
    "alias": "pulse_update",
    "canonicalName": "pulse_updates"
  },
  {
    "alias": "pulse_updates",
    "canonicalName": "pulse_updates"
  },
  {
    "alias": "pulses",
    "canonicalName": "pulse_updates"
  },
  {
    "alias": "pumping_session",
    "canonicalName": "pumping_sessions"
  },
  {
    "alias": "pumping_sessions",
    "canonicalName": "pumping_sessions"
  },
  {
    "alias": "purchase_order",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "purchase_order_line_item",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "purchase_order_line_items",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "purchase_orders",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "purchase-order",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "purchase-order-line-item",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "purchase-order-line-items",
    "canonicalName": "purchase_order_line_items"
  },
  {
    "alias": "purchase-orders",
    "canonicalName": "purchase_orders"
  },
  {
    "alias": "quality_gap",
    "canonicalName": "quality_gaps"
  },
  {
    "alias": "quality_gaps",
    "canonicalName": "quality_gaps"
  },
  {
    "alias": "quote",
    "canonicalName": "quotes"
  },
  {
    "alias": "quote_line",
    "canonicalName": "quote_line_items"
  },
  {
    "alias": "quote_line_item",
    "canonicalName": "quote_line_items"
  },
  {
    "alias": "quote_line_items",
    "canonicalName": "quote_line_items"
  },
  {
    "alias": "quote_lines",
    "canonicalName": "quote_line_items"
  },
  {
    "alias": "quotes",
    "canonicalName": "quotes"
  },
  {
    "alias": "race_registered",
    "canonicalName": "races_registered"
  },
  {
    "alias": "race_result",
    "canonicalName": "race_results"
  },
  {
    "alias": "race_results",
    "canonicalName": "race_results"
  },
  {
    "alias": "races_registered",
    "canonicalName": "races_registered"
  },
  {
    "alias": "reaction",
    "canonicalName": "reactions"
  },
  {
    "alias": "reactions",
    "canonicalName": "reactions"
  },
  {
    "alias": "reading",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "reading_challenge",
    "canonicalName": "reading_challenges"
  },
  {
    "alias": "reading_challenges",
    "canonicalName": "reading_challenges"
  },
  {
    "alias": "reading_list",
    "canonicalName": "reading_lists"
  },
  {
    "alias": "reading_lists",
    "canonicalName": "reading_lists"
  },
  {
    "alias": "readings",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "real_estate_owned",
    "canonicalName": "real_estate_owned"
  },
  {
    "alias": "real_estate_owned_item",
    "canonicalName": "real_estate_owned"
  },
  {
    "alias": "receipt",
    "canonicalName": "important_receipts"
  },
  {
    "alias": "recipe",
    "canonicalName": "recipes"
  },
  {
    "alias": "recipe_collection",
    "canonicalName": "recipe_collections"
  },
  {
    "alias": "recipe_collections",
    "canonicalName": "recipe_collections"
  },
  {
    "alias": "recipe_ingredient",
    "canonicalName": "recipe_ingredients"
  },
  {
    "alias": "recipe_ingredients",
    "canonicalName": "recipe_ingredients"
  },
  {
    "alias": "recipe_step",
    "canonicalName": "recipe_steps"
  },
  {
    "alias": "recipe_steps",
    "canonicalName": "recipe_steps"
  },
  {
    "alias": "recipes",
    "canonicalName": "recipes"
  },
  {
    "alias": "recording",
    "canonicalName": "session_recordings"
  },
  {
    "alias": "recordings",
    "canonicalName": "session_recordings"
  },
  {
    "alias": "recurring_expense",
    "canonicalName": "recurring_expenses"
  },
  {
    "alias": "recurring_expenses",
    "canonicalName": "recurring_expenses"
  },
  {
    "alias": "recurring_income",
    "canonicalName": "recurring_incomes"
  },
  {
    "alias": "recurring_incomes",
    "canonicalName": "recurring_incomes"
  },
  {
    "alias": "redirect",
    "canonicalName": "redirects"
  },
  {
    "alias": "redirects",
    "canonicalName": "redirects"
  },
  {
    "alias": "referral",
    "canonicalName": "referrals"
  },
  {
    "alias": "referral_received",
    "canonicalName": "referrals_received"
  },
  {
    "alias": "referrals",
    "canonicalName": "referrals"
  },
  {
    "alias": "referrals_received",
    "canonicalName": "referrals_received"
  },
  {
    "alias": "reflection",
    "canonicalName": "reflections"
  },
  {
    "alias": "reflections",
    "canonicalName": "reflections"
  },
  {
    "alias": "refund",
    "canonicalName": "refunds"
  },
  {
    "alias": "refunds",
    "canonicalName": "refunds"
  },
  {
    "alias": "relation",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "relations",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "release_pipeline",
    "canonicalName": "release_pipelines"
  },
  {
    "alias": "release_pipelines",
    "canonicalName": "release_pipelines"
  },
  {
    "alias": "release_run",
    "canonicalName": "release_runs"
  },
  {
    "alias": "release_runs",
    "canonicalName": "release_runs"
  },
  {
    "alias": "release_stage",
    "canonicalName": "release_stages"
  },
  {
    "alias": "release_stages",
    "canonicalName": "release_stages"
  },
  {
    "alias": "religious_practice",
    "canonicalName": "religious_practices"
  },
  {
    "alias": "religious_practices",
    "canonicalName": "religious_practices"
  },
  {
    "alias": "rental_listing",
    "canonicalName": "rental_listings"
  },
  {
    "alias": "rental_listings",
    "canonicalName": "rental_listings"
  },
  {
    "alias": "replay",
    "canonicalName": "replays"
  },
  {
    "alias": "replays",
    "canonicalName": "replays"
  },
  {
    "alias": "replenishment-item",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "replenishment-items",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "replenishment-plan",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "replenishment-plans",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "repo",
    "canonicalName": "repositories"
  },
  {
    "alias": "repos",
    "canonicalName": "repositories"
  },
  {
    "alias": "repositories",
    "canonicalName": "repositories"
  },
  {
    "alias": "repository",
    "canonicalName": "repositories"
  },
  {
    "alias": "requirement",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "requirements",
    "canonicalName": "compliance_obligations"
  },
  {
    "alias": "research_studies",
    "canonicalName": "studies"
  },
  {
    "alias": "research_study",
    "canonicalName": "studies"
  },
  {
    "alias": "research_subject",
    "canonicalName": "participants"
  },
  {
    "alias": "research_subjects",
    "canonicalName": "participants"
  },
  {
    "alias": "resource_grant",
    "canonicalName": "agent_resource_grants"
  },
  {
    "alias": "restaurant",
    "canonicalName": "restaurants"
  },
  {
    "alias": "restaurant_visit",
    "canonicalName": "restaurant_visits"
  },
  {
    "alias": "restaurant_visits",
    "canonicalName": "restaurant_visits"
  },
  {
    "alias": "restaurants",
    "canonicalName": "restaurants"
  },
  {
    "alias": "restriction",
    "canonicalName": "restrictions"
  },
  {
    "alias": "restrictions",
    "canonicalName": "restrictions"
  },
  {
    "alias": "resume",
    "canonicalName": "resumes"
  },
  {
    "alias": "resumes",
    "canonicalName": "resumes"
  },
  {
    "alias": "retention",
    "canonicalName": "retention_analyses"
  },
  {
    "alias": "retention_analyses",
    "canonicalName": "retention_analyses"
  },
  {
    "alias": "retention_analysis",
    "canonicalName": "retention_analyses"
  },
  {
    "alias": "retirement_account",
    "canonicalName": "retirement_accounts"
  },
  {
    "alias": "retirement_accounts",
    "canonicalName": "retirement_accounts"
  },
  {
    "alias": "retreat",
    "canonicalName": "retreats_attended"
  },
  {
    "alias": "retreat_attended",
    "canonicalName": "retreats_attended"
  },
  {
    "alias": "retreats_attended",
    "canonicalName": "retreats_attended"
  },
  {
    "alias": "review",
    "canonicalName": "performance_reviews"
  },
  {
    "alias": "review_given",
    "canonicalName": "reviews_given"
  },
  {
    "alias": "review_received",
    "canonicalName": "reviews_received"
  },
  {
    "alias": "reviews",
    "canonicalName": "performance_reviews"
  },
  {
    "alias": "reviews_given",
    "canonicalName": "reviews_given"
  },
  {
    "alias": "reviews_received",
    "canonicalName": "reviews_received"
  },
  {
    "alias": "rfi",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "rfis",
    "canonicalName": "construction_rfis"
  },
  {
    "alias": "role",
    "canonicalName": "roles"
  },
  {
    "alias": "role_assignment",
    "canonicalName": "role_assignments"
  },
  {
    "alias": "role_assignments",
    "canonicalName": "role_assignments"
  },
  {
    "alias": "roles",
    "canonicalName": "roles"
  },
  {
    "alias": "romantic_gift",
    "canonicalName": "romantic_gifts"
  },
  {
    "alias": "romantic_gifts",
    "canonicalName": "romantic_gifts"
  },
  {
    "alias": "romantic_partner",
    "canonicalName": "romantic_partners"
  },
  {
    "alias": "romantic_partners",
    "canonicalName": "romantic_partners"
  },
  {
    "alias": "routine",
    "canonicalName": "routines"
  },
  {
    "alias": "routine_workout",
    "canonicalName": "routine_workouts"
  },
  {
    "alias": "routine_workouts",
    "canonicalName": "routine_workouts"
  },
  {
    "alias": "routines",
    "canonicalName": "routines"
  },
  {
    "alias": "run",
    "canonicalName": "agent_runs"
  },
  {
    "alias": "run_cost",
    "canonicalName": "run_costs"
  },
  {
    "alias": "run_costs",
    "canonicalName": "run_costs"
  },
  {
    "alias": "running_route",
    "canonicalName": "running_routes"
  },
  {
    "alias": "running_routes",
    "canonicalName": "running_routes"
  },
  {
    "alias": "safety-event",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "safety-events",
    "canonicalName": "adverse_events"
  },
  {
    "alias": "sample",
    "canonicalName": "samples"
  },
  {
    "alias": "samples",
    "canonicalName": "samples"
  },
  {
    "alias": "sandbox",
    "canonicalName": "coding_sandboxes"
  },
  {
    "alias": "sandboxes",
    "canonicalName": "coding_sandboxes"
  },
  {
    "alias": "satisfaction_rating",
    "canonicalName": "satisfaction_ratings"
  },
  {
    "alias": "satisfaction_ratings",
    "canonicalName": "satisfaction_ratings"
  },
  {
    "alias": "saved_quote",
    "canonicalName": "saved_quotes"
  },
  {
    "alias": "saved_quotes",
    "canonicalName": "saved_quotes"
  },
  {
    "alias": "savings_goal",
    "canonicalName": "savings_goals"
  },
  {
    "alias": "savings_goals",
    "canonicalName": "savings_goals"
  },
  {
    "alias": "school",
    "canonicalName": "schools"
  },
  {
    "alias": "school_assignment",
    "canonicalName": "school_assignments"
  },
  {
    "alias": "school_assignments",
    "canonicalName": "school_assignments"
  },
  {
    "alias": "school_calendar_entries",
    "canonicalName": "school_calendar_entries"
  },
  {
    "alias": "school_calendar_entry",
    "canonicalName": "school_calendar_entries"
  },
  {
    "alias": "school_event",
    "canonicalName": "school_events"
  },
  {
    "alias": "school_events",
    "canonicalName": "school_events"
  },
  {
    "alias": "school_grade",
    "canonicalName": "school_grades"
  },
  {
    "alias": "school_grades",
    "canonicalName": "school_grades"
  },
  {
    "alias": "schools",
    "canonicalName": "schools"
  },
  {
    "alias": "scim",
    "canonicalName": "scim_provisioning_state"
  },
  {
    "alias": "scim_provisioning_state",
    "canonicalName": "scim_provisioning_state"
  },
  {
    "alias": "scim_state",
    "canonicalName": "scim_provisioning_state"
  },
  {
    "alias": "scripture_reading_entry",
    "canonicalName": "scripture_reading_log"
  },
  {
    "alias": "scripture_reading_log",
    "canonicalName": "scripture_reading_log"
  },
  {
    "alias": "secret",
    "canonicalName": "infra_secrets"
  },
  {
    "alias": "secrets",
    "canonicalName": "infra_secrets"
  },
  {
    "alias": "seedling",
    "canonicalName": "seedlings"
  },
  {
    "alias": "seedlings",
    "canonicalName": "seedlings"
  },
  {
    "alias": "segment",
    "canonicalName": "segments"
  },
  {
    "alias": "segments",
    "canonicalName": "segments"
  },
  {
    "alias": "self_harm_urge",
    "canonicalName": "self_harm_urges"
  },
  {
    "alias": "self_harm_urges",
    "canonicalName": "self_harm_urges"
  },
  {
    "alias": "semantic_view",
    "canonicalName": "semantic_views"
  },
  {
    "alias": "semantic_views",
    "canonicalName": "semantic_views"
  },
  {
    "alias": "sensor_reading",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "sensor_readings",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "sensor-reading",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "sensor-readings",
    "canonicalName": "sensor_readings"
  },
  {
    "alias": "sequence",
    "canonicalName": "email_sequences"
  },
  {
    "alias": "sequences",
    "canonicalName": "email_sequences"
  },
  {
    "alias": "service",
    "canonicalName": "services"
  },
  {
    "alias": "service_listing",
    "canonicalName": "service_listings"
  },
  {
    "alias": "service_listings",
    "canonicalName": "service_listings"
  },
  {
    "alias": "services",
    "canonicalName": "services"
  },
  {
    "alias": "session",
    "canonicalName": "agent_sessions"
  },
  {
    "alias": "session_recording",
    "canonicalName": "session_recordings"
  },
  {
    "alias": "session_recordings",
    "canonicalName": "session_recordings"
  },
  {
    "alias": "sessions",
    "canonicalName": "agent_sessions"
  },
  {
    "alias": "share",
    "canonicalName": "share_invitations"
  },
  {
    "alias": "share_invitation",
    "canonicalName": "share_invitations"
  },
  {
    "alias": "share_invitations",
    "canonicalName": "share_invitations"
  },
  {
    "alias": "shares",
    "canonicalName": "share_invitations"
  },
  {
    "alias": "shipment",
    "canonicalName": "shipments"
  },
  {
    "alias": "shipment_leg",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "shipment_legs",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "shipment-leg",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "shipment-legs",
    "canonicalName": "shipment_legs"
  },
  {
    "alias": "shipments",
    "canonicalName": "shipments"
  },
  {
    "alias": "shopping_cart",
    "canonicalName": "shopping_carts"
  },
  {
    "alias": "shopping_carts",
    "canonicalName": "shopping_carts"
  },
  {
    "alias": "side_conversation",
    "canonicalName": "side_conversations"
  },
  {
    "alias": "side_conversations",
    "canonicalName": "side_conversations"
  },
  {
    "alias": "skill",
    "canonicalName": "agent_skills"
  },
  {
    "alias": "skill_assessment",
    "canonicalName": "skill_assessments"
  },
  {
    "alias": "skill_assessments",
    "canonicalName": "skill_assessments"
  },
  {
    "alias": "skill_progress_log",
    "canonicalName": "skill_progress_logs"
  },
  {
    "alias": "skill_progress_logs",
    "canonicalName": "skill_progress_logs"
  },
  {
    "alias": "skills",
    "canonicalName": "agent_skills"
  },
  {
    "alias": "skincare_log",
    "canonicalName": "skincare_logs"
  },
  {
    "alias": "skincare_logs",
    "canonicalName": "skincare_logs"
  },
  {
    "alias": "skincare_routine",
    "canonicalName": "skincare_routines"
  },
  {
    "alias": "skincare_routines",
    "canonicalName": "skincare_routines"
  },
  {
    "alias": "sla",
    "canonicalName": "sla_policies"
  },
  {
    "alias": "sla_policies",
    "canonicalName": "sla_policies"
  },
  {
    "alias": "sla_policy",
    "canonicalName": "sla_policies"
  },
  {
    "alias": "slas",
    "canonicalName": "sla_policies"
  },
  {
    "alias": "sleep",
    "canonicalName": "sleep_logs"
  },
  {
    "alias": "sleep_log",
    "canonicalName": "sleep_logs"
  },
  {
    "alias": "sleep_logs",
    "canonicalName": "sleep_logs"
  },
  {
    "alias": "slo",
    "canonicalName": "slos"
  },
  {
    "alias": "slo_calculation",
    "canonicalName": "slo_calculations"
  },
  {
    "alias": "slo_calculations",
    "canonicalName": "slo_calculations"
  },
  {
    "alias": "slos",
    "canonicalName": "slos"
  },
  {
    "alias": "slot",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "slots",
    "canonicalName": "booking_slots"
  },
  {
    "alias": "snippet",
    "canonicalName": "snippets"
  },
  {
    "alias": "snippets",
    "canonicalName": "snippets"
  },
  {
    "alias": "sobriety_slip",
    "canonicalName": "sobriety_slips"
  },
  {
    "alias": "sobriety_slips",
    "canonicalName": "sobriety_slips"
  },
  {
    "alias": "sobriety_tracker",
    "canonicalName": "sobriety_trackers"
  },
  {
    "alias": "sobriety_trackers",
    "canonicalName": "sobriety_trackers"
  },
  {
    "alias": "span",
    "canonicalName": "spans"
  },
  {
    "alias": "spans",
    "canonicalName": "spans"
  },
  {
    "alias": "specimen",
    "canonicalName": "samples"
  },
  {
    "alias": "specimens",
    "canonicalName": "samples"
  },
  {
    "alias": "spirit",
    "canonicalName": "spirits_collection"
  },
  {
    "alias": "spirits_collection",
    "canonicalName": "spirits_collection"
  },
  {
    "alias": "spiritual_practice",
    "canonicalName": "spiritual_practices"
  },
  {
    "alias": "spiritual_practices",
    "canonicalName": "spiritual_practices"
  },
  {
    "alias": "sport_event_attendance",
    "canonicalName": "sport_events_attended"
  },
  {
    "alias": "sport_events_attended",
    "canonicalName": "sport_events_attended"
  },
  {
    "alias": "stage",
    "canonicalName": "pipeline_stages"
  },
  {
    "alias": "stages",
    "canonicalName": "pipeline_stages"
  },
  {
    "alias": "state",
    "canonicalName": "workflow_states"
  },
  {
    "alias": "states",
    "canonicalName": "workflow_states"
  },
  {
    "alias": "step_log",
    "canonicalName": "step_logs"
  },
  {
    "alias": "step_logs",
    "canonicalName": "step_logs"
  },
  {
    "alias": "steps",
    "canonicalName": "step_logs"
  },
  {
    "alias": "sti_test",
    "canonicalName": "sti_tests"
  },
  {
    "alias": "sti_tests",
    "canonicalName": "sti_tests"
  },
  {
    "alias": "stock_movements",
    "canonicalName": "stock_movements"
  },
  {
    "alias": "stock-item",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "stock-items",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "stock-movement",
    "canonicalName": "stock_movements"
  },
  {
    "alias": "stock-movements",
    "canonicalName": "stock_movements"
  },
  {
    "alias": "student",
    "canonicalName": "learners"
  },
  {
    "alias": "students",
    "canonicalName": "learners"
  },
  {
    "alias": "studies",
    "canonicalName": "studies"
  },
  {
    "alias": "study",
    "canonicalName": "studies"
  },
  {
    "alias": "study_plan",
    "canonicalName": "study_plans"
  },
  {
    "alias": "study_plans",
    "canonicalName": "study_plans"
  },
  {
    "alias": "study_session",
    "canonicalName": "study_sessions"
  },
  {
    "alias": "study_sessions",
    "canonicalName": "study_sessions"
  },
  {
    "alias": "sub",
    "canonicalName": "subscriptions"
  },
  {
    "alias": "subject",
    "canonicalName": "subjects"
  },
  {
    "alias": "subjects",
    "canonicalName": "subjects"
  },
  {
    "alias": "submission",
    "canonicalName": "web_form_submissions"
  },
  {
    "alias": "submissions",
    "canonicalName": "web_form_submissions"
  },
  {
    "alias": "subs",
    "canonicalName": "subscriptions"
  },
  {
    "alias": "subscriber",
    "canonicalName": "newsletter_subscribers"
  },
  {
    "alias": "subscribers",
    "canonicalName": "newsletter_subscribers"
  },
  {
    "alias": "subscription",
    "canonicalName": "subscriptions"
  },
  {
    "alias": "subscription_item",
    "canonicalName": "subscription_items"
  },
  {
    "alias": "subscription_items",
    "canonicalName": "subscription_items"
  },
  {
    "alias": "subscriptions",
    "canonicalName": "subscriptions"
  },
  {
    "alias": "supplement_log",
    "canonicalName": "supplements_log"
  },
  {
    "alias": "supplements_log",
    "canonicalName": "supplements_log"
  },
  {
    "alias": "supplier",
    "canonicalName": "suppliers"
  },
  {
    "alias": "supplier-risk",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "supplier-risks",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "suppliers",
    "canonicalName": "suppliers"
  },
  {
    "alias": "supply_plan",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "supply_plan_item",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "supply_plan_items",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "supply_plans",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "supply_risk",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "supply_risks",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "supply-plan",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "supply-plan-item",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "supply-plan-items",
    "canonicalName": "supply_plan_items"
  },
  {
    "alias": "supply-plans",
    "canonicalName": "supply_plans"
  },
  {
    "alias": "supply-risk",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "supply-risks",
    "canonicalName": "supply_risks"
  },
  {
    "alias": "support_attribute",
    "canonicalName": "support_custom_attributes"
  },
  {
    "alias": "support_attributes",
    "canonicalName": "support_custom_attributes"
  },
  {
    "alias": "support_conversation",
    "canonicalName": "support_conversations"
  },
  {
    "alias": "support_conversations",
    "canonicalName": "support_conversations"
  },
  {
    "alias": "support_custom_attribute",
    "canonicalName": "support_custom_attributes"
  },
  {
    "alias": "support_custom_attributes",
    "canonicalName": "support_custom_attributes"
  },
  {
    "alias": "support_macro",
    "canonicalName": "support_macros"
  },
  {
    "alias": "support_macros",
    "canonicalName": "support_macros"
  },
  {
    "alias": "support_message",
    "canonicalName": "support_messages"
  },
  {
    "alias": "support_messages",
    "canonicalName": "support_messages"
  },
  {
    "alias": "support_tag",
    "canonicalName": "support_tags"
  },
  {
    "alias": "support_tags",
    "canonicalName": "support_tags"
  },
  {
    "alias": "support_ticket",
    "canonicalName": "support_tickets"
  },
  {
    "alias": "support_tickets",
    "canonicalName": "support_tickets"
  },
  {
    "alias": "survey",
    "canonicalName": "surveys"
  },
  {
    "alias": "survey_response",
    "canonicalName": "survey_responses"
  },
  {
    "alias": "survey_responses",
    "canonicalName": "survey_responses"
  },
  {
    "alias": "surveys",
    "canonicalName": "surveys"
  },
  {
    "alias": "suspect_commit",
    "canonicalName": "suspect_commits"
  },
  {
    "alias": "suspect_commits",
    "canonicalName": "suspect_commits"
  },
  {
    "alias": "symptom",
    "canonicalName": "symptom_logs"
  },
  {
    "alias": "symptom_log",
    "canonicalName": "symptom_logs"
  },
  {
    "alias": "symptom_logs",
    "canonicalName": "symptom_logs"
  },
  {
    "alias": "symptoms",
    "canonicalName": "symptom_logs"
  },
  {
    "alias": "synced",
    "canonicalName": "synced_external_entities"
  },
  {
    "alias": "synced_external_entities",
    "canonicalName": "synced_external_entities"
  },
  {
    "alias": "synced_external_entity",
    "canonicalName": "synced_external_entities"
  },
  {
    "alias": "tasting_note",
    "canonicalName": "tasting_notes"
  },
  {
    "alias": "tasting_notes",
    "canonicalName": "tasting_notes"
  },
  {
    "alias": "tax_filing",
    "canonicalName": "tax_filings"
  },
  {
    "alias": "tax_filings",
    "canonicalName": "tax_filings"
  },
  {
    "alias": "teacher",
    "canonicalName": "teachers"
  },
  {
    "alias": "teachers",
    "canonicalName": "teachers"
  },
  {
    "alias": "team",
    "canonicalName": "teams"
  },
  {
    "alias": "team_member",
    "canonicalName": "team_memberships"
  },
  {
    "alias": "team_membership",
    "canonicalName": "team_memberships"
  },
  {
    "alias": "team_memberships",
    "canonicalName": "team_memberships"
  },
  {
    "alias": "teams",
    "canonicalName": "teams"
  },
  {
    "alias": "test",
    "canonicalName": "assays"
  },
  {
    "alias": "test_case",
    "canonicalName": "eval_test_cases"
  },
  {
    "alias": "test_cases",
    "canonicalName": "eval_test_cases"
  },
  {
    "alias": "tests",
    "canonicalName": "assays"
  },
  {
    "alias": "theater_attendance",
    "canonicalName": "theater_opera_attended"
  },
  {
    "alias": "theater_opera_attended",
    "canonicalName": "theater_opera_attended"
  },
  {
    "alias": "therapist",
    "canonicalName": "therapists"
  },
  {
    "alias": "therapists",
    "canonicalName": "therapists"
  },
  {
    "alias": "therapy_session",
    "canonicalName": "therapy_sessions"
  },
  {
    "alias": "therapy_sessions",
    "canonicalName": "therapy_sessions"
  },
  {
    "alias": "thing",
    "canonicalName": "iot_things"
  },
  {
    "alias": "things",
    "canonicalName": "iot_things"
  },
  {
    "alias": "ticket",
    "canonicalName": "support_tickets"
  },
  {
    "alias": "tickets",
    "canonicalName": "support_tickets"
  },
  {
    "alias": "tier",
    "canonicalName": "customer_tiers"
  },
  {
    "alias": "tiers",
    "canonicalName": "customer_tiers"
  },
  {
    "alias": "time_entries",
    "canonicalName": "time_entries"
  },
  {
    "alias": "time_entry",
    "canonicalName": "time_entries"
  },
  {
    "alias": "time_off",
    "canonicalName": "time_off_requests"
  },
  {
    "alias": "time_off_request",
    "canonicalName": "time_off_requests"
  },
  {
    "alias": "time_off_requests",
    "canonicalName": "time_off_requests"
  },
  {
    "alias": "tool_call",
    "canonicalName": "tool_invocations"
  },
  {
    "alias": "tool_calls",
    "canonicalName": "tool_invocations"
  },
  {
    "alias": "tool_invocation",
    "canonicalName": "tool_invocations"
  },
  {
    "alias": "tool_invocations",
    "canonicalName": "tool_invocations"
  },
  {
    "alias": "trace",
    "canonicalName": "spans"
  },
  {
    "alias": "traces",
    "canonicalName": "spans"
  },
  {
    "alias": "training_block",
    "canonicalName": "training_blocks"
  },
  {
    "alias": "training_blocks",
    "canonicalName": "training_blocks"
  },
  {
    "alias": "training_plan_template",
    "canonicalName": "training_plan_templates"
  },
  {
    "alias": "training_plan_templates",
    "canonicalName": "training_plan_templates"
  },
  {
    "alias": "transaction",
    "canonicalName": "transactions"
  },
  {
    "alias": "transactions",
    "canonicalName": "transactions"
  },
  {
    "alias": "transport",
    "canonicalName": "transports_booked"
  },
  {
    "alias": "transport_booked",
    "canonicalName": "transports_booked"
  },
  {
    "alias": "transport-rate",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "transport-rates",
    "canonicalName": "freight_rates"
  },
  {
    "alias": "transports_booked",
    "canonicalName": "transports_booked"
  },
  {
    "alias": "travel_document",
    "canonicalName": "travel_documents"
  },
  {
    "alias": "travel_documents",
    "canonicalName": "travel_documents"
  },
  {
    "alias": "triage",
    "canonicalName": "triage_responsibilities"
  },
  {
    "alias": "triage_responsibilities",
    "canonicalName": "triage_responsibilities"
  },
  {
    "alias": "triage_responsibility",
    "canonicalName": "triage_responsibilities"
  },
  {
    "alias": "trial",
    "canonicalName": "studies"
  },
  {
    "alias": "trials",
    "canonicalName": "studies"
  },
  {
    "alias": "trip",
    "canonicalName": "trips"
  },
  {
    "alias": "trip_itinerary_item",
    "canonicalName": "trip_itinerary_items"
  },
  {
    "alias": "trip_itinerary_items",
    "canonicalName": "trip_itinerary_items"
  },
  {
    "alias": "trip_packing_list",
    "canonicalName": "trip_packing_lists"
  },
  {
    "alias": "trip_packing_lists",
    "canonicalName": "trip_packing_lists"
  },
  {
    "alias": "trips",
    "canonicalName": "trips"
  },
  {
    "alias": "trust_fund",
    "canonicalName": "trust_funds"
  },
  {
    "alias": "trust_funds",
    "canonicalName": "trust_funds"
  },
  {
    "alias": "ttc_log",
    "canonicalName": "ttc_logs"
  },
  {
    "alias": "ttc_logs",
    "canonicalName": "ttc_logs"
  },
  {
    "alias": "tv_episode",
    "canonicalName": "tv_episodes"
  },
  {
    "alias": "tv_episodes",
    "canonicalName": "tv_episodes"
  },
  {
    "alias": "tv_show",
    "canonicalName": "tv_shows"
  },
  {
    "alias": "tv_shows",
    "canonicalName": "tv_shows"
  },
  {
    "alias": "typed_profile",
    "canonicalName": "domain_profiles"
  },
  {
    "alias": "typed_profiles",
    "canonicalName": "domain_profiles"
  },
  {
    "alias": "unit",
    "canonicalName": "units"
  },
  {
    "alias": "units",
    "canonicalName": "units"
  },
  {
    "alias": "universal_relation",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "universal_relations",
    "canonicalName": "entity_relations"
  },
  {
    "alias": "usage",
    "canonicalName": "usage_records"
  },
  {
    "alias": "usage_record",
    "canonicalName": "usage_records"
  },
  {
    "alias": "usage_records",
    "canonicalName": "usage_records"
  },
  {
    "alias": "vaccination",
    "canonicalName": "vaccinations_personal"
  },
  {
    "alias": "vaccinations",
    "canonicalName": "vaccinations_personal"
  },
  {
    "alias": "vaccinations_personal",
    "canonicalName": "vaccinations_personal"
  },
  {
    "alias": "variant",
    "canonicalName": "product_variants"
  },
  {
    "alias": "variants",
    "canonicalName": "product_variants"
  },
  {
    "alias": "vehicle",
    "canonicalName": "vehicles"
  },
  {
    "alias": "vehicle_document",
    "canonicalName": "vehicle_documents"
  },
  {
    "alias": "vehicle_documents",
    "canonicalName": "vehicle_documents"
  },
  {
    "alias": "vehicle_inspection",
    "canonicalName": "vehicle_inspections"
  },
  {
    "alias": "vehicle_inspections",
    "canonicalName": "vehicle_inspections"
  },
  {
    "alias": "vehicle_insurance_policies",
    "canonicalName": "vehicle_insurance_policies"
  },
  {
    "alias": "vehicle_insurance_policy",
    "canonicalName": "vehicle_insurance_policies"
  },
  {
    "alias": "vehicle_listing",
    "canonicalName": "vehicle_listings"
  },
  {
    "alias": "vehicle_listings",
    "canonicalName": "vehicle_listings"
  },
  {
    "alias": "vehicle_maintenance",
    "canonicalName": "vehicle_maintenance"
  },
  {
    "alias": "vehicle_test_drive",
    "canonicalName": "vehicle_test_drives"
  },
  {
    "alias": "vehicle_test_drives",
    "canonicalName": "vehicle_test_drives"
  },
  {
    "alias": "vehicles",
    "canonicalName": "vehicles"
  },
  {
    "alias": "vendor",
    "canonicalName": "suppliers"
  },
  {
    "alias": "vendors",
    "canonicalName": "suppliers"
  },
  {
    "alias": "version",
    "canonicalName": "versions"
  },
  {
    "alias": "versions",
    "canonicalName": "versions"
  },
  {
    "alias": "visit",
    "canonicalName": "encounters"
  },
  {
    "alias": "visits",
    "canonicalName": "encounters"
  },
  {
    "alias": "vocab",
    "canonicalName": "vocabulary_items"
  },
  {
    "alias": "vocabularies",
    "canonicalName": "vocabularies"
  },
  {
    "alias": "vocabulary",
    "canonicalName": "vocabularies"
  },
  {
    "alias": "vocabulary_item",
    "canonicalName": "vocabulary_items"
  },
  {
    "alias": "vocabulary_items",
    "canonicalName": "vocabulary_items"
  },
  {
    "alias": "voice_memo",
    "canonicalName": "voice_memos"
  },
  {
    "alias": "voice_memos",
    "canonicalName": "voice_memos"
  },
  {
    "alias": "volunteer_activities",
    "canonicalName": "volunteer_activities"
  },
  {
    "alias": "volunteer_activity",
    "canonicalName": "volunteer_activities"
  },
  {
    "alias": "warehouse",
    "canonicalName": "warehouses"
  },
  {
    "alias": "warehouse-inventory",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "warehouse-stock",
    "canonicalName": "inventory_items"
  },
  {
    "alias": "warehouses",
    "canonicalName": "warehouses"
  },
  {
    "alias": "warranties",
    "canonicalName": "warranties"
  },
  {
    "alias": "warranty",
    "canonicalName": "warranties"
  },
  {
    "alias": "watch",
    "canonicalName": "watches"
  },
  {
    "alias": "watch_log",
    "canonicalName": "watch_logs"
  },
  {
    "alias": "watch_logs",
    "canonicalName": "watch_logs"
  },
  {
    "alias": "watches",
    "canonicalName": "watches"
  },
  {
    "alias": "watchlist_item",
    "canonicalName": "watchlist_items"
  },
  {
    "alias": "watchlist_items",
    "canonicalName": "watchlist_items"
  },
  {
    "alias": "water",
    "canonicalName": "water_intake_logs"
  },
  {
    "alias": "water_intake_log",
    "canonicalName": "water_intake_logs"
  },
  {
    "alias": "water_intake_logs",
    "canonicalName": "water_intake_logs"
  },
  {
    "alias": "web_form_submission",
    "canonicalName": "web_form_submissions"
  },
  {
    "alias": "web_form_submissions",
    "canonicalName": "web_form_submissions"
  },
  {
    "alias": "webhook",
    "canonicalName": "webhooks_outbound"
  },
  {
    "alias": "webhook_deliveries",
    "canonicalName": "webhook_deliveries"
  },
  {
    "alias": "webhook_delivery",
    "canonicalName": "webhook_deliveries"
  },
  {
    "alias": "webhooks",
    "canonicalName": "webhooks_outbound"
  },
  {
    "alias": "webhooks_outbound",
    "canonicalName": "webhooks_outbound"
  },
  {
    "alias": "weight",
    "canonicalName": "weight_logs"
  },
  {
    "alias": "weight_log",
    "canonicalName": "weight_logs"
  },
  {
    "alias": "weight_logs",
    "canonicalName": "weight_logs"
  },
  {
    "alias": "wine_cellar_bottle",
    "canonicalName": "wine_cellar_bottles"
  },
  {
    "alias": "wine_cellar_bottles",
    "canonicalName": "wine_cellar_bottles"
  },
  {
    "alias": "wine_pairing",
    "canonicalName": "wine_pairings"
  },
  {
    "alias": "wine_pairings",
    "canonicalName": "wine_pairings"
  },
  {
    "alias": "wishlist",
    "canonicalName": "wishlists"
  },
  {
    "alias": "wishlist_item",
    "canonicalName": "wishlist_items"
  },
  {
    "alias": "wishlist_items",
    "canonicalName": "wishlist_items"
  },
  {
    "alias": "wishlists",
    "canonicalName": "wishlists"
  },
  {
    "alias": "work_order",
    "canonicalName": "work_orders"
  },
  {
    "alias": "work_orders",
    "canonicalName": "work_orders"
  },
  {
    "alias": "work-order",
    "canonicalName": "work_orders"
  },
  {
    "alias": "work-orders",
    "canonicalName": "work_orders"
  },
  {
    "alias": "workflow_state",
    "canonicalName": "workflow_states"
  },
  {
    "alias": "workflow_states",
    "canonicalName": "workflow_states"
  },
  {
    "alias": "workout",
    "canonicalName": "workouts"
  },
  {
    "alias": "workout_exercise",
    "canonicalName": "workout_exercises"
  },
  {
    "alias": "workout_exercises",
    "canonicalName": "workout_exercises"
  },
  {
    "alias": "workouts",
    "canonicalName": "workouts"
  },
  {
    "alias": "writing_piece",
    "canonicalName": "writing_pieces"
  },
  {
    "alias": "writing_pieces",
    "canonicalName": "writing_pieces"
  }
] as const;

export const compactStableClawCliCommandNames: readonly string[] = [
  "accessibility",
  "accounts",
  "agenda",
  "agent-resource",
  "agents",
  "app",
  "approvals",
  "apps",
  "archive",
  "artifacts",
  "assignments",
  "audio",
  "auth",
  "automation",
  "battery",
  "blockers",
  "bluetooth",
  "browser",
  "business",
  "calendar",
  "camera",
  "career",
  "channels",
  "clipboard",
  "code",
  "commands",
  "commitments",
  "compat",
  "connections",
  "connectors",
  "content",
  "context",
  "database",
  "deadlines",
  "debt",
  "decisions",
  "dense-fixtures",
  "design",
  "desktop",
  "diagnostics",
  "disk",
  "display",
  "dock",
  "docs",
  "doctor",
  "documents",
  "drive",
  "erp",
  "evolution",
  "family",
  "files",
  "finance",
  "finder",
  "firewall",
  "focus",
  "gateway",
  "generations",
  "goals",
  "governance",
  "guidance",
  "handoffs",
  "health",
  "host",
  "images",
  "inbox",
  "inference",
  "input",
  "inspect",
  "iot",
  "judgment",
  "keyboard",
  "knowledge",
  "learning",
  "legal",
  "library",
  "location",
  "logs",
  "mac",
  "mac-care",
  "marketplace",
  "maturity",
  "mcp",
  "media",
  "messages",
  "microphone",
  "models",
  "modules",
  "monitor",
  "mouse",
  "my-work",
  "needs",
  "network",
  "nodes",
  "notes",
  "notification",
  "notify",
  "open",
  "outcomes",
  "people",
  "permissions",
  "personalities",
  "plan",
  "power",
  "preview",
  "printer",
  "privacy",
  "process",
  "profile",
  "project",
  "projects",
  "providers",
  "proxy",
  "references",
  "reminders",
  "remote",
  "report",
  "resources",
  "review",
  "routines",
  "rules",
  "runtime",
  "safety",
  "schedule",
  "screen",
  "search",
  "security",
  "sessions",
  "setup",
  "sheets",
  "shortcut",
  "signals",
  "skill-collections",
  "skills",
  "slides",
  "snippets",
  "social",
  "soul",
  "speech",
  "stt",
  "styles",
  "sync",
  "system",
  "tasks",
  "team-work",
  "telegram",
  "templates",
  "test",
  "time",
  "timeline",
  "trackpad",
  "travel",
  "tts",
  "usb",
  "verify",
  "video",
  "voice-notes",
  "vpn",
  "watch",
  "wifi",
  "window",
  "work"
] as const;

export const compactClawCliCommands: readonly CompactCliCommandSummary[] = [
  {
    "name": "setup",
    "kind": "canonical"
  },
  {
    "name": "modules",
    "kind": "canonical"
  },
  {
    "name": "host",
    "kind": "canonical"
  },
  {
    "name": "system",
    "kind": "canonical"
  },
  {
    "name": "network",
    "kind": "canonical"
  },
  {
    "name": "mac",
    "kind": "canonical"
  },
  {
    "name": "permissions",
    "kind": "canonical"
  },
  {
    "name": "wifi",
    "kind": "canonical"
  },
  {
    "name": "window",
    "kind": "canonical"
  },
  {
    "name": "shortcut",
    "kind": "canonical"
  },
  {
    "name": "app",
    "kind": "canonical"
  },
  {
    "name": "process",
    "kind": "canonical"
  },
  {
    "name": "vpn",
    "kind": "canonical"
  },
  {
    "name": "proxy",
    "kind": "canonical"
  },
  {
    "name": "firewall",
    "kind": "canonical"
  },
  {
    "name": "bluetooth",
    "kind": "canonical"
  },
  {
    "name": "display",
    "kind": "canonical"
  },
  {
    "name": "screen",
    "kind": "canonical"
  },
  {
    "name": "input",
    "kind": "canonical"
  },
  {
    "name": "keyboard",
    "kind": "canonical"
  },
  {
    "name": "mouse",
    "kind": "canonical"
  },
  {
    "name": "trackpad",
    "kind": "canonical"
  },
  {
    "name": "clipboard",
    "kind": "canonical"
  },
  {
    "name": "focus",
    "kind": "canonical"
  },
  {
    "name": "notification",
    "kind": "canonical"
  },
  {
    "name": "power",
    "kind": "canonical"
  },
  {
    "name": "battery",
    "kind": "canonical"
  },
  {
    "name": "camera",
    "kind": "canonical"
  },
  {
    "name": "microphone",
    "kind": "canonical"
  },
  {
    "name": "speech",
    "kind": "canonical"
  },
  {
    "name": "printer",
    "kind": "canonical"
  },
  {
    "name": "usb",
    "kind": "canonical"
  },
  {
    "name": "disk",
    "kind": "canonical"
  },
  {
    "name": "privacy",
    "kind": "canonical"
  },
  {
    "name": "security",
    "kind": "canonical"
  },
  {
    "name": "automation",
    "kind": "canonical"
  },
  {
    "name": "accessibility",
    "kind": "canonical"
  },
  {
    "name": "dock",
    "kind": "canonical"
  },
  {
    "name": "finder",
    "kind": "canonical"
  },
  {
    "name": "desktop",
    "kind": "canonical"
  },
  {
    "name": "database",
    "kind": "canonical"
  },
  {
    "name": "db",
    "kind": "alias",
    "target": "database"
  },
  {
    "name": "collections",
    "kind": "alias",
    "target": "database"
  },
  {
    "name": "records",
    "kind": "alias",
    "target": "database"
  },
  {
    "name": "contacts",
    "kind": "alias",
    "target": "database"
  },
  {
    "name": "inspect",
    "kind": "canonical"
  },
  {
    "name": "maturity",
    "kind": "canonical"
  },
  {
    "name": "remote",
    "kind": "canonical"
  },
  {
    "name": "sync",
    "kind": "canonical"
  },
  {
    "name": "nodes",
    "kind": "canonical"
  },
  {
    "name": "gateway",
    "kind": "canonical"
  },
  {
    "name": "dense-fixtures",
    "kind": "canonical"
  },
  {
    "name": "dense-fixture",
    "kind": "alias",
    "target": "dense-fixtures"
  },
  {
    "name": "search",
    "kind": "canonical"
  },
  {
    "name": "signals",
    "kind": "canonical"
  },
  {
    "name": "life",
    "kind": "alias",
    "target": "signals"
  },
  {
    "name": "report",
    "kind": "canonical"
  },
  {
    "name": "needs",
    "kind": "canonical"
  },
  {
    "name": "commands",
    "kind": "canonical"
  },
  {
    "name": "debt",
    "kind": "canonical"
  },
  {
    "name": "governance",
    "kind": "canonical"
  },
  {
    "name": "evolution",
    "kind": "canonical"
  },
  {
    "name": "safety",
    "kind": "canonical"
  },
  {
    "name": "work",
    "kind": "canonical"
  },
  {
    "name": "project",
    "kind": "canonical"
  },
  {
    "name": "projects",
    "kind": "canonical"
  },
  {
    "name": "tasks",
    "kind": "canonical"
  },
  {
    "name": "notes",
    "kind": "canonical"
  },
  {
    "name": "people",
    "kind": "canonical"
  },
  {
    "name": "goals",
    "kind": "canonical"
  },
  {
    "name": "inbox",
    "kind": "canonical"
  },
  {
    "name": "approvals",
    "kind": "canonical"
  },
  {
    "name": "blockers",
    "kind": "canonical"
  },
  {
    "name": "decisions",
    "kind": "canonical"
  },
  {
    "name": "assignments",
    "kind": "canonical"
  },
  {
    "name": "handoffs",
    "kind": "canonical"
  },
  {
    "name": "artifacts",
    "kind": "canonical"
  },
  {
    "name": "commitments",
    "kind": "canonical"
  },
  {
    "name": "sessions",
    "kind": "canonical"
  },
  {
    "name": "agents",
    "kind": "canonical"
  },
  {
    "name": "personalities",
    "kind": "canonical"
  },
  {
    "name": "skills",
    "kind": "canonical"
  },
  {
    "name": "skill-collections",
    "kind": "canonical"
  },
  {
    "name": "connections",
    "kind": "canonical"
  },
  {
    "name": "snippets",
    "kind": "canonical"
  },
  {
    "name": "models",
    "kind": "canonical"
  },
  {
    "name": "providers",
    "kind": "canonical"
  },
  {
    "name": "auth",
    "kind": "canonical"
  },
  {
    "name": "time",
    "kind": "canonical"
  },
  {
    "name": "calendar",
    "kind": "canonical"
  },
  {
    "name": "reminders",
    "kind": "canonical"
  },
  {
    "name": "deadlines",
    "kind": "canonical"
  },
  {
    "name": "routines",
    "kind": "canonical"
  },
  {
    "name": "schedule",
    "kind": "canonical"
  },
  {
    "name": "watch",
    "kind": "canonical"
  },
  {
    "name": "agenda",
    "kind": "canonical"
  },
  {
    "name": "timeline",
    "kind": "canonical"
  },
  {
    "name": "review",
    "kind": "canonical"
  },
  {
    "name": "channels",
    "kind": "canonical"
  },
  {
    "name": "telegram",
    "kind": "canonical"
  },
  {
    "name": "notify",
    "kind": "canonical"
  },
  {
    "name": "messages",
    "kind": "canonical"
  },
  {
    "name": "connectors",
    "kind": "canonical"
  },
  {
    "name": "integrations",
    "kind": "alias",
    "target": "connectors"
  },
  {
    "name": "media",
    "kind": "canonical"
  },
  {
    "name": "docs",
    "kind": "canonical"
  },
  {
    "name": "documents",
    "kind": "canonical"
  },
  {
    "name": "files",
    "kind": "canonical"
  },
  {
    "name": "images",
    "kind": "canonical",
    "target": "image"
  },
  {
    "name": "audio",
    "kind": "canonical"
  },
  {
    "name": "video",
    "kind": "canonical"
  },
  {
    "name": "slides",
    "kind": "canonical"
  },
  {
    "name": "sheets",
    "kind": "canonical"
  },
  {
    "name": "generations",
    "kind": "canonical"
  },
  {
    "name": "templates",
    "kind": "canonical",
    "target": "template"
  },
  {
    "name": "styles",
    "kind": "canonical",
    "target": "style"
  },
  {
    "name": "references",
    "kind": "canonical",
    "target": "ref"
  },
  {
    "name": "drive",
    "kind": "portal"
  },
  {
    "name": "design",
    "kind": "canonical"
  },
  {
    "name": "apps",
    "kind": "canonical"
  },
  {
    "name": "marketplace",
    "kind": "canonical"
  },
  {
    "name": "content",
    "kind": "canonical"
  },
  {
    "name": "knowledge",
    "kind": "portal"
  },
  {
    "name": "profile",
    "kind": "portal"
  },
  {
    "name": "health",
    "kind": "portal"
  },
  {
    "name": "travel",
    "kind": "portal"
  },
  {
    "name": "career",
    "kind": "portal"
  },
  {
    "name": "family",
    "kind": "portal"
  },
  {
    "name": "legal",
    "kind": "portal"
  },
  {
    "name": "finance",
    "kind": "portal"
  },
  {
    "name": "location",
    "kind": "portal"
  },
  {
    "name": "accounts",
    "kind": "canonical"
  },
  {
    "name": "acct",
    "kind": "alias",
    "target": "accounts"
  },
  {
    "name": "business",
    "kind": "portal"
  },
  {
    "name": "social",
    "kind": "portal",
    "target": "content/channels"
  },
  {
    "name": "runtime",
    "kind": "canonical"
  },
  {
    "name": "monitor",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "logs",
    "kind": "portal"
  },
  {
    "name": "doctor",
    "kind": "canonical"
  },
  {
    "name": "diagnostics",
    "kind": "portal",
    "target": "doctor"
  },
  {
    "name": "mcp",
    "kind": "canonical"
  },
  {
    "name": "open",
    "kind": "canonical"
  },
  {
    "name": "context",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "learning",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "judgment",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "outcomes",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "plan",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "code",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "rules",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "guidance",
    "kind": "canonical"
  },
  {
    "name": "resources",
    "kind": "canonical"
  },
  {
    "name": "library",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "soul",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "erp",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "iot",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "tts",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "stt",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "voice-notes",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "inference",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "preview",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "browser",
    "kind": "canonical",
    "advanced": true
  },
  {
    "name": "compat",
    "kind": "canonical",
    "advanced": true
  }
] as const;

export const compactBuiltinCollections: readonly CompactBuiltinCollectionSummary[] = compactBuiltinFamilies.flatMap((family) => family.collections);

export const compactBuiltinCollectionsByName: ReadonlyMap<string, CompactBuiltinCollectionSummary> = new Map(
  compactBuiltinCollections.map((collection) => [collection.name, collection]),
);

export const compactBuiltinCollectionAliasesByAlias: ReadonlyMap<string, string> = new Map(
  compactBuiltinCollectionAliases.map((entry) => [entry.alias, entry.canonicalName]),
);

export const compactStableClawCliCommandNameSet: ReadonlySet<string> = new Set(compactStableClawCliCommandNames);

export function resolveBuiltinCollectionAlias(input: string): string | undefined {
  return compactBuiltinCollectionAliasesByAlias.get(input.trim().toLowerCase());
}

export function isStableClawCliCommandName(input: string | undefined): boolean {
  return !!input && compactStableClawCliCommandNameSet.has(input);
}
