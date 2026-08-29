import {
  db,
  clinicsTable,
  userRolesTable,
  clinicMembersTable,
  clinicAssignmentsTable,
  clientsTable,
  appointmentsTable,
  availabilitySlotsTable,
  sessionExercisesTable,
  sessionMediaTable,
  patientPackagesTable,
  sessionPlansTable,
  whatsappConsentsTable,
  whatsappOutboxTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";

export const ids = {
  clinicA: "10000000-0000-4000-8000-000000000001",
  clinicB: "10000000-0000-4000-8000-000000000002",
  clientA: "10000000-0000-4000-8000-000000000011",
  clientUnassigned: "10000000-0000-4000-8000-000000000012",
  clientB: "10000000-0000-4000-8000-000000000021",
  appointmentA: "10000000-0000-4000-8000-000000000031",
  appointmentB: "10000000-0000-4000-8000-000000000032",
  slotA: "10000000-0000-4000-8000-000000000041",
  slotB: "10000000-0000-4000-8000-000000000042",
  exerciseA: "10000000-0000-4000-8000-000000000051",
  exerciseB: "10000000-0000-4000-8000-000000000052",
  mediaA: "10000000-0000-4000-8000-000000000061",
  mediaB: "10000000-0000-4000-8000-000000000062",
  packageA: "10000000-0000-4000-8000-000000000071",
  packageB: "10000000-0000-4000-8000-000000000072",
  planA: "10000000-0000-4000-8000-000000000081",
  planB: "10000000-0000-4000-8000-000000000082",
};

export const users = {
  ownerA: "test-owner-a",
  ownerB: "test-owner-b",
  physioA: "test-physio-a",
  physioB: "test-physio-b",
  patientA: "test-patient-a",
  patientB: "test-patient-b",
};

export async function seedClinicFixtures() {
  await db.insert(clinicsTable).values([
    { id: ids.clinicA, name: "Clinic A isolation test" },
    { id: ids.clinicB, name: "Clinic B isolation test" },
  ]);
  await db.insert(userRolesTable).values([
    { userId: users.ownerA, role: "owner" },
    { userId: users.ownerB, role: "owner" },
    { userId: users.physioA, role: "physiotherapist" },
    { userId: users.physioB, role: "physiotherapist" },
    { userId: users.patientA, role: "patient" },
    { userId: users.patientB, role: "patient" },
  ]);
  await db.insert(clinicMembersTable).values([
    { clinicId: ids.clinicA, userId: users.ownerA, role: "owner", status: "active" },
    { clinicId: ids.clinicA, userId: users.physioA, role: "physiotherapist", status: "active" },
    { clinicId: ids.clinicA, userId: users.patientA, role: "patient", status: "active" },
    { clinicId: ids.clinicB, userId: users.ownerB, role: "owner", status: "active" },
    { clinicId: ids.clinicB, userId: users.physioB, role: "physiotherapist", status: "active" },
    { clinicId: ids.clinicB, userId: users.patientB, role: "patient", status: "active" },
  ]);
  await db.insert(clientsTable).values([
    { id: ids.clientA, userId: users.ownerA, clinicId: ids.clinicA, assignedToUserId: users.physioA, authUserId: users.patientA, name: "Patient A", phone: "+551100000001" },
    { id: ids.clientUnassigned, userId: users.ownerA, clinicId: ids.clinicA, name: "Unassigned A" },
    { id: ids.clientB, userId: users.ownerB, clinicId: ids.clinicB, assignedToUserId: users.physioB, authUserId: users.patientB, name: "Patient B", phone: "+551100000002" },
  ]);
  await db.insert(clinicAssignmentsTable).values([
    { clinicId: ids.clinicA, clientId: ids.clientA, physiotherapistUserId: users.physioA, assignedBy: users.ownerA, status: "active" },
    { clinicId: ids.clinicB, clientId: ids.clientB, physiotherapistUserId: users.physioB, assignedBy: users.ownerB, status: "active" },
  ]);
  await db.insert(appointmentsTable).values([
    { id: ids.appointmentA, userId: users.ownerA, clinicId: ids.clinicA, assignedToUserId: users.physioA, clientId: ids.clientA, clientName: "Patient A", appointmentDate: "2030-01-10", appointmentTime: "09:00", service: "Fisio A", status: "agendado" },
    { id: ids.appointmentB, userId: users.ownerB, clinicId: ids.clinicB, assignedToUserId: users.physioB, clientId: ids.clientB, clientName: "Patient B", appointmentDate: "2030-01-11", appointmentTime: "10:00", service: "Fisio B", status: "agendado" },
  ]);
  await db.insert(availabilitySlotsTable).values([
    { id: ids.slotA, userId: users.ownerA, slotDate: "2030-01-12", startTime: "09:00", endTime: "09:30", status: "aberto" },
    { id: ids.slotB, userId: users.ownerB, slotDate: "2030-01-13", startTime: "10:00", endTime: "10:30", status: "aberto" },
  ]);
  await db.insert(sessionExercisesTable).values([
    { id: ids.exerciseA, appointmentId: ids.appointmentA, name: "Exercise A", sets: 3, reps: "10", orderIndex: 1 },
    { id: ids.exerciseB, appointmentId: ids.appointmentB, name: "Exercise B", sets: 3, reps: "10", orderIndex: 1 },
  ]);
  await db.insert(sessionMediaTable).values([
    { id: ids.mediaA, appointmentId: ids.appointmentA, storagePath: "objects/uploads/isolation-a.jpg", mediaType: "image", uploadedBy: users.ownerA },
    { id: ids.mediaB, appointmentId: ids.appointmentB, storagePath: "objects/uploads/isolation-b.jpg", mediaType: "image", uploadedBy: users.ownerB },
  ]);
  await db.insert(patientPackagesTable).values([
    { id: ids.packageA, userId: users.ownerA, clientId: ids.clientA, name: "Package A" },
    { id: ids.packageB, userId: users.ownerB, clientId: ids.clientB, name: "Package B" },
  ]);
  await db.insert(sessionPlansTable).values([
    { id: ids.planA, userId: users.ownerA, clientId: ids.clientA, appointmentId: ids.appointmentA, weekStart: "2030-01-07", title: "Plan A", content: "A" },
    { id: ids.planB, userId: users.ownerB, clientId: ids.clientB, appointmentId: ids.appointmentB, weekStart: "2030-01-07", title: "Plan B", content: "B" },
  ]);
  await db.insert(whatsappConsentsTable).values([
    { clinicId: ids.clinicA, clientId: ids.clientA, phone: "+551100000001", optedIn: true },
    { clinicId: ids.clinicB, clientId: ids.clientB, phone: "+551100000002", optedIn: true },
  ]);
}

export async function cleanClinicFixtures() {
  await db.delete(whatsappOutboxTable).where(inArray(whatsappOutboxTable.clinicId, [ids.clinicA, ids.clinicB]));
  await db.delete(whatsappConsentsTable).where(inArray(whatsappConsentsTable.clinicId, [ids.clinicA, ids.clinicB]));
  await db.delete(sessionMediaTable).where(inArray(sessionMediaTable.id, [ids.mediaA, ids.mediaB]));
  await db.delete(sessionExercisesTable).where(inArray(sessionExercisesTable.id, [ids.exerciseA, ids.exerciseB]));
  await db.delete(sessionPlansTable).where(inArray(sessionPlansTable.id, [ids.planA, ids.planB]));
  await db.delete(patientPackagesTable).where(inArray(patientPackagesTable.id, [ids.packageA, ids.packageB]));
  await db.delete(availabilitySlotsTable).where(inArray(availabilitySlotsTable.id, [ids.slotA, ids.slotB]));
  await db.delete(appointmentsTable).where(inArray(appointmentsTable.id, [ids.appointmentA, ids.appointmentB]));
  await db.delete(clinicAssignmentsTable).where(inArray(clinicAssignmentsTable.clientId, [ids.clientA, ids.clientB]));
  await db.delete(clientsTable).where(inArray(clientsTable.id, [ids.clientA, ids.clientUnassigned, ids.clientB]));
  await db.delete(clinicMembersTable).where(inArray(clinicMembersTable.clinicId, [ids.clinicA, ids.clinicB]));
  await db.delete(userRolesTable).where(inArray(userRolesTable.userId, Object.values(users)));
  await db.delete(clinicsTable).where(inArray(clinicsTable.id, [ids.clinicA, ids.clinicB]));
}