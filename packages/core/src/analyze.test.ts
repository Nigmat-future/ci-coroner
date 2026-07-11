import { describe, it, expect } from "vitest";
import { analyzeContext } from "./analyze.js";
import type { ContextPack, LlmClient } from "./types.js";

const baseContext: ContextPack = {
  repo: "acme/demo",
  failedSteps: ["test"],
  logExcerpts: "Cannot find module 'foo'\nnpm ERR! code ERESOLVE",
  ecosystemHints: ["node"],
};

describe("analyzeContext", () => {
  it("returns filtered report from model JSON", async () => {
    const llm: LlmClient = {
      async complete() {
        return JSON.stringify({
          status: "ok",
          summary: "Missing dependency",
          hypotheses: [
            {
              title: "foo not installed",
              confidence: "high",
              evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
              next_steps: ["pnpm add foo"],
            },
          ],
          patches: [],
        });
      },
    };
    const report = await analyzeContext(baseContext, llm);
    expect(report.hypotheses).toHaveLength(1);
    expect(report.hypotheses[0]!.title).toBe("foo not installed");
  });

  it("retries once on invalid JSON then errors status", async () => {
    let calls = 0;
    const llm: LlmClient = {
      async complete() {
        calls += 1;
        return "NOT JSON";
      },
    };
    const report = await analyzeContext(baseContext, llm);
    expect(calls).toBe(2);
    expect(report.status).toBe("error");
  });
});
