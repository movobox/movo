import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  saveChats: (chats: unknown[]) => ipcRenderer.invoke("chats:save", chats),
  saveUiState: (ui: unknown) => ipcRenderer.invoke("ui:save", ui),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  pickFiles: () => ipcRenderer.invoke("file:pick"),
  inspectFile: (filePath: string) => ipcRenderer.invoke("file:inspect", filePath),
  listProjectFiles: (folder: string) => ipcRenderer.invoke("project:files", folder),
  searchFiles: (payload: { fileName: string; projectFolder: string }) => ipcRenderer.invoke("file:search", payload),
  runShellCommand: (payload: unknown) => ipcRenderer.invoke("shell:run", payload),
  getProjectChanges: (folder: string) => ipcRenderer.invoke("project:changes", folder),
  exportChat: (chat: unknown) => ipcRenderer.invoke("chat:export", chat),
  importChat: () => ipcRenderer.invoke("chat:import"),
  checkMimo: () => ipcRenderer.invoke("mimo:check"),
  readProjectConfig: (folder: string) => ipcRenderer.invoke("config:read", folder),
  saveProjectConfig: (payload: unknown) => ipcRenderer.invoke("config:save", payload),
  runMimo: (payload: unknown) => {
    console.log("[preload] runMimo called");
    return ipcRenderer.invoke("mimo:run", payload);
  },
  listSessions: () => ipcRenderer.invoke("mimo:sessions"),
  stopMimo: (payload?: unknown) => ipcRenderer.invoke("mimo:stop", payload),
  onMimoOutput: (callback: (event: { chatId?: string; type: string; text: string; detail?: string; step?: number; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string; attempt?: number; maxRetries?: number; delay?: number }) => void) => {
    const handler = (_: unknown, data: { chatId?: string; type: string; text: string; detail?: string; step?: number; code?: string; codeLang?: string; oldCode?: string; newCode?: string; editFilePath?: string; attempt?: number; maxRetries?: number; delay?: number }) => callback(data);
    ipcRenderer.on("mimo:output", handler);
    return () => ipcRenderer.removeListener("mimo:output", handler);
  },
  onMimoInterrupted: (callback: (event: { chatId: string; message: string; code: number; stderr: string; attempt: number; maxRetries: number }) => void) => {
    const handler = (_: unknown, data: { chatId: string; message: string; code: number; stderr: string; attempt: number; maxRetries: number }) => callback(data);
    ipcRenderer.on("mimo:interrupted", handler);
    return () => ipcRenderer.removeListener("mimo:interrupted", handler);
  },
  onMimoPermission: (callback: (event: { chatId?: string; type: string; target: string; raw: string }) => void) => {
    const handler = (_: unknown, data: { chatId?: string; type: string; target: string; raw: string }) => callback(data);
    ipcRenderer.on("mimo:permission", handler);
    return () => ipcRenderer.removeListener("mimo:permission", handler);
  },
  approvePermission: (payload: unknown) => ipcRenderer.invoke("mimo:approve-perm", payload),
  createTerminalProcess: (payload: unknown) => ipcRenderer.invoke("terminal:create", payload),
  writeTerminalInput: (payload: unknown) => ipcRenderer.invoke("terminal:input", payload),
  resizeTerminal: (payload: unknown) => ipcRenderer.invoke("terminal:resize", payload),
  stopTerminalCommand: (terminalId: string) => ipcRenderer.invoke("terminal:stop", terminalId),
  openExternalTerminal: (payload: unknown) => ipcRenderer.invoke("terminal:openExternal", payload),
  onTerminalData: (callback: (event: { terminalId: string; data: string }) => void) => {
    const handler = (_: unknown, data: { terminalId: string; data: string }) => callback(data);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onTerminalExit: (callback: (event: { terminalId: string; code: number | null }) => void) => {
    const handler = (_: unknown, data: { terminalId: string; code: number | null }) => callback(data);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },
  openPath: (filePath: string) => ipcRenderer.invoke("shell:openPath", filePath),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url)
});
