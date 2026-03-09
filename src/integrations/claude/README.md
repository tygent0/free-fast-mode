# Claude Integration Assets

Generate plugin files with:

```bash
ffm plugin scaffold --target claude --out .ffm-plugins
```

Then apply `.ffm-plugins/claude/settings.json` in Claude settings.

Recommended flow:
1. Generate settings bundle via `ffm plugin scaffold`.
2. Register MCP command in Claude settings.
3. Keep hooks for `ffm_workspace_snapshot` and `ffm_summarize_outputs`.

This integration only optimizes execution (cache, dedupe, narrowing).
