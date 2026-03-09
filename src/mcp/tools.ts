import type { OperationRequest } from "../types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "ffm_read_files_batch",
    description: "Read multiple files in one batched operation.",
    inputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } } }, required: ["paths"] }
  },
  {
    name: "ffm_search",
    description: "Search text with cache-aware execution.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        scope: { type: "array", items: { type: "string" } },
        maxResults: { type: "number" }
      },
      required: ["query"]
    }
  },
  {
    name: "ffm_get_cached",
    description: "Read a cached entry by key.",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] }
  },
  {
    name: "ffm_resolve_related_files",
    description: "Resolve likely related files for a query.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "number" } }, required: ["query"] }
  },
  {
    name: "ffm_discover_tests",
    description: "Discover tests and suggested targeted command.",
    inputSchema: { type: "object", properties: { forPath: { type: "string" } } }
  },
  {
    name: "ffm_run_test_target",
    description: "Select or run a targeted test command.",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" }, execute: { type: "boolean" } }
    }
  },
  {
    name: "ffm_summarize_outputs",
    description: "Summarize operation outputs concisely.",
    inputSchema: {
      type: "object",
      properties: { inputs: { type: "array", items: { type: "string" } }, maxChars: { type: "number" } },
      required: ["inputs"]
    }
  },
  {
    name: "ffm_workspace_snapshot",
    description: "Generate current workspace snapshot.",
    inputSchema: { type: "object", properties: { forceRefresh: { type: "boolean" } } }
  }
];

export function toOperationRequest(toolName: string, args: Record<string, unknown>): OperationRequest | null {
  switch (toolName) {
    case "ffm_read_files_batch":
      return { name: "read_files", args: { paths: args.paths ?? [] } };
    case "ffm_search":
      return {
        name: "search_text",
        args: {
          query: args.query ?? "",
          scope: args.scope,
          maxResults: args.maxResults
        }
      };
    case "ffm_resolve_related_files":
      return { name: "resolve_related_files", args: { query: args.query ?? "", maxResults: args.maxResults } };
    case "ffm_discover_tests":
      return { name: "discover_tests", args: { forPath: args.forPath } };
    case "ffm_run_test_target":
      return { name: "run_test_target", args: { target: args.target, execute: args.execute } };
    case "ffm_summarize_outputs":
      return { name: "summarize_outputs", args: { inputs: args.inputs ?? [], maxChars: args.maxChars } };
    case "ffm_workspace_snapshot":
      return { name: "workspace_snapshot", args: { forceRefresh: args.forceRefresh } };
    default:
      return null;
  }
}
