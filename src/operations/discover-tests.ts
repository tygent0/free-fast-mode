import type { ExecutionContext, Operation } from "../types.js";

export interface DiscoverTestsArgs {
  forPath?: string;
}

export interface DiscoverTestsResult {
  tests: string[];
  suggestedCommand: string;
}

const TEST_PATTERNS = [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/, /^tests?\/.+\.py$/, /test_.+\.py$/];

function isTestFile(filePath: string): boolean {
  return TEST_PATTERNS.some((re) => re.test(filePath));
}

function pickSuggestedCommand(files: string[]): string {
  const hasJs = files.some((f) => /\.[tj]sx?$/.test(f));
  const hasPy = files.some((f) => /\.py$/.test(f));

  if (hasJs && hasPy) {
    return "npm test -- <target> or pytest <target>";
  }
  if (hasJs) {
    return "npm test -- <target>";
  }
  if (hasPy) {
    return "pytest <target>";
  }
  return "run your test runner with a file target";
}

export const discoverTestsOperation: Operation<DiscoverTestsArgs, DiscoverTestsResult> = {
  name: "discover_tests",
  metadata: {
    batchable: false,
    estimatedCost: "medium",
    cacheKey: "discover_tests"
  },
  execute: async (args: DiscoverTestsArgs, context: ExecutionContext): Promise<DiscoverTestsResult> => {
    const tests = context.snapshot.files.filter(isTestFile);
    let filtered = tests;

    if (args.forPath) {
      const stem = args.forPath.replace(/\.[^.]+$/, "").replace(/^src\//, "");
      const narrowed = tests.filter((testPath) => testPath.includes(stem) || stem.includes(testPath.replace(/\.[^.]+$/, "")));
      if (narrowed.length > 0) {
        filtered = narrowed;
      }
    }

    return {
      tests: filtered,
      suggestedCommand: pickSuggestedCommand(filtered)
    };
  }
};
