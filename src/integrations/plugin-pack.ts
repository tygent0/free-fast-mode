import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type PluginTarget = "claude" | "codex" | "all";
export type PluginLauncher = "npx" | "ffm";

export interface GeneratedPluginFile {
  path: string;
  content: string;
}

export interface PluginScaffoldOptions {
  repoRoot: string;
  outDir: string;
  target: PluginTarget;
  launcher: PluginLauncher;
}

export interface PluginScaffoldResult {
  outDir: string;
  target: PluginTarget;
  launcher: PluginLauncher;
  files: string[];
}

interface LaunchConfig {
  command: string;
  args: string[];
}

function getLaunchConfig(launcher: PluginLauncher): LaunchConfig {
  if (launcher === "ffm") {
    return { command: "ffm", args: ["serve"] };
  }
  return { command: "npx", args: ["-y", "free-fast-mode", "serve"] };
}

function buildClaudeSettings(launcher: PluginLauncher): string {
  const launch = getLaunchConfig(launcher);
  const payload = {
    mcpServers: {
      "free-fast-mode": {
        command: launch.command,
        args: launch.args
      }
    },
    hooks: {
      session_start: [
        {
          type: "mcp_tool",
          server: "free-fast-mode",
          tool: "ffm_workspace_snapshot",
          arguments: { forceRefresh: true }
        }
      ]
    }
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildCodexMcp(launcher: PluginLauncher): string {
  const launch = getLaunchConfig(launcher);
  return `${JSON.stringify(
    {
      mcpServers: {
        "free-fast-mode": {
          command: launch.command,
          args: launch.args
        }
      }
    },
    null,
    2
  )}\n`;
}

function buildCodexAgents(): string {
  return [
    "# free-fast-mode",
    "",
    "## Workflow",
    "",
    "- Prefer `ffm_workspace_snapshot` before broad repository exploration.",
    "- Use `ffm_read_files_batch` instead of many one-file reads.",
    "- Use `ffm_search` with `scope` whenever possible.",
    "- Use `ffm_resolve_related_files` before recursive searching.",
    "- Use `ffm_discover_tests` + `ffm_run_test_target` before full test suites.",
    "- Keep reusable operation results in `.ffm-cache`."
  ].join("\n");
}

function buildCodexSkill(): string {
  return [
    "# Skill: free-fast-mode",
    "",
    "1. Call `ffm_workspace_snapshot` first.",
    "2. Batch reads with `ffm_read_files_batch`.",
    "3. Scope search with `ffm_search`.",
    "4. Use `ffm_resolve_related_files` before broad scans.",
    "5. Prefer targeted test execution with `ffm_discover_tests` and `ffm_run_test_target`."
  ].join("\n");
}

export function buildPluginFiles(target: PluginTarget, launcher: PluginLauncher): GeneratedPluginFile[] {
  const files: GeneratedPluginFile[] = [];
  const includeClaude = target === "claude" || target === "all";
  const includeCodex = target === "codex" || target === "all";

  if (includeClaude) {
    files.push({
      path: path.join("claude", "settings.json"),
      content: buildClaudeSettings(launcher)
    });
  }

  if (includeCodex) {
    files.push({
      path: path.join("codex", "mcp.json"),
      content: buildCodexMcp(launcher)
    });
    files.push({
      path: path.join("codex", "AGENTS.md"),
      content: `${buildCodexAgents()}\n`
    });
    files.push({
      path: path.join("codex", "skill-free-fast.md"),
      content: `${buildCodexSkill()}\n`
    });
  }

  return files;
}

export async function scaffoldPluginPack(options: PluginScaffoldOptions): Promise<PluginScaffoldResult> {
  const { repoRoot, outDir, target, launcher } = options;
  const absOutDir = path.isAbsolute(outDir) ? outDir : path.join(repoRoot, outDir);
  const files = buildPluginFiles(target, launcher);
  const written: string[] = [];

  for (const file of files) {
    const absPath = path.join(absOutDir, file.path);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, file.content, "utf8");
    written.push(absPath);
  }

  return {
    outDir: absOutDir,
    target,
    launcher,
    files: written
  };
}
