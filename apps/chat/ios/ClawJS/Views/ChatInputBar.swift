import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    var placeholder: String = "Message"
    var isDisabled: Bool = false
    var isGenerating: Bool = false
    var isRecording: Bool = false
    var recordingLevels: [Float] = []
    var autofocus: Bool = false
    var onSend: () -> Void
    var onStop: (() -> Void)? = nil
    var onVoiceRecord: (() -> Void)? = nil
    var onCancelRecording: (() -> Void)? = nil
    var onSendRecording: (() -> Void)? = nil
    @FocusState private var isInputFocused: Bool

    private var canSend: Bool {
        !isDisabled && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 10) {
            // Left bubble button (always separate)
            leftBubbleButton

            // Main input capsule
            mainCapsule
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .padding(.top, 6)
        .animation(.easeInOut(duration: 0.2), value: isRecording)
        .animation(.easeInOut(duration: 0.15), value: isGenerating)
        .animation(.easeInOut(duration: 0.15), value: canSend)
        .onAppear {
            if autofocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    isInputFocused = true
                }
            }
        }
    }

    // MARK: - Left Bubble

    private var leftBubbleButton: some View {
        Button {
            if isRecording {
                onCancelRecording?()
            }
        } label: {
            Image(systemName: isRecording ? "stop.fill" : "plus")
                .font(.system(size: isRecording ? 14 : 20))
                .foregroundColor(isRecording ? .red : .white)
                .frame(width: 44, height: 44)
        }
        .glassEffect(.regular, in: .circle)
        .disabled(!isRecording)
        .opacity(isRecording ? 1 : 0.8)
    }

    // MARK: - Main Capsule

    private var mainCapsule: some View {
        HStack(spacing: 12) {
            if isRecording {
                recordingContent
            } else {
                normalContent
            }
        }
        .padding(.leading, isRecording ? 14 : 14)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
    }

    // MARK: - Normal (text) content

    private var normalContent: some View {
        Group {
            TextField(
                placeholder,
                text: $text,
                axis: .vertical
            )
            .lineLimit(1...6)
            .focused($isInputFocused)
            .disabled(isDisabled)
            .font(.system(size: 16))
            .foregroundColor(.primary)
            .onSubmit { if canSend { onSend() } }

            Spacer(minLength: 0)

            if isGenerating {
                Button {
                    onStop?()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.black)
                        .frame(width: 34, height: 34)
                        .background(Color.white)
                        .clipShape(Circle())
                }
                .transition(.scale.combined(with: .opacity))
            } else if canSend {
                Button {
                    onSend()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14))
                        .foregroundColor(.black)
                        .frame(width: 34, height: 34)
                        .background(Color.white)
                        .clipShape(Circle())
                }
                .transition(.scale.combined(with: .opacity))
            } else {
                Button {
                    onVoiceRecord?()
                } label: {
                    Image(systemName: "mic")
                        .font(.system(size: 17))
                        .foregroundColor(Color(.systemGray))
                }

                Button {
                    onVoiceRecord?()
                } label: {
                    HStack(spacing: 1.5) {
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 5)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 14)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 7)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 16)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 9)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 4)
                    }
                    .frame(width: 34, height: 34)
                    .background(Color.white)
                    .clipShape(Circle())
                }
            }
        }
    }

    // MARK: - Recording content

    private var recordingContent: some View {
        Group {
            // Gray waveform filling available space
            RecordingWaveformView(levels: recordingLevels)
                .frame(height: 28)

            // Send button
            Button {
                onSendRecording?()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 14))
                    .foregroundColor(.black)
                    .frame(width: 34, height: 34)
                    .background(Color.white)
                    .clipShape(Circle())
            }
        }
    }
}

// MARK: - Recording Waveform

struct RecordingWaveformView: View {
    let levels: [Float]

    var body: some View {
        GeometryReader { geo in
            let count = 32
            let spacing: CGFloat = 2.5
            let totalSpacing = spacing * CGFloat(count - 1)
            let barWidth = max(2, (geo.size.width - totalSpacing) / CGFloat(count))

            HStack(alignment: .center, spacing: spacing) {
                ForEach(Array(0..<count), id: \.self) { i in
                    let level = sampleLevel(at: i, total: count)
                    RoundedRectangle(cornerRadius: barWidth / 2)
                        .fill(Color(.systemGray3))
                        .frame(width: barWidth, height: max(3, CGFloat(level) * geo.size.height))
                        .animation(.easeOut(duration: 0.08), value: level)
                }
            }
            .frame(height: geo.size.height)
        }
    }

    private func sampleLevel(at index: Int, total: Int) -> Float {
        guard !levels.isEmpty else { return 0.08 }
        let ratio = Float(index) / Float(total)
        let levelIndex = Int(ratio * Float(levels.count))
        return levels[min(levelIndex, levels.count - 1)]
    }
}
