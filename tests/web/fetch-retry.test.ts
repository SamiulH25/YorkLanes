import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTransientFetchError, formatFetchError } from "../../apps/web/src/lib/fetch-retry";

describe("isTransientFetchError", () => {
  it("treats network TypeErrors as transient", () => {
    assert.equal(isTransientFetchError(new TypeError("Failed to fetch")), true);
  });

  it("treats HTTP errors as non-transient", () => {
    assert.equal(isTransientFetchError(new Error("Finance API error: 502")), false);
  });
});

describe("formatFetchError", () => {
  it("replaces browser fetch TypeErrors with a clearer message", () => {
    assert.equal(
      formatFetchError(new TypeError("Failed to fetch")),
      "Could not reach the server. Wait a moment and try again.",
    );
  });
});
