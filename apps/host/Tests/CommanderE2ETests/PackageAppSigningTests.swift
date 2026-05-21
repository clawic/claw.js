import Foundation
import XCTest

final class PackageAppSigningTests: XCTestCase {
    func testPackageAppRefusesImplicitKeychainSigning() throws {
        let testFile = URL(fileURLWithPath: #filePath)
        let packageRoot = testFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("claw-package-signing-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [
            packageRoot.appendingPathComponent("scripts/package_app.sh").path,
            "--output", temporaryDirectory.appendingPathComponent("Claw.app").path,
            "--binary-path", "/bin/echo",
            "--skip-build",
        ]
        let stderr = Pipe()
        process.standardOutput = Pipe()
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()

        let errorOutput = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        XCTAssertNotEqual(process.terminationStatus, 0)
        XCTAssertTrue(errorOutput.contains("Refusing to auto-select a signing identity"), errorOutput)
    }
}
