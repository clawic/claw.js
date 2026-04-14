import SwiftUI

// MARK: - Discord-inspired dark theme (clean, minimal noise)

enum Theme {
    // Backgrounds — warm dark grays, layered by depth
    static let bg            = Color(nsColor: NSColor(red: 0.19, green: 0.20, blue: 0.22, alpha: 1))   // #313338
    static let sidebarBg     = Color(nsColor: NSColor(red: 0.17, green: 0.18, blue: 0.19, alpha: 1))   // #2B2D31
    static let inputBg       = Color(nsColor: NSColor(red: 0.22, green: 0.23, blue: 0.25, alpha: 1))   // #383A40
    static let selectedBg    = Color(nsColor: NSColor(red: 0.25, green: 0.26, blue: 0.28, alpha: 1))   // #404249
    static let hoverBg       = Color(nsColor: NSColor(red: 0.21, green: 0.22, blue: 0.24, alpha: 1))   // #35373C

    // Borders — very subtle, almost invisible
    static let border        = Color(nsColor: NSColor(red: 0.24, green: 0.25, blue: 0.27, alpha: 1))   // #3F4045

    // Text — higher contrast primaries, softer secondaries
    static let textPrimary   = Color(nsColor: NSColor(red: 0.95, green: 0.95, blue: 0.96, alpha: 1))   // #F2F3F5
    static let textSecondary = Color(nsColor: NSColor(red: 0.71, green: 0.73, blue: 0.76, alpha: 1))   // #B5BAC1
    static let textMuted     = Color(nsColor: NSColor(red: 0.50, green: 0.52, blue: 0.56, alpha: 1))   // #80848E

    // Accent — kept warm but slightly toned down
    static let accent        = Color(nsColor: NSColor(red: 0.85, green: 0.58, blue: 0.25, alpha: 1))   // #D99440
    static let accentGreen   = Color(nsColor: NSColor(red: 0.35, green: 0.75, blue: 0.45, alpha: 1))
    static let confirmGreen  = Color(nsColor: NSColor(red: 0.30, green: 0.78, blue: 0.47, alpha: 1))

    // Fonts — clean sans, slightly larger body
    static let body       = Font.system(size: 15)
    static let bodySmall  = Font.system(size: 13)
    static let caption    = Font.system(size: 12)
    static let captionMono = Font.system(size: 11, design: .monospaced)
    static let sidebar    = Font.system(size: 14)
    static let sidebarSm  = Font.system(size: 12)
    static let header     = Font.system(size: 15, weight: .semibold)
    static let sectionHdr = Font.system(size: 11, weight: .bold)
}
