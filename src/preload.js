const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("forgeAPI", {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta")
});
