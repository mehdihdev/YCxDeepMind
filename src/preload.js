const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("forgeAPI", {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta"),
  openFolder: () => ipcRenderer.invoke("app:open-folder"),
  openInVSCode: (targetPath) => ipcRenderer.invoke("app:open-in-vscode", targetPath),
  openCodeWindow: (payload) => ipcRenderer.invoke("app:open-code-window", payload),
  startTerminal: (payload) => ipcRenderer.invoke("app:terminal-start", payload),
  writeTerminal: (payload) => ipcRenderer.invoke("app:terminal-write", payload),
  resizeTerminal: (payload) => ipcRenderer.invoke("app:terminal-resize", payload),
  stopTerminal: () => ipcRenderer.invoke("app:terminal-stop"),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  }
});
