// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClawHostKit",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "ClawHostKit", targets: ["CommanderCore"]),
        .library(name: "ClawHostAdapters", targets: ["CommanderAdapters"]),
        .executable(name: "claw-host", targets: ["commander"]),
        .executable(name: "claw-hostd", targets: ["commanderd"]),
        .executable(name: "ClawApp", targets: ["CommanderApp"]),
        .library(name: "CommanderCore", targets: ["CommanderCore"]),
        .library(name: "CommanderAdapters", targets: ["CommanderAdapters"]),
        .executable(name: "commander", targets: ["commander"]),
        .executable(name: "commanderd", targets: ["commanderd"]),
        .executable(name: "CommanderApp", targets: ["CommanderApp"]),
    ],
    targets: [
        .target(
            name: "CommanderCore"
        ),
        .target(
            name: "CommanderAdapters",
            dependencies: ["CommanderCore"]
        ),
        .executableTarget(
            name: "commander",
            dependencies: ["CommanderCore", "CommanderAdapters"]
        ),
        .executableTarget(
            name: "commanderd",
            dependencies: ["CommanderCore", "CommanderAdapters"]
        ),
        .executableTarget(
            name: "CommanderApp",
            dependencies: ["CommanderCore", "CommanderAdapters"],
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
