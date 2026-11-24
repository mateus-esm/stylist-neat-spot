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
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  db,
  userRolesTable,
  clientsTable,
  patientInvitesTable,
  clinicsTable,
  clinicMembersTable,
  clinicAuditEventsTable,
} from "@workspace/db";

export type ClinicRole = "owner" | "admin" | "physiotherapist" | "patient" | null;
export type StaffRole = Exclude<ClinicRole, "patient" | null>;

export function isStaffRole(role: ClinicRole): role is StaffRole {
  return role === "owner" || role === "admin" || role === "physiotherapist";
}

export function isAdminRole(role: ClinicRole): boolean {
  return role === "owner" || role === "admin";
}

/** Fetch the primary Clerk email without exposing it to API responses. */
export async function getClerkPrimaryEmail(userId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) return null;
    const body = await response.json() as {
      email_addresses?: Array<{ email_address: string; id: string }>;
      primary_email_address_id?: string;
    };
    const primary = body.email_addresses?.find((email) => email.id === body.primary_email_address_id);
    return (primary?.email_address ?? body.email_addresses?.[0]?.email_address ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the active clinic membership. Legacy installations may have only
 * user_roles, so the first clinic is used as a compatibility bridge below.
 */
export async function getClinicMembership(userId: string) {
  const [member] = await db
    .select()
    .from(clinicMembersTable)
    .where(and(eq(clinicMembersTable.userId, userId), eq(clinicMembersTable.status, "active")))
    .limit(1);
  return member ?? null;
}

/**
 * Makes an existing single-owner installation visible as a clinic without
 * changing its existing records. This is idempotent and never promotes an
 * arbitrary visitor.
 */
export async function ensureClinicForUser(
  userId: string,
  roleHint?: ClinicRole,
): Promise<{ clinicId: string; role: ClinicRole } | null> {
  const membership = await getClinicMembership(userId);
  if (membership) return { clinicId: membership.clinicId, role: membership.role as ClinicRole };

  const [legacy] = await db
    .select({ role: userRolesTable.role })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .limit(1);
  const role = (roleHint ?? legacy?.role ?? null) as ClinicRole;
  if (!role || !isStaffRole(role)) return null;

  let [clinic] = await db.select().from(clinicsTable).limit(1);
  if (!clinic) {
    [clinic] = await db.insert(clinicsTable).values({ name: "Minha clínica" }).returning();
  }
  if (!clinic) return null;

  await db.insert(clinicMembersTable).values({
    clinicId: clinic.id,
    userId,
    role: role === "admin" ? "owner" : role,
    status: "active",
    joinedAt: new Date(),
  }).onConflictDoNothing();
  return { clinicId: clinic.id, role: role === "admin" ? "owner" : role };
}

/** Look up the stored role for a Clerk userId. Returns null if not found. */
export async function getStoredRole(userId: string): Promise<ClinicRole> {
  const membership = await getClinicMembership(userId);
  if (membership) return membership.role as ClinicRole;
  const [row] = await db
    .select()
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return (row.role as ClinicRole) ?? null;
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
  if (existing === "owner") {
    const context = await ensureClinicForUser(userId, existing);
    return context?.role ?? existing;
  }

  // A production-only, exact-email allowlist for granting clinic ownership.
  // The Clerk email is fetched server-side; no client-supplied email is trusted.
  const configuredOwnerEmail = process.env.CLINIC_PRODUCTION_OWNER_EMAIL
    ?.trim()
    .toLowerCase();
  if (configuredOwnerEmail) {
    const verifiedEmail = await getClerkPrimaryEmail(userId);
    if (verifiedEmail === configuredOwnerEmail) {
      const [priorGrant] = await db
        .select({ id: clinicAuditEventsTable.id })
        .from(clinicAuditEventsTable)
        .where(and(
          eq(clinicAuditEventsTable.actorUserId, userId),
          eq(clinicAuditEventsTable.action, "owner.granted"),
          eq(clinicAuditEventsTable.resourceType, "clinic_member"),
        ))
        .limit(1);
      // The allowlist is a one-time bootstrap. Do not silently restore ownership
      // if a later administrator intentionally changes this user's role.
      if (priorGrant) return existing;

      const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable).limit(2);
      if (clinics.length !== 1) {
        throw new Error("Production owner bootstrap requires exactly one configured clinic");
      }
      const clinicId = clinics[0].id;
      const now = new Date();
      const member = await db.transaction(async (tx) => {
        const [upsertedMember] = await tx.insert(clinicMembersTable).values({
          clinicId,
          userId,
          email: verifiedEmail,
          role: "owner",
          status: "active",
          joinedAt: now,
          revokedAt: null,
        }).onConflictDoUpdate({
          target: [clinicMembersTable.clinicId, clinicMembersTable.userId],
          set: {
            email: verifiedEmail,
            role: "owner",
            status: "active",
            joinedAt: now,
            revokedAt: null,
          },
        }).returning();

        await tx.delete(userRolesTable).where(eq(userRolesTable.userId, userId));
        await tx.insert(userRolesTable).values({ userId, role: "owner" });
        await tx.insert(clinicAuditEventsTable).values({
          clinicId,
          actorUserId: userId,
          action: "owner.granted",
          resourceType: "clinic_member",
          resourceId: upsertedMember.id,
          metadata: { email: verifiedEmail, grantSource: "production_owner_allowlist" },
        });
        return upsertedMember;
      });
      return member ? "owner" : null;
    }
  }

  if (existing) {
    if (isStaffRole(existing)) {
      const context = await ensureClinicForUser(userId, existing);
      return context?.role ?? existing;
    }
    return existing;
  }

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
      .values({ userId, role: "owner" })
      .onConflictDoNothing();
    await ensureClinicForUser(userId, "owner");
    return "owner";
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
  const email = await getClerkPrimaryEmail(userId);
  if (!email) return null;

  // Find an unconsumed invite for this email
  const [invite] = await db
    .select()
    .from(patientInvitesTable)
    .where(
      and(
        eq(sql`lower(${patientInvitesTable.email})`, email),
        isNull(patientInvitesTable.consumedAt),
      ),
    )
    .limit(1);

  if (!invite) return null;

  // Atomic linkage — all three writes must succeed
  const [inviterMembership] = await db
    .select({ clinicId: clinicMembersTable.clinicId })
    .from(clinicMembersTable)
    .where(and(eq(clinicMembersTable.userId, invite.adminUserId), eq(clinicMembersTable.status, "active")))
    .limit(1);

  await db.transaction(async (tx) => {
    const now = new Date();
    // Claim once. A concurrent accept must not grant an extra membership.
    const [claimed] = await tx.update(patientInvitesTable)
      .set({ consumedAt: now })
      .where(and(eq(patientInvitesTable.id, invite.id), isNull(patientInvitesTable.consumedAt)))
      .returning({ id: patientInvitesTable.id });
    if (!claimed) return;

    const [linked] = await tx
      .update(clientsTable)
      .set({
        authUserId: userId,
        ...(inviterMembership?.clinicId ? { clinicId: inviterMembership.clinicId } : {}),
      })
      .where(
        and(
          eq(clientsTable.id, invite.clientId),
          isNull(clientsTable.authUserId),
        ),
      )
      .returning({ id: clientsTable.id });
    if (!linked) return;

    await tx
      .insert(userRolesTable)
      .values({ userId, role: "patient" })
      .onConflictDoNothing();

    if (inviterMembership?.clinicId) {
      await tx.insert(clinicMembersTable).values({
        clinicId: inviterMembership.clinicId,
        userId,
        email,
        role: "patient",
        status: "active",
        joinedAt: now,
      }).onConflictDoNothing();
    }
  });

  // Return the existing role on a retry from the same account.
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
  role: "owner" | "admin" | "physiotherapist" | "patient",
): Promise<void> {
  await db
    .insert(userRolesTable)
    .values({ userId, role })
    .onConflictDoNothing();
}
