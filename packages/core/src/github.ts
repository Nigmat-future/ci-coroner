export interface GhPullsListResponse {
  data: Array<{ number: number }>;
}

export interface GhIssueComment {
  id: number;
  body?: string | null;
}

export interface GitHubApi {
  actions: {
    downloadJobLogsForWorkflowRun: (params: {
      owner: string;
      repo: string;
      job_id: number;
    }) => Promise<{ data: ArrayBuffer | string }>;
    listJobsForWorkflowRun: (params: {
      owner: string;
      repo: string;
      run_id: number;
    }) => Promise<{
      data: {
        jobs: Array<{
          id: number;
          name: string;
          conclusion: string | null;
          steps?: Array<{ name: string; conclusion: string | null }>;
        }>;
      };
    }>;
  };
  pulls: {
    list: (params: {
      owner: string;
      repo: string;
      state: "open";
      head: string;
    }) => Promise<GhPullsListResponse>;
    get: (params: {
      owner: string;
      repo: string;
      pull_number: number;
      mediaType?: { format: string };
    }) => Promise<{ data: string | { body?: string } }>;
  };
  issues: {
    listComments: (params: {
      owner: string;
      repo: string;
      issue_number: number;
      per_page?: number;
    }) => Promise<{ data: GhIssueComment[] }>;
    createComment: (params: {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }) => Promise<{ data: GhIssueComment }>;
    updateComment: (params: {
      owner: string;
      repo: string;
      comment_id: number;
      body: string;
    }) => Promise<{ data: GhIssueComment }>;
  };
}

export function parseOwnerRepo(repoFull: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo: ${repoFull}`);
  return { owner, repo };
}

export async function collectFailedJobLogs(
  api: GitHubApi,
  repoFull: string,
  runId: number,
): Promise<{ jobName: string; failedSteps: string[]; logs: string }> {
  const { owner, repo } = parseOwnerRepo(repoFull);
  const jobs = await api.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  const failed = jobs.data.jobs.filter((j) => j.conclusion === "failure");
  if (failed.length === 0) {
    return { jobName: "", failedSteps: [], logs: "" };
  }
  const job = failed[0]!;
  const failedSteps =
    job.steps?.filter((s) => s.conclusion === "failure").map((s) => s.name) ??
    [];
  const logRes = await api.actions.downloadJobLogsForWorkflowRun({
    owner,
    repo,
    job_id: job.id,
  });
  const logs =
    typeof logRes.data === "string"
      ? logRes.data
      : new TextDecoder().decode(logRes.data);
  return { jobName: job.name, failedSteps, logs };
}

export async function publishPrComment(
  api: GitHubApi,
  repoFull: string,
  issueNumber: number,
  markdown: string,
  markerId: string,
): Promise<"created" | "updated"> {
  const { owner, repo } = parseOwnerRepo(repoFull);
  const marker = `<!-- ci-autopsy:run_id=${markerId} -->`;
  const comments = await api.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.data.find((c) =>
    c.body?.includes("<!-- ci-autopsy:run_id="),
  );
  const same =
    comments.data.find((c) => c.body?.includes(marker)) ?? existing;
  if (same) {
    await api.issues.updateComment({
      owner,
      repo,
      comment_id: same.id,
      body: markdown,
    });
    return "updated";
  }
  await api.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: markdown,
  });
  return "created";
}
