import { Readable } from "node:stream";
import { vi } from "vitest";

const objects = new Map<string, {
  bytes: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
}>();
const signedUploads = new Set<string>();

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket(bucketName: string) {
      return {
        file(name: string) {
          const key = `/${bucketName}/${name}`;
          function object() {
            const value = objects.get(key);
            if (!value) throw new Error("Test object not found");
            return value;
          }
          return {
            name,
            exists: async () => [objects.has(key)],
            getMetadata: async () => [{
              size: String(object().bytes.byteLength),
              contentType: object().contentType,
              metadata: object().metadata,
            }],
            setMetadata: async ({ metadata }: { metadata: Record<string, string> }) => {
              object().metadata = metadata;
            },
            createReadStream: () => Readable.from([object().bytes]),
            delete: async () => { objects.delete(key); },
          };
        },
      };
    }
  },
}));

export const clerkEmails = new Map<string, { primary: string; secondary?: string }>();
export const sentInvitations: unknown[] = [];

export function setTestObjectAcl(uploadUrl: string, owner: string, visibility: "public" | "private") {
  const object = objects.get(new URL(uploadUrl).pathname);
  if (!object) throw new Error("Test object not found");
  object.metadata = { "custom:aclPolicy": JSON.stringify({ owner, visibility }) };
}

export function useTestProviders(baseUrl: string) {
  objects.clear();
  signedUploads.clear();
  clerkEmails.clear();
  sentInvitations.length = 0;
  vi.stubEnv("CLERK_SECRET_KEY", "test-clerk-key");
  vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
  vi.stubEnv("PUBLIC_OBJECT_SEARCH_PATHS", "/test-bucket/public");
  const actualFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.origin === baseUrl) return actualFetch(input, init);
    if (url.origin === "https://api.clerk.com") {
      if (req.headers.get("authorization") !== "Bearer test-clerk-key") {
        return new Response(null, { status: 401 });
      }
      if (url.pathname === "/v1/invitations" && req.method === "POST") {
        sentInvitations.push(await req.json());
        return Response.json({ id: "test-clerk-invitation" }, { status: 201 });
      }
      const user = clerkEmails.get(url.pathname.split("/").at(-1) ?? "");
      if (!user) return new Response(null, { status: 404 });
      return Response.json({
        primary_email_address_id: "primary",
        email_addresses: [
          ...(user.secondary ? [{ id: "secondary", email_address: user.secondary }] : []),
          { id: "primary", email_address: user.primary },
        ],
      });
    }
    if (req.url === "http://127.0.0.1:1106/object-storage/signed-object-url" && req.method === "POST") {
      const body = await req.json() as { bucket_name: string; object_name: string; method: string };
      if (body.method !== "PUT") return new Response(null, { status: 400 });
      const signedUrl = `https://storage.googleapis.com/${body.bucket_name}/${body.object_name}?test-signature=put`;
      signedUploads.add(signedUrl);
      return Response.json({ signed_url: signedUrl });
    }
    if (signedUploads.has(req.url) && req.method === "PUT") {
      objects.set(url.pathname, {
        bytes: new Uint8Array(await req.arrayBuffer()),
        contentType: req.headers.get("content-type") ?? "",
      });
      return new Response(null, { status: 200 });
    }
    // Local throwaway servers (e.g. a stub WhatsApp provider bound to an
    // ephemeral port) are part of the test harness, not external traffic.
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return actualFetch(input, init);
    }
    throw new Error(`Unexpected network call in clinic test: ${req.method} ${url.origin}${url.pathname}`);
  });
}
