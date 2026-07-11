import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  collectFailedJobLogs,
  createOpenAiCompatClient,
  publishPrComment,
  runAutopsyPipeline,
  type GitHubApi,
} from "@ci-autopsy/core";

async function main() {
  const strict = core.getBooleanInput("strict");
  const apiKey = core.getInput("llm_api_key") || process.env.LLM_API_KEY || "";
  const baseUrl = core.getInput("llm_base_url") || process.env.LLM_BASE_URL;
  const model = core.getInput("llm_model") || process.env.LLM_MODEL;
  const token = core.getInput("github_token") || process.env.GITHUB_TOKEN || "";

  if (!apiKey) {
    core.warning("No llm_api_key; skipping autopsy");
    if (strict) core.setFailed("llm_api_key required in strict mode");
    return;
  }
  if (!token) {
    core.warning("No github_token; skipping autopsy");
    if (strict) core.setFailed("github_token required in strict mode");
    return;
  }

  const octokit = github.getOctokit(token);
  const api = octokit as unknown as GitHubApi;
  const { owner, repo } = github.context.repo;
  const repoFull = `${owner}/${repo}`;
  const runId = github.context.runId;

  const collected = await collectFailedJobLogs(api, repoFull, runId);
  if (!collected.logs) {
    core.info("No failed job logs found; nothing to autopsy");
    return;
  }

  const prNumber = github.context.payload.pull_request?.number as
    | number
    | undefined;

  const llm = createOpenAiCompatClient({
    apiKey,
    baseUrl: baseUrl || undefined,
    model: model || undefined,
  });
  const markerId = String(runId);

  const result = await runAutopsyPipeline({
    context: {
      repo: repoFull,
      branch: github.context.ref,
      sha: github.context.sha,
      workflow: github.context.workflow,
      job: collected.jobName,
      runUrl: `${github.context.serverUrl}/${repoFull}/actions/runs/${runId}`,
      failedSteps: collected.failedSteps,
      logExcerpts: collected.logs,
      ecosystemHints: [],
    },
    llm,
    publisher: prNumber
      ? {
          async publish(markdown, id) {
            await publishPrComment(api, repoFull, prNumber, markdown, id);
          },
        }
      : undefined,
    options: { markerId, strict },
  });

  if (!prNumber) {
    await core.summary.addRaw(result.markdown).write();
    core.info("No PR number; wrote job summary only");
  }

  if (result.softFailed && strict) {
    core.setFailed(result.errorMessage ?? "autopsy soft-failed");
  }
}

main().catch((e) => {
  core.warning(e instanceof Error ? e.message : String(e));
});
