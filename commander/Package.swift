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
        .executable(name: "claw-host", targets: ["commander"]),
        .executable(name: "claw-hostd", targets: ["commanderd"]),
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
            name: "commander",
            dependencies: ["ClawHostKit", "ClawHostAdapters"]
        ),
        .executableTarget(
            name: "commanderd",
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
