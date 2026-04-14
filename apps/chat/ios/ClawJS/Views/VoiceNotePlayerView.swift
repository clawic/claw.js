import SwiftUI

struct VoiceNotePlayerView: View {
    let attachment: Attachment
    @StateObject private var audioService = AudioService()
    @State private var hasStartedOnce = false

    private var formattedDuration: String {
        let time = audioService.isPlaying ? audioService.playbackTime : attachment.duration
        return formatTime(time)
    }

    var body: some View {
        HStack(spacing: 12) {
            // Play/Pause button
            Button {
                togglePlayback()
            } label: {
                Image(systemName: audioService.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.accentColor)
                    .clipShape(Circle())
            }

            // Waveform + progress
            VStack(alignment: .leading, spacing: 6) {
                WaveformView(
                    samples: attachment.waveformSamples,
                    progress: audioService.playbackProgress,
                    activeColor: .accentColor,
                    inactiveColor: Color(.systemGray4)
                )
                .frame(height: 28)

                Text(formattedDuration)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(.systemGray))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .onDisappear {
            audioService.stopPlayback()
        }
    }

    private func togglePlayback() {
        if audioService.isPlaying {
            audioService.stopPlayback()
            return
        }
        if let data = attachment.data {
            audioService.play(data: data) {
                hasStartedOnce = false
            }
        } else if let url = attachment.fileURL {
            audioService.play(url: url) {
                hasStartedOnce = false
            }
        }
        hasStartedOnce = true
    }
}

// MARK: - Waveform View

struct WaveformView: View {
    let samples: [Float]
    var progress: Double = 0
    var activeColor: Color = .accentColor
    var inactiveColor: Color = Color(.systemGray4)

    var body: some View {
        GeometryReader { geo in
            let barCount = samples.isEmpty ? 40 : samples.count
            let spacing: CGFloat = 2
            let totalSpacing = spacing * CGFloat(barCount - 1)
            let barWidth = max(2, (geo.size.width - totalSpacing) / CGFloat(barCount))
            let progressX = geo.size.width * progress

            HStack(alignment: .center, spacing: spacing) {
                ForEach(0..<barCount, id: \.self) { i in
                    let sample = samples.isEmpty ? Float(0.1) : samples[min(i, samples.count - 1)]
                    let height = max(3, CGFloat(sample) * geo.size.height)
                    let barX = CGFloat(i) * (barWidth + spacing) + barWidth / 2
                    let isActive = barX <= progressX

                    RoundedRectangle(cornerRadius: barWidth / 2)
                        .fill(isActive ? activeColor : inactiveColor)
                        .frame(width: barWidth, height: height)
                }
            }
            .frame(height: geo.size.height)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        // Seeking not implemented for simplicity - would need audioService reference
                    }
            )
        }
    }
}

// MARK: - Helpers

private func formatTime(_ seconds: TimeInterval) -> String {
    guard seconds.isFinite, seconds >= 0 else { return "0:00" }
    let mins = Int(seconds) / 60
    let secs = Int(seconds) % 60
    return "\(mins):\(String(format: "%02d", secs))"
}
