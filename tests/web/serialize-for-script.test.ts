import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseScriptJson,
  serializeForScript,
} from "../../apps/web/src/lib/serialize-for-script";

describe("serializeForScript", () => {
  it("escapes script-breaking sequences in user content", () => {
    const payload = serializeForScript({
      label: 'foo</script><script>alert(1)</script>',
      hint: "line1\u2028line2",
    });

    assert.match(payload, /\\u003c\/script\\u003e/);
    assert.doesNotMatch(payload, /<\/script>/);
    assert.match(payload, /\\u2028/);

    const parsed = parseScriptJson<{ label: string; hint: string }>(payload);
    assert.equal(parsed?.label, 'foo</script><script>alert(1)</script>');
    assert.equal(parsed?.hint, "line1\u2028line2");
  });
});
