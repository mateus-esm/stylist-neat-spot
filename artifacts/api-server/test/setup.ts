import { vi } from "vitest";

/**
 * The integration suite must never use the developer database by accident.
 * CI/local runs provide a disposable database through this dedicated name.
 */
const testUrl = process.env.CLINIC_TEST_DATABASE_URL;
if (!testUrl || !/^\/tmp\/clinic-tests\.[a-zA-Z0-9]+$/.test(new URL(testUrl).searchParams.get("host") ?? "")) {
  throw new Error("Run the API test script to start an isolated PostgreSQL database.");
}
process.env.DATABASE_URL = testUrl;
process.env.LOG_LEVEL = "silent";
delete process.env.CLINIC_INITIAL_ADMIN_EMAIL;
delete process.env.CLINIC_PRODUCTION_OWNER_EMAIL;
delete process.env.WHATSMIAU_BASE_URL;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers?: Record<string, string | string[] | undefined> }) => {
    const raw = req.headers?.["x-test-user-id"];
    return { userId: Array.isArray(raw) ? raw[0] : raw };
  },
}));