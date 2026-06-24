import type { AppSettings } from "../types";

const defaultPinooxMcpServers = {
  pinoox: {
    type: "local",
    command: ["npx", "-y", "pinoox-mcp"],
    environment: {
      PINOOX_ROOT: "${workspaceFolder}",
      PINX_ROOT: "${workspaceFolder}"
    }
  }
};

export const defaultSettings: AppSettings = {
  language: "en",
  model: "",
  provider: "",
  agent: "build",
  trustWorkspace: true,
  skipPermissions: false,
  theme: "dark",
  projectConfigDir: ".mimocode",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true },
  memory: { enabled: true },
  compaction: { auto: true, prune: true, reserved: 10000 },
  watcher: { enabled: true },
  share: "manual",
  autoupdate: true,
  experimental: { maxMode: false },
  mcpServersJson: JSON.stringify(defaultPinooxMcpServers, null, 2),
  keybindingsJson: "{}",
  serverJson: "{}",
  instructionsJson: "[]",
  providerJson: "{}"
};

export function normalizeAppSettings(value: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...value,
    permissions: { ...defaultSettings.permissions, ...(value.permissions || {}) },
    checkpoint: { ...defaultSettings.checkpoint, ...(value.checkpoint || {}) },
    memory: { ...defaultSettings.memory, ...(value.memory || {}) },
    compaction: { ...defaultSettings.compaction, ...(value.compaction || {}) },
    watcher: { ...defaultSettings.watcher, ...(value.watcher || {}) },
    experimental: { ...defaultSettings.experimental, ...(value.experimental || {}) },
    mcpServersJson: withDefaultPinooxMcp(value.mcpServersJson || defaultSettings.mcpServersJson),
    keybindingsJson: value.keybindingsJson || defaultSettings.keybindingsJson,
    serverJson: value.serverJson || defaultSettings.serverJson,
    instructionsJson: value.instructionsJson || defaultSettings.instructionsJson,
    providerJson: value.providerJson || defaultSettings.providerJson,
    projectConfigDir: value.projectConfigDir?.trim() || defaultSettings.projectConfigDir
  };
}

export function withDefaultPinooxMcp(raw: string): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return JSON.stringify({ ...defaultPinooxMcpServers, ...current }, null, 2);
  } catch {
    return raw || defaultSettings.mcpServersJson;
  }
}
