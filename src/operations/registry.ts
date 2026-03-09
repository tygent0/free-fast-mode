import type { Operation, OperationName } from "../types.js";
import { discoverTestsOperation } from "./discover-tests.js";
import { findSymbolOperation } from "./find-symbol.js";
import { readFilesOperation } from "./read-files.js";
import { resolveRelatedFilesOperation } from "./resolve-related-files.js";
import { runTestTargetOperation } from "./run-test-target.js";
import { searchTextOperation } from "./search-text.js";
import { summarizeOutputsOperation } from "./summarize-outputs.js";
import { workspaceSnapshotOperation } from "./workspace-snapshot.js";

export const operationRegistry: Record<OperationName, Operation<unknown, unknown>> = {
  read_files: readFilesOperation as Operation<unknown, unknown>,
  search_text: searchTextOperation as Operation<unknown, unknown>,
  find_symbol: findSymbolOperation as Operation<unknown, unknown>,
  resolve_related_files: resolveRelatedFilesOperation as Operation<unknown, unknown>,
  discover_tests: discoverTestsOperation as Operation<unknown, unknown>,
  run_test_target: runTestTargetOperation as Operation<unknown, unknown>,
  summarize_outputs: summarizeOutputsOperation as Operation<unknown, unknown>,
  workspace_snapshot: workspaceSnapshotOperation as Operation<unknown, unknown>
};
