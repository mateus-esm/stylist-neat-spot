---
name: GitHub push connector limitation
description: The authorized GitHub connector can read this repository but Git object write endpoints are blocked by the connector's Cloudflare layer.
---

The GitHub integration is suitable for authenticated reads, but attempts to
write Git objects through `git/trees` and `git/blobs` are rejected by the
connector's Cloudflare layer. A normal git remote with valid write
credentials is required to publish local commits.

**Why:** The workspace remote uses HTTPS without a usable credential, while the
Replit GitHub connector does not provide a transparent git transport.

**How to apply:** Preserve the local merge commit, avoid repeated connector
write retries, and use the Replit Git panel or a properly authenticated git
remote for the final push.