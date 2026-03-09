import { createHash } from "node:crypto";
import type { OperationRequest, WorkspaceSnapshot } from "../types.js";

export function buildCacheKey(request: OperationRequest, snapshot: WorkspaceSnapshot): string {
  const hash = createHash("sha1")
    .update(JSON.stringify({
      name: request.name,
      args: request.args,
      repoRoot: snapshot.repoRoot,
      branch: snapshot.branch,
      headSha: snapshot.headSha,
      fingerprint: snapshot.fingerprint
    }))
    .digest("hex");

  return `${request.name}:${hash}`;
}
