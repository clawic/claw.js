import type {
  TemplateAspect,
  TemplateCategory,
  TemplateManifest,
  TemplateOutputFormat,
  TemplateSlot,
  TemplateVariant,
} from "./schema.ts";

interface BuiltinSeed {
  id: string;
  name: string;
  category: TemplateCategory;
  aspect: TemplateAspect;
  description: string;
  tags?: string[];
  outputs: TemplateOutputFormat[];
  slots: TemplateSlot[];
  variants?: TemplateVariant[];
  defaultStyleId?: string;
}

const DEFAULT_VARIANTS: TemplateVariant[] = [
  { id: "default", label: "Default" },
  { id: "alt", label: "Alternate" },
];

const HEADING = (id = "heading", label = "Heading", maxLength = 88): TemplateSlot => ({ id, kind: "heading", label, required: true, maxLength });
const SUBHEADING = (id = "subheading", label = "Subheading", maxLength = 170): TemplateSlot => ({ id, kind: "subheading", label, maxLength });
const BODY = (id = "body", label = "Body", maxLength = 520): TemplateSlot => ({ id, kind: "body", label, multiline: true, maxLength });
const LIST = (id = "bullets", label = "Bullets", maxItems = 6, maxLength = 105): TemplateSlot => ({ id, kind: "list", label, maxItems, maxLength });
const IMAGE = (id = "image", label = "Image"): TemplateSlot => ({ id, kind: "image", label });
const LOGO = (id = "logo", label = "Logo"): TemplateSlot => ({ id, kind: "logo", label });
const BUTTON = (id = "cta", label = "Call to action", maxLength = 24): TemplateSlot => ({ id, kind: "button", label, maxLength });
const METRIC = (id: string, label: string): TemplateSlot => ({ id, kind: "metric", label, maxLength: 72 });
const TABLE = (id: string, label: string): TemplateSlot => ({ id, kind: "table", label });

const SEEDS: BuiltinSeed[] = [
  // Presentation (6)
  {
    id: "presentation.title-only",
    name: "Presentation · Title",
    category: "presentation",
    aspect: "16:9",
    description: "Opening slide with title, subtitle and presenter line.",
    tags: ["builtin", "presentation", "opening"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [
      HEADING("title", "Title"),
      SUBHEADING("subtitle", "Subtitle"),
      { id: "presenter", kind: "body", label: "Presenter", maxLength: 80 },
      LOGO(),
    ],
  },
  {
    id: "presentation.agenda",
    name: "Presentation · Agenda",
    category: "presentation",
    aspect: "16:9",
    description: "Agenda slide with numbered list of sections.",
    tags: ["builtin", "presentation", "agenda"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [HEADING("title", "Title", 58), LIST("items", "Agenda items", 8, 80)],
  },
  {
    id: "presentation.content",
    name: "Presentation · Content",
    category: "presentation",
    aspect: "16:9",
    description: "Heading with bullets and supporting body copy.",
    tags: ["builtin", "presentation"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [HEADING(), SUBHEADING(), LIST(), BODY()],
  },
  {
    id: "presentation.comparison",
    name: "Presentation · Comparison",
    category: "presentation",
    aspect: "16:9",
    description: "Two-column comparison with title.",
    tags: ["builtin", "presentation", "compare"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [
      HEADING("title", "Title"),
      { id: "left_title", kind: "subheading", label: "Left column title", maxLength: 60 },
      { id: "left_body", kind: "body", label: "Left column body", multiline: true, maxLength: 400 },
      { id: "right_title", kind: "subheading", label: "Right column title", maxLength: 60 },
      { id: "right_body", kind: "body", label: "Right column body", multiline: true, maxLength: 400 },
    ],
  },
  {
    id: "presentation.metric-grid",
    name: "Presentation · Metric grid",
    category: "presentation",
    aspect: "16:9",
    description: "Title plus 3–4 highlighted metrics.",
    tags: ["builtin", "presentation", "metric"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [
      HEADING("title", "Title"),
      METRIC("m1_value", "Metric 1 value"),
      METRIC("m1_label", "Metric 1 label"),
      METRIC("m2_value", "Metric 2 value"),
      METRIC("m2_label", "Metric 2 label"),
      METRIC("m3_value", "Metric 3 value"),
      METRIC("m3_label", "Metric 3 label"),
      METRIC("m4_value", "Metric 4 value"),
      METRIC("m4_label", "Metric 4 label"),
    ],
  },
  {
    id: "presentation.closing",
    name: "Presentation · Closing",
    category: "presentation",
    aspect: "16:9",
    description: "Final slide with thank-you message and contact.",
    tags: ["builtin", "presentation", "closing"],
    outputs: ["html", "pdf", "png", "pptx"],
    slots: [HEADING("title", "Title"), SUBHEADING("subtitle", "Subtitle"), { id: "contact", kind: "body", label: "Contact", maxLength: 120 }],
  },

  // Cards (4)
  {
    id: "card.birthday",
    name: "Card · Birthday",
    category: "card",
    aspect: "1:1",
    description: "Square birthday card with greeting and name.",
    tags: ["builtin", "card", "birthday"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("greeting", "Greeting", 30), { id: "recipient", kind: "subheading", label: "Recipient name", maxLength: 40 }, BODY("message", "Message", 240), IMAGE()],
  },
  {
    id: "card.thank-you",
    name: "Card · Thank you",
    category: "card",
    aspect: "1:1",
    description: "Thank-you note with sender and recipient.",
    tags: ["builtin", "card", "thanks"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("greeting", "Greeting", 30), BODY("message", "Message", 320), { id: "signer", kind: "body", label: "Signed by", maxLength: 60 }],
  },
  {
    id: "card.invitation",
    name: "Card · Invitation",
    category: "card",
    aspect: "1:1",
    description: "Event invitation with date, place and dress code.",
    tags: ["builtin", "card", "invitation"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("title", "Event title", 60), SUBHEADING("subtitle", "Subtitle", 90), { id: "date", kind: "body", label: "Date / time", maxLength: 60 }, { id: "place", kind: "body", label: "Place", maxLength: 120 }, BUTTON("rsvp", "RSVP label")],
  },
  {
    id: "card.gift",
    name: "Card · Gift",
    category: "card",
    aspect: "1:1",
    description: "Gift card with code and amount.",
    tags: ["builtin", "card", "gift"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("title", "Title", 32), METRIC("amount", "Amount"), { id: "code", kind: "body", label: "Code", maxLength: 32 }, BODY("terms", "Terms", 180)],
  },

  // Posters (3)
  {
    id: "poster.event",
    name: "Poster · Event",
    category: "poster",
    aspect: "a4-portrait",
    description: "Event poster with hero image, headline, date/place.",
    tags: ["builtin", "poster", "event"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("title", "Title"), SUBHEADING("subtitle", "Subtitle"), { id: "date", kind: "body", label: "Date / time", maxLength: 60 }, { id: "place", kind: "body", label: "Place", maxLength: 120 }, IMAGE("hero", "Hero image"), LOGO()],
  },
  {
    id: "poster.quote",
    name: "Poster · Quote",
    category: "poster",
    aspect: "a4-portrait",
    description: "Quote poster with attribution.",
    tags: ["builtin", "poster", "quote"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [{ id: "quote", kind: "quote", label: "Quote", required: true, multiline: true, maxLength: 340 }, { id: "attribution", kind: "body", label: "Attribution", maxLength: 60 }],
  },
  {
    id: "poster.announcement",
    name: "Poster · Announcement",
    category: "poster",
    aspect: "a4-portrait",
    description: "Announcement poster with strong headline and body.",
    tags: ["builtin", "poster", "announcement"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING(), BODY()],
  },

  // Social post (5)
  {
    id: "social-post.square-quote",
    name: "Social · Square quote",
    category: "social-post",
    aspect: "1:1",
    description: "Square quote post with attribution and logo.",
    tags: ["builtin", "social", "quote"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [{ id: "quote", kind: "quote", label: "Quote", required: true, maxLength: 220 }, { id: "attribution", kind: "body", label: "Attribution", maxLength: 60 }, LOGO()],
  },
  {
    id: "social-post.story-quote",
    name: "Social · Story quote",
    category: "social-post",
    aspect: "9:16",
    description: "Vertical story quote with safe zones for UI overlays.",
    tags: ["builtin", "social", "story"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [{ id: "quote", kind: "quote", label: "Quote", required: true, maxLength: 180 }, { id: "attribution", kind: "body", label: "Attribution", maxLength: 60 }],
  },
  {
    id: "social-post.square-product",
    name: "Social · Square product",
    category: "social-post",
    aspect: "1:1",
    description: "Product showcase with headline, image and CTA.",
    tags: ["builtin", "social", "product"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("title", "Title", 60), IMAGE(), { id: "price", kind: "body", label: "Price line", maxLength: 30 }, BUTTON()],
  },
  {
    id: "social-post.story-product",
    name: "Social · Story product",
    category: "social-post",
    aspect: "9:16",
    description: "Vertical product story.",
    tags: ["builtin", "social", "story", "product"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [HEADING("title", "Title", 50), IMAGE(), { id: "price", kind: "body", label: "Price line", maxLength: 30 }, BUTTON("swipe", "Swipe label")],
  },
  {
    id: "social-post.carousel-3up",
    name: "Social · Carousel 3-up",
    category: "social-post",
    aspect: "4:5",
    description: "Three-card carousel piece for portrait posts.",
    tags: ["builtin", "social", "carousel"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [
      HEADING("title", "Title"),
      { id: "card1", kind: "body", label: "Card 1", multiline: true, maxLength: 220 },
      { id: "card2", kind: "body", label: "Card 2", multiline: true, maxLength: 220 },
      { id: "card3", kind: "body", label: "Card 3", multiline: true, maxLength: 220 },
    ],
  },

  // One-pager (2)
  {
    id: "one-pager.product",
    name: "One-pager · Product",
    category: "one-pager",
    aspect: "a4-portrait",
    description: "Product one-pager with hero, three benefits and CTA.",
    tags: ["builtin", "one-pager", "product"],
    outputs: ["html", "pdf", "png"],
    slots: [LOGO(), HEADING("title", "Headline", 80), SUBHEADING("subtitle", "Subhead", 160), IMAGE("hero", "Hero image"), LIST("benefits", "Benefits", 5, 120), BUTTON()],
  },
  {
    id: "one-pager.profile",
    name: "One-pager · Profile",
    category: "one-pager",
    aspect: "a4-portrait",
    description: "Person profile one-pager.",
    tags: ["builtin", "one-pager", "profile"],
    outputs: ["html", "pdf", "png"],
    slots: [IMAGE("portrait", "Portrait"), HEADING("name", "Name", 40), SUBHEADING("role", "Role", 80), BODY("bio", "Bio", 500), LIST("highlights", "Highlights", 4, 100)],
  },

  // CV (2)
  {
    id: "cv.executive",
    name: "CV · Executive",
    category: "cv",
    aspect: "a4-portrait",
    description: "Executive-style CV with experience timeline.",
    tags: ["builtin", "cv", "executive"],
    outputs: ["html", "pdf"],
    slots: [HEADING("name", "Name", 60), SUBHEADING("title", "Title", 80), { id: "contact", kind: "body", label: "Contact", maxLength: 200 }, BODY("summary", "Summary", 400), LIST("experience", "Experience entries", 8, 220), LIST("education", "Education entries", 4, 120)],
  },
  {
    id: "cv.minimal",
    name: "CV · Minimal",
    category: "cv",
    aspect: "a4-portrait",
    description: "Minimal one-page CV.",
    tags: ["builtin", "cv", "minimal"],
    outputs: ["html", "pdf"],
    slots: [HEADING("name", "Name", 60), SUBHEADING("title", "Title", 80), { id: "contact", kind: "body", label: "Contact", maxLength: 200 }, LIST("experience", "Experience entries", 5, 200), LIST("skills", "Skills", 8, 60)],
  },

  // Invoice (1)
  {
    id: "invoice.standard",
    name: "Invoice · Standard",
    category: "invoice",
    aspect: "a4-portrait",
    description: "Standard invoice with line items, totals and bank info.",
    tags: ["builtin", "invoice"],
    outputs: ["html", "pdf"],
    slots: [LOGO(), HEADING("title", "Title", 40), { id: "issuer", kind: "body", label: "Issuer block", maxLength: 240 }, { id: "client", kind: "body", label: "Client block", maxLength: 240 }, { id: "number", kind: "body", label: "Invoice number", maxLength: 40 }, { id: "date", kind: "body", label: "Issue date", maxLength: 40 }, { id: "due", kind: "body", label: "Due date", maxLength: 40 }, TABLE("items", "Line items"), METRIC("total", "Total"), { id: "notes", kind: "body", label: "Notes", multiline: true, maxLength: 320 }],
  },

  // Certificate (1)
  {
    id: "certificate.award",
    name: "Certificate · Award",
    category: "certificate",
    aspect: "a4-landscape",
    description: "Award certificate with recipient and reason.",
    tags: ["builtin", "certificate"],
    outputs: ["html", "pdf", "png"],
    slots: [LOGO(), HEADING("title", "Title", 60), { id: "recipient", kind: "subheading", label: "Recipient", maxLength: 80 }, BODY("reason", "Reason / citation", 320), { id: "issuer", kind: "body", label: "Issuer", maxLength: 80 }, { id: "date", kind: "body", label: "Date", maxLength: 40 }],
  },

  // Menu (1)
  {
    id: "menu.restaurant",
    name: "Menu · Restaurant",
    category: "menu",
    aspect: "a4-portrait",
    description: "Restaurant menu with sections of dishes.",
    tags: ["builtin", "menu", "food"],
    outputs: ["html", "pdf", "png"],
    slots: [HEADING("title", "Title", 60), SUBHEADING("subtitle", "Subtitle", 120), TABLE("starters", "Starters"), TABLE("mains", "Mains"), TABLE("desserts", "Desserts"), { id: "footer", kind: "body", label: "Footer note", maxLength: 240 }],
  },

  // Flyer (1)
  {
    id: "flyer.event",
    name: "Flyer · Event",
    category: "flyer",
    aspect: "a4-portrait",
    description: "Event flyer with hero, key details and CTA.",
    tags: ["builtin", "flyer", "event"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [IMAGE("hero", "Hero image"), HEADING("title", "Title", 60), SUBHEADING("subtitle", "Subtitle", 120), { id: "details", kind: "body", label: "Details", multiline: true, maxLength: 320 }, BUTTON()],
  },

  // Email (2)
  {
    id: "email.newsletter",
    name: "Email · Newsletter",
    category: "email",
    aspect: { width: 600, height: 1200, unit: "px" },
    description: "Newsletter email with header, three story blocks and footer.",
    tags: ["builtin", "email", "newsletter"],
    outputs: ["html"],
    slots: [LOGO(), HEADING("title", "Title", 80), { id: "intro", kind: "body", label: "Intro", multiline: true, maxLength: 400 }, { id: "story1_title", kind: "subheading", label: "Story 1 title", maxLength: 80 }, { id: "story1_body", kind: "body", label: "Story 1 body", multiline: true, maxLength: 320 }, { id: "story2_title", kind: "subheading", label: "Story 2 title", maxLength: 80 }, { id: "story2_body", kind: "body", label: "Story 2 body", multiline: true, maxLength: 320 }, { id: "story3_title", kind: "subheading", label: "Story 3 title", maxLength: 80 }, { id: "story3_body", kind: "body", label: "Story 3 body", multiline: true, maxLength: 320 }, BUTTON(), { id: "footer", kind: "body", label: "Footer", multiline: true, maxLength: 320 }],
  },
  {
    id: "email.transactional",
    name: "Email · Transactional",
    category: "email",
    aspect: { width: 600, height: 800, unit: "px" },
    description: "Transactional email with single primary action.",
    tags: ["builtin", "email", "transactional"],
    outputs: ["html"],
    slots: [LOGO(), HEADING("title", "Title", 80), { id: "body", kind: "body", label: "Body", multiline: true, maxLength: 600 }, BUTTON("cta", "Primary CTA", 30), { id: "footer", kind: "body", label: "Footer", multiline: true, maxLength: 240 }],
  },

  // Business card (1)
  {
    id: "business-card.standard",
    name: "Business card · Standard",
    category: "business-card",
    aspect: { width: 85, height: 55, unit: "mm" },
    description: "Standard 85x55mm business card.",
    tags: ["builtin", "business-card"],
    outputs: ["html", "pdf", "png", "svg"],
    slots: [LOGO(), HEADING("name", "Name", 40), { id: "title", kind: "subheading", label: "Title", maxLength: 60 }, { id: "contact", kind: "body", label: "Contact lines", multiline: true, maxLength: 160 }],
  },

  // Web landing (1)
  {
    id: "web-landing.product",
    name: "Web landing · Product",
    category: "web-landing",
    aspect: { width: 1280, height: 2400, unit: "px" },
    description: "Long-scroll product landing with hero, features, CTA and footer.",
    tags: ["builtin", "web", "landing"],
    outputs: ["html", "png"],
    slots: [LOGO(), HEADING("hero_title", "Hero title", 80), SUBHEADING("hero_subtitle", "Hero subtitle", 200), BUTTON("hero_cta", "Hero CTA", 30), IMAGE("hero_image", "Hero image"), { id: "feature1_title", kind: "subheading", label: "Feature 1 title", maxLength: 60 }, { id: "feature1_body", kind: "body", label: "Feature 1 body", multiline: true, maxLength: 320 }, { id: "feature2_title", kind: "subheading", label: "Feature 2 title", maxLength: 60 }, { id: "feature2_body", kind: "body", label: "Feature 2 body", multiline: true, maxLength: 320 }, { id: "feature3_title", kind: "subheading", label: "Feature 3 title", maxLength: 60 }, { id: "feature3_body", kind: "body", label: "Feature 3 body", multiline: true, maxLength: 320 }, BUTTON("footer_cta", "Footer CTA", 30)],
  },
];

export function builtinTemplateManifests(): TemplateManifest[] {
  const now = new Date("2026-05-11T00:00:00.000Z").toISOString();
  return SEEDS.map((seed) => ({
    schemaVersion: 1 as const,
    id: seed.id,
    name: seed.name,
    category: seed.category,
    aspect: seed.aspect,
    description: seed.description,
    tags: seed.tags ?? [],
    slots: seed.slots,
    variants: seed.variants ?? DEFAULT_VARIANTS,
    outputs: seed.outputs,
    defaultStyleId: seed.defaultStyleId,
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function builtinTemplateCount(): number {
  return SEEDS.length;
}
