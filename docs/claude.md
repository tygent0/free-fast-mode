# Claude Guide

1. Generate Claude plugin files:

```bash
ffm plugin scaffold --target claude --out .ffm-plugins
```

2. Merge/apply `.ffm-plugins/claude/settings.json` into Claude Code settings.
3. Start coding; the MCP server command is embedded in the generated config.

Goal: optimize expensive operations while keeping Claude planning unchanged.
