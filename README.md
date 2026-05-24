<p align="center">
  <img src="apps/desktop/app-icon.svg" width="96" alt="Markra logo" />
</p>

<p align="center">
  <strong>A WYSIWYG Markdown editor with native AI.</strong>
  <br />
  <strong>Fully open source. Free to use. Your data stays local.</strong>
</p>

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a> | <a href="#download">Download</a> | <a href="#key-features">Key Features</a> | <a href="#contributing">Contributing</a> | <a href="#license">License</a>
</p>

<p align="center">
  <img alt="Desktop" src="https://img.shields.io/badge/Desktop-Tauri-24C8DB" />
  <img alt="WYSIWYG Markdown" src="https://img.shields.io/badge/Markdown-WYSIWYG-000000" />
  <img alt="Native AI" src="https://img.shields.io/badge/AI-Native-7C3AED" />
  <img alt="Free" src="https://img.shields.io/badge/Free-Open_Source-16A34A" />
  <img alt="Downloads" src="https://img.shields.io/github/downloads/murongg/markra/total?label=Downloads&amp;color=0EA5E9&amp;cacheSeconds=3600" />
  <img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-important" />
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/markra">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=markra&theme=light" width="250" height="54" alt="Find Markra on Product Hunt" />
  </a>
</p>

Markra is a local-first, open-source Markdown editor that brings AI into the writing flow. Edit in WYSIWYG or source mode, keep everything as plain `.md` files on disk, and let AI polish, rewrite, or expand your content — with full preview before any change lands.

No cloud sync, no account required. AI calls only go where you point them.

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

Download the latest desktop builds from [GitHub Releases](https://github.com/murongg/markra/releases/latest): macOS Apple Silicon/Intel, Windows installer/portable, and Linux AppImage.

## Key Features

### WYSIWYG Markdown

- Render links, images, HTML, KaTeX math, Mermaid diagrams, and GFM tables inline — expand any element back to source when needed.
- Slash commands and drag handles for block-level editing; full source mode one click away.
- Adjustable writing width, font size, and line height.

### Native AI

- Inline AI on selected text, or open the side panel for document-wide tasks.
- Quick actions: polish, rewrite, continue, summarize, translate.
- Preview every AI edit before applying — accept, reject, or copy.
- Sessions are searchable, renamable, and archivable.

### Local Workspace

- Open a single file or an entire folder; browse, create, rename, and delete from the file tree.
- Document tabs, outline navigation, and double-bracket link completion.
- Paste images to local storage, S3, or WebDAV.

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

- **Local first** — files and workspace data stay on your disk.
- **Open and free** — core features are inspectable and never paywalled.
- **Writing first** — AI, file management, and settings serve the document, not the other way around.
- **Confirm before apply** — AI edits are previews until you say yes.

## Roadmap

- More stable workspace behavior and edge-case handling
- Smarter AI edit previews and conflict resolution
- Full-text search and knowledge organization
- Richer export templates and sharing workflows

## Getting Started

1. [Download](https://github.com/murongg/markra/releases/latest) the latest release for your platform.
2. Open a Markdown file or folder.
3. Write — use WYSIWYG, slash commands, or source mode.
4. Configure AI providers in settings when you're ready for AI assistance.

## Contributing

Contributions are welcome — whether it's product experience, Markdown editing, AI workflows, cross-platform fixes, or docs. See [issues](https://github.com/murongg/markra/issues) for open tasks or start a discussion.

## Star History

<p align="center">
  <a href="https://star-history.com/#murongg/markra&Date">
    <img alt="Markra star history chart" src="https://api.star-history.com/svg?repos=murongg/markra&type=Date" />
  </a>
</p>

## License

Markra is licensed under AGPL-3.0.
