# Contributing

Thanks for helping improve Markra. Contributions can be product polish, Markdown editing fixes, AI provider work, cross-platform desktop fixes, documentation, tests, or issue triage.

## Development Setup

Use `pnpm` for all JavaScript workflows.

```bash
pnpm install
pnpm dev
```

Common commands:

- `pnpm dev` starts the desktop app development workflow.
- `pnpm test` runs package tests.
- `pnpm build` builds all packages that define a build script.
- `pnpm tauri ...` forwards Tauri commands to the desktop app.

## Project Layout

- `apps/desktop` contains the Tauri desktop shell.
- `apps/web` contains the browser-hosted editor.
- `packages/app` contains the shared React app surface and product UI.
- `packages/editor` contains Milkdown editor integrations.
- `packages/ai` contains agent runtime, tools, and AI document flows.
- `packages/providers` contains provider catalogs, settings, and request shaping.
- `packages/markdown` contains Markdown parsing and asset/path helpers.
- `packages/shared` contains cross-cutting types, i18n, and small pure utilities.
- `packages/ui` contains reusable UI primitives.

Keep reusable code inside the package that owns the responsibility. Avoid putting desktop-only bridge code in shared packages.

## Testing

Add focused tests when changing product behavior, editor behavior, AI flows, file reliability, provider request handling, or platform integration.

Text-only documentation, copy, comment, and static help text changes do not need unit tests. For configuration or packaging changes, use the smallest relevant build or integration check instead of adding tests just for the config file.

Before opening a pull request, run the smallest useful verification for your change. Common checks are:

```bash
pnpm test
pnpm build
```

## Code Style

- Keep changes small and focused.
- Prefer existing patterns and local helpers over new abstractions.
- Use Tailwind CSS for app styling where practical.
- Prefer `lucide-react` icons for UI controls.
- Do not add a new dependency unless the current stack cannot reasonably handle the job.
- Do not use the TypeScript `void` keyword or operator.
- Keep Markdown files portable and avoid proprietary document formats.

## Pull Requests

Good pull requests usually include:

- A short summary of the user-facing change.
- The files or packages affected.
- The verification command you ran and its result.
- Screenshots or video for visible UI changes.
- Any follow-up work or known limitations.

If your change touches both desktop and web behavior, call out the difference explicitly.

## Releases And Changelog

Release versions are bumped through:

```bash
pnpm release
```

The release bump config updates package versions, syncs desktop metadata, updates the Cargo lockfile, and runs `conventional-changelog` so `CHANGELOG.md` is included in the release changes.

To regenerate the full changelog history from tags:

```bash
pnpm changelog:all
```

Use Conventional Commit subjects such as `feat(app): add quick open` or `fix(editor): preserve selection` so the changelog generator can classify entries correctly.
