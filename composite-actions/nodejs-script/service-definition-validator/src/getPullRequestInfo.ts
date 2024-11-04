import { warning } from "@actions/core";
import { getOctokit, context } from "@actions/github";

/**
 * Fetches the pull request information associated with the current Git reference.
 *
 * @param githubToken - The GitHub token used for authentication.
 * @returns The matching pull request or undefined if not found.
 */
export const fetchPullRequestInfo = async (
  githubToken: string,
): Promise<any> => {
  const octokit = getOctokit(githubToken);
  const { owner, repo } = context.repo;
  const branchName = context.ref.replace("refs/heads/", "");

  try {
    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${branchName}`,
    });

    return pullRequests.find((pr) => pr.head.sha === context.sha);
  } catch (error) {
    if (error instanceof Error) {
      warning(`Failed to fetch pull requests: ${error.message}`);
    } else {
      warning(`Failed to fetch pull requests: ${JSON.stringify(error)}`);
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
  if (context.eventName === "pull_request") {
    const { payload } = context;
    return payload.pull_request;
  }

  return fetchPullRequestInfo(githubToken);
};
