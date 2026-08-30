/**
 * Clinic API routes
 *
 * GET  /clinic/me                       — current user + role (auto-links invited patients)
 * GET  /clinic/data/:table              — list records
 * POST /clinic/data/:table              — create record
 * PATCH /clinic/data/:table/:id         — update record
 * DELETE /clinic/data/:table/:id        — delete record
 * POST /clinic/invitations              — invite patient (admin only)
 * POST /clinic/bookings                 — patient books a slot (atomic appointment + slot reservation)
 * POST /clinic/appointments/:id/media   — admin associates an uploaded object with an owned appointment
 *
 * Query grammar (as emitted by the compatibility client):
 *   ?filters=column:op:value,...,limit:N,single:true
 *   ?order=column,-column   (no prefix = ASC, "-" prefix = DESC, comma-separated)
 *
 * Response keys are snake_case (DB rows pass through directly).
 * Request bodies may be camelCase; they are normalised to snake_case before DB writes.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { eq, ne, ilike, gte, lte, and, or, inArray, asc, desc, isNull, getTableColumns } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  db,
  userRolesTable,
  clientsTable,
  appointmentsTable,
  availabilitySlotsTable,
  sessionMediaTable,
  sessionExercisesTable,
  patientPackagesTable,
  sessionPlansTable,
  patientInvitesTable,
  pendingUploadsTable,
  clinicAssignmentsTable,
} from "@workspace/db";
import {
  GetClinicSessionResponse,
  ListClinicRecordsParams,
  CreateClinicRecordParams,
  CreateClinicRecordBody,
  UpdateClinicRecordParams,
  UpdateClinicRecordBody,
  DeleteClinicRecordParams,
  InviteClinicPatientBody,
  FinalizeAppointmentMediaBody,
} from "@workspace/api-zod";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  resolveOrBootstrapRole,
  ensureClinicForUser,
  tryLinkPatientInvite,
  getClientIdForPatient,
  isAdminRole,
} from "../lib/clinicRole";
import {
  CLINIC_TABLE_REGISTRY,
  type TableSlug,
} from "../lib/clinicTables";
import { ObjectStorageService } from "../lib/objectStorage";
import { enqueueAppointmentEvent, enqueueWhatsappEvent } from "../lib/whatsapp";

const objectStorageService = new ObjectStorageService();

const router: IRouter = Router();

// All clinic routes require authentication
router.use(requireClinicAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Thrown inside a booking transaction to signal a lost slot race → 409. */
class SlotConflictError extends Error {}

/**
 * Tables that may NEVER be written through the generic /clinic/data routes by
 * anyone (admin or patient). Roles are security-critical and must only ever be
 * created/changed via the configured server helpers (resolveOrBootstrapRole,
 * tryLinkPatientInvite, assignRole) — never via client-driven CRUD.
 */
const GENERIC_WRITE_FORBIDDEN_TABLES = new Set<TableSlug>(["user_roles"]);

// ---------------------------------------------------------------------------
// Column-name mapping utilities
//
// Drizzle tables use camelCase JS property names for columns (e.g.
// `appointmentsTable.clientId`) but the DB columns and all legacy frontend
// field names are snake_case (e.g. `client_id`).  We derive exact mappings
// directly from each table's column metadata so there is no manual list to
// maintain.
//
//   snake → camel : used to map incoming filter/order/body keys → Drizzle props
//   camel → snake : used to map Drizzle result rows → snake_case for responses
// ---------------------------------------------------------------------------

/** Map of { snake_col_name → drizzle_property_name } for a Drizzle table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSnakeToCamelMap(table: any): Record<string, string> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  const map: Record<string, string> = {};
  for (const [camelKey, col] of Object.entries(cols)) {
    map[col.name] = camelKey; // col.name is the DB column name (snake_case)
  }
  return map;
}

/** Map of { drizzle_property_name → snake_col_name } for a Drizzle table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCamelToSnakeMap(table: any): Record<string, string> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  const map: Record<string, string> = {};
  for (const [camelKey, col] of Object.entries(cols)) {
    map[camelKey] = col.name;
  }
  return map;
}

/**
 * Convert an incoming body record (keys may be snake_case OR camelCase) to an
 * object with the exact Drizzle camelCase property names for this table so it
 * can be passed to .values() / .set() without type/runtime errors.
 *
 * Keys that do not correspond to any column on the table are silently dropped
 * (they would cause Drizzle type errors or be ignored anyway).
 */
function bodyToDb(
  input: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
): Record<string, unknown> {
  const snakeToCamel = buildSnakeToCamelMap(table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    // Accept both snake_case and camelCase input keys.
    const camelKey =
      snakeToCamel[k] ?? // already snake_case → map to camel
      (Object.prototype.hasOwnProperty.call(getTableColumns(table), k) ? k : undefined); // already camel
    if (camelKey !== undefined) out[camelKey] = v;
  }
  return out;
}

/**
 * Convert a Drizzle result row (camelCase keys) to a snake_case response
 * object so the legacy frontend receives the field names it expects.
 * Preserves null values; handles nested objects/arrays safely by only
 * converting top-level keys (Drizzle rows are always flat).
 */
function rowToSnake(
  row: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
): Record<string, unknown> {
  const camelToSnake = buildCamelToSnakeMap(table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const snakeKey = camelToSnake[k] ?? k; // fall back to original key if not in map
    out[snakeKey] = v;
  }
  return out;
}

/** Convert all rows (or a single nullable row) in a query result to snake_case. */
function resultToSnake(
  result: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
): unknown {
  if (result === null || result === undefined) return result;
  if (Array.isArray(result)) {
    return result.map((r) =>
      r !== null && typeof r === "object"
        ? rowToSnake(r as Record<string, unknown>, table)
        : r,
    );
  }
  if (typeof result === "object") {
    return rowToSnake(result as Record<string, unknown>, table);
  }
  return result;
}

/** Keep nullable legacy tenant columns compatible without crossing clinics. */
function scopedToClinic(
  table: any,
  baseWhere: SQL | undefined,
  clinicId: string,
): SQL | undefined {
  const clinicColumn = table["clinicId"];
  if (!clinicColumn) return baseWhere;
  const tenantWhere = or(eq(clinicColumn, clinicId), isNull(clinicColumn));
  return baseWhere ? and(baseWhere, tenantWhere) : tenantWhere;
}

// ---------------------------------------------------------------------------
// Query parser — compatibility grammar
//
// filters param: comma-separated tokens; each token is one of:
//   column:op:value   — filter clause (op: eq | neq | ilike | gte | lte | in)
//   limit:N           — integer row limit
//   single:true       — return first row (or null) instead of array
//
// Column names in filter/order params are snake_case (from legacy frontend).
// They are resolved to Drizzle camelCase property names via the table's column
// metadata before being used to build WHERE / ORDER BY clauses.
//
// order param: comma-separated column names; prefix "-" = descending
// ---------------------------------------------------------------------------

interface FilterClause {
  column: string; // snake_case as received; resolved to camel before use
  op: "eq" | "neq" | "ilike" | "gte" | "lte" | "in";
  // For "in": pipe-separated values, e.g. "ativo|concluido"
  value: string;
}

interface ParsedQuery {
  filterClauses: FilterClause[];
  limit: number | undefined;
  single: boolean;
}

const VALID_OPS = new Set(["eq", "neq", "ilike", "gte", "lte", "in"]);

/**
 * Parse ?filters= string.
 * Returns null on any structural error (caller → 400).
 */
function parseFilters(raw: string | undefined): ParsedQuery | null {
  const result: ParsedQuery = { filterClauses: [], limit: undefined, single: false };
  if (!raw) return result;

  const parts = raw.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Special tokens: limit:N and single:true
    const firstColon = trimmed.indexOf(":");
    if (firstColon < 1) return null;
    const key = trimmed.slice(0, firstColon).trim();
    const rest = trimmed.slice(firstColon + 1).trim();

    if (key === "limit") {
      const n = parseInt(rest, 10);
      if (isNaN(n) || n < 1) return null;
      result.limit = n;
      continue;
    }
    if (key === "single") {
      result.single = rest === "true";
      continue;
    }

    // Filter clause: column:op:value
    // Value may itself contain colons (e.g. timestamps), so split at most twice.
    const secondColon = rest.indexOf(":");
    if (secondColon < 1) return null;
    const op = rest.slice(0, secondColon).trim();
    const value = rest.slice(secondColon + 1); // keep as-is including any colons

    // Validate column name — letters, digits, underscores only (snake_case)
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) return null;
    if (!VALID_OPS.has(op)) return null;

    result.filterClauses.push({
      column: key, // stored as-received (snake_case); resolved in buildWhereFromFilters
      op: op as FilterClause["op"],
      value,
    });
  }
  return result;
}

/**
 * Build Drizzle WHERE from parsed filter clauses.
 *
 * Filter column names are snake_case from the frontend. We resolve each name
 * via the table's column metadata (snake DB name → camelCase Drizzle property)
 * before accessing drizzleTable[camelKey]. This means `appointment_date`,
 * `client_id`, `auth_user_id`, etc. all resolve correctly.
 *
 * Returns null when a column can't be resolved (caller → 400).
 *
 * For "in" op: value is pipe-separated (e.g. "ativo|concluido").
 */
function buildWhereFromFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drizzleTable: any,
  clauses: FilterClause[],
): SQL | undefined | null {
  if (clauses.length === 0) return undefined;
  const snakeToCamel = buildSnakeToCamelMap(drizzleTable);
  const conditions: SQL[] = [];
  for (const { column, op, value } of clauses) {
    // Resolve snake_case column name to Drizzle camelCase property
    const camelKey = snakeToCamel[column] ?? column; // also accept camelCase input
    const col = drizzleTable[camelKey];
    if (!col) return null; // unknown column → caller returns 400
    if (op === "eq") conditions.push(eq(col, value));
    else if (op === "neq") conditions.push(ne(col, value));
    else if (op === "ilike") conditions.push(ilike(col, value));
    else if (op === "gte") conditions.push(gte(col, value));
    else if (op === "lte") conditions.push(lte(col, value));
    else if (op === "in") {
      // value is pipe-separated: "ativo|concluido"
      const items = value.split("|").map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return null; // malformed
      if (items.some((item) => item.includes("\0"))) return null;
      conditions.push(inArray(col, items));
    }
  }
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/**
 * Parse ?order= string.
 * Comma-separated column names (snake_case from frontend); "-column" = DESC.
 * Resolves each name to the Drizzle camelCase property before accessing the
 * table object, so `appointment_date`, `created_at`, etc. all work.
 * Returns null on any invalid input.
 */
function parseOrder(
  raw: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drizzleTable: any,
): SQL[] | null {
  if (!raw) return [];
  const snakeToCamel = buildSnakeToCamelMap(drizzleTable);
  const parts = raw.split(",");
  const clauses: SQL[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const isDesc = trimmed.startsWith("-");
    const rawColumn = isDesc ? trimmed.slice(1) : trimmed;
    if (!/^[a-z_][a-z0-9_]*$/.test(rawColumn)) return null;
    const camelKey = snakeToCamel[rawColumn] ?? rawColumn;
    const col = drizzleTable[camelKey];
    if (!col) return null;
    clauses.push(isDesc ? desc(col) : asc(col));
  }
  return clauses;
}

/**
 * Apply parsed order/limit to a query builder, return rows converted to
 * snake_case for the response. Returns first row (or null) when single=true.
 */
async function execQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseQuery: any,
  orderClauses: SQL[],
  limit: number | undefined,
  single: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
): Promise<unknown> {
  let q = baseQuery;
  if (orderClauses.length > 0) q = q.orderBy(...orderClauses);
  if (limit) q = q.limit(limit);
  const rows: unknown[] = await q;
  const converted = (rows as Record<string, unknown>[]).map((r) =>
    rowToSnake(r, table),
  );
  if (single) return converted[0] ?? null;
  return converted;
}

// ---------------------------------------------------------------------------
// GET /clinic/me
// ---------------------------------------------------------------------------
router.get(
  "/clinic/me",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let role = await resolveOrBootstrapRole(userId);

    // If no role yet, try to auto-link via patient invite
    if (role === null) {
      role = await tryLinkPatientInvite(userId);
    }

    const data = GetClinicSessionResponse.parse({ userId, role });
    res.json(data);
  },
);

// ---------------------------------------------------------------------------
// GET /clinic/data/:table
// ---------------------------------------------------------------------------
router.get(
  "/clinic/data/:table",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const paramsResult = ListClinicRecordsParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "Invalid table name" });
      return;
    }
    const tableName = paramsResult.data.table as TableSlug;

    const role = await resolveOrBootstrapRole(userId);
    if (!role) {
      res.status(403).json({ error: "No role assigned" });
      return;
    }
    if (!isAdminRole(role)) {
      res.status(403).json({ error: "Fisioterapeutas e pacientes devem usar operações clínicas controladas" });
      return;
    }
    const context = await ensureClinicForUser(userId, role);
    if (!context) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    // Parse query modifiers
    const rawFilters = Array.isArray(req.query.filters)
      ? (req.query.filters as string[]).join(",")
      : (req.query.filters as string | undefined);
    const rawOrder = req.query.order as string | undefined;

    const parsed = parseFilters(rawFilters);
    if (parsed === null) {
      res.status(400).json({ error: "Invalid filters format" });
      return;
    }
    const { filterClauses, limit, single } = parsed;

    const entry = CLINIC_TABLE_REGISTRY[tableName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drizzleTable = entry.table as any;

    // Build caller WHERE
    const callerWhere = buildWhereFromFilters(drizzleTable, filterClauses);
    if (callerWhere === null) {
      res.status(400).json({ error: "Unknown filter column" });
      return;
    }

    const orderClauses = parseOrder(rawOrder, drizzleTable);
    if (orderClauses === null) {
      res.status(400).json({ error: "Invalid order param" });
      return;
    }

    // -----------------------------------------------------------------------
    // Admin scoping — all WHERE clauses use Drizzle camelCase properties
    // -----------------------------------------------------------------------
    if (isAdminRole(role)) {
      // user_roles: only the current user's own row
      if (tableName === "user_roles") {
        const scopeWhere = eq(drizzleTable["userId"], userId);
        const combinedWhere = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(combinedWhere!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      // session_exercises / session_media: scope through admin's own appointments
      if (tableName === "session_exercises" || tableName === "session_media") {
        const apptRows = await db
          .select({ id: appointmentsTable.id })
          .from(appointmentsTable)
          .where(and(
            eq(appointmentsTable.userId, userId),
            or(eq(appointmentsTable.clinicId, context.clinicId), isNull(appointmentsTable.clinicId)),
          ));
        const apptIds = apptRows.map((a) => a.id);
        if (apptIds.length === 0) {
          res.json(single ? null : []);
          return;
        }
        const scopeWhere = inArray(drizzleTable["appointmentId"], apptIds);
        const combinedWhere = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(combinedWhere!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      // All other admin tables: scope by userId when present
      let authWhere: SQL | undefined;
      if (entry.ownerColumn && drizzleTable["userId"]) {
        authWhere = eq(drizzleTable["userId"], userId);
      }
      authWhere = scopedToClinic(drizzleTable, authWhere, context.clinicId);
      const combinedWhere =
        authWhere && callerWhere
          ? and(authWhere, callerWhere)
          : authWhere ?? callerWhere;
      const q = db.select().from(drizzleTable);
      const qw = combinedWhere ? q.where(combinedWhere) : q;
      res.json(await execQuery(qw, orderClauses, limit, single, drizzleTable));
      return;
    }

    // Physiotherapists can only read patients and clinical records assigned
    // to them. Assignment is checked server-side, never inferred from UI.
    if (role === "physiotherapist") {
      const assignmentRows = await db.select({ clientId: clinicAssignmentsTable.clientId })
        .from(clinicAssignmentsTable)
        .where(and(
          eq(clinicAssignmentsTable.physiotherapistUserId, userId),
          eq(clinicAssignmentsTable.status, "active"),
        ));
      const assignedClientIds = assignmentRows.map((row) => row.clientId);
      if (assignedClientIds.length === 0) {
        res.json(single ? null : []);
        return;
      }
      if (tableName === "clients" || tableName === "appointments" || tableName === "patient_packages" || tableName === "session_plans") {
        const scopedColumn = tableName === "clients" ? drizzleTable["id"] : drizzleTable["clientId"];
        const scopeWhere = inArray(scopedColumn, assignedClientIds);
        const combinedWhere = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(combinedWhere);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }
      if (tableName === "session_exercises" || tableName === "session_media") {
        const assignedAppointments = await db.select({ id: appointmentsTable.id })
          .from(appointmentsTable).where(inArray(appointmentsTable.clientId, assignedClientIds));
        const appointmentIds = assignedAppointments.map((row) => row.id);
        if (appointmentIds.length === 0) {
          res.json(single ? null : []);
          return;
        }
        const scopeWhere = inArray(drizzleTable["appointmentId"], appointmentIds);
        const combinedWhere = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        res.json(await execQuery(db.select().from(drizzleTable).where(combinedWhere), orderClauses, limit, single, drizzleTable));
        return;
      }
      if (tableName === "availability_slots" || tableName === "services") {
        const scopeWhere = eq(drizzleTable["userId"], userId);
        const combinedWhere = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        res.json(await execQuery(db.select().from(drizzleTable).where(combinedWhere), orderClauses, limit, single, drizzleTable));
        return;
      }
      res.status(403).json({ error: "Recurso não disponível para fisioterapeutas" });
      return;
    }

    if (role !== "patient") {
      res.status(403).json({ error: "No valid clinic role" });
      return;
    }
    // -----------------------------------------------------------------------
    // Patient scoping — all WHERE clauses use Drizzle camelCase properties
    // -----------------------------------------------------------------------
    const clientId = await getClientIdForPatient(userId);
    if (!clientId) {
      res.status(403).json({ error: "No linked client found for this patient" });
      return;
    }

    // Fetch the admin userId who owns this client (needed for catalog scoping)
    const [linkedClient] = await db
      .select({ adminUserId: clientsTable.userId })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    const adminUserId = linkedClient?.adminUserId;

    switch (tableName) {
      case "clients": {
        const w = callerWhere
          ? and(eq(drizzleTable["id"], clientId), callerWhere)
          : eq(drizzleTable["id"], clientId);
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "appointments": {
        const scopeWhere = eq(drizzleTable["clientId"], clientId);
        const w = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "patient_packages": {
        const scopeWhere = eq(drizzleTable["clientId"], clientId);
        const w = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "session_plans": {
        const scopeWhere = eq(drizzleTable["clientId"], clientId);
        const w = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "session_exercises":
      case "session_media": {
        const apptRows = await db
          .select({ id: appointmentsTable.id })
          .from(appointmentsTable)
          .where(eq(appointmentsTable.clientId, clientId));
        const apptIds = apptRows.map((a) => a.id);
        if (apptIds.length === 0) {
          res.json(single ? null : []);
          return;
        }
        const scopeWhere = inArray(drizzleTable["appointmentId"], apptIds);
        const w = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "availability_slots": {
        // Scope to the admin who manages this patient's clinic
        let scopeWhere: SQL = eq(drizzleTable["status"], "aberto");
        if (adminUserId) {
          scopeWhere = and(
            scopeWhere,
            eq(drizzleTable["userId"], adminUserId),
          )!;
        }
        const w = callerWhere ? and(scopeWhere, callerWhere) : scopeWhere;
        const q = db.select().from(drizzleTable).where(w!);
        res.json(await execQuery(q, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "services": {
        // Tenant-scoped to the admin who owns this patient's client
        let scopeWhere: SQL | undefined;
        if (adminUserId) {
          scopeWhere = eq(drizzleTable["userId"], adminUserId);
        }
        const w =
          scopeWhere && callerWhere
            ? and(scopeWhere, callerWhere)
            : scopeWhere ?? callerWhere;
        const q = db.select().from(drizzleTable);
        const qw = w ? q.where(w) : q;
        res.json(await execQuery(qw, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "package_templates": {
        // Tenant-scoped to the admin who owns this patient's client
        let scopeWhere: SQL | undefined;
        if (adminUserId) {
          scopeWhere = eq(drizzleTable["userId"], adminUserId);
        }
        const w =
          scopeWhere && callerWhere
            ? and(scopeWhere, callerWhere)
            : scopeWhere ?? callerWhere;
        const q = db.select().from(drizzleTable);
        const qw = w ? q.where(w) : q;
        res.json(await execQuery(qw, orderClauses, limit, single, drizzleTable));
        return;
      }

      case "user_roles":
        res.status(403).json({ error: "Forbidden" });
        return;

      default:
        res.status(403).json({ error: "Forbidden" });
        return;
    }
  },
);

// ---------------------------------------------------------------------------
// Helpers — admin FK ownership checks
// ---------------------------------------------------------------------------

/** Verify that the given clientId belongs to the admin (clients.user_id = adminUserId). */
async function verifyClientOwnership(
  clientId: string,
  adminUserId: string,
  clinicId?: string,
): Promise<boolean> {
  const clinicScope = clinicId
    ? or(eq(clientsTable.clinicId, clinicId), isNull(clientsTable.clinicId))
    : undefined;
  const [row] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.userId, adminUserId), clinicScope))
    .limit(1);
  return !!row;
}

/** Verify that the given appointmentId belongs to the admin (appointments.user_id = adminUserId). */
async function verifyAppointmentOwnership(
  appointmentId: string,
  adminUserId: string,
  clinicId?: string,
): Promise<boolean> {
  const clinicScope = clinicId
    ? or(eq(appointmentsTable.clinicId, clinicId), isNull(appointmentsTable.clinicId))
    : undefined;
  const [row] = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.id, appointmentId),
        eq(appointmentsTable.userId, adminUserId),
        clinicScope,
      ),
    )
    .limit(1);
  return !!row;
}

// ---------------------------------------------------------------------------
// Helpers — sanitise a single admin record and run FK checks.
// Returns the sanitised body (with user_id injected) or throws an error
// response string (caller must return 403).
// ---------------------------------------------------------------------------

async function sanitiseAdminRecord(
  rawInput: Record<string, unknown>,
  tableName: TableSlug,
  entry: { ownerColumn: string | null; table: unknown },
  userId: string,
  clinicId: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  // Convert input (snake_case or camelCase) to Drizzle camelCase property names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = bodyToDb(rawInput, entry.table as any);

  // Force ownership fields using Drizzle camelCase property names
  if (entry.ownerColumn) {
    body["userId"] = userId;
  }
  if ((entry.table as any)["clinicId"]) {
    body["clinicId"] = clinicId;
  }
  if (tableName === "session_media") {
    body["uploadedBy"] = userId;
  }
  // Never let callers set authUserId via the generic route
  delete body["authUserId"];

  // FK ownership checks — read from camelCase body keys
  if (tableName === "appointments" && body["clientId"]) {
    if (!await verifyClientOwnership(body["clientId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "client_id does not belong to you" };
  }

  if ((tableName === "session_media" || tableName === "session_exercises") && body["appointmentId"]) {
    if (!await verifyAppointmentOwnership(body["appointmentId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "appointment_id does not belong to you" };
  }

  if (tableName === "patient_packages" && body["clientId"]) {
    if (!await verifyClientOwnership(body["clientId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "client_id does not belong to you" };
  }

  if (tableName === "session_plans") {
    if (body["clientId"] && !await verifyClientOwnership(body["clientId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "client_id does not belong to you" };
    if (body["appointmentId"] && !await verifyAppointmentOwnership(body["appointmentId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "appointment_id does not belong to you" };
  }

  if (tableName === "availability_slots" && body["appointmentId"]) {
    if (!await verifyAppointmentOwnership(body["appointmentId"] as string, userId, clinicId))
      return { ok: false, status: 403, error: "appointment_id does not belong to you" };
  }

  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// POST /clinic/data/:table
// ---------------------------------------------------------------------------
router.post(
  "/clinic/data/:table",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const paramsResult = CreateClinicRecordParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "Invalid table name" });
      return;
    }
    const tableName = paramsResult.data.table as TableSlug;

    // Roles are never writable through generic CRUD — only via server helpers.
    if (GENERIC_WRITE_FORBIDDEN_TABLES.has(tableName)) {
      res.status(403).json({ error: "This table cannot be modified through the generic API" });
      return;
    }

    // session_media may NEVER be created through the generic route (any role).
    // Media must go through the controlled finalizer POST /clinic/appointments/:id/media,
    // which verifies a DB-backed pending upload before creating session_media.
    if (tableName === "session_media") {
      res.status(403).json({
        error: "session_media must be created via POST /clinic/appointments/:id/media",
      });
      return;
    }

    // Body can be a single object OR an array of objects (bulk insert from BulkSlotsDialog).
    // The generated Zod schema only accepts objects, so we parse manually.
    const rawBody = req.body;
    const isBulk = Array.isArray(rawBody);
    let rawInputs: Record<string, unknown>[];

    if (isBulk) {
      // Validate each element is a plain object
      if (rawBody.length === 0) {
        res.status(400).json({ error: "Empty array" });
        return;
      }
      if (rawBody.length > 500) {
        res.status(400).json({ error: "Bulk insert limit is 500 records" });
        return;
      }
      for (const item of rawBody) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          res.status(400).json({ error: "Each item in bulk array must be a plain object" });
          return;
        }
      }
      rawInputs = rawBody as Record<string, unknown>[];
    } else {
      const bodyResult = CreateClinicRecordBody.safeParse(rawBody);
      if (!bodyResult.success) {
        res.status(400).json({ error: "Invalid request body" });
        return;
      }
      rawInputs = [bodyResult.data as Record<string, unknown>];
    }

    const role = await resolveOrBootstrapRole(userId);
    if (!role) {
      res.status(403).json({ error: "No role assigned" });
      return;
    }
    const context = await ensureClinicForUser(userId, role);
    if (!context) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    // Patients may never bulk-insert
    if (role === "patient" && isBulk) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rawInput = rawInputs[0]!;

    // -----------------------------------------------------------------------
    // Patient write restrictions
    // -----------------------------------------------------------------------
    if (role === "patient") {
      const clientId = await getClientIdForPatient(userId);
      if (!clientId) {
        res.status(403).json({ error: "No linked client found for this patient" });
        return;
      }

      // Patients may NOT create appointments through the generic route.
      // All patient scheduling must go through the atomic POST /clinic/bookings
      // endpoint, which reserves the slot and creates the appointment together.
      if (tableName === "appointments") {
        res.status(403).json({
          error: "Patients must book appointments via POST /clinic/bookings",
        });
        return;
      }

      // session_media is blocked for all roles above (handled by the finalizer).
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // -----------------------------------------------------------------------
    // Admin write path — single or bulk, with per-record FK ownership verification
    // -----------------------------------------------------------------------
    const entry = CLINIC_TABLE_REGISTRY[tableName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drizzleTable = entry.table as any;

    // Sanitise all records first (fail fast on any FK violation before any DB write)
    const sanitisedBodies: Record<string, unknown>[] = [];
    for (const ri of rawInputs) {
      const result = await sanitiseAdminRecord(ri, tableName, entry, userId, context.clinicId);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      sanitisedBodies.push(result.body);
    }

    if (isBulk) {
      // Bulk insert — values() accepts an array; returning() gives all rows
      const inserted = await db
        .insert(drizzleTable)
        .values(sanitisedBodies)
        .returning() as Record<string, unknown>[];
      res.status(201).json(inserted.map((r) => rowToSnake(r, drizzleTable)));
    } else {
      const inserted = await db
        .insert(drizzleTable)
        .values(sanitisedBodies[0]!)
        .returning() as Record<string, unknown>[];
      const row = inserted[0];
      res.status(201).json(row ? rowToSnake(row, drizzleTable) : null);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /clinic/data/:table/:id
// ---------------------------------------------------------------------------
router.patch(
  "/clinic/data/:table/:id",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const paramsResult = UpdateClinicRecordParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const { table: tableName, id } = paramsResult.data;

    // Roles are never writable through generic CRUD — only via server helpers.
    if (GENERIC_WRITE_FORBIDDEN_TABLES.has(tableName as TableSlug)) {
      res.status(403).json({ error: "This table cannot be modified through the generic API" });
      return;
    }

    const bodyResult = UpdateClinicRecordBody.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const rawInput = bodyResult.data as Record<string, unknown>;

    const role = await resolveOrBootstrapRole(userId);
    if (!role) {
      res.status(403).json({ error: "No role assigned" });
      return;
    }
    const context = await ensureClinicForUser(userId, role);
    if (!context) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    // -----------------------------------------------------------------------
    // Patient PATCH
    // -----------------------------------------------------------------------
    if (role === "patient") {
      const clientId = await getClientIdForPatient(userId);
      if (!clientId) {
        res.status(403).json({ error: "No linked client found for this patient" });
        return;
      }

      // ---- appointments: limited field update ----
      if (tableName === "appointments") {
        // Verify the appointment belongs to this patient's linked client.
        const [appt] = await db
          .select({ id: appointmentsTable.id, status: appointmentsTable.status })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.id, id),
              eq(appointmentsTable.clientId, clientId),
            ),
          )
          .limit(1);
        if (!appt) {
          res.status(404).json({ error: "Appointment not found" });
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tbl = CLINIC_TABLE_REGISTRY["appointments"].table as any;
        const dbBody = bodyToDb(rawInput, tbl);

        // ----------------------------------------------------------------
        // Status transition: patients may only check-in to their own
        // appointment (agendado → em_andamento).  No other status change
        // is permitted regardless of what the body contains.
        // ----------------------------------------------------------------
        if ("status" in dbBody) {
          const nextStatus = dbBody["status"];
          if (nextStatus !== "em_andamento") {
            res.status(403).json({
              error: "Patients may only transition status to 'em_andamento'",
            });
            return;
          }
          if (appt.status !== "agendado") {
            res.status(409).json({
              error: `Cannot check in: appointment is already '${appt.status}'`,
            });
            return;
          }
        }

        // ----------------------------------------------------------------
        // Field allowlist — only patient-facing observation/feedback fields
        // and the controlled status transition above are permitted.
        // Immutable fields (ids, FK references, admin fields, dates, etc.)
        // are silently stripped even if present in the body.
        // ----------------------------------------------------------------
        const PATIENT_APPT_ALLOWLIST = new Set([
          "status",        // check-in only — further constrained above
          "painScale",     // pain_scale — 0-10 rating
          "observations",  // observations — notes for the therapist
          "patientNotes",  // patient_notes — personal diary
          "satisfaction",  // satisfaction — session rating
        ]);
        const patientBody: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(dbBody)) {
          if (PATIENT_APPT_ALLOWLIST.has(k)) patientBody[k] = v;
        }
        if (Object.keys(patientBody).length === 0) {
          res.status(400).json({
            error:
              "No writable fields; patients may only update: status (check-in), pain_scale, observations, patient_notes, satisfaction",
          });
          return;
        }
        const updatedRows = await db
          .update(tbl)
          .set(patientBody)
          .where(eq(tbl["id"], id))
          .returning() as Record<string, unknown>[];
        if (!updatedRows[0]) {
          res.status(404).json({ error: "Record not found" });
          return;
        }
        res.json(rowToSnake(updatedRows[0], tbl));
        return;
      }

      // ---- session_exercises: patient completion and performance only ----
      //
      // The patient may mark exercises as done (completed_at toggle) and
      // record how they felt (performance).  All structural fields
      // (appointment_id, name, sets, reps, load, rest_seconds, notes,
      // video_url, order_index) are immutable from the patient side.
      //
      // Ownership is verified by confirming the exercise belongs to an
      // appointment whose client_id matches the patient's linked client.
      if (tableName === "session_exercises") {
        // Resolve exercise → appointment → client ownership in one query.
        const [ex] = await db
          .select({
            id: sessionExercisesTable.id,
            appointmentClientId: appointmentsTable.clientId,
          })
          .from(sessionExercisesTable)
          .innerJoin(
            appointmentsTable,
            eq(sessionExercisesTable.appointmentId, appointmentsTable.id),
          )
          .where(eq(sessionExercisesTable.id, id))
          .limit(1);

        if (!ex) {
          res.status(404).json({ error: "Exercise not found" });
          return;
        }
        if (ex.appointmentClientId !== clientId) {
          res.status(403).json({ error: "Exercise does not belong to your appointments" });
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tbl = CLINIC_TABLE_REGISTRY["session_exercises"].table as any;
        const dbBody = bodyToDb(rawInput, tbl);

        // Strict allowlist — only patient-facing progress fields.
        const PATIENT_EX_ALLOWLIST = new Set([
          "completedAt",  // completed_at — timestamp or null (toggle)
          "performance",  // performance — 'good' | 'neutral' | 'bad' | null
        ]);
        const exBody: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(dbBody)) {
          if (PATIENT_EX_ALLOWLIST.has(k)) exBody[k] = v;
        }
        if (Object.keys(exBody).length === 0) {
          res.status(400).json({
            error:
              "No writable fields; patients may only update: completed_at, performance",
          });
          return;
        }
        const updatedRows = await db
          .update(tbl)
          .set(exBody)
          .where(eq(tbl["id"], id))
          .returning() as Record<string, unknown>[];
        if (!updatedRows[0]) {
          res.status(404).json({ error: "Record not found" });
          return;
        }
        res.json(rowToSnake(updatedRows[0], tbl));
        return;
      }

      // ---- availability_slots: patients may NOT reserve slots directly ----
      // Slot reservation is performed atomically (together with appointment
      // creation) by POST /clinic/bookings. Direct PATCH is forbidden.
      if (tableName === "availability_slots") {
        res.status(403).json({
          error: "Patients must reserve slots via POST /clinic/bookings",
        });
        return;
      }

      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // -----------------------------------------------------------------------
    // Admin PATCH — FK ownership verification on changed FK fields
    // -----------------------------------------------------------------------
    const entry = CLINIC_TABLE_REGISTRY[tableName as TableSlug];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drizzleTable = entry.table as any;
    // Convert incoming body (snake_case or camelCase) to Drizzle camelCase property names
    const body = bodyToDb(rawInput, drizzleTable);
    delete body["id"];

    // Ownership and tenant are immutable through the compatibility API.
    // Cross-clinic transfers must use the audited team transfer operation.
    if (Object.prototype.hasOwnProperty.call(body, "userId") && body["userId"] !== userId) {
      res.status(403).json({ error: "user_id cannot be changed through the generic API" });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, "clinicId") && body["clinicId"] !== context.clinicId) {
      res.status(403).json({ error: "clinic_id cannot be changed through the generic API" });
      return;
    }
    if (entry.ownerColumn && drizzleTable["userId"]) body["userId"] = userId;
    if (drizzleTable["clinicId"]) body["clinicId"] = context.clinicId;
    if (Object.prototype.hasOwnProperty.call(body, "assignedToUserId") && body["assignedToUserId"]) {
      const [member] = await db.select({ id: clinicAssignmentsTable.id })
        .from(clinicAssignmentsTable)
        .where(and(
          eq(clinicAssignmentsTable.physiotherapistUserId, body["assignedToUserId"] as string),
          eq(clinicAssignmentsTable.clinicId, context.clinicId),
          eq(clinicAssignmentsTable.status, "active"),
        ))
        .limit(1);
      if (!member) {
        res.status(403).json({ error: "assigned_to_user_id is not active in this clinic" });
        return;
      }
    }

    // -----------------------------------------------------------------------
    // session_media generic PATCH — caption-only metadata allowlist.
    //
    // The identity of a media record (which object it points at, who uploaded
    // it, and which appointment it belongs to) is IMMUTABLE once finalized.
    // storagePath / uploadedBy / appointmentId / id / createdAt must never
    // change. We only permit editing the human-facing caption.
    // -----------------------------------------------------------------------
    if (tableName === "session_media") {
      // Allowlist uses Drizzle camelCase property names
      const SESSION_MEDIA_ALLOWLIST = new Set(["caption"]);
      const mediaBody: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (SESSION_MEDIA_ALLOWLIST.has(k)) mediaBody[k] = v;
      }
      if (Object.keys(mediaBody).length === 0) {
        res.status(400).json({
          error: "No writable fields; session_media only allows updating: caption",
        });
        return;
      }

      // Scope to media attached to THIS admin's appointments.
      const apptRows = await db
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(eq(appointmentsTable.userId, userId));
      const apptIds = apptRows.map((a) => a.id);
      if (apptIds.length === 0) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      const updatedMedia = await db
        .update(sessionMediaTable)
        .set(mediaBody)
        .where(
          and(
            eq(sessionMediaTable.id, id),
            inArray(sessionMediaTable.appointmentId, apptIds),
          ),
        )
        .returning() as Record<string, unknown>[];
      if (!updatedMedia[0]) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      res.json(rowToSnake(updatedMedia[0], sessionMediaTable));
      return;
    }

    // Prevent setting authUserId on clients via generic route
    if (tableName === "clients") {
      delete body["authUserId"];
    }

    // FK checks for fields being changed — read camelCase keys from body
    if (tableName === "appointments" && body["clientId"]) {
      const ok = await verifyClientOwnership(body["clientId"] as string, userId, context.clinicId);
      if (!ok) {
        res.status(403).json({ error: "client_id does not belong to you" });
        return;
      }
    }

    // session_media is handled above (caption-only); only session_exercises
    // may re-point appointmentId here, subject to ownership verification.
    if (tableName === "session_exercises" && body["appointmentId"]) {
      const ok = await verifyAppointmentOwnership(
        body["appointmentId"] as string,
        userId,
        context.clinicId,
      );
      if (!ok) {
        res.status(403).json({ error: "appointment_id does not belong to you" });
        return;
      }
    }

    if (tableName === "patient_packages" && body["clientId"]) {
      const ok = await verifyClientOwnership(body["clientId"] as string, userId, context.clinicId);
      if (!ok) {
        res.status(403).json({ error: "client_id does not belong to you" });
        return;
      }
    }

    if (tableName === "session_plans") {
      if (body["clientId"]) {
        const ok = await verifyClientOwnership(body["clientId"] as string, userId, context.clinicId);
        if (!ok) {
          res.status(403).json({ error: "client_id does not belong to you" });
          return;
        }
      }
      if (body["appointmentId"]) {
        const ok = await verifyAppointmentOwnership(
          body["appointmentId"] as string,
          userId,
          context.clinicId,
        );
        if (!ok) {
          res.status(403).json({ error: "appointment_id does not belong to you" });
          return;
        }
      }
    }

    if (tableName === "availability_slots" && body["appointmentId"]) {
      const ok = await verifyAppointmentOwnership(
        body["appointmentId"] as string,
        userId,
      );
      if (!ok) {
        res.status(403).json({ error: "appointment_id does not belong to you" });
        return;
      }
    }

    // Scope WHERE: id + userId ownership — use Drizzle camelCase property names
    let whereClause = eq(drizzleTable["id"], id);
    if (entry.ownerColumn && drizzleTable["userId"]) {
      whereClause = and(whereClause, eq(drizzleTable["userId"], userId))!;
    }
    // session_exercises: also scope through admin's appointments.
    // (session_media is handled earlier via the caption-only allowlist.)
    if (tableName === "session_exercises") {
      const apptRows = await db
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(eq(appointmentsTable.userId, userId));
      const apptIds = apptRows.map((a) => a.id);
      if (apptIds.length === 0) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      whereClause = and(
        whereClause,
        inArray(drizzleTable["appointmentId"], apptIds),
      )!;
    }

    const updatedRows = await db
      .update(drizzleTable)
      .set(body)
      .where(whereClause)
      .returning() as Record<string, unknown>[];
    if (!updatedRows[0]) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    if (tableName === "appointments") {
      try {
        const eventType = body["appointmentDate"] || body["appointmentTime"] || body["service"]
          ? "reschedule" as const
          : "appointment_confirmation" as const;
        await enqueueAppointmentEvent(
          context.clinicId,
          updatedRows[0]["id"] as string,
          eventType,
          `generic-update:${JSON.stringify({
            date: updatedRows[0]["appointmentDate"],
            time: updatedRows[0]["appointmentTime"],
            service: updatedRows[0]["service"],
            status: updatedRows[0]["status"],
          })}`,
        );
      } catch (error) {
        req.log.warn({ err: error, appointmentId: id }, "Could not queue WhatsApp appointment update");
      }
    }
    res.json(rowToSnake(updatedRows[0], drizzleTable));
  },
);

// ---------------------------------------------------------------------------
// DELETE /clinic/data/:table/:id
// ---------------------------------------------------------------------------
router.delete(
  "/clinic/data/:table/:id",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const paramsResult = DeleteClinicRecordParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const { table: tableName, id } = paramsResult.data;

    // Roles are never deletable through generic CRUD — only via server helpers.
    if (GENERIC_WRITE_FORBIDDEN_TABLES.has(tableName as TableSlug)) {
      res.status(403).json({ error: "This table cannot be modified through the generic API" });
      return;
    }

    const role = await resolveOrBootstrapRole(userId);
    if (!isAdminRole(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const context = await ensureClinicForUser(userId, role);
    if (!context) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    const entry = CLINIC_TABLE_REGISTRY[tableName as TableSlug];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drizzleTable = entry.table as any;

    let whereClause = eq(drizzleTable["id"], id);
    if (entry.ownerColumn && drizzleTable["userId"]) {
      whereClause = and(whereClause, eq(drizzleTable["userId"], userId))!;
    }
    whereClause = scopedToClinic(drizzleTable, whereClause, context.clinicId)!;
    if (tableName === "session_exercises" || tableName === "session_media") {
      const apptRows = await db
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(and(
          eq(appointmentsTable.userId, userId),
          or(eq(appointmentsTable.clinicId, context.clinicId), isNull(appointmentsTable.clinicId)),
        ));
      const apptIds = apptRows.map((a) => a.id);
      if (apptIds.length === 0) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      whereClause = and(
        whereClause,
        inArray(drizzleTable["appointmentId"], apptIds),
      )!;
    }

    const deletedRows = await db
      .delete(drizzleTable)
      .where(whereClause)
      .returning() as Record<string, unknown>[];
    if (!deletedRows[0]) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    res.sendStatus(204);
  },
);

// ---------------------------------------------------------------------------
// POST /clinic/invitations — invite a patient (admin only)
// ---------------------------------------------------------------------------
router.post(
  "/clinic/invitations",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = await resolveOrBootstrapRole(userId);
    if (!isAdminRole(role)) {
      res
        .status(403)
        .json({ error: "Forbidden: only admins can invite patients" });
      return;
    }

    const parsed = InviteClinicPatientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { clientId, email } = parsed.data;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    // Verify the client exists and belongs to this admin
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.userId, userId)))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (client.authUserId) {
      res
        .status(409)
        .json({ error: "This client already has a linked patient account" });
      return;
    }

    // Check for an existing invite row for this email.
    const [existingInvite] = await db
      .select()
      .from(patientInvitesTable)
      .where(eq(patientInvitesTable.email, email))
      .limit(1);

    if (existingInvite) {
      if (existingInvite.consumedAt) {
        res.status(409).json({ error: "An invitation for this email was already consumed" });
        return;
      }
      // An unconsumed invite exists — only reuse it if it belongs to EXACTLY this
      // admin and this client. Any other combination is a cross-tenant attempt.
      if (existingInvite.adminUserId !== userId || existingInvite.clientId !== clientId) {
        res.status(409).json({
          error: "An invitation for this email already exists for a different client or clinic",
        });
        return;
      }
      // Falls through: same admin + same client → re-send Clerk email below.
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      req.log.error("CLERK_SECRET_KEY not set — cannot send invitation");
      res.status(500).json({ error: "Auth service not configured" });
      return;
    }

    // Insert invite row only if none already exists (idempotent on retry).
    let insertedNewRow = false;
    let inviteId: string | undefined = existingInvite?.id;
    if (!existingInvite) {
      const [newInvite] = await db
        .insert(patientInvitesTable)
        .values({ adminUserId: userId, clientId, email })
        .returning();
      inviteId = newInvite?.id;
      insertedNewRow = true;
    }

    // Send Clerk invitation email — if it fails, clean up any freshly inserted row.
    const clerkResponse = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        public_metadata: { clinicClientId: clientId, role: "patient" },
        notify: true,
      }),
    });

    if (!clerkResponse.ok) {
      const errBody = await clerkResponse.text();
      req.log.error(
        { status: clerkResponse.status, body: errBody },
        "Clerk invitation API failed",
      );

      // Remove the row we just inserted so the admin can retry cleanly.
      // Pre-existing rows (from a previous successful insert) are preserved.
      if (insertedNewRow && inviteId) {
        await db
          .delete(patientInvitesTable)
          .where(eq(patientInvitesTable.id, inviteId));
        req.log.info(
          { inviteId },
          "Cleaned up patient_invites row after Clerk failure",
        );
      }

      res.status(502).json({ error: "Failed to send invitation email" });
      return;
    }

    const context = await ensureClinicForUser(userId, role);
    if (context) {
      try {
        await enqueueWhatsappEvent({
          clinicId: context.clinicId,
          clientId,
          eventType: "invite",
          idempotencyKey: `invite:${clientId}:${inviteId ?? email}`,
          values: { inviteLink: "Use o link do convite recebido por e-mail para entrar no portal." },
        });
      } catch (error) {
        req.log.warn({ err: error, clientId }, "Could not queue WhatsApp invitation");
      }
    }
    req.log.info({ clientId, email }, "Patient invitation created");
    res.status(201).json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// POST /clinic/bookings — patient books an open availability slot
//
// Atomically:
//   1. Verifies the slot exists, is "aberto", belongs to the patient's admin
//   2. Creates a "solicitado" appointment for the patient's linked client
//   3. Reserves the slot (status -> "reservado", appointment_id -> new appt id)
//
// All in a single transaction. If the slot is no longer available, NO
// appointment is created and 409 is returned.
//
// Body: { slotId: string }  (also accepts snake_case slot_id)
// ---------------------------------------------------------------------------
router.post(
  "/clinic/bookings",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = await resolveOrBootstrapRole(userId);
    if (role !== "patient") {
      res.status(403).json({ error: "Only patients can book slots" });
      return;
    }
    const patientContext = await ensureClinicForUser(userId, role);
    if (!patientContext) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    const clientId = await getClientIdForPatient(userId);
    if (!clientId) {
      res.status(403).json({ error: "No linked client found for this patient" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const slotId =
      (body["slotId"] as string | undefined) ??
      (body["slot_id"] as string | undefined);
    if (!slotId || typeof slotId !== "string") {
      res.status(400).json({ error: "slotId is required" });
      return;
    }

    // Load the patient's client to derive name + owning admin
    const [client] = await db
    .select({ name: clientsTable.name, adminUserId: clientsTable.userId, clinicId: clientsTable.clinicId })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) {
      res.status(403).json({ error: "Linked client not found" });
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Load the slot inside the transaction
        const [slot] = await tx
          .select()
          .from(availabilitySlotsTable)
          .where(eq(availabilitySlotsTable.id, slotId))
          .limit(1);

        if (!slot) {
          return { conflict: true as const, reason: "Slot not found" };
        }
        // Slot must belong to the admin who manages this patient
        if (slot.userId !== client.adminUserId) {
          return { conflict: true as const, reason: "Slot does not belong to your clinic" };
        }
        // Slot must currently be open
        if (slot.status !== "aberto") {
          return { conflict: true as const, reason: "Slot is no longer available" };
        }

        // Create the appointment (status "solicitado"), matching slot date/time & admin
        const [appt] = await tx
          .insert(appointmentsTable)
          .values({
            userId: slot.userId,
            clinicId: client.clinicId ?? patientContext.clinicId,
            clientId,
            clientName: client.name,
            appointmentDate: slot.slotDate,
            appointmentTime: slot.startTime,
            service: "Sessão solicitada",
            price: "0",
            status: "solicitado",
            durationMin: 50,
          })
          .returning();

        if (!appt) {
          // Force rollback
          throw new Error("Failed to create appointment");
        }

        // Atomically reserve the slot only if still open (guards against races)
        const reservedSlots = await tx
          .update(availabilitySlotsTable)
          .set({ status: "reservado", appointmentId: appt.id })
          .where(
            and(
              eq(availabilitySlotsTable.id, slotId),
              eq(availabilitySlotsTable.status, "aberto"),
              eq(availabilitySlotsTable.userId, client.adminUserId),
            ),
          )
          .returning();

        if (!reservedSlots[0]) {
          // Lost the race — roll back the appointment insert
          throw new SlotConflictError("Slot was reserved by someone else");
        }

        return { conflict: false as const, appointment: appt, slot: reservedSlots[0] };
      });

      if (result.conflict) {
        res.status(409).json({ error: result.reason });
        return;
      }

      if (result.appointment.clinicId) {
        try {
          await enqueueAppointmentEvent(result.appointment.clinicId, result.appointment.id, "appointment_confirmation");
        } catch (error) {
          req.log.warn({ err: error, appointmentId: result.appointment.id }, "Could not queue WhatsApp booking confirmation");
        }
      }
      res.status(201).json({
        appointment: rowToSnake(result.appointment, appointmentsTable),
        slot: rowToSnake(result.slot, availabilitySlotsTable),
      });
    } catch (err) {
      if (err instanceof SlotConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Booking transaction failed");
      res.status(500).json({ error: "Failed to create booking" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /clinic/appointments/:id/media — controlled media finalizer.
//
// Turns a DB-backed pending upload (created by POST /storage/uploads/request-url)
// into a durable session_media row, so GET /storage/objects/* authorises the
// owning admin AND the linked patient via the session_media → appointment →
// client chain.
//
// Security invariants (all enforced in a single transaction):
//   1. The referenced pending upload must belong to the CALLER (uploader_user_id).
//   2. The pending upload must be unexpired and unconsumed.
//   3. The caller must be authorized for the target appointment:
//        - admin: appointment.user_id === caller
//        - patient: appointment belongs to the caller's linked client
//   4. session_media.uploaded_by is FORCED to the caller (never trusted from body).
//   5. The ACL owner of an arbitrary existing object is NEVER overwritten here.
//
// Body: { storagePath | objectPath: string, mediaType?: string, caption?: string }
// ---------------------------------------------------------------------------

/** Normalise any accepted path form to a leading-slash "/objects/..." path. */
function normaliseObjectPath(raw: string): string | null {
  let objectPath = raw.trim();
  if (objectPath.startsWith("/api/storage")) {
    objectPath = objectPath.slice("/api/storage".length);
  }
  if (objectPath.startsWith("https://storage.googleapis.com/")) {
    objectPath = objectStorageService.normalizeObjectEntityPath(objectPath);
  }
  if (!objectPath.startsWith("/")) {
    objectPath = `/${objectPath}`;
  }
  if (!objectPath.startsWith("/objects/")) return null;
  return objectPath;
}

/** Custom errors so the transaction can map to precise HTTP statuses. */
class MediaFinalizeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * A Drizzle executor: either the top-level `db` or a transaction handle `tx`.
 * Both expose the same `.select()` query surface we need here.
 */
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type MediaAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Authorize a caller to attach media to an appointment.
 *   - admin:   appointments.user_id === userId
 *   - patient: appointments.client_id === the caller's linked clientId
 * Reads the appointment through the supplied executor so it can be called both
 * as a fast pre-check (db) and authoritatively inside the txn (tx).
 */
async function authorizeAppointmentForMedia(
  exec: DbExecutor,
  appointmentId: string,
  role: string,
  userId: string,
  patientClientId: string | null,
  clinicId?: string,
): Promise<MediaAuthResult> {
  const [appt] = await exec
    .select({
      id: appointmentsTable.id,
      userId: appointmentsTable.userId,
      clientId: appointmentsTable.clientId,
    })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.id, appointmentId),
      clinicId
        ? or(eq(appointmentsTable.clinicId, clinicId), isNull(appointmentsTable.clinicId))
        : undefined,
    ))
    .limit(1);
  if (!appt) {
    return { ok: false, status: 404, error: "Appointment not found" };
  }
  if (role === "admin" || role === "owner") {
    if (appt.userId !== userId) {
      return { ok: false, status: 403, error: "Appointment does not belong to you" };
    }
    return { ok: true };
  }
  if (role === "physiotherapist") {
    const [assignment] = appt.clientId
      ? await exec.select({ id: clinicAssignmentsTable.id })
        .from(clinicAssignmentsTable)
        .where(and(
          eq(clinicAssignmentsTable.clientId, appt.clientId),
          eq(clinicAssignmentsTable.physiotherapistUserId, userId),
          eq(clinicAssignmentsTable.status, "active"),
          clinicId ? eq(clinicAssignmentsTable.clinicId, clinicId) : undefined,
        )).limit(1)
      : [];
    if (assignment) return { ok: true };
    return { ok: false, status: 403, error: "Appointment is not assigned to you" };
  }
  // patient
  if (!patientClientId || appt.clientId !== patientClientId) {
    return { ok: false, status: 403, error: "Appointment does not belong to your client" };
  }
  return { ok: true };
}

router.post(
  "/clinic/appointments/:id/media",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = await resolveOrBootstrapRole(userId);
    if (!role) {
      res.status(403).json({ error: "No role assigned" });
      return;
    }
    const context = await ensureClinicForUser(userId, role);
    if (!context) {
      res.status(403).json({ error: "No clinic membership" });
      return;
    }

    const rawId = req.params.id;
    const appointmentId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!appointmentId || typeof appointmentId !== "string") {
      res.status(400).json({ error: "Appointment id is required" });
      return;
    }

    const bodyResult = FinalizeAppointmentMediaBody.safeParse(req.body ?? {});
    if (!bodyResult.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const bodyData = bodyResult.data as Record<string, unknown>;
    const rawObjectPath = bodyData["objectPath"] as string;

    const objectPath = normaliseObjectPath(rawObjectPath);
    if (!objectPath) {
      res.status(400).json({ error: "objectPath must reference an /objects/ entity" });
      return;
    }
    // storage_path stored WITHOUT leading slash to match pending_uploads + storage routes
    const storagePath = objectPath.slice(1);

    const mediaTypeInput = bodyData["mediaType"];
    const mediaType =
      typeof mediaTypeInput === "string" && mediaTypeInput.length > 0
        ? mediaTypeInput
        : "image";
    const captionInput = bodyData["caption"];
    const caption = typeof captionInput === "string" ? captionInput : null;

    // -----------------------------------------------------------------------
    // Fast-fail pre-check: authorize the caller for the target appointment.
    // This is a UX/short-circuit only — the authoritative check is REPEATED
    // inside the transaction (below), immediately before the session_media
    // insert and pending-upload consume, using the transactional connection so
    // a concurrent appointment change cannot slip past the auth window.
    // -----------------------------------------------------------------------
    const patientClientId =
      role === "patient" ? await getClientIdForPatient(userId) : null;
    if (role === "patient" && !patientClientId) {
      res.status(403).json({ error: "No linked client found for this patient" });
      return;
    }

    const preAuth = await authorizeAppointmentForMedia(
      db,
      appointmentId,
      role,
      userId,
      patientClientId,
      context.clinicId,
    );
    if (!preAuth.ok) {
      res.status(preAuth.status).json({ error: preAuth.error });
      return;
    }

    // -----------------------------------------------------------------------
    // Fetch actual GCS metadata and validate content-type + size against
    // the server-side allowlist.  We do NOT trust declared metadata from
    // the pending_uploads row — only the real object metadata counts.
    //
    // If the object fails validation it is DELETED from storage by
    // validateObjectMedia so it can never be read, and we reject the request.
    // We do NOT touch the ACL — ownership is enforced by the pending_uploads
    // binding + session_media chain.
    // -----------------------------------------------------------------------
    let objectFile;
    try {
      objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    } catch {
      res.status(404).json({ error: "Uploaded object not found in storage" });
      return;
    }

    const mediaValidation = await objectStorageService.validateObjectMedia(objectFile);
    if (!mediaValidation.ok) {
      const status =
        mediaValidation.reason === "not_found"
          ? 404
          : mediaValidation.reason === "too_large"
            ? 413
            : mediaValidation.reason === "invalid_type"
              ? 415
              : 422; // metadata_unavailable
      res.status(status).json({ error: mediaValidation.detail });
      return;
    }

    // -----------------------------------------------------------------------
    // Atomic finalize: (re)authorize appointment + verify/consume pending
    // upload + insert session_media, all in one transaction.
    // -----------------------------------------------------------------------
    try {
      const result = await db.transaction(async (tx) => {
        // Idempotency: if this exact storage_path is already recorded on this
        // appointment, return it without touching pending uploads again.
        const [existing] = await tx
          .select()
          .from(sessionMediaTable)
          .where(
            and(
              eq(sessionMediaTable.appointmentId, appointmentId),
              eq(sessionMediaTable.storagePath, storagePath),
            ),
          )
          .limit(1);
        if (existing) {
          return { status: 200 as const, media: existing };
        }

        // Load the pending upload for this path
        const [pending] = await tx
          .select()
          .from(pendingUploadsTable)
          .where(eq(pendingUploadsTable.storagePath, storagePath))
          .limit(1);

        if (!pending) {
          throw new MediaFinalizeError(404, "No pending upload found for this object");
        }
        // Must belong to the caller
        if (pending.uploaderUserId !== userId) {
          throw new MediaFinalizeError(403, "Pending upload does not belong to you");
        }
        // Must be unconsumed
        if (pending.consumedAt) {
          throw new MediaFinalizeError(409, "Upload has already been finalized");
        }
        // Must be unexpired
        if (pending.expiresAt.getTime() <= Date.now()) {
          throw new MediaFinalizeError(410, "Upload has expired");
        }

        // AUTHORITATIVE appointment authorization, repeated here inside the
        // transaction immediately before the insert/consume so it reflects the
        // committed appointment state at write time (not the earlier read).
        const auth = await authorizeAppointmentForMedia(
          tx,
          appointmentId,
          role,
          userId,
          patientClientId,
          context.clinicId,
        );
        if (!auth.ok) {
          throw new MediaFinalizeError(auth.status, auth.error);
        }

        // Insert the durable session_media row (uploaded_by FORCED to caller)
        const [media] = await tx
          .insert(sessionMediaTable)
          .values({
            appointmentId,
            storagePath,
            mediaType,
            caption,
            uploadedBy: userId,
          })
          .returning();

        if (!media) {
          throw new MediaFinalizeError(500, "Failed to create media record");
        }

        // Atomically consume the pending upload (guard: still unconsumed)
        const consumed = await tx
          .update(pendingUploadsTable)
          .set({ consumedAt: new Date(), consumedMediaId: media.id })
          .where(
            and(
              eq(pendingUploadsTable.id, pending.id),
              isNull(pendingUploadsTable.consumedAt),
            ),
          )
          .returning();

        if (!consumed[0]) {
          // Lost a race — force rollback so no session_media leaks
          throw new MediaFinalizeError(409, "Upload has already been finalized");
        }

        return { status: 201 as const, media };
      });

      res.status(result.status).json(rowToSnake(result.media, sessionMediaTable));
    } catch (err) {
      if (err instanceof MediaFinalizeError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Media finalize transaction failed");
      res.status(500).json({ error: "Failed to finalize media" });
    }
  },
);

export default router;
