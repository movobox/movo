import type { AppSettings } from "../types";

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
  }
};

const defaultAgents = {
  review: {
    description: "Review current changes for bugs, regressions, security issues, and missing verification.",
    mode: "subagent",
    temperature: 0.1,
    tools: { write: false, edit: false, bash: false }
  },
  research: {
    description: "Research unfamiliar APIs, libraries, docs, or examples before implementation.",
    mode: "subagent",
    temperature: 0.2,
    tools: { write: false, edit: false, bash: true, webfetch: true, websearch: true }
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

const defaultToolConfig = {
  invocation_style: "json"
};

const defaultLspConfig = {};
const defaultFormatterConfig = {};

export const defaultSettings: AppSettings = {
  language: "en",
  model: "",
  provider: "",
  agent: "build",
  trustWorkspace: true,
  skipPermissions: false,
  theme: "dark",
  projectConfigDir: ".movo",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  checkpoint: { enabled: true },
  memory: { enabled: true },
  compaction: { auto: true, prune: true, reserved: 10000 },
  watcher: { enabled: true },
  share: "manual",
  autoupdate: true,
  experimental: { maxMode: false },
  mcpServersJson: JSON.stringify(defaultPinooxMcpServers, null, 2),
  agentsJson: JSON.stringify(defaultAgents, null, 2),
  commandsJson: JSON.stringify(defaultCommands, null, 2),
  toolJson: JSON.stringify(defaultToolConfig, null, 2),
  lspJson: JSON.stringify(defaultLspConfig, null, 2),
  formatterJson: JSON.stringify(defaultFormatterConfig, null, 2),
  keybindingsJson: "{}",
  serverJson: "{}",
  instructionsJson: JSON.stringify(defaultInstructions, null, 2),
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
    mcpServersJson: withDefaultMcp(value.mcpServersJson || defaultSettings.mcpServersJson),
    agentsJson: withDefaultObject(value.agentsJson || defaultSettings.agentsJson, defaultAgents),
    commandsJson: withDefaultObject(value.commandsJson || defaultSettings.commandsJson, defaultCommands),
    toolJson: withDefaultObject(value.toolJson || defaultSettings.toolJson, defaultToolConfig),
    lspJson: withDefaultObject(value.lspJson || defaultSettings.lspJson, defaultLspConfig),
    formatterJson: withDefaultObject(value.formatterJson || defaultSettings.formatterJson, defaultFormatterConfig),
    keybindingsJson: value.keybindingsJson || defaultSettings.keybindingsJson,
    serverJson: value.serverJson || defaultSettings.serverJson,
    instructionsJson: withDefaultInstructions(value.instructionsJson || defaultSettings.instructionsJson),
    providerJson: value.providerJson || defaultSettings.providerJson,
    projectConfigDir: normalizeProjectConfigDir(value.projectConfigDir)
  };
}

export function withDefaultPinooxMcp(raw: string): string {
  return withDefaultMcp(raw);
}

export function withDefaultMcp(raw: string): string {
  return withDefaultObject(raw, defaultPinooxMcpServers);
}

function withDefaultObject(raw: string, defaults: Record<string, unknown>): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return JSON.stringify({ ...defaults, ...current }, null, 2);
  } catch {
    return raw || JSON.stringify(defaults, null, 2);
  }
}

function withDefaultInstructions(raw: string): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : [];
    const current = Array.isArray(parsed) ? parsed.map(String) : [];
    return JSON.stringify([...new Set([...defaultInstructions, ...current])], null, 2);
  } catch {
    return raw || defaultSettings.instructionsJson;
  }
}

function normalizeProjectConfigDir(value?: string): string {
  const current = value?.trim();
  if (!current || current === ".mimocode") return defaultSettings.projectConfigDir;
  return current;
}
