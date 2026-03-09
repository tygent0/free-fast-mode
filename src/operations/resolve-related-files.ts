import path from "node:path";
import type { ExecutionContext, Operation } from "../types.js";

export interface ResolveRelatedFilesArgs {
  query: string;
  maxResults?: number;
}

export interface ResolveRelatedFile {
  path: string;
  score: number;
  reason: string;
}

export interface ResolveRelatedFilesResult {
  query: string;
  results: ResolveRelatedFile[];
}

function scorePath(query: string, filePath: string): { score: number; reason: string } {
  const file = filePath.toLowerCase();
  const q = query.toLowerCase();
  const base = path.basename(file).toLowerCase();

  if (base === q || base.startsWith(q)) {
    return { score: 0.98, reason: "exact_or_prefix_basename" };
  }
  if (file.includes(q)) {
    return { score: 0.9, reason: "path_contains_query" };
  }

  const normalizedQuery = q.replace(/\.(spec|test)\.[a-z0-9]+$/, "").replace(/[\W_]+/g, "");
  const normalizedBase = base.replace(/\.(spec|test)\.[a-z0-9]+$/, "").replace(/[\W_]+/g, "");
  if (normalizedBase && normalizedBase === normalizedQuery) {
    return { score: 0.84, reason: "same_stem_module_vs_test" };
  }

  if (q.includes("error") && /(config|setup|test|src|main)/.test(file)) {
    return { score: 0.7, reason: "error_context_heuristic" };
  }

  return { score: 0.2, reason: "weak_match" };
}

export const resolveRelatedFilesOperation: Operation<ResolveRelatedFilesArgs, ResolveRelatedFilesResult> = {
  name: "resolve_related_files",
  metadata: {
    batchable: false,
    estimatedCost: "medium",
    cacheKey: "resolve_related_files",
    speculationHints: ["read_files"]
  },
  execute: async (args: ResolveRelatedFilesArgs, context: ExecutionContext): Promise<ResolveRelatedFilesResult> => {
    const maxResults = Math.max(args.maxResults ?? 10, 1);
    const scored = context.snapshot.files
      .map((filePath) => ({ path: filePath, ...scorePath(args.query, filePath) }))
      .filter((row) => row.score > 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return { query: args.query, results: scored };
  }
};
