---
title: "Swift Configuration: A Practical Guide"
description: "Using Apple's swift-configuration library for debug settings, feature flags, and environment-based configuration."
pubDatetime: 2026-01-26T00:00:00Z
tags: [swift, ios, configuration, swift-6]
---

Apple shipped [swift-configuration](https://github.com/apple/swift-configuration) with Swift 6. I'd been rolling my own config loading, so I figured I'd see what the official solution looks like.

## The Basic Idea

It's a new library that provides a unified approach to reading configuration in Swift applications. The library separates readers from providers—you read config through `ConfigReader`, and providers supply the actual values:

```swift
import Configuration

let config = try await ConfigReader(providers: [
    EnvironmentVariablesProvider(),
    FileProvider<JSONSnapshot>(filePath: "config.json")
])

// Reads TIMEOUT env var (uppercase), or "timeout" from config.json, or 30
let timeoutSeconds = config.int(forKey: "timeout", default: 30)
```

Same pattern works for `string`, `bool`, `double`, and arrays.

Providers are checked in the order you list them. In the example above, environment variable wins if set, then JSON file, then the fallback value you pass to `default:`.

The library also supports YAML via the `YAML` trait. There's also a community [TOML provider](https://github.com/finnvoor/swift-configuration-toml).

I built a [plist provider](https://github.com/manojmahapatra/swift-configuration-plist) for Apple platform apps. Plist has native `Data` support, so no base64 encoding needed for binary config values.

## A Simple Demo

Here's a pattern for organizing config: wrap related settings in a struct that reads from a scoped config reader.

```swift
struct DebugSettings {
    private let config: ConfigReader
    
    init(config: ConfigReader) {
        self.config = config.scoped(to: "debug")
    }
    
    // Reads DEBUG_NETWORK_DELAY env var, or "networkDelay" under "debug" in config, or 0
    var networkDelay: Int { config.int(forKey: "networkDelay", default: 0) }
    var offlineMode: Bool { config.bool(forKey: "offlineMode", default: false) }
}

// Usage
let debug = DebugSettings(config: config)
if debug.networkDelay > 0 {
    try await Task.sleep(for: .milliseconds(debug.networkDelay))
}
```

`scoped(to:)` lets you write `forKey: "networkDelay"` instead of `forKey: "debug.networkDelay"`.

Your config file holds the baseline values. Environment variables override them:

```bash
# From terminal - sets debug.networkDelay to 500ms
DEBUG_NETWORK_DELAY=500 swift run
```

In Xcode: Scheme → Run → Arguments → Environment Variables.

## Multiple Readers

Multiple readers can share a provider, or use separate providers for different files:

```swift
// Shared provider
let provider = try await FileProvider<JSONSnapshot>(filePath: "config.json")
let debug = ConfigReader(provider: provider).scoped(to: "debug")
let api = ConfigReader(provider: provider).scoped(to: "api")

// Separate providers
let appProvider = try await FileProvider<JSONSnapshot>(filePath: "app.json")
let featuresProvider = try await FileProvider<JSONSnapshot>(filePath: "features.json")
let app = ConfigReader(provider: appProvider)
let features = ConfigReader(provider: featuresProvider)
```

## Hot Reloading

This is where it got interesting. `ReloadingFileProvider` watches for file changes. I assumed I could just swap `FileProvider` for `ReloadingFileProvider` and be done. Not quite.

Turns out the provider implements `Service` from [swift-service-lifecycle](https://github.com/swift-server/swift-service-lifecycle). You have to run it in a `ServiceGroup` or the polling never starts:

```swift
import Configuration
import Logging
import ServiceLifecycle

let configPath = "config.json"
let logger = Logger(label: "hot-reload")

let provider = try await ReloadingFileProvider<JSONSnapshot>(
    filePath: configPath,
    pollInterval: .seconds(1)
)
let config = ConfigReader(provider: provider)

let serviceGroup = ServiceGroup(services: [provider], logger: logger)
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { try await serviceGroup.run() }
    group.addTask {
        try await provider.watchSnapshot { updates in
            for await _ in updates {
                print("api.timeout = \(config.int(forKey: "api.timeout", default: 30))")
            }
        }
    }
    try await group.next()
}
```

Edit the JSON while it's running and the new value prints within a second. Useful for server config without restarts.

One gotcha: I tried `watchInt` first, which should watch a specific key. The watchers never registered. `watchSnapshot` works fine. I didn't dig into why—life's too short.

Full working examples are in the [demo repo](https://github.com/manojmahapatra/swift-configuration-demo).

The library has more [advanced capabilities](https://forums.swift.org/t/introducing-swift-configuration/82368#p-378107-advanced-capabilities-2)—access logging and secret redaction—that I'll cover in a future post.

## Links

- [swift-configuration](https://github.com/apple/swift-configuration)
- [Demo project](https://github.com/manojmahapatra/swift-configuration-demo) with working hot reload
- [swift-configuration-plist](https://github.com/manojmahapatra/swift-configuration-plist) - plist provider
