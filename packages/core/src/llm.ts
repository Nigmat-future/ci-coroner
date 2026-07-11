import type { LlmClient } from "./types.js";

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function createOpenAiCompatClient(
  config: OpenAiCompatConfig,
): LlmClient {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = config.model ?? "gpt-4o-mini";
  return {
    async complete(prompt: string, system: string): Promise<string> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned empty content");
      return content;
    },
  };
}
