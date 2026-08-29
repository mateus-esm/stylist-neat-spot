import { vi } from "vitest";

/**
 * The integration suite must never use the developer database by accident.
 * CI/local runs provide a disposable database through this dedicated name.
 */
if (process.env.CLINIC_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.CLINIC_TEST_DATABASE_URL;
}

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers?: Record<string, string | string[] | undefined> }) => {
    const raw = req.headers?.["x-test-user-id"];
    return { userId: Array.isArray(raw) ? raw[0] : raw };
  },
}));