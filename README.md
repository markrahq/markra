<p align="center">
  <img src="apps/desktop/app-icon.svg" width="96" alt="Markra logo" />
</p>

<p align="center">
  <strong>A WYSIWYG Markdown editor with native AI.</strong>
  <br />
  <strong>Fully open source. Free to use. Your data stays local.</strong>
</p>

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a> | <a href="https://editor.markra.app/">Web Editor</a> | <a href="#download">Download</a> | <a href="#demo">Demo</a> | <a href="#documentation">Docs</a> | <a href="#comparison">Comparison</a> | <a href="#key-features">Key Features</a> | <a href="#contributing">Contributing</a> | <a href="#contributors">Contributors</a> | <a href="#license">License</a>
</p>

<p align="center">
  <img alt="Desktop" src="https://img.shields.io/badge/Desktop-Tauri-24C8DB" />
  <img alt="Web Editor" src="https://img.shields.io/badge/Web-Editor-2563EB" />
  <img alt="WYSIWYG Markdown" src="https://img.shields.io/badge/Markdown-WYSIWYG-000000" />
  <img alt="Native AI" src="https://img.shields.io/badge/AI-Native-7C3AED" />
  <img alt="Free" src="https://img.shields.io/badge/Free-Open_Source-16A34A" />
  <img alt="Downloads" src="https://img.shields.io/github/downloads/markrahq/markra/total?label=Downloads&amp;color=0EA5E9&amp;cacheSeconds=3600" />
  <img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-important" />
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/murong" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="195" height="54" />
  </a>
  <a href="https://www.producthunt.com/products/markra">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=markra&theme=light" width="250" height="54" alt="Find Markra on Product Hunt" />
  </a>
</p>

Markra is a local-first, open-source Markdown editor that brings AI into the writing flow. Edit in WYSIWYG or source mode, keep everything as plain `.md` files on disk, and let AI polish, rewrite, or expand your content — with full preview before any change lands.

No account required. Files stay on disk by default; optional WebDAV sync, remote image storage, and AI requests only contact the services you configure.

## Screenshots

<p align="center">
  <img src="assets/screenshots/editor-workspace.png" alt="Markra WYSIWYG Markdown workspace" />
</p>

<p align="center">
  <strong>WYSIWYG Markdown editing with local files and the document in one workspace.</strong>
</p>

| Native AI commands | Review AI edits |
| --- | --- |
| ![Markra inline AI command bar](assets/screenshots/inline-ai-command.png) | ![Markra AI edit preview](assets/screenshots/ai-edit-preview.png) |

| Markra AI side panel | Multi-provider AI settings |
| --- | --- |
| ![Markra AI side panel with document context](assets/screenshots/ai-agent-panel.png) | ![Markra AI provider settings](assets/screenshots/ai-provider-settings.png) |

## Download

Use the web editor at [editor.markra.app](https://editor.markra.app/).

On macOS, install with Homebrew:

```sh
brew install --cask markrahq/tap/markra
```

Download the latest desktop builds from [GitHub Releases](https://github.com/markrahq/markra/releases/latest): macOS Apple Silicon/Intel, Windows installer/portable, and Linux AppImage.

## Demo

<p align="center">
  <video src="assets/videos/home_video.mp4" poster="assets/videos/home_video_poster.jpg" controls muted playsinline width="100%"></video>
</p>

<p align="center">
  <a href="assets/videos/home_video.mp4">Open the demo video</a>
</p>

## Documentation

- [Changelog](CHANGELOG.md)
- [Privacy and data flow](docs/privacy.md)
- [Contributing guide](CONTRIBUTING.md)

## Desktop And Web

| Capability | Desktop app | Web editor |
| --- | --- | --- |
| WYSIWYG and source editing | Full editor experience | Full editor experience |
| Open local files and folders | Native dialogs, file paths, and watchers | Browser file picker, folder picker, and file handles |
| File tree operations | Create, rename, move, delete, sort, reveal, and multi-select | Create, rename, move, and delete where browser permissions allow |
| Auto-save and restore | Existing files, tabs, drafts, workspace windows | Browser file handles and IndexedDB state where available |
| AI providers | Native runtime requests with app proxy settings | Browser requests subject to provider CORS support |
| Spellcheck | Markra-managed local spellcheck with on-demand language packs and a personal dictionary | Not available yet |
| Image storage | Local folders, WebDAV, PicGo/PicList, and S3-compatible storage | Local/browser handles and WebDAV where CORS permits |
| Backup and sync | Local backups and WebDAV sync | Not available in the web runtime |
| Export | HTML, PDF, and Pandoc formats when configured | HTML download and browser print/PDF |

## Comparison

Markra is not trying to replace every Markdown tool. It is closest to a calm document editor with native AI and local files.

| Focus | Markra | Typora | Obsidian |
| --- | --- | --- | --- |
| Primary fit | Local-first Markdown writing with built-in AI editing | Minimal live-preview Markdown writing | Personal knowledge base and linked notes |
| Editing model | WYSIWYG document surface plus source mode | Seamless live preview with Markdown syntax hidden while writing | Markdown notes with reading/live-preview editing modes |
| AI workflow | Native inline actions, side panel, and ACP local agents, with preview before applying edits | Not a core product workflow | Not a core product workflow; plugins may vary |
| Spellcheck | Markra-managed local dictionaries, on-demand downloads, correction suggestions, and a personal dictionary | System spellcheck on supported platforms, with Hunspell dictionaries where needed | Electron/Chromium-style editor spellcheck with configurable languages |
| File model | Plain `.md` files, single-file or folder workspaces | Plain Markdown files and folder/file tree workflows | Local vaults using open file formats |
| Knowledge features | Tabs, outline, workspace search, and double-bracket link completion | Outline, file tree, internal links, and export-oriented writing tools | Backlinks, graph view, Canvas, and large plugin ecosystem |
| Sync and storage | Optional WebDAV sync, local backups, and configurable image storage | Uses local files; external sync services can be used | Optional paid Obsidian Sync and Publish services |
| Openness and cost | Free and AGPL-3.0 open source | Paid app after trial | Free app with optional paid services and licenses |

## Key Features

### WYSIWYG Markdown

- Render links, images, HTML, KaTeX math, Mermaid diagrams, and GFM tables inline — expand any element back to source when needed.
- Slash commands and drag handles for block-level editing; full source mode one click away.
- Adjustable writing width, font size, and line height.
- Desktop spellcheck highlights likely mistakes, offers suggestions with the default `Ctrl/Cmd+.` shortcut, and keeps custom terms in a personal dictionary; the suggestion shortcut can be changed in keyboard shortcut settings.
- Markra manages its own local dictionaries instead of relying on OS or Electron spellcheck, so behavior stays consistent across desktop platforms while language packs download on demand and stay out of the app bundle.

### Native AI

- Inline AI on selected text, or open the side panel for document-wide tasks.
- Quick actions: polish, rewrite, continue, summarize, translate.
- Preview every AI edit before applying — accept, reject, or copy.
- Agent Client Protocol (ACP) support for compatible local AI agents, including model discovery, permission prompts, and editor write previews.
- Sessions are searchable, renamable, and archivable.

### Local Workspace

- Open a single file or an entire folder; browse, create, rename, move, delete, sort, reveal, and multi-select files from the file tree.
- Document tabs, side-by-side panes, quick open, workspace search, outline navigation, and double-bracket link completion.
- Auto-save existing files, restore tabs and workspace state, and show document or selected-text word counts.

### Storage, Backup, and Sync

- Paste or drop images to local storage, WebDAV, PicGo/PicList, or S3-compatible storage.
- Create one-way local backups manually, on exit, or on a schedule.
- Optional WebDAV sync keeps notes aligned across devices and preserves conflict copies.

### Blocks, Tables, and Code

- GitHub-style callouts (note, tip, important, warning, caution).
- Visual table controls for rows, columns, sizing, and alignment.
- Syntax-highlighted code blocks with language picker and one-click copy.

### Themes and Export

- Built-in themes or scoped custom CSS with import/export/reset.
- Export to standalone HTML or PDF with full page, margin, and metadata control.

### Multi-Provider AI

Supports cloud models, local models, and any OpenAI-compatible endpoint. Separate model selection for inline editing and the side panel.

**Built-in providers:** OpenAI · Anthropic · Google Gemini · DeepSeek · Mistral · Groq · OpenRouter · Together.ai · Qwen · Xiaomi MiMo · Volcengine Ark · xAI · Azure OpenAI · Ollama

**Web search:** Provider-native search, Bing, and SearXNG — with configurable result and content limits.

## Use Cases

Product docs · Blog posts · Research notes · Technical writing with tables, code, and math · AI-assisted drafting and polishing · Personal knowledge bases

## Philosophy

- **Local first** — files and workspace data stay on your disk unless you opt into WebDAV sync or remote image storage.
- **Open and free** — core features are inspectable and never paywalled.
- **Writing first** — AI, file management, and settings serve the document, not the other way around.
- **Confirm before apply** — AI edits are previews until you say yes.

## Roadmap

- More stable workspace behavior and edge-case handling
- Smarter AI edit previews and conflict resolution
- Deeper knowledge organization and link workflows
- Richer export templates and sharing workflows

## Getting Started

1. Open the [web editor](https://editor.markra.app/) or [download](https://github.com/markrahq/markra/releases/latest) the latest desktop release for your platform.
2. Open a Markdown file or folder.
3. Write — use WYSIWYG, slash commands, or source mode.
4. Configure AI providers in settings when you're ready for AI assistance.

## Contributing

Contributions are welcome — whether it's product experience, Markdown editing, AI workflows, cross-platform fixes, or docs. See [issues](https://github.com/markrahq/markra/issues) for open tasks or start a discussion.

## Contributors

Thanks to everyone who has helped shape Markra through code, docs, design, testing, and feedback.

<p align="center">
  <a href="https://github.com/markrahq/markra/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=markrahq/markra" alt="Markra contributors" />
  </a>
</p>

## Sponsors

[![Sponsors](https://raw.githubusercontent.com/murongg/sponsorskit/main/public/sponsors.svg)](https://sponsors.mrong.me/)

## Star History

<p align="center">
  <a href="https://star-history.com/#markrahq/markra&Date">
    <img alt="Markra star history chart" src="https://api.star-history.com/svg?repos=markrahq/markra&type=Date" />
  </a>
</p>

## License

Markra is licensed under AGPL-3.0.
