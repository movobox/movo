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
  experimental: { maxMode: boolean };
  mcpServersJson: string;
  keybindingsJson: string;
};

type ChatMessage = { id: string; role: string; text: string; createdAt: string };
type Chat = { id: string; title: string; folder: string; messages: ChatMessage[]; createdAt: string; updatedAt: string };
type Settings = { app: AppSettings; chats: Chat[] };

const defaultAppSettings: AppSettings = {
  language: "en", model: "", provider: "", agent: "build",
  trustWorkspace: true, skipPermissions: false, theme: "dark",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true }, memory: { enabled: true },
  experimental: { maxMode: false }, mcpServersJson: "{}", keybindingsJson: "{}"
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | undefined;
let activeProcess: ChildProcessWithoutNullStreams | undefined;

function settingsPath() { return join(app.getPath("userData"), "studio-settings.json"); }

function loadSettings(): Settings {
  const file = settingsPath();
  if (!existsSync(file)) return { app: defaultAppSettings, chats: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { app: { ...defaultAppSettings, ...(parsed.app || {}) }, chats: Array.isArray(parsed.chats) ? parsed.chats : [] };
  } catch { return { app: defaultAppSettings, chats: [] }; }
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
  };
  if (appSettings.provider) config.provider = appSettings.provider;
  if (appSettings.model) config.model = appSettings.model;
  writeFileSync(file, JSON.stringify(config, null, 2), "utf8");
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
  child.stdout.on("data", (d: Buffer) => {
    lineBuffer += d.toString();
    const parts = lineBuffer.split("\n");
    lineBuffer = parts.pop() || "";
    for (const raw of parts) {
      const line = raw.replace(/\r$/, "");
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "text" && event.part?.text) {
          fullText += event.part.text;
          if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text: event.part.text });
        }
      } catch {
        if (streamToWindow) mainWindow?.webContents.send("mimo:output", { type: "stdout", text: line + "\n" });
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
      mainWindow?.webContents.send("mimo:output", { type: "stderr", text: t });
    }
  });

  return new Promise<{ ok: boolean; code: number; output: string }>((resolve) => {
    child.on("error", (e) => { console.log("[mimo] error:", e.message); activeProcess = undefined; resolve({ ok: false, code: -1, output: e.message }); });
    child.on("close", (code) => {
      if (lineBuffer.trim()) {
        const line = lineBuffer.replace(/\r$/, "");
        try {
          const event = JSON.parse(line);
          if (event.type === "text" && event.part?.text) fullText += event.part.text;
        } catch {}
      }
      console.log("[mimo] close code:", code, "fullText:", fullText.slice(0, 200));
      activeProcess = undefined;
      resolve({ ok: (code ?? 0) === 0, code: code ?? 0, output: fullText || stderrText });
    });
  });
}
