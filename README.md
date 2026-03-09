# free-fast-mode

[![Stars](https://img.shields.io/github/stars/tygent0/free-fast-mode?style=social)](https://github.com/tygent0/free-fast-mode/stargazers)
[![Forks](https://img.shields.io/github/forks/tygent0/free-fast-mode?style=social)](https://github.com/tygent0/free-fast-mode/network/members)
[![Issues](https://img.shields.io/github/issues/tygent0/free-fast-mode)](https://github.com/tygent0/free-fast-mode/issues)
[![Publish Node.js Package](https://github.com/tygent0/free-fast-mode/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/tygent0/free-fast-mode/actions/workflows/publish-npm.yml)

free-fast-mode is a performance layer for coding agents.

It does not replace agent planning. It accelerates execution of common agent operations with batching, caching, deduplication, speculation, and narrowing.

## What It Optimizes

- reading many files
- text search
- related-file resolution
- test discovery
- targeted test command selection
- output summarization
- workspace snapshot capture

Execution flow:

agent -> operation -> optimizer -> execution -> cache

## Install

No global install is required for plugin use.

```bash
npx -y free-fast-mode plugin scaffold --target all --out .ffm-plugins
```

This generates Claude + Codex plugin bundles in `.ffm-plugins/`.

For local development:

```bash
npm install
npm run build
npm link
```

## CLI

```bash
ffm serve
ffm status
ffm snapshot
ffm bench
ffm clear-cache
ffm plugin scaffold --target all --out .ffm-plugins
```

## MCP Tools

The server exposes:

- `ffm_read_files_batch`
- `ffm_search`
- `ffm_get_cached`
- `ffm_resolve_related_files`
- `ffm_discover_tests`
- `ffm_run_test_target`
- `ffm_summarize_outputs`
- `ffm_workspace_snapshot`

Start server:

```bash
ffm serve
```

Transport is line-delimited JSON-RPC with MCP-style tool semantics.

## Claude Code

Use plugin scaffolding:

```bash
ffm plugin scaffold --target claude --out .ffm-plugins
```

Then apply `.ffm-plugins/claude/settings.json`.

See [docs/claude.md](docs/claude.md).

## Codex

Use plugin scaffolding:

```bash
ffm plugin scaffold --target codex --out .ffm-plugins
```

Then apply:
- `.ffm-plugins/codex/mcp.json`
- `.ffm-plugins/codex/AGENTS.md`
- `.ffm-plugins/codex/skill-free-fast.md`

See [docs/codex.md](docs/codex.md).

## Benchmarks

Run:

```bash
ffm bench
```

Default benchmark behavior:
- runs 8 representative scenarios
- runs each scenario 20 times for `baseline` and 20 times for `optimized`
- reports statistical summaries (mean, median, p95, stddev, min/max)
- optional override: `ffm bench --iterations 5`

Outputs:

- `benchmarks/latest/metrics.json`
- `benchmarks/latest/report.md`

Metrics include wall-clock, tool calls, repeated reads avoided, cache/search reuse, and targeted test selection.

## Examples

- `examples/demo-repo-js`
- `examples/demo-repo-py`

## Current Limitations

- The MCP transport is lightweight and focused on local stdio usage.
- Heuristics for related files are practical but intentionally simple.
- `run_test_target` defaults to command selection and supports optional execution.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tygent0/free-fast-mode&type=Date)](https://www.star-history.com/#tygent0/free-fast-mode&Date)
