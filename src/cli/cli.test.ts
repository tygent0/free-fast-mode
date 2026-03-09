import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI status returns optimizer payload", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "ffm-cli-"));
  await writeFile(path.join(repo, "package.json"), "{}", "utf8");

  const cliPath = path.join(process.cwd(), "dist", "cli", "index.js");
  const { stdout } = await execFileAsync(process.execPath, [cliPath, "status"], { cwd: repo });

  const parsed = JSON.parse(stdout);
  assert.equal(typeof parsed.state.totalOperations, "number");
  assert.equal(typeof parsed.cache.entries, "number");
});

test("CLI plugin scaffold writes Claude/Codex bundles", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "ffm-cli-plugin-"));
  await writeFile(path.join(repo, "package.json"), "{}", "utf8");

  const cliPath = path.join(process.cwd(), "dist", "cli", "index.js");
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "plugin", "scaffold", "--target", "all", "--out", ".ffm-test-plugins"],
    { cwd: repo }
  );

  const parsed = JSON.parse(stdout) as { files: string[] };
  assert.equal(Array.isArray(parsed.files), true);
  assert.equal(parsed.files.length, 4);

  const claudeSettings = await readFile(path.join(repo, ".ffm-test-plugins", "claude", "settings.json"), "utf8");
  const codexMcp = await readFile(path.join(repo, ".ffm-test-plugins", "codex", "mcp.json"), "utf8");

  assert.match(claudeSettings, /"free-fast-mode"/);
  assert.match(codexMcp, /"mcpServers"/);
});
