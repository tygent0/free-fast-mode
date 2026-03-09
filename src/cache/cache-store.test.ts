import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalCacheStore } from "./cache-store.js";

test("LocalCacheStore persists and invalidates by prefix", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "ffm-cache-"));
  const cache = new LocalCacheStore(repoRoot);

  await cache.set("search_text:1", { a: 1 });
  await cache.set("read_files:1", { b: 2 });

  assert.deepEqual(await cache.get("search_text:1"), { a: 1 });

  const removed = await cache.invalidateByPrefixes(["search_text:"]);
  assert.equal(removed, 1);
  assert.equal(await cache.get("search_text:1"), null);
  assert.deepEqual(await cache.get("read_files:1"), { b: 2 });
});
