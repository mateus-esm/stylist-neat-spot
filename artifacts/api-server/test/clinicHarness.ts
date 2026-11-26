import { useTestProviders } from "./providers";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import { pool } from "@workspace/db";
import app from "../src/app";
import { cleanClinicFixtures, seedClinicFixtures } from "./fixtures";

export function useClinicApp() {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve).once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Clinic test server has no TCP address.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await cleanClinicFixtures();
    await seedClinicFixtures();
    useTestProviders(baseUrl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => { server.close(() => resolve()); });
      }
    } finally {
      await pool.end();
    }
  });

  return async (path: string, userId?: string, init?: RequestInit) => {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(userId ? { "x-test-user-id": userId } : {}),
        ...(init?.headers ?? {}),
      },
    });
  };
}

export function body(method: "PATCH" | "POST" | "DELETE", data?: unknown): RequestInit {
  return { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) };
}

export async function expectJson<T = Record<string, unknown>>(response: Response, status = 200): Promise<T> {
  const text = await response.text();
  expect(response.status, `${response.url}: ${text}`).toBe(status);
  return JSON.parse(text) as T;
}
