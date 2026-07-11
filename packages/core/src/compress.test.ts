import { describe, it, expect } from "vitest";
import { compressLog } from "./compress.js";

describe("compressLog", () => {
  it("keeps error lines and drops boring noise when over budget", () => {
    const lines = [
      ...Array.from({ length: 200 }, (_, i) => `npm timing ${i}`),
      "npm ERR! code ERESOLVE",
      "npm ERR! Cannot resolve dependency",
      "Error: build failed",
    ];
    const input = lines.join("\n");
    const out = compressLog(input, { maxChars: 500 });
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toContain("npm ERR!");
    expect(out).toContain("Error: build failed");
  });

  it("returns full text when under budget", () => {
    const input = "FAIL src/foo.test.ts\nExpected 1 got 2";
    expect(compressLog(input, { maxChars: 10_000 })).toBe(input);
  });

  it("always includes a tail window of the log", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`);
    lines.push("FINAL_EXIT_CODE=1");
    const out = compressLog(lines.join("\n"), { maxChars: 300, tailLines: 5 });
    expect(out).toContain("FINAL_EXIT_CODE=1");
  });
});
