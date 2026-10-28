import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceActive } from "../src/activity";
test("only a visible recently used practice page earns time", () => {
  assert.equal(practiceActive("badges", false, 0, 1000), false);
  assert.equal(practiceActive("trail", false, 0, 1000), false);
  assert.equal(practiceActive("practice", true, 0, 1000), false);
  assert.equal(practiceActive("practice", false, 0, 61000), false);
  assert.equal(practiceActive("practice", false, 0, 1000), true);
});
