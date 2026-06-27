# Movo

Movo is a desktop AI studio for building, editing, and maintaining software projects. It gives you a Cursor-like chat workspace, real terminals, project-aware activity logs, file mentions, attachments, agents, commands, MCP defaults, and Pinoox-friendly workflows in one focused app.

Movo has its own product identity and UX, and it is powered in part by Xiaomi's MiMo Code engine for AI coding execution.

## Download

Get the latest production installers from the GitHub Releases page:

- Windows installer: open the latest release and download the `.exe` file.
- macOS installer: open the latest release and download the `.dmg` file.
- Linux installer: open the latest release and download the `.AppImage` or `.deb` file.

[Download latest Movo release](../../releases/latest)

## Highlights

- Project-aware AI chat with persisted conversations, drafts, queued messages, and attachments.
- Cursor-style activity log that shows read, write, edit, command, diff, and file-change steps while Movo works.
- Rich Markdown rendering with tables, callouts, task lists, workflow lists, code blocks, diffs, RTL/LTR handling, and clickable links/files.
- File mention support with `@file`, fuzzy picking, drag and drop, image previews, and binary attachment handling.
- Message ID references so copied Movo message IDs can be reused in later prompts.
- Multi-chat execution so different chats and folders can run independently.
- Built-in real terminal panel with multiple terminals, floating mode, external system terminal support, and per-chat/per-folder isolation.
- Generic Dev Servers panel for running commands such as `npm run dev`, `php artisan serve`, `python manage.py runserver`, `docker compose up`, `go run .`, or any custom command.
- Session tools such as fork, import, export, revert, slash commands, and command context.
- Workspace trust controls with Movo-owned `.movo` project settings instead of exposing MiMo Code internals in normal project flow.
- Pinoox support with a unified Pinoox agent and default MCP integration hooks.
- Configurable agents, commands, skills, MCP servers, tool config, LSP, formatters, keybindings, and engine server options.

## Pinoox

Movo is designed to work well with Pinoox projects. It includes a unified Pinoox agent that can adapt to architecture, app building, migration, UI, security, docs, and marketplace tasks. It can also connect to Pinoox MCP defaults when available.

## Engine

Movo is transparent about its foundation: it uses the MiMo Code engine where appropriate, while keeping the user-facing app identity, settings, workflows, and desktop experience under the Movo brand.

## Development

Install dependencies:

```bash
npm ci
```

Run the desktop app in development:

```bash
npm run dev
```

Run type checks:

```bash
npm run typecheck
```

Build installers locally:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

Build output is written to `release/`.

## Release Automation

When a GitHub Release is published, the release workflow builds production installers on Windows, macOS, and Linux, then uploads only installer assets to that release:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: `.AppImage`, `.deb`

Create a version tag such as `v0.1.0`, create a GitHub Release from that tag, and publish it. The workflow will attach the installers automatically.
