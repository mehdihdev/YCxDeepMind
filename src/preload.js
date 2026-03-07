const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("forgeAPI", {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta"),
  openFolder: () => ipcRenderer.invoke("app:open-folder"),
  openInVSCode: (targetPath) => ipcRenderer.invoke("app:open-in-vscode", targetPath),
  openInSystemWindow: (targetPath) => ipcRenderer.invoke("app:open-in-system-window", targetPath)
});
