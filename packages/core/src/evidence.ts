import type { AutopsyReport, Hypothesis } from "./types.js";

export function filterReportEvidence(
  report: AutopsyReport,
  contextText: string,
): AutopsyReport {
  const hypotheses: Hypothesis[] = [];
  for (const h of report.hypotheses.slice(0, 3)) {
    const evidence = h.evidence.filter(
      (e) => e.quote && contextText.includes(e.quote),
    );
    if (evidence.length === 0) continue;
    hypotheses.push({ ...h, evidence });
  }
  const status =
    hypotheses.length === 0 && report.status === "ok"
      ? "insufficient_evidence"
      : report.status;
  return {
    ...report,
    status,
    hypotheses,
    summary:
      hypotheses.length === 0 && report.status === "ok"
        ? "No hypotheses with verifiable evidence remained after filtering."
        : report.summary,
  };
}
