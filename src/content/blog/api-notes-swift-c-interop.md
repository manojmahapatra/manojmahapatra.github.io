---
title: 'API Notes: Improving Swift Imports Without Touching C Headers'
description: 'Learn how Clang API Notes let you customize how C libraries appear in Swift - rename functions, add nullability, and improve ergonomics without modifying original headers'
pubDatetime: 2026-01-23T00:00:00Z
tags: [swift, clang, c, interop]
---

When you import a C library into Swift, the results can be... ugly. Function names like `MYLCreatePoint` and `MYLPrintPointWithLabel` don't feel Swift-y at all. Normally, you'd fix this by adding attributes to the C headers. But what if you can't modify those headers?

That's where **API Notes** come in.

## The Problem

Imagine you have a C library with this header:

```c
typedef struct {
    int x;
    int y;
} MYLPoint;

MYLPoint* MYLCreatePoint(int x, int y);
void MYLDestroyPoint(MYLPoint* point);
void MYLPrintPointWithLabel(MYLPoint* point, const char* label);
```

When Swift imports this, you get:

```swift
let point = MYLCreatePoint(10, 20)
MYLPrintPointWithLabel(point, "My Point")
MYLDestroyPoint(point)
```

It works, but it doesn't feel like Swift. We want labeled arguments, cleaner names, and proper nullability annotations. The traditional fix is adding attributes like `NS_SWIFT_NAME` to the header - but you might not own that header, or you want to keep it clean for other consumers.

## The Solution: Sidecar Files

API Notes is a Clang feature that lets you provide annotations in a separate YAML file. The compiler picks it up automatically and applies the changes during import.

Create a file named `MyCLib.apinotes` (matching your module name) next to your module map:

```yaml
Name: MyCLib

Tags:
- Name: MYLPoint
  SwiftName: Point

Functions:
- Name: MYLCreatePoint
  SwiftName: "createPoint(x:y:)"
  NullabilityOfRet: N

- Name: MYLDestroyPoint
  SwiftName: "destroyPoint(_:)"

- Name: MYLPrintPointWithLabel
  SwiftName: "printPoint(_:label:)"
```

Now Swift sees:

```swift
let point = createPoint(x: 10, y: 20)
printPoint(point, label: "My Point")
destroyPoint(point)
```

Much better! The C header remains untouched.

## How It Works

The magic happens at compile time. When you pass `-fapinotes-modules` to Clang (via `-Xcc -fapinotes-modules` in swiftc), the compiler looks for `.apinotes` files next to your module maps.

**File placement:**
- For bare modules: place `.apinotes` in the same directory as `module.modulemap`
- For frameworks: place in `Headers/` (public) or `PrivateHeaders/` (private)

Here's the project structure for a bare module:

```
MyCLib/
├── mylib.h           # Original C header (unchanged)
├── mylib.c           # Implementation
├── module.modulemap  # Required for modular imports
└── MyCLib.apinotes   # Your annotations go here
```

The module map is simple:

```
module MyCLib {
    header "mylib.h"
    export *
}
```

Build with:

```bash
clang -c MyCLib/mylib.c -o mylib.o
swiftc main.swift mylib.o -I MyCLib -Xcc -fapinotes-modules -o app
```

## What Can You Annotate?

API Notes support many annotations:

| Annotation | Purpose |
|------------|---------|
| `SwiftName` | Rename types, functions, methods |
| `Nullability` | Mark pointers as `Nonnull`, `Optional`, etc. |
| `Availability` | Mark APIs unavailable in Swift |
| `SwiftPrivate` | Hide from public API (like `NS_REFINED_FOR_SWIFT`) |
| `SwiftImportAs` | Control how C++ classes import |
| `EnumKind` | Make enums import as `NS_ENUM` or `NS_OPTIONS` |

For Objective-C classes, you can also annotate methods and properties:

```yaml
Classes:
- Name: UIViewController
  Methods:
  - Selector: "presentViewController:animated:"
    MethodKind: Instance
    SwiftName: "present(_:animated:)"
```

## Version-Specific Annotations

Need different behavior for different Swift versions? API Notes support versioning:

```yaml
SwiftVersions:
- Version: 4
  Functions:
  - Name: oldFunction
    SwiftName: "legacyFunction()"
```

Versioned annotations apply to that version and all earlier versions, letting you maintain backwards compatibility while improving the API for newer Swift.

## When to Use API Notes

API Notes shine when:

- **Third-party libraries** - Improve imports without forking
- **System headers** - Apple uses this extensively for UIKit, Foundation, etc.
- **Shared C code** - Keep headers clean for C consumers while providing Swift niceties
- **Gradual migration** - Improve Swift interface incrementally

## Limitations

A few things to keep in mind:

- Requires modular headers (you need a module map)
- Only works with the `-fapinotes-modules` flag
- Can't annotate arbitrary textual headers outside modules

## Try It Yourself

I've put together a minimal working example on GitHub: [apinotes-demo](https://github.com/manojmahapatra/apinotes-demo)

Clone it, build it, and experiment with the `.apinotes` file to see how changes affect the Swift interface.

## Reference

- [Clang API Notes Documentation](https://clang.llvm.org/docs/APINotes.html)
- [Example from LLVM test suite](https://github.com/llvm/llvm-project/blob/main/clang/test/APINotes/Inputs/Frameworks/SomeKit.framework/Headers/SomeKit.apinotes)

API Notes is one of those features that's been quietly powering Swift's excellent Objective-C interop for years. Now you can use it for your own C libraries too.
