import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch, FSWatcher } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, platform } from "node:os";
import type { IPty } from "node-pty";
import pty from "node-pty";

type AppSettings = {
  language: string;
  model: string;
  provider: string;
  agent: string;
  trustWorkspace: boolean;
  skipPermissions: boolean;
  theme: string;
  projectConfigDir: string;
  permissions: { edit: string; bash: string; webfetch: string; websearch: string };
  checkpoint: { enabled: boolean };
  memory: { enabled: boolean };
  compaction: { auto: boolean; prune: boolean; reserved: number };
  watcher: { enabled: boolean };
  share: string;
  autoupdate: boolean | "notify";
  experimental: { maxMode: boolean };
  mcpServersJson: string;
  agentsJson: string;
  commandsJson: string;
  skillsJson: string;
  toolJson: string;
  lspJson: string;
  formatterJson: string;
  keybindingsJson: string;
  serverJson: string;
  instructionsJson: string;
  providerJson: string;
};

type ChatMessage = { id: string; role: string; text: string; createdAt: string };
type QueuedMessage = { id: string; text: string };
type Chat = {
  id: string;
  title: string;
  folder: string;
  messages: ChatMessage[];
  draft?: string;
  queuedMessages?: QueuedMessage[];
  createdAt: string;
  updatedAt: string;
};
type UiState = { activeChatId: string; draftChat: Chat | null };
type Settings = { app: AppSettings; chats: Chat[]; ui: UiState };

const defaultPinooxMcpServers = {
  pinoox: {
    type: "local",
    command: ["npx", "-y", "pinoox-mcp"],
    environment: {
      PINOOX_ROOT: "${workspaceFolder}",
      PINX_ROOT: "${workspaceFolder}"
    }
  },
  context7: {
    type: "remote",
    url: "https://mcp.context7.com/mcp",
    enabled: true,
    timeout: 8000
  },
  gh_grep: {
    type: "remote",
    url: "https://mcp.grep.app",
    enabled: true,
    timeout: 8000
  },
  sequential_thinking: {
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
    enabled: false,
    timeout: 8000
  }
};

const defaultAgents = {
  review: {
    description: "Review current changes for bugs, regressions, security issues, and missing verification.",
    mode: "subagent",
    temperature: 0.1,
    permission: { edit: "deny", bash: "deny", webfetch: "allow", websearch: "allow" }
  },
  research: {
    description: "Research unfamiliar APIs, libraries, docs, or examples before implementation.",
    mode: "subagent",
    temperature: 0.2,
    permission: { edit: "deny", bash: "ask", webfetch: "allow", websearch: "allow" }
  },
  architect: {
    description: "Plan architecture, data flow, boundaries, and migration steps before broad changes.",
    mode: "subagent",
    temperature: 0.2,
    permission: { edit: "deny", bash: "deny", webfetch: "allow", websearch: "allow" }
  },
  debugger: {
    description: "Trace runtime errors, logs, failing tests, and reproduction steps.",
    mode: "subagent",
    temperature: 0.1,
    permission: { edit: "deny", bash: "ask", webfetch: "allow", websearch: "allow" }
  },
  tester: {
    description: "Find relevant verification commands and test gaps for the current task.",
    mode: "subagent",
    temperature: 0.1,
    permission: { edit: "deny", bash: "ask", webfetch: "deny", websearch: "deny" }
  },
  security: {
    description: "Review auth, secrets, file access, command execution, and data handling risks.",
    mode: "subagent",
    temperature: 0.1,
    permission: { edit: "deny", bash: "deny", webfetch: "allow", websearch: "allow" }
  },
  docs: {
    description: "Draft concise documentation, changelogs, release notes, and usage notes.",
    mode: "subagent",
    temperature: 0.2,
    permission: { edit: "deny", bash: "deny", webfetch: "allow", websearch: "allow" }
  }
};

const defaultCommands = {
  review: {
    description: "Review current changes before commit",
    agent: "review",
    subtask: true,
    template: [
      "Review the current working tree for bugs, regressions, security issues, and missing tests.",
      "Prioritize actionable findings with file paths and line references.",
      "Recent git status:",
      "!`git status --short`",
      "Recent diff:",
      "!`git diff --stat`"
    ].join("\n")
  },
  plan: {
    description: "Create a focused implementation plan",
    agent: "architect",
    subtask: true,
    template: "Create a practical implementation plan for: $ARGUMENTS\nInclude risks, files likely to change, and the smallest useful verification path."
  },
  map: {
    description: "Map the project structure before editing",
    agent: "architect",
    subtask: true,
    template: [
      "Map the relevant architecture for this request: $ARGUMENTS",
      "Identify entry points, data flow, important files, and likely side effects.",
      "Use repository inspection only; do not modify files."
    ].join("\n")
  },
  debug: {
    description: "Debug an error or broken behavior",
    agent: "debugger",
    template: "Debug this issue: $ARGUMENTS\nFind likely causes, inspect relevant files/logs, and propose or implement the smallest reliable fix."
  },
  security: {
    description: "Review security-sensitive changes",
    agent: "security",
    subtask: true,
    template: "Review this area for security risks: $ARGUMENTS\nFocus on auth, secrets, path traversal, command execution, data exposure, and unsafe defaults."
  },
  docs: {
    description: "Write or improve documentation",
    agent: "docs",
    template: "Write concise documentation for: $ARGUMENTS\nPrefer practical usage notes, setup steps, and gotchas over marketing language."
  },
  refactor: {
    description: "Plan and perform a focused refactor",
    agent: "build",
    template: "Refactor this area without changing behavior: $ARGUMENTS\nKeep edits scoped, preserve public behavior, and verify with focused checks."
  },
  migrate: {
    description: "Plan and perform a safe migration",
    agent: "architect",
    template: "Plan and implement this migration carefully: $ARGUMENTS\nPreserve compatibility where reasonable and include rollback notes if relevant."
  },
  "release-notes": {
    description: "Draft release notes from current changes",
    agent: "docs",
    template: [
      "Draft concise release notes for the current changes.",
      "Group user-facing changes, fixes, and developer notes.",
      "Current status:",
      "!`git status --short`",
      "Diff summary:",
      "!`git diff --stat`"
    ].join("\n")
  },
  "init-rules": {
    description: "Create or improve project AI rules",
    agent: "docs",
    template: "Create or improve general project rules under .movo/rules for this repository. Keep them framework-aware, concise, and safe for all future AI work."
  },
  test: {
    description: "Find and run the most relevant checks",
    agent: "build",
    template: "Detect the project's package manager and test/lint/typecheck commands, run the most relevant focused checks, then summarize failures and fixes."
  },
  fix: {
    description: "Diagnose and fix the provided issue",
    agent: "build",
    template: "Diagnose this issue and implement a focused fix: $ARGUMENTS\nVerify the fix with the narrowest reliable checks."
  },
  explain: {
    description: "Explain code, architecture, or behavior",
    agent: "plan",
    template: "Explain this clearly and practically, using file references when relevant: $ARGUMENTS"
  },
  commit: {
    description: "Suggest a commit message for current changes",
    agent: "plan",
    template: [
      "Suggest one concise conventional commit message for the current changes.",
      "Include a short subject and 2-4 bullets describing the main changed areas.",
      "Do not create the commit.",
      "Current status:",
      "!`git status --short`",
      "Current diff summary:",
      "!`git diff --stat`"
    ].join("\n")
  }
};

const defaultSkills = {
  paths: [
    ".movo/skills",
    ".movo/skill",
    ".codex/skills",
    ".agents/skills",
    ".opencode/skills"
  ]
};

const defaultInstructions = [
  ".movo/rules/*.md",
  ".movo/rules/*.mdc",
  ".movo/rulls/*.md",
  ".movo/rulls/*.mdc",
  ".cursor/rules/*.md",
  ".cursor/rules/*.mdc",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "CONTRIBUTING.md",
  "docs/ai/*.md",
  "docs/rules/*.md"
];
const defaultToolConfig = { invocation_style: "json" };
const defaultLspConfig = {};
const defaultFormatterConfig = {};
const MIMO_NATIVE_CONFIG_DIR = ".mimocode";
const MOVO_PROJECT_CONFIG_DIR = ".movo";

const defaultAppSettings: AppSettings = {
  language: "en", model: "", provider: "", agent: "build",
  trustWorkspace: true, skipPermissions: false, theme: "dark",
  projectConfigDir: MOVO_PROJECT_CONFIG_DIR,
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true }, memory: { enabled: true },
  compaction: { auto: true, prune: true, reserved: 10000 }, watcher: { enabled: true },
  share: "manual", autoupdate: true,
  experimental: { maxMode: false }, mcpServersJson: JSON.stringify(defaultPinooxMcpServers, null, 2),
  agentsJson: JSON.stringify(defaultAgents, null, 2), commandsJson: JSON.stringify(defaultCommands, null, 2),
  skillsJson: JSON.stringify(defaultSkills, null, 2),
  toolJson: JSON.stringify(defaultToolConfig, null, 2), lspJson: JSON.stringify(defaultLspConfig, null, 2),
  formatterJson: JSON.stringify(defaultFormatterConfig, null, 2), keybindingsJson: "{}",
  serverJson: "{}", instructionsJson: JSON.stringify(defaultInstructions, null, 2), providerJson: "{}"
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | undefined;
let activeProcess: ChildProcessWithoutNullStreams | undefined;
let activeRunId = 0;
let stopRequestedForRun = 0;
let activeRetryTimer: ReturnType<typeof setTimeout> | undefined;
let activeRunCancel: (() => void) | undefined;
const terminalProcesses = new Map<string, IPty>();

function settingsPath() { return join(app.getPath("userData"), "studio-settings.json"); }

function loadSettings(): Settings {
  const file = settingsPath();
  if (!existsSync(file)) return { app: defaultAppSettings, chats: [], ui: { activeChatId: "", draftChat: null } };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      app: normalizeAppSettingsForMain(parsed.app || {}),
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      ui: {
        activeChatId: typeof parsed.ui?.activeChatId === "string" ? parsed.ui.activeChatId : "",
        draftChat: parsed.ui?.draftChat || null
      }
    };
  } catch { return { app: defaultAppSettings, chats: [], ui: { activeChatId: "", draftChat: null } }; }
}

function saveSettingsToDisk(settings: Settings) {
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function normalizeAppSettingsForMain(value: Partial<AppSettings> = {}): AppSettings {
  const settings = {
    ...defaultAppSettings,
    ...value,
    permissions: { ...defaultAppSettings.permissions, ...(value.permissions || {}) },
    checkpoint: { ...defaultAppSettings.checkpoint, ...(value.checkpoint || {}) },
    memory: { ...defaultAppSettings.memory, ...(value.memory || {}) },
    compaction: { ...defaultAppSettings.compaction, ...(value.compaction || {}) },
    watcher: { ...defaultAppSettings.watcher, ...(value.watcher || {}) },
    experimental: { ...defaultAppSettings.experimental, ...(value.experimental || {}) }
  };
  settings.mcpServersJson = withDefaultMcp(value.mcpServersJson || defaultAppSettings.mcpServersJson);
  settings.agentsJson = withDefaultObject(value.agentsJson || defaultAppSettings.agentsJson, defaultAgents);
  settings.commandsJson = withDefaultObject(value.commandsJson || defaultAppSettings.commandsJson, defaultCommands);
  settings.skillsJson = withDefaultSkills(value.skillsJson || defaultAppSettings.skillsJson);
  settings.toolJson = withDefaultObject(value.toolJson || defaultAppSettings.toolJson, defaultToolConfig);
  settings.lspJson = withDefaultObject(value.lspJson || defaultAppSettings.lspJson, defaultLspConfig);
  settings.formatterJson = withDefaultObject(value.formatterJson || defaultAppSettings.formatterJson, defaultFormatterConfig);
  settings.keybindingsJson = value.keybindingsJson || defaultAppSettings.keybindingsJson;
  settings.serverJson = value.serverJson || defaultAppSettings.serverJson;
  settings.instructionsJson = withDefaultInstructions(value.instructionsJson || defaultAppSettings.instructionsJson);
  settings.providerJson = value.providerJson || defaultAppSettings.providerJson;
  settings.projectConfigDir = normalizeProjectConfigDir(value.projectConfigDir);
  return settings;
}

function withDefaultSkills(raw: string) {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const paths = Array.isArray(current.paths) ? current.paths.map(String) : [];
    return JSON.stringify({
      ...current,
      paths: [...new Set([...defaultSkills.paths, ...paths])]
    }, null, 2);
  } catch {
    return raw || defaultAppSettings.skillsJson;
  }
}

function withDefaultPinooxMcp(raw: string) {
  return withDefaultMcp(raw);
}

function withDefaultMcp(raw: string) {
  return withDefaultObject(raw, defaultPinooxMcpServers);
}

function withDefaultObject(raw: string, defaults: Record<string, unknown>) {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return JSON.stringify({ ...defaults, ...current }, null, 2);
  } catch {
    return raw || JSON.stringify(defaults, null, 2);
  }
}

function withDefaultInstructions(raw: string) {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : [];
    const current = Array.isArray(parsed) ? parsed.map(String) : [];
    return JSON.stringify([...new Set([...defaultInstructions, ...current])], null, 2);
  } catch {
    return raw || defaultAppSettings.instructionsJson;
  }
}

function normalizeProjectConfigDir(value?: string) {
  const current = value?.trim();
  if (!current || current === MIMO_NATIVE_CONFIG_DIR) return defaultAppSettings.projectConfigDir;
  return current;
}

function appIconPath() {
  return join(__dirname, "../build/icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1040, minHeight: 700,
    backgroundColor: "#0e0e10", title: "Movo",
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath());
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }
  attachContextMenu(mainWindow);
}

function attachContextMenu(win: BrowserWindow) {
  win.webContents.on("context-menu", (event, params) => {
    const isEditable = params.isEditable;
    const hasSelection = Boolean(params.selectionText?.trim());
    const canPaste = isEditable;
    const template: MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      template.push(
        {
          label: "Open Link",
          click: () => void shell.openExternal(params.linkURL)
        },
        {
          label: "Copy Link",
          click: () => clipboard.writeText(params.linkURL)
        },
        { type: "separator" }
      );
    }

    if (isEditable) {
      template.push(
        { label: "Undo", role: "undo" },
        { label: "Redo", role: "redo" },
        { type: "separator" },
        { label: "Cut", role: "cut", enabled: hasSelection },
        { label: "Copy", role: "copy", enabled: hasSelection },
        { label: "Paste", role: "paste", enabled: canPaste },
        { label: "Paste and Match Style", role: "pasteAndMatchStyle", enabled: canPaste },
        { type: "separator" },
        { label: "Select All", role: "selectAll" }
      );
    } else {
      template.push(
        { label: "Copy", role: "copy", enabled: hasSelection },
        { label: "Select All", role: "selectAll" }
      );
    }

    if (!template.length) return;
    event.preventDefault();
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC handlers ──

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:save", (_event, appSettings: AppSettings) => {
  const settings = loadSettings();
  settings.app = normalizeAppSettingsForMain(appSettings);
  saveSettingsToDisk(settings);
  return { ok: true };
});

ipcMain.handle("chats:save", (_event, chats: Chat[]) => {
  const settings = loadSettings();
  settings.chats = chats;
  saveSettingsToDisk(settings);
  return { ok: true };
});

ipcMain.handle("ui:save", (_event, ui: UiState) => {
  const settings = loadSettings();
  settings.ui = {
    activeChatId: ui.activeChatId || "",
    draftChat: ui.draftChat || null
  };
  saveSettingsToDisk(settings);
  return { ok: true };
});

ipcMain.handle("folder:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("file:pick", async () => {
  if (!mainWindow) return [];
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"]
    });
    return result.canceled ? [] : result.filePaths;
  } catch (e) {
    console.error("[main] file:pick error:", e);
    return [];
  }
});

ipcMain.handle("project:files", async (_event, folder: string) => {
  if (!folder || !existsSync(folder)) return { ok: false, files: [], error: "Project folder is missing." };
  try {
    const output = await runCommandCapture("rg", ["--files", "--hidden", "-g", "!node_modules", "-g", "!dist", "-g", "!release", "-g", "!.git"], folder, 12000);
    if (output.ok) {
      return {
        ok: true,
        files: output.output.split(/\r?\n/).filter(Boolean).slice(0, 5000).map((path) => ({ path, name: basename(path) }))
      };
    }
  } catch {}
  return { ok: true, files: scanProjectFiles(folder).slice(0, 5000) };
});

ipcMain.handle("file:search", async (_event, payload: { fileName: string; projectFolder: string }) => {
  const { fileName: name, projectFolder } = payload;
  if (!name) return { found: false, path: "" };
  const searchDirs = [projectFolder, join(projectFolder, "..")].filter(d => d && existsSync(d));
  for (const dir of searchDirs) {
    try {
      const output = await runCommandCapture(
        platform() === "win32" ? "powershell.exe" : "find",
        platform() === "win32"
          ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Get-ChildItem -Path "${dir}" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "${name}" } | Select-Object -First 1 -ExpandProperty FullName`]
          : [dir, "-name", name, "-type", "f", "-print", "-quit"],
        projectFolder || process.cwd(),
        8000
      );
      if (output.ok && output.output.trim()) {
        return { found: true, path: output.output.trim().split("\n")[0] };
      }
    } catch {}
  }
  return { found: false, path: "" };
});

ipcMain.handle("shell:run", async (_event, payload: { command: string; cwd?: string }) => {
  const command = payload?.command?.trim();
  if (!command) return { ok: false, code: -1, output: "Command is empty." };
  const cwd = payload.cwd && existsSync(payload.cwd) ? payload.cwd : process.cwd();
  if (platform() === "win32") {
    return runCommandCapture("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], cwd, 30000);
  }
  return runCommandCapture(process.env.SHELL || "/bin/bash", ["-lc", command], cwd, 30000);
});

ipcMain.handle("project:changes", async (_event, folder: string) => {
  if (!folder || !existsSync(folder)) return { ok: true, changes: { files: [], diff: "", isGitRepo: false } };
  const gitDir = join(folder, ".git");
  if (!existsSync(gitDir)) return { ok: true, changes: { files: [], diff: "", isGitRepo: false } };
  const status = await runCommandCapture("git", ["status", "--short"], folder, 10000);
  if (status.output.includes("fatal:")) return { ok: true, changes: { files: [], diff: "", isGitRepo: false } };
  const diff = await runCommandCapture("git", ["diff", "--", "."], folder, 10000);
  const rawLines = status.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
  const files = rawLines.map((line) => {
    const indexStatus = line[0] || " ";
    const workTreeStatus = line[1] || " ";
    const filePath = line.slice(3);
    let status = "modified";
    if (indexStatus === "A" || workTreeStatus === "A") status = "added";
    else if (indexStatus === "D" || workTreeStatus === "D") status = "deleted";
    else if (indexStatus === "R" || workTreeStatus === "R") status = "renamed";
    else if (indexStatus === "?" && workTreeStatus === "?") status = "untracked";
    else if (indexStatus === "M" || workTreeStatus === "M") status = "modified";
    else if (indexStatus === "C" || workTreeStatus === "C") status = "copied";
    return { path: filePath, status };
  });
  return { ok: true, changes: { files, diff: diff.output.slice(0, 12000), isGitRepo: true } };
});

ipcMain.handle("chat:export", async (_event, chat: Chat) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `${safeFileName(chat?.title || "movo-session")}.json`,
    filters: [{ name: "Movo session", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, error: "Canceled." };
  writeFileSync(result.filePath, JSON.stringify(chat, null, 2), "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("chat:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    filters: [{ name: "Movo session", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: "Canceled." };
  try {
    const chat = JSON.parse(readFileSync(result.filePaths[0], "utf8"));
    return { ok: true, chat };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("config:read", (_event, folder: string) => {
  const file = existingProjectConfigPath(folder);
  if (!file || !existsSync(file)) return { ok: true, config: {}, raw: "" };
  try { return { ok: true, config: JSON.parse(readFileSync(file, "utf8")), raw: readFileSync(file, "utf8") }; }
  catch { return { ok: false, config: {}, raw: "" }; }
});

ipcMain.handle("config:save", (_event, payload: { folder: string; appSettings: AppSettings }) => {
  writeProjectConfig(payload.folder, payload.appSettings);
  return { ok: true };
});

ipcMain.handle("mimo:check", async () => {
  const binary = findMimoBinary();
  if (!binary) return { installed: false, version: "" };
  try {
    const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
      const child = spawn(binary, ["--version"], {
        cwd: process.cwd(),
        timeout: 8000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let out = "";
      child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { out += d.toString(); });
      child.on("close", (code) => { resolve({ ok: code === 0, output: out }); });
      child.on("error", () => { resolve({ ok: false, output: "" }); });
    });
    return { installed: result.ok, version: result.output.trim() };
  } catch {
    return { installed: false, version: "" };
  }
});

ipcMain.handle("mimo:run", (_event, payload: { chat: Chat; message: string; appSettings: AppSettings; extraFiles: string[] }) => {
  try {
    console.log("[main] mimo:run called, message:", payload.message);
    lastRunChatId = payload.chat?.id || "";
    lastRunMessage = payload.message || "";
    const args = ["run", "--format", "json", "--dangerously-skip-permissions"];
    const s = { ...defaultAppSettings, ...payload.appSettings };
    if (s.agent) args.push("--agent", s.agent);
    if (s.model) args.push("--model", s.model);
    const hasAssistantReply = payload.chat.messages?.some(m => m.role === "assistant" && m.text.trim());
    if (hasAssistantReply) args.push("--continue");
    if (payload.chat.title) args.push("--title", payload.chat.title);
    let finalMessage = payload.message;
    const projectFolder = payload.chat.folder || process.cwd();
    const validFiles = (payload.extraFiles || []).map((f) => {
      if (!f || typeof f !== "string") return false;
      const trimmed = f.trim();
      if (!trimmed) return false;
      const candidate = existsSync(trimmed) ? trimmed : join(projectFolder, trimmed.replace(/^@/, ""));
      try { return existsSync(candidate) ? candidate : false; } catch { return false; }
    }).filter((f): f is string => typeof f === "string");
    const uniqueFiles = uniquePaths(validFiles);
    if (validFiles.length > 0) {
      finalMessage = stripAttachedFileMentions(finalMessage, uniqueFiles, projectFolder);
      if (!finalMessage.trim()) finalMessage = "Use the attached file(s) as context.";
    }
    const safeMessage = prepareMimoMessageArg(finalMessage, projectFolder, uniqueFiles.length > 0 || estimateArgLength([...args, finalMessage]) > 12000);
    args.push(safeMessage.message);
    const filesToAttach = safeMessage.file ? [safeMessage.file, ...uniqueFiles] : uniqueFiles;
    for (const f of filesToAttach) {
      args.push(formatFileArg(f));
    }
    console.log("[main] mimo:run args:", args.map((arg) => arg.length > 180 ? `${arg.slice(0, 180)}... (${arg.length} chars)` : arg));
    const mimoEnv: Record<string, string> = shouldOverrideMimoConfigDir(s)
      ? { MIMOCODE_CONFIG_DIR: projectConfigDirPath(projectFolder, s) }
      : {};
    return runMimo(args, payload.chat.folder || process.cwd(), true, 0, "", 0, mimoEnv);
  } catch (e) {
    console.error("[main] mimo:run error:", e);
    return { ok: false, code: -1, output: String(e) };
  }
});

ipcMain.handle("mimo:sessions", () => runMimo(["session", "list"], process.cwd(), false));

ipcMain.handle("mimo:stop", () => {
  stopRequestedForRun = activeRunId;
  if (activeRetryTimer) {
    clearTimeout(activeRetryTimer);
    activeRetryTimer = undefined;
  }
  activeProcess?.kill();
  activeProcess = undefined;
  activeRunCancel?.();
  activeRunCancel = undefined;
  return { ok: true };
});

ipcMain.handle("mimo:approve-perm", (_event, permType: string) => {
  if (activeProcess?.stdin && !activeProcess.stdin.destroyed) {
    activeProcess.stdin.write("y\n");
    console.log("[main] approved permission:", permType);
  }
  return { ok: true };
});

ipcMain.handle("terminal:create", (_event, payload: { terminalId: string; cwd?: string }) => {
  const terminalId = payload?.terminalId;
  if (!terminalId) return { ok: false, error: "Terminal id is missing." };
  if (terminalProcesses.has(terminalId)) return { ok: true };

  const cwd = payload.cwd && existsSync(payload.cwd) ? payload.cwd : process.cwd();
  const shell = platform() === "win32" ? "powershell.exe" : (process.env.SHELL || "/bin/bash");
  const shellArgs = platform() === "win32"
    ? ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass"]
    : ["-il"];
  const ptyInstance = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } as Record<string, string>
  });
  terminalProcesses.set(terminalId, ptyInstance);

  ptyInstance.onData((data: string) => {
    mainWindow?.webContents.send("terminal:data", { terminalId, data });
  });
  ptyInstance.onExit(({ exitCode }: { exitCode: number }) => {
    terminalProcesses.delete(terminalId);
    mainWindow?.webContents.send("terminal:exit", { terminalId, code: exitCode });
  });

  return { ok: true };
});

ipcMain.handle("terminal:input", (_event, payload: { terminalId: string; data: string }) => {
  const pty = terminalProcesses.get(payload?.terminalId);
  if (!pty) return { ok: false };
  pty.write(payload.data);
  return { ok: true };
});

ipcMain.handle("terminal:resize", (_event, payload: { terminalId: string; cols: number; rows: number }) => {
  const pty = terminalProcesses.get(payload?.terminalId);
  if (!pty) return { ok: false };
  try { pty.resize(payload.cols, payload.rows); } catch {}
  return { ok: true };
});

ipcMain.handle("terminal:stop", (_event, terminalId: string) => {
  const pty = terminalProcesses.get(terminalId);
  if (!pty) return { ok: true };
  try { pty.kill(); } catch {}
  terminalProcesses.delete(terminalId);
  mainWindow?.webContents.send("terminal:exit", { terminalId, code: null });
  return { ok: true };
});

ipcMain.handle("terminal:openExternal", (_event, payload: { cwd?: string }) => {
  const cwd = payload?.cwd && existsSync(payload.cwd) ? payload.cwd : process.cwd();
  try {
    openExternalTerminal(cwd);
    return { ok: true };
  } catch (e) {
    console.error("[terminal] open external failed:", e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("shell:openPath", async (_event, filePath: string) => {
  if (!filePath) return { ok: false };
  try {
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        shell.showItemInFolder(filePath);
      } else {
        shell.openPath(filePath);
      }
    } else {
      shell.showItemInFolder(dirname(filePath));
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// ── helpers ──

ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false };
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

function projectConfigPath(folder: string) {
  if (!folder) return "";
  return join(projectConfigDirPath(folder, defaultAppSettings), "mimocode.json");
}

function existingProjectConfigPath(folder: string) {
  const preferred = projectConfigPath(folder);
  if (preferred && existsSync(preferred)) return preferred;
  const legacy = join(resolve(folder), MIMO_NATIVE_CONFIG_DIR, "mimocode.json");
  if (existsSync(legacy)) return legacy;
  return preferred;
}

function projectConfigPathForSettings(folder: string, appSettings: AppSettings) {
  if (!folder) return "";
  return join(projectConfigDirPath(folder, appSettings), "mimocode.json");
}

function projectConfigDirPath(folder: string, appSettings: AppSettings) {
  const raw = (appSettings.projectConfigDir || defaultAppSettings.projectConfigDir).trim() || defaultAppSettings.projectConfigDir;
  if (isAbsolute(raw)) return raw;
  const base = resolve(folder);
  const target = resolve(base, raw);
  if (target === base || target.startsWith(base + sep)) return target;
  return join(base, defaultAppSettings.projectConfigDir);
}

function shouldOverrideMimoConfigDir(appSettings: AppSettings) {
  const raw = (appSettings.projectConfigDir || defaultAppSettings.projectConfigDir).trim();
  return Boolean(raw && raw !== MIMO_NATIVE_CONFIG_DIR);
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 80) || "movo-session";
}

function estimateArgLength(args: string[]) {
  return args.reduce((sum, arg) => sum + arg.length + 3, 0);
}

function formatFileArg(file: string) {
  return `--file=${file}`;
}

function uniquePaths(files: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const file of files) {
    const key = platform() === "win32" ? file.toLowerCase() : file;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

function prepareMimoMessageArg(message: string, projectFolder: string, forceFile: boolean) {
  const trimmed = message.trim();
  if (!forceFile && trimmed.length <= 8000) return { message: trimmed, file: "" };
  const promptFile = writeMimoPromptFile(trimmed || "Use the attached file(s) as context.", projectFolder);
  return {
    file: promptFile,
    message: "Read the attached prompt file and follow its instructions. Use the other attached files as context."
  };
}

function writeMimoPromptFile(message: string, projectFolder: string) {
  const tempRoot = join(app.getPath("temp"), "movo-prompts");
  mkdirSync(tempRoot, { recursive: true });
  const projectName = safeFileName(basename(projectFolder || "project"));
  const file = join(tempRoot, `${projectName}-${Date.now()}.md`);
  writeFileSync(file, message, "utf8");
  return file;
}

function stripAttachedFileMentions(message: string, files: string[], projectFolder: string) {
  let output = message;
  for (const file of files) {
    const variants = new Set<string>();
    const absolute = file.replace(/\\/g, "/");
    const absoluteWin = file.replace(/\//g, "\\");
    let relativePath = "";
    try { relativePath = relative(projectFolder, file).replace(/\\/g, "/"); } catch {}
    for (const value of [file, basename(file), absolute, absoluteWin, relativePath, relativePath.replace(/\//g, "\\")]) {
      if (!value) continue;
      variants.add(`@${value}`);
      variants.add(value.startsWith("@") ? value : `@${value.replace(/^@/, "")}`);
    }
    for (const variant of variants) {
      output = output.split(variant).join("");
    }
  }
  return output
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scanProjectFiles(folder: string) {
  const ignored = new Set(["node_modules", ".git", "dist", "release", ".vite"]);
  const files: { path: string; name: string }[] = [];
  const visit = (dir: string) => {
    if (files.length >= 5000) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile()) {
        const rel = relative(folder, full).replace(/\\/g, "/");
        const size = statSync(full).size;
        if (size < 2_000_000) files.push({ path: rel, name: entry.name });
      }
    }
  };
  visit(folder);
  return files;
}

function runCommandCapture(command: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ ok: boolean; code: number; output: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      killProcessTree(child);
      resolve({ ok: false, code: -1, output: `${output}\nCommand timed out.`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { output += d.toString(); });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, output: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: (code ?? 0) === 0, code: code ?? 0, output });
    });
  });
}

function writeProjectConfig(folder: string, appSettings: AppSettings) {
  const file = projectConfigPathForSettings(folder, appSettings);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) { try { existing = JSON.parse(readFileSync(file, "utf8")); } catch { existing = {}; } }
  const perm = appSettings.permissions || {};
  const config: Record<string, unknown> = {
    ...existing,
    $schema: "https://mimo.xiaomi.com/mimocode/config.json",
    permission: { edit: perm.edit || "ask", bash: perm.bash || "ask", webfetch: perm.webfetch || "ask", websearch: perm.websearch || "ask" },
    checkpoint: { enabled: appSettings.checkpoint?.enabled ?? true },
    memory: { enabled: appSettings.memory?.enabled ?? true },
    compaction: appSettings.compaction || defaultAppSettings.compaction,
    watcher: appSettings.watcher || defaultAppSettings.watcher,
    share: appSettings.share || "manual",
    autoupdate: appSettings.autoupdate ?? true,
  };
  if (appSettings.provider) config.provider = appSettings.provider;
  if (appSettings.model) config.model = appSettings.model;
  if (appSettings.agent) config.default_agent = appSettings.agent;
  mergeMcpConfig(config, appSettings.mcpServersJson, folder);
  mergeJsonConfig(config, "agent", appSettings.agentsJson);
  mergeJsonConfig(config, "command", appSettings.commandsJson);
  mergeJsonConfig(config, "skills", appSettings.skillsJson);
  mergeJsonConfig(config, "tool", appSettings.toolJson);
  mergeJsonConfig(config, "lsp", appSettings.lspJson);
  mergeJsonConfig(config, "formatter", appSettings.formatterJson);
  mergeJsonConfig(config, "server", appSettings.serverJson);
  mergeJsonConfig(config, "instructions", appSettings.instructionsJson);
  mergeJsonConfig(config, "provider", appSettings.providerJson);
  writeFileSync(file, JSON.stringify(config, null, 2), "utf8");
}

function mergeMcpConfig(config: Record<string, unknown>, raw: string, folder: string) {
  const parsed = parseJsonObject(raw);
  if (!parsed) return;
  const servers = parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
    ? parsed.mcpServers as Record<string, unknown>
    : parsed;
  config.mcp = hydratePinooxMcpServers(servers, folder);
}

function parseJsonObject(raw: string) {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hydratePinooxMcpServers(servers: Record<string, unknown>, folder: string) {
  const next: Record<string, unknown> = { ...servers };
  const pinoox = next.pinoox;
  if (!pinoox || typeof pinoox !== "object" || Array.isArray(pinoox)) return next;
  const server = pinoox as Record<string, unknown>;
  const timeout = typeof server.timeout === "number" ? server.timeout : undefined;
  const cwd = typeof server.cwd === "string" ? resolveWorkspacePlaceholder(server.cwd, folder) : undefined;
  next.pinoox = {
    type: "local",
    command: normalizeMcpCommand(server),
    environment: hydrateMcpEnvironment(server, folder),
    enabled: server.enabled !== false,
    ...(cwd ? { cwd } : {}),
    ...(timeout ? { timeout } : {})
  };
  return next;
}

function normalizeMcpCommand(server: Record<string, unknown>) {
  if (Array.isArray(server.command)) return server.command.map(String);
  const command = typeof server.command === "string" ? server.command : "npx";
  const args = Array.isArray(server.args) ? server.args.map(String) : ["-y", "pinoox-mcp"];
  return [command, ...args];
}

function hydrateMcpEnvironment(server: Record<string, unknown>, folder: string) {
  const source = server.environment || server.env;
  const env = source && typeof source === "object" && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {};
  return {
    ...env,
    PINOOX_ROOT: resolveWorkspacePlaceholder(String(env.PINOOX_ROOT || "${workspaceFolder}"), folder),
    PINX_ROOT: resolveWorkspacePlaceholder(String(env.PINX_ROOT || "${workspaceFolder}"), folder)
  };
}

function resolveWorkspacePlaceholder(value: string, folder: string) {
  if (!folder) return value;
  return value
    .replace(/\$\{workspaceFolder\}/g, folder)
    .replace(/\$\{projectFolder\}/g, folder)
    .replace(/\$\{PINOOX_ROOT\}/g, folder);
}

function mergeJsonConfig(config: Record<string, unknown>, key: string, raw: string) {
  if (!raw?.trim()) return;
  try {
    config[key] = JSON.parse(raw);
  } catch {
    // Keep invalid advanced JSON in app settings only; project config must remain valid.
  }
}

function findMimoBinary(): string | null {
  const osName = platform() === "win32" ? "windows" : platform() === "darwin" ? "darwin" : "linux";
  const cpuArch = arch() === "x64" ? "x64" : arch() === "arm64" ? "arm64" : "arm";
  const binary = osName === "windows" ? "mimo.exe" : "mimo";
  const baseDir = isDev ? join(process.cwd(), "node_modules") : join(process.resourcesPath, "app.asar.unpacked", "node_modules");

  const candidates = [
    `@mimo-ai/mimocode-${osName}-${cpuArch}`,
    `@mimo-ai/mimocode-${osName}-${cpuArch}-baseline`
  ];

  for (const pkg of candidates) {
    const p = join(baseDir, pkg, "bin", binary);
    if (existsSync(p)) return p;
  }

  if (isDev) {
    for (const pkg of candidates) {
      const p = join(process.cwd(), "node_modules", pkg, "bin", binary);
      if (existsSync(p)) return p;
    }
  }

  return null;
}

function runMimo(args: string[], cwd: string, streamToWindow = true, retryCount = 0, accumulatedOutput = "", runId = 0, envExtra: Record<string, string> = {}): Promise<{ ok: boolean; code: number; output: string }> {
  if (!runId) {
    runId = ++activeRunId;
    stopRequestedForRun = 0;
  }
  const binary = findMimoBinary();
  console.log("[mimo] binary:", binary, "args:", args, "cwd:", cwd);
  if (!binary) {
    const msg = "Movo engine not found. Install @mimo-ai/cli.";
    console.log("[mimo] ERROR:", msg);
    if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stderr", text: msg });
    return Promise.resolve({ ok: false, code: -1, output: msg });
  }

  const MAX_RETRIES = 8;
  const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000, 45000, 60000, 90000];
  const STALL_TIMEOUT_MS = 12 * 60 * 1000;
  const NETWORK_ERRORS = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EPIPE",
    "EAI_AGAIN",
    "Socket Hang Up",
    "network",
    "timeout",
    "fetch",
    "connection",
    "temporarily unavailable",
    "rate limit",
    "overloaded",
    "gateway",
    "502",
    "503",
    "504"
  ];

  function isNetworkError(stderr: string, code: number): boolean {
    const clean = stderr.replace(/\u001b\[[0-9;]*m/g, "");
    if (/file not found|no such file|enoent/i.test(clean)) return false;
    if (code !== 0 && code !== -1) return true;
    const lower = clean.toLowerCase();
    return NETWORK_ERRORS.some((e) => lower.includes(e.toLowerCase()));
  }

  return new Promise<{ ok: boolean; code: number; output: string }>((resolve) => {
    activeRunCancel = () => resolve({ ok: false, code: -3, output: "" });
    if (stopRequestedForRun === runId) {
      resolve({ ok: false, code: -3, output: "" });
      return;
    }
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...envExtra }
    });
    child.stdin.end();
    if (activeProcess) activeProcess.kill();
    activeProcess = child;
    let fullText = accumulatedOutput;
    let stderrText = "";
    const fileActivityWatcher = streamToWindow ? createFileActivityWatcher(cwd) : undefined;

    console.log("[mimo] spawned pid:", child.pid, "retry:", retryCount);

  let lineBuffer = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let settled = false;
  let lastEventTime = Date.now();
  let expectingMoreSteps = false;
  let stepCount = 0;
  let resolveInner: ((value: { ok: boolean; code: number; output: string }) => void) | undefined;

  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const clearHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };
  const flushLineBuffer = () => {
    if (!lineBuffer.trim()) return;
    const line = lineBuffer.replace(/\r$/, "");
    lineBuffer = "";
    try {
      const event = JSON.parse(line);
      fullText += extractOutputText(event);
    } catch {}
  };
  const finishRun = (code: number, shouldKill = false) => {
    if (settled) return;
    settled = true;
    clearIdleTimer();
    clearHeartbeat();
    fileActivityWatcher?.close();
    flushLineBuffer();
    if (shouldKill && !child.killed) child.kill();
    activeProcess = undefined;

    if (stopRequestedForRun === runId) {
      if (activeRunId === runId) activeRunCancel = undefined;
      resolveInner?.({ ok: false, code: -3, output: fullText });
      return;
    }

    const hasOutput = fullText.trim().length > 0;
    const errorText = `${stderrText}\n${fullText}`;
    const shouldRetry = !hasOutput && retryCount < MAX_RETRIES && isNetworkError(errorText, code);

    if (shouldRetry) {
      const delay = RETRY_DELAYS[retryCount] || 30000;
      console.log(`[mimo] retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES}), code: ${code}`);
      if (streamToWindow) {
        mainWindow?.webContents.send("mimo:output", { type: "activity", text: `Retrying... (${retryCount + 1}/${MAX_RETRIES})`, detail: `Connection issue, retrying in ${delay / 1000}s` });
        mainWindow?.webContents.send("mimo:output", { type: "retrying", attempt: retryCount + 1, maxRetries: MAX_RETRIES, delay });
      }
      activeRetryTimer = setTimeout(() => {
        activeRetryTimer = undefined;
        if (stopRequestedForRun === runId) {
          if (activeRunId === runId) activeRunCancel = undefined;
          resolveInner?.({ ok: false, code: -3, output: fullText });
          return;
        }
        resolve(runMimo(args, cwd, streamToWindow, retryCount + 1, fullText, runId, envExtra).then((r) => {
          resolveInner?.(r);
          return r;
        }));
      }, delay);
      return;
    }

    if (code !== 0 && streamToWindow) {
      const lastMsg = activeChatSnapshot();
      mainWindow?.webContents.send("mimo:interrupted", {
        chatId: lastMsg?.chatId || "",
        message: lastMsg?.message || "",
        code,
        stderr: (stderrText || (hasOutput ? "Response was interrupted before completion." : "")).slice(0, 500),
        attempt: retryCount + 1,
        maxRetries: MAX_RETRIES
      });
    }

    if (activeRunId === runId) activeRunCancel = undefined;
    resolveInner?.({ ok: code === 0, code, output: fullText || stderrText });
  };
  resolveInner = resolve;

  const markActivity = () => {
    lastEventTime = Date.now();
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (!settled && streamToWindow) {
        mainWindow?.webContents.send("mimo:output", {
          type: "activity",
          text: "Still waiting for Movo...",
          detail: "Keeping the connection alive on a slow network"
        });
      }
    }, 60000);
  };

  heartbeatTimer = setInterval(() => {
    if (settled) { clearHeartbeat(); return; }
    const elapsed = Date.now() - lastEventTime;
    if (child.killed || child.exitCode !== null) {
      finishRun(child.exitCode ?? 0);
      return;
    }
    if (elapsed > STALL_TIMEOUT_MS && !expectingMoreSteps) {
      console.log("[mimo] heartbeat: stalled for too long, marking as interrupted");
      stderrText ||= `No response from Movo for ${Math.round(STALL_TIMEOUT_MS / 60000)} minutes.`;
      finishRun(-2, true);
    }
  }, 15000);

    child.stdout.on("data", (d: Buffer) => {
      lineBuffer += d.toString();
      const parts = lineBuffer.split("\n");
      lineBuffer = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.replace(/\r$/, "");
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          const text = extractOutputText(event);
          const activity = summarizeActivityEvent(event);
          lastEventTime = Date.now();

          const evType = String(event.type || "").toLowerCase();
          if (evType === "step_finish") {
            const reason = String(event.part?.reason || "").toLowerCase();
            expectingMoreSteps = reason === "tool-calls" || reason === "tool_use";
          } else if (evType === "step_start") {
            expectingMoreSteps = false;
            stepCount++;
          }

          if (activity && streamToWindow) {
            mainWindow?.webContents.send("mimo:output", { type: "activity", ...activity, step: stepCount });
          }
          if (text) {
            fullText += text;
            if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text });
          }
          if (isCompletionEvent(event)) {
            finishRun(0, true);
          } else {
            markActivity();
          }
        } catch {
          lastEventTime = Date.now();
          if (!line.includes("<system-reminder>") && !line.includes("</system-reminder>")) {
            if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text: line + "\n" });
            fullText += line + "\n";
          }
          markActivity();
        }
      }
    });

    child.stderr.on("data", (d: Buffer) => {
      const t = d.toString();
      stderrText += t;
      lastEventTime = Date.now();
      console.log("[mimo] stderr:", t);
      const permMatch = t.match(/permission requested:\s*(\S+)\s*\(([^)]+)\)/);
      if (permMatch && streamToWindow) {
        mainWindow?.webContents.send("mimo:permission", { type: permMatch[1], target: permMatch[2], raw: t });
      } else if (streamToWindow) {
        mainWindow?.webContents.send("mimo:output", { type: "activity", text: summarizeStderrActivity(t) });
      }
      markActivity();
    });

    child.on("error", (e) => {
      console.log("[mimo] error:", e.message);
      stderrText ||= e.message;
      finishRun(-1);
    });
    child.on("close", (code) => {
      console.log("[mimo] close code:", code, "fullText:", fullText.slice(0, 200));
      finishRun(code ?? 0);
    });
  });
}

function createFileActivityWatcher(cwd: string) {
  if (!cwd || !existsSync(cwd)) return undefined;
  let watcher: FSWatcher | undefined;
  const seen = new Map<string, number>();
  const ignored = /(^|[\\/])(?:\.git|node_modules|dist|release|\.vite|(?:\.mimocode|\.movo)[\\/]cache)([\\/]|$)/i;

  try {
    watcher = watch(cwd, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const rel = String(filename).replace(/\\/g, "/");
      if (!rel || ignored.test(rel)) return;
      const base = basename(rel);
      if (!base || base.startsWith(".") && /\.(swp|tmp|lock)$/i.test(base)) return;
      const nowTs = Date.now();
      const last = seen.get(rel) || 0;
      if (nowTs - last < 1500) return;
      seen.set(rel, nowTs);
      const isProjectConfig = /(^|[\\/])(?:\.mimocode|\.movo)([\\/]|$)/i.test(rel);
      const action = isProjectConfig
        ? (eventType === "rename" ? "Creating project config file" : "Writing project config file")
        : (eventType === "rename" ? "Creating or moving file" : "Writing file");
      mainWindow?.webContents.send("mimo:output", {
        type: "activity",
        text: `${action}: ${base}`,
        detail: [
          `Path: ${rel}`,
          isProjectConfig ? "This is a Movo project configuration file passed to the MiMo Code engine." : "",
          "Detected from project file changes while Movo is running"
        ].filter(Boolean).join("\n")
      });
    });
  } catch (e) {
    console.warn("[mimo] file activity watcher unavailable:", e);
  }

  return {
    close: () => {
      try { watcher?.close(); } catch {}
    }
  };
}

function killProcessTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid) {
    child.kill();
    return;
  }
  if (platform() === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function openExternalTerminal(cwd: string) {
  if (platform() === "win32") {
    const script = [
      "$cwd = $args[0]",
      "if (Get-Command wt.exe -ErrorAction SilentlyContinue) {",
      "  Start-Process wt.exe -ArgumentList @('-d', $cwd)",
      "} else {",
      "  Start-Process powershell.exe -WorkingDirectory $cwd -ArgumentList @('-NoLogo', '-NoExit')",
      "}"
    ].join("; ");
    spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, cwd], {
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  if (platform() === "darwin") {
    spawn("open", ["-a", "Terminal", cwd], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  const candidates = [
    ["x-terminal-emulator", ["--working-directory", cwd]],
    ["gnome-terminal", ["--working-directory", cwd]],
    ["konsole", ["--workdir", cwd]],
    ["xfce4-terminal", ["--working-directory", cwd]],
    ["xterm", ["-e", `cd "${cwd.replace(/"/g, '\\"')}" && ${process.env.SHELL || "bash"}`]]
  ] as const;

  for (const [command, args] of candidates) {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.unref();
      return;
    } catch {}
  }

  throw new Error("No supported external terminal was found.");
}

function extractOutputText(event: any): string {
  if (!event || typeof event !== "object") return "";
  const type = String(event.type || event.event || event.name || "").toLowerCase();
  if (type === "text" || type.includes("delta") || type.includes("message")) {
    const part = event.part;
    if (part && typeof part.text === "string") {
      const text = part.text;
      if (text.includes("<system-reminder>") || text.includes("</system-reminder>")) return "";
      return text;
    }
  }
  if (type === "tool_use" || type === "step_start" || type === "step_finish") return "";
  const activityOnly =
    type.includes("tool") ||
    type.includes("call") ||
    type.includes("function") ||
    type.includes("bash") ||
    type.includes("shell") ||
    type.includes("command") ||
    type.includes("permission") ||
    type.includes("file") ||
    type.includes("edit") ||
    type.includes("search") ||
    type.includes("read");
  if (activityOnly) return "";
  const candidates = [
    event.part?.text,
    event.delta,
    event.text,
    event.message?.content,
    event.content
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
  }
  if (Array.isArray(event.message?.content)) {
    return event.message.content
      .map((part: any) => typeof part?.text === "string" ? part.text : "")
      .join("");
  }
  return "";
}

function summarizeMimoToolEvent(event: any): { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string } | "" {
  if (!event || typeof event !== "object") return "";
  const type = String(event.type || event.event || event.name || "").toLowerCase();
  const part = event.part || {};
  const partType = String(part.type || "").toLowerCase();
  if (type === "text" || type.includes("delta") || type.includes("message") || type.includes("thinking")) return "";

  const input = normalizeToolPayload(part.state?.input || part.input || event.input || event.args || event.arguments || event.command?.args || {});
  const output = normalizeToolPayload(part.state?.output || part.output || event.output || event.result || {});
  const metadata = normalizeToolPayload(part.state?.metadata || part.metadata || event.metadata || {});
  const tool = normalizeToolName(part.tool || part.name || part.tool_name || event.tool || event.tool_name || event.action || event.command?.name);
  const status = part.state?.status || event.status || event.state?.status || event.state;

  if (type === "step_start") return { text: "Starting step", detail: part.title || part.name || "" };
  if (type === "step_finish") return summarizeStepFinish(part);
  if (type.includes("permission")) return { text: "Permission requested", detail: input.target || input.path || input.type || "" };
  if (!tool && !(type.includes("tool") || partType.includes("tool"))) return "";

  const normalizedTool = tool || "tool";
  const base = { text: describeToolStart(normalizedTool, status), detail: formatToolParameters(input, metadata) };

  if (["write", "create", "multiedit"].includes(normalizedTool)) {
    const filePath = input.filePath || input.path || metadata.filepath || metadata.path || "";
    const content = typeof input.content === "string" ? input.content : "";
    return {
      text: `Writing ${filePath ? basename(filePath) : "file"}`,
      detail: joinDetail([
        filePath && `Target: ${filePath}`,
        input.mode && `Mode: ${input.mode}`,
        content && `Preview:\n${content.slice(0, 220)}${content.length > 220 ? "..." : ""}`,
        output && `Result:\n${formatOutputPreview(output, 6)}`
      ]),
      code: content || undefined,
      codeLang: content ? extToLang(filePath) : undefined
    };
  }

  if (normalizedTool === "edit") {
    const filePath = input.filePath || input.path || metadata.filepath || metadata.path || "";
    const oldStr = input.oldString || input.old_string || input.find || "";
    const newStr = input.newString || input.new_string || input.replace || "";
    return {
      text: `Editing ${filePath ? basename(filePath) : "file"}`,
      detail: joinDetail([
        filePath && `Target: ${filePath}`,
        oldStr && `Replacing ${String(oldStr).split("\n").length} line(s)`,
        newStr && `With ${String(newStr).split("\n").length} line(s)`,
        output && `Result:\n${formatOutputPreview(output, 6)}`
      ]),
      oldCode: oldStr ? String(oldStr) : undefined,
      newCode: newStr ? String(newStr) : undefined,
      editFilePath: filePath || undefined
    };
  }

  if (normalizedTool === "apply_patch" || normalizedTool === "patch") {
    const patch = String(input.patchText || input.patch || input.content || "");
    const files = extractPatchFiles(patch);
    return {
      text: `Applying patch${files.length ? ` to ${files.length} file(s)` : ""}`,
      detail: joinDetail([
        files.length && `Files:\n${files.map((file) => `- ${file}`).join("\n")}`,
        output && `Result:\n${formatOutputPreview(output, 6)}`
      ]),
      code: patch || undefined,
      codeLang: patch ? "diff" : undefined
    };
  }

  if (normalizedTool === "read") {
    const filePath = input.filePath || input.path || input.file || "";
    const renderedOutput = output ? stringifyToolValue(output) : "";
    return {
      text: `Reading ${filePath ? basename(filePath) : "file"}`,
      detail: joinDetail([
        filePath && `Path: ${filePath}`,
        input.offset !== undefined && `Offset: ${input.offset}`,
        input.limit !== undefined && `Limit: ${input.limit}`,
        input.start !== undefined && `Start: ${input.start}`,
        input.end !== undefined && `End: ${input.end}`,
        renderedOutput && `Preview:\n${formatOutputPreview(renderedOutput, 8)}`
      ]),
      code: renderedOutput || undefined,
      codeLang: renderedOutput ? extToLang(filePath) : undefined
    };
  }

  if (["bash", "command", "shell"].includes(normalizedTool)) {
    const cmd = input.command || input.cmd || "";
    return {
      text: "Running command",
      detail: joinDetail([
        cmd && `Command:\n${cmd}`,
        input.cwd && `Working directory: ${input.cwd}`,
        input.timeout && `Timeout: ${input.timeout}`,
        output && `Output preview:\n${formatOutputPreview(output, 8)}`
      ]),
      code: cmd ? String(cmd) : undefined,
      codeLang: cmd ? "bash" : undefined
    };
  }

  if (["search", "grep", "find", "glob"].includes(normalizedTool)) {
    const query = input.query || input.pattern || input.keyword || input.glob || "";
    return {
      text: normalizedTool === "glob" ? "Finding files" : "Searching project",
      detail: joinDetail([
        query && `Query: ${query}`,
        input.path && `Path: ${input.path}`,
        input.include && `Include: ${input.include}`,
        input.exclude && `Exclude: ${input.exclude}`,
        output && `Matches:\n${formatOutputPreview(output, 10)}`
      ]),
      code: output ? stringifyToolValue(output) : undefined,
      codeLang: output ? "text" : undefined
    };
  }

  if (["todowrite", "todo", "task"].includes(normalizedTool)) {
    const todos = input.todos || input.tasks || output.todos || output.tasks || [];
    return {
      text: "Updating task list",
      detail: Array.isArray(todos)
        ? todos.map((todo: any, index: number) => `${index + 1}. [${todo.status || todo.state || "todo"}] ${todo.content || todo.text || todo.title || JSON.stringify(todo)}`).join("\n")
        : formatToolParameters(input, metadata)
    };
  }

  if (normalizedTool === "webfetch" || normalizedTool === "web_fetch") {
    return { text: "Fetching web page", detail: joinDetail([input.url && `URL: ${input.url}`, input.prompt && `Prompt: ${input.prompt}`, output && `Result:\n${formatOutputPreview(output, 8)}`]) };
  }

  if (normalizedTool === "websearch" || normalizedTool === "web_search") {
    return { text: "Searching web", detail: joinDetail([input.query && `Query: ${input.query}`, output && `Results:\n${formatOutputPreview(output, 8)}`]) };
  }

  if (normalizedTool === "question") {
    return { text: "Asking a question", detail: joinDetail([input.header && `Header: ${input.header}`, input.question && `Question: ${input.question}`, input.options && `Options:\n${formatOutputPreview(input.options, 8)}`]) };
  }

  if (normalizedTool === "lsp") {
    return { text: "Using language server", detail: joinDetail([input.operation && `Operation: ${input.operation}`, input.path && `Path: ${input.path}`, input.position && `Position: ${stringifyToolValue(input.position)}`]) };
  }

  if (normalizedTool === "skill") {
    return { text: "Loading skill", detail: joinDetail([input.name && `Skill: ${input.name}`, input.path && `Path: ${input.path}`, output && `Loaded:\n${formatOutputPreview(output, 6)}`]) };
  }

  return { text: base.text || `Using ${normalizedTool}`, detail: joinDetail([base.detail, output && `Result:\n${formatOutputPreview(output, 8)}`]) };
}

function summarizeActivityEvent(event: any): { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string } | "" {
  const summary = summarizeMimoToolEvent(event);
  if (summary) return summary;
  return summarizeActivityEventLegacy(event);
}

function summarizeActivityEventLegacy(event: any): { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string } | "" {
  if (!event || typeof event !== "object") return "";
  const type = String(event.type || event.event || event.name || "").toLowerCase();
  const part = event.part || {};
  const partType = String(part.type || "").toLowerCase();
  const tool = part.tool || event.tool || event.tool_name || event.name || event.action || event.command?.name;
  const status = part.state?.status || event.status || event.state;
  const input = part.state?.input || event.input;
  const output = part.state?.output || event.output;
  const metadata = part.state?.metadata || {};

  if (type === "text" || type.includes("delta") || type.includes("message") || type.includes("thinking")) return "";

  if (type === "tool_use") {
    const toolName = tool || "tool";
    let text = toolName;
    let detail = "";
    let code: string | undefined;
    let codeLang: string | undefined;
    let oldCode: string | undefined;
    let newCode: string | undefined;
    let editFilePath: string | undefined;

    const extToLang = (p: string) => {
      const ext = (p.split(".").pop() || "").toLowerCase();
      const map: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", vue: "html", py: "python", php: "php", css: "css", scss: "css", json: "json", md: "markdown", html: "html", sh: "bash", bash: "bash", rs: "rust", go: "go", java: "java", rb: "ruby", c: "c", cpp: "cpp", h: "c" };
      return map[ext] || ext;
    };

    if (toolName === "write" || toolName === "create") {
      const filePath = input?.filePath || metadata?.filepath || "";
      const preview = input?.content ? input.content.slice(0, 200) : "";
      text = `write ${filePath ? filePath.split(/[/\\]/).pop() : ""}`;
      detail = filePath;
      if (preview) detail += `\n${preview}${input.content.length > 200 ? "..." : ""}`;
      if (output) detail += `\n✓ ${output}`;
      if (input?.content) {
        code = input.content;
        codeLang = extToLang(filePath);
      }
    } else if (toolName === "edit") {
      const filePath = input?.filePath || metadata?.filepath || "";
      const oldStr = input?.oldString || "";
      const newStr = input?.newString || "";
      text = `edit ${filePath ? filePath.split(/[/\\]/).pop() : ""}`;
      detail = filePath;
      if (output) detail += `\n✓ ${output}`;
      editFilePath = filePath;
      if (oldStr) oldCode = oldStr;
      if (newStr) newCode = newStr;
    } else if (toolName === "read") {
      const filePath = input?.filePath || input?.path || "";
      text = `read ${filePath ? filePath.split(/[/\\]/).pop() : ""}`;
      detail = filePath;
      if (output) {
        const lines = output.split("\n");
        const preview = lines.slice(0, 8).join("\n");
        detail += `\n${preview}${lines.length > 8 ? `\n... (${lines.length} lines)` : ""}`;
      }
      if (output) {
        code = output;
        codeLang = extToLang(filePath);
      }
    } else if (toolName === "bash" || toolName === "command") {
      const cmd = input?.command || "";
      text = "bash";
      detail = cmd;
      if (output) {
        const lines = output.split("\n");
        const preview = lines.slice(0, 6).join("\n");
        detail += `\n${preview}${lines.length > 6 ? `\n... (${lines.length} lines)` : ""}`;
      }
      if (cmd) {
        code = cmd;
        codeLang = "bash";
      }
    } else if (toolName === "search" || toolName === "grep" || toolName === "find" || toolName === "glob") {
      const query = input?.query || input?.pattern || input?.keyword || "";
      text = `search ${query}`;
      detail = output ? output.split("\n").slice(0, 10).join("\n") : "";
      if (output) {
        code = output;
        codeLang = "text";
      }
    } else if (toolName === "shell") {
      const cmd = input?.command || "";
      text = "shell";
      detail = cmd;
      if (output) detail += `\n${output.split("\n").slice(0, 5).join("\n")}`;
      if (cmd) {
        code = cmd;
        codeLang = "bash";
      }
    } else if (toolName === "permission") {
      text = "permission requested";
      detail = input?.target || input?.type || "";
    } else {
      if (input && typeof input === "object") {
        const parts = [];
        if (input.filePath) parts.push(input.filePath);
        if (input.command) parts.push(input.command);
        if (input.query) parts.push(input.query);
        if (input.path) parts.push(input.path);
        detail = parts.join(" ");
      }
      if (output) detail += `\n✓ ${String(output).slice(0, 150)}`;
    }

    return { text, detail, code, codeLang, oldCode, newCode, editFilePath };
  }

  if (type === "step_start") return { text: "Starting step", detail: "" };
  if (type === "step_finish") {
    const reason = part.reason || "";
    const tokens = part.tokens;
    let detail = reason;
    if (tokens) {
      const parts = [];
      if (tokens.input) parts.push(`${tokens.input} in`);
      if (tokens.output) parts.push(`${tokens.output} out`);
      if (tokens.reasoning) parts.push(`${tokens.reasoning} think`);
      if (parts.length) detail = parts.join(" · ");
    }
    if (reason === "tool-calls") return { text: "Processing tool results...", detail };
    return { text: "Step complete", detail };
  }

  if (type.includes("permission")) return { text: "Permission requested", detail: input?.target || input?.path || "" };

  if (status && typeof status === "string") return { text: status, detail: "" };
  return "";
}

function summarizeStderrActivity(text: string): string {
  const clean = text.trim();
  if (!clean) return "";
  const firstLine = clean.split(/\r?\n/).find(Boolean) || clean;
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
}

function normalizeToolName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^mcp__[^_]+__/, "")
    .replace(/^functions\./, "")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function normalizeToolPayload(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : { value };
    } catch {
      return { value };
    }
  }
  if (typeof value === "object") return value;
  return { value };
}

function stringifyToolValue(value: any) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function joinDetail(parts: any[]) {
  return parts.filter(Boolean).map((part) => String(part).trim()).filter(Boolean).join("\n");
}

function formatOutputPreview(value: any, maxLines = 8) {
  const text = stringifyToolValue(value);
  const lines = text.split(/\r?\n/);
  const preview = lines.slice(0, maxLines).join("\n");
  return `${preview}${lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines)` : ""}`;
}

function formatToolParameters(input: Record<string, any>, metadata: Record<string, any>) {
  const important = ["filePath", "path", "command", "query", "pattern", "url", "prompt", "cwd", "mode", "operation", "target", "type"];
  const lines: string[] = [];
  for (const key of important) {
    const value = input[key] ?? metadata[key];
    if (value !== undefined && value !== "") lines.push(`${key}: ${stringifyToolValue(value)}`);
  }
  return lines.join("\n");
}

function describeToolStart(tool: string, status: unknown) {
  const suffix = typeof status === "string" && status ? ` (${status})` : "";
  const labels: Record<string, string> = {
    read: "Reading file",
    write: "Writing file",
    create: "Creating file",
    edit: "Editing file",
    multiedit: "Editing multiple blocks",
    apply_patch: "Applying patch",
    bash: "Running command",
    shell: "Running shell",
    command: "Running command",
    grep: "Searching project",
    glob: "Finding files",
    find: "Finding files",
    webfetch: "Fetching web page",
    websearch: "Searching web",
    todowrite: "Updating task list",
    question: "Asking question",
    lsp: "Using language server",
    skill: "Loading skill"
  };
  return `${labels[tool] || `Using ${tool}`}${suffix}`;
}

function extToLang(filePath: string) {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    vue: "html", py: "python", php: "php", css: "css", scss: "css",
    json: "json", md: "markdown", html: "html", sh: "bash", bash: "bash",
    rs: "rust", go: "go", java: "java", rb: "ruby", c: "c", cpp: "cpp", h: "c"
  };
  return map[ext] || ext || "text";
}

function extractPatchFiles(patch: string) {
  const files = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const match = line.match(/^(?:\*\*\* (?:Update|Add|Delete) File:|--- a\/|\+\+\+ b\/)\s*(.+)$/);
    if (match?.[1]) files.add(match[1].trim());
  }
  return Array.from(files);
}

function summarizeStepFinish(part: any) {
  const reason = part.reason || "";
  const tokens = part.tokens;
  let detail = reason;
  if (tokens) {
    const parts = [];
    if (tokens.input) parts.push(`${tokens.input} input`);
    if (tokens.output) parts.push(`${tokens.output} output`);
    if (tokens.reasoning) parts.push(`${tokens.reasoning} reasoning`);
    if (parts.length) detail = parts.join(" · ");
  }
  if (reason === "tool-calls") return { text: "Processing tool results", detail };
  return { text: "Step complete", detail };
}

function isCompletionEvent(event: any): boolean {
  if (!event || typeof event !== "object") return false;
  const type = String(event.type || event.event || event.name || "").toLowerCase();
  if ([
    "done",
    "complete",
    "completed",
    "result",
    "message_stop",
    "turn_complete",
    "response.completed",
    "assistant_message_stop"
  ].includes(type)) return true;
  if (type === "step_finish") {
    const reason = String(event.part?.reason || "").toLowerCase();
    return reason === "stop" || reason === "end_turn" || reason === "max_tokens";
  }
  return false;
}

let lastRunChatId = "";
let lastRunMessage = "";

function activeChatSnapshot() {
  if (!lastRunChatId) return null;
  return { chatId: lastRunChatId, message: lastRunMessage };
}
