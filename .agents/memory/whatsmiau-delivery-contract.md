---
name: Whatsmiau delivery contract
description: Self-hosted WhatsMiau v1 contract used by the clinic WhatsApp integration
---
Use the user's self-hosted WhatsMiau v1 server (WHATSMIAU_BASE_URL, no public-cloud/v2 fallback). Requests send `apikey` + JSON content type.
Create: POST /instance/create {ID, InstanceName} (400/409 = exists). Connect: GET /instance/connect/:instance -> {base64, connected}. Status: GET /instance/fetchInstances; paired = non-empty remoteJID.
Webhook payloads must be reduced to delivery metadata.
**Why:** the public cloud API returned 401/502 for the user.
**How to apply:** never reintroduce a default base URL; log provider response bodies on failure.
