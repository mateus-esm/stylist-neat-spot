import { describe, expect, it } from "vitest";
import { previewValues, renderWhatsappTemplate, WHATSAPP_VARIABLES } from "../src/lib/whatsapp";

describe("WhatsApp template rendering", () => {
  it("renders only deterministic values and strips control characters", () => {
    expect(renderWhatsappTemplate("Olá, {{patientName}}!", {
      patientName: " Ana\u0000 ",
    })).toBe("Olá, Ana!");
  });

  it("fails explicitly when a placeholder has no value", () => {
    expect(() => renderWhatsappTemplate("Sessão {{appointmentDate}}", {}))
      .toThrow("Variáveis ausentes: appointmentDate");
  });

  it("rejects unresolved or malformed placeholders", () => {
    expect(() => renderWhatsappTemplate("{{patientName}} {{unsupported-value}}", { patientName: "Ana" }))
      .toThrow("Template possui variável inválida: unsupported-value");
  });

  it("keeps preview data operational and free of clinical fields", () => {
    const values = previewValues("appointment_reminder");
    expect(Object.keys(values)).toEqual(WHATSAPP_VARIABLES.appointment_reminder);
    expect(values).not.toHaveProperty("notes");
    expect(values).not.toHaveProperty("healthHistory");
  });
});