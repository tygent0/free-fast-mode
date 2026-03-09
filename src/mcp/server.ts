import readline from "node:readline";
import { Optimizer } from "../optimizer/optimizer.js";
import { toolDefinitions, toOperationRequest } from "./tools.js";

interface RpcRequest {
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function writeResponse(response: RpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export class FfmMcpServer {
  constructor(private readonly optimizer: Optimizer) {}

  async handle(input: RpcRequest): Promise<RpcResponse> {
    try {
      switch (input.method) {
        case "initialize":
          return {
            id: input.id,
            result: {
              name: "free-fast-mode-mcp",
              version: "0.1.0",
              protocol: "mcp-like-jsonrpc",
              capabilities: { tools: true }
            }
          };

        case "tools/list":
          return { id: input.id, result: { tools: toolDefinitions } };

        case "tools/call": {
          const name = String(input.params?.name ?? "");
          const args = (input.params?.arguments as Record<string, unknown> | undefined) ?? {};
          const result = await this.callTool(name, args);
          return { id: input.id, result };
        }

        default: {
          if (input.method.startsWith("ffm_")) {
            const result = await this.callTool(input.method, input.params ?? {});
            return { id: input.id, result };
          }

          return {
            id: input.id,
            error: { code: -32601, message: `Unknown method: ${input.method}` }
          };
        }
      }
    } catch (error) {
      return {
        id: input.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Unknown server error"
        }
      };
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === "ffm_get_cached") {
      const key = String(args.key ?? "");
      if (!key) {
        throw new Error("Missing required input: key");
      }
      return {
        key,
        value: await this.optimizer.getCached(key)
      };
    }

    const request = toOperationRequest(name, args);
    if (!request) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const response = await this.optimizer.execute(request);
    return {
      tool: name,
      cacheHit: response.cacheHit,
      deduped: response.deduped,
      durationMs: response.durationMs,
      warnings: response.warnings,
      data: response.data
    };
  }
}

export async function startMcpServer(optimizer: Optimizer): Promise<void> {
  const server = new FfmMcpServer(optimizer);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const request = JSON.parse(trimmed) as RpcRequest;
      const response = await server.handle(request);
      writeResponse(response);
    } catch {
      writeResponse({ id: null, error: { code: -32700, message: "Invalid JSON payload" } });
    }
  });

  process.stdout.write(
    `${JSON.stringify({
      event: "server_ready",
      message: "free-fast-mode MCP server started",
      protocol: "line-delimited json-rpc"
    })}\n`
  );
}
