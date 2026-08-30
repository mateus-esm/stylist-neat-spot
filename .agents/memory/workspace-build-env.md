---
name: Workspace build environment
description: The canvas artifact's Vite build requires its managed PORT and BASE_PATH values even for production builds.
---

The full workspace build must provide the canvas artifact's managed environment values when invoked outside its workflow: `PORT=8081` and `BASE_PATH=/__mockup`.

**Why:** The canvas Vite config throws during config loading when either variable is absent, so an otherwise healthy workspace build can fail before compiling application code.

**How to apply:** Prefer the artifact workflow for normal operation; for a manual full build, provide the canvas values and separately rebuild the root-mounted app with `BASE_PATH=/`.