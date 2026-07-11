#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  createOpenAiCompatClient,
  runAutopsyPipeline,
} from "@ci-autopsy/core";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const logPath = arg("--log");
  if (!logPath) {
    console.error(
      "Usage: ci-autopsy --log <file> [--diff <file>] [--repo owner/name]",
    );
    process.exit(2);
  }
  const diffPath = arg("--diff");
  const repo = arg("--repo") ?? "local/local";
  const logExcerpts = readFileSync(logPath, "utf8");
  const diffExcerpts = diffPath ? readFileSync(diffPath, "utf8") : undefined;
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set LLM_API_KEY or OPENAI_API_KEY");
    process.exit(2);
  }
  const llm = createOpenAiCompatClient({
    apiKey,
    baseUrl: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL,
  });
  const result = await runAutopsyPipeline({
    context: {
      repo,
      failedSteps: [],
      logExcerpts,
      diffExcerpts,
      ecosystemHints: [],
    },
    llm,
    options: { markerId: "cli" },
  });
  console.log(result.markdown);
  if (result.softFailed && process.env.CI_AUTOPSY_STRICT === "1") {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
