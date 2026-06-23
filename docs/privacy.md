# Privacy And Data Flow

Markra is local-first. You can open, edit, and save Markdown without an account, cloud workspace, or Markra-hosted sync service.

This document explains what stays local and what can leave the device when optional features are configured.

## By Default

- Markdown files are ordinary files on disk or browser-selected file handles.
- Desktop settings are stored locally by the Tauri app.
- Web settings are stored in the browser through IndexedDB.
- AI providers, web search, remote image upload, backup, and sync only run when configured or triggered.
- Markra does not provide an account system or hosted document storage.

## Local Data

Markra may store these items locally:

- editor preferences, theme choices, keyboard shortcuts, and export settings
- recent files and folders
- workspace state, open tabs, draft state, and file tree sort settings
- AI provider configuration and selected models
- AI agent session summaries and session history
- backup and sync settings

Provider API keys and tokens are saved in local Markra settings. Treat the local user profile and device storage as sensitive. Markra does not claim that these settings are separately encrypted by the app.

## AI Requests

AI requests are sent only to the provider endpoint you configure or select. The request can include:

- the selected text or document context needed for the action
- chat messages and previous assistant responses in the active AI session
- enabled AI tool results, such as document search or workspace reads
- model, reasoning, web-search, and provider-specific request options

Different providers have different retention and training policies. Review the provider policy before sending sensitive content.

## Web Search

Web search is optional. When enabled, requests can go to:

- provider-native search features
- Bing
- SearXNG

Search queries and fetched result content are sent to the configured search provider or instance.

## Spellcheck Dictionaries

Desktop spellcheck uses local dictionary files. Language packs are not bundled with the app; when you download or refresh one, Markra requests the spellcheck manifest and dictionary files from the Markra dictionaries GitHub Releases. Downloaded dictionaries are cached in the Tauri app data directory and verified with SHA-256 before use.

Dictionary downloads do not include document content. Personal spellcheck words are stored locally with Markra settings.

## Remote Image Storage

Pasted or dropped images can stay local, or they can be uploaded when you choose a remote storage provider.

Supported storage paths include:

- local Markdown-adjacent image folders
- WebDAV
- PicGo/PicList through a local server
- S3-compatible object storage in the desktop runtime

Remote upload settings, credentials, and public base URLs are stored locally in Markra settings.

## Backup

Desktop backups are local one-way safety copies. Backup copies notes from the current source folder to a local target folder. It does not download, merge, or write changes back to the source folder.

Backup can be run manually, on exit, or on a schedule when configured.

## WebDAV Sync

Desktop WebDAV sync is optional and disabled by default. When enabled, it keeps the current notes folder and a configured remote WebDAV folder aligned.

Sync can upload, download, delete, and preserve conflict copies. Sync metadata is stored in the notes folder under `.markra-sync`.

## Desktop And Web Differences

The desktop app can access native file paths, watch files, open folders, run local backups, and sync through WebDAV. The web editor runs inside browser permission and CORS limits, so it uses browser file handles, downloads, print-to-PDF, IndexedDB settings, and direct browser network requests where supported.

## Network Settings

Desktop network settings can apply to AI requests, web search, web image downloads, spellcheck dictionary downloads, remote sync, remote image uploads, and update checks. Localhost, LAN, and private IP bypass settings exist for tools such as Ollama, PicGo, and NAS WebDAV.
