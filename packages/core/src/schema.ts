import type {
  AutopsyReport,
  Confidence,
  EvidenceSource,
  Hypothesis,
  PatchSuggestion,
  ReportStatus,
} from "./types.js";

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) return JSON.parse(fence[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model output");
  }
}

function asStatus(v: unknown): ReportStatus {
  if (v === "ok" || v === "insufficient_evidence" || v === "error") return v;
  throw new Error(`invalid status: ${String(v)}`);
}

function asConfidence(v: unknown): Confidence {
  if (v === "high" || v === "medium" || v === "low") return v;
  throw new Error(`invalid confidence: ${String(v)}`);
}

function asSource(v: unknown): EvidenceSource {
  if (v === "log" || v === "diff") return v;
  throw new Error(`invalid evidence source: ${String(v)}`);
}

export function parseAutopsyReport(raw: string): AutopsyReport {
  const data = extractJson(raw) as Record<string, unknown>;
  if (!data || typeof data !== "object") throw new Error("report must be object");
  const hypothesesIn = Array.isArray(data.hypotheses) ? data.hypotheses : [];
  const patchesIn = Array.isArray(data.patches) ? data.patches : [];

  const hypotheses: Hypothesis[] = hypothesesIn.slice(0, 3).map((h, i) => {
    const row = h as Record<string, unknown>;
    const evidenceIn = Array.isArray(row.evidence) ? row.evidence : [];
    return {
      title: String(row.title ?? `hypothesis-${i + 1}`),
      confidence: asConfidence(row.confidence ?? "low"),
      evidence: evidenceIn.map((e) => {
        const er = e as Record<string, unknown>;
        return {
          source: asSource(er.source ?? "log"),
          quote: String(er.quote ?? ""),
        };
      }),
      next_steps: Array.isArray(row.next_steps)
        ? row.next_steps.map(String)
        : [],
    };
  });

  const patches: PatchSuggestion[] = patchesIn.map((p) => {
    const row = p as Record<string, unknown>;
    return {
      path: row.path != null ? String(row.path) : undefined,
      description: String(row.description ?? ""),
      unified_diff:
        row.unified_diff != null ? String(row.unified_diff) : undefined,
    };
  });

  if (data.status === undefined) {
    throw new Error("missing status");
  }

  return {
    status: asStatus(data.status),
    summary: String(data.summary ?? ""),
    hypotheses,
    patches,
  };
}
