const appointmentStatuses: Record<string, string> = {
  solicitado: "Aguardando confirmação",
  agendado: "Agendado",
  confirmado: "Confirmado",
  presenca_confirmada: "Presença confirmada",
  em_andamento: "Em andamento",
  atendido: "Concluído",
  faltou: "Não compareceu",
  reagendamento_solicitado: "Reagendamento solicitado",
  cancelamento_solicitado: "Cancelamento solicitado",
  cancelado: "Cancelado",
};

const slotStatuses: Record<string, string> = {
  aberto: "Disponível",
  reservado: "Reservado",
  bloqueado: "Bloqueado",
};

const paymentStatuses: Record<string, string> = {
  pago: "Pago",
  pendente: "Pendente",
  cancelado: "Cancelado",
};

const humanize = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "Sem status";
  return text.replace(/_/g, " ").replace(/^\p{L}/u, (letter) => letter.toUpperCase());
};

export const appointmentStatusLabel = (value: unknown) =>
  appointmentStatuses[String(value)] ?? humanize(value);

export const slotStatusLabel = (value: unknown) =>
  slotStatuses[String(value)] ?? humanize(value);

export const paymentStatusLabel = (value: unknown) =>
  paymentStatuses[String(value)] ?? humanize(value);