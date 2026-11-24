import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { clinicApi } from "@/lib/clinicApi";

afterEach(() => vi.unstubAllGlobals());

describe("clinic browser API contracts", () => {
  it("requests a slot with session credentials and surfaces conflicts", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "Slot is no longer available" }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(clinicApi.createBooking({ slotId: "test-slot" })).rejects.toMatchObject({
      status: 409, message: "Slot is no longer available",
    });
    expect(fetch).toHaveBeenCalledWith("/api/clinic/bookings", expect.objectContaining({
      method: "POST", credentials: "include", body: JSON.stringify({ slotId: "test-slot" }),
    }));
  });

  it("uploads bytes to the signed PUT URL and routes private downloads and deletions through the API", async () => {
    const objectPath = "/objects/uploads/test-file";
    const uploadURL = "https://storage.googleapis.com/test-bucket/signed";
    const file = new File(["synthetic data"], "fixture.png", { type: "image/png" });
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ uploadURL, objectPath }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const media = supabase.storage.from("session-media");
    expect(await media.upload("local-path", file)).toEqual({ data: { path: objectPath }, error: null });
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/storage/uploads/request-url", expect.objectContaining({
      method: "POST", credentials: "include",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, uploadURL, {
      method: "PUT", headers: { "Content-Type": "image/png" }, body: file,
    });
    expect(await media.createSignedUrl(objectPath.slice(1), 3600)).toEqual({
      data: { signedUrl: `/api/storage${objectPath}` }, error: null,
    });
    expect(await media.remove([objectPath.slice(1)])).toEqual({ data: null, error: null });
    expect(fetch).toHaveBeenNthCalledWith(3, `/api/storage${objectPath}`, {
      method: "DELETE", credentials: "include",
    });
  });
});
