import test from "node:test";
import assert from "node:assert/strict";
import { sum, divide } from "../src/math.js";

test("sum", () => {
  assert.equal(sum(2, 3), 5);
});

test("divide", () => {
  assert.equal(divide(8, 2), 4);
});
