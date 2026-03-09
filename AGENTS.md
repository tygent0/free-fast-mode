# AGENTS.md

## free-fast-mode conventions

- Prefer `ffm_workspace_snapshot` before broad repository exploration.
- Use `ffm_read_files_batch` instead of multiple one-file reads.
- Use `ffm_search` with `scope` when possible.
- Use `ffm_resolve_related_files` before broad recursive search.
- Prefer `ffm_discover_tests` + `ffm_run_test_target` before full test suites.
- Keep data local and rely on `.ffm-cache` for reusable operation results.
