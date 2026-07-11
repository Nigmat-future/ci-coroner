import { describe, it, expect } from "vitest";
import { renderReportMarkdown } from "./render.js";
import type { AutopsyReport } from "./types.js";

describe("renderReportMarkdown", () => {
  it("includes marker, summary, and evidence quotes", () => {
    const report: AutopsyReport = {
      status: "ok",
      summary: "Dependency resolution failed",
      hypotheses: [
        {
          title: "Missing package",
          confidence: "high",
          evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
          next_steps: ["Add foo to dependencies"],
        },
      ],
      patches: [],
    };
    const md = renderReportMarkdown(report, {
      markerId: "run-123",
      runUrl: "https://example.com/run/1",
    });
    expect(md).toContain("<!-- ci-autopsy:run_id=run-123 -->");
    expect(md).toContain("Dependency resolution failed");
    expect(md).toContain("Cannot find module 'foo'");
    expect(md).toContain("Missing package");
  });
});
