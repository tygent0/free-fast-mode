import path from "node:path";
import { LocalCacheStore } from "../cache/cache-store.js";
import { operationRegistry } from "../operations/registry.js";
import { workspaceSnapshotOperation } from "../operations/workspace-snapshot.js";
import type {
  ExecutionContext,
  FfmMode,
  OperationName,
  OperationRequest,
  OperationResponse,
  OptimizerState,
  WorkspaceSnapshot
} from "../types.js";
import { buildCacheKey } from "./cache-key.js";

export class Optimizer {
  private readonly cache: LocalCacheStore;
  private readonly fastModeCacheableOperations = new Set<OperationName>(["search_text", "find_symbol", "workspace_snapshot"]);
  private readonly inFlight = new Map<string, Promise<OperationResponse<unknown>>>();
  private snapshot: WorkspaceSnapshot | null = null;

  private readonly state: OptimizerState = {
    totalOperations: 0,
    coalescedOperations: 0,
    dedupedOperations: 0,
    cacheHits: 0,
    speculativePrefetches: 0,
    gatedOperations: 0,
    warnings: []
  };

  constructor(private readonly repoRoot: string, private readonly mode: FfmMode = "balanced") {
    this.cache = new LocalCacheStore(repoRoot, { persistToDisk: mode !== "fast" });
  }

  async execute<TArgs, TResult>(request: OperationRequest<TArgs>): Promise<OperationResponse<TResult>> {
    const op = operationRegistry[request.name];
    if (!op) {
      throw new Error(`Unknown operation: ${request.name}`);
    }

    this.state.totalOperations += 1;

    const warnings = this.gate(request);
    const snapshot = await this.getSnapshot(false);
    const cacheEnabled = this.shouldUseCache(request.name);
    const cacheKey = cacheEnabled ? request.metadata?.cacheKey ?? op.metadata.cacheKey ?? buildCacheKey(request, snapshot) : null;

    const cached = cacheKey ? await this.cache.get<TResult>(cacheKey) : null;
    if (cached != null) {
      this.state.cacheHits += 1;
      return {
        name: request.name,
        data: cached,
        cacheHit: true,
        deduped: false,
        durationMs: 0,
        warnings
      };
    }

    const dedupeKey = request.metadata?.dedupeKey ?? op.metadata.dedupeKey ?? (cacheKey ?? undefined);
    if (dedupeKey && this.inFlight.has(dedupeKey)) {
      this.state.dedupedOperations += 1;
      const shared = await this.inFlight.get(dedupeKey)!;
      return {
        ...shared,
        data: shared.data as TResult,
        deduped: true,
        warnings: [...shared.warnings, ...warnings]
      };
    }

    const start = Date.now();
    const context = this.makeContext(snapshot);

    const task = (async () => {
      const data = (await op.execute(request.args, context)) as TResult;
      const durationMs = Date.now() - start;
      if (cacheKey) {
        await this.cache.set(cacheKey, data);
      }

      await this.speculate(request, data);

      return {
        name: request.name,
        data,
        cacheHit: false,
        deduped: false,
        durationMs,
        warnings
      } satisfies OperationResponse<TResult>;
    })();

    if (dedupeKey) {
      this.inFlight.set(dedupeKey, task as Promise<OperationResponse<unknown>>);
    }

    try {
      return await task;
    } finally {
      if (dedupeKey) {
        this.inFlight.delete(dedupeKey);
      }
    }
  }

  async executeBatch(requests: OperationRequest[]): Promise<OperationResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    const optimized = this.coalesce(requests);
    const responses: OperationResponse[] = [];
    for (const request of optimized) {
      responses.push(await this.execute(request));
    }
    return responses;
  }

  async status(): Promise<{
    state: OptimizerState;
    cache: ReturnType<LocalCacheStore["getStats"]>;
    snapshot: WorkspaceSnapshot;
  }> {
    const snapshot = await this.getSnapshot(false);
    return {
      state: { ...this.state, warnings: [...this.state.warnings] },
      cache: this.cache.getStats(),
      snapshot
    };
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
    this.snapshot = null;
  }

  async getCached<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  async refreshSnapshot(): Promise<WorkspaceSnapshot> {
    this.snapshot = await this.getSnapshot(true);
    await this.invalidateSensitiveCaches(this.snapshot);
    return this.snapshot;
  }

  private coalesce(requests: OperationRequest[]): OperationRequest[] {
    const readFileRequests = requests.filter((req) => req.name === "read_files");
    if (readFileRequests.length < 2) {
      return requests;
    }

    this.state.coalescedOperations += readFileRequests.length - 1;
    const combinedPaths = new Set<string>();

    for (const req of readFileRequests) {
      const args = req.args as { paths?: string[] };
      for (const p of args.paths ?? []) {
        combinedPaths.add(p);
      }
    }

    const combinedRequest: OperationRequest = {
      name: "read_files",
      args: { paths: [...combinedPaths] }
    };

    return [combinedRequest, ...requests.filter((req) => req.name !== "read_files")];
  }

  private gate(request: OperationRequest): string[] {
    const warnings: string[] = [];
    if (request.name === "search_text") {
      const args = request.args as { query?: string; scope?: string[] };
      const broadQuery = !(args.query ?? "").trim() || (args.query ?? "").trim().length < 2;
      const broadScope = !args.scope || args.scope.length === 0;

      if (broadQuery && broadScope) {
        const message = "Gated broad search: provide a query length >= 2 or set scope.";
        warnings.push(message);
        this.state.gatedOperations += 1;
        this.state.warnings.push(message);
      }
    }
    return warnings;
  }

  private async getSnapshot(forceRefresh: boolean): Promise<WorkspaceSnapshot> {
    if (!forceRefresh && this.snapshot) {
      return this.snapshot;
    }

    const context: ExecutionContext = {
      repoRoot: this.repoRoot,
      mode: this.mode,
      cache: this.cache,
      snapshot: this.snapshot ?? {
        repoRoot: this.repoRoot,
        branch: null,
        headSha: null,
        files: [],
        changedFiles: [],
        importantFiles: [],
        lockfiles: [],
        testConfigs: [],
        timestamp: new Date().toISOString(),
        fingerprint: ""
      }
    };

    this.snapshot = await workspaceSnapshotOperation.execute({ forceRefresh }, context);
    return this.snapshot;
  }

  private makeContext(snapshot: WorkspaceSnapshot): ExecutionContext {
    return {
      repoRoot: this.repoRoot,
      mode: this.mode,
      cache: this.cache,
      snapshot,
      logger: (line: string) => {
        if (this.mode === "demo") {
          this.state.warnings.push(`[log] ${line}`);
        }
      }
    };
  }

  private async speculate(request: OperationRequest, data: unknown): Promise<void> {
    if (this.mode === "fast" || this.mode === "safe") {
      return;
    }
    if (request.name !== "read_files") {
      return;
    }

    const files = (data as { files?: Array<{ path: string }> }).files ?? [];
    if (files.length === 0) {
      return;
    }

    const first = files[0]?.path;
    if (!first) {
      return;
    }
    const stem = path.basename(first).replace(/\.[^.]+$/, "");

    await this.execute({
      name: "resolve_related_files",
      args: { query: stem, maxResults: 5 },
      metadata: { dedupeKey: `speculate:${stem}` }
    });

    this.state.speculativePrefetches += 1;
  }

  private shouldUseCache(name: OperationName): boolean {
    if (this.mode === "fast") {
      return this.fastModeCacheableOperations.has(name);
    }
    return true;
  }

  private async invalidateSensitiveCaches(snapshot: WorkspaceSnapshot): Promise<void> {
    const prefixes: string[] = [];

    if (snapshot.changedFiles.length > 0) {
      prefixes.push("read_files:", "search_text:", "find_symbol:", "summarize_outputs:");
    }
    if (snapshot.lockfiles.length > 0) {
      prefixes.push("discover_tests:", "run_test_target:");
    }
    if (snapshot.testConfigs.length > 0) {
      prefixes.push("discover_tests:", "run_test_target:");
    }

    if (prefixes.length > 0) {
      await this.cache.invalidateByPrefixes(prefixes);
    }
  }
}
