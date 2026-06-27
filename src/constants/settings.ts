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
  },
  framework: {
    description: "Use framework-specific documentation and current best practices before coding.",
    mode: "subagent",
    temperature: 0.15,
    permission: { edit: "deny", bash: "ask", webfetch: "allow", websearch: "allow" }
  },
  pinoox: {
    description: "Unified Pinoox agent that auto-selects architecture, app, migration, UI, security, docs, or marketplace behavior.",
    mode: "subagent",
    temperature: 0.15,
    permission: { edit: "ask", bash: "ask", webfetch: "allow", websearch: "allow" }
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
  framework: {
    description: "Use Context7 MCP for any framework or library docs",
    agent: "framework",
    subtask: true,
    template: "Use the context7 MCP server to fetch current, version-aware documentation for this framework/library/topic: $ARGUMENTS\nReturn the relevant APIs, conventions, pitfalls, and a concise implementation recommendation."
  },
  laravel: {
    description: "Use Laravel docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Laravel documentation. Focus on the Laravel version and packages used in this project when detectable. Task: $ARGUMENTS"
  },
  pinoox: {
    description: "Use the unified Pinoox agent",
    agent: "pinoox",
    template: "Act as the unified Pinoox agent from pinoox/agent-pack. Auto-select the right behavior: architect, single-app builder, app builder, migration builder, UI builder, security reviewer, docs writer, or marketplace publisher. Detect platform vs single-app Pinx shape, use pinoox-mcp when available, avoid editing vendor/pinoox/pincore for app work, and handle: $ARGUMENTS"
  },
  vue: {
    description: "Use Vue docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Vue documentation and ecosystem guidance. Include Vue Router, Pinia, Vite, or Nuxt only when relevant. Task: $ARGUMENTS"
  },
  react: {
    description: "Use React docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for React documentation and ecosystem guidance. Include Next.js or React Router only when relevant. Task: $ARGUMENTS"
  },
  nextjs: {
    description: "Use Next.js docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Next.js documentation. Prefer App Router guidance unless the project uses Pages Router. Task: $ARGUMENTS"
  },
  nuxt: {
    description: "Use Nuxt docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Nuxt documentation. Include Vue and Nitro details only when relevant. Task: $ARGUMENTS"
  },
  angular: {
    description: "Use Angular docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Angular documentation. Prefer current standalone/component-first patterns when compatible with the project. Task: $ARGUMENTS"
  },
  svelte: {
    description: "Use Svelte/SvelteKit docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Svelte or SvelteKit documentation as relevant to the project. Task: $ARGUMENTS"
  },
  django: {
    description: "Use Django docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Django documentation. Include Django REST Framework only when relevant. Task: $ARGUMENTS"
  },
  rails: {
    description: "Use Rails docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Ruby on Rails documentation and conventions. Task: $ARGUMENTS"
  },
  fastapi: {
    description: "Use FastAPI docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for FastAPI documentation. Include Pydantic and async guidance when relevant. Task: $ARGUMENTS"
  },
  spring: {
    description: "Use Spring docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Spring and Spring Boot documentation. Task: $ARGUMENTS"
  },
  dotnet: {
    description: "Use .NET docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for .NET, ASP.NET Core, or Entity Framework documentation as relevant. Task: $ARGUMENTS"
  },
  flutter: {
    description: "Use Flutter docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Flutter and Dart documentation. Task: $ARGUMENTS"
  },
  electron: {
    description: "Use Electron docs through Context7 MCP",
    agent: "framework",
    subtask: true,
    template: "Use context7 MCP for Electron documentation. Include security, preload, IPC, and packaging notes when relevant. Task: $ARGUMENTS"
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
  mcpServersJson: "{}",
  agentsJson: "{}",
  commandsJson: "{}",
  skillsJson: "{}",
  toolJson: "{}",
  lspJson: "{}",
  formatterJson: "{}",
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
    mcpServersJson: withoutDefaultObject(value.mcpServersJson || defaultSettings.mcpServersJson, defaultPinooxMcpServers),
    agentsJson: withoutDefaultObject(value.agentsJson || defaultSettings.agentsJson, defaultAgents),
    commandsJson: withoutDefaultObject(value.commandsJson || defaultSettings.commandsJson, defaultCommands),
    skillsJson: withoutDefaultSkills(value.skillsJson || defaultSettings.skillsJson),
    toolJson: withoutDefaultObject(value.toolJson || defaultSettings.toolJson, defaultToolConfig),
    lspJson: withoutDefaultObject(value.lspJson || defaultSettings.lspJson, defaultLspConfig),
    formatterJson: withoutDefaultObject(value.formatterJson || defaultSettings.formatterJson, defaultFormatterConfig),
    keybindingsJson: value.keybindingsJson || defaultSettings.keybindingsJson,
    serverJson: value.serverJson || defaultSettings.serverJson,
    instructionsJson: withoutDefaultInstructions(value.instructionsJson || defaultSettings.instructionsJson),
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

function withoutDefaultObject(raw: string, defaults: Record<string, unknown>): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";
    const current = parsed as Record<string, unknown>;
    const visible: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(current)) {
      if (key in defaults && JSON.stringify(defaults[key]) === JSON.stringify(value)) continue;
      visible[key] = value;
    }
    return JSON.stringify(visible, null, 2);
  } catch {
    return raw || "{}";
  }
}

function withoutDefaultSkills(raw: string): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";
    const current = parsed as Record<string, unknown>;
    const visible: Record<string, unknown> = { ...current };
    const paths = Array.isArray(current.paths)
      ? current.paths.map(String).filter((path) => !defaultSkills.paths.includes(path))
      : [];
    if (paths.length) visible.paths = paths;
    else delete visible.paths;
    return JSON.stringify(visible, null, 2);
  } catch {
    return raw || "{}";
  }
}

function withoutDefaultInstructions(raw: string): string {
  try {
    const parsed = raw?.trim() ? JSON.parse(raw) : [];
    const current = Array.isArray(parsed) ? parsed.map(String) : [];
    return JSON.stringify(current.filter((item) => !defaultInstructions.includes(item)), null, 2);
  } catch {
    return raw || "[]";
  }
}

function normalizeProjectConfigDir(value?: string): string {
  const current = value?.trim();
  const legacyProjectConfigDir = `.${"mimo"}code`;
  if (!current || current === legacyProjectConfigDir) return defaultSettings.projectConfigDir;
  return current;
}
