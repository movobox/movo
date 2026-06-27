export type Language = "en" | "fa";
export type Role = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  createdAt: string;
  attachments?: ChatAttachment[];
};

export type QueuedMessage = {
  id: string;
  text: string;
};

export type ChatAttachment = {
  id: string;
  path: string;
  name: string;
  kind: "image" | "binary";
  mime: string;
  size: number;
  previewUrl?: string;
  filePreviewUrl?: string;
};

export type Chat = {
  id: string;
  title: string;
  folder: string;
  messages: ChatMessage[];
  draft: string;
  queuedMessages: QueuedMessage[];
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  language: Language;
  model: string;
  provider: string;
  agent: string;
  trustWorkspace: boolean;
  skipPermissions: boolean;
  theme: string;
  projectConfigDir: string;
  permissions: {
    edit: string;
    bash: string;
    webfetch: string;
    websearch: string;
  };
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

export type StudioSettings = {
  app: AppSettings;
  chats: Chat[];
  ui?: {
    activeChatId?: string;
    draftChat?: Chat | null;
  };
};

export type OutputEvent = {
  chatId?: string;
  type: string;
  text: string;
  detail?: string;
  step?: number;
  code?: string;
  codeLang?: string;
  oldCode?: string;
  newCode?: string;
  editFilePath?: string;
};

export type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  running: boolean;
  exitCode: number | null;
};

export type TerminalDataEvent = {
  terminalId: string;
  data: string;
};

export type TerminalExitEvent = {
  terminalId: string;
  code: number | null;
  cwd?: string;
};

export type ProjectFile = {
  path: string;
  name: string;
};

export type FileInspectResult = {
  ok: boolean;
  path: string;
  name: string;
  size: number;
  ext: string;
  mime: string;
  isImage: boolean;
  isBinary: boolean;
  isCode: boolean;
  mentionable: boolean;
  previewUrl?: string;
  filePreviewUrl?: string;
  error?: string;
};

export type ProjectChanges = {
  files: { path: string; status: string }[];
  diff: string;
  isGitRepo: boolean;
};

export type PermissionEvent = {
  chatId?: string;
  type: string;
  target: string;
  raw: string;
};

export type InterruptedEvent = {
  chatId: string;
  message: string;
  code: number;
  stderr: string;
  attempt: number;
  maxRetries: number;
};

declare global {
  interface Window {
    studio: {
      getSettings: () => Promise<StudioSettings>;
      saveSettings: (settings: AppSettings) => Promise<{ ok: boolean }>;
      saveChats: (chats: Chat[]) => Promise<{ ok: boolean }>;
      saveUiState: (ui: { activeChatId: string; draftChat: Chat | null }) => Promise<{ ok: boolean }>;
      pickFolder: () => Promise<string>;
      pickFiles: () => Promise<Array<string | FileInspectResult>>;
      getPathForFile?: (file: File) => string;
      inspectFile?: (filePath: string) => Promise<FileInspectResult>;
      saveDroppedFile?: (payload: { name: string; data: ArrayBuffer }) => Promise<{ ok: boolean; path: string; error?: string }>;
      listProjectFiles: (folder: string) => Promise<{ ok: boolean; files: ProjectFile[]; error?: string }>;
      searchFiles: (payload: { fileName: string; projectFolder: string }) => Promise<{ found: boolean; path: string }>;
      runShellCommand: (payload: { command: string; cwd?: string }) => Promise<{ ok: boolean; code: number; output: string }>;
      getProjectChanges: (folder: string) => Promise<{ ok: boolean; changes: ProjectChanges }>;
      exportChat: (chat: Chat) => Promise<{ ok: boolean; path?: string; error?: string }>;
      importChat: () => Promise<{ ok: boolean; chat?: Chat; error?: string }>;
      checkMimo: () => Promise<{ installed: boolean; version: string }>;
      readProjectConfig: (folder: string) => Promise<{ ok: boolean; config: unknown; raw: string }>;
      saveProjectConfig: (payload: { folder: string; appSettings: AppSettings }) => Promise<{ ok: boolean; path: string }>;
      runMimo: (payload: {
        chat: Chat;
        message: string;
        appSettings: AppSettings;
        extraFiles: string[];
      }) => Promise<{ ok: boolean; code: number; output: string }>;
      listSessions: () => Promise<{ ok: boolean; code: number; output: string }>;
      stopMimo: (payload?: { chatId?: string }) => Promise<{ ok: boolean }>;
      onMimoOutput: (callback: (event: OutputEvent) => void) => () => void;
      onMimoInterrupted: (callback: (event: InterruptedEvent) => void) => () => void;
      onMimoPermission: (callback: (event: PermissionEvent) => void) => () => void;
      approvePermission: (payload: string | { type: string; chatId?: string }) => Promise<{ ok: boolean }>;
      createTerminalProcess: (payload: { terminalId: string; cwd?: string }) => Promise<{ ok: boolean; error?: string }>;
      writeTerminalInput: (payload: { terminalId: string; data: string }) => Promise<{ ok: boolean }>;
      resizeTerminal: (payload: { terminalId: string; cols: number; rows: number }) => Promise<{ ok: boolean }>;
      stopTerminalCommand: (terminalId: string) => Promise<{ ok: boolean }>;
      openExternalTerminal: (payload: { cwd?: string }) => Promise<{ ok: boolean; error?: string }>;
      onTerminalData: (callback: (event: TerminalDataEvent) => void) => () => void;
      onTerminalExit: (callback: (event: TerminalExitEvent) => void) => () => void;
      openPath: (filePath: string) => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<{ ok: boolean }>;
    };
  }
}
