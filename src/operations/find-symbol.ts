import type { ExecutionContext, Operation } from "../types.js";
import { searchTextOperation, type SearchTextArgs, type SearchTextResult } from "./search-text.js";

export interface FindSymbolArgs {
  symbol: string;
  scope?: string[];
  maxResults?: number;
}

export const findSymbolOperation: Operation<FindSymbolArgs, SearchTextResult> = {
  name: "find_symbol",
  metadata: {
    batchable: false,
    estimatedCost: "high",
    cacheKey: "find_symbol"
  },
  execute: async (args: FindSymbolArgs, context: ExecutionContext): Promise<SearchTextResult> => {
    const query = `\\b${args.symbol}\\b`;
    const converted: SearchTextArgs = {
      query,
      maxResults: args.maxResults ?? 50
    };
    if (args.scope) {
      converted.scope = args.scope;
    }

    return searchTextOperation.execute(converted, context);
  }
};
