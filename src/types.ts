export type FfmMode = "fast" | "balanced" | "safe" | "demo";

export type OperationName =
  | "read_files"
  | "search_text"
  | "find_symbol"
  | "resolve_related_files"
  | "discover_tests"
  | "run_test_target"
  | "summarize_outputs"
  | "workspace_snapshot";

export interface OperationMetadata {
  cacheKey?: string;
  batchable: boolean;
  dedupeKey?: string;
  estimatedCost: "low" | "medium" | "high";
  speculationHints?: string[];
  scope?: string[];
}

export interface Operation<TArgs, TResult> {
  name: OperationName;
  metadata: OperationMetadata;
  execute: (args: TArgs, context: ExecutionContext) => Promise<TResult>;
}

export interface OperationRequest<TArgs = unknown> {
  id?: string;
  name: OperationName;
  args: TArgs;
  metadata?: Partial<OperationMetadata>;
}

export interface OperationResponse<TResult = unknown> {
  name: OperationName;
  data: TResult;
  cacheHit: boolean;
  deduped: boolean;
  durationMs: number;
  warnings: string[];
}

export interface SearchMatch {
  filePath: string;
  line: number;
  column: number;
  text: string;
}

export interface WorkspaceSnapshot {
  repoRoot: string;
  branch: string | null;
  headSha: string | null;
  files: string[];
  changedFiles: string[];
  importantFiles: string[];
  lockfiles: string[];
  testConfigs: string[];
  timestamp: string;
  fingerprint: string;
}

export interface CachedEntry<T = unknown> {
  key: string;
  createdAt: string;
  value: T;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  writes: number;
  path: string;
}

export interface OptimizerState {
  totalOperations: number;
  coalescedOperations: number;
  dedupedOperations: number;
  cacheHits: number;
  speculativePrefetches: number;
  gatedOperations: number;
  warnings: string[];
}

export interface ExecutionContext {
  repoRoot: string;
  mode: FfmMode;
  cache: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
  };
  snapshot: WorkspaceSnapshot;
  logger?: (line: string) => void;
}

export interface BenchmarkMetrics {
  scenario: string;
  mode: "baseline" | "optimized";
  wallClockMs: number;
  toolCalls: number;
  repeatedReadsAvoided: number;
  searchReuse: number;
  targetedTestCommand: boolean;
}
