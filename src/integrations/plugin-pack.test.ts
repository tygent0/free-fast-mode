import assert from "node:assert/strict";
import test from "node:test";
import { buildPluginFiles } from "./plugin-pack.js";

test("buildPluginFiles generates Claude and Codex bundles with npx launcher", () => {
  const files = buildPluginFiles("all", "npx");
  const byPath = new Map(files.map((f) => [f.path, f.content]));

  assert.equal(byPath.has("claude/settings.json"), true);
  assert.equal(byPath.has("codex/mcp.json"), true);
  assert.equal(byPath.has("codex/AGENTS.md"), true);
  assert.equal(byPath.has("codex/skill-free-fast.md"), true);

  const claude = byPath.get("claude/settings.json") ?? "";
  const codex = byPath.get("codex/mcp.json") ?? "";
  assert.match(claude, /"command": "npx"/);
  assert.match(claude, /"free-fast-mode"/);
  assert.match(codex, /"command": "npx"/);
});

test("buildPluginFiles supports ffm launcher", () => {
  const files = buildPluginFiles("claude", "ffm");
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "claude/settings.json");
  assert.match(files[0]?.content ?? "", /"command": "ffm"/);
});
