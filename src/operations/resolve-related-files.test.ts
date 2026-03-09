import assert from "node:assert/strict";
import test from "node:test";
import { resolveRelatedFilesOperation } from "./resolve-related-files.js";

test("resolve_related_files ranks basename matches highly", async () => {
  const context = {
    repoRoot: "/tmp/repo",
    mode: "balanced" as const,
    cache: {
      async get<T>(_key: string): Promise<T | null> {
        return null;
      },
      async set<T>(_key: string, _value: T): Promise<void> {
        return;
      }
    },
    snapshot: {
      repoRoot: "/tmp/repo",
      branch: null,
      headSha: null,
      files: ["src/math.ts", "src/user.ts", "test/math.test.ts"],
      changedFiles: [],
      importantFiles: [],
      lockfiles: [],
      testConfigs: [],
      timestamp: new Date().toISOString(),
      fingerprint: "abc"
    }
  };

  const result = await resolveRelatedFilesOperation.execute({ query: "math" }, context);
  assert.equal(result.results.length > 0, true);
  const top = result.results[0];
  assert.equal(Boolean(top && top.path.includes("math")), true);
});
