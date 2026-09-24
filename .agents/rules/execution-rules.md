---
trigger: always_on
---

# Antigravity Agent Guidelines

## 1. Plan-Only & Execution Constraints (Strict)
- When the user asks for an implementation plan, design, draft, architectural breakdown, or when discussing anything related to planning/design:
  - NEVER auto-approve the implementation plan under any circumstances.
  - DO NOT invoke any file-modification tools (`write_file`, `replace_file_content`, etc.) or terminal commands.
  - DO NOT start coding, scaffold files, or generate an auto-accepted implementation run.
  - Output ONLY plain text / Markdown in the chat window.
  - Always pause and explicitly ask: "Would you like to proceed with this implementation plan?"
- When the user uses phrases like "do not code yet", "plan only", "draft first", or asks conceptual questions:
  - Treat the session strictly as read-only discussion.
  - Never trigger execution loops or autonomous tool batches.
- Only approve an implementation plan and start executing code or modifying files when the user explicitly responds with unambiguous confirmation (e.g., "proceed", "yes", "implement this", "go ahead").

## 2. Test Integrity & Validation
- Run existing test suites (`pytest tests/` for backend, npm/yarn test for frontend) before marking any multi-step task complete.
- Never modify existing test assertions merely to make a failing test pass unless the business logic explicitly changed.
- Check and respect `design_guidelines.json` whenever modifying frontend components.

## 3. Scope & Non-Destructive Edits
- Do not make speculative refactors to files unrelated to the prompt's explicit scope.
- Prefer targeted patches over rewriting entire multi-hundred-line files from scratch to avoid dropping existing imports or handlers.
- Never expose, hardcode, or alter secrets/environment variables in the repository.

## 4. Test-Driven Development (TDD) Loop
- Whenever adding new features, modifying application logic, or fixing bugs, follow test-driven development:
  - Write failing tests first (RED phase) at the public interface/seam before writing code.
  - Implement only enough minimal code to pass the tests (GREEN phase).
  - Run the test suite (`pytest tests/` and relevant Playwright E2E tests) to verify correctness and prevent regressions.

## 5. Automated Documentation Sync (Docs Updater)
- Whenever new functional capabilities, endpoints, or features are added or modified, update `README.md` to document the user-facing capability, endpoints, and behaviors.
- Keep documentation clean, concise, and professional; never expose environment variables, tokens, or local credentials.

## 6. Decision Trail & Transparency (Show Me Your Work)
- Maintain an append-only decision trail in `decisions.tsv` with format: `ts	phase	decision	why	evidence	result`.
- At the end of every implementation run, provide a structured report summarizing:
  - **What changed**: Concrete file modifications and features added.
  - **Why**: Design decisions, architectural rationale, and tradeoffs.
  - **Evidence & Verification**: Test results, test IDs, and build outputs verifying the work.