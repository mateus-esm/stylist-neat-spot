import { describe, expect, it } from "vitest";
import { localReturnPath, protectedRedirect, signInRedirectUrl } from "@/lib/authRedirect";

describe("deep link authentication redirects", () => {
  it("restores protected app links and rejects external redirects", () => {
    expect(localReturnPath("/?solicitacao=abc", "/")).toBe("/?solicitacao=abc");
    expect(localReturnPath("/meu-app?agendar=1", "/")).toBe("/meu-app?agendar=1");
    expect(localReturnPath("//outside.example", "/")).toBe("/");
    expect(localReturnPath("/sign-in", "/")).toBe("/");
  });
  it("preserves the path, query action, and hash", () => {
    expect(protectedRedirect("/meu-app", "?action=confirm_presence&appointment=abc", "#agenda"))
      .toBe("/meu-app?action=confirm_presence&appointment=abc#agenda");
    expect(signInRedirectUrl("/meu-app", "?action=request_cancel&appointment=abc"))
      .toBe("/sign-in?redirect=%2Fmeu-app%3Faction%3Drequest_cancel%26appointment%3Dabc");
  });
});
