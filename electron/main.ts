import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, platform } from "node:os";

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
const terminalProcesses = new Map<string, ChildProcessWithoutNullStreams>();

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
    const args = ["run", "--format", "json", "--dangerously-skip-permissions"];
    const s = { ...defaultAppSettings, ...payload.appSettings };
    if (s.agent) args.push("--agent", s.agent);
    if (s.model) args.push("--model", s.model);
    const hasAssistantReply = payload.chat.messages?.some(m => m.role === "assistant" && m.text.trim());
    if (hasAssistantReply) args.push("--continue");
    if (payload.chat.title) args.push("--title", payload.chat.title);
    for (const f of payload.extraFiles || []) { if (f.trim()) args.push("--file", f.trim()); }
    args.push(payload.message);
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
  const child = spawnInteractiveShell(cwd);
  terminalProcesses.set(terminalId, child);

  child.stdout.on("data", (d: Buffer) => {
    mainWindow?.webContents.send("terminal:data", { terminalId, data: d.toString() });
  });
  child.stderr.on("data", (d: Buffer) => {
    mainWindow?.webContents.send("terminal:data", { terminalId, data: d.toString() });
  });
  child.on("error", (e) => {
    terminalProcesses.delete(terminalId);
    mainWindow?.webContents.send("terminal:data", { terminalId, data: `${e.message}\r\n` });
    mainWindow?.webContents.send("terminal:exit", { terminalId, code: -1 });
  });
  child.on("close", (code) => {
    terminalProcesses.delete(terminalId);
    mainWindow?.webContents.send("terminal:exit", { terminalId, code: code ?? 0, cwd });
  });

  return { ok: true };
});

ipcMain.handle("terminal:input", (_event, payload: { terminalId: string; data: string }) => {
  const child = terminalProcesses.get(payload?.terminalId);
  if (!child || child.stdin.destroyed) return { ok: false };
  child.stdin.write(payload.data);
  return { ok: true };
});

ipcMain.handle("terminal:resize", () => {
  return { ok: true };
});

ipcMain.handle("terminal:stop", (_event, terminalId: string) => {
  const child = terminalProcesses.get(terminalId);
  if (!child) return { ok: true };
  killProcessTree(child);
  terminalProcesses.delete(terminalId);
  mainWindow?.webContents.send("terminal:exit", { terminalId, code: null });
  return { ok: true };
});

// ── helpers ──

function projectConfigPath(folder: string) {
  if (!folder) return "";
  return join(folder, ".mimocode", "mimocode.json");
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

function runMimo(args: string[], cwd: string, streamToWindow = true) {
  const binary = findMimoBinary();
  console.log("[mimo] binary:", binary, "args:", args, "cwd:", cwd);
  if (!binary) {
    const msg = "MiMo binary not found. Install @mimo-ai/cli.";
    console.log("[mimo] ERROR:", msg);
    if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stderr", text: msg });
    return Promise.resolve({ ok: false, code: -1, output: msg });
  }

  const child = spawn(binary, args, {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  child.stdin.end();
  if (activeProcess) activeProcess.kill();
  activeProcess = child;
  let fullText = "";
  let stderrText = "";

  console.log("[mimo] spawned pid:", child.pid);

  let lineBuffer = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let resolveRun: ((value: { ok: boolean; code: number; output: string }) => void) | undefined;

  const clearIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
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
    flushLineBuffer();
    if (shouldKill && !child.killed) child.kill();
    activeProcess = undefined;
    resolveRun?.({ ok: code === 0, code, output: fullText || stderrText });
  };
  const scheduleTextIdleFinish = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (fullText.trim()) finishRun(0, true);
    }, 2500);
  };

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
        if (activity && streamToWindow) {
          mainWindow?.webContents.send("mimo:output", { type: "activity", text: activity });
        }
        if (text) {
          fullText += text;
          if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text });
          scheduleTextIdleFinish();
        }
        if (isCompletionEvent(event)) {
          finishRun(0, true);
        }
      } catch {
        if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text: line + "\n" });
        fullText += line + "\n";
        scheduleTextIdleFinish();
      }
    }
  });

  child.stderr.on("data", (d: Buffer) => {
    const t = d.toString();
    stderrText += t;
    console.log("[mimo] stderr:", t);
    const permMatch = t.match(/permission requested:\s*(\S+)\s*\(([^)]+)\)/);
    if (permMatch && streamToWindow) {
      mainWindow?.webContents.send("mimo:permission", { type: permMatch[1], target: permMatch[2], raw: t });
    } else if (streamToWindow) {
      mainWindow?.webContents.send("mimo:output", { type: "activity", text: summarizeStderrActivity(t) });
    }
  });

  return new Promise<{ ok: boolean; code: number; output: string }>((resolve) => {
    resolveRun = resolve;
    child.on("error", (e) => { console.log("[mimo] error:", e.message); stderrText ||= e.message; finishRun(-1); });
    child.on("close", (code) => {
      console.log("[mimo] close code:", code, "fullText:", fullText.slice(0, 200));
      finishRun(code ?? 0);
    });
  });
}

function spawnInteractiveShell(cwd: string) {
  if (platform() === "win32") {
    return spawn("powershell.exe", ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass"], {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
    });
  }
  const shell = process.env.SHELL || "/bin/bash";
  return spawn(shell, ["-il"], {
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
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

function summarizeActivityEvent(event: any): string {
  if (!event || typeof event !== "object") return "";
  const type = String(event.type || event.event || event.name || "").toLowerCase();
  const tool = event.tool || event.tool_name || event.name || event.action || event.command?.name;
  const command = event.command || event.cmd || event.args?.command || event.input?.command;
  const path = event.path || event.file || event.target || event.input?.path;
  const status = event.status || event.state;

  if (type.includes("text") || type.includes("delta") || type.includes("message")) return "";
  if (type.includes("permission")) return `Permission requested${path ? `: ${path}` : ""}`;
  if (type.includes("tool") || type.includes("call") || type.includes("function")) {
    if (typeof command === "string") return `Running command: ${command}`;
    if (typeof tool === "string") return `Using ${tool}`;
    return "Using a tool";
  }
  if (type.includes("bash") || type.includes("shell") || type.includes("command")) {
    return typeof command === "string" ? `Running command: ${command}` : "Running command";
  }
  if (type.includes("file") || type.includes("edit") || type.includes("write")) {
    return path ? `Updating ${path}` : "Updating files";
  }
  if (type.includes("search")) return "Searching project";
  if (type.includes("read")) return path ? `Reading ${path}` : "Reading files";
  if (type.includes("start")) return "Starting task";
  if (status && typeof status === "string") return status;
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
  return [
    "done",
    "complete",
    "completed",
    "result",
    "message_stop",
    "turn_complete",
    "response.completed",
    "assistant_message_stop"
  ].includes(type);
}
