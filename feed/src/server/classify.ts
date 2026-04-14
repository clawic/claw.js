import type { FeedItem, Importance } from "../shared/types.ts";

const HIGH_SIGNAL_KEYWORDS = [
  "breaking", "critical", "urgent", "important", "announcement",
  "release", "launch", "vulnerability", "security", "outage",
];

const LOW_SIGNAL_KEYWORDS = [
  "weekly digest", "newsletter roundup", "sponsor", "advertisement",
];

export function suggestImportance(item: FeedItem): Importance {
  const text = `${item.title} ${item.body}`.toLowerCase();

  for (const keyword of HIGH_SIGNAL_KEYWORDS) {
    if (text.includes(keyword)) return "high";
  }

  for (const keyword of LOW_SIGNAL_KEYWORDS) {
    if (text.includes(keyword)) return "low";
  }

  return "normal";
}

export function suggestTags(item: FeedItem, existingTags: string[] = []): string[] {
  const tags = new Set(existingTags);
  const text = `${item.title} ${item.body}`.toLowerCase();

  const topicKeywords: Record<string, string[]> = {
    ai: ["artificial intelligence", "machine learning", "deep learning", "llm", "gpt", "neural network", "transformer"],
    security: ["vulnerability", "cve", "exploit", "security", "breach", "malware"],
    devops: ["kubernetes", "docker", "ci/cd", "deployment", "infrastructure"],
    frontend: ["react", "vue", "angular", "css", "javascript", "typescript", "ui", "ux"],
    backend: ["api", "database", "server", "microservice", "rest", "graphql"],
    mobile: ["ios", "android", "swift", "kotlin", "react native", "flutter"],
    crypto: ["blockchain", "bitcoin", "ethereum", "defi", "web3"],
    startup: ["funding", "series a", "startup", "venture capital", "ipo"],
  };

  for (const [tag, keywords] of Object.entries(topicKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        tags.add(tag);
        break;
      }
    }
  }

  return [...tags];
}
