// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClawJSVaultMac",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "VaultMacKit", targets: ["VaultMacKit"]),
        .executable(name: "ClawJSVaultMac", targets: ["ClawJSVaultMac"]),
    ],
    targets: [
        .target(
            name: "VaultMacKit",
            path: "Sources/VaultMacKit"
        ),
        .executableTarget(
            name: "ClawJSVaultMac",
            dependencies: ["VaultMacKit"],
            path: "Sources/ClawJSVaultMac"
        ),
        .testTarget(
            name: "VaultMacKitTests",
            dependencies: ["VaultMacKit"],
            path: "Tests/VaultMacKitTests"
        ),
    ]
)
