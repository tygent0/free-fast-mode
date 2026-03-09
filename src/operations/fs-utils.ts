import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist", ".ffm-cache", ".venv", "__pycache__"]);

export async function walkRepoFiles(repoRoot: string, startDir = ""): Promise<string[]> {
  const base = path.join(repoRoot, startDir);
  const entries = await readdir(base, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) {
      continue;
    }
    const relativePath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkRepoFiles(repoRoot, relativePath)));
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

export async function readUtf8Safe(repoRoot: string, relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(repoRoot, relativePath);
    return await readFile(fullPath, "utf8");
  } catch {
    return null;
  }
}

export function isLikelyTextFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs") ||
    lower.endsWith(".json") ||
    lower.endsWith(".md") ||
    lower.endsWith(".py") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".ini") ||
    lower.endsWith(".cfg")
  );
}
