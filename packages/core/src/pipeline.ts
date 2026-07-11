import { analyzeContext } from "./analyze.js";
import { compressLog } from "./compress.js";
import { redactSecrets } from "./redact.js";
import { renderReportMarkdown } from "./render.js";
import type {
  AutopsyReport,
  ContextPack,
  PipelineInput,
  PipelineResult,
} from "./types.js";

function prepareContext(ctx: ContextPack, maxLogChars: number): ContextPack {
  const redactedLogs = redactSecrets(ctx.logExcerpts);
  const redactedDiff = ctx.diffExcerpts
    ? redactSecrets(ctx.diffExcerpts)
    : undefined;
  return {
    ...ctx,
    logExcerpts: compressLog(redactedLogs, { maxChars: maxLogChars }),
    diffExcerpts: redactedDiff
      ? compressLog(redactedDiff, { maxChars: Math.floor(maxLogChars / 2) })
      : undefined,
  };
}

export async function runAutopsyPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const maxLogChars = input.options?.maxLogChars ?? 24_000;
  const markerId = input.options?.markerId ?? "local";
  const prepared = prepareContext(input.context, maxLogChars);

  let report: AutopsyReport;
  try {
    report = await analyzeContext(prepared, input.llm);
  } catch (e) {
    report = {
      status: "error",
      summary: e instanceof Error ? e.message : String(e),
      hypotheses: [],
      patches: [],
    };
  }

  const markdown = renderReportMarkdown(report, {
    markerId,
    runUrl: prepared.runUrl,
  });

  if (input.publisher) {
    try {
      await input.publisher.publish(markdown, markerId);
    } catch (e) {
      return {
        report,
        markdown,
        softFailed: true,
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    report,
    markdown,
    softFailed: report.status === "error",
    errorMessage: report.status === "error" ? report.summary : undefined,
  };
}
