import { filterReportEvidence } from "./evidence.js";
import { parseAutopsyReport } from "./schema.js";
import type { AutopsyReport, ContextPack, LlmClient } from "./types.js";

const SYSTEM = `You are CI Autopsy, a senior engineer diagnosing CI failures.
Return ONLY JSON matching:
{
  "status": "ok" | "insufficient_evidence" | "error",
  "summary": string,
  "hypotheses": [{"title": string, "confidence": "high"|"medium"|"low", "evidence": [{"source":"log"|"diff","quote": string}], "next_steps": string[]}],
  "patches": [{"path"?: string, "description": string, "unified_diff"?: string}]
}
Rules:
- Max 3 hypotheses.
- Every evidence.quote MUST be a verbatim substring of the provided log/diff excerpts.
- If unsure, use status insufficient_evidence and low confidence.
- Do not invent file paths or error strings not present in context.`;

function buildPrompt(ctx: ContextPack): string {
  return [
    `Repo: ${ctx.repo}`,
    `Branch: ${ctx.branch ?? "unknown"}`,
    `SHA: ${ctx.sha ?? "unknown"}`,
    `Workflow: ${ctx.workflow ?? "unknown"}`,
    `Job: ${ctx.job ?? "unknown"}`,
    `Failed steps: ${ctx.failedSteps.join(", ") || "unknown"}`,
    `Ecosystem hints: ${ctx.ecosystemHints.join(", ") || "none"}`,
    "",
    "## Log excerpts",
    ctx.logExcerpts,
    "",
    "## Diff excerpts",
    ctx.diffExcerpts ?? "(none)",
  ].join("\n");
}

export async function analyzeContext(
  ctx: ContextPack,
  llm: LlmClient,
): Promise<AutopsyReport> {
  const prompt = buildPrompt(ctx);
  const contextText = `${ctx.logExcerpts}\n${ctx.diffExcerpts ?? ""}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const repair =
        attempt === 0
          ? ""
          : "\n\nPrevious output was invalid JSON. Reply with ONLY a valid JSON object.";
      const raw = await llm.complete(prompt + repair, SYSTEM);
      const parsed = parseAutopsyReport(raw);
      return filterReportEvidence(parsed, contextText);
    } catch (e) {
      lastErr = e;
    }
  }

  return {
    status: "error",
    summary: `Analyzer failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    hypotheses: [],
    patches: [],
  };
}
