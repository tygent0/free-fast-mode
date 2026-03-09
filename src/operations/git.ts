import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args], { timeout: 3000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getGitBranch(repoRoot: string): Promise<string | null> {
  return git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function getGitHead(repoRoot: string): Promise<string | null> {
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

export async function getChangedFiles(repoRoot: string): Promise<string[]> {
  const raw = await git(repoRoot, ["status", "--porcelain"]);
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}
