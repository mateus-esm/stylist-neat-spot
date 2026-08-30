import { afterEach, describe, expect, it } from "vitest";
import {
  buildWhatsmiauRequest,
  extractWhatsmiauMessageId,
  parseWhatsmiauDeliveryWebhook,
} from "../src/lib/whatsapp";

const originalEnv = {
  baseUrl: process.env.WHATSMIAU_BASE_URL,
  token: process.env.WHATSMIAU_API_TOKEN,
  instance: process.env.WHATSMIAU_INSTANCE_NAME,
  sendPath: process.env.WHATSMIAU_SEND_PATH,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    WHATSMIAU_BASE_URL: originalEnv.baseUrl,
    WHATSMIAU_API_TOKEN: originalEnv.token,
    WHATSMIAU_INSTANCE_NAME: originalEnv.instance,
    WHATSMIAU_SEND_PATH: originalEnv.sendPath,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Whatsmiau v2 contract", () => {
  it("uses the documented endpoint, apikey header, and non-clinical text-only body", () => {
    process.env.WHATSMIAU_BASE_URL = "https://api.whatsmiau.dev/v2";
    process.env.WHATSMIAU_API_TOKEN = "test-token";
    process.env.WHATSMIAU_INSTANCE_NAME = "Clinic01";
    delete process.env.WHATSMIAU_SEND_PATH;

    const request = buildWhatsmiauRequest({
      phone: "551199998888",
      fallbackText: "Sua sessão será amanhã.",
      idempotencyKey: "appointment_reminder:abc:24",
    });

    expect(request.url).toBe("https://api.whatsmiau.dev/v2/message/sendText/Clinic01");
    expect(request.headers.apikey).toBe("test-token");
    expect(request.headers).not.toHaveProperty("authorization");
    expect(request.body).toEqual({
      number: "551199998888",
      text: "Sua sessão será amanhã.",
    });
    expect(request.body).not.toHaveProperty("eventType");
    expect(request.body).not.toHaveProperty("payload");
  });

  it("accepts the Evolution-compatible key.id response shape", () => {
    expect(extractWhatsmiauMessageId({
      key: { id: "3EB04A2D1F75" },
      message: { conversation: "ignored" },
    })).toBe("3EB04A2D1F75");
    expect(extractWhatsmiauMessageId({ success: true })).toBeNull();
  });

  it("normalizes delivery callbacks and drops message content and chat identifiers", () => {
    const parsed = parseWhatsmiauDeliveryWebhook({
      event: "messages.update",
      instance: "Clinic01",
      date_time: "2030-01-10T14:33:00Z",
      data: {
        messageId: "3EB04A2D1F75",
        remoteJid: "551199998888@s.whatsapp.net",
        status: "DELIVERY_ACK",
        message: { conversation: "clinical content must not persist" },
      },
    });

    expect(parsed).toMatchObject({
      providerMessageId: "3EB04A2D1F75",
      status: "delivered",
      providerPayload: {
        event: "messages.update",
        instance: "Clinic01",
        status: "DELIVERY_ACK",
        messageId: "3EB04A2D1F75",
      },
    });
    expect(parsed?.providerPayload).not.toHaveProperty("remoteJid");
    expect(parsed?.providerPayload).not.toHaveProperty("message");
    expect(parseWhatsmiauDeliveryWebhook({
      event: "messages.update",
      data: { messageId: "id", status: "SENT" },
    })).toBeNull();
  });
});