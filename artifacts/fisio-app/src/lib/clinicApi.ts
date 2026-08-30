export type PortalData = {
  clinicId: string;
  role: string;
  client: any;
  clients: any[];
  appointments: any[];
  packages: any[];
  plans: any[];
  exercises: any[];
  availableSlots: any[];
};

export type WhatsappEventType = "invite" | "appointment_confirmation" | "appointment_reminder" | "reschedule";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error ?? `Erro ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const clinicApi = {
  portal: () => request<PortalData>("/clinic/portal"),
  appointment: (id: string) => request<any>(`/clinic/portal/appointments/${id}`),
  appointmentAction: (id: string, body: {
    action: "confirm_presence" | "request_reschedule" | "request_cancel";
    confirmed: true;
    idempotencyKey: string;
  }) => request<any>(`/clinic/portal/appointments/${id}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  }),
  consent: (body: { clientId?: string; phone?: string; optedIn: boolean }) =>
    request<any>("/clinic/whatsapp/consent", { method: "POST", body: JSON.stringify(body) }),
  getConsent: (clientId?: string) =>
    request<any>(`/clinic/whatsapp/consent${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
  whatsappConfig: () => request<any>("/clinic/whatsapp/config"),
  updateWhatsappConfig: (body: { enabled?: boolean; reminderHours?: number[]; timezone?: string }) =>
    request<any>("/clinic/whatsapp/config", { method: "PATCH", body: JSON.stringify(body) }),
  connectWhatsappInstance: () =>
    request<any>("/clinic/whatsapp/instance/connect", { method: "POST" }),
  whatsappInstanceStatus: () =>
    request<any>("/clinic/whatsapp/instance/status"),
  disconnectWhatsappInstance: () =>
    request<any>("/clinic/whatsapp/instance/disconnect", { method: "POST" }),
  whatsappTemplates: () => request<{ templates: any[]; variables: Record<WhatsappEventType, string[]> }>("/clinic/whatsapp/templates"),
  createWhatsappTemplate: (body: { key: string; eventType: WhatsappEventType; label: string; body: string; active?: boolean }) =>
    request<any>("/clinic/whatsapp/templates", { method: "POST", body: JSON.stringify(body) }),
  updateWhatsappTemplate: (id: string, body: Partial<{ key: string; eventType: WhatsappEventType; label: string; body: string; active: boolean }>) =>
    request<any>(`/clinic/whatsapp/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deactivateWhatsappTemplate: (id: string) =>
    request<any>(`/clinic/whatsapp/templates/${id}`, { method: "DELETE" }),
  previewWhatsappTemplate: (body: { eventType: WhatsappEventType; body: string }) =>
    request<{ text: string }>("/clinic/whatsapp/templates/preview", { method: "POST", body: JSON.stringify(body) }),
  testWhatsappTemplate: (id: string, body: { clientId: string; values?: Record<string, unknown> }) =>
    request<any>(`/clinic/whatsapp/templates/${id}/test`, { method: "POST", body: JSON.stringify(body) }),
  whatsappOutbox: () => request<any[]>("/clinic/whatsapp/outbox"),
  processWhatsappOutbox: (id: string) =>
    request<any>(`/clinic/whatsapp/outbox/${id}/process`, { method: "POST" }),
  members: () => request<any[]>("/clinic/members"),
  invitations: () => request<any[]>("/clinic/invitations/team"),
  inviteMember: (body: { email: string; role: "admin" | "physiotherapist" }) =>
    request<any>("/clinic/members/invitations", { method: "POST", body: JSON.stringify(body) }),
  updateMember: (id: string, body: { role?: "admin" | "physiotherapist"; status?: "active" | "revoked" }) =>
    request<any>(`/clinic/members/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  assignments: () => request<any[]>("/clinic/assignments"),
  audit: () => request<any[]>("/clinic/audit"),
  assign: (body: { clientId: string; physiotherapistUserId: string | null }) =>
    request<any>("/clinic/assignments", { method: "POST", body: JSON.stringify(body) }),
  transferAppointment: (id: string, physiotherapistUserId: string) =>
    request<any>(`/clinic/appointments/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ physiotherapistUserId }),
    }),
};