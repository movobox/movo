# Changelog

All notable changes to Movo are documented in this file.

## [0.1.1] - 2026-07-01

### Added

- Added a polished README with direct latest-release download links for Windows, macOS, and Linux.
- Added release automation for production desktop installers.
- Added stable release asset names:
  - `Movo-Setup-Windows.exe`
  - `Movo-Installer-macOS.dmg`
  - `Movo-Linux.AppImage`
  - `Movo-Linux.deb`
- Added a Movo preview screenshot to the README.
- Added donation instructions for TON and USDT on the TON network.
- Added links to Tonkeeper and generic TON-compatible wallets.
- Added an "Other Projects" section linking to Pinoox.
- Added macOS notarization support through `@electron/notarize`.
- Added macOS hardened runtime entitlements.
- Added Linux package metadata and stable Linux artifact naming.
- Added Linux README notes for AppImage and deb usage.

### Changed

- Windows installer now installs as the current user by default instead of requiring administrator installation.
- Windows installer output is now named `Movo-Setup-Windows.exe`.
- Release workflows now clean previous build output before packaging.
- Installer builds are only created on GitHub Release publish, not on every push.
- Build workflow is now a manual typecheck workflow.
- macOS build flow now allows signing and notarization when Apple Developer secrets are configured.
- Linux executable name is now `movo`.
- Electron external navigation is hardened so external links open outside the app.
- Composer input now grows for several lines before switching to internal scrolling.
- Composer mention overlay now stays better synced with textarea height and scroll.
- File mention sending is faster by avoiding unnecessary recursive search when full paths are already known.
- Markdown rendering now supports localized version numbers such as `۰.۱.۰`.
- Markdown localized version tokens are displayed as readable inline badges.

### Fixed

- Fixed Windows installer behavior where approving UAC could result in no visible installer window.
- Fixed delayed send behavior when a mentioned file was already resolved.
- Fixed long composer text handling by adding auto-resize and scroll behavior.
- Fixed external navigation handling to avoid untrusted pages opening inside the Electron window.
- Fixed duplicated `@electron/notarize` dependency entry.

### Notes

- macOS Gatekeeper warnings require a valid Apple Developer ID certificate and notarization secrets:
  - `MACOS_CSC_LINK`
  - `MACOS_CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
- Without those secrets, macOS builds may still run locally, but they will not be fully trusted by Gatekeeper.

## [0.1.0] - 2026-06-28

### Added

- Initial public release of Movo.
- Project-aware AI chat with persistent conversations, drafts, queued messages, and attachments.
- Cursor-style live activity log for read, write, edit, command, diff, and file-change steps.
- Rich Markdown rendering with tables, code blocks, diffs, callouts, task lists, workflow lists, and RTL/LTR handling.
- File mentions with `@file`, fuzzy picking, drag and drop, image previews, and binary attachment handling.
- Message ID references for reusing copied Movo message IDs in later prompts.
- Multi-chat execution with isolated run state.
- Built-in terminal panel with multiple terminals, floating mode, and external system terminal support.
- Generic Dev Servers panel for running project commands such as `npm run dev`, `php artisan serve`, `python manage.py runserver`, and `docker compose up`.
- Session actions including fork, import, export, revert, slash commands, and command context.
- Workspace trust controls with Movo-owned `.movo` settings.
- Pinoox support with a unified Pinoox agent and MCP defaults.
- Configurable agents, commands, skills, MCP servers, tool config, LSP, formatters, keybindings, and engine server options.

### Engine

- Movo uses its own product identity and desktop workflow while being powered in part by Xiaomi's MiMo Code engine for AI coding execution.
