# Benchmark Guide

Run:

```bash
ffm bench
```

By default, benchmark runs:
- 8 representative scenarios
- 20 iterations per scenario/mode
- statistical reporting with mean, median, p95, stddev, min/max

Optional custom count:

```bash
ffm bench --iterations 10
```

Scenarios:
- debugging a failing test
- exploring unfamiliar repo
- locating symbol usage
- reading multiple related files

Outputs:
- JSON metrics: `benchmarks/latest/metrics.json`
- Markdown report: `benchmarks/latest/report.md`

No fabricated claims: results are measured from local execution.
