export type Language = "en" | "fa";
export type Role = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  createdAt: string;
};

export type Chat = {
  id: string;
  title: string;
  folder: string;
  messages: ChatMessage[];
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
  permissions: {
    edit: string;
    bash: string;
    webfetch: string;
    websearch: string;
  };
  checkpoint: { enabled: boolean };
  memory: { enabled: boolean };
  experimental: { maxMode: boolean };
  mcpServersJson: string;
  keybindingsJson: string;
};

export type StudioSettings = {
  app: AppSettings;
  chats: Chat[];
};

export type OutputEvent = {
  type: string;
  text: string;
};

export type PermissionEvent = {
  type: string;
  target: string;
  raw: string;
};

declare global {
  interface Window {
    studio: {
      getSettings: () => Promise<StudioSettings>;
      saveSettings: (settings: AppSettings) => Promise<{ ok: boolean }>;
      saveChats: (chats: Chat[]) => Promise<{ ok: boolean }>;
      pickFolder: () => Promise<string>;
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
      stopMimo: () => Promise<{ ok: boolean }>;
      onMimoOutput: (callback: (event: OutputEvent) => void) => () => void;
      onMimoPermission: (callback: (event: PermissionEvent) => void) => () => void;
      approvePermission: (type: string) => Promise<{ ok: boolean }>;
    };
  }
}
