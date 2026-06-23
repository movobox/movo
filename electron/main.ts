import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
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
  permissions: { edit: string; bash: string; webfetch: string; websearch: string };
  checkpoint: { enabled: boolean };
  memory: { enabled: boolean };
  compaction: { auto: boolean; prune: boolean; reserved: number };
  watcher: { enabled: boolean };
  share: string;
  autoupdate: boolean | "notify";
  experimental: { maxMode: boolean };
  mcpServersJson: string;
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

const defaultAppSettings: AppSettings = {
  language: "en", model: "", provider: "", agent: "build",
  trustWorkspace: true, skipPermissions: false, theme: "dark",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true }, memory: { enabled: true },
  compaction: { auto: true, prune: true, reserved: 10000 }, watcher: { enabled: true },
  share: "manual", autoupdate: true,
  experimental: { maxMode: false }, mcpServersJson: "{}", keybindingsJson: "{}",
  serverJson: "{}", instructionsJson: "[]", providerJson: "{}"
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | undefined;
let activeProcess: ChildProcessWithoutNullStreams | undefined;
const terminalProcesses = new Map<string, IPty>();

function settingsPath() { return join(app.getPath("userData"), "studio-settings.json"); }

function loadSettings(): Settings {
  const file = settingsPath();
  if (!existsSync(file)) return { app: defaultAppSettings, chats: [], ui: { activeChatId: "", draftChat: null } };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      app: { ...defaultAppSettings, ...(parsed.app || {}) },
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1040, minHeight: 700,
    backgroundColor: "#0e0e10", title: "MiMo Studio",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC handlers ──

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:save", (_event, appSettings: AppSettings) => {
  const settings = loadSettings();
  settings.app = { ...defaultAppSettings, ...appSettings };
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
    defaultPath: `${safeFileName(chat?.title || "mimo-session")}.json`,
    filters: [{ name: "MiMo session", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, error: "Canceled." };
  writeFileSync(result.filePath, JSON.stringify(chat, null, 2), "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("chat:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    filters: [{ name: "MiMo session", extensions: ["json"] }]
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
  const file = projectConfigPath(folder);
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
    if (validFiles.length > 0) {
      finalMessage = stripAttachedFileMentions(finalMessage, validFiles, projectFolder);
      const fileBlocks: string[] = [];
      for (const f of validFiles) {
        const trimmed = f.trim();
        try {
          const content = readFileSync(trimmed, "utf8");
          let relPath = trimmed;
          try { relPath = relative(projectFolder, trimmed).replace(/\\/g, "/"); } catch {}
          const lang = (trimmed.split(".").pop() || "").toLowerCase();
          fileBlocks.push(`<file path="${relPath}">\n\`\`\`${lang}\n${content}\n\`\`\`\n</file>`);
        } catch (e) {
          console.warn("[main] could not read file:", trimmed, e);
        }
      }
      if (fileBlocks.length > 0) {
        if (!finalMessage.trim()) finalMessage = "Use the attached file(s) as context.";
        finalMessage = `${finalMessage}\n\n<attached_files>\n${fileBlocks.join("\n\n")}\n</attached_files>`;
      }
    }
    args.push(finalMessage);
    console.log("[main] mimo:run args:", args);
    return runMimo(args, payload.chat.folder || process.cwd(), true);
  } catch (e) {
    console.error("[main] mimo:run error:", e);
    return { ok: false, code: -1, output: String(e) };
  }
});

ipcMain.handle("mimo:sessions", () => runMimo(["session", "list"], process.cwd(), false));

ipcMain.handle("mimo:stop", () => {
  activeProcess?.kill();
  activeProcess = undefined;
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
  return join(folder, ".mimocode", "mimocode.json");
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 80) || "mimo-session";
}

function stripAttachedFileMentions(message: string, files: string[], projectFolder: string) {
  let output = message;
  for (const file of files) {
    const variants = new Set<string>();
    const absolute = file.replace(/\\/g, "/");
    const absoluteWin = file.replace(/\//g, "\\");
    let relativePath = "";
    try { relativePath = relative(projectFolder, file).replace(/\\/g, "/"); } catch {}
    for (const value of [file, absolute, absoluteWin, relativePath, relativePath.replace(/\//g, "\\")]) {
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
  const file = projectConfigPath(folder);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) { try { existing = JSON.parse(readFileSync(file, "utf8")); } catch { existing = {}; } }
  const perm = appSettings.permissions || {};
  const config: Record<string, unknown> = {
    ...existing,
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
  mergeJsonConfig(config, "mcp", appSettings.mcpServersJson);
  mergeJsonConfig(config, "server", appSettings.serverJson);
  mergeJsonConfig(config, "instructions", appSettings.instructionsJson);
  mergeJsonConfig(config, "provider", appSettings.providerJson);
  writeFileSync(file, JSON.stringify(config, null, 2), "utf8");
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

function runMimo(args: string[], cwd: string, streamToWindow = true, retryCount = 0, accumulatedOutput = ""): Promise<{ ok: boolean; code: number; output: string }> {
  const binary = findMimoBinary();
  console.log("[mimo] binary:", binary, "args:", args, "cwd:", cwd);
  if (!binary) {
    const msg = "MiMo binary not found. Install @mimo-ai/cli.";
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
    if (code !== 0 && code !== -1) return true;
    const lower = stderr.toLowerCase();
    return NETWORK_ERRORS.some((e) => lower.includes(e.toLowerCase()));
  }

  return new Promise<{ ok: boolean; code: number; output: string }>((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    child.stdin.end();
    if (activeProcess) activeProcess.kill();
    activeProcess = child;
    let fullText = accumulatedOutput;
    let stderrText = "";

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
    flushLineBuffer();
    if (shouldKill && !child.killed) child.kill();
    activeProcess = undefined;

    const hasOutput = fullText.trim().length > 0;
    const shouldRetry = !hasOutput && retryCount < MAX_RETRIES && (code !== 0 || isNetworkError(stderrText, code));

    if (shouldRetry) {
      const delay = RETRY_DELAYS[retryCount] || 30000;
      console.log(`[mimo] retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES}), code: ${code}`);
      if (streamToWindow) {
        mainWindow?.webContents.send("mimo:output", { type: "activity", text: `Retrying... (${retryCount + 1}/${MAX_RETRIES})`, detail: `Connection issue, retrying in ${delay / 1000}s` });
        mainWindow?.webContents.send("mimo:output", { type: "retrying", attempt: retryCount + 1, maxRetries: MAX_RETRIES, delay });
      }
      setTimeout(() => {
        resolve(runMimo(args, cwd, streamToWindow, retryCount + 1, fullText).then((r) => {
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
          text: "Still waiting for MiMo...",
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
      stderrText ||= `No response from MiMo for ${Math.round(STALL_TIMEOUT_MS / 60000)} minutes.`;
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

function summarizeActivityEvent(event: any): { text: string; detail: string; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string } | "" {
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
