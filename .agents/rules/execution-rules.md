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

## 4. Strict Test-Driven Development (TDD) & Permanent Suite Expansion
- **Write Tests FIRST (RED Phase)**:
  - Tests must ALWAYS be written first based strictly on functional requirements, mathematical specifications, contract boundaries, and edge cases BEFORE writing or modifying any application code.
  - NEVER write code first and then write tests after the fact to cater to or rubber-stamp the code. The tests define the specification; the code must conform to the tests, not vice-versa.
  - Always execute the test runner to prove that the newly written tests FAIL first (RED phase confirmation).
- **Implement Minimal Code (GREEN Phase)**:
  - Implement only the minimal code necessary to make the failing tests pass cleanly.
- **Append to Permanent Test Suite**:
  - For every newly added function, calculation, service, or API route, ALWAYS append new tests to the repository's permanent test suite (`tests/` for Pytest unit/integration tests and `tests/e2e/` for Playwright browser tests).
  - Never use one-off throwaway test scripts or discard tests after implementation. The permanent suite must grow alongside feature additions.
- **Regression Prevention**:
  - Run the full test suite (`pytest tests/` and relevant Playwright E2E tests) to verify correctness and prevent any regressions across existing modules.

## 5. Automated Documentation Sync (Docs Updater)
- Whenever new functional capabilities, endpoints, or features are added or modified, update `README.md` to document the user-facing capability, endpoints, and behaviors.
- Keep documentation clean, concise, and professional; never expose environment variables, tokens, or local credentials.

## 6. Decision Trail & Transparency (Show Me Your Work)
- Maintain an append-only decision trail in `decisions.tsv` with format: `ts	phase	decision	why	evidence	result`.
- At the end of every implementation run, provide a structured report summarizing:
  - **What changed**: Concrete file modifications and features added.
  - **Why**: Design decisions, architectural rationale, and tradeoffs.
  - **Evidence & Verification**: Test results, test IDs, and build outputs verifying the work.