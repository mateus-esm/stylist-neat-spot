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

Instance lifecycle routes for create, connect, status, and logout are
configurable environment values rather than assumed provider behavior.

**Why:** The confirmed Whatsmiau contract covers sending and delivery callbacks,
but does not fully document instance management endpoints; deployments may
expose compatible routes under different paths.

**How to apply:** Keep the clinic-scoped instance name in the database, never
persist QR content, and fail clearly when a configured management route is not
supported by the provider.