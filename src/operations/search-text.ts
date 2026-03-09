import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionContext, Operation, SearchMatch } from "../types.js";
import { isLikelyTextFile, readUtf8Safe } from "./fs-utils.js";

const execFileAsync = promisify(execFile);

export interface SearchTextArgs {
  query: string;
  scope?: string[];
  maxResults?: number;
}

export interface SearchTextResult {
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
}

async function searchWithRipgrep(context: ExecutionContext, args: SearchTextArgs): Promise<SearchMatch[] | null> {
  try {
    const scope = args.scope && args.scope.length > 0 ? args.scope : ["."];
    const rgArgs = ["-n", "--no-heading", "--color", "never", args.query, ...scope];
    const { stdout } = await execFileAsync("rg", rgArgs, { cwd: context.repoRoot, timeout: 5000, maxBuffer: 5_000_000 });

    const matches: SearchMatch[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const [filePath, lineNumberRaw, ...rest] = line.split(":");
      if (!filePath) {
        continue;
      }
      const lineNumber = Number(lineNumberRaw);
      const text = rest.join(":");
      matches.push({ filePath, line: Number.isFinite(lineNumber) ? lineNumber : 1, column: 1, text });
    }
    return matches;
  } catch {
    return null;
  }
}

async function searchManually(context: ExecutionContext, args: SearchTextArgs): Promise<SearchMatch[]> {
  const scopePrefixes = args.scope && args.scope.length > 0 ? args.scope : [""];
  const max = Math.max(args.maxResults ?? 100, 1);
  const out: SearchMatch[] = [];

  for (const filePath of context.snapshot.files) {
    if (!isLikelyTextFile(filePath)) {
      continue;
    }
    if (!scopePrefixes.some((prefix) => prefix === "" || filePath.startsWith(prefix))) {
      continue;
    }

    const content = await readUtf8Safe(context.repoRoot, filePath);
    if (!content) {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const currentLine = lines[i] ?? "";
      const column = currentLine.indexOf(args.query);
      if (column >= 0) {
        out.push({ filePath, line: i + 1, column: column + 1, text: currentLine });
        if (out.length >= max) {
          return out;
        }
      }
    }
  }

  return out;
}

export const searchTextOperation: Operation<SearchTextArgs, SearchTextResult> = {
  name: "search_text",
  metadata: {
    batchable: false,
    estimatedCost: "high",
    cacheKey: "search_text"
  },
  execute: async (args: SearchTextArgs, context: ExecutionContext): Promise<SearchTextResult> => {
    const maxResults = Math.max(args.maxResults ?? 100, 1);
    const rgMatches = await searchWithRipgrep(context, args);
    const matches = rgMatches ?? (await searchManually(context, args));
    return {
      query: args.query,
      matches: matches.slice(0, maxResults),
      truncated: matches.length > maxResults
    };
  }
};
