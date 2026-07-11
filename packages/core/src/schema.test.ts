import { describe, it, expect } from "vitest";
import { parseAutopsyReport } from "./schema.js";

describe("parseAutopsyReport", () => {
  it("parses valid JSON object", () => {
    const raw = JSON.stringify({
      status: "ok",
      summary: "test failed",
      hypotheses: [
        {
          title: "assertion",
          confidence: "medium",
          evidence: [{ source: "log", quote: "Expected" }],
          next_steps: ["fix assert"],
        },
      ],
      patches: [],
    });
    const report = parseAutopsyReport(raw);
    expect(report.hypotheses[0]!.title).toBe("assertion");
  });

  it("extracts JSON from fenced markdown", () => {
    const raw =
      'Here you go:\n```json\n{"status":"ok","summary":"s","hypotheses":[],"patches":[]}\n```';
    const report = parseAutopsyReport(raw);
    expect(report.status).toBe("ok");
  });

  it("throws on invalid shape", () => {
    expect(() => parseAutopsyReport('{"nope":1}')).toThrow();
  });
});
