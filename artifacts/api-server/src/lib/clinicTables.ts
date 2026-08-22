/**
 * Registry of all clinic tables, mapping the API slug to the Drizzle table
 * object and the column that represents the owning admin userId (if any).
 *
 * The legacy Fisio App used Supabase RLS based on auth.uid(). We replicate
 * the same access semantics here:
 *   - Admin: full access to all tables that carry a userId column.
 *   - Patient: limited to their own client row and appointments linked to them.
 */
import {
  appointmentsTable,
  availabilitySlotsTable,
  clientsTable,
  packageTemplatesTable,
  patientPackagesTable,
  servicesTable,
  sessionExercisesTable,
  sessionMediaTable,
  sessionPlansTable,
  userRolesTable,
} from "@workspace/db";
import type { PgTable } from "drizzle-orm/pg-core";

export type TableSlug =
  | "appointments"
  | "availability_slots"
  | "clients"
  | "package_templates"
  | "patient_packages"
  | "services"
  | "session_exercises"
  | "session_media"
  | "session_plans"
  | "user_roles";

export const VALID_TABLES = new Set<TableSlug>([
  "appointments",
  "availability_slots",
  "clients",
  "package_templates",
  "patient_packages",
  "services",
  "session_exercises",
  "session_media",
  "session_plans",
  "user_roles",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTable = PgTable & Record<string, any>;

export interface TableEntry {
  table: AnyTable;
  /**
   * Column name in the Drizzle table that holds the owner/admin userId.
   * Null for tables that don't have a direct userId (e.g. session_exercises,
   * session_media which are scoped by appointment).
   */
  ownerColumn: string | null;
}

export const CLINIC_TABLE_REGISTRY: Record<TableSlug, TableEntry> = {
  appointments: {
    table: appointmentsTable as AnyTable,
    ownerColumn: "userId",
  },
  availability_slots: {
    table: availabilitySlotsTable as AnyTable,
    ownerColumn: "userId",
  },
  clients: {
    table: clientsTable as AnyTable,
    ownerColumn: "userId",
  },
  package_templates: {
    table: packageTemplatesTable as AnyTable,
    ownerColumn: "userId",
  },
  patient_packages: {
    table: patientPackagesTable as AnyTable,
    ownerColumn: "userId",
  },
  services: {
    table: servicesTable as AnyTable,
    ownerColumn: "userId",
  },
  session_exercises: {
    // scoped via appointmentId — no direct userId
    table: sessionExercisesTable as AnyTable,
    ownerColumn: null,
  },
  session_media: {
    // scoped via appointmentId — no direct userId
    table: sessionMediaTable as AnyTable,
    ownerColumn: null,
  },
  session_plans: {
    table: sessionPlansTable as AnyTable,
    ownerColumn: "userId",
  },
  user_roles: {
    table: userRolesTable as AnyTable,
    ownerColumn: null,
  },
};
