import { describe, it, expect, vi } from "vitest";
import { collectFailedJobLogs, publishPrComment } from "./github.js";
import type { GitHubApi } from "./github.js";

describe("github helpers", () => {
  it("collects logs for first failed job", async () => {
    const api: GitHubApi = {
      actions: {
        listJobsForWorkflowRun: async () => ({
          data: {
            jobs: [
              {
                id: 9,
                name: "test",
                conclusion: "failure",
                steps: [{ name: "Run tests", conclusion: "failure" }],
              },
            ],
          },
        }),
        downloadJobLogsForWorkflowRun: async () => ({
          data: "Error: boom",
        }),
      },
      pulls: { list: vi.fn() as never, get: vi.fn() as never },
      issues: {
        listComments: vi.fn() as never,
        createComment: vi.fn() as never,
        updateComment: vi.fn() as never,
      },
    };
    const out = await collectFailedJobLogs(api, "acme/demo", 1);
    expect(out.logs).toContain("boom");
    expect(out.failedSteps).toEqual(["Run tests"]);
  });

  it("updates existing autopsy comment", async () => {
    const updateComment = vi.fn(async () => ({ data: { id: 1 } }));
    const createComment = vi.fn(async () => ({ data: { id: 2 } }));
    const api: GitHubApi = {
      actions: {
        listJobsForWorkflowRun: vi.fn() as never,
        downloadJobLogsForWorkflowRun: vi.fn() as never,
      },
      pulls: { list: vi.fn() as never, get: vi.fn() as never },
      issues: {
        listComments: async () => ({
          data: [
            {
              id: 42,
              body: "<!-- ci-autopsy:run_id=old -->\nhello",
            },
          ],
        }),
        createComment: createComment as never,
        updateComment: updateComment as never,
      },
    };
    const result = await publishPrComment(
      api,
      "acme/demo",
      7,
      "<!-- ci-autopsy:run_id=new -->\nworld",
      "new",
    );
    expect(result).toBe("updated");
    expect(updateComment).toHaveBeenCalled();
    expect(createComment).not.toHaveBeenCalled();
  });
});
