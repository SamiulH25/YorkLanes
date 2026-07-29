import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleSignInUrl, signOutUrl } from "../../apps/web/src/lib/auth-urls";

describe("auth-urls", () => {
  it("uses same-origin relative paths for browser-facing auth links", () => {
    assert.equal(signOutUrl(), "/api/auth/logout");
    assert.equal(googleSignInUrl(), "/api/auth/google");
    assert.equal(googleSignInUrl("/schedule"), "/api/auth/google?returnTo=%2Fschedule");
    assert.equal(
      googleSignInUrl("/schedule", false),
      "/api/auth/google?returnTo=%2Fschedule&remember=0",
    );
  });
});
