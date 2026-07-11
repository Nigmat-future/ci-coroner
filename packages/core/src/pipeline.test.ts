import { describe, it, expect, vi } from "vitest";
import { runAutopsyPipeline } from "./pipeline.js";
import type { ContextPack, LlmClient, Publisher } from "./types.js";

const ctx: ContextPack = {
  repo: "acme/demo",
  failedSteps: ["test"],
  logExcerpts:
    "raw secret Authorization: Bearer ghp_abcdefghijklmnopqrstuvwx\nCannot find module 'foo'",
  ecosystemHints: ["node"],
  runUrl: "https://example.com/run/1",
};

describe("runAutopsyPipeline", () => {
  it("redacts, analyzes, renders, publishes", async () => {
    const llm: LlmClient = {
      async complete(prompt: string) {
        expect(prompt).not.toContain("ghp_");
        expect(prompt).toContain("Cannot find module 'foo'");
        return JSON.stringify({
          status: "ok",
          summary: "missing foo",
          hypotheses: [
            {
              title: "dep",
              confidence: "high",
              evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
              next_steps: ["install"],
            },
          ],
          patches: [],
        });
      },
    };
    const publish = vi.fn(async () => {});
    const publisher: Publisher = { publish };
    const result = await runAutopsyPipeline({
      context: ctx,
      llm,
      publisher,
      options: { markerId: "run-1" },
    });
    expect(result.report.hypotheses).toHaveLength(1);
    expect(result.markdown).toContain("ci-autopsy:run_id=run-1");
    expect(publish).toHaveBeenCalled();
    expect(result.softFailed).toBe(false);
  });

  it("soft-fails when llm throws", async () => {
    const llm: LlmClient = {
      async complete() {
        throw new Error("network down");
      },
    };
    const result = await runAutopsyPipeline({
      context: ctx,
      llm,
      options: { markerId: "run-1" },
    });
    expect(result.report.status).toBe("error");
  });
});
