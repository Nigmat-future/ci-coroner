export type Confidence = "high" | "medium" | "low";
export type EvidenceSource = "log" | "diff";
export type ReportStatus = "ok" | "insufficient_evidence" | "error";

export interface Evidence {
  source: EvidenceSource;
  quote: string;
}

export interface Hypothesis {
  title: string;
  confidence: Confidence;
  evidence: Evidence[];
  next_steps: string[];
}

export interface PatchSuggestion {
  path?: string;
  description: string;
  unified_diff?: string;
}

export interface AutopsyReport {
  status: ReportStatus;
  summary: string;
  hypotheses: Hypothesis[];
  patches: PatchSuggestion[];
}

export interface ContextPack {
  repo: string;
  branch?: string;
  sha?: string;
  workflow?: string;
  job?: string;
  runUrl?: string;
  failedSteps: string[];
  logExcerpts: string;
  diffExcerpts?: string;
  ecosystemHints: string[];
}

export interface PipelineInput {
  context: ContextPack;
  llm: LlmClient;
  publisher?: Publisher;
  options?: PipelineOptions;
}

export interface PipelineOptions {
  strict?: boolean;
  maxLogChars?: number;
  model?: string;
  markerId?: string;
}

export interface LlmClient {
  complete(prompt: string, system: string): Promise<string>;
}

export interface Publisher {
  publish(markdown: string, markerId: string): Promise<void>;
}

export interface PipelineResult {
  report: AutopsyReport;
  markdown: string;
  softFailed: boolean;
  errorMessage?: string;
}
