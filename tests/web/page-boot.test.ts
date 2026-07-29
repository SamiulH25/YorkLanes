import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("page boot pattern", () => {
  it("loads finance and schedule data on the server like courses", () => {
    const schedulePage = readFileSync(
      resolve("apps/web/src/pages/schedule/index.astro"),
      "utf8",
    );
    const financePage = readFileSync(
      resolve("apps/web/src/pages/finance/index.astro"),
      "utf8",
    );

    assert.match(schedulePage, /fetchSavedSchedules\(cookie\)/);
    assert.match(schedulePage, /schedule-ssr/);
    assert.match(schedulePage, /import "\.\.\/\.\.\/scripts\/schedule-page\.ts"/);

    assert.match(financePage, /fetchFinance\(cookie\)/);
    assert.match(financePage, /finance-ssr/);
    assert.match(financePage, /import "\.\.\/\.\.\/scripts\/finance\.ts"/);
  });
});
