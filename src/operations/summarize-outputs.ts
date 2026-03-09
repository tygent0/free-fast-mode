import type { ExecutionContext, Operation } from "../types.js";

export interface SummarizeOutputsArgs {
  inputs: string[];
  maxChars?: number;
}

export interface SummarizeOutputsResult {
  summary: string;
  truncated: boolean;
}

function summarize(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 140) {
    return cleaned;
  }
  return `${cleaned.slice(0, 137)}...`;
}

export const summarizeOutputsOperation: Operation<SummarizeOutputsArgs, SummarizeOutputsResult> = {
  name: "summarize_outputs",
  metadata: {
    batchable: true,
    estimatedCost: "low",
    cacheKey: "summarize_outputs"
  },
  execute: async (args: SummarizeOutputsArgs, _context: ExecutionContext): Promise<SummarizeOutputsResult> => {
    const joined = args.inputs.map(summarize).join("\n");
    const maxChars = Math.max(args.maxChars ?? 1200, 1);
    return {
      summary: joined.slice(0, maxChars),
      truncated: joined.length > maxChars
    };
  }
};
