const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("forgeAPI", {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta"),
  openFolder: () => ipcRenderer.invoke("app:open-folder")
});
