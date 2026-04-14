import { Link } from "react-router-dom";

interface Props {
  body: string;
  spaceId: string;
}

// Minimal markdown-to-HTML renderer with wikilink support.
// For a production app you would use react-markdown or similar.
// This handles the most common markdown patterns and [[wikilinks]].

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

export function MarkdownRenderer({ body, spaceId }: Props) {
  // Replace wikilinks [[slug]] and [[slug|text]] with React-Router links
  const parts: Array<{ type: "html" | "wikilink"; content: string; slug?: string; display?: string }> = [];
  const wikiRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = wikiRe.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "html", content: body.slice(lastIndex, match.index) });
    }
    const slug = match[1].trim().toLowerCase().replace(/\s+/g, "-");
    parts.push({
      type: "wikilink",
      content: match[0],
      slug,
      display: match[2]?.trim() || match[1].trim(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    parts.push({ type: "html", content: body.slice(lastIndex) });
  }

  return (
    <div className="wiki-prose">
      {parts.map((part, i) => {
        if (part.type === "wikilink") {
          return (
            <Link
              key={i}
              to={`/${spaceId}/${part.slug}`}
              className="text-primary hover:underline"
            >
              {part.display}
            </Link>
          );
        }
        // Render as HTML (basic markdown conversion)
        const html = renderMarkdownBlock(part.content);
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

function renderMarkdownBlock(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inCodeBlock = false;
  let codeBuffer = "";
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBuffer.trim())}</code></pre>`;
        codeBuffer = "";
        inCodeBlock = false;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer += line + "\n";
      continue;
    }

    if (line.startsWith("### ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h3>${renderInline(line.slice(4))}</h3>`;
    } else if (line.startsWith("## ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${renderInline(line.slice(3))}</h2>`;
    } else if (line.startsWith("# ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h1>${renderInline(line.slice(2))}</h1>`;
    } else if (line.startsWith("> ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<blockquote><p>${renderInline(line.slice(2))}</p></blockquote>`;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${renderInline(line.slice(2))}</li>`;
    } else if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${renderInline(line)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  if (inCodeBlock) html += `<pre><code>${escapeHtml(codeBuffer.trim())}</code></pre>`;

  return html;
}
