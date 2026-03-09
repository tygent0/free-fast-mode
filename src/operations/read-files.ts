import path from "node:path";
import type { ExecutionContext, Operation } from "../types.js";
import { readUtf8Safe } from "./fs-utils.js";

export interface ReadFilesArgs {
  paths: string[];
}

export interface ReadFilesResult {
  files: Array<{
    path: string;
    content: string;
  }>;
  missing: string[];
}

export const readFilesOperation: Operation<ReadFilesArgs, ReadFilesResult> = {
  name: "read_files",
  metadata: {
    batchable: true,
    estimatedCost: "medium",
    cacheKey: "read_files",
    speculationHints: ["resolve_related_files", "discover_tests"]
  },
  execute: async (args: ReadFilesArgs, context: ExecutionContext): Promise<ReadFilesResult> => {
    const deduped = [
      ...new Set(
        args.paths
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.trim())
          .filter(Boolean)
      )
    ];
    const files: ReadFilesResult["files"] = [];
    const missing: string[] = [];

    for (const relative of deduped) {
      const normalized = path.normalize(relative);
      const content = await readUtf8Safe(context.repoRoot, normalized);
      if (content == null) {
        missing.push(normalized);
      } else {
        files.push({ path: normalized, content });
      }
    }

    return { files, missing };
  }
};
