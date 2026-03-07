const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("child_process");
let pty = null;
try {
  pty = require("node-pty");
} catch {
  pty = null;
}
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");
require("dotenv").config();

const SERVER_PORT = Number(process.env.FORGE_SERVER_PORT || 3030);
const REMOTE_URL = process.env.FORGE_REMOTE_URL
  ? String(process.env.FORGE_REMOTE_URL).trim()
  : "";
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const APP_URL = REMOTE_URL || SERVER_URL;
const USE_REMOTE = Boolean(REMOTE_URL);
let serverProcess = null;
const terminalSessions = new Map();

function terminateTerminalSession(session) {
  if (!session) return;
  if (session.mode === "pty" && session.ptyProcess) {
    session.ptyProcess.kill();
    return;
  }
  if (session.mode === "child" && session.childProcess) {
    try {
      // If detached, terminate the whole process group.
      if (session.childProcess.pid && process.platform !== "win32") {
        process.kill(-session.childProcess.pid, "SIGTERM");
      } else {
        session.childProcess.kill();
      }
    } catch {
      session.childProcess.kill();
    }
  }
}

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

function createWindow(targetUrl = APP_URL, options = {}) {
  const win = new BrowserWindow({
    title: options.title || "Forge RDE",
    width: options.width || 1400,
    height: options.height || 900,
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

  win.on("closed", () => {
    const session = terminalSessions.get(win.webContents.id);
    terminateTerminalSession(session);
    terminalSessions.delete(win.webContents.id);
  });

  win.loadURL(targetUrl);
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

  ipcMain.handle("app:open-in-vscode", async (_event, targetPath) => {
    const resolvedPath = String(targetPath || "").trim();
    if (!resolvedPath) {
      return { ok: false, error: "No path provided." };
    }
    return new Promise((resolve) => {
      const child = spawn("code", [resolvedPath], {
        detached: true,
        stdio: "ignore"
      });
      child.on("error", (err) => {
        resolve({ ok: false, error: err.message || "Failed to open VSCode." });
      });
      child.unref();
      resolve({ ok: true });
    });
  });

  ipcMain.handle("app:open-code-window", async (_event, payload) => {
    const repoPath = String(payload?.repoPath || "").trim();
    const repoFullName = String(payload?.repoFullName || "").trim();
    const source = String(payload?.source || "").trim();
    const ref = String(payload?.ref || "").trim();
    const filePath = String(payload?.filePath || "").trim();
    if (!repoPath && !repoFullName) {
      return { ok: false, error: "No repository context provided." };
    }

    try {
      const url = new URL(APP_URL);
      url.searchParams.set("view", "code");
      url.searchParams.set("workspace", "code-only");
      if (repoPath) {
        url.searchParams.set("repoPath", repoPath);
      }
      if (repoFullName) {
        url.searchParams.set("repoFullName", repoFullName);
      }
      if (source) {
        url.searchParams.set("source", source);
      }
      if (ref) {
        url.searchParams.set("ref", ref);
      }
      if (filePath) {
        url.searchParams.set("filePath", filePath);
      }
      const fileName = filePath ? path.basename(filePath) : "";
      createWindow(url.toString(), {
        title: fileName ? `Forge RDE • ${fileName}` : "Forge RDE • Code Workspace",
        width: 1320,
        height: 860
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unable to open code window." };
    }
  });

  ipcMain.handle("app:terminal-start", async (event, payload) => {
    const senderId = event.sender.id;
    const requestedCwd = String(payload?.cwd || "").trim();
    const cwdCandidates = [
      requestedCwd,
      process.cwd(),
      os.homedir(),
      "/"
    ].filter(Boolean);
    let cwd = process.cwd();
    for (const candidate of cwdCandidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          cwd = candidate;
          break;
        }
      } catch {
        // try next
      }
    }

    const shellCandidates =
      process.platform === "win32"
        ? ["powershell.exe", "cmd.exe"]
        : [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(Boolean);
    const cols = Math.max(40, Number(payload?.cols) || 120);
    const rows = Math.max(10, Number(payload?.rows) || 30);

    const existing = terminalSessions.get(senderId);
    terminateTerminalSession(existing);
    terminalSessions.delete(senderId);

    let ptyProcess = null;
    let lastPtyError = null;
    if (pty) {
      for (const shellPath of shellCandidates) {
        try {
          ptyProcess = pty.spawn(shellPath, [], {
            cwd,
            env: process.env,
            name: "xterm-256color",
            cols,
            rows
          });
          break;
        } catch (err) {
          lastPtyError = err;
        }
      }
    }

    if (ptyProcess) {
      ptyProcess.onData((data) => {
        event.sender.send("terminal:data", { data: String(data) });
      });
      ptyProcess.onExit(({ exitCode }) => {
        const code = Number.isFinite(exitCode) ? exitCode : -1;
        event.sender.send("terminal:exit", { code });
        terminalSessions.delete(senderId);
      });

      terminalSessions.set(senderId, { mode: "pty", ptyProcess, cwd });
      return { ok: true, mode: "pty" };
    }

    let childProcess = null;
    let lastSpawnError = lastPtyError;
    const fallbackShellCandidates =
      process.platform === "win32"
        ? shellCandidates.map((shellPath) => ({ shellPath, args: [] }))
        : [
            { shellPath: "/bin/sh", args: ["-i"] },
            { shellPath: "/bin/bash", args: ["-i"] },
            { shellPath: "/bin/zsh", args: ["-i"] },
            ...shellCandidates.map((shellPath) => ({ shellPath, args: ["-i"] }))
          ];
    const seenShells = new Set();
    for (const candidate of fallbackShellCandidates) {
      const shellPath = String(candidate.shellPath || "");
      if (!shellPath || seenShells.has(shellPath)) {
        continue;
      }
      seenShells.add(shellPath);
      try {
        if (process.platform !== "win32" && shellPath.startsWith("/") && !fs.existsSync(shellPath)) {
          continue;
        }
        // Pipe-based fallback should not attach to a parent terminal.
        const args = Array.isArray(candidate.args) ? candidate.args : [];
        childProcess = spawn(shellPath, args, {
          cwd,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            PS1: "$ "
          },
          stdio: ["pipe", "pipe", "pipe"],
          detached: process.platform !== "win32",
          windowsHide: true
        });
        break;
      } catch (err) {
        lastSpawnError = err;
      }
    }

    if (!childProcess) {
      return {
        ok: false,
        error:
          lastSpawnError instanceof Error
            ? lastSpawnError.message
            : "Unable to start terminal shell."
      };
    }

    childProcess.stdout?.on("data", (data) => {
      event.sender.send("terminal:data", { data: String(data) });
    });
    childProcess.stderr?.on("data", (data) => {
      event.sender.send("terminal:data", { data: String(data) });
    });
    childProcess.on("error", (err) => {
      event.sender.send("terminal:data", { data: `\r\n[terminal] ${err.message}\r\n` });
    });
    childProcess.on("exit", (exitCode) => {
      const code = Number.isFinite(exitCode) ? exitCode : -1;
      event.sender.send("terminal:exit", { code });
      terminalSessions.delete(senderId);
    });

    terminalSessions.set(senderId, { mode: "child", childProcess, cwd });
    if (String(process.env.FORGE_DEBUG_TERMINAL || "").toLowerCase() === "true") {
      event.sender.send("terminal:data", {
        data: "\r\n[terminal] PTY unavailable, using fallback shell mode.\r\n"
      });
    }
    return { ok: true, mode: "fallback" };
  });

  ipcMain.handle("app:terminal-write", async (event, payload) => {
    const senderId = event.sender.id;
    const session = terminalSessions.get(senderId);
    if (!session) {
      return { ok: false, error: "Terminal is not running." };
    }
    const data = String(payload?.data || "");
    if (session.mode === "pty" && session.ptyProcess) {
      session.ptyProcess.write(data);
      return { ok: true };
    }
    if (session.mode === "child" && session.childProcess?.stdin) {
      session.childProcess.stdin.write(data);
      return { ok: true };
    }
    return { ok: true };
  });

  ipcMain.handle("app:terminal-resize", async (event, payload) => {
    const senderId = event.sender.id;
    const session = terminalSessions.get(senderId);
    if (!session) {
      return { ok: false, error: "Terminal is not running." };
    }
    if (session.mode !== "pty" || !session.ptyProcess) {
      return { ok: true, skipped: true };
    }
    const cols = Math.max(40, Number(payload?.cols) || 120);
    const rows = Math.max(10, Number(payload?.rows) || 30);
    session.ptyProcess.resize(cols, rows);
    return { ok: true };
  });

  ipcMain.handle("app:terminal-stop", async (event) => {
    const senderId = event.sender.id;
    const session = terminalSessions.get(senderId);
    terminateTerminalSession(session);
    terminalSessions.delete(senderId);
    return { ok: true };
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
