---
title: "Apple's Container Tool: A Deep Dive into CLI, Plugins, and XPC"
description: 'Understanding how Apple built their container tool - from CLI commands to plugin architecture to inter-process communication with XPC'
pubDatetime: 2026-02-03T00:00:00Z
tags: [swift, macos, containers, architecture]
---

Apple recently open-sourced [container](https://github.com/apple/container), a tool for running Linux containers on macOS. Unlike Docker (which runs all containers in a shared Linux VM), Container runs each container in its own lightweight virtual machine. This post explores how it's built - the CLI layer, plugin system, and XPC communication.

If you're new to containers or VMs, don't worry - let's walk through this together.

## What Are We Building Toward?

When you run `container run nginx`, a lot happens behind the scenes:

1. The CLI parses your command
2. An API server coordinates the work
3. Helper programs (plugins) handle specific tasks - images, networking, VM runtime
4. These programs talk to each other via XPC (macOS's inter-process communication)

Let's break down each layer.

## The CLI Layer

The CLI is your entry point - the `container` command you type in Terminal. It's built with Swift's [ArgumentParser](https://github.com/apple/swift-argument-parser) library.

### Command Structure

Commands are organized by domain. Each domain handles a specific resource type:

| Domain | Commands | What It Manages |
|--------|----------|-----------------|
| Container | run, create, start, stop, kill, delete, list, inspect, logs, exec, stats, prune | Container lifecycle |
| Image | pull, push, load, save, tag, delete, list, inspect, prune | Container images |
| Network | create, delete, list, inspect, prune | Virtual networks |
| Volume | create, delete, list, inspect, prune | Persistent storage |
| Builder | start, stop, status, delete | Image build system |
| Registry | login, logout | Registry authentication |
| System | start, stop, status, logs, dns, kernel, property | System services |

Notice the pattern - `list`, `inspect`, `delete`, and `prune` appear across multiple domains. This consistency makes the CLI predictable.

### How Commands Are Implemented

Each command is a Swift struct conforming to `AsyncParsableCommand`. Here's a simplified version of what `container stop` looks like:

```swift
struct ContainerStop: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "stop",
        abstract: "Stop one or more running containers"
    )
    
    @Flag(name: .shortAndLong, help: "Stop all running containers")
    var all: Bool = false
    
    @Option(name: .shortAndLong, help: "Signal to send")
    var signal: String = "SIGTERM"
    
    @Option(name: .shortAndLong, help: "Seconds before killing")
    var time: Int = 5
    
    @Argument(help: "Container IDs")
    var containerIds: [String] = []
    
    func run() async throws {
        // Connect to API server and send stop request
        let client = try ContainerAPIClient()
        
        let targets = all 
            ? try await client.listRunningContainers() 
            : containerIds
            
        for id in targets {
            try await client.stopContainer(
                id: id, 
                signal: signal, 
                timeout: time
            )
        }
    }
}
```

The CLI doesn't do the actual work - it just parses arguments and sends requests to the API server. This separation is important: the CLI is stateless, while the API server maintains state about running containers.

### The Application Entry Point

All commands are registered in `Application.swift`:

```swift
@main
struct Application: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "container",
        abstract: "A container platform for macOS",
        subcommands: [
            // Container commands (top-level for convenience)
            ContainerRun.self,
            ContainerCreate.self,
            ContainerStart.self,
            ContainerStop.self,
            // ...
            
            // Grouped commands
            ImageCommand.self,      // container image <subcommand>
            NetworkCommand.self,    // container network <subcommand>
            VolumeCommand.self,     // container volume <subcommand>
            BuilderCommand.self,    // container builder <subcommand>
            RegistryCommand.self,   // container registry <subcommand>
            SystemCommand.self,     // container system <subcommand>
        ]
    )
}
```

Container commands like `run`, `stop`, `list` are registered at the top level for convenience (`container run` instead of `container container run`). Other domains are nested (`container image pull`, `container network create`).

## The Plugin System

Here's where it gets interesting. Container doesn't do everything in one monolithic process. Instead, it splits work across multiple helper programs called **plugins**.

### Why Plugins?

Imagine you're building a restaurant. You could have one person do everything - take orders, cook, serve, clean. But that's inefficient and risky. If they get sick, the whole restaurant stops.

Instead, you have specialized roles:
- **Maître d'** - coordinates everything, talks to customers
- **Pantry chef** - manages ingredients
- **Line cooks** - prepare specific dishes
- **Servers** - deliver food

Container works the same way:

```
┌─────────────────────────────────────────────────────────────┐
│  CLI (container command)                                    │
│  "I'd like to run nginx please"                             │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  API Server (container-apiserver)                           │
│  Coordinates everything, maintains state                    │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ container-core- │ │ container-      │ │ container-runtime-  │
│ images          │ │ network-vmnet   │ │ linux               │
│                 │ │                 │ │                     │
│ Stores and      │ │ Manages virtual │ │ Runs the VM for     │
│ retrieves       │ │ network, assigns│ │ your container      │
│ container       │ │ IP addresses    │ │ (one per container) │
│ images          │ │                 │ │                     │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

### The Three Main Plugins

**container-core-images** - The pantry. It stores container images locally and retrieves them when needed. When you `container pull nginx`, this plugin downloads and stores the image. When you `container run nginx`, it provides the image to the runtime.

**container-network-vmnet** - The network manager. It creates virtual networks using macOS's vmnet framework and assigns IP addresses to containers. When your container needs to talk to the internet or other containers, this plugin makes it possible.

**container-runtime-linux** - The VM manager. This is special - there's one instance per container. When you run `container run nginx`, a new runtime plugin starts just for that container. It creates a lightweight Linux VM, sets up the filesystem, and runs your application inside.

### How Plugins Are Defined

A plugin is defined by a configuration and a binary path:

```swift
struct PluginConfig: Codable {
    let abstract: String           // Description
    let author: String             // Who wrote it
    let servicesConfig: ServicesConfig?
    
    struct ServicesConfig: Codable {
        let loadAtBoot: Bool       // Start when system starts?
        let runAtLoad: Bool        // Run immediately when loaded?
        let services: [Service]    // What services it provides
        let defaultArguments: [String]
    }
    
    struct Service: Codable {
        let type: ServiceType      // .runtime, .network, etc.
        let description: String?
    }
}
```

The `Plugin` struct combines this config with the binary location:

```swift
struct Plugin {
    let binaryURL: URL
    let config: PluginConfig
    
    var name: String {
        binaryURL.lastPathComponent  // e.g., "container-runtime-linux"
    }
    
    var shouldBoot: Bool {
        config.servicesConfig?.loadAtBoot ?? false
    }
    
    func getLaunchdLabel(instanceId: String? = nil) -> String {
        var label = "com.apple.container.\(name)"
        if let id = instanceId {
            label += ".\(id)"
        }
        return label
    }
}
```

### Plugin Discovery

The `PluginLoader` finds plugins in designated directories:

```swift
class PluginLoader {
    let pluginDirectories: [URL]
    
    func findPlugins() -> [Plugin] {
        var plugins: [Plugin] = []
        
        for directory in pluginDirectories {
            // Look for plugin directories
            let contents = try? FileManager.default
                .contentsOfDirectory(at: directory, ...)
            
            for item in contents ?? [] {
                // Each plugin has a config.json and a bin/ directory
                if let plugin = loadPlugin(from: item) {
                    plugins.append(plugin)
                }
            }
        }
        
        return plugins
    }
}
```

### Plugin Lifecycle with launchd

macOS has a built-in service manager called **launchd** (like systemd on Linux). It starts services, keeps them running, and restarts them if they crash.

Container registers plugins with launchd:

```swift
func registerWithLaunchd(plugin: Plugin, instanceId: String?) throws {
    // Generate a launchd plist (XML config file)
    let plist = LaunchPlist(
        label: plugin.getLaunchdLabel(instanceId: instanceId),
        program: plugin.binaryURL.path,
        arguments: plugin.config.servicesConfig?.defaultArguments ?? [],
        machServices: plugin.getMachServices(instanceId: instanceId),
        runAtLoad: plugin.config.servicesConfig?.runAtLoad ?? false
    )
    
    // Write plist to disk
    let plistPath = // ...
    try plist.write(to: plistPath)
    
    // Tell launchd to load it
    try ServiceManager.runLaunchctlCommand(args: ["bootstrap", domain, plistPath])
}
```

The generated plist looks something like:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apple.container.container-runtime-linux.my-nginx</string>
    <key>Program</key>
    <string>/usr/local/libexec/container/container-runtime-linux</string>
    <key>MachServices</key>
    <dict>
        <key>com.apple.container.runtime.container-runtime-linux.my-nginx</key>
        <true/>
    </dict>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

When you stop a container (`container stop my-nginx`), the plugin is deregistered:

```swift
func deregisterWithLaunchd(plugin: Plugin, instanceId: String?) throws {
    let label = plugin.getLaunchdLabel(instanceId: instanceId)
    try ServiceManager.runLaunchctlCommand(args: ["bootout", "\(domain)/\(label)"])
}
```

### Why This Design?

1. **Security** - Each plugin runs with only the permissions it needs. The network plugin can access vmnet; the runtime plugin can create VMs. Neither has more power than necessary.

2. **Stability** - If the image plugin crashes, your running containers keep running. The runtime plugins are independent.

3. **Isolation** - Each container gets its own runtime process. One misbehaving container can't affect others.

4. **Extensibility** - New plugins can be added without changing the core. Want GPU passthrough? Write a plugin.

## XPC Communication

Now we have multiple processes - CLI, API server, and plugins. How do they talk to each other?

macOS provides **XPC** (Cross-Process Communication), a secure, efficient way for processes to communicate.

### What is XPC?

Think of XPC as an internal phone system. Each service registers a "phone number" (called a Mach service name). Other processes can "call" that number to send messages.

```
API Server                          Runtime Plugin
     │                                    │
     │  "Hey runtime, start the VM"       │
     │ ─────────────────────────────────► │
     │                                    │
     │  "VM started, here's the IP"       │
     │ ◄───────────────────────────────── │
     │                                    │
```

### Mach Services

Each plugin registers Mach services based on its type:

```swift
func getMachServices(instanceId: String? = nil) -> [String] {
    guard let services = config.servicesConfig?.services else {
        return []
    }
    
    return services.map { service in
        var name = "com.apple.container.\(service.type.rawValue).\(self.name)"
        if let id = instanceId {
            name += ".\(id)"
        }
        return name
    }
}
```

For a container named "my-nginx", the runtime plugin registers:
```
com.apple.container.runtime.container-runtime-linux.my-nginx
```

The API server can now connect to this specific runtime.

### XPC Server

Plugins run an XPC server to receive requests. Container uses the low-level C XPC APIs (not the higher-level `NSXPCConnection`):

```swift
public struct XPCServer: Sendable {
    public typealias RouteHandler = @Sendable (XPCMessage) async throws -> XPCMessage
    
    private let routes: [String: RouteHandler]
    private let connection: xpc_connection_t
    
    public init(identifier: String, routes: [String: RouteHandler], log: Logger) {
        // Create a Mach service listener
        let connection = xpc_connection_create_mach_service(
            identifier,
            nil,
            UInt64(XPC_CONNECTION_MACH_SERVICE_LISTENER)
        )
        self.routes = routes
        self.connection = connection
    }
    
    public func listen() async throws {
        // Set up event handler for incoming connections
        xpc_connection_set_event_handler(self.connection) { object in
            switch xpc_get_type(object) {
            case XPC_TYPE_CONNECTION:
                // Handle new client connection
                self.handleClientConnection(connection: object)
            case XPC_TYPE_ERROR:
                // Handle errors
                break
            default:
                break
            }
        }
        
        xpc_connection_activate(self.connection)
    }
    
    func handleMessage(connection: xpc_connection_t, object: xpc_object_t) async throws {
        // Verify caller has same EUID (security check)
        var token = audit_token_t()
        xpc_dictionary_get_audit_token(object, &token)
        guard audit_token_to_euid(token) == geteuid() else {
            // Unauthorized - reject
            return
        }
        
        // Route to appropriate handler
        guard let route = xpc_dictionary_get_string(object, XPCMessage.routeKey) else {
            return
        }
        
        if let handler = routes[String(cString: route)] {
            let message = XPCMessage(object: object)
            let response = try await handler(message)
            xpc_connection_send_message(connection, response.underlying)
        }
    }
}
```

### XPC Client

The API server connects to plugins as a client:

```swift
public final class XPCClient: Sendable {
    private let connection: xpc_connection_t
    private let service: String
    
    public init(service: String, queue: DispatchQueue? = nil) {
        let connection = xpc_connection_create_mach_service(service, queue, 0)
        self.connection = connection
        self.service = service
        
        xpc_connection_set_event_handler(connection) { _ in }
        xpc_connection_activate(connection)
    }
    
    public func send(_ message: XPCMessage) async throws -> XPCMessage {
        try await withCheckedThrowingContinuation { cont in
            xpc_connection_send_message_with_reply(
                self.connection, 
                message.underlying, 
                nil
            ) { reply in
                let response = XPCMessage(object: reply)
                cont.resume(returning: response)
            }
        }
    }
    
    public func close() {
        xpc_connection_cancel(connection)
    }
}
```

### XPC Messages

Messages wrap XPC dictionaries with typed accessors:

```swift
public struct XPCMessage: Sendable {
    public static let routeKey = "com.apple.container.xpc.route"
    public static let errorKey = "com.apple.container.xpc.error"
    
    private let object: xpc_object_t
    
    public var underlying: xpc_object_t { object }
    
    public init(route: String) {
        self.object = xpc_dictionary_create_empty()
        xpc_dictionary_set_string(self.object, Self.routeKey, route)
    }
    
    public init(object: xpc_object_t) {
        self.object = object
    }
    
    // Typed accessors for different value types
    public func string(key: String) -> String? {
        guard let cstr = xpc_dictionary_get_string(object, key) else { return nil }
        return String(cString: cstr)
    }
    
    public func set(key: String, value: String) {
        xpc_dictionary_set_string(object, key, value)
    }
    
    public func data(key: String) -> Data? {
        var length: Int = 0
        guard let bytes = xpc_dictionary_get_data(object, key, &length) else { return nil }
        return Data(bytes: bytes, count: length)
    }
    
    public func set(key: String, value: Data) {
        value.withUnsafeBytes { ptr in
            if let addr = ptr.baseAddress {
                xpc_dictionary_set_data(object, key, addr, value.count)
            }
        }
    }
    
    public func reply() -> XPCMessage {
        XPCMessage(object: xpc_dictionary_create_reply(object)!)
    }
}
```

### Security with Audit Tokens

XPC connections include an **audit token** - an identifier of the calling process. The server verifies this to ensure only authorized processes can connect:

```swift
func handleMessage(connection: xpc_connection_t, object: xpc_object_t) async throws {
    // Extract the audit token from the message
    var token = audit_token_t()
    xpc_dictionary_get_audit_token(object, &token)
    
    // Verify caller has the same effective user ID as the server
    let serverEuid = geteuid()
    let clientEuid = audit_token_to_euid(token)
    
    guard clientEuid == serverEuid else {
        log.error("unauthorized request - uid mismatch")
        return
    }
    
    // Process the message...
}
```

This prevents malicious processes from impersonating the API server - only processes running as the same user can communicate.

## Putting It All Together

Let's trace what happens when you run `container run nginx`:

1. **CLI parses the command**
   ```
   container run nginx
      │      │    │
      │      │    └── Argument: the image to run (nginx web server)
      │      │
      │      └── Subcommand: what action to perform (run a container)
      │
      └── Program: the CLI tool itself
   ```
   
   | Part | What it is | Example alternatives |
   |------|-----------|---------------------|
   | `container` | The executable/program | Like `git`, `docker`, `brew` |
   | `run` | The subcommand/action | `stop`, `list`, `build`, `pull` |
   | `nginx` | The argument (image name) | `ubuntu`, `python:3.12`, `postgres` |
   
   The CLI extracts the image name (`nginx`) and any options.

2. **CLI connects to API server**
   ```swift
   let client = ContainerAPIClient()
   try await client.createAndRunContainer(image: "nginx", name: "my-nginx")
   ```

3. **API server requests the image**
   ```
   API Server → container-core-images (via XPC)
   "Do you have nginx:latest?"
   ```
   If not cached, the images plugin pulls it from the registry.

4. **API server creates a network attachment**
   ```
   API Server → container-network-vmnet (via XPC)
   "Allocate an IP for my-nginx"
   ```
   The network plugin assigns `192.168.64.5`.

5. **API server registers a runtime plugin**
   ```swift
   pluginLoader.registerWithLaunchd(
       plugin: runtimePlugin, 
       instanceId: "my-nginx"
   )
   ```
   launchd starts `container-runtime-linux` for this container.

6. **API server bootstraps the runtime**
   ```
   API Server → container-runtime-linux.my-nginx (via XPC)
   "Here's the image, network config, and options. Start the VM."
   ```

7. **Runtime creates the VM**
   - Sets up the filesystem from the image
   - Configures networking with the assigned IP
   - Starts the Linux kernel
   - Runs nginx inside

8. **CLI receives confirmation**
   ```
   my-nginx
   ```
   The container is running.

## Summary

Container's architecture demonstrates solid systems design:

- **CLI Layer** - Stateless command parsing with ArgumentParser. Commands are organized by domain with consistent patterns.

- **Plugin System** - Work is split across specialized helper programs. Each plugin does one thing well, runs with minimal permissions, and can fail independently.

- **XPC Communication** - Secure, efficient inter-process communication. Mach services provide addressable endpoints. Audit tokens ensure only authorized callers connect.

This separation of concerns makes the system more secure, stable, and maintainable. It's a pattern worth studying for any complex macOS application.

## Links

- [container on GitHub](https://github.com/apple/container)
- [Containerization framework](https://github.com/apple/containerization)
- [XPC Services documentation](https://developer.apple.com/documentation/xpc)
- [launchd documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
