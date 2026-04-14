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
            // Main input — Discord style: rounded bar sitting above bottom
            HStack(alignment: .bottom, spacing: 8) {
                // Plus button
                Button(action: {}) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)

                // Text field
                TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...8)
                    .focused($isInputFocused)
                    .disabled(isDisabled)
                    .font(Theme.body)
                    .foregroundStyle(Theme.textPrimary)
                    .textFieldStyle(.plain)
                    .onSubmit(onSend)

                Spacer(minLength: 0)

                // Right-side controls
                HStack(spacing: 10) {
                    Button(action: {}) {
                        Image(systemName: "mic")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.textMuted)
                    }
                    .buttonStyle(.plain)

                    // Send / Stop
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
                                        Circle().fill(canSend ? Theme.accent : Color.clear)
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
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.inputBg)
            )
            .padding(.horizontal, 16)

            // Compact status row
            HStack(spacing: 10) {
                statusLabel(icon: "desktopcomputer", text: "Local")
                statusLabel(icon: "arrow.triangle.branch", text: "main")
                Spacer()
                dropdownPill("GPT-5.4")
                dropdownPill("Alto")
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 10)
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
            .foregroundStyle(Theme.textMuted)
        }
        .buttonStyle(.plain)
    }

    private func statusLabel(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9))
            Text(text)
                .font(Theme.caption)
        }
        .foregroundStyle(Theme.textMuted)
    }
}
