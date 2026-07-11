# CI Autopsy Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a GitHub Action (plus local CLI) that, on CI failure, posts an evidence-backed structured autopsy report on the related PR/commit.

**Architecture:** Shared TypeScript `packages/core` implements redact → compress → analyze (LLM + JSON schema + evidence checks) → publish. `packages/cli` and `action.yml` are thin adapters over the same pipeline. Soft-fail by default so autopsy never blocks the user's main pipeline.

**Tech Stack:** pnpm workspaces, TypeScript (Node 20+), Vitest, `@actions/core` / `@actions/github`, OpenAI-compatible Chat Completions API, GitHub REST for logs/comments.

**Spec:** `docs/superpowers/specs/2026-07-11-ci-autopsy-agent-design.md`

---

## File map (create)

| Path | Responsibility |
|------|----------------|
| `package.json` | pnpm workspace root, scripts |
| `pnpm-workspace.yaml` | `packages/*` |
| `tsconfig.base.json` | Shared TS options |
| `.gitignore` | node_modules, dist, .env |
| `packages/core/package.json` | Core package manifest |
| `packages/core/tsconfig.json` | Core TS config |
| `packages/core/src/types.ts` | Shared types + report schema types |
| `packages/core/src/redact.ts` | Secret redaction |
| `packages/core/src/compress.ts` | Log compression / scoring |
| `packages/core/src/evidence.ts` | Evidence quote validation |
| `packages/core/src/schema.ts` | Parse/validate analyzer JSON |
| `packages/core/src/analyze.ts` | LLM call + repair retry |
| `packages/core/src/github.ts` | Fetch logs, PR diff, post/update comment |
| `packages/core/src/render.ts` | Report JSON → markdown |
| `packages/core/src/pipeline.ts` | Orchestrate end-to-end |
| `packages/core/src/index.ts` | Public exports |
| `packages/core/src/redact.test.ts` | Redaction tests |
| `packages/core/src/compress.test.ts` | Compress tests |
| `packages/core/src/evidence.test.ts` | Evidence tests |
| `packages/core/src/schema.test.ts` | Schema tests |
| `packages/core/src/render.test.ts` | Render tests |
| `packages/core/src/pipeline.test.ts` | Pipeline integration with mocks |
| `packages/cli/package.json` | CLI package |
| `packages/cli/tsconfig.json` | CLI TS |
| `packages/cli/src/main.ts` | CLI entry |
| `packages/action/package.json` | Action runner package |
| `packages/action/tsconfig.json` | Action TS |
| `packages/action/src/main.ts` | Action entry |
| `action.yml` | GitHub Action metadata (repo root) |
| `demos/failing-node/package.json` | Demo package |
| `demos/failing-node/src/dep-break.ts` | F1 fixture source (optional import path) |
| `demos/failing-node/src/type-break.ts` | F2 |
| `demos/failing-node/src/test-break.test.ts` | F3 |
| `demos/failing-node/.github/workflows/demo-f1.yml` | Dependency failure workflow |
| `demos/failing-node/.github/workflows/demo-f2.yml` | Type failure workflow |
| `demos/failing-node/.github/workflows/demo-f3.yml` | Test failure workflow |
| `.github/workflows/self-test.yml` | Unit tests on PR |
| `README.md` | Install, architecture, demo |

---

### Task 1: Scaffold monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `packages/action/package.json`, `packages/action/tsconfig.json`

- [ ] **Step 1: Write root workspace files**

`package.json`:
```json
{
  "name": "ci-autopsy-agent",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm --filter @ci-autopsy/core test",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

`.gitignore`:
```
node_modules
dist
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 2: Write package manifests**

`packages/core/package.json`:
```json
{
  "name": "@ci-autopsy/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "@types/node": "^22.10.2"
  },
  "dependencies": {
    "@octokit/rest": "^21.0.2"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`packages/core/src/index.ts`:
```ts
export const PKG = "@ci-autopsy/core";
```

`packages/cli/package.json`:
```json
{
  "name": "@ci-autopsy/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "ci-autopsy": "./dist/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ci-autopsy/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2"
  }
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`packages/action/package.json`:
```json
{
  "name": "@ci-autopsy/action",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "@actions/github": "^6.0.0",
    "@ci-autopsy/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2"
  }
}
```

`packages/action/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install and verify**

Run:
```bash
cd F:/Github/ci-autopsy-agent
pnpm install
```

Expected: lockfile created, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore packages pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo for ci-autopsy"
```

Note: If git user.identity is unset, stop and ask the human to set `user.name` / `user.email` (local or global) before commits. Do not invent identity.

---

### Task 2: Types

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add shared types**

```ts
// packages/core/src/types.ts
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
```

- [ ] **Step 2: Export types from index**

```ts
// packages/core/src/index.ts
export * from "./types.js";
export const PKG = "@ci-autopsy/core";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ci-autopsy/core typecheck`  
Expected: PASS (or only missing-file errors if tsc needs empty skip — should pass with types + index only).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): add shared autopsy types"
```

---

### Task 3: Redaction (TDD)

**Files:**
- Create: `packages/core/src/redact.ts`
- Create: `packages/core/src/redact.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/src/redact.test.ts
import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("redacts bearer tokens", () => {
    const input = "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwx";
    const out = redactSecrets(input);
    expect(out).not.toContain("ghp_");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts aws-like keys", () => {
    const input = "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("wJalrXUtnFEMI");
  });

  it("redacts private key blocks", () => {
    const input = "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED_PRIVATE_KEY]");
    expect(out).not.toContain("ABCDEF");
  });

  it("leaves normal logs intact", () => {
    const input = "Error: Cannot find module 'left-pad'";
    expect(redactSecrets(input)).toBe(input);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @ci-autopsy/core test`  
Expected: FAIL — `redactSecrets` not found / module missing.

- [ ] **Step 3: Implement redaction**

```ts
// packages/core/src/redact.ts
const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  {
    re: /(Authorization:\s*Bearer\s+)(\S+)/gi,
    replacement: "$1[REDACTED]",
  },
  {
    re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED]",
  },
  {
    re: /\b(sk-[A-Za-z0-9]{20,})\b/g,
    replacement: "[REDACTED]",
  },
  {
    re: /(AWS_SECRET_ACCESS_KEY\s*=\s*)(\S+)/gi,
    replacement: "$1[REDACTED]",
  },
  {
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    re: /(api[_-]?key\s*[:=]\s*)([^\s'"]+)/gi,
    replacement: "$1[REDACTED]",
  },
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
```

Export from `index.ts`: `export { redactSecrets } from "./redact.js";`

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @ci-autopsy/core test`  
Expected: all redact tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/redact.ts packages/core/src/redact.test.ts packages/core/src/index.ts
git commit -m "feat(core): redact secrets from CI logs"
```

---

### Task 4: Log compression (TDD)

**Files:**
- Create: `packages/core/src/compress.ts`
- Create: `packages/core/src/compress.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/src/compress.test.ts
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @ci-autopsy/core exec vitest run src/compress.test.ts`  
Expected: FAIL — module not found.

- [ ] **Step 3: Implement compression**

```ts
// packages/core/src/compress.ts
export interface CompressOptions {
  maxChars?: number;
  tailLines?: number;
}

const SIGNAL =
  /(error|err!|fail|failed|exception|traceback|fatal|panic|ENOENT|ERESOLVE|TS\d{3,5}|AssertionError|Expected|at\s+\S+\s+\()/i;

export function compressLog(text: string, options: CompressOptions = {}): string {
  const maxChars = options.maxChars ?? 24_000;
  const tailLines = options.tailLines ?? 40;
  if (text.length <= maxChars) return text;

  const lines = text.split(/\r?\n/);
  const scored = lines
    .map((line, idx) => ({
      line,
      idx,
      score: SIGNAL.test(line) ? 10 : 0,
    }))
    .filter((x) => x.score > 0);

  const tail = lines.slice(-tailLines);
  const picked = new Map<number, string>();
  for (const t of tail) {
    // re-find indices for tail by scanning from end
  }
  // Prefer explicit index-based pick:
  for (let i = Math.max(0, lines.length - tailLines); i < lines.length; i++) {
    picked.set(i, lines[i]!);
  }
  for (const s of scored) {
    picked.set(s.idx, s.line);
    // also keep small context
    if (s.idx > 0) picked.set(s.idx - 1, lines[s.idx - 1]!);
    if (s.idx + 1 < lines.length) picked.set(s.idx + 1, lines[s.idx + 1]!);
  }

  const ordered = [...picked.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, line]) => `L${idx + 1}: ${line}`);

  let out = ordered.join("\n");
  if (out.length > maxChars) {
    out = out.slice(out.length - maxChars);
  }
  return out;
}
```

Export from index: `export { compressLog } from "./compress.js";`

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @ci-autopsy/core test`  
Expected: compress + redact tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/compress.ts packages/core/src/compress.test.ts packages/core/src/index.ts
git commit -m "feat(core): compress CI logs with error-biased selection"
```

---

### Task 5: Evidence validation + schema parse (TDD)

**Files:**
- Create: `packages/core/src/evidence.ts`, `packages/core/src/evidence.test.ts`
- Create: `packages/core/src/schema.ts`, `packages/core/src/schema.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write evidence tests**

```ts
// packages/core/src/evidence.test.ts
import { describe, it, expect } from "vitest";
import { filterReportEvidence } from "./evidence.js";
import type { AutopsyReport } from "./types.js";

describe("filterReportEvidence", () => {
  const context = "npm ERR! code ERESOLVE\nCannot find module 'foo'";

  it("keeps hypotheses whose quotes appear in context", () => {
    const report: AutopsyReport = {
      status: "ok",
      summary: "dep issue",
      hypotheses: [
        {
          title: "missing module",
          confidence: "high",
          evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
          next_steps: ["install foo"],
        },
      ],
      patches: [],
    };
    const out = filterReportEvidence(report, context);
    expect(out.hypotheses).toHaveLength(1);
    expect(out.status).toBe("ok");
  });

  it("drops fabricated quotes and may downgrade status", () => {
    const report: AutopsyReport = {
      status: "ok",
      summary: "guess",
      hypotheses: [
        {
          title: "made up",
          confidence: "high",
          evidence: [{ source: "log", quote: "this quote is not in the log" }],
          next_steps: [],
        },
      ],
      patches: [],
    };
    const out = filterReportEvidence(report, context);
    expect(out.hypotheses).toHaveLength(0);
    expect(out.status).toBe("insufficient_evidence");
  });
});
```

- [ ] **Step 2: Write schema tests**

```ts
// packages/core/src/schema.test.ts
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
    const raw = "Here you go:\n```json\n{\"status\":\"ok\",\"summary\":\"s\",\"hypotheses\":[],\"patches\":[]}\n```";
    const report = parseAutopsyReport(raw);
    expect(report.status).toBe("ok");
  });

  it("throws on invalid shape", () => {
    expect(() => parseAutopsyReport("{\"nope\":1}")).toThrow();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `pnpm --filter @ci-autopsy/core test`  
Expected: FAIL missing modules.

- [ ] **Step 4: Implement evidence + schema**

```ts
// packages/core/src/evidence.ts
import type { AutopsyReport, Hypothesis } from "./types.js";

export function filterReportEvidence(
  report: AutopsyReport,
  contextText: string,
): AutopsyReport {
  const hypotheses: Hypothesis[] = [];
  for (const h of report.hypotheses.slice(0, 3)) {
    const evidence = h.evidence.filter((e) => e.quote && contextText.includes(e.quote));
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
```

```ts
// packages/core/src/schema.ts
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

  return {
    status: asStatus(data.status ?? "ok"),
    summary: String(data.summary ?? ""),
    hypotheses,
    patches,
  };
}
```

Export both from `index.ts`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @ci-autopsy/core test`  
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/evidence.ts packages/core/src/evidence.test.ts packages/core/src/schema.ts packages/core/src/schema.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse report JSON and enforce evidence quotes"
```

---

### Task 6: Render markdown (TDD)

**Files:**
- Create: `packages/core/src/render.ts`, `packages/core/src/render.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/src/render.test.ts
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
```

- [ ] **Step 2: Implement render**

```ts
// packages/core/src/render.ts
import type { AutopsyReport } from "./types.js";

export interface RenderOptions {
  markerId: string;
  runUrl?: string;
}

export function renderReportMarkdown(
  report: AutopsyReport,
  options: RenderOptions,
): string {
  const lines: string[] = [
    `<!-- ci-autopsy:run_id=${options.markerId} -->`,
    `## CI Autopsy`,
    "",
    `**Status:** \`${report.status}\``,
  ];
  if (options.runUrl) lines.push(`**Run:** ${options.runUrl}`);
  lines.push("", report.summary, "");

  if (report.hypotheses.length === 0) {
    lines.push("_No verifiable hypotheses._", "");
  }

  report.hypotheses.forEach((h, i) => {
    lines.push(`### ${i + 1}. ${h.title} (\`${h.confidence}\`)`);
    lines.push("", "**Evidence:**");
    for (const e of h.evidence) {
      lines.push(`- (\`${e.source}\`) \`${e.quote.replace(/`/g, "'")}\``);
    }
    if (h.next_steps.length) {
      lines.push("", "**Next steps:**");
      for (const s of h.next_steps) lines.push(`- ${s}`);
    }
    lines.push("");
  });

  if (report.patches.length) {
    lines.push("### Suggested patches", "");
    for (const p of report.patches) {
      lines.push(`- **${p.path ?? "change"}:** ${p.description}`);
      if (p.unified_diff) {
        lines.push("", "```diff", p.unified_diff, "```", "");
      }
    }
  }

  lines.push(
    "---",
    "_Generated by ci-autopsy. Quotes must appear in logs/diff; treat suggestions as hypotheses._",
  );
  return lines.join("\n");
}
```

- [ ] **Step 3: Test PASS + commit**

```bash
pnpm --filter @ci-autopsy/core test
git add packages/core/src/render.ts packages/core/src/render.test.ts packages/core/src/index.ts
git commit -m "feat(core): render autopsy markdown with idempotency marker"
```

---

### Task 7: Analyzer + OpenAI-compatible client (TDD with mock)

**Files:**
- Create: `packages/core/src/analyze.ts`, `packages/core/src/llm.ts`
- Create: `packages/core/src/analyze.test.ts`
- Modify: `packages/core/package.json` (no new deps required if using fetch)
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write analyzer test with mock LlmClient**

```ts
// packages/core/src/analyze.test.ts
import { describe, it, expect } from "vitest";
import { analyzeContext } from "./analyze.js";
import type { ContextPack, LlmClient } from "./types.js";

const baseContext: ContextPack = {
  repo: "acme/demo",
  failedSteps: ["test"],
  logExcerpts: "Cannot find module 'foo'\nnpm ERR! code ERESOLVE",
  ecosystemHints: ["node"],
};

describe("analyzeContext", () => {
  it("returns filtered report from model JSON", async () => {
    const llm: LlmClient = {
      async complete() {
        return JSON.stringify({
          status: "ok",
          summary: "Missing dependency",
          hypotheses: [
            {
              title: "foo not installed",
              confidence: "high",
              evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
              next_steps: ["pnpm add foo"],
            },
          ],
          patches: [],
        });
      },
    };
    const report = await analyzeContext(baseContext, llm);
    expect(report.hypotheses).toHaveLength(1);
    expect(report.hypotheses[0]!.title).toBe("foo not installed");
  });

  it("retries once on invalid JSON then errors status", async () => {
    let calls = 0;
    const llm: LlmClient = {
      async complete() {
        calls += 1;
        return "NOT JSON";
      },
    };
    const report = await analyzeContext(baseContext, llm);
    expect(calls).toBe(2);
    expect(report.status).toBe("error");
  });
});
```

- [ ] **Step 2: Implement analyze + llm**

```ts
// packages/core/src/llm.ts
import type { LlmClient } from "./types.js";

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function createOpenAiCompatClient(config: OpenAiCompatConfig): LlmClient {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
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
```

```ts
// packages/core/src/analyze.ts
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
```

Export `analyzeContext`, `createOpenAiCompatClient`.

- [ ] **Step 3: Test PASS + commit**

```bash
pnpm --filter @ci-autopsy/core test
git add packages/core/src/analyze.ts packages/core/src/llm.ts packages/core/src/analyze.test.ts packages/core/src/index.ts
git commit -m "feat(core): LLM analyzer with JSON repair and evidence filter"
```

---

### Task 8: GitHub collect + publish (unit-tested with injected Octokit-like client)

**Files:**
- Create: `packages/core/src/github.ts`, `packages/core/src/github.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Define a narrow GitHub port and tests**

```ts
// packages/core/src/github.ts
export interface GhPullsListResponse {
  data: Array<{ number: number }>;
}

export interface GhIssueComment {
  id: number;
  body?: string | null;
}

export interface GitHubApi {
  actions: {
    downloadJobLogsForWorkflowRun: (params: {
      owner: string;
      repo: string;
      job_id: number;
    }) => Promise<{ data: ArrayBuffer | string }>;
    listJobsForWorkflowRun: (params: {
      owner: string;
      repo: string;
      run_id: number;
    }) => Promise<{
      data: {
        jobs: Array<{
          id: number;
          name: string;
          conclusion: string | null;
          steps?: Array<{ name: string; conclusion: string | null }>;
        }>;
      };
    }>;
  };
  pulls: {
    list: (params: {
      owner: string;
      repo: string;
      state: "open";
      head: string;
    }) => Promise<GhPullsListResponse>;
    get: (params: {
      owner: string;
      repo: string;
      pull_number: number;
      mediaType?: { format: string };
    }) => Promise<{ data: string | { body?: string } }>;
  };
  issues: {
    listComments: (params: {
      owner: string;
      repo: string;
      issue_number: number;
      per_page?: number;
    }) => Promise<{ data: GhIssueComment[] }>;
    createComment: (params: {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }) => Promise<{ data: GhIssueComment }>;
    updateComment: (params: {
      owner: string;
      repo: string;
      comment_id: number;
      body: string;
    }) => Promise<{ data: GhIssueComment }>;
  };
}

export function parseOwnerRepo(repoFull: string): { owner: string; repo: string } {
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo: ${repoFull}`);
  return { owner, repo };
}

export async function collectFailedJobLogs(
  api: GitHubApi,
  repoFull: string,
  runId: number,
): Promise<{ jobName: string; failedSteps: string[]; logs: string }> {
  const { owner, repo } = parseOwnerRepo(repoFull);
  const jobs = await api.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  const failed = jobs.data.jobs.filter((j) => j.conclusion === "failure");
  if (failed.length === 0) {
    return { jobName: "", failedSteps: [], logs: "" };
  }
  const job = failed[0]!;
  const failedSteps =
    job.steps?.filter((s) => s.conclusion === "failure").map((s) => s.name) ??
    [];
  const logRes = await api.actions.downloadJobLogsForWorkflowRun({
    owner,
    repo,
    job_id: job.id,
  });
  const logs =
    typeof logRes.data === "string"
      ? logRes.data
      : new TextDecoder().decode(logRes.data);
  return { jobName: job.name, failedSteps, logs };
}

export async function publishPrComment(
  api: GitHubApi,
  repoFull: string,
  issueNumber: number,
  markdown: string,
  markerId: string,
): Promise<"created" | "updated"> {
  const { owner, repo } = parseOwnerRepo(repoFull);
  const marker = `<!-- ci-autopsy:run_id=${markerId} -->`;
  const comments = await api.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.data.find((c) => c.body?.includes("<!-- ci-autopsy:run_id="));
  // Prefer match on same marker id; else update any ci-autopsy comment
  const same =
    comments.data.find((c) => c.body?.includes(marker)) ?? existing;
  if (same) {
    await api.issues.updateComment({
      owner,
      repo,
      comment_id: same.id,
      body: markdown,
    });
    return "updated";
  }
  await api.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: markdown,
  });
  return "created";
}
```

```ts
// packages/core/src/github.test.ts
import { describe, it, expect, vi } from "vitest";
import { collectFailedJobLogs, publishPrComment } from "./github.js";
import type { GitHubApi } from "./github.js";

describe("github helpers", () => {
  it("collects logs for first failed job", async () => {
    const api: GitHubApi = {
      actions: {
        listJobsForWorkflowRun: async () => ({
          data: {
            jobs: [
              {
                id: 9,
                name: "test",
                conclusion: "failure",
                steps: [{ name: "Run tests", conclusion: "failure" }],
              },
            ],
          },
        }),
        downloadJobLogsForWorkflowRun: async () => ({
          data: "Error: boom",
        }),
      },
      pulls: { list: vi.fn() as never, get: vi.fn() as never },
      issues: {
        listComments: vi.fn() as never,
        createComment: vi.fn() as never,
        updateComment: vi.fn() as never,
      },
    };
    const out = await collectFailedJobLogs(api, "acme/demo", 1);
    expect(out.logs).toContain("boom");
    expect(out.failedSteps).toEqual(["Run tests"]);
  });

  it("updates existing autopsy comment", async () => {
    const updateComment = vi.fn(async () => ({ data: { id: 1 } }));
    const createComment = vi.fn(async () => ({ data: { id: 2 } }));
    const api: GitHubApi = {
      actions: {
        listJobsForWorkflowRun: vi.fn() as never,
        downloadJobLogsForWorkflowRun: vi.fn() as never,
      },
      pulls: { list: vi.fn() as never, get: vi.fn() as never },
      issues: {
        listComments: async () => ({
          data: [
            {
              id: 42,
              body: "<!-- ci-autopsy:run_id=old -->\nhello",
            },
          ],
        }),
        createComment: createComment as never,
        updateComment: updateComment as never,
      },
    };
    const result = await publishPrComment(
      api,
      "acme/demo",
      7,
      "<!-- ci-autopsy:run_id=new -->\nworld",
      "new",
    );
    expect(result).toBe("updated");
    expect(updateComment).toHaveBeenCalled();
    expect(createComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test PASS + commit**

```bash
pnpm --filter @ci-autopsy/core test
git add packages/core/src/github.ts packages/core/src/github.test.ts packages/core/src/index.ts
git commit -m "feat(core): collect failed job logs and idempotent PR comments"
```

---

### Task 9: Pipeline orchestration (TDD)

**Files:**
- Create: `packages/core/src/pipeline.ts`, `packages/core/src/pipeline.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write pipeline tests**

```ts
// packages/core/src/pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { runAutopsyPipeline } from "./pipeline.js";
import type { ContextPack, LlmClient, Publisher } from "./types.js";

const ctx: ContextPack = {
  repo: "acme/demo",
  failedSteps: ["test"],
  logExcerpts: "raw secret Authorization: Bearer ghp_abcdefghijklmnopqrstuvwx\nCannot find module 'foo'",
  ecosystemHints: ["node"],
  runUrl: "https://example.com/run/1",
};

describe("runAutopsyPipeline", () => {
  it("redacts, analyzes, renders, publishes", async () => {
    const llm: LlmClient = {
      async complete(prompt: string) {
        expect(prompt).not.toContain("ghp_");
        expect(prompt).toContain("Cannot find module 'foo'");
        return JSON.stringify({
          status: "ok",
          summary: "missing foo",
          hypotheses: [
            {
              title: "dep",
              confidence: "high",
              evidence: [{ source: "log", quote: "Cannot find module 'foo'" }],
              next_steps: ["install"],
            },
          ],
          patches: [],
        });
      },
    };
    const publish = vi.fn(async () => {});
    const publisher: Publisher = { publish };
    const result = await runAutopsyPipeline({
      context: ctx,
      llm,
      publisher,
      options: { markerId: "run-1" },
    });
    expect(result.report.hypotheses).toHaveLength(1);
    expect(result.markdown).toContain("ci-autopsy:run_id=run-1");
    expect(publish).toHaveBeenCalled();
    expect(result.softFailed).toBe(false);
  });

  it("soft-fails when llm throws", async () => {
    const llm: LlmClient = {
      async complete() {
        throw new Error("network down");
      },
    };
    const result = await runAutopsyPipeline({
      context: ctx,
      llm,
      options: { markerId: "run-1" },
    });
    // analyzeContext catches and returns status error without throwing
    expect(result.report.status).toBe("error");
  });
});
```

- [ ] **Step 2: Implement pipeline**

```ts
// packages/core/src/pipeline.ts
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
```

- [ ] **Step 3: Test PASS + commit**

```bash
pnpm --filter @ci-autopsy/core test
git add packages/core/src/pipeline.ts packages/core/src/pipeline.test.ts packages/core/src/index.ts
git commit -m "feat(core): end-to-end autopsy pipeline"
```

---

### Task 10: CLI adapter

**Files:**
- Create: `packages/cli/src/main.ts`
- Modify: `packages/cli/package.json` if needed

- [ ] **Step 1: Implement CLI**

```ts
// packages/cli/src/main.ts
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
```

Ensure `packages/core` exports `createOpenAiCompatClient` and `runAutopsyPipeline` from `index.ts`.

- [ ] **Step 2: Build**

```bash
pnpm --filter @ci-autopsy/core build
pnpm --filter @ci-autopsy/cli build
```

Expected: `packages/cli/dist/main.js` exists.

- [ ] **Step 3: Smoke with mock-free offline path (optional)**

If no API key in CI, skip live smoke. Locally with key:

```bash
echo "Error: Cannot find module 'foo'" > /tmp/log.txt
LLM_API_KEY=... pnpm --filter @ci-autopsy/cli exec node dist/main.js --log /tmp/log.txt
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli packages/core/src/index.ts
git commit -m "feat(cli): local ci-autopsy command for log files"
```

---

### Task 11: GitHub Action adapter + action.yml

**Files:**
- Create: `packages/action/src/main.ts`
- Create: `action.yml`
- Optionally document bundling: for marketplace simplicity, run via `node packages/action/dist/main.js` after checkout of this repo, or use `ncc` later. v1: composite-style node entry in-repo.

- [ ] **Step 1: Implement action main**

```ts
// packages/action/src/main.ts
import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  collectFailedJobLogs,
  createOpenAiCompatClient,
  publishPrComment,
  runAutopsyPipeline,
  type GitHubApi,
} from "@ci-autopsy/core";
import { Octokit } from "@octokit/rest";

async function main() {
  const strict = core.getBooleanInput("strict");
  const apiKey = core.getInput("llm_api_key") || process.env.LLM_API_KEY || "";
  const baseUrl = core.getInput("llm_base_url") || process.env.LLM_BASE_URL;
  const model = core.getInput("llm_model") || process.env.LLM_MODEL;
  const token = core.getInput("github_token") || process.env.GITHUB_TOKEN || "";

  if (!apiKey) {
    core.warning("No llm_api_key; skipping autopsy");
    if (strict) core.setFailed("llm_api_key required in strict mode");
    return;
  }
  if (!token) {
    core.warning("No github_token; skipping autopsy");
    if (strict) core.setFailed("github_token required in strict mode");
    return;
  }

  const octokit = new Octokit({ auth: token });
  const api = octokit as unknown as GitHubApi;
  const { owner, repo } = github.context.repo;
  const repoFull = `${owner}/${repo}`;
  const runId = github.context.runId;

  const collected = await collectFailedJobLogs(api, repoFull, runId);
  if (!collected.logs) {
    core.info("No failed job logs found; nothing to autopsy");
    return;
  }

  const prNumber =
    github.context.payload.pull_request?.number ??
    (await resolvePrNumber(api, repoFull, github.context.ref));

  const llm = createOpenAiCompatClient({ apiKey, baseUrl, model });
  const markerId = String(runId);

  const result = await runAutopsyPipeline({
    context: {
      repo: repoFull,
      branch: github.context.ref,
      sha: github.context.sha,
      workflow: github.context.workflow,
      job: collected.jobName,
      runUrl: `${github.context.serverUrl}/${repoFull}/actions/runs/${runId}`,
      failedSteps: collected.failedSteps,
      logExcerpts: collected.logs,
      ecosystemHints: [],
    },
    llm,
    publisher: prNumber
      ? {
          async publish(markdown, id) {
            await publishPrComment(api, repoFull, prNumber, markdown, id);
          },
        }
      : undefined,
    options: { markerId, strict },
  });

  if (!prNumber) {
    core.summary.addRaw(result.markdown);
    await core.summary.write();
    core.info("No PR number; wrote job summary only");
  }

  if (result.softFailed && strict) {
    core.setFailed(result.errorMessage ?? "autopsy soft-failed");
  }
}

async function resolvePrNumber(
  api: GitHubApi,
  repoFull: string,
  ref: string,
): Promise<number | undefined> {
  // best-effort: leave undefined if not a PR build
  void api;
  void repoFull;
  void ref;
  return undefined;
}

main().catch((e) => {
  // soft-fail default
  core.warning(e instanceof Error ? e.message : String(e));
});
```

Export `GitHubApi`, `collectFailedJobLogs`, `publishPrComment` from core index. Add `@octokit/rest` to action package dependencies if not using github.getOctokit only — prefer:

```ts
const octokit = github.getOctokit(token);
```

and cast to `GitHubApi`.

- [ ] **Step 2: Write `action.yml`**

```yaml
name: CI Autopsy
description: Post an evidence-backed autopsy comment when CI fails
author: ci-autopsy
inputs:
  github_token:
    description: Token with pull-requests:write
    required: false
    default: ${{ github.token }}
  llm_api_key:
    description: OpenAI-compatible API key
    required: true
  llm_base_url:
    description: OpenAI-compatible base URL
    required: false
    default: https://api.openai.com/v1
  llm_model:
    description: Model name
    required: false
    default: gpt-4o-mini
  strict:
    description: Fail the job if autopsy fails
    required: false
    default: "false"
runs:
  using: node20
  main: packages/action/dist/main.js
```

Note: For external consumers, v1 documents `uses: ./` from this repo after build, or publish later. Self-test builds before invoke.

- [ ] **Step 3: Build action package + commit**

```bash
pnpm --filter @ci-autopsy/core build
pnpm --filter @ci-autopsy/action build
git add packages/action action.yml packages/core/src/index.ts
git commit -m "feat(action): GitHub Action entrypoint for CI autopsy"
```

---

### Task 12: Demo fixtures F1–F3 + self-test workflow

**Files:**
- Create: `demos/failing-node/**` as needed
- Create: `.github/workflows/self-test.yml`
- Create: example consumer workflow snippet in README (Task 13)

- [ ] **Step 1: Create three intentional failures under demos**

Minimal approach: one package with three scripts:

`demos/failing-node/package.json`:
```json
{
  "name": "failing-node-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "f1": "node -e \"require('definitely-missing-package-xyz')\"",
    "f2": "tsc -p tsconfig.f2.json",
    "f3": "node --test src/test-break.test.js"
  }
}
```

`demos/failing-node/src/type-break.ts`:
```ts
export const n: number = "not-a-number";
```

`demos/failing-node/tsconfig.f2.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16"
  },
  "include": ["src/type-break.ts"]
}
```

`demos/failing-node/src/test-break.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";

test("intentional fail", () => {
  assert.equal(1, 2);
});
```

- [ ] **Step 2: Unit self-test workflow (always on PR)**

`.github/workflows/self-test.yml`:
```yaml
name: self-test
on:
  push:
    branches: [master, main]
  pull_request:
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 3: Locally verify fixtures fail as intended**

```bash
cd demos/failing-node && npm pkg get name
node -e "require('definitely-missing-package-xyz')" ; echo exit:$?
# expect non-zero
```

- [ ] **Step 4: Commit**

```bash
git add demos .github/workflows/self-test.yml
git commit -m "test: add failing-node demo fixtures and unit self-test workflow"
```

---

### Task 13: README (portfolio narrative)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README covering**

1. One-liner + GIF/screenshot placeholder  
2. Quick start (~15 line workflow using `if: failure()`)  
3. Architecture diagram (mermaid)  
4. Evidence rules  
5. Security (redaction + data leaves runner to LLM)  
6. Demo fixtures table F1–F3  
7. CLI usage  
8. Non-goals  

Example workflow snippet to include:

```yaml
- name: CI Autopsy
  if: failure()
  uses: ./
  with:
    llm_api_key: ${{ secrets.LLM_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

Permissions block:
```yaml
permissions:
  contents: read
  pull-requests: write
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install path, architecture, and demo story"
```

---

### Task 14: Final verification gate

- [ ] **Step 1: Run full local verification**

```bash
cd F:/Github/ci-autopsy-agent
pnpm install
pnpm test
pnpm build
pnpm typecheck
```

Expected: all green.

- [ ] **Step 2: Spec coverage checklist (human/agent)**

| Spec requirement | Task |
|------------------|------|
| Installable Action | 11, 13 |
| Evidence-backed report | 5, 7 |
| Redaction | 3, 9 |
| Soft-fail default | 9, 11 |
| Idempotent comment marker | 6, 8 |
| Demo F1–F3 | 12 |
| CLI | 10 |
| Non-goals respected | 13 (docs), no auto-fix tasks |

- [ ] **Step 3: Final commit if any polish left**

```bash
git status
# commit only if needed
```

---

## Plan self-review

**Spec coverage:** Collector, compressor, analyzer, publisher, soft-fail, markers, demos, CLI, Action, security redaction, OpenAI-compatible client — all have tasks. Memory/auto-PR explicitly omitted.

**Placeholders:** None intentional; Action `resolvePrNumber` is intentionally stubbed with PR payload primary path (matches design: PR comment primary).

**Type consistency:** `AutopsyReport`, `ContextPack`, `LlmClient`, `Publisher`, `GitHubApi`, `runAutopsyPipeline`, `filterReportEvidence`, `parseAutopsyReport` names are stable across tasks.

**Risk note for implementers:** GitHub `downloadJobLogsForWorkflowRun` returns a redirect/binary; if Octokit typing differs, adapt in Task 8 to follow redirects and decode text without changing the public pipeline API.
