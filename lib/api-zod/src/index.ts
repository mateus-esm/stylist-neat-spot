// Re-export the generated zod schemas (values) as the primary public surface.
export * from "./generated/api";

// Re-export the generated TypeScript types. `ListClinicRecordsParams` is
// intentionally omitted here because it collides with the zod schema of the
// same name exported from "./generated/api" (which is the one consumers use).
// Keep this list explicit: generated schemas and TypeScript declarations can
// collide as the OpenAPI spec grows.
export type {
  AppointmentMediaInput,
  ClinicBooking,
  ClinicBookingInput,
  ClinicRecord,
  ClinicRecordInput,
  ClinicRecordList,
  ClinicSession,
  ClinicSessionRole,
  HealthStatus,
  PatientInvite,
  PatientInviteInput,
} from "./generated/types";
