import AVFoundation

final class AudioService: NSObject, ObservableObject {

    // MARK: - Published State

    @Published var isRecording = false
    @Published var isPaused = false
    @Published var recordingTime: TimeInterval = 0
    @Published var currentLevels: [Float] = Array(repeating: 0, count: 24)

    @Published var isPlaying = false
    @Published var playbackProgress: Double = 0
    @Published var playbackTime: TimeInterval = 0

    // MARK: - Recording

    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var recordingTimer: Timer?
    private var meteringTimer: Timer?
    private var levelHistory: [Float] = []

    // MARK: - Playback

    private var audioPlayer: AVAudioPlayer?
    private var playbackTimer: Timer?
    private var playbackCompletion: (() -> Void)?

    // MARK: - Recording API

    func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[AudioService] Failed to configure audio session: \(error)")
            return
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]

        do {
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            recorder.delegate = self
            recorder.record()

            audioRecorder = recorder
            recordingURL = url
            isRecording = true
            isPaused = false
            recordingTime = 0
            levelHistory = []
            currentLevels = Array(repeating: 0, count: 24)

            startTimers()
        } catch {
            print("[AudioService] Failed to start recording: \(error)")
        }
    }

    func pauseRecording() {
        audioRecorder?.pause()
        isPaused = true
        stopTimers()
    }

    func resumeRecording() {
        audioRecorder?.record()
        isPaused = false
        startTimers()
    }

    func cancelRecording() {
        stopTimers()
        audioRecorder?.stop()
        audioRecorder = nil

        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
        }
        recordingURL = nil
        isRecording = false
        isPaused = false
        recordingTime = 0
        currentLevels = Array(repeating: 0, count: 24)
    }

    func finishRecording() -> (url: URL, duration: TimeInterval, waveformSamples: [Float])? {
        stopTimers()
        audioRecorder?.stop()
        audioRecorder = nil

        guard let url = recordingURL else { return nil }

        let duration = recordingTime
        let samples = normalizedWaveformSamples()

        isRecording = false
        isPaused = false
        recordingTime = 0
        currentLevels = Array(repeating: 0, count: 24)

        return (url, duration, samples)
    }

    private func startTimers() {
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self, self.isRecording, !self.isPaused else { return }
            self.recordingTime += 0.1
        }

        meteringTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            guard let self, let recorder = self.audioRecorder, self.isRecording, !self.isPaused else { return }
            recorder.updateMeters()
            let power = recorder.averagePower(forChannel: 0)
            let normalized = Self.normalizePower(power)
            self.levelHistory.append(normalized)

            var levels = self.currentLevels
            levels.removeFirst()
            levels.append(normalized)
            self.currentLevels = levels
        }
    }

    private func stopTimers() {
        recordingTimer?.invalidate()
        recordingTimer = nil
        meteringTimer?.invalidate()
        meteringTimer = nil
    }

    private func normalizedWaveformSamples() -> [Float] {
        guard !levelHistory.isEmpty else { return Array(repeating: 0.1, count: 40) }
        let targetCount = 40
        if levelHistory.count <= targetCount {
            return levelHistory
        }
        let chunkSize = Float(levelHistory.count) / Float(targetCount)
        return (0..<targetCount).map { i in
            let start = Int(Float(i) * chunkSize)
            let end = min(Int(Float(i + 1) * chunkSize), levelHistory.count)
            let slice = levelHistory[start..<end]
            return slice.isEmpty ? 0 : slice.reduce(0, +) / Float(slice.count)
        }
    }

    static func normalizePower(_ power: Float) -> Float {
        // AVAudioRecorder power range: -160 dB (silence) to 0 dB (max)
        let minDb: Float = -50
        let clamped = max(minDb, min(power, 0))
        return (clamped - minDb) / (0 - minDb)
    }

    // MARK: - Playback API

    func play(url: URL, onComplete: (() -> Void)? = nil) {
        stopPlayback()

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[AudioService] Failed to set playback session: \(error)")
        }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.delegate = self
            player.prepareToPlay()
            player.play()

            audioPlayer = player
            playbackCompletion = onComplete
            isPlaying = true
            playbackProgress = 0
            playbackTime = 0

            playbackTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
                guard let self, let player = self.audioPlayer, player.isPlaying else { return }
                self.playbackProgress = player.duration > 0 ? player.currentTime / player.duration : 0
                self.playbackTime = player.currentTime
            }
        } catch {
            print("[AudioService] Playback failed: \(error)")
        }
    }

    func play(data: Data, onComplete: (() -> Void)? = nil) {
        stopPlayback()

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[AudioService] Failed to set playback session: \(error)")
        }

        do {
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            player.prepareToPlay()
            player.play()

            audioPlayer = player
            playbackCompletion = onComplete
            isPlaying = true
            playbackProgress = 0
            playbackTime = 0

            playbackTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
                guard let self, let player = self.audioPlayer, player.isPlaying else { return }
                self.playbackProgress = player.duration > 0 ? player.currentTime / player.duration : 0
                self.playbackTime = player.currentTime
            }
        } catch {
            print("[AudioService] Playback failed: \(error)")
        }
    }

    func togglePlayback(url: URL) {
        if isPlaying {
            stopPlayback()
        } else {
            play(url: url)
        }
    }

    func togglePlayback(data: Data) {
        if isPlaying {
            stopPlayback()
        } else {
            play(data: data)
        }
    }

    func seekPlayback(to fraction: Double) {
        guard let player = audioPlayer else { return }
        player.currentTime = fraction * player.duration
        playbackProgress = fraction
        playbackTime = player.currentTime
    }

    func stopPlayback() {
        playbackTimer?.invalidate()
        playbackTimer = nil
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
        playbackProgress = 0
        playbackTime = 0
        playbackCompletion = nil
    }

}

// MARK: - AVAudioRecorderDelegate

extension AudioService: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            print("[AudioService] Recording finished unsuccessfully")
        }
    }
}

// MARK: - AVAudioPlayerDelegate

extension AudioService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.playbackTimer?.invalidate()
            self?.playbackTimer = nil
            self?.isPlaying = false
            self?.playbackProgress = 0
            self?.playbackTime = 0
            self?.playbackCompletion?()
            self?.playbackCompletion = nil
        }
    }
}
