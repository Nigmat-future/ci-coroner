import { describe, it, expect } from "vitest";
import { filterReportEvidence } from "./evidence.js";
import type { AutopsyReport } from "./types.js";

describe("filterReportEvidence", () => {
  const context = "npm ERR! code ERESOLVE\nCannot find module 'foo'";

  it("keeps hypotheses whose quotes appear in context", () => {
    const report: AutopsyReport = {
      status: "ok",
      summary: "dep issue",
      hypotheses: [
        {
          title: "missing module",
          confidence: "high",
          evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
          next_steps: ["install foo"],
        },
      ],
      patches: [],
    };
    const out = filterReportEvidence(report, context);
    expect(out.hypotheses).toHaveLength(1);
    expect(out.status).toBe("ok");
  });

  it("drops fabricated quotes and may downgrade status", () => {
    const report: AutopsyReport = {
      status: "ok",
      summary: "guess",
      hypotheses: [
        {
          title: "made up",
          confidence: "high",
          evidence: [
            { source: "log", quote: "this quote is not in the log" },
          ],
          next_steps: [],
        },
      ],
      patches: [],
    };
    const out = filterReportEvidence(report, context);
    expect(out.hypotheses).toHaveLength(0);
    expect(out.status).toBe("insufficient_evidence");
  });
});
