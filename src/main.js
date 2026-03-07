const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
require("dotenv").config();

const SERVER_PORT = Number(process.env.FORGE_SERVER_PORT || 3030);
const REMOTE_URL = process.env.FORGE_REMOTE_URL
  ? String(process.env.FORGE_REMOTE_URL).trim()
  : "";
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const APP_URL = REMOTE_URL || SERVER_URL;
const USE_REMOTE = Boolean(REMOTE_URL);
let serverProcess = null;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(`${url}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          retry();
        })
        .on("error", retry);
    };

    const retry = () => {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error("Server did not become healthy in time"));
        return;
      }
      setTimeout(check, 250);
    };

    check();
  });
}

function startServer() {
  if (USE_REMOTE) return;
  if (serverProcess) return;

  serverProcess = spawn(process.execPath, [path.join(__dirname, "server", "index.mjs")], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT)
    },
    stdio: "inherit"
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    title: "Forge RDE",
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b1324",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  ipcMain.handle("app:get-meta", () => {
    return {
      name: "Forge RDE",
      version: app.getVersion(),
      platform: process.platform
    };
  });

  ipcMain.handle("app:open-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open Repository Folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  if (USE_REMOTE) {
    createWindow();
  } else {
    startServer();
    waitForServer(SERVER_URL)
      .then(() => createWindow())
      .catch((err) => {
        console.error(err);
        app.quit();
      });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (!USE_REMOTE && serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
