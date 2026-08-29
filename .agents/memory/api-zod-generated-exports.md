---
name: API Zod generated exports
description: The generated runtime schemas and TypeScript types can expose colliding names.
---

Keep the public API Zod entrypoint on an explicit type allowlist instead of re-exporting every generated type.

**Why:** The generator emits runtime schemas and TypeScript declarations with overlapping names such as request parameter schemas, which causes TypeScript export collisions.

**How to apply:** After regenerating the OpenAPI client, preserve the curated exports in the package entrypoint and run the library typecheck.