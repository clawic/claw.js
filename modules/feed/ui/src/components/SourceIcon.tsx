import {
  Rss,
  Twitter,
  Youtube,
  Github,
  Globe,
  Mail,
  MessageSquare,
} from "lucide-react";

const ICONS: Record<string, typeof Rss> = {
  rss: Rss,
  twitter_list: Twitter,
  youtube_channel: Youtube,
  github_repo: Github,
  newsletter: Mail,
  reddit_subreddit: MessageSquare,
  manual: Globe,
};

export function SourceIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? Globe;
  return <Icon className={className ?? "h-4 w-4"} />;
}
