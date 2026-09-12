---
name: Clerk development instance
description: Clerk displays a Development mode badge and browser warning when the app uses development publishable keys.
---

The Clerk-hosted sign-in UI shows “Development mode” and logs a development-key
warning when the configured publishable key belongs to a development instance.
This is controlled by the Clerk instance, not by the React appearance config.

**Why:** Hiding the badge would conceal an environment boundary instead of
making the app production-ready.

**How to apply:** Keep the warning in development; before publishing, switch
the Clerk environment and its publishable/secret keys through the workspace
secrets flow, then revalidate authentication.