// GitHub Releases executor. Validates the requested tag against an
// authorization, then POSTs to /repos/{owner}/{repo}/releases.

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";
import { redactString } from "../../redaction.ts";

interface GithubReleaseArgs {
  owner: string;
  repo: string;
  tagName: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generateReleaseNotes?: boolean;
  tokenField?: string;
}

export const githubReleaseExecutor: ExecutorPlugin = {
  id: "github.release_create",
  label: "GitHub create release",
  description: "POST /repos/:owner/:repo/releases with the resolved token.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as unknown as GithubReleaseArgs;
    const tokenField = args.tokenField ?? "token";
    const token = ctx.resolvedFields[tokenField];
    if (!token) return { ok: false, detail: `Missing field ${tokenField}` };
    if (!args.owner || !args.repo || !args.tagName) {
      return { ok: false, detail: "owner, repo, tagName required" };
    }
    const body = JSON.stringify({
      tag_name: args.tagName,
      name: args.name,
      body: args.body,
      draft: args.draft ?? false,
      prerelease: args.prerelease ?? false,
      generate_release_notes: args.generateReleaseNotes ?? false,
    });
    const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/releases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body,
      signal: ctx.abortSignal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: redactString(text, [token]),
    };
  },
};
