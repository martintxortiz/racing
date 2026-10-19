<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Context discipline

- Read only the files the task touches.
- Docs before code. Need an endpoint's behavior? Read the API docs. Open the implementation only if docs are missing or behavior contradicts them. http://(api-url)/docs or /docs from the root.
- Trace the flow your change touches, end to end. Nothing more.
- Debugging: follow the symptom to the root cause. Fix it once, where all callers route through.

## Simplicity

Use the first option that works, in this order:

1. Doesn't need to exist → skip it, say so in one line (YAGNI).
2. Already in the codebase → reuse it.
3. Stdlib → use it.
4. Native platform feature (HTML, CSS, DB constraint) → use it.
5. Installed dependency → use it. Never add one for what a few lines can do.
6. One line → one line.
7. Otherwise: minimum code that works.

## Rules

- No abstractions with one implementation. No boilerplate "for later".
- Delete and reuse before adding. Boring over clever.
- Fewest files, shortest working diff.
- Complex request? Ship the simple version, note what fuller would add, move on.
- Deliberate simplification with a known ceiling: mark it, e.g. `# simplification: global lock, per-account locks if throughput matters`.
- Never rewrite unrelated or in-progress code. Preserve working behavior.

## Never simplify away

- Input validation at trust boundaries.
- Error handling that prevents data loss.
- Security measures.
- Accessibility basics.
- Anything explicitly requested. User insists on full version → build it.
