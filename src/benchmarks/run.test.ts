import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBenchmarks } from "./run.js";

test("benchmark harness generates json and markdown output", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "ffm-bench-"));
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "tmp" }), "utf8");
  await writeFile(path.join(repo, "src", "alpha.ts"), "export const alpha = 1", "utf8");
  await writeFile(path.join(repo, "test", "alpha.test.ts"), "test('a', () => {})", "utf8");

  const out = await runBenchmarks(repo, { iterations: 1 });
  assert.equal(out.metrics.length > 0, true);
  assert.equal(out.jsonPath.endsWith("metrics.json"), true);
  assert.equal(out.markdownPath.endsWith("report.md"), true);
  assert.equal(out.iterations, 1);
});
