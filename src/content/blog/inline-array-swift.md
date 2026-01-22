---
title: 'InlineArray in Swift 6.2: Fixed-Size Arrays Done Right'
description: 'A deep dive into SE-0453 InlineArray - Swift finally gets stack-allocated fixed-size arrays with safe indexing and iteration'
pubDatetime: 2026-01-22T00:00:00Z
tags: [swift, ios, arrays]
---

Swift 6.2 ships with `InlineArray`, a fixed-size array type that's been years in the making. If you've ever wished for C-style `T[N]` arrays but with Swift's safety guarantees, this is it.

I've been following [SE-0453](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0453-vector.md) since its pitch phase, and I think it's one of the most important additions to the standard library for performance-critical code.

## The Problem with Array

`Array` is heap-allocated and growable. That's great for general use, but expensive when you know exactly how many elements you need:

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

## Enter InlineArray

`InlineArray` gives you fixed-size, stack-allocated storage with full indexing and iteration:

```swift
func processPixel() {
    let rgba: InlineArray<4, UInt8> = [255, 128, 64, 255]
    
    for i in rgba.indices {
        print(rgba[i])  // Works!
    }
}
```

No heap allocation. No reference counting. Just bytes on the stack.

## The Generic Signature

The type signature is `InlineArray<Count, Element>` - count comes first. This might seem backwards if you're coming from C++ (`std::array<T, N>`), but it reads naturally: "an InlineArray of 4 integers."

It also makes multi-dimensional arrays intuitive:

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

Compare this to C where `float[4][3]` is indexed as `[row][col]` but declared in reverse order. Swift's approach is cleaner.

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
// Index-based initialization
let squares = InlineArray<5, Int> { i in i * i }
// [0, 1, 4, 9, 16]

// Chain from previous element
let fibonacci = InlineArray<10, Int>(first: 1) { prev in 
    prev + 1  // Simplified - real Fibonacci needs two previous values
}
```

**Repeating value**:

```swift
let zeros = InlineArray<100, Int>(repeating: 0)
```

## Noncopyable Elements

Here's where it gets interesting. `InlineArray` supports noncopyable types:

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

## What's Missing (Intentionally)

**No `Sequence` or `Collection` conformance.** This is deliberate. Unlike `Array`, `InlineArray` has no copy-on-write semantics - it's eagerly copied. Conforming to `Collection` would enable implicit copies through slicing and generic algorithms, which defeats the purpose of a stack-allocated type.

Instead, use `indices`:

```swift
let data: InlineArray<1000, Float> = ...

for i in data.indices {
    process(data[i])
}
```

**No `Equatable`, `Hashable` yet.** These require the element to be copyable, and the Swift team wants to wait until these protocols are generalized for noncopyable types.

**No `Span` API yet.** [SE-0447 Span](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0447-span-access-shared-contiguous-storage.md) defines safe contiguous storage access, but lifetime annotations aren't ready. Coming soon.

## Real-World Use Cases

**SIMD-friendly data:**

```swift
struct Particle {
    var position: InlineArray<3, Float>
    var velocity: InlineArray<3, Float>
    var color: InlineArray<4, UInt8>
}
```

**Fixed-size buffers:**

```swift
struct UUIDBytes {
    let bytes: InlineArray<16, UInt8>
}
```

**Embedded systems** where heap allocation isn't available:

```swift
struct SensorReadings {
    var samples: InlineArray<64, Int16>
    var timestamps: InlineArray<64, UInt32>
}
```

## The Name Story

The proposal originally called this type `Vector`, matching the mathematical term (fixed magnitude). But after community feedback, it was renamed to `InlineArray` to be more descriptive of its behavior - it's an array that's allocated inline with its container.

Interestingly, this means Swift's naming is the opposite of C++: Swift's `Array` is growable (like C++'s `std::vector`), and Swift's `InlineArray` is fixed-size (like C++'s `std::array`).

## Future Directions

The proposal outlines several planned additions:

- **Syntax sugar** like `[4 x Int]` or `Int[4]`
- **`FixedCapacityArray`** - fixed capacity but variable count (append/remove supported)
- **`SmallArray`** - inline storage with heap fallback when it grows
- **C interop** - importing C arrays as `InlineArray` instead of tuples

## Try It Now

`InlineArray` is available in Swift 6.2. If you're doing performance-sensitive work, embedded development, or just want predictable memory layout, give it a try.

```swift
// Before: heap allocation, reference counting
let old: [Int] = [1, 2, 3, 4]

// After: stack allocation, zero overhead
let new: InlineArray<4, Int> = [1, 2, 3, 4]
```

The full proposal is worth reading: [SE-0453 InlineArray](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0453-vector.md).
