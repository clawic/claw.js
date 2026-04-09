import SwiftUI

// MARK: - Markdown View

struct MarkdownView: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(parseBlocks(text).enumerated()), id: \.offset) { _, block in
                blockView(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func blockView(for block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let content):
            headingView(level: level, content: content)
        case .codeBlock(let language, let code):
            codeBlockView(language: language, code: code)
        case .unorderedList(let items):
            unorderedListView(items: items)
        case .orderedList(let items):
            orderedListView(items: items)
        case .blockquote(let content):
            blockquoteView(content: content)
        case .horizontalRule:
            Divider()
                .padding(.vertical, 4)
        case .paragraph(let content):
            inlineText(content)
                .font(.system(size: 16))
                .lineSpacing(4)
        }
    }

    // MARK: - Heading

    private func headingView(level: Int, content: String) -> some View {
        let size: CGFloat = switch level {
        case 1: 26
        case 2: 22
        case 3: 19
        default: 17
        }
        return inlineText(content)
            .font(.system(size: size, weight: .bold))
            .padding(.top, level <= 2 ? 8 : 4)
    }

    // MARK: - Code Block

    private func codeBlockView(language: String, code: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Color(UIColor.label))
                .textSelection(.enabled)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Lists

    private func unorderedListView(items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: 8) {
                    Text("\u{2022}")
                        .font(.system(size: 16))
                        .foregroundColor(.secondary)
                    inlineText(item)
                        .font(.system(size: 16))
                        .lineSpacing(4)
                }
            }
        }
        .padding(.leading, 4)
    }

    private func orderedListView(items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(idx + 1).")
                        .font(.system(size: 16))
                        .foregroundColor(.secondary)
                        .frame(minWidth: 20, alignment: .trailing)
                    inlineText(item)
                        .font(.system(size: 16))
                        .lineSpacing(4)
                }
            }
        }
        .padding(.leading, 4)
    }

    // MARK: - Blockquote

    private func blockquoteView(content: String) -> some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(UIColor.systemGray3))
                .frame(width: 3)
            inlineText(content)
                .font(.system(size: 16))
                .foregroundColor(.secondary)
                .lineSpacing(4)
                .padding(.leading, 10)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Inline text with formatting

    private func inlineText(_ raw: String) -> Text {
        let segments = parseInline(raw)
        var attributed = AttributedString()
        for segment in segments {
            var part: AttributedString
            switch segment {
            case .plain(let str):
                part = AttributedString(str)
            case .bold(let str):
                part = AttributedString(str)
                part.inlinePresentationIntent = .stronglyEmphasized
            case .italic(let str):
                part = AttributedString(str)
                part.inlinePresentationIntent = .emphasized
            case .boldItalic(let str):
                part = AttributedString(str)
                part.inlinePresentationIntent = [.stronglyEmphasized, .emphasized]
            case .code(let str):
                part = AttributedString(str)
                part.inlinePresentationIntent = .code
                part.foregroundColor = Color(UIColor.systemOrange)
                part.font = .system(size: 14, design: .monospaced)
            case .strikethrough(let str):
                part = AttributedString(str)
                part.strikethroughStyle = .single
            case .link(let label, let url):
                part = AttributedString(label)
                part.foregroundColor = .blue
                part.underlineStyle = .single
                if let linkURL = URL(string: url) {
                    part.link = linkURL
                }
            }
            attributed.append(part)
        }
        return Text(attributed)
    }
}

// MARK: - Block Parser

enum MarkdownBlock {
    case heading(level: Int, content: String)
    case codeBlock(language: String, code: String)
    case unorderedList(items: [String])
    case orderedList(items: [String])
    case blockquote(content: String)
    case horizontalRule
    case paragraph(content: String)
}

private func parseBlocks(_ text: String) -> [MarkdownBlock] {
    var blocks: [MarkdownBlock] = []
    let lines = text.components(separatedBy: "\n")
    var i = 0

    while i < lines.count {
        let line = lines[i]
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        // Empty line
        if trimmed.isEmpty {
            i += 1
            continue
        }

        // Code block (fenced)
        if trimmed.hasPrefix("```") {
            let lang = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            var codeLines: [String] = []
            i += 1
            while i < lines.count {
                if lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    i += 1
                    break
                }
                codeLines.append(lines[i])
                i += 1
            }
            // Remove trailing empty line if present
            while codeLines.last?.trimmingCharacters(in: .whitespaces).isEmpty == true {
                codeLines.removeLast()
            }
            blocks.append(.codeBlock(language: lang, code: codeLines.joined(separator: "\n")))
            continue
        }

        // Heading
        if let headingMatch = trimmed.headingMatch() {
            blocks.append(.heading(level: headingMatch.level, content: headingMatch.content))
            i += 1
            continue
        }

        // Horizontal rule
        if trimmed.isHorizontalRule {
            blocks.append(.horizontalRule)
            i += 1
            continue
        }

        // Unordered list
        if trimmed.isUnorderedListItem {
            var items: [String] = []
            while i < lines.count {
                let l = lines[i].trimmingCharacters(in: .whitespaces)
                if l.isUnorderedListItem {
                    items.append(l.unorderedListContent)
                    i += 1
                } else if l.isEmpty {
                    i += 1
                    break
                } else {
                    break
                }
            }
            blocks.append(.unorderedList(items: items))
            continue
        }

        // Ordered list
        if trimmed.isOrderedListItem {
            var items: [String] = []
            while i < lines.count {
                let l = lines[i].trimmingCharacters(in: .whitespaces)
                if l.isOrderedListItem {
                    items.append(l.orderedListContent)
                    i += 1
                } else if l.isEmpty {
                    i += 1
                    break
                } else {
                    break
                }
            }
            blocks.append(.orderedList(items: items))
            continue
        }

        // Blockquote
        if trimmed.hasPrefix(">") {
            var quoteLines: [String] = []
            while i < lines.count {
                let l = lines[i].trimmingCharacters(in: .whitespaces)
                if l.hasPrefix(">") {
                    quoteLines.append(String(l.dropFirst(1)).trimmingCharacters(in: .whitespaces))
                    i += 1
                } else if l.isEmpty {
                    i += 1
                    break
                } else {
                    break
                }
            }
            blocks.append(.blockquote(content: quoteLines.joined(separator: "\n")))
            continue
        }

        // Paragraph: collect consecutive non-empty, non-special lines
        var paraLines: [String] = []
        while i < lines.count {
            let l = lines[i]
            let t = l.trimmingCharacters(in: .whitespaces)
            if t.isEmpty || t.hasPrefix("```") || t.headingMatch() != nil
                || t.isHorizontalRule || t.isUnorderedListItem
                || t.isOrderedListItem || t.hasPrefix(">") {
                break
            }
            paraLines.append(t)
            i += 1
        }
        if !paraLines.isEmpty {
            blocks.append(.paragraph(content: paraLines.joined(separator: " ")))
        }
    }

    return blocks
}

// MARK: - Inline Parser

enum InlineSegment {
    case plain(String)
    case bold(String)
    case italic(String)
    case boldItalic(String)
    case code(String)
    case strikethrough(String)
    case link(label: String, url: String)
}

private func parseInline(_ text: String) -> [InlineSegment] {
    var segments: [InlineSegment] = []
    var remaining = text[text.startIndex...]

    while !remaining.isEmpty {
        // Inline code
        if remaining.hasPrefix("`") {
            if let end = remaining.dropFirst().firstIndex(of: "`") {
                let code = String(remaining[remaining.index(after: remaining.startIndex)..<end])
                segments.append(.code(code))
                remaining = remaining[remaining.index(after: end)...]
                continue
            }
        }

        // Bold italic (*** or ___)
        if remaining.hasPrefix("***") || remaining.hasPrefix("___") {
            let marker = String(remaining.prefix(3))
            let rest = remaining.dropFirst(3)
            if let end = rest.range(of: marker) {
                let content = String(rest[rest.startIndex..<end.lowerBound])
                segments.append(.boldItalic(content))
                remaining = rest[end.upperBound...]
                continue
            }
        }

        // Bold (** or __)
        if remaining.hasPrefix("**") || remaining.hasPrefix("__") {
            let marker = String(remaining.prefix(2))
            let rest = remaining.dropFirst(2)
            if let end = rest.range(of: marker) {
                let content = String(rest[rest.startIndex..<end.lowerBound])
                segments.append(.bold(content))
                remaining = rest[end.upperBound...]
                continue
            }
        }

        // Italic (* or _) - but not ** or __
        if (remaining.hasPrefix("*") && !remaining.hasPrefix("**"))
            || (remaining.hasPrefix("_") && !remaining.hasPrefix("__")) {
            let marker = String(remaining.prefix(1))
            let rest = remaining.dropFirst(1)
            if let end = rest.firstIndex(of: Character(marker)) {
                let content = String(rest[rest.startIndex..<end])
                if !content.isEmpty {
                    segments.append(.italic(content))
                    remaining = rest[rest.index(after: end)...]
                    continue
                }
            }
        }

        // Strikethrough ~~
        if remaining.hasPrefix("~~") {
            let rest = remaining.dropFirst(2)
            if let end = rest.range(of: "~~") {
                let content = String(rest[rest.startIndex..<end.lowerBound])
                segments.append(.strikethrough(content))
                remaining = rest[end.upperBound...]
                continue
            }
        }

        // Link [label](url)
        if remaining.hasPrefix("[") {
            let rest = remaining.dropFirst()
            if let closeBracket = rest.firstIndex(of: "]") {
                let label = String(rest[rest.startIndex..<closeBracket])
                let afterBracket = rest[rest.index(after: closeBracket)...]
                if afterBracket.hasPrefix("("),
                   let closeParen = afterBracket.firstIndex(of: ")") {
                    let url = String(afterBracket[afterBracket.index(after: afterBracket.startIndex)..<closeParen])
                    segments.append(.link(label: label, url: url))
                    remaining = afterBracket[afterBracket.index(after: closeParen)...]
                    continue
                }
            }
        }

        // Plain character
        let char = remaining.first!
        if case .plain(let existing) = segments.last {
            segments[segments.count - 1] = .plain(existing + String(char))
        } else {
            segments.append(.plain(String(char)))
        }
        remaining = remaining.dropFirst()
    }

    return segments
}

// MARK: - String helpers

private extension String {
    struct HeadingMatch {
        let level: Int
        let content: String
    }

    func headingMatch() -> HeadingMatch? {
        guard hasPrefix("#") else { return nil }
        var level = 0
        for ch in self {
            if ch == "#" { level += 1 } else { break }
        }
        guard level >= 1, level <= 6 else { return nil }
        let rest = dropFirst(level)
        guard rest.first == " " || rest.isEmpty else { return nil }
        return HeadingMatch(level: level, content: rest.trimmingCharacters(in: .whitespaces))
    }

    var isHorizontalRule: Bool {
        let cleaned = replacingOccurrences(of: " ", with: "")
        return (cleaned.allSatisfy { $0 == "-" } || cleaned.allSatisfy { $0 == "*" }
            || cleaned.allSatisfy { $0 == "_" }) && cleaned.count >= 3
    }

    var isUnorderedListItem: Bool {
        let patterns = ["- ", "* ", "+ "]
        return patterns.contains(where: { hasPrefix($0) })
    }

    var unorderedListContent: String {
        guard count > 2 else { return "" }
        return String(dropFirst(2))
    }

    var isOrderedListItem: Bool {
        guard let dotIdx = firstIndex(of: ".") else { return false }
        let prefix = self[startIndex..<dotIdx]
        let afterDot = self[index(after: dotIdx)...]
        return !prefix.isEmpty && prefix.allSatisfy(\.isNumber) && afterDot.hasPrefix(" ")
    }

    var orderedListContent: String {
        guard let dotIdx = firstIndex(of: ".") else { return self }
        let afterDot = self[index(after: dotIdx)...]
        return afterDot.trimmingCharacters(in: .whitespaces)
    }
}
