# Skill: free-fast

When working in a repo with free-fast-mode:
1. Start with `ffm_workspace_snapshot`.
2. Prefer `ffm_read_files_batch` over multiple single reads.
3. Prefer `ffm_search` with explicit `scope`.
4. Resolve likely files with `ffm_resolve_related_files` before recursive scans.
5. Use `ffm_discover_tests` and `ffm_run_test_target` before full suite commands.
