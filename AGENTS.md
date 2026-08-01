# Markra Engineering Guidelines

This document only defines engineering conventions for this repository.

## Package Management

- Use `pnpm` for all JavaScript and frontend dependency workflows.
- This repository is a pnpm workspace. The desktop app lives in `apps/desktop`; reusable TypeScript packages live in `packages/`.
- Common commands:
  - `pnpm install`
  - `pnpm dev`
  - `pnpm test`
  - `pnpm build`
  - `pnpm tauri ...`
- Keep `pnpm-lock.yaml`.
- Do not add `package-lock.json`, `yarn.lock`, `bun.lockb`, or lockfiles from other package managers.

## Tech Stack

- Desktop shell: Tauri v2.
- Frontend: React, TypeScript, CodeMirror 6, and Tailwind CSS.
- Icons: prefer `lucide-react`.
- Styling should use Tailwind CSS as much as practical. Global CSS should be reserved for design tokens, base styles, CodeMirror/Markdown generated content, and platform-level polish.

## Code Organization

- Keep changes small and focused.
- Avoid unrelated refactors.
- Apps belong in `apps/`; reusable packages belong in `packages/`.
- Current package boundaries:
  - `packages/shared`: cross-cutting types, i18n, small pure utilities, and runtime debug logging.
  - `packages/ai`: AI provider settings, provider requests, agent runtime, AI tools, and web search tools.
  - `packages/editor`: CodeMirror editor extensions, shortcuts, live preview, AI preview, and selection handling.
  - `packages/editor-react`: React bindings and extension UI for the CodeMirror editor core.
  - `packages/markdown`: Markdown parsing and Markdown asset/path helpers.
- Keep Tauri frontend bridge code in `apps/desktop/src/lib/tauri`; it is app shell integration, not a shared package.
- Keep desktop-only build tooling such as the debug-strip Vite plugin in `apps/desktop/scripts/`.
- Keep shared cross-cutting TypeScript in `packages/shared` and import it through `@markra/shared` public exports.
- Split reusable UI into components instead of concentrating layout and behavior in `App.tsx`.
- Keep business logic, platform integration, and editor adapter logic in clear modules.
- Prefer established libraries for mature domains such as editor behavior, Markdown parsing, and platform APIs.
- Do not use the TypeScript `void` keyword or operator. Use `unknown`, omit explicit callback return annotations when practical, or call promises directly with their own error handling.
- Do not revert user changes unless explicitly requested.

## CodeMirror Editor Invariants

- Treat the Markdown document, `EditorState`, and explicit editor configuration as the source of truth. Do not use DOM shape, focus state, selection state, component lifetime, or session-local maps to decide persistent document semantics or steady-state layout.
- Structural preview output must be deterministic: recreating the editor with the same document and configuration must produce the same decorations, visible rows, and vertical geometry. Test recreation whenever a change classifies, hides, replaces, folds, or resizes source lines.
- Keep transient state limited to transient interaction UI such as marker reveal, hover controls, drag feedback, and IME composition. Transient state must not change the settled height or ownership of Markdown lines after blur, click, mode switch, or reopen.
- Use CodeMirror transactions, `StateField`, facets, view plugins, decorations, and widgets for editor behavior. Do not directly mutate CodeMirror-managed DOM or read it back as application state.
- CSS that changes CodeMirror geometry requires editor-level review. Avoid generic `height`, `line-height`, `display`, margin, or padding rules on `.cm-line`, `.cm-content`, generated `<br>` elements, or other CodeMirror-managed nodes. If a source line must be hidden or collapsed, preserve measurable layout with an explicit CodeMirror decoration or block widget and verify caret hit testing and selection mapping.
- Keep authored blank-line height separate from semantic block spacing. Paragraph or block spacing tokens must not be used to resize editable source lines; represent non-editable structural spacing independently.
- Decorations and widgets must not mutate document text. Source changes belong in explicit editing commands, and one keyboard action must have a predictable source transformation and selection result.
- Before classifying blank lines or block boundaries, account for preformatted and renderer-owned regions, including frontmatter, fenced and indented code, Mermaid, HTML, math, tables, images, lists, blockquotes, headings, and horizontal rules as applicable.
- Any change to line visibility, vertical spacing, Enter, Backspace, or caret movement must test the relevant matrix: line start/end and repeated input, typing after blank lines, one-step deletion, range and multi-cursor selection, focus/blur, pointer clicks, editor recreation, file reopen, and Preview/Source/Split transitions.
- For visual geometry changes, supplement unit tests with runtime browser or desktop QA. Verify both rendered layout and the underlying Markdown text; DOM snapshots or CSS string assertions alone are not sufficient evidence.

## Testing Boundaries

- Add or update focused tests when changing business logic, user-facing behavior, editor behavior, file reliability, AI flows, or other product functionality.
- Configuration files and other code that does not implement business logic or product functionality do not require unit tests.
- Text-only changes do not require unit tests, including copy edits, label wording, placeholder text, static help text, and translation wording updates.
- Removed features do not need dedicated unit tests that only prove the feature no longer exists. Prefer deleting obsolete tests and keeping coverage focused on the remaining supported behavior.
- The following do not require unit tests by default: `package.json`, lockfiles, `tsconfig` files, Vite config, Tauri config, generated files, build scripts, static metadata, documentation, pure formatting changes, and pure styling changes.
- If a configuration change affects runtime behavior, verify it with the relevant command or integration build instead of forcing a unit test for the configuration file itself.
- Before reporting completion for code changes, run the smallest meaningful verification. Common checks are `pnpm test` and `pnpm build`; desktop packaging changes can use `pnpm tauri build --debug` when practical.

## Repository Hygiene

- Do not commit generated directories such as `node_modules/`, `dist/`, or `apps/*/src-tauri/target/`.
- Do not commit temporary caches, debug artifacts, or local environment files.
- Confirm that a new dependency is actually needed before adding it.
- Prefer reusing the current stack over introducing additional frameworks or tools.
- Update this document when repository-wide conventions change.
