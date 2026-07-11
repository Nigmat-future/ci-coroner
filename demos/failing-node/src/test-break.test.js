import test from "node:test";
import assert from "node:assert/strict";

test("intentional fail", () => {
  assert.equal(1, 2);
});
