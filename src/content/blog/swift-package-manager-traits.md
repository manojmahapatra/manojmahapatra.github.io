---
title: 'Swift Package Manager Traits: Feature Flags for Your Dependencies'
description: 'SE-0450 brings traits to SwiftPM - conditionally compile code, toggle optional dependencies, and configure packages without forking them'
pubDatetime: 2026-01-31T00:00:00Z
tags: [swift, ios, spm, swift-6]
---

Swift 6.1 introduces package traits - a way to configure packages with optional features and conditional dependencies. [SE-0450](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0450-swiftpm-package-traits.md) brings feature flags to SwiftPM.

## The Problem

Say you're building a networking library. Some users want logging, others don't. Some need async/await support, others are stuck on older deployment targets. Before traits, your options were:

- **Separate packages** - `MyLib`, `MyLibWithLogging`, `MyLibAsync` (maintenance nightmare)
- **Build everything** - Include all features, bloat everyone's binary
- **Fork and customize** - Every consumer maintains their own copy

All of these have tradeoffs. Other package managers like Cargo have had this capability. Now SwiftPM does too.

## Defining Traits

Traits live in your `Package.swift`. Here's a library with optional logging:

```swift
// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "NetworkKit",
    products: [
        .library(name: "NetworkKit", targets: ["NetworkKit"]),
    ],
    traits: [
        .default(enabledTraits: ["Logging"]),
        .trait(name: "Logging", description: "Enable debug logging"),
        .trait(name: "Metrics", description: "Enable performance metrics"),
    ],
    targets: [
        .target(name: "NetworkKit"),
    ]
)
```

Three things happening here:

1. **`.default(enabledTraits:)`** - These traits are on unless the consumer opts out
2. **`.trait(name:description:)`** - Define available traits
3. Traits can enable other traits via `enabledTraits: ["OtherTrait"]`

## Conditional Compilation

In your Swift code, check traits with `#if`:

```swift
public struct NetworkClient {
    public func fetch(_ url: URL) async throws -> Data {
        #if Logging
        print("[NetworkKit] Fetching \(url)")
        #endif
        
        let (data, _) = try await URLSession.shared.data(from: url)
        
        #if Metrics
        MetricsCollector.shared.record(bytes: data.count)
        #endif
        
        return data
    }
}
```

When `Logging` is disabled, that code doesn't exist in the binary. Zero overhead.

## Optional Dependencies

Traits really shine for optional dependencies. Want to support both `swift-log` and plain `print`?

```swift
let package = Package(
    name: "NetworkKit",
    products: [
        .library(name: "NetworkKit", targets: ["NetworkKit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", from: "1.0.0"),
    ],
    traits: [
        .trait(name: "SwiftLog", description: "Use swift-log instead of print"),
    ],
    targets: [
        .target(
            name: "NetworkKit",
            dependencies: [
                .product(
                    name: "Logging",
                    package: "swift-log",
                    condition: .when(traits: ["SwiftLog"])
                ),
            ]
        ),
    ]
)
```

The `swift-log` dependency is declared normally, but the target only links it when `SwiftLog` is enabled. In your code:

```swift
#if SwiftLog
import Logging
let logger = Logger(label: "NetworkKit")
#endif

public struct NetworkClient {
    public func fetch(_ url: URL) async throws -> Data {
        #if SwiftLog
        logger.info("Fetching \(url)")
        #else
        print("[NetworkKit] Fetching \(url)")
        #endif
        
        let (data, _) = try await URLSession.shared.data(from: url)
        return data
    }
}
```

## Consuming Packages with Traits

As a consumer, you control which traits are active:

```swift
dependencies: [
    // Use defaults
    .package(url: "https://github.com/example/NetworkKit", from: "1.0.0"),
    
    // Disable defaults, enable specific traits
    .package(
        url: "https://github.com/example/NetworkKit",
        from: "1.0.0",
        traits: [
            "Metrics",
        ]
    ),
    
    // Keep defaults and add more
    .package(
        url: "https://github.com/example/NetworkKit",
        from: "1.0.0",
        traits: [
            .defaults,
            "Metrics",
        ]
    ),
]
```

## Conditional Trait Enabling

You can enable a dependency's trait based on your own local traits:

```swift
let package = Package(
    name: "MyApp",
    traits: [
        .default(enabledTraits: ["MyBasicApp"]),
        .trait(name: "MyBasicApp", description: "Basic app"),
        .trait(name: "MyFullApp", description: "Full app", enabledTraits: ["UseLogging"]),
        .trait(name: "UseLogging"),
    ],
    dependencies: [
        .package(
            path: "../NetworkKit",
            traits: [
                .trait(name: "Logging", condition: .when(traits: ["UseLogging"])),
            ]
        ),
    ],
    targets: [
        .executableTarget(
            name: "MyApp",
            dependencies: [
                .product(name: "NetworkKit", package: "NetworkKit"),
            ]
        ),
    ]
)
```

When `MyFullApp` is enabled, it enables `UseLogging`, which in turn enables `Logging` on the `NetworkKit` dependency.

## CLI Flags

For testing, you can override traits from the command line:

```bash
# Build with specific traits
swift build --traits Logging,Metrics

# Enable everything
swift build --enable-all-traits

# Disable defaults
swift build --disable-default-traits

# Test with different configurations
swift test --traits Metrics
swift test --disable-default-traits
```

This is great for CI - test all trait combinations to catch issues early.

## Traits Can Compose

A trait can automatically enable other traits:

```swift
traits: [
    .trait(name: "Basic"),
    .trait(name: "Advanced", enabledTraits: ["Basic"]),
    .trait(name: "Full", enabledTraits: ["Advanced"]),
]
```

Enabling `Full` gives you everything. Enabling `Basic` gives you just the basics.

## Checking Traits in Code

You can only check your own package's traits with `#if`. You cannot directly check a dependency's traits - map them to local traits as shown in the conditional enabling section above.

```swift
#if UseLogging  // Check your local trait
import Logging
#endif
```

## When to Use Traits

**Good use cases:**

- **Optional integrations** - Support multiple logging/metrics backends
- **Platform-specific features** - Linux-only or Apple-only code paths
- **Debug vs Release** - Extra validation in debug builds
- **Heavyweight dependencies** - Don't force everyone to download what they won't use

**Avoid:**

- **Mutually exclusive features** - Can cause package resolution conflicts
- **Core functionality** - If everyone needs it, it shouldn't be a trait

## Xcode Gotcha

Xcode caches aggressively. If you change traits and things seem broken, clean your build folder and derived data. This is a known pain point that Apple is hopefully addressing.

## Links

- [SE-0450 Proposal](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0450-swiftpm-package-traits.md)
- [Swift Package Manager Docs](https://docs.swift.org/swiftpm/documentation/packagemanagerdocs/packagetraits)
- [Demo project](https://github.com/manojmahapatra/swift-package-traits-demo) - Working example with optional dependencies and trait composition
