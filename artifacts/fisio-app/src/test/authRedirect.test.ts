import { describe, expect, it } from "vitest";
import { protectedRedirect, signInRedirectUrl } from "@/lib/authRedirect";

describe("deep link authentication redirects", () => {
  it("preserves the path, query action, and hash", () => {
    expect(protectedRedirect("/meu-app", "?action=confirm_presence&appointment=abc", "#agenda"))
      .toBe("/meu-app?action=confirm_presence&appointment=abc#agenda");
    expect(signInRedirectUrl("/meu-app", "?action=request_cancel&appointment=abc"))
      .toBe("/sign-in?redirect=%2Fmeu-app%3Faction%3Drequest_cancel%26appointment%3Dabc");
  });
});