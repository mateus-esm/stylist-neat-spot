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