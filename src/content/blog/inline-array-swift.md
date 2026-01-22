---
title: 'InlineArray in Swift 6.2: Fixed-Size Arrays Done Right'
description: 'A deep dive into SE-0453 InlineArray - Swift finally gets stack-allocated fixed-size arrays with safe indexing and iteration'
pubDatetime: 2026-01-22T00:00:00Z
tags: [swift, ios, arrays]
---

Swift 6.2 ships with `InlineArray`, a fixed-size array type that's been years in the making. If you've ever wished for C-style `T[N]` arrays but with Swift's safety guarantees, this is it.

[SE-0453](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0453-vector.md) is one of the most important additions to the standard library for performance-critical code.

## Why We Need InlineArray

Swift's `Array` is excellent for general use, but it comes with hidden costs:

- **Heap allocation** - Every `Array` allocates memory on the heap, even for small fixed collections
- **Reference counting** - Array's backing storage is reference-counted, adding retain/release overhead
- **Indirection** - Accessing elements requires following a pointer to heap storage

For most apps, this is fine. But in performance-critical code - game engines, audio processing, embedded systems, tight loops - these costs add up.

```swift
func processPixel() {
    // This allocates on the heap, even for 4 integers
    let rgba = [255, 128, 64, 255]
}
```

The workaround has been tuples:

```swift
func processPixel() {
    let rgba = (255, 128, 64, 255)
    
    // But you can't iterate or index dynamically
    for i in 0..<4 {
        // error: cannot subscript tuple
        print(rgba[i])
    }
}
```

Tuples don't support subscripting or iteration. You're stuck with `.0`, `.1`, `.2`, `.3`.

`InlineArray` solves both problems - inline storage with full indexing and iteration:

```swift
func processPixel() {
    let rgba: InlineArray<4, UInt8> = [255, 128, 64, 255]
    
    for i in rgba.indices {
        print(rgba[i])  // Works!
    }
}
```

No heap allocation. No reference counting. The storage is laid out inline - on the stack for local variables, or inline within a struct/class for properties.

## The Generic Signature

The type signature is `InlineArray<Count, Element>` - count comes first. This reads naturally: "an InlineArray of 4 integers."

Multi-dimensional arrays are intuitive too:

```swift
// A 3x4 matrix
let matrix: InlineArray<3, InlineArray<4, Float>> = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0]
]

// Access as matrix[row][col] - matches the declaration order
let value = matrix[2][3]
```

## Memory Layout

`InlineArray` has predictable, zero-overhead memory layout:

```swift
MemoryLayout<InlineArray<4, UInt8>>.size      // 4
MemoryLayout<InlineArray<4, UInt8>>.stride    // 4
MemoryLayout<InlineArray<4, UInt8>>.alignment // 1

MemoryLayout<InlineArray<4, Int64>>.size      // 32
MemoryLayout<InlineArray<4, Int64>>.stride    // 32
MemoryLayout<InlineArray<4, Int64>>.alignment // 8
```

Size equals `Element.stride * count`. No hidden overhead.

## Initialization

Three ways to create an `InlineArray`:

**Literal syntax** (compiler magic, not `ExpressibleByArrayLiteral`):

```swift
let numbers: InlineArray<3, Int> = [1, 2, 3]

// Type inference works too
let inferred: InlineArray = [1, 2, 3]  // InlineArray<3, Int>
```

**Closure-based** (great for computed values):

```swift
// Index-based initialization (note: no argument label)
let squares = InlineArray<5, Int> { i in i * i }
// [0, 1, 4, 9, 16]

// Chain from previous element
let values = InlineArray<10, Int>(first: 1) { prev in 
    prev * 2
}
```

**Repeating value**:

```swift
let zeros = InlineArray<100, Int>(repeating: 0)
```

## Noncopyable Elements

`InlineArray` supports noncopyable types:

```swift
let atomics: InlineArray<4, Atomic<Int>> = [
    Atomic(0), 
    Atomic(1), 
    Atomic(2), 
    Atomic(3)
]

let mutexes = InlineArray<3, Mutex<Data>> { _ in 
    Mutex(Data()) 
}
```

This is huge for systems programming. You can have a fixed-size array of atomics, mutexes, or file handles without heap allocation.

## Why No Sequence or Collection?

This is deliberate and important to understand. Unlike `Array`, `InlineArray` is **eagerly copied** - there's no copy-on-write. The Language Steering Group specifically chose the name "Inline" to highlight this performance characteristic.

From the [acceptance discussion](https://forums.swift.org/t/accepted-with-modifications-se-0453-inlinearray-formerly-vector-a-fixed-size-array/77678):

> Top of mind for the Language Steering Group was the behavior of this type regarding copies: namely, that this type is eagerly copied rather than being copy-on-write which carries substantial performance implications.

Conforming to `Collection` would enable implicit copies through slicing and generic algorithms, which defeats the purpose. Instead, use `indices`:

```swift
let data: InlineArray<1000, Float> = ...

for i in data.indices {
    process(data[i])
}
```

## Primitives: Span Integration

A lesser-known feature: `InlineArray` exposes `.span` and `.mutableSpan` properties from [SE-0447](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0447-span-access-shared-contiguous-storage.md) - safe, bounds-checked access to the underlying memory without copying:

```swift
func processBuffer(_ span: Span<Float>) { ... }

var data: InlineArray<1024, Float> = ...
processBuffer(data.span)  // Zero-copy view into the array
```

This bridges `InlineArray` to APIs working with contiguous memory - crucial for C/C++ interop without dropping to `UnsafeBufferPointer`.

## Must Be Fully Occupied

An `InlineArray` must always be fully initialized. You cannot have 2 elements in an `InlineArray<3, Int>` - all 3 slots must contain values.

## C Interop - Not Yet

If you were hoping `InlineArray` would fix C array interop (importing `char[16]` as `InlineArray<16, CChar>` instead of a tuple), that's been **deferred** pending further design work.

## When Should You Use InlineArray?

`InlineArray` is a specialized tool, not a replacement for `Array`. For most application code, `Array` remains the right choice.

**Use InlineArray when:**

- **Zero heap allocation needed** - embedded systems, real-time audio, game loops
- **Size is fixed at compile time** - RGB pixels, 3D vectors, matrix dimensions
- **Building low-level data structures** - cache-friendly layouts, framework internals
- **Noncopyable element storage** - arrays of atomics, mutexes, file handles

```swift
// Good: fixed-size math types
struct Vector3 {
    var values: InlineArray<3, Float>
}

// Good: embedded sensor buffer
struct SensorReadings {
    var samples: InlineArray<64, Int16>
}

// Good: noncopyable elements
let locks = InlineArray<4, Mutex<Data>> { _ in Mutex(Data()) }
```

**Stick with Array when:**

- Size is dynamic or unknown
- You need `append()`, `filter()`, `map()`, or other Collection APIs
- API ergonomics matter more than allocation cost
- You're writing typical application code

The overhead of `Array` is negligible for most apps. Reach for `InlineArray` when profiling shows allocation is a bottleneck, or when you're in a domain (embedded, audio, games) where it matters by default.

The full proposal: [SE-0453 InlineArray](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0453-vector.md).
