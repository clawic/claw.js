import SwiftUI

struct VoiceRecordingOverlay: View {
    @ObservedObject var audioService: AudioService
    var onCancel: () -> Void
    var onSend: () -> Void

    @State private var pulseScale: CGFloat = 1.0

    private var formattedTime: String {
        let mins = Int(audioService.recordingTime) / 60
        let secs = Int(audioService.recordingTime) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var body: some View {
        HStack(spacing: 16) {
            // Cancel
            Button {
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color(.systemGray3))
                    .clipShape(Circle())
            }

            // Recording indicator + timer
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 8, height: 8)
                    .scaleEffect(pulseScale)
                    .animation(
                        audioService.isPaused
                            ? .default
                            : .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                        value: pulseScale
                    )
                    .onAppear { pulseScale = 1.4 }
                    .onChange(of: audioService.isPaused) { _, paused in
                        pulseScale = paused ? 1.0 : 1.4
                    }

                Text(formattedTime)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.primary)
            }

            // Animated waveform
            HStack(alignment: .center, spacing: 2) {
                ForEach(0..<24, id: \.self) { i in
                    let level = audioService.currentLevels[min(i, audioService.currentLevels.count - 1)]
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(Color.red.opacity(0.8))
                        .frame(width: 2.5, height: max(3, CGFloat(level) * 24))
                        .animation(.easeOut(duration: 0.08), value: level)
                }
            }
            .frame(height: 28)

            Spacer(minLength: 0)

            // Pause / Resume
            Button {
                if audioService.isPaused {
                    audioService.resumeRecording()
                } else {
                    audioService.pauseRecording()
                }
            } label: {
                Image(systemName: audioService.isPaused ? "mic.fill" : "pause.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(audioService.isPaused ? Color.red : Color(.systemGray3))
                    .clipShape(Circle())
            }

            // Send
            Button {
                onSend()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)
                    .frame(width: 36, height: 36)
                    .background(Color.white)
                    .clipShape(Circle())
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .padding(.top, 6)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
