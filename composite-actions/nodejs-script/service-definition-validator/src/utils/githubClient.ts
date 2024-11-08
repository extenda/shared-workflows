import * as github from "@actions/github";
import * as core from "@actions/core";
import type { WebhookPayload } from "@actions/github/lib/interfaces";

const COMMENT_IDENTIFIER = "## 🛡️ Definition File(s) Environment Variables Validation Results";

/**
 * Fetches the pull request information associated with the current Git reference.
 *
 * @param githubToken - The GitHub token used for authentication.
 * @returns The matching pull request or undefined if not found.
 */
export const fetchPullRequestInfo = async (
  githubToken: string,
): Promise<any> => {
  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;
  const branchName = github.context.ref.replace("refs/heads/", "");

  try {
    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${branchName}`,
    });

    return pullRequests.find((pr) => pr.head.sha === github.context.sha);
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Failed to fetch pull requests: ${error.message}`);
    } else {
      core.warning(`Failed to fetch pull requests: ${JSON.stringify(error)}`);
    }
    return undefined;
  }
};

/**
   * Retrieves pull request information based on the GitHub event context.
   *
   * - If the event is a `pull_request`, it extracts the pull request from the payload.
   * - Otherwise, it attempts to fetch the pull request associated with the current commit SHA.
   *
   * @param githubToken - The GitHub token used for authentication.
   * @returns The pull request information or undefined if not available.
   */
export const getPullRequestInfo = async (
  githubToken: string,
): Promise<any> => {
  if (github.context.eventName === "pull_request") {
    const { payload } = github.context;
    return payload.pull_request;
  }

  return fetchPullRequestInfo(githubToken);
};

/**
 * Posts a new comment or updates an existing one on the PR with the provided Markdown content.
 * @param markdown - The Markdown content to post.
 * @param githubToken - GitHub token for authentication.
 */
export async function postOrUpdatePRComment(markdown: string, githubToken: string): Promise<void> {
  const octokit = github.getOctokit(githubToken);
  const { context } = github;

  const pr = (await getPullRequestInfo(githubToken)) as WebhookPayload["pull_request"];

  if (!pr) {
    core.setFailed("🔴 Failed to fetch the pull request information.");
    return;
  }

  const { number: prNumber, repo, owner } = {
    number: pr.number,
    repo: context.repo.repo,
    owner: context.repo.owner,
  };

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const existingComment = comments.find((comment) => comment.body?.startsWith(COMMENT_IDENTIFIER));

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: markdown,
      });
      core.info("📝 Existing PR comment updated with new validation results.");
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: markdown,
      });
      core.info("📝 New PR comment posted with validation results.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`⚠️ Failed to post or update PR comment. Error: ${error.message}`);
    } else {
      core.warning("⚠️ Failed to post or update PR comment. Unknown error.");
    }
  }
}
