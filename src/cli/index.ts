#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { runBenchmarks } from "../benchmarks/run.js";
import { scaffoldPluginPack } from "../integrations/plugin-pack.js";
import { startMcpServer } from "../mcp/server.js";
import { Optimizer } from "../optimizer/optimizer.js";

function parseBenchIterations(argv: string[]): number | undefined {
  const fromFlag = argv.find((arg) => arg.startsWith("--iterations="));
  if (fromFlag) {
    const value = Number(fromFlag.split("=")[1]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }

  const index = argv.indexOf("--iterations");
  if (index >= 0) {
    const raw = argv[index + 1];
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }

  const envValue = Number(process.env.FFM_BENCH_ITERATIONS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }

  return undefined;
}

type PluginTarget = "claude" | "codex" | "all";
type PluginLauncher = "npx" | "ffm";

function parseStringFlag(argv: string[], key: string): string | undefined {
  const fromEquals = argv.find((arg) => arg.startsWith(`--${key}=`));
  if (fromEquals) {
    return fromEquals.slice(`--${key}=`.length);
  }

  const index = argv.indexOf(`--${key}`);
  if (index >= 0) {
    return argv[index + 1];
  }

  return undefined;
}

function parsePluginTarget(argv: string[]): PluginTarget {
  const value = parseStringFlag(argv, "target");
  if (value === "claude" || value === "codex" || value === "all") {
    return value;
  }
  return "all";
}

function parsePluginLauncher(argv: string[]): PluginLauncher {
  const value = parseStringFlag(argv, "launcher");
  if (value === "ffm" || value === "npx") {
    return value;
  }
  return "npx";
}

function parsePluginOutDir(argv: string[]): string {
  return parseStringFlag(argv, "out") ?? ".ffm-plugins";
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  const commandArgs = process.argv.slice(3);
  const repoRoot = process.cwd();
  const optimizer = new Optimizer(repoRoot, process.env.FFM_MODE === "fast" ? "fast" : "balanced");

  switch (command) {
    case "serve": {
      await startMcpServer(optimizer);
      return;
    }

    case "status": {
      const status = await optimizer.status();
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }

    case "snapshot": {
      const snapshot = await optimizer.refreshSnapshot();
      process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
      return;
    }

    case "bench": {
      const iterations = parseBenchIterations(commandArgs);
      const result = await runBenchmarks(repoRoot, iterations ? { iterations } : undefined);
      process.stdout.write(
        `Benchmarks complete.\nIterations: ${result.iterations}\nJSON: ${path.relative(repoRoot, result.jsonPath)}\nMarkdown: ${path.relative(repoRoot, result.markdownPath)}\n`
      );
      return;
    }

    case "clear-cache": {
      await optimizer.clearCache();
      process.stdout.write("Cache cleared.\n");
      return;
    }

    case "plugin": {
      const sub = commandArgs[0] ?? "scaffold";
      if (sub !== "scaffold") {
        throw new Error(`Unknown plugin subcommand: ${sub}`);
      }

      const args = commandArgs.slice(1);
      const target = parsePluginTarget(args);
      const launcher = parsePluginLauncher(args);
      const outDir = parsePluginOutDir(args);

      const result = await scaffoldPluginPack({
        repoRoot,
        outDir,
        target,
        launcher
      });

      process.stdout.write(
        `${JSON.stringify(
          {
            target: result.target,
            launcher: result.launcher,
            outDir: path.relative(repoRoot, result.outDir),
            files: result.files.map((f) => path.relative(repoRoot, f))
          },
          null,
          2
        )}\n`
      );
      return;
    }

    case "help":
    default: {
      process.stdout.write(
        [
          "ffm commands:",
          "  ffm serve        Start MCP server",
          "  ffm status       Show optimizer/cache state",
          "  ffm snapshot     Refresh and print workspace snapshot",
          "  ffm bench        Run benchmark scenarios (default: 20 iterations per mode)",
          "    --iterations N Optional custom iteration count",
          "  ffm clear-cache  Remove local cache",
          "  ffm plugin scaffold  Generate Claude/Codex plugin bundles",
          "    --target claude|codex|all  Default: all",
          "    --launcher npx|ffm          Default: npx",
          "    --out DIR                   Default: .ffm-plugins",
          ""
        ].join("\n")
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
