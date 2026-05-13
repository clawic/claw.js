// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClawHostKit",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "ClawHostKit", targets: ["ClawHostKit"]),
        .library(name: "ClawHostAdapters", targets: ["ClawHostAdapters"]),
        .executable(name: "claw-host", targets: ["ClawHostCLI"]),
        .executable(name: "claw-hostd", targets: ["ClawHostDaemon"]),
        .executable(name: "ClawApp", targets: ["CommanderApp"]),
    ],
    targets: [
        .target(
            name: "ClawHostKit",
            dependencies: ["CommanderCore"]
        ),
        .target(
            name: "ClawHostAdapters",
            dependencies: ["ClawHostKit", "CommanderAdapters"]
        ),
        .target(
            name: "CommanderCore"
        ),
        .target(
            name: "CommanderAdapters",
            dependencies: ["CommanderCore"]
        ),
        .executableTarget(
            name: "ClawHostCLI",
            path: "Sources/commander",
            dependencies: ["ClawHostKit", "ClawHostAdapters"]
        ),
        .executableTarget(
            name: "ClawHostDaemon",
            path: "Sources/commanderd",
            dependencies: ["ClawHostKit", "ClawHostAdapters"]
        ),
        .executableTarget(
            name: "CommanderApp",
            dependencies: ["ClawHostKit", "ClawHostAdapters"],
            swiftSettings: [
                .unsafeFlags(["-parse-as-library"]),
            ]
        ),
        .testTarget(
            name: "CommanderE2ETests",
            dependencies: ["CommanderCore", "CommanderAdapters"]
        ),
    ]
)
