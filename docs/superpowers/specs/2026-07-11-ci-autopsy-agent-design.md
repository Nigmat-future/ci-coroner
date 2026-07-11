# Design: CI 验尸官 Agent (ci-autopsy)

**Date:** 2026-07-11  
**Status:** Draft — pending user review of written spec  
**Mode:** Weekend side project / portfolio nuke  
**Scope version:** v1 — GitHub Action only (Approach A)

## 1. Problem

When a GitHub Actions job fails, developers face long, noisy logs. Finding the root cause is slow and intermittent. Generic “AI summarize my log” wrappers hallucinate and do not ship as an installable product with evidence constraints.

## 2. Product definition

**One-liner:** On GitHub Actions failure, automatically post a structured autopsy report (with evidence) on the related PR or commit so the author can see the most likely break, the log/diff proof, and the next debug step within ~30 seconds.

**Primary user:** Individual developers on side projects / open source who already use GitHub Actions and open PRs.

**Success criteria (portfolio-oriented, measurable):**

1. **Installable:** Target repo can enable the product with ~15 lines of workflow YAML.
2. **Reproducible demo:** Public demo repo with at least three intentional failure classes (dependency, compile/type, test assertion); each produces a credible report.
3. **Evidence constraint:** Every root-cause hypothesis must cite log snippets and/or diff hunks; if evidence is insufficient, confidence is low or status is `insufficient_evidence`.
4. **Narrative complete:** README with architecture diagram, failure-mode table, and a ~1 minute screen recording; interview-ready story on cost, hallucination control, and secret redaction.

**Non-goals (v1):**

- Auto-commit or auto-open fix PRs
- Non-GitHub CI (GitLab, Circle, Jenkins, etc.)
- SaaS accounts, billing, multi-tenant dashboard
- Team analytics / historical memory (reserved for later; no implementation in v1)
- Guaranteeing correct root cause on every failure

## 3. Architecture

### 3.1 Components

| Component | Responsibility |
|-----------|----------------|
| **Trigger workflow** (user-facing YAML) | `workflow_run` or job-level failure path; pass token, run metadata, optional model secrets |
| **Collector** | Resolve failed jobs; download/fetch logs; get PR number + diff when available; redact secrets |
| **Compressor** | Score and keep high-signal log lines (errors, FAIL, Traceback, exit codes, last N lines per failed step); hard cap tokens |
| **Analyzer** | Call LLM with strict JSON schema; require evidence quotes that appear in provided context |
| **Publisher** | Render markdown report; post PR comment or commit status/comment; idempotent update by marker |
| **Demo fixtures** | Three known-fail workflows + expected report shape for regression |

```
GitHub Actions failure
        │
        ▼
   Collector ──► redacted logs + optional PR diff + metadata
        │
        ▼
   Compressor ──► capped context pack
        │
        ▼
   Analyzer (LLM, JSON schema)
        │
        ▼
   Publisher ──► PR comment / commit annotation
```

### 3.2 Runtime choices

- **Language:** TypeScript (Node 20+) for Action + CLI parity.
- **Action packaging:** JavaScript composite or thin Node action wrapping the same `packages/core` library.
- **LLM (v1 default):** OpenAI-compatible Chat Completions (env-configured base URL + model). Users supply their own API key via GitHub Actions secrets.
- **Auth:** `GITHUB_TOKEN` or `pull-requests: write` capable token for comments; API key only for LLM provider.

### 3.3 Extension points (not built in v1)

- Failure-pattern memory store
- Auto-patch PR publisher
- Multi-CI adapters

Interfaces should not hard-block these, but no code paths are required beyond clean module boundaries.

## 4. Data flow and interfaces

### 4.1 Happy path

1. User workflow fails (or a dedicated `workflow_run` observer sees a failed run).
2. Collector loads failed job logs via GitHub API; resolves associated PR when possible; fetches PR diff (truncated).
3. Redaction pass removes common secret patterns and GitHub-provided masked values where detectable.
4. Compressor produces a context pack under a configured max character/token budget.
5. Analyzer returns structured JSON (schema below).
6. Publisher posts or updates a single markdown comment with a stable HTML marker for idempotency.

### 4.2 Context pack (analyzer input)

- Repo full name, branch, SHA, workflow name, job name, run URL
- Failed step names
- Compressed log excerpts (each with stable line anchors / labels)
- Optional unified diff excerpts (truncated)
- Language/ecosystem hints when detectable (e.g. presence of `package.json`, `pytest` output)

### 4.3 Report schema (analyzer output)

```json
{
  "status": "ok | insufficient_evidence | error",
  "summary": "one short paragraph",
  "hypotheses": [
    {
      "title": "string",
      "confidence": "high | medium | low",
      "evidence": [
        { "source": "log | diff", "quote": "must appear verbatim in context" }
      ],
      "next_steps": ["string"]
    }
  ],
  "patches": [
    {
      "path": "optional file path",
      "description": "what to change",
      "unified_diff": "optional, only if high confidence"
    }
  ]
}
```

**Validation rules:**

- Each `evidence.quote` must be a substring of the provided context pack (post-check in code; drop or downrank violating hypotheses).
- Max 3 hypotheses, ordered by confidence.
- Prefer `insufficient_evidence` over fabricated certainty.

### 4.4 Trigger sketch (user workflow)

Minimal integration goal: ~15 lines. Preferred patterns (pick one in implementation plan):

- **A.** Last step in existing jobs: `if: failure()` run `ci-autopsy`
- **B.** Separate workflow on `workflow_run` completed + conclusion failure (cleaner, slightly more setup)

v1 implementation should support at least pattern A; B is nice-to-have if time allows.

### 4.5 Idempotency

Comments include a hidden marker, e.g. `<!-- ci-autopsy:run_id=... -->`. Re-runs update the existing comment when found instead of spamming.

## 5. Error handling

| Failure | Behavior |
|---------|----------|
| No failed jobs / empty logs | Comment or job summary: cannot autopsy; exit 0 |
| GitHub API rate limit / transient errors | Retry with backoff (bounded); then soft-fail with visible message |
| LLM timeout / 5xx | Soft-fail: post “autopsy unavailable” note; **do not** fail the user’s main pipeline unless `strict: true` |
| LLM returns invalid JSON | One repair retry; then soft-fail |
| Evidence quotes not in context | Strip hypothesis or force low confidence / `insufficient_evidence` |
| Missing API key | Clear setup error in logs + soft-fail comment if possible |
| Secrets in logs | Redact before model; never echo raw secrets in comments |

Default exit code policy: **soft-fail (exit 0)** so autopsy never blocks merge pipelines. Optional `strict: true` for power users.

## 6. Evaluation and demo

### 6.1 Fixture suite (minimum three)

| ID | Class | Intentional bug | Expectation |
|----|-------|-----------------|-------------|
| F1 | Dependency | Bad pin / missing module | Points at install/resolve error lines |
| F2 | Compile/type | TypeScript or similar break | Points at compiler error + file |
| F3 | Test assertion | Failing unit test | Points at assertion + test name |

Each fixture has: workflow, broken code, and a lightweight assertion on report shape (status, ≥1 hypothesis, ≥1 evidence quote match).

### 6.2 Manual portfolio bar

- Demo repo public
- README architecture + failure table
- Screen recording of red X → autopsy comment

## 7. Repository layout

```
ci-autopsy-agent/
  action.yml
  packages/
    core/          # collect, compress, analyze, publish, redact
    cli/           # local: ci-autopsy --log file --diff file
  demos/
    failing-node/  # F1–F3 style demos (or split folders)
  docs/
    superpowers/
      specs/
        2026-07-11-ci-autopsy-agent-design.md
  .github/workflows/
    self-test.yml
  README.md
  package.json     # pnpm workspace root
```

**Tooling:** pnpm workspaces, TypeScript, Vitest for unit tests (redaction, compression, evidence validation).

## 8. Security and privacy

- Redact tokens, passwords, `Authorization` headers, private keys patterns before LLM call.
- Do not log API keys.
- Document that log content leaves GitHub runners toward the configured LLM provider (user choice / key).
- Prefer minimal `permissions:` in example workflows (`contents: read`, `pull-requests: write`).

## 9. Implementation phases (indicative)

1. **Core library:** redact + compress + schema validate (no LLM; unit tests).
2. **Analyzer + publisher:** mock LLM first, then live provider.
3. **Action wiring:** `action.yml` + example workflow.
4. **Demo fixtures F1–F3** + self-test workflow.
5. **README + recording script** for portfolio.

## 10. Risks

| Risk | Mitigation |
|------|------------|
| LLM hallucination | Evidence substring check; confidence labels; insufficient_evidence path |
| Log noise / context overflow | Aggressive compressor; step-aware tail; hard caps |
| Cost spikes | Cap max tokens; skip success paths; document model choice |
| Comment spam | Idempotent marker update |
| Scope creep into “auto-fix SaaS” | Explicit non-goals; reject feature adds until fixtures pass |

## 11. Decisions log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery vehicle | GitHub Action first | Highest demo density for portfolio; real install path |
| Auto-fix commits | Out of scope v1 | Trust + safety; weekend scope |
| Memory of past failures | Out of scope v1 | Extension point only |
| Stack | TypeScript / pnpm | Action ecosystem fit |
| LLM | User-supplied OpenAI-compatible API | No vendor lock-in for base URL; simple ops |

## 12. Open questions (resolved for v1 unless user overrides)

- Multi-provider UI: **not in v1** (env config only).
- Commit comment vs check run annotation: **PR comment primary**; commit annotation optional stretch.
- Languages beyond Node demos: **core log-agnostic**; demos may start Node/TS only.
