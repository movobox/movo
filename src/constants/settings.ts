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
  skillsJson: JSON.stringify(defaultSkills, null, 2),
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
    skillsJson: withDefaultSkills(value.skillsJson || defaultSettings.skillsJson),
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

function withDefaultSkills(raw: string): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const paths = Array.isArray(current.paths)
      ? current.paths.map(String)
      : [];
    return JSON.stringify({
      ...current,
      paths: [...new Set([...defaultSkills.paths, ...paths])]
    }, null, 2);
  } catch {
    return raw || defaultSettings.skillsJson;
  }
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
