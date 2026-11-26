---
name: Clinic authorization boundaries
description: Security rules for patient bookings, invitations, roles, and private clinical media.
---

Clinic data paths that carry sensitive patient information must remain controlled server operations, rather than being exposed through a generic CRUD compatibility layer.

**Why:** A legacy Supabase-style client can make otherwise convenient generic mutations bypass tenant ownership, atomic scheduling, and private-object authorization. The risk is especially high for role records, appointment reservations, and object-storage paths.

**How to apply:** Keep role changes server-only; require patient scheduling through the atomic booking operation; bind uploads to a short-lived server-side pending record and finalize them only after the caller and appointment are verified in the same transaction. Treat storage paths, uploader identity, and appointment links as immutable after finalization.

For finalized clinical media, the clinical record determines access even if the storage provider has a more permissive ACL. Do not fall back to provider ACLs after the clinical record denies access, or cache private downloads across session changes. Keep media deletion on the path that removes both the file and its clinical record.

**Why:** Storage metadata and browser caches are independent of the current user's clinical relationship; neither can enforce changes to that relationship.