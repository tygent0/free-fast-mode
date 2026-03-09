import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionContext, Operation } from "../types.js";

const execFileAsync = promisify(execFile);

export interface RunTestTargetArgs {
  target?: string;
  execute?: boolean;
}

export interface RunTestTargetResult {
  command: string;
  executed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function pickCommand(target?: string): [string, string[]] {
  if (!target) {
    return ["npm", ["test"]];
  }
  if (target.endsWith(".py")) {
    return ["pytest", [target]];
  }
  return ["npm", ["test", "--", target]];
}

export const runTestTargetOperation: Operation<RunTestTargetArgs, RunTestTargetResult> = {
  name: "run_test_target",
  metadata: {
    batchable: false,
    estimatedCost: "high",
    cacheKey: "run_test_target"
  },
  execute: async (args: RunTestTargetArgs, context: ExecutionContext): Promise<RunTestTargetResult> => {
    const [cmd, cmdArgs] = pickCommand(args.target);
    const rendered = `${cmd} ${cmdArgs.join(" ")}`.trim();

    if (!args.execute) {
      return {
        command: rendered,
        executed: false,
        exitCode: null,
        stdout: "",
        stderr: ""
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
        cwd: context.repoRoot,
        timeout: context.mode === "safe" ? 120000 : 45000,
        maxBuffer: 10_000_000
      });
      return {
        command: rendered,
        executed: true,
        exitCode: 0,
        stdout,
        stderr
      };
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      return {
        command: rendered,
        executed: true,
        exitCode: typeof e.code === "number" ? e.code : 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? e.message
      };
    }
  }
};
