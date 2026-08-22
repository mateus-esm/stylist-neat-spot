/**
 * Role resolution helpers.
 *
 * Roles are stored in the user_roles table. The explicitly configured clinic
 * owner is bootstrapped as the first admin when the database is empty.
 *
 * Patient invite flow:
 *   1. Admin calls POST /clinic/invitations — inserts a patient_invites row and
 *      sends a Clerk invitation email.
 *   2. Patient signs up via Clerk (their email matches patient_invites.email).
 *   3. On the patient's first GET /clinic/me the server looks up their Clerk
 *      email via the REST API, finds the unconsumed invite, and atomically:
 *        a. Sets clients.auth_user_id = clerk_user_id
 *        b. Inserts user_roles (patient)
 *        c. Marks patient_invites.consumed_at
 */
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  userRolesTable,
  clientsTable,
  patientInvitesTable,
} from "@workspace/db";

export type ClinicRole = "admin" | "patient" | null;

/** Look up the stored role for a Clerk userId. Returns null if not found. */
export async function getStoredRole(userId: string): Promise<ClinicRole> {
  const [row] = await db
    .select()
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return row.role as ClinicRole;
}

/**
 * Bootstrap the configured clinic owner as admin when the user_roles table is
 * empty. This must never promote an arbitrary first visitor.
 * Returns the effective role.
 */
export async function resolveOrBootstrapRole(
  userId: string,
): Promise<ClinicRole> {
  const existing = await getStoredRole(userId);
  if (existing) return existing;

  const bootstrapEmail = process.env.CLINIC_INITIAL_ADMIN_EMAIL
    ?.trim()
    .toLowerCase();
  if (!bootstrapEmail) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  let signedInEmail: string | null = null;
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        email_addresses?: Array<{ email_address: string; id: string }>;
        primary_email_address_id?: string;
      };
      const primary = body.email_addresses?.find(
        (email) => email.id === body.primary_email_address_id,
      );
      signedInEmail =
        primary?.email_address ?? body.email_addresses?.[0]?.email_address ?? null;
    }
  } catch {
    return null;
  }

  if (signedInEmail?.toLowerCase() !== bootstrapEmail) return null;

  // First configured clinic owner → admin.
  const [anyRole] = await db.select().from(userRolesTable).limit(1);
  if (!anyRole) {
    await db
      .insert(userRolesTable)
      .values({ userId, role: "admin" })
      .onConflictDoNothing();
    return "admin";
  }

  return null;
}

/**
 * Called on GET /clinic/me for a user that has no role yet.
 * Fetches the user's primary email from Clerk REST, finds an unconsumed
 * patient_invites row, and atomically links the client + assigns role.
 * Returns "patient" if linking succeeded, null otherwise.
 */
export async function tryLinkPatientInvite(
  userId: string,
): Promise<ClinicRole> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  // Fetch the user's email from Clerk REST API
  let email: string | null = null;
  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (resp.ok) {
      const body = (await resp.json()) as {
        email_addresses?: Array<{ email_address: string; id: string }>;
        primary_email_address_id?: string;
      };
      const primary = body.email_addresses?.find(
        (e) => e.id === body.primary_email_address_id,
      );
      email = primary?.email_address ?? body.email_addresses?.[0]?.email_address ?? null;
    }
  } catch {
    // Network error — can't link now, return null
    return null;
  }

  if (!email) return null;

  // Find an unconsumed invite for this email
  const [invite] = await db
    .select()
    .from(patientInvitesTable)
    .where(
      and(
        eq(patientInvitesTable.email, email),
        isNull(patientInvitesTable.consumedAt),
      ),
    )
    .limit(1);

  if (!invite) return null;

  // Atomic linkage — all three writes must succeed
  await db.transaction(async (tx) => {
    // a) Link the client record
    await tx
      .update(clientsTable)
      .set({ authUserId: userId })
      .where(
        and(
          eq(clientsTable.id, invite.clientId),
          isNull(clientsTable.authUserId), // only if not already linked
        ),
      );

    // b) Assign patient role
    await tx
      .insert(userRolesTable)
      .values({ userId, role: "patient" })
      .onConflictDoNothing();

    // c) Mark invite consumed
    await tx
      .update(patientInvitesTable)
      .set({ consumedAt: new Date() })
      .where(eq(patientInvitesTable.id, invite.id));
  });

  // Verify the link actually happened (another concurrent request may have won)
  return (await getStoredRole(userId)) ?? null;
}

/**
 * Find the client record whose authUserId matches the given Clerk userId.
 * Returns the client id (UUID) or null.
 */
export async function getClientIdForPatient(
  userId: string,
): Promise<string | null> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.authUserId, userId))
    .limit(1);
  return client?.id ?? null;
}

/**
 * Assign a role to a user (idempotent).
 */
export async function assignRole(
  userId: string,
  role: "admin" | "patient",
): Promise<void> {
  await db
    .insert(userRolesTable)
    .values({ userId, role })
    .onConflictDoNothing();
}
