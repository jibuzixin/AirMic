// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AirMicMac",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "AirMicKit", targets: ["AirMicKit"]),
        .executable(name: "airmicd", targets: ["airmicd"]),
        .executable(name: "AirMac", targets: ["AirMac"]),
    ],
    targets: [
        .target(name: "AirMicKit"),
        .executableTarget(name: "airmicd", dependencies: ["AirMicKit"]),
        .executableTarget(name: "AirMac", dependencies: ["AirMicKit"]),
        .testTarget(name: "AirMicKitTests", dependencies: ["AirMicKit"]),
    ]
)
