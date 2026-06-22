import type { AppSettings } from "../types";

export const defaultSettings: AppSettings = {
  language: "en",
  model: "",
  provider: "",
  agent: "build",
  trustWorkspace: true,
  skipPermissions: false,
  theme: "dark",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true },
  memory: { enabled: true },
  compaction: { auto: true, prune: true, reserved: 10000 },
  watcher: { enabled: true },
  share: "manual",
  autoupdate: true,
  experimental: { maxMode: false },
  mcpServersJson: "{}",
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
    mcpServersJson: value.mcpServersJson || defaultSettings.mcpServersJson,
    keybindingsJson: value.keybindingsJson || defaultSettings.keybindingsJson,
    serverJson: value.serverJson || defaultSettings.serverJson,
    instructionsJson: value.instructionsJson || defaultSettings.instructionsJson,
    providerJson: value.providerJson || defaultSettings.providerJson
  };
}
