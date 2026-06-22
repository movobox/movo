import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  saveChats: (chats: unknown[]) => ipcRenderer.invoke("chats:save", chats),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  checkMimo: () => ipcRenderer.invoke("mimo:check"),
  readProjectConfig: (folder: string) => ipcRenderer.invoke("config:read", folder),
  saveProjectConfig: (payload: unknown) => ipcRenderer.invoke("config:save", payload),
  runMimo: (payload: unknown) => {
    console.log("[preload] runMimo called");
    return ipcRenderer.invoke("mimo:run", payload);
  },
  listSessions: () => ipcRenderer.invoke("mimo:sessions"),
  stopMimo: () => ipcRenderer.invoke("mimo:stop"),
  onMimoOutput: (callback: (event: { type: string; text: string }) => void) => {
    const handler = (_: unknown, data: { type: string; text: string }) => callback(data);
    ipcRenderer.on("mimo:output", handler);
    return () => ipcRenderer.removeListener("mimo:output", handler);
  },
  onMimoPermission: (callback: (event: { type: string; target: string; raw: string }) => void) => {
    const handler = (_: unknown, data: { type: string; target: string; raw: string }) => callback(data);
    ipcRenderer.on("mimo:permission", handler);
    return () => ipcRenderer.removeListener("mimo:permission", handler);
  },
  approvePermission: (type: string) => ipcRenderer.invoke("mimo:approve-perm", type)
});
