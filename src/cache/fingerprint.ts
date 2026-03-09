import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

export async function fingerprintFile(repoRoot: string, relativePath: string): Promise<string> {
  const fullPath = path.join(repoRoot, relativePath);
  try {
    const info = await stat(fullPath);
    return `${relativePath}:${info.size}:${Math.floor(info.mtimeMs)}`;
  } catch {
    return `${relativePath}:missing`;
  }
}

export function hashStrings(values: string[]): string {
  return createHash("sha1").update(values.sort().join("|"), "utf8").digest("hex");
}
