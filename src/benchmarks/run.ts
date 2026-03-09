import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { discoverTestsOperation } from "../operations/discover-tests.js";
import { readFilesOperation } from "../operations/read-files.js";
import { resolveRelatedFilesOperation } from "../operations/resolve-related-files.js";
import { runTestTargetOperation } from "../operations/run-test-target.js";
import { searchTextOperation } from "../operations/search-text.js";
import { summarizeOutputsOperation } from "../operations/summarize-outputs.js";
import { workspaceSnapshotOperation } from "../operations/workspace-snapshot.js";
import { Optimizer } from "../optimizer/optimizer.js";
import type { BenchmarkMetrics, ExecutionContext } from "../types.js";

const DEFAULT_ITERATIONS = 20;
const WARMUP_RUNS_PER_SCENARIO_MODE = 1;

interface Scenario {
  name: string;
  description: string;
  runBaseline: (repoRoot: string) => Promise<BenchmarkMetrics>;
  runOptimized: (repoRoot: string) => Promise<BenchmarkMetrics>;
}

interface BenchmarkRun extends BenchmarkMetrics {
  iteration: number;
}

interface NumericStats {
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  stddev: number;
}

interface BenchmarkSummary {
  scenario: string;
  mode: "baseline" | "optimized";
  runs: number;
  wallClockMs: NumericStats;
  toolCalls: NumericStats;
  repeatedReadsAvoided: NumericStats;
  searchReuse: NumericStats;
  targetedTestCommandRate: number;
}

interface PreparedOptimizedContext {
  optimizer: Optimizer;
  files: string[];
  initialOperations: number;
  initialCacheHits: number;
}

const TEST_FILE_RE = /(\.test\.[tj]sx?$|\.spec\.[tj]sx?$|^tests?\/.+\.py$|test_.+\.py$)/;
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py)$/;
const CONFIG_FILE_RE = /(package\.json|tsconfig\.json|pytest\.ini|tox\.ini|\.eslintrc|eslint\.config|vite\.config|vitest\.config|jest\.config)/;
const DEP_FILE_RE = /(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|pyproject\.toml|requirements\.txt|poetry\.lock)/;

function elapsedMs(start: number, end: number): number {
  return Number((end - start).toFixed(3));
}

function pickTestFile(files: string[]): string {
  return files.find((f) => TEST_FILE_RE.test(f)) ?? files.find((f) => CODE_FILE_RE.test(f)) ?? files[0] ?? "";
}

function pickRelatedFiles(files: string[], count = 3): string[] {
  const preferred = ["src/optimizer/optimizer.ts", "src/optimizer/cache-key.ts", "src/types.ts"].filter((p) => files.includes(p));
  const srcCodeFiles = files.filter((f) => f.startsWith("src/") && CODE_FILE_RE.test(f));
  const out: string[] = [...preferred];

  for (const file of srcCodeFiles) {
    if (out.length >= count) {
      break;
    }
    if (!out.includes(file)) {
      out.push(file);
    }
  }

  if (out.length < count) {
    for (const file of files) {
      if (out.length >= count) {
        break;
      }
      if (!out.includes(file)) {
        out.push(file);
      }
    }
  }

  return out.slice(0, count);
}

function pickConfigFiles(files: string[], count = 4): string[] {
  const configs = files.filter((f) => CONFIG_FILE_RE.test(path.basename(f)));
  return (configs.length > 0 ? configs : files).slice(0, count);
}

function pickDependencyFiles(files: string[], count = 4): string[] {
  const deps = files.filter((f) => DEP_FILE_RE.test(path.basename(f)));
  return (deps.length > 0 ? deps : files).slice(0, count);
}

function pickSourceFile(files: string[]): string {
  return files.find((f) => f.startsWith("src/") && CODE_FILE_RE.test(f)) ?? files.find((f) => CODE_FILE_RE.test(f)) ?? files[0] ?? "";
}

async function buildBaselineContext(repoRoot: string): Promise<ExecutionContext> {
  const dummyCache = {
    async get<T>(_key: string): Promise<T | null> {
      return null;
    },
    async set<T>(_key: string, _value: T): Promise<void> {
      return;
    }
  };

  const snapshot = await workspaceSnapshotOperation.execute(
    { forceRefresh: true },
    {
      repoRoot,
      mode: "balanced",
      cache: dummyCache,
      snapshot: {
        repoRoot,
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
    }
  );

  return {
    repoRoot,
    mode: "balanced",
    cache: dummyCache,
    snapshot
  };
}

async function buildOptimizedContext(repoRoot: string): Promise<PreparedOptimizedContext> {
  const optimizer = new Optimizer(repoRoot, "fast");
  await optimizer.clearCache();
  await optimizer.execute({ name: "workspace_snapshot", args: { forceRefresh: true } });
  const status = await optimizer.status();
  return {
    optimizer,
    files: status.snapshot.files,
    initialOperations: status.state.totalOperations,
    initialCacheHits: status.state.cacheHits
  };
}

const scenarios: Scenario[] = [
  {
    name: "debugging_failing_test",
    description: "Discover tests, inspect likely failing test file, resolve related files, choose targeted command.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const tests = await discoverTestsOperation.execute({}, context);
      const firstTest = tests.tests[0] ?? pickTestFile(context.snapshot.files);
      await readFilesOperation.execute({ paths: [firstTest] }, context);
      await readFilesOperation.execute({ paths: [firstTest] }, context);
      await resolveRelatedFilesOperation.execute({ query: firstTest }, context);
      const run = await runTestTargetOperation.execute({ target: firstTest, execute: false }, context);

      const end = performance.now();
      return {
        scenario: "debugging_failing_test",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 5,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: run.command.includes("--") || run.command.includes(".py")
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const tests = await optimizer.execute({ name: "discover_tests", args: {} });
      const firstTest =
        ((tests.data as { tests?: string[] }).tests ?? [])[0] ??
        pickTestFile(prepared.files);

      await optimizer.execute({ name: "read_files", args: { paths: [firstTest] } });
      await optimizer.execute({ name: "read_files", args: { paths: [firstTest] } });
      await optimizer.execute({ name: "resolve_related_files", args: { query: firstTest } });
      const run = await optimizer.execute({ name: "run_test_target", args: { target: firstTest, execute: false } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "debugging_failing_test",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand:
          String((run.data as { command?: string }).command ?? "").includes("--") ||
          String((run.data as { command?: string }).command ?? "").includes(".py")
      };
    }
  },
  {
    name: "reading_multiple_related_files",
    description: "Read a cluster of related source files and summarize output.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const files = pickRelatedFiles(context.snapshot.files, 3);
      const one = await readFilesOperation.execute({ paths: [files[0] ?? ""] }, context);
      const two = await readFilesOperation.execute({ paths: [files[1] ?? ""] }, context);
      const three = await readFilesOperation.execute({ paths: [files[2] ?? ""] }, context);
      await summarizeOutputsOperation.execute({ inputs: [JSON.stringify(one), JSON.stringify(two), JSON.stringify(three)] }, context);

      const end = performance.now();
      return {
        scenario: "reading_multiple_related_files",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 4,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const files = pickRelatedFiles(prepared.files, 3);
      const one = await optimizer.execute({ name: "read_files", args: { paths: [files[0] ?? ""] } });
      const two = await optimizer.execute({ name: "read_files", args: { paths: [files[1] ?? ""] } });
      const three = await optimizer.execute({ name: "read_files", args: { paths: [files[2] ?? ""] } });
      await optimizer.execute({ name: "summarize_outputs", args: { inputs: [JSON.stringify(one.data), JSON.stringify(two.data), JSON.stringify(three.data)] } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "reading_multiple_related_files",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "exploring_unfamiliar_repo",
    description: "Snapshot workspace, search for exports, inspect a small file set.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      await searchTextOperation.execute({ query: "export", maxResults: 50 }, context);
      await readFilesOperation.execute({ paths: context.snapshot.files.slice(0, 6) }, context);

      const end = performance.now();
      return {
        scenario: "exploring_unfamiliar_repo",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 2,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      await optimizer.execute({ name: "search_text", args: { query: "export", maxResults: 50 } });
      const files = prepared.files.slice(0, 6);
      await optimizer.execute({ name: "read_files", args: { paths: files } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "exploring_unfamiliar_repo",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "locating_symbol_usage",
    description: "Find a common symbol/pattern and repeat query to test reuse.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      await searchTextOperation.execute({ query: "function", maxResults: 80 }, context);
      await searchTextOperation.execute({ query: "function", maxResults: 80 }, context);

      const end = performance.now();
      return {
        scenario: "locating_symbol_usage",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 2,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      await optimizer.execute({ name: "search_text", args: { query: "function", maxResults: 80 } });
      await optimizer.execute({ name: "search_text", args: { query: "function", maxResults: 80 } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "locating_symbol_usage",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "config_discovery",
    description: "Locate and inspect repository configuration files.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const configFiles = pickConfigFiles(context.snapshot.files, 4);
      const reads = await readFilesOperation.execute({ paths: configFiles }, context);
      await summarizeOutputsOperation.execute({ inputs: reads.files.map((f) => f.content).slice(0, 4) }, context);

      const end = performance.now();
      return {
        scenario: "config_discovery",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 2,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const configFiles = pickConfigFiles(prepared.files, 4);
      const reads = await optimizer.execute({ name: "read_files", args: { paths: configFiles } });
      const readFiles = (reads.data as { files?: Array<{ content: string }> }).files ?? [];
      await optimizer.execute({
        name: "summarize_outputs",
        args: { inputs: readFiles.map((f) => f.content).slice(0, 4) }
      });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "config_discovery",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "dependency_manifest_scan",
    description: "Read dependency manifests and search for known package references.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const depFiles = pickDependencyFiles(context.snapshot.files, 4);
      await readFilesOperation.execute({ paths: depFiles }, context);
      await searchTextOperation.execute({ query: "dependencies", scope: depFiles, maxResults: 40 }, context);
      await searchTextOperation.execute({ query: "devDependencies", scope: depFiles, maxResults: 40 }, context);

      const end = performance.now();
      return {
        scenario: "dependency_manifest_scan",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 3,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const depFiles = pickDependencyFiles(prepared.files, 4);
      await optimizer.execute({ name: "read_files", args: { paths: depFiles } });
      await optimizer.execute({ name: "search_text", args: { query: "dependencies", scope: depFiles, maxResults: 40 } });
      await optimizer.execute({ name: "search_text", args: { query: "devDependencies", scope: depFiles, maxResults: 40 } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "dependency_manifest_scan",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "related_file_from_error_trace",
    description: "Start from an error-like query and gather likely related files.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const related = await resolveRelatedFilesOperation.execute({ query: "TypeError undefined config" }, context);
      await readFilesOperation.execute({ paths: related.results.slice(0, 4).map((r) => r.path) }, context);

      const end = performance.now();
      return {
        scenario: "related_file_from_error_trace",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 2,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: false
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const related = await optimizer.execute({ name: "resolve_related_files", args: { query: "TypeError undefined config" } });
      const relatedPaths = ((related.data as { results?: Array<{ path: string }> }).results ?? []).slice(0, 4).map((r) => r.path);
      await optimizer.execute({ name: "read_files", args: { paths: relatedPaths } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "related_file_from_error_trace",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand: false
      };
    }
  },
  {
    name: "test_target_selection_for_module",
    description: "Choose a source module, discover likely tests, and build a targeted test command.",
    runBaseline: async (repoRoot) => {
      const context = await buildBaselineContext(repoRoot);
      const start = performance.now();

      const source = pickSourceFile(context.snapshot.files);
      const discovered = await discoverTestsOperation.execute({ forPath: source }, context);
      const run = await runTestTargetOperation.execute({ target: discovered.tests[0] ?? source, execute: false }, context);

      const end = performance.now();
      return {
        scenario: "test_target_selection_for_module",
        mode: "baseline",
        wallClockMs: elapsedMs(start, end),
        toolCalls: 2,
        repeatedReadsAvoided: 0,
        searchReuse: 0,
        targetedTestCommand: run.command.includes("--") || run.command.includes(".py")
      };
    },
    runOptimized: async (repoRoot) => {
      const prepared = await buildOptimizedContext(repoRoot);
      const { optimizer } = prepared;
      const start = performance.now();

      const source = pickSourceFile(prepared.files);
      const discovered = await optimizer.execute({ name: "discover_tests", args: { forPath: source } });
      const target = (discovered.data as { tests?: string[] }).tests?.[0] ?? source;
      const run = await optimizer.execute({ name: "run_test_target", args: { target, execute: false } });

      const end = performance.now();
      const status = await optimizer.status();
      return {
        scenario: "test_target_selection_for_module",
        mode: "optimized",
        wallClockMs: elapsedMs(start, end),
        toolCalls: Math.max(status.state.totalOperations - prepared.initialOperations, 0),
        repeatedReadsAvoided: 0,
        searchReuse: Math.max(status.state.cacheHits - prepared.initialCacheHits, 0),
        targetedTestCommand:
          String((run.data as { command?: string }).command ?? "").includes("--") ||
          String((run.data as { command?: string }).command ?? "").includes(".py")
      };
    }
  }
];

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function stats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, p95: 0, min: 0, max: 0, stddev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((acc, val) => acc + val, 0) / sorted.length;
  const medianIndex = Math.floor(sorted.length / 2);
  const leftMedian = sorted[medianIndex - 1] ?? sorted[medianIndex] ?? 0;
  const rightMedian = sorted[medianIndex] ?? sorted[medianIndex - 1] ?? 0;
  const median =
    sorted.length % 2 === 0 ? (leftMedian + rightMedian) / 2 : rightMedian;
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p95 = sorted[p95Index] ?? 0;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? min;
  const variance = sorted.reduce((acc, val) => acc + (val - mean) ** 2, 0) / sorted.length;

  return {
    mean: round3(mean),
    median: round3(median),
    p95: round3(p95),
    min: round3(min),
    max: round3(max),
    stddev: round3(Math.sqrt(variance))
  };
}

function summarizeRuns(runs: BenchmarkRun[]): BenchmarkSummary[] {
  const groups = new Map<string, BenchmarkRun[]>();

  for (const run of runs) {
    const key = `${run.scenario}:${run.mode}`;
    const existing = groups.get(key) ?? [];
    existing.push(run);
    groups.set(key, existing);
  }

  const out: BenchmarkSummary[] = [];
  for (const group of groups.values()) {
    const sample = group[0]!;
    out.push({
      scenario: sample.scenario,
      mode: sample.mode,
      runs: group.length,
      wallClockMs: stats(group.map((r) => r.wallClockMs)),
      toolCalls: stats(group.map((r) => r.toolCalls)),
      repeatedReadsAvoided: stats(group.map((r) => r.repeatedReadsAvoided)),
      searchReuse: stats(group.map((r) => r.searchReuse)),
      targetedTestCommandRate: round3(group.filter((r) => r.targetedTestCommand).length / group.length)
    });
  }

  return out.sort((a, b) => {
    if (a.scenario === b.scenario) {
      return a.mode.localeCompare(b.mode);
    }
    return a.scenario.localeCompare(b.scenario);
  });
}

function buildComparisonTable(summaries: BenchmarkSummary[]): string[] {
  const rows = [
    "| scenario | baseline_mean_ms | optimized_mean_ms | delta_ms | speedup_pct |",
    "|---|---:|---:|---:|---:|"
  ];

  const byScenario = new Map<string, { baseline?: BenchmarkSummary; optimized?: BenchmarkSummary }>();
  for (const summary of summaries) {
    const item = byScenario.get(summary.scenario) ?? {};
    item[summary.mode] = summary;
    byScenario.set(summary.scenario, item);
  }

  for (const [scenario, value] of byScenario.entries()) {
    if (!value.baseline || !value.optimized) {
      continue;
    }

    const baseline = value.baseline.wallClockMs.mean;
    const optimized = value.optimized.wallClockMs.mean;
    const delta = round3(optimized - baseline);
    const speedup = baseline > 0 ? round3(((baseline - optimized) / baseline) * 100) : 0;

    rows.push(`| ${scenario} | ${baseline} | ${optimized} | ${delta} | ${speedup} |`);
  }

  return rows;
}

function toMarkdown(summaries: BenchmarkSummary[], iterations: number, scenarioCount: number): string {
  const rows = [
    "# free-fast-mode Benchmark Report",
    "",
    `- scenarios: ${scenarioCount}`,
    `- iterations per scenario/mode: ${iterations}`,
    `- warmup runs per scenario/mode (excluded): ${WARMUP_RUNS_PER_SCENARIO_MODE}`,
    `- total measured runs: ${scenarioCount * iterations * 2}`,
    "",
    "## Statistical Summary",
    "",
    "| scenario | mode | runs | mean_ms | median_ms | p95_ms | stddev_ms | min_ms | max_ms | mean_tool_calls | mean_reuse | mean_reads_avoided | target_rate |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  for (const summary of summaries) {
    rows.push(
      `| ${summary.scenario} | ${summary.mode} | ${summary.runs} | ${summary.wallClockMs.mean} | ${summary.wallClockMs.median} | ${summary.wallClockMs.p95} | ${summary.wallClockMs.stddev} | ${summary.wallClockMs.min} | ${summary.wallClockMs.max} | ${summary.toolCalls.mean} | ${summary.searchReuse.mean} | ${summary.repeatedReadsAvoided.mean} | ${summary.targetedTestCommandRate} |`
    );
  }

  rows.push("", "## Baseline vs Optimized (Mean Wall-Clock)", "", ...buildComparisonTable(summaries));
  return rows.join("\n");
}

export async function runBenchmarks(
  repoRoot: string,
  options?: { iterations?: number }
): Promise<{
  jsonPath: string;
  markdownPath: string;
  metrics: BenchmarkMetrics[];
  runs: BenchmarkRun[];
  summaries: BenchmarkSummary[];
  iterations: number;
}> {
  const iterations = Math.max(1, options?.iterations ?? DEFAULT_ITERATIONS);
  const runs: BenchmarkRun[] = [];

  for (const scenario of scenarios) {
    for (let warmup = 0; warmup < WARMUP_RUNS_PER_SCENARIO_MODE; warmup += 1) {
      await scenario.runBaseline(repoRoot);
      await scenario.runOptimized(repoRoot);
    }

    for (let i = 1; i <= iterations; i += 1) {
      const baseline = await scenario.runBaseline(repoRoot);
      runs.push({ ...baseline, iteration: i });

      const optimized = await scenario.runOptimized(repoRoot);
      runs.push({ ...optimized, iteration: i });
    }
  }

  const summaries = summarizeRuns(runs);
  const metrics: BenchmarkMetrics[] = summaries.map((summary) => ({
    scenario: summary.scenario,
    mode: summary.mode,
    wallClockMs: summary.wallClockMs.mean,
    toolCalls: summary.toolCalls.mean,
    repeatedReadsAvoided: summary.repeatedReadsAvoided.mean,
    searchReuse: summary.searchReuse.mean,
    targetedTestCommand: summary.targetedTestCommandRate >= 0.5
  }));

  const outDir = path.join(repoRoot, "benchmarks", "latest");
  await mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "metrics.json");
  const markdownPath = path.join(outDir, "report.md");

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        iterations,
        warmupRunsPerScenarioMode: WARMUP_RUNS_PER_SCENARIO_MODE,
        scenarios: scenarios.map((s) => ({ name: s.name, description: s.description })),
        summaries,
        runs
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(markdownPath, toMarkdown(summaries, iterations, scenarios.length), "utf8");

  return { jsonPath, markdownPath, metrics, runs, summaries, iterations };
}
