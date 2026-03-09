# Codex Integration Assets

Generate plugin files with:

```bash
ffm plugin scaffold --target codex --out .ffm-plugins
```

Then apply `.ffm-plugins/codex/mcp.json`, `.ffm-plugins/codex/AGENTS.md`, and `.ffm-plugins/codex/skill-free-fast.md`.

Recommended behavior:
- call `ffm_workspace_snapshot` before broad scanning
- use `ffm_read_files_batch` for multi-file reads
- use `ffm_search` with scoped paths
- call `ffm_discover_tests` before test commands
