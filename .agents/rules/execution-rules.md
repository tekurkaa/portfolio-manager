---
trigger: always_on
---

# Antigravity Agent Guidelines

## 1. Plan-Only & Execution Constraints (Strict)
- When the user asks for a plan, design, draft, breakdown, or uses phrases like "do not code yet", "plan only", or "draft first":
  - DO NOT invoke any file-modification tools (`write_file`, `replace_file_content`, etc.) or terminal commands.
  - DO NOT generate an auto-accepted implementation run.
  - Output ONLY plain text / Markdown in the chat.
  - End the response with a clear verification request: "Would you like me to proceed with executing this plan?"
- Only execute code or write files when the user explicitly responds with confirmation (e.g., "proceed", "yes", "implement this").

## 2. Test Integrity & Validation
- Run existing test suites (`pytest tests/` for backend, npm/yarn test for frontend) before marking any multi-step task complete.
- Never modify existing test assertions merely to make a failing test pass unless the business logic explicitly changed.
- Check and respect `design_guidelines.json` whenever modifying frontend components.

## 3. Scope & Non-Destructive Edits
- Do not make speculative refactors to files unrelated to the prompt's explicit scope.
- Prefer targeted patches over rewriting entire multi-hundred-line files from scratch to avoid dropping existing imports or handlers.
- Never expose, hardcode, or alter secrets/environment variables in the repository.