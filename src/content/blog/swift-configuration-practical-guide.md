---
title: "Swift Configuration: A Practical Guide"
description: "Using Apple's swift-configuration library for debug settings, feature flags, and environment-based configuration."
pubDate: 2026-01-26
tags: ["swift", "ios", "configuration", "swift-6"]
---

Apple shipped [swift-configuration](https://github.com/apple/swift-configuration) with Swift 6. I'd been rolling my own config loading, so I figured I'd see what the official solution looks like.

## The Basic Idea

The library separates readers from providers. You read config through `ConfigReader`, and where the values come from is someone else's problem:

```swift
let config = ConfigReader(providers: [
    EnvironmentVariablesProvider(),
    try await FileProvider<JSONSnapshot>(filePath: "config.json")
])

let timeout = config.int(forKey: "http.timeout", default: 30)
```

Providers are checked in order. Environment variable wins if set, otherwise JSON, otherwise the default. Pretty standard stuff.

The library also supports YAML via the `YAML` trait. There's also a community [TOML provider](https://github.com/finnvoor/swift-configuration-toml).

I built a [plist provider](https://github.com/manojmahapatra/swift-configuration-plist) for Apple platform apps. Plist has native `Data` support, so no base64 encoding needed for binary config values.

## A Demo

Wrapping related config in structs:

```swift
struct DebugSettings {
    private let config: ConfigReader
    
    init(config: ConfigReader) {
        self.config = config.scoped(to: "debug")
    }
    
    var networkDelay: Int { config.int(forKey: "networkDelay", default: 0) }
    var offlineMode: Bool { config.bool(forKey: "offlineMode", default: false) }
}
```

`scoped(to:)` lets you write `forKey: "networkDelay"` instead of `forKey: "debug.networkDelay"`.

JSON has the defaults, environment variables override for testing:

```bash
DEBUG_OFFLINE_MODE=true swift run
```

Feature flags work the same way. Ship with features off, flip via environment, update JSON when ready.

## The Xcode Thing

Running from Xcode, the working directory isn't your project root. `FileProvider` won't find your config file.

Fix: bundle it as a resource:

```swift
.executableTarget(
    name: "MyApp",
    resources: [.copy("config.json")]
)
```

Then load via `Bundle.module.path(forResource:ofType:)`.

## Hot Reloading

This is where it got interesting. `ReloadingFileProvider` watches for file changes. I assumed it would just work. It did not just work.

Turns out the provider implements `Service` from [swift-service-lifecycle](https://github.com/swift-server/swift-service-lifecycle). You have to run it in a `ServiceGroup` or the polling never starts:

```swift
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

## Links

- [swift-configuration](https://github.com/apple/swift-configuration)
- [Demo project](https://github.com/manojmahapatra/swift-configuration-demo) with working hot reload
- [swift-configuration-plist](https://github.com/manojmahapatra/swift-configuration-plist) - plist provider
