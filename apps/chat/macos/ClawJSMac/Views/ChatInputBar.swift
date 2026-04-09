import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    var placeholder: String = "Message"
    var isDisabled: Bool = false
    var isGenerating: Bool = false
    var autofocus: Bool = false
    var agentName: String? = nil
    var projectName: String? = nil
    var onSend: () -> Void
    var onStop: (() -> Void)? = nil
    @FocusState private var isInputFocused: Bool

    private var canSend: Bool {
        !isDisabled && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            // Main input area
            VStack(spacing: 0) {
                // Text field
                TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...8)
                    .focused($isInputFocused)
                    .disabled(isDisabled)
                    .font(Theme.body)
                    .foregroundStyle(Theme.textPrimary)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 8)
                    .onSubmit(onSend)

                // Input controls row
                HStack(spacing: 6) {
                    // Plus button
                    Button(action: {}) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.textMuted)
                    }
                    .buttonStyle(.plain)

                    // Model dropdown
                    dropdownPill("GPT-5.4")

                    // Effort dropdown
                    dropdownPill("Alto")

                    Spacer()

                    // Mic button
                    Button(action: {}) {
                        Image(systemName: "mic")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textMuted)
                    }
                    .buttonStyle(.plain)

                    // Send / Stop button
                    Group {
                        if isGenerating {
                            Button(action: { onStop?() }) {
                                Image(systemName: "stop.fill")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.black)
                                    .frame(width: 28, height: 28)
                                    .background(Circle().fill(Theme.textPrimary))
                            }
                            .buttonStyle(.plain)
                            .transition(.scale.combined(with: .opacity))
                        } else {
                            Button(action: onSend) {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(canSend ? .black : Theme.textMuted)
                                    .frame(width: 28, height: 28)
                                    .background(
                                        Circle().fill(canSend ? Theme.accent : Theme.hoverBg)
                                    )
                            }
                            .buttonStyle(.plain)
                            .disabled(!canSend)
                            .keyboardShortcut(.return, modifiers: .command)
                        }
                    }
                    .animation(.easeInOut(duration: 0.15), value: isGenerating)
                    .animation(.easeInOut(duration: 0.15), value: canSend)
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 12)
            }
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.inputBg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )
            .padding(.horizontal, 20)

            // Status bar below input
            HStack(spacing: 12) {
                statusPill(icon: "desktopcomputer", label: "Local")
                statusPill(icon: "shield.checkered", label: "Acceso completo", accent: true)

                Spacer()

                statusPill(icon: "arrow.triangle.branch", label: "main")
                Button(action: {}) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .onAppear {
            if autofocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    isInputFocused = true
                }
            }
        }
    }

    // MARK: - Subviews

    private func dropdownPill(_ label: String) -> some View {
        Button(action: {}) {
            HStack(spacing: 3) {
                Text(label)
                    .font(Theme.caption)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7, weight: .semibold))
            }
            .foregroundStyle(Theme.textSecondary)
        }
        .buttonStyle(.plain)
    }

    private func statusPill(icon: String, label: String, accent: Bool = false) -> some View {
        Button(action: {}) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                Text(label)
                    .font(Theme.caption)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7))
            }
            .foregroundStyle(accent ? Theme.accent : Theme.textMuted)
        }
        .buttonStyle(.plain)
    }
}
