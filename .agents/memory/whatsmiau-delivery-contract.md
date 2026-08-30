---
name: Whatsmiau delivery contract
description: External Whatsmiau Cloud v2 contract and the privacy boundary for delivery callbacks.
---

Whatsmiau Cloud v2 is Evolution-compatible: text delivery uses an instance-scoped
`/message/sendText/:instance` route, the API key is sent in `apikey`, and a
successful response identifies the message through `key.id`. Delivery callbacks
use `messages.update` with `DELIVERY_ACK` and `READ`.

**Why:** The provider's public documentation does not describe a webhook
signature, and provider payloads can contain message content and chat
identifiers. Treating `success: true` or persisting the raw callback as the
contract could mark failed sends as successful or retain clinical data.

**How to apply:** Keep provider requests limited to the approved recipient and
rendered text fields. Accept only the documented delivery states, make event
inserts idempotent by clinic/provider-message/status, and persist only
delivery metadata. Keep asynchronous processing disabled until a real instance
and callback path have been verified.