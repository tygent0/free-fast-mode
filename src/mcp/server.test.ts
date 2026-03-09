import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Optimizer } from "../optimizer/optimizer.js";
import { FfmMcpServer } from "./server.js";

test("MCP server lists tools and executes a tool", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "ffm-mcp-"));
  await writeFile(path.join(repo, "package.json"), "{}", "utf8");

  const optimizer = new Optimizer(repo, "balanced");
  const server = new FfmMcpServer(optimizer);

  const listed = await server.handle({ id: 1, method: "tools/list" });
  const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
  assert.equal(tools.some((t) => t.name === "ffm_search"), true);

  const called = await server.handle({
    id: 2,
    method: "tools/call",
    params: { name: "ffm_workspace_snapshot", arguments: { forceRefresh: true } }
  });

  const result = called.result as { data?: { repoRoot?: string } };
  assert.equal(typeof result.data?.repoRoot, "string");
});
