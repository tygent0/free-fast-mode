import path from "node:path";
import { fingerprintFile, hashStrings } from "../cache/fingerprint.js";
import type { ExecutionContext, Operation, WorkspaceSnapshot } from "../types.js";
import { walkRepoFiles } from "./fs-utils.js";
import { getChangedFiles, getGitBranch, getGitHead } from "./git.js";

const IMPORTANT_FILE_PATTERNS = [
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "tsconfig.json",
  "jest.config",
  "vitest.config",
  "pytest.ini",
  "tox.ini",
  ".eslintrc",
  "eslint.config",
  "README"
];

interface WorkspaceSnapshotArgs {
  forceRefresh?: boolean;
}

export const workspaceSnapshotOperation: Operation<WorkspaceSnapshotArgs, WorkspaceSnapshot> = {
  name: "workspace_snapshot",
  metadata: {
    batchable: false,
    dedupeKey: "workspace_snapshot",
    estimatedCost: "medium",
    cacheKey: "workspace_snapshot",
    speculationHints: ["discover_tests", "resolve_related_files"]
  },
  execute: async (args, context: ExecutionContext) => {
    const cached = args.forceRefresh ? null : await context.cache.get<WorkspaceSnapshot>("workspace_snapshot");
    if (cached) {
      return cached;
    }

    const files = await walkRepoFiles(context.repoRoot);
    const branch = await getGitBranch(context.repoRoot);
    const headSha = await getGitHead(context.repoRoot);
    const changedFiles = await getChangedFiles(context.repoRoot);

    const importantFiles = files.filter((file) =>
      IMPORTANT_FILE_PATTERNS.some((pattern) => path.basename(file).includes(pattern))
    );
    const lockfiles = files.filter((file) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock)$/.test(file));
    const testConfigs = files.filter((file) =>
      /(^|\/)(jest\.config\.(js|ts|mjs|cjs)|vitest\.config\.(js|ts|mjs|cjs)|pytest\.ini|tox\.ini|pyproject\.toml)$/.test(
        file
      )
    );

    const fingerprintParts = await Promise.all(
      [...importantFiles, ...lockfiles, ...testConfigs].slice(0, 200).map((f) => fingerprintFile(context.repoRoot, f))
    );

    const fingerprint = hashStrings([
      context.repoRoot,
      branch ?? "no-branch",
      headSha ?? "no-head",
      ...fingerprintParts,
      ...changedFiles
    ]);

    const snapshot: WorkspaceSnapshot = {
      repoRoot: context.repoRoot,
      branch,
      headSha,
      files,
      changedFiles,
      importantFiles,
      lockfiles,
      testConfigs,
      timestamp: new Date().toISOString(),
      fingerprint
    };

    await context.cache.set("workspace_snapshot", snapshot);
    return snapshot;
  }
};
