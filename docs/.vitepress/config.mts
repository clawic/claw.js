import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");
const SITE_URL = "https://clawjs.ai";
const DOCS_URL = "https://docs.clawjs.ai";
const DEMO_URL = "https://demo.clawjs.ai";
const GITHUB_URL = "https://github.com/clawic/clawjs";

export default {
  title: "ClawJS",
  description: "The public ClawJS docs site, sourced from Markdown in docs/.",
  cleanUrls: true,
  outDir: "../website/dist",
  vite: {
    publicDir: "../public",
    define: {
      __SITE_URL__: JSON.stringify(SITE_URL),
      __DOCS_URL__: JSON.stringify(DOCS_URL),
    },
    resolve: {
      alias: [
        {
          find: "estree-walker",
          replacement: path.join(repoRoot, "website/node_modules/estree-walker/dist/umd/estree-walker.js"),
        },
        {
          find: "vue/server-renderer",
          replacement: path.join(repoRoot, "website/node_modules/vue/server-renderer/index.mjs"),
        },
        {
          find: /^vue$/,
          replacement: path.join(repoRoot, "website/node_modules/vue/dist/vue.runtime.esm-bundler.js"),
        },
      ],
    },
  },
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["link", { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
    ["meta", { property: "og:image", content: "/og-image.png" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: "/og-image.png" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    ["link", { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" }],
  ],
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Getting Started", link: `${DOCS_URL}/getting-started` },
      { text: "Docs", link: DOCS_URL },
      { text: "GitHub", link: GITHUB_URL },
    ],
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
      label: "On This Page",
    },
    sidebar: [
      {
        text: "Overview",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Manual Setup", link: "/setup" },
          { text: "Terminology", link: "/terminology" },
          { text: "Support Matrix", link: "/support-matrix" },
        ],
      },
      {
        text: "Core Concepts",
        items: [
          { text: "Runtime", link: "/runtime" },
          { text: "Workspace", link: "/workspace" },
          { text: "Authentication", link: "/authentication" },
          { text: "Relay", link: "/relay" },
          { text: "Secrets", link: "/secrets" },
          { text: "Secrets Security Model", link: "/secrets-security" },
          { text: "Models", link: "/models" },
          { text: "Sessions", link: "/sessions" },
          { text: "Local Agent Asset Library", link: "/local-library" },
          { text: "Files & Templates", link: "/files" },
          { text: "Watchers & Events", link: "/watchers" },
          { text: "Diagnostics & Repair", link: "/diagnostics" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "API Reference", link: "/api" },
          { text: "Interface Matrix", link: "/interface-matrix" },
          { text: "Public Surface", link: "/surface" },
          { text: "Repository Map", link: "/repository-map" },
        ],
      },
      {
        text: "Services",
        items: [
          { text: "Database", link: "/database" },
          { text: "Canonical Data Catalog", link: "/canonical-data-catalog" },
          { text: "Audio Service", link: "/audio" },
          { text: "Time Service", link: "/time" },
          { text: "Day", link: "/day" },
          { text: "Content Service", link: "/content" },
          { text: "Notify", link: "/notify" },
          { text: "IoT", link: "/iot" },
          { text: "Secrets", link: "/secrets" },
          { text: "Secrets Security Model", link: "/secrets-security" },
          { text: "Drive", link: "/drive" },
          { text: "Execution", link: "/execution" },
          { text: "Delegation", link: "/delegation" },
        ],
      },
      {
        text: "Deep Dives",
        items: [
          { text: "Plugin Authoring", link: "/plugins" },
          { text: "Template Packs and Bindings", link: "/template-packs-and-bindings" },
          { text: "Runtime Migration Notes", link: "/runtime-migration-notes" },
          { text: "Canonical Data Catalog", link: "/canonical-data-catalog" },
          { text: "Chat Streaming Example", link: "/chat-streaming-example" },
          { text: "Onboarding Basic Example", link: "/onboarding-basic-example" },
          { text: "Provider and Channel Onboarding", link: "/provider-channel-onboarding-example" },
          { text: "Settings Channels Example", link: "/settings-channels-example" },
          { text: "Settings Runtime Agents Example", link: "/settings-runtime-agents-example" },
        ],
      },
      {
        text: "Repository",
        items: [
          { text: "Project Tracking", link: "/tracking/" },
          { text: "Tracking Backlog", link: "/tracking/backlog" },
          { text: "Git Workflow", link: "/git-workflow" },
          { text: "Demo Terminology Note", link: "/demo-terminology-note" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: GITHUB_URL },
    ],
    footer: {
      message: "ClawJS documentation site sourced from docs/ Markdown.",
      copyright: "ClawJS",
    },
  },
};
