import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Optimizer } from "./optimizer.js";

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ffm-opt-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "test"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "x", scripts: { test: "node --test" } }), "utf8");
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;", "utf8");
  await writeFile(path.join(root, "src", "b.ts"), "export const b = a + 1;", "utf8");
  await writeFile(path.join(root, "test", "a.test.ts"), "test('a', () => {});", "utf8");
  return root;
}

test("optimizer reuses cached results", async () => {
  const repo = await makeRepo();
  const optimizer = new Optimizer(repo, "fast");

  const one = await optimizer.execute({ name: "search_text", args: { query: "export" } });
  const two = await optimizer.execute({ name: "search_text", args: { query: "export" } });

  assert.equal(one.cacheHit, false);
  assert.equal(two.cacheHit, true);
});

test("optimizer coalesces read file operations in batch", async () => {
  const repo = await makeRepo();
  const optimizer = new Optimizer(repo, "fast");

  const responses = await optimizer.executeBatch([
    { name: "read_files", args: { paths: ["src/a.ts"] } },
    { name: "read_files", args: { paths: ["src/b.ts"] } }
  ]);

  assert.equal(responses.length, 1);
  const status = await optimizer.status();
  assert.equal(status.state.coalescedOperations > 0, true);
});
