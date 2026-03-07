const navButtons = Array.from(document.querySelectorAll(".nav-item"));
const views = Array.from(document.querySelectorAll(".view"));
const title = document.getElementById("view-title");
const meta = document.getElementById("meta");
const statusText = document.getElementById("status-text");

const accountSignInButton = document.getElementById("account-signin");
const accountSummary = document.getElementById("account-summary");
const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const sidebarLogoutButton = document.getElementById("sidebar-logout");
const loginForm = document.getElementById("login-form");
const signInModal = document.getElementById("signin-modal");
const githubConnectButton = document.getElementById("github-connect");
const reposRefreshButton = document.getElementById("repos-refresh");
const repoGrid = document.getElementById("repo-grid");
const repoShowMoreButton = document.getElementById("repo-show-more");
const workspaceRepoSearch = document.getElementById("workspace-repo-search");
const workspaceRepoSuggestions = document.getElementById("workspace-repo-suggestions");
const workspaceRepoSelect = document.getElementById("workspace-repo-select");
const githubSummary = document.getElementById("github-summary");
const robotRepoSelect = document.getElementById("robot-repo-select");
const robotRepoSearch = document.getElementById("robot-repo-search");
const robotRepoSuggestions = document.getElementById("robot-repo-suggestions");
const robotRepoMeta = document.getElementById("robot-repo-meta");
const artifactGenerateForm = document.getElementById("artifact-generate-form");
const artifactRepoSelect = document.getElementById("artifact-repo-select");
const artifactRepoSearch = document.getElementById("artifact-repo-search");
const artifactRepoSuggestions = document.getElementById("artifact-repo-suggestions");
const artifactSaveButton = document.getElementById("artifact-save-button");
const artifactStatus = document.getElementById("artifact-status");
const artifactTitle = document.getElementById("artifact-title");
const artifactDescription = document.getElementById("artifact-description");
const artifactMermaidRender = document.getElementById("artifact-mermaid-render");
const artifactMermaid = document.getElementById("artifact-mermaid");

const teamStorageBadge = document.getElementById("team-storage-badge");
const teamOpenModalButton = document.getElementById("team-open-modal");
const teamCreateForm = document.getElementById("team-create-form");
const teamJoinForm = document.getElementById("team-join-form");
const teamSwitchForm = document.getElementById("team-switch-form");
const teamSelect = document.getElementById("team-select");
const teamPillList = document.getElementById("team-pill-list");
const activeTeamMeta = document.getElementById("active-team-meta");
const membersList = document.getElementById("team-members-list");

const taskForm = document.getElementById("team-task-form");
const taskTitleInput = document.getElementById("team-task-title");
const taskAssigneeInput = document.getElementById("team-task-assignee");
const taskList = document.getElementById("team-task-list");

const artifactList = document.getElementById("team-artifact-list");
const settingsProfileForm = document.getElementById("settings-profile-form");
const settingsFirstNameInput = document.getElementById("settings-first-name");
const settingsPasswordForm = document.getElementById("settings-password-form");
const settingsPasswordInput = document.getElementById("settings-password");
const settingsGithubStatus = document.getElementById("settings-github-status");
const settingsGithubDisconnectButton = document.getElementById("settings-github-disconnect");
const settingsDeleteAccountButton = document.getElementById("settings-delete-account");
const settingsLogoutButton = document.getElementById("settings-logout");
const codeLoadForm = document.getElementById("code-load-form");
const codeRepoSelect = document.getElementById("code-repo-select");
const codeRepoSearch = document.getElementById("code-repo-search");
const codeRepoSuggestions = document.getElementById("code-repo-suggestions");
const codeOpenFolderButton = document.getElementById("code-open-folder");
const codeOpenVsCodeButton = document.getElementById("code-open-vscode");
const codeOpenNewWindowButton = document.getElementById("code-open-new-window");
const codeLayout = document.querySelector(".code-layout");
const codeEditorWrap = document.querySelector(".code-editor-wrap");
const codeResizer = document.getElementById("code-resizer");
const codeFileList = document.getElementById("code-file-list");
const codeEditorMeta = document.getElementById("code-editor-meta");
const monacoMount = document.getElementById("monaco-editor");
const codeTerminal = document.getElementById("code-terminal");
const terminalMount = document.getElementById("terminal-xterm");
const terminalResizer = document.getElementById("terminal-resizer");
const terminalClearButton = document.getElementById("terminal-clear");
const terminalRestartButton = document.getElementById("terminal-restart");
const visualizerLoadForm = document.getElementById("visualizer-load-form");
const visualizerRepoSelect = document.getElementById("visualizer-repo-select");
const visualizerRepoSearch = document.getElementById("visualizer-repo-search");
const visualizerRepoSuggestions = document.getElementById("visualizer-repo-suggestions");
const visualizerOpenFolderButton = document.getElementById("visualizer-open-folder");
const visualizerStats = document.getElementById("visualizer-stats");
const visualizerGraphMount = document.getElementById("visualizer-graph");

// Robot page elements
const robotOpenFolderButton = document.getElementById("robot-open-folder-button");
const robotRefreshButton = document.getElementById("robot-refresh-button");
const robotSourceBadge = document.getElementById("robot-source-badge");
const robotSummaryGrid = document.getElementById("robot-summary-grid");
const robotMissionBoard = document.getElementById("robot-mission-board");
const robotRequirementForm = document.getElementById("robot-requirement-form");
const robotRequirementTitleInput = document.getElementById("robot-requirement-title");
const robotRequirementDescriptionInput = document.getElementById("robot-requirement-description");
const robotRequirementList = document.getElementById("robot-requirement-list");
const robotOptionList = document.getElementById("robot-option-list");
const robotVerifierRuns = document.getElementById("robot-verifier-runs");
const robotTaskSuggestions = document.getElementById("robot-task-suggestions");
const robotNodeDetail = document.getElementById("robot-node-detail");
const robotGraphMount = document.getElementById("robot-graph");
const robotGraphMeta = document.getElementById("robot-graph-meta");
const robotGraphRevision = document.getElementById("robot-graph-revision");
const robotObjectiveInput = document.getElementById("robot-objective");
const robotObservationsInput = document.getElementById("robot-observations");
const robotDiscoveredComponents = document.getElementById("robot-discovered-components");
const robotGeneratedFiles = document.getElementById("robot-generated-files");

const analyzeForm = document.getElementById("analyze-form");
const repoPathInput = document.getElementById("repo-path");
const analysisOutput = document.getElementById("analysis-output");
const teamModal = document.getElementById("team-modal");

const labels = {
  workspace: "Team Workspace",
  code: "Code Workspace",
  visualizer: "Repository Visualizer",
  robot: "My Robot",
  bench: "Live Bench",
  artifacts: "Artifacts",
  settings: "Account Settings"
};

const urlParams = new URLSearchParams(window.location.search);
const isCodeOnlyWorkspace = urlParams.get("workspace") === "code-only";

let currentSession = { user: null, githubConnected: false };
let cachedRepos = [];
let showAllRepos = false;
let generatedArtifact = null;
let monacoEditor = null;
let monacoLoaded = false;
let mermaidLoaded = false;
let visLoaded = false;
let visNetwork = null;
let currentCodeRepoPath = "";
let currentCodeFilePath = "";
let currentCodeRepoFullName = "";
let currentCodeRef = "";
let currentCodeSource = "local";
let currentCodeFiles = [];
const expandedCodeDirs = new Set();
let currentVisualizerRepoPath = "";
let terminalUnsubscribeData = null;
let terminalUnsubscribeExit = null;
let terminalInstance = null;
let terminalFitAddon = null;
let terminalStarted = false;
let terminalEchoLocalInput = false;
let currentTeamState = {
  storage: "unknown",
  teams: [],
  activeTeamId: null,
  members: [],
  tasks: [],
  artifacts: []
};

function setActiveView(viewId) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });

  views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
    if (view.id === viewId) {
      view.classList.remove("section-animate");
      void view.offsetWidth;
      view.classList.add("section-animate");
    }
  });

  title.textContent = labels[viewId] || "Forge RDE";
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#fca5a5" : "#9eb1cc";
}

function setCodePaneWidth(px) {
  if (!codeLayout) return;
  const clamped = Math.max(220, Math.min(620, Number(px) || 320));
  codeLayout.style.setProperty("--code-files-width", `${clamped}px`);
  localStorage.setItem("forge_code_files_width", String(clamped));
}

function setTerminalPanelHeight(px) {
  if (!codeEditorWrap) return;
  const clamped = Math.max(140, Math.min(520, Number(px) || 260));
  codeEditorWrap.style.setProperty("--terminal-height", `${clamped}px`);
  localStorage.setItem("forge_code_terminal_height", String(clamped));
  if (monacoEditor) {
    monacoEditor.layout();
  }
  resizeWorkspaceTerminal().catch(() => {});
}

function filterReposByQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return cachedRepos;
  return cachedRepos.filter((repo) => {
    const full = String(repo.full_name || "").toLowerCase();
    const name = String(repo.name || "").toLowerCase();
    return full.includes(q) || name.includes(q);
  });
}

function renderRepoSuggestions(searchInput, suggestionsEl, selectEl) {
  if (!searchInput || !suggestionsEl || !selectEl) return;
  const filtered = filterReposByQuery(searchInput.value).slice(0, 12);
  suggestionsEl.innerHTML = "";

  if (!searchInput.value.trim() || !filtered.length) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  filtered.forEach((repo, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `repo-suggestion-btn${index === 0 ? " active" : ""}`;
    button.innerHTML = `
      <span class="repo-suggestion-title">${repo.name}</span>
      <span class="repo-suggestion-sub">${repo.full_name}</span>
    `;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      searchInput.value = repo.full_name;
      selectEl.value = repo.full_name;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      suggestionsEl.classList.add("hidden");
    });
    li.appendChild(button);
    suggestionsEl.appendChild(li);
  });

  suggestionsEl.classList.remove("hidden");
}

function appendTerminalOutput(text) {
  if (terminalInstance) {
    terminalInstance.write(String(text || ""));
  }
}

function echoTerminalInputLocally(data) {
  if (!terminalInstance || !data) return;
  const text = String(data);
  for (const ch of text) {
    if (ch === "\r") {
      terminalInstance.write("\r\n");
    } else if (ch === "\u007f") {
      terminalInstance.write("\b \b");
    } else {
      terminalInstance.write(ch);
    }
  }
}

async function resizeWorkspaceTerminal() {
  if (!isCodeOnlyWorkspace) return;
  if (!terminalInstance || !terminalFitAddon || !window.forgeAPI?.resizeTerminal) return;
  terminalFitAddon.fit();
  await window.forgeAPI.resizeTerminal({
    cols: terminalInstance.cols,
    rows: terminalInstance.rows
  });
}

async function ensureXtermLoaded() {
  if (window.Terminal && window.FitAddon?.FitAddon) {
    return true;
  }

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
          once: true
        });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });

  const loadCss = (href) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  const options = [
    {
      css: "/vendor/xterm/css/xterm.css",
      scripts: ["/vendor/xterm/lib/xterm.js", "/vendor/xterm-addon-fit/lib/xterm-addon-fit.js"]
    },
    {
      css: "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css",
      scripts: [
        "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js",
        "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"
      ]
    }
  ];

  for (const option of options) {
    try {
      loadCss(option.css);
      for (const src of option.scripts) {
        await loadScript(src);
      }
      if (window.Terminal && window.FitAddon?.FitAddon) {
        return true;
      }
    } catch {
      // Try next source option
    }
  }

  return Boolean(window.Terminal && window.FitAddon?.FitAddon);
}

async function initCodeOnlyTerminal() {
  if (!isCodeOnlyWorkspace || !codeTerminal || !terminalMount) return;
  const loaded = await ensureXtermLoaded();
  if (!loaded) {
    terminalMount.textContent = "Terminal UI failed to load (xterm.js unavailable).";
    return;
  }
  if (terminalInstance) return;

  terminalInstance = new window.Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    theme: {
      background: "#060c17",
      foreground: "#d7e5ff",
      cursor: "#62f2cc",
      selectionBackground: "#2a4365"
    },
    scrollback: 3000
  });
  terminalFitAddon = new window.FitAddon.FitAddon();
  terminalInstance.loadAddon(terminalFitAddon);
  terminalInstance.open(terminalMount);
  terminalFitAddon.fit();
  terminalInstance.focus();
  terminalMount.addEventListener("mousedown", () => terminalInstance?.focus());
  codeTerminal?.addEventListener("mousedown", () => terminalInstance?.focus());

  terminalInstance.onData(async (data) => {
    if (terminalEchoLocalInput) {
      echoTerminalInputLocally(data);
    }
    if (!window.forgeAPI?.writeTerminal) return;
    await window.forgeAPI.writeTerminal({ data });
  });

  window.addEventListener("resize", () => {
    resizeWorkspaceTerminal().catch(() => {});
  });
  setTimeout(() => {
    terminalInstance?.focus();
    resizeWorkspaceTerminal().catch(() => {});
  }, 0);
}

async function startWorkspaceTerminal(cwd) {
  if (!isCodeOnlyWorkspace) return;
  if (!window.forgeAPI?.startTerminal) return;
  if (terminalStarted) return;

  await initCodeOnlyTerminal();

  try {
    const launchCwd = cwd || "";
    const result = await window.forgeAPI.startTerminal({
      cwd: launchCwd,
      cols: terminalInstance?.cols || 120,
      rows: terminalInstance?.rows || 30
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Unable to start terminal.");
    }
    terminalEchoLocalInput = result?.mode === "fallback";
    terminalStarted = true;
    await resizeWorkspaceTerminal();
  } catch (err) {
    appendTerminalOutput(`\r\n[terminal] ${err.message}\r\n`);
  }
}

function renderRepos(repos) {
  cachedRepos = repos;
  repoGrid.innerHTML = "";

  if (workspaceRepoSelect) {
    const selected = localStorage.getItem("forge_selected_workspace_repo") || "";
    workspaceRepoSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "All repositories";
    workspaceRepoSelect.appendChild(placeholder);
    repos.forEach((repo) => {
      const option = document.createElement("option");
      option.value = repo.full_name;
      option.textContent = repo.full_name;
      option.selected = selected === repo.full_name;
      workspaceRepoSelect.appendChild(option);
    });
  }

  if (!repos.length) {
    repoGrid.innerHTML = '<div class="empty-repo">No repositories found yet.</div>';
    if (repoShowMoreButton) {
      repoShowMoreButton.style.display = "none";
    }
    renderRobotRepoSelector();
    renderCodeRepoSelector();
    renderVisualizerRepoSelector();
    return;
  }

  const filteredRepos = filterReposByQuery(workspaceRepoSearch?.value || "");
  const visibleRepos = showAllRepos ? filteredRepos : filteredRepos.slice(0, 6);
  visibleRepos.forEach((repo) => {
    const card = document.createElement("a");
    card.className = "repo-card";
    card.href = repo.html_url;
    card.target = "_blank";
    card.rel = "noreferrer";
    card.innerHTML = `
      <div class="repo-card-top">
        <p class="repo-name">${repo.name}</p>
        <span class="repo-visibility">${repo.private ? "Private" : "Public"}</span>
      </div>
      <p class="repo-updated">${repo.updated || "Updated recently"}</p>
      <p class="repo-description">${repo.description || "No description provided."}</p>
      <div class="repo-meta">
        <span>${repo.language || "Unknown"}</span>
        <span>★ ${repo.stars ?? 0}</span>
        <span>⑂ ${repo.forks ?? 0}</span>
      </div>
    `;
    repoGrid.appendChild(card);
  });

  if (repoShowMoreButton) {
    if (filteredRepos.length <= 6) {
      repoShowMoreButton.style.display = "none";
    } else {
      repoShowMoreButton.style.display = "inline-flex";
      repoShowMoreButton.textContent = showAllRepos ? "Show less" : "Show more";
    }
  }

  renderRobotRepoSelector();
  renderCodeRepoSelector();
  renderVisualizerRepoSelector();
}

function renderRobotRepoSelector() {
  if (!robotRepoSelect) return;

  const saved = localStorage.getItem("forge_selected_robot_repo") || "";
  const filteredRepos = filterReposByQuery(robotRepoSearch?.value);
  robotRepoSelect.innerHTML = "";

  if (!filteredRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = cachedRepos.length ? "No matching repositories" : "No repositories loaded";
    robotRepoSelect.appendChild(option);
    if (robotRepoMeta) {
      robotRepoMeta.textContent = "Connect GitHub and refresh repos to select one.";
    }
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  robotRepoSelect.appendChild(placeholder);

  filteredRepos.forEach((repo) => {
    const option = document.createElement("option");
    option.value = repo.full_name;
    option.textContent = repo.full_name;
    option.selected = saved === repo.full_name;
    robotRepoSelect.appendChild(option);
  });

  updateRobotRepoMeta(robotRepoSelect.value || saved);
  renderArtifactRepoSelector();
  renderCodeRepoSelector();
}

function updateRobotRepoMeta(fullName) {
  if (!robotRepoMeta) return;
  if (!fullName) {
    robotRepoMeta.textContent = "Select a repository to bind as this robot's codebase.";
    return;
  }

  const repo = cachedRepos.find((r) => r.full_name === fullName);
  if (!repo) {
    robotRepoMeta.textContent = fullName;
    return;
  }

  robotRepoMeta.textContent = `${repo.full_name} • ${repo.language || "Unknown"} • ${
    repo.private ? "Private" : "Public"
  }`;
}

function renderArtifactRepoSelector() {
  if (!artifactRepoSelect) return;

  const saved = localStorage.getItem("forge_selected_artifact_repo") || "";
  const filteredRepos = filterReposByQuery(artifactRepoSearch?.value);
  artifactRepoSelect.innerHTML = "";

  if (!filteredRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = cachedRepos.length ? "No matching repositories" : "No repositories loaded";
    artifactRepoSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  artifactRepoSelect.appendChild(placeholder);

  filteredRepos.forEach((repo) => {
    const option = document.createElement("option");
    option.value = repo.full_name;
    option.textContent = repo.full_name;
    option.selected = saved === repo.full_name;
    artifactRepoSelect.appendChild(option);
  });

}

function renderCodeRepoSelector() {
  if (!codeRepoSelect) return;

  const saved = localStorage.getItem("forge_selected_code_repo") || "";
  const filteredRepos = filterReposByQuery(codeRepoSearch?.value);
  codeRepoSelect.innerHTML = "";

  if (!filteredRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = cachedRepos.length ? "No matching repositories" : "No repositories loaded";
    codeRepoSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  codeRepoSelect.appendChild(placeholder);

  filteredRepos.forEach((repo) => {
    const option = document.createElement("option");
    option.value = repo.full_name;
    option.textContent = repo.full_name;
    option.selected = saved === repo.full_name;
    codeRepoSelect.appendChild(option);
  });

}

function renderVisualizerRepoSelector() {
  if (!visualizerRepoSelect) return;

  const saved = localStorage.getItem("forge_selected_visualizer_repo") || "";
  const filteredRepos = filterReposByQuery(visualizerRepoSearch?.value);
  visualizerRepoSelect.innerHTML = "";

  if (!filteredRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = cachedRepos.length ? "No matching repositories" : "No repositories loaded";
    visualizerRepoSelect.appendChild(option);
    if (visualizerStats) {
      visualizerStats.textContent = "Connect GitHub and refresh repos to build a graph.";
    }
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  visualizerRepoSelect.appendChild(placeholder);

  filteredRepos.forEach((repo) => {
    const option = document.createElement("option");
    option.value = repo.full_name;
    option.textContent = repo.full_name;
    option.selected = saved === repo.full_name;
    visualizerRepoSelect.appendChild(option);
  });

}

function wrapText(text, maxCharsPerLine = 34, maxLines = 4) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxCharsPerLine));
      current = word.slice(maxCharsPerLine);
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
  }
  if (words.length && lines.length === maxLines) {
    const joined = lines.join(" ");
    const original = words.join(" ");
    if (joined.length < original.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:!?]?$/, "")}...`;
    }
  }
  return lines.join("\n");
}

function openSignInModal() {
  signInModal.classList.remove("hidden");
  signInModal.classList.remove("closing");
  signInModal.classList.add("opening");
  signInModal.setAttribute("aria-hidden", "false");
}

function closeSignInModal() {
  signInModal.classList.remove("opening");
  signInModal.classList.add("closing");
  setTimeout(() => {
    signInModal.classList.add("hidden");
    signInModal.setAttribute("aria-hidden", "true");
    signInModal.classList.remove("closing");
  }, 220);
}

function openTeamModal() {
  if (!teamModal) return;
  teamModal.classList.remove("hidden");
  teamModal.classList.remove("closing");
  teamModal.classList.add("opening");
  teamModal.setAttribute("aria-hidden", "false");
}

function closeTeamModal() {
  if (!teamModal) return;
  teamModal.classList.remove("opening");
  teamModal.classList.add("closing");
  setTimeout(() => {
    teamModal.classList.add("hidden");
    teamModal.setAttribute("aria-hidden", "true");
    teamModal.classList.remove("closing");
  }, 220);
}

async function apiJson(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function inferLanguage(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".sql")) return "sql";
  return "plaintext";
}

async function ensureMonacoLoaded() {
  if (monacoLoaded) return true;
  if (!monacoMount) return false;

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    await new Promise((resolve) => {
      window.require.config({
        paths: {
          vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs"
        }
      });
      window.require(["vs/editor/editor.main"], resolve);
    });

    monacoEditor = window.monaco.editor.create(monacoMount, {
      value: "// Load a repository, then click a file.",
      language: "javascript",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13
    });
    monacoLoaded = true;
    return true;
  } catch {
    if (codeEditorMeta) {
      codeEditorMeta.textContent =
        "Could not load Monaco from CDN. Check internet connection and retry.";
    }
    return false;
  }
}

async function ensureMermaidLoaded() {
  if (mermaidLoaded) return true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose"
    });
    mermaidLoaded = true;
    return true;
  } catch {
    return false;
  }
}

async function ensureVisNetworkLoaded() {
  if (visLoaded) return true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/vis-network/standalone/umd/vis-network.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    visLoaded = true;
    return true;
  } catch {
    return false;
  }
}

async function renderRepositoryGraph(graphData) {
  if (!visualizerGraphMount) return;
  const ok = await ensureVisNetworkLoaded();
  if (!ok || !window.vis?.Network) {
    if (visualizerStats) {
      visualizerStats.textContent =
        "Could not load graph renderer. Check internet connection and try again.";
    }
    return;
  }

  const localNodes = new Set(
    (graphData.nodes || []).map((node) => node.id)
  );
  const edges = (graphData.edges || [])
    .filter(
      (edge) =>
        (edge.type === "local" || edge.type === "contains") &&
        localNodes.has(edge.from) &&
        localNodes.has(edge.to)
    )
    .slice(0, 3000);

  const nodes = (graphData.nodes || []).map((node) => {
    const isRoot = node.id === "__repo_root__";
    const summaryText = isRoot
      ? `Project Root\n${graphData.stats?.totalFiles ?? 0} items`
      : wrapText(node.summary || "No summary available.", 36, 5);
    const nameText = isRoot ? "Project Root" : node.label;
    return {
      id: node.id,
      label: `${summaryText}\n\n${nameText}`,
      title: undefined,
      group: isRoot ? "root" : node.group || "file"
    };
  });

  const dataset = {
    nodes: new window.vis.DataSet(nodes),
    edges: new window.vis.DataSet(
      edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        arrows: "to",
        color:
          edge.type === "contains"
            ? { color: "#31445f", highlight: "#5789c6" }
            : { color: "#4b6489", highlight: "#6fb2ff" }
      }))
    )
  };

  if (visNetwork) {
    visNetwork.destroy();
  }

  visNetwork = new window.vis.Network(visualizerGraphMount, dataset, {
    autoResize: true,
    layout: {
      improvedLayout: true
    },
    physics: {
      stabilization: { iterations: 280, fit: true },
      barnesHut: {
        gravitationalConstant: -7600,
        centralGravity: 0.08,
        springLength: 50,
        springConstant: 0.015,
        damping: 0.24,
        avoidOverlap: 0.8
      }
    },
    interaction: {
      hover: false,
      tooltipDelay: 120,
      navigationButtons: true,
      keyboard: true
    },
    nodes: {
      shape: "box",
      margin: { top: 18, right: 20, bottom: 18, left: 20 },
      widthConstraint: { minimum: 220, maximum: 290 },
      borderWidth: 1.5,
      borderWidthSelected: 2,
      shadow: {
        enabled: true,
        color: "rgba(0, 0, 0, 0.35)",
        size: 12,
        x: 0,
        y: 6
      },
      font: {
        color: "#f0f5ff",
        size: 14,
        face: "Avenir Next, Inter, Segoe UI, Helvetica Neue, sans-serif"
      },
      labelHighlightBold: false
    },
    edges: {
      smooth: {
        enabled: true
      },
      width: 2,
      color: { color: "#4b5d78", highlight: "#68b4ff" }
    },
    groups: {
      root: { color: { background: "#184b2f", border: "#34d184" } },
      ts: { color: { background: "#1f2b44", border: "#5e8fd6" } },
      js: { color: { background: "#2a2a3b", border: "#8493dd" } },
      jsx: { color: { background: "#21313f", border: "#66bdd4" } },
      tsx: { color: { background: "#1f3045", border: "#61a9e7" } },
      json: { color: { background: "#352f24", border: "#cda45e" } },
      md: { color: { background: "#2c2f34", border: "#9aa1ab" } },
      file: { color: { background: "#1d2230", border: "#69748a" } }
    }
  });
}

function normalizeMermaidGraph(input) {
  let text = String(input || "").trim();
  if (!text) return text;

  // Convert single-line mermaid syntax with semicolons into new lines.
  if (text.includes(";") && !text.includes("\n")) {
    text = text
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .join("\n");
  }

  // Normalize graph keyword if present.
  if (text.startsWith("graph LR")) {
    text = text.replace(/^graph\\s+LR/, "flowchart LR");
  }
  return text;
}

async function renderArtifactDiagram(mermaidSource) {
  if (!artifactMermaidRender || !artifactMermaid) return;
  const normalized = normalizeMermaidGraph(mermaidSource);
  artifactMermaid.textContent = normalized;

  const ok = await ensureMermaidLoaded();
  if (!ok) {
    artifactMermaidRender.innerHTML = "";
    return;
  }

  try {
    const renderId = `artifactGraph_${Date.now()}`;
    const { svg } = await window.mermaid.render(renderId, normalized);
    artifactMermaidRender.innerHTML = svg;
  } catch (err) {
    artifactMermaidRender.innerHTML =
      '<p class="muted">Unable to render graph. Showing source below.</p>';
  }
}

function seedExpandedCodeDirs(files) {
  expandedCodeDirs.clear();
  files.forEach((filePath) => {
    const parts = String(filePath || "").split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (i <= 1) {
        expandedCodeDirs.add(parts.slice(0, i + 1).join("/"));
      }
    }
  });
}

function buildCodeTree(files) {
  const root = { dirs: new Map(), files: [] };
  files.forEach((filePath) => {
    const parts = String(filePath || "").split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.files.push({ name: part, path: filePath });
      } else {
        if (!node.dirs.has(part)) {
          const dirPath = parts.slice(0, i + 1).join("/");
          node.dirs.set(part, { name: part, path: dirPath, dirs: new Map(), files: [] });
        }
        node = node.dirs.get(part);
      }
    }
  });
  return root;
}

function renderCodeTreeLevel(node, mount, depth = 0) {
  const dirs = Array.from(node.dirs.values()).sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  dirs.forEach((dir) => {
    const li = document.createElement("li");
    li.className = "tree-node";

    const expanded = expandedCodeDirs.has(dir.path);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-dir-btn";
    toggle.dataset.treeToggle = dir.path;
    toggle.style.setProperty("--tree-depth", String(depth));
    toggle.innerHTML = `
      <span class="tree-chevron">${expanded ? "▾" : "▸"}</span>
      <span class="tree-folder">📁</span>
      <span class="tree-label">${dir.name}</span>
    `;
    li.appendChild(toggle);

    const children = document.createElement("ul");
    children.className = `tree-children${expanded ? "" : " hidden"}`;
    renderCodeTreeLevel(dir, children, depth + 1);
    li.appendChild(children);
    mount.appendChild(li);
  });

  files.forEach((file) => {
    const li = document.createElement("li");
    li.className = "tree-node";
    li.innerHTML = `
      <button type="button" class="code-file-btn tree-file-btn" data-code-file="${file.path}" style="--tree-depth:${depth}">
        <span class="tree-file">📄</span>
        <span class="tree-label">${file.name}</span>
      </button>
    `;
    mount.appendChild(li);
  });
}

function renderCodeFiles(files, { preserveExpansion = false } = {}) {
  currentCodeFiles = files.slice();
  codeFileList.innerHTML = "";
  codeFileList.classList.add("code-tree");
  if (!files.length) {
    codeFileList.innerHTML = '<li class="empty-list">No files found.</li>';
    return;
  }
  if (!preserveExpansion) {
    seedExpandedCodeDirs(files);
  }
  const tree = buildCodeTree(files);
  renderCodeTreeLevel(tree, codeFileList, 0);
}

async function loadCodeTreeByPath(repoPath) {
  const data = await apiJson(`/api/code/tree?repoPath=${encodeURIComponent(repoPath)}`, {
    method: "GET"
  });
  currentCodeRepoPath = data.repoPath;
  currentCodeRepoFullName = "";
  currentCodeRef = "";
  currentCodeSource = "local";
  currentCodeFilePath = "";
  renderCodeFiles(data.files || []);
  if (codeEditorMeta) {
    codeEditorMeta.textContent = `Loaded ${data.files.length} files from ${data.repoPath}`;
  }
  await ensureMonacoLoaded();
  await startWorkspaceTerminal(data.repoPath);
}

async function loadCodeFile(filePath) {
  if (!filePath) return;

  try {
    let data;
    if (currentCodeSource === "github") {
      if (!currentCodeRepoFullName) return;
      data = await apiJson(
        `/api/code/file/github?repoFullName=${encodeURIComponent(
          currentCodeRepoFullName
        )}&filePath=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(currentCodeRef || "")}`,
        { method: "GET" }
      );
    } else {
      if (!currentCodeRepoPath) return;
      data = await apiJson(
        `/api/code/file?repoPath=${encodeURIComponent(currentCodeRepoPath)}&filePath=${encodeURIComponent(
          filePath
        )}`,
        { method: "GET" }
      );
    }

    const ok = await ensureMonacoLoaded();
    if (ok && monacoEditor) {
      const model = window.monaco.editor.createModel(data.content, inferLanguage(filePath));
      monacoEditor.setModel(model);
      monacoEditor.updateOptions({
        readOnly: Boolean(data.readOnly || currentCodeSource === "github")
      });
      monacoEditor.layout();
    }

    if (codeEditorMeta) {
      if (currentCodeSource === "github") {
        codeEditorMeta.textContent = `${data.repoFullName} @ ${data.ref} • ${data.filePath} • read-only`;
      } else {
        codeEditorMeta.textContent = `${data.repoPath} • ${data.filePath}`;
      }
    }
    currentCodeFilePath = data.filePath;
    setStatus(`Opened ${filePath}`);
  } catch (err) {
    setStatus(err.message, true);
  }
}

function renderTeamState(state) {
  currentTeamState = state;
  teamStorageBadge.textContent = `Storage: ${state.storage}`;

  teamSelect.innerHTML = "";
  if (!state.teams.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No teams yet";
    teamSelect.appendChild(option);
  } else {
    state.teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = `${team.name} (${team.role})`;
      option.selected = team.id === state.activeTeamId;
      teamSelect.appendChild(option);
    });
  }

  const activeTeam = state.teams.find((team) => team.id === state.activeTeamId);
  activeTeamMeta.textContent = activeTeam
    ? `Active: ${activeTeam.name} • Invite code: ${activeTeam.invite_code}`
    : "No active team";

  if (teamPillList) {
    teamPillList.innerHTML = "";
    state.teams.forEach((team) => {
      const li = document.createElement("li");
      li.className = `team-pill ${team.id === state.activeTeamId ? "active" : ""}`;
      li.innerHTML = `
        <span>${team.name}</span>
        ${team.role === "owner" ? `<button type="button" data-delete-team="${team.id}" class="team-pill-delete">×</button>` : ""}
      `;
      teamPillList.appendChild(li);
    });
  }

  if (taskAssigneeInput) {
    const previous = taskAssigneeInput.value;
    taskAssigneeInput.innerHTML = '<option value="">Unassigned</option>';
    state.members.forEach((member) => {
      const option = document.createElement("option");
      option.value = member.user_id;
      option.textContent = member.user?.name || "Unknown member";
      option.selected = previous === member.user_id;
      taskAssigneeInput.appendChild(option);
    });
  }

  membersList.innerHTML = "";
  if (!state.members.length) {
    membersList.innerHTML = '<li class="empty-list">No members yet.</li>';
  } else {
    state.members.forEach((member) => {
      const li = document.createElement("li");
      const name = member.user?.name || "Unknown member";
      li.innerHTML = `<strong>${name}</strong><span>${member.role}</span>`;
      membersList.appendChild(li);
    });
  }

  taskList.innerHTML = "";
  if (!state.tasks.length) {
    taskList.innerHTML = '<li class="empty-list">No tasks yet.</li>';
  } else {
    state.tasks.forEach((task) => {
      const li = document.createElement("li");
      const isCompleted = String(task.status || "").toLowerCase() === "completed";
      const isAssignedToMe =
        Boolean(currentSession?.user?.id) && task.assignee_user_id === currentSession.user.id;
      const assigneeProfile = state.members.find((member) => member.user_id === task.assignee_user_id);
      const assigneeName = assigneeProfile?.user?.name || "Unassigned";
      li.className = `task-item${isAssignedToMe ? " assigned-me" : ""}${isCompleted ? " completed" : ""}`;
      li.innerHTML = `
        <label class="task-left">
          <input type="checkbox" data-task-toggle="${task.id}" ${isCompleted ? "checked" : ""} />
          <span class="task-bullet">•</span>
          <span class="task-main">
            <span class="task-title">${task.title}</span>
            <span class="task-meta">${isCompleted ? "completed" : "open"} • ${assigneeName}</span>
          </span>
        </label>
        <button type="button" class="task-delete" data-task-delete="${task.id}" aria-label="Delete task">×</button>
      `;
      taskList.appendChild(li);
    });
  }

  artifactList.innerHTML = "";
  const artifacts = state.artifacts || [];
  if (!artifacts.length) {
    artifactList.innerHTML = '<li class="empty-list">No runs/fixes yet.</li>';
  } else {
    artifacts.forEach((artifact) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>[${artifact.type}] ${artifact.title}</strong><span>${artifact.summary || "No summary"}</span>`;
      artifactList.appendChild(li);
    });
  }
}

async function refreshTeamState() {
  if (!currentSession.user) {
    renderTeamState({
      storage: "unknown",
      teams: [],
      activeTeamId: null,
      members: [],
      tasks: [],
      artifacts: []
    });
    return;
  }

  try {
    const state = await apiJson("/api/team/state");
    renderTeamState(state);
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function refreshSession() {
  const data = await apiJson("/api/auth/session", { method: "GET" });
  currentSession = data;

  if (!data.user) {
    if (accountSignInButton) {
      accountSignInButton.classList.remove("hidden");
      accountSignInButton.textContent = "Sign in";
    }
    if (accountSummary) {
      accountSummary.classList.add("hidden");
    }
    if (accountName) {
      accountName.textContent = "Not signed in";
    }
    if (accountEmail) {
      accountEmail.textContent = "-";
    }
    if (sidebarLogoutButton) {
      sidebarLogoutButton.classList.add("hidden");
    }
    githubSummary.textContent = "Connect GitHub to load recent projects.";
    if (settingsGithubStatus) {
      settingsGithubStatus.textContent = "Sign in to manage integrations.";
    }
    renderRepos([]);
    await refreshTeamState();
    return data;
  }

  if (accountSignInButton) {
    accountSignInButton.classList.add("hidden");
  }
  if (accountSummary) {
    accountSummary.classList.remove("hidden");
  }
  if (accountName) {
    accountName.textContent = data.user.name || "Account";
  }
  if (accountEmail) {
    accountEmail.textContent = data.user.email || "";
  }
  if (sidebarLogoutButton) {
    sidebarLogoutButton.classList.remove("hidden");
  }
  githubSummary.textContent = data.githubConnected
    ? "Connected and syncing your recent projects."
    : "Connected account. Link GitHub to load recent projects.";
  if (settingsFirstNameInput) {
    settingsFirstNameInput.value = data.user.name || "";
  }
  if (settingsGithubStatus) {
    settingsGithubStatus.textContent = data.githubConnected
      ? "GitHub is connected to your account."
      : "GitHub is not connected. Use Connect GitHub in Team Workspace.";
  }

  if (data.githubConnected) {
    refreshRepos();
  } else {
    renderRepos([]);
  }

  await refreshTeamState();
  return data;
}

async function refreshRepos() {
  try {
    setStatus("Loading repositories...");
    const data = await apiJson("/api/github/repos", { method: "GET" });
    renderRepos(data.repos || []);
    setStatus(`Loaded ${data.repos.length} repositories`);
  } catch (err) {
    renderRepos([]);
    setStatus(err.message, true);
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveView(btn.dataset.view);
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    setStatus("Logging in...");
    await apiJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    await refreshSession();
    closeSignInModal();
    setStatus("Logged in");
  } catch (err) {
    setStatus(err.message, true);
  }
});

if (accountSignInButton) {
  accountSignInButton.addEventListener("click", async () => {
    const session = await refreshSession();
    if (!session.user) {
      openSignInModal();
      return;
    }
    setStatus(`Signed in as ${session.user.name || session.user.email}`);
  });
}

githubConnectButton.addEventListener("click", () => {
  window.location.href = "/api/auth/github/connect";
});

reposRefreshButton.addEventListener("click", refreshRepos);
if (repoShowMoreButton) {
  repoShowMoreButton.addEventListener("click", () => {
    showAllRepos = !showAllRepos;
    renderRepos(cachedRepos);
  });
}

if (workspaceRepoSearch) {
  workspaceRepoSearch.addEventListener("input", () => {
    renderRepos(cachedRepos);
    renderRepoSuggestions(workspaceRepoSearch, workspaceRepoSuggestions, workspaceRepoSelect);
  });
  workspaceRepoSearch.addEventListener("focus", () => {
    renderRepoSuggestions(workspaceRepoSearch, workspaceRepoSuggestions, workspaceRepoSelect);
  });
  workspaceRepoSearch.addEventListener("blur", () => {
    setTimeout(() => workspaceRepoSuggestions?.classList.add("hidden"), 120);
  });
}

if (workspaceRepoSelect) {
  workspaceRepoSelect.addEventListener("change", () => {
    const selected = workspaceRepoSelect.value;
    localStorage.setItem("forge_selected_workspace_repo", selected);
    workspaceRepoSearch.value = selected;
    renderRepos(cachedRepos);
  });
}

if (robotRepoSelect) {
  robotRepoSelect.addEventListener("change", () => {
    const selected = robotRepoSelect.value;
    localStorage.setItem("forge_selected_robot_repo", selected);
    updateRobotRepoMeta(selected);
  });
}

if (artifactRepoSelect) {
  artifactRepoSelect.addEventListener("change", () => {
    localStorage.setItem("forge_selected_artifact_repo", artifactRepoSelect.value);
  });
}

if (codeRepoSelect) {
  codeRepoSelect.addEventListener("change", () => {
    localStorage.setItem("forge_selected_code_repo", codeRepoSelect.value);
  });
}

if (robotRepoSearch) {
  robotRepoSearch.addEventListener("input", () => {
    renderRobotRepoSelector();
    renderRepoSuggestions(robotRepoSearch, robotRepoSuggestions, robotRepoSelect);
  });
  robotRepoSearch.addEventListener("focus", () => {
    renderRepoSuggestions(robotRepoSearch, robotRepoSuggestions, robotRepoSelect);
  });
  robotRepoSearch.addEventListener("blur", () => {
    setTimeout(() => robotRepoSuggestions?.classList.add("hidden"), 120);
  });
}

if (artifactRepoSearch) {
  artifactRepoSearch.addEventListener("input", () => {
    renderArtifactRepoSelector();
    renderRepoSuggestions(artifactRepoSearch, artifactRepoSuggestions, artifactRepoSelect);
  });
  artifactRepoSearch.addEventListener("focus", () => {
    renderRepoSuggestions(artifactRepoSearch, artifactRepoSuggestions, artifactRepoSelect);
  });
  artifactRepoSearch.addEventListener("blur", () => {
    setTimeout(() => artifactRepoSuggestions?.classList.add("hidden"), 120);
  });
}

if (codeRepoSearch) {
  codeRepoSearch.addEventListener("input", () => {
    renderCodeRepoSelector();
    renderRepoSuggestions(codeRepoSearch, codeRepoSuggestions, codeRepoSelect);
  });
  codeRepoSearch.addEventListener("focus", () => {
    renderRepoSuggestions(codeRepoSearch, codeRepoSuggestions, codeRepoSelect);
  });
  codeRepoSearch.addEventListener("blur", () => {
    setTimeout(() => codeRepoSuggestions?.classList.add("hidden"), 120);
  });
}

if (codeLayout) {
  const savedWidth = Number(localStorage.getItem("forge_code_files_width") || "320");
  setCodePaneWidth(savedWidth);
}

if (isCodeOnlyWorkspace && codeEditorWrap) {
  const savedTerminalHeight = Number(localStorage.getItem("forge_code_terminal_height") || "260");
  setTerminalPanelHeight(savedTerminalHeight);
  window.addEventListener("resize", () => {
    if (monacoEditor) {
      monacoEditor.layout();
    }
  });
}

if (codeResizer) {
  codeResizer.addEventListener("mousedown", (event) => {
    if (!codeLayout) return;
    event.preventDefault();
    codeResizer.classList.add("dragging");

    const onMove = (moveEvent) => {
      const layoutRect = codeLayout.getBoundingClientRect();
      const targetWidth = moveEvent.clientX - layoutRect.left;
      setCodePaneWidth(targetWidth);
    };

    const onUp = () => {
      codeResizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

if (isCodeOnlyWorkspace && terminalResizer) {
  terminalResizer.addEventListener("mousedown", (event) => {
    if (!codeEditorWrap) return;
    event.preventDefault();
    terminalResizer.classList.add("dragging");
    const startY = event.clientY;
    const startHeight = terminalMount?.getBoundingClientRect().height || 260;

    const onMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY;
      setTerminalPanelHeight(startHeight + delta);
    };

    const onUp = () => {
      terminalResizer.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

if (visualizerRepoSelect) {
  visualizerRepoSelect.addEventListener("change", () => {
    localStorage.setItem("forge_selected_visualizer_repo", visualizerRepoSelect.value);
  });
}

if (visualizerRepoSearch) {
  visualizerRepoSearch.addEventListener("input", () => {
    renderVisualizerRepoSelector();
    renderRepoSuggestions(visualizerRepoSearch, visualizerRepoSuggestions, visualizerRepoSelect);
  });
  visualizerRepoSearch.addEventListener("focus", () => {
    renderRepoSuggestions(visualizerRepoSearch, visualizerRepoSuggestions, visualizerRepoSelect);
  });
  visualizerRepoSearch.addEventListener("blur", () => {
    setTimeout(() => visualizerRepoSuggestions?.classList.add("hidden"), 120);
  });
}

if (artifactGenerateForm) {
  artifactGenerateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const repoFullName = artifactRepoSelect?.value || "";
    if (!repoFullName) {
      setStatus("Select a repository for artifact generation.", true);
      return;
    }

    try {
      setStatus("Generating integration diagram...");
      const data = await apiJson("/api/artifacts/generate", {
        method: "POST",
        body: JSON.stringify({ repoFullName })
      });
      generatedArtifact = data.artifact || null;

      if (artifactTitle) artifactTitle.textContent = generatedArtifact?.title || "Generated artifact";
      if (artifactDescription) {
        artifactDescription.textContent =
          generatedArtifact?.description || "Integration diagram generated.";
      }
      if (artifactMermaid) {
        await renderArtifactDiagram(generatedArtifact?.mermaid || "");
      }
      if (artifactStatus) {
        artifactStatus.textContent = `Generated at ${new Date(
          generatedArtifact.generatedAt
        ).toLocaleTimeString()}`;
      }
      setStatus("Artifact generated");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (artifactSaveButton) {
  artifactSaveButton.addEventListener("click", async () => {
    if (!generatedArtifact) {
      setStatus("Generate an artifact first.", true);
      return;
    }

    try {
      setStatus("Saving artifact to team workspace...");
      await apiJson("/api/team/artifacts", {
        method: "POST",
        body: JSON.stringify({
          type: "plan",
          title: generatedArtifact.title,
          summary: generatedArtifact.description,
          payload: generatedArtifact
        })
      });
      await refreshTeamState();
      if (artifactStatus) {
        artifactStatus.textContent = "Saved to Team Artifacts.";
      }
      setStatus("Artifact saved");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (codeLoadForm) {
  codeLoadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const repoFullName = codeRepoSelect?.value || "";
    if (!repoFullName) {
      setStatus("Select a repository first.", true);
      return;
    }

    try {
      setStatus("Loading repository file tree...");
      const data = await apiJson(
        `/api/code/tree/by-repo?repoFullName=${encodeURIComponent(repoFullName)}`,
        { method: "GET" }
      );
      if (data.source === "github") {
        currentCodeSource = "github";
        currentCodeRepoFullName = data.repoFullName;
        currentCodeRef = data.ref || "";
        currentCodeRepoPath = "";
        currentCodeFilePath = "";
        renderCodeFiles(data.files || []);
        const ok = await ensureMonacoLoaded();
        if (ok && monacoEditor) {
          monacoEditor.updateOptions({ readOnly: true });
          monacoEditor.setValue("// GitHub read-only mode. Select a file from the list.");
        }
        if (codeEditorMeta) {
          codeEditorMeta.textContent = `${data.repoFullName} @ ${data.ref} • read-only (GitHub)`;
        }
      } else {
        await loadCodeTreeByPath(data.repoPath);
      }
      setStatus("Repository loaded");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (codeOpenFolderButton) {
  codeOpenFolderButton.addEventListener("click", async () => {
    if (!window.forgeAPI?.openFolder) {
      setStatus("Open Folder is only available in desktop mode.", true);
      return;
    }

    try {
      const result = await window.forgeAPI.openFolder();
      if (!result || result.canceled || !result.path) {
        return;
      }

      setStatus("Loading selected folder...");
      await loadCodeTreeByPath(result.path);
      if (codeEditorMeta) {
        codeEditorMeta.textContent = `Opened folder: ${result.path}`;
      }
      setStatus("Folder loaded");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (codeOpenVsCodeButton) {
  codeOpenVsCodeButton.addEventListener("click", async () => {
    if (currentCodeSource === "github") {
      setStatus("GitHub mode is read-only. Use Open Folder for a local editable workspace.", true);
      return;
    }
    if (!currentCodeRepoPath) {
      setStatus("Load a local repository or folder first.", true);
      return;
    }
    if (!window.forgeAPI?.openInVSCode) {
      setStatus("Open in VSCode is only available in desktop mode.", true);
      return;
    }
    try {
      const result = await window.forgeAPI.openInVSCode(currentCodeRepoPath);
      if (!result?.ok) {
        throw new Error(result?.error || "Could not open VSCode.");
      }
      setStatus("Opened in VSCode");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (codeOpenNewWindowButton) {
  codeOpenNewWindowButton.addEventListener("click", async () => {
    if (!currentCodeRepoPath && !currentCodeRepoFullName) {
      setStatus("Load a repository or folder first.", true);
      return;
    }
    if (!currentCodeFilePath) {
      setStatus("Select a file first so the code-only window opens on it.", true);
      return;
    }
    if (!window.forgeAPI?.openCodeWindow) {
      setStatus("Open in New Window is only available in desktop mode.", true);
      return;
    }
    try {
      const result = await window.forgeAPI.openCodeWindow({
        repoPath: currentCodeRepoPath,
        repoFullName: currentCodeRepoFullName,
        ref: currentCodeRef,
        source: currentCodeSource,
        filePath: currentCodeFilePath
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Could not open code window.");
      }
      setStatus("Opened code in new window");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (terminalClearButton) {
  terminalClearButton.addEventListener("click", () => {
    if (terminalInstance) {
      terminalInstance.clear();
    }
  });
}

if (terminalRestartButton) {
  terminalRestartButton.addEventListener("click", async () => {
    if (!window.forgeAPI?.stopTerminal) return;
    await window.forgeAPI.stopTerminal();
    terminalStarted = false;
    terminalEchoLocalInput = false;
    await startWorkspaceTerminal(currentCodeRepoPath || "");
  });
}

if (visualizerLoadForm) {
  visualizerLoadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const repoFullName = visualizerRepoSelect?.value || "";
    if (!repoFullName) {
      setStatus("Select a repository for visualization.", true);
      return;
    }

    try {
      setStatus("Building repository graph...");
      const data = await apiJson(
        `/api/visualizer/graph/by-repo?repoFullName=${encodeURIComponent(
          repoFullName
        )}&includeSummaries=1`,
        { method: "GET" }
      );
      await renderRepositoryGraph(data);
      if (visualizerStats) {
        visualizerStats.textContent = `${repoFullName} • ${data.stats?.totalFiles ?? 0} files • ${
          data.stats?.totalEdges ?? 0
        } edges • summaries: ${data.stats?.summaryModel || "unavailable"}`;
      }
      setStatus("Repository graph loaded");
    } catch (err) {
      setStatus(err.message, true);
      if (visualizerStats) {
        visualizerStats.textContent = "Unable to build graph for selected repository.";
      }
    }
  });
}

if (visualizerOpenFolderButton) {
  visualizerOpenFolderButton.addEventListener("click", async () => {
    if (!window.forgeAPI?.openFolder) {
      setStatus("Open Folder is only available in desktop mode.", true);
      return;
    }

    try {
      const result = await window.forgeAPI.openFolder();
      if (!result || result.canceled || !result.path) {
        return;
      }

      setStatus("Building graph from selected folder...");
      const data = await apiJson(
        `/api/visualizer/graph?repoPath=${encodeURIComponent(result.path)}&includeSummaries=1`,
        { method: "GET" }
      );
      currentVisualizerRepoPath = data.repoPath || result.path;
      await renderRepositoryGraph(data);
      if (visualizerStats) {
        visualizerStats.textContent = `${currentVisualizerRepoPath} • ${
          data.stats?.totalFiles ?? 0
        } files • ${data.stats?.totalEdges ?? 0} edges • summaries: ${
          data.stats?.summaryModel || "unavailable"
        }`;
      }
      setStatus("Repository graph loaded");
    } catch (err) {
      setStatus(err.message, true);
      if (visualizerStats) {
        visualizerStats.textContent = "Unable to build graph for selected folder.";
      }
    }
  });
}

if (settingsProfileForm) {
  settingsProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const firstName = settingsFirstNameInput.value.trim();
    if (!firstName) return;

    try {
      setStatus("Saving profile...");
      await apiJson("/api/account/profile", {
        method: "POST",
        body: JSON.stringify({ first_name: firstName })
      });
      await refreshSession();
      setStatus("Profile updated");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (settingsPasswordForm) {
  settingsPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = settingsPasswordInput.value;
    if (!password) return;

    try {
      setStatus("Updating password...");
      await apiJson("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      settingsPasswordForm.reset();
      setStatus("Password updated");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (settingsGithubDisconnectButton) {
  settingsGithubDisconnectButton.addEventListener("click", async () => {
    try {
      setStatus("Disconnecting GitHub...");
      await apiJson("/api/account/github/disconnect", { method: "POST" });
      await refreshSession();
      setStatus("GitHub disconnected");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (settingsDeleteAccountButton) {
  settingsDeleteAccountButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete your account permanently?");
    if (!confirmed) return;

    try {
      setStatus("Deleting account...");
      await apiJson("/api/account/delete", { method: "POST" });
      renderRepos([]);
      await refreshSession();
      setStatus("Account deleted");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (settingsLogoutButton) {
  settingsLogoutButton.addEventListener("click", async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
      renderRepos([]);
      await refreshSession();
      setStatus("Logged out");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (sidebarLogoutButton) {
  sidebarLogoutButton.addEventListener("click", async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
      renderRepos([]);
      await refreshSession();
      setStatus("Logged out");
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (teamOpenModalButton) {
  teamOpenModalButton.addEventListener("click", () => {
    openTeamModal();
  });
}

teamCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("team-name").value.trim();
  if (!name) return;

  try {
    setStatus("Creating team...");
    await apiJson("/api/team/create", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    await refreshTeamState();
    teamCreateForm.reset();
    closeTeamModal();
    setStatus("Team created");
  } catch (err) {
    setStatus(err.message, true);
  }
});

teamJoinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const inviteCode = document.getElementById("team-invite-code").value.trim();
  if (!inviteCode) return;

  try {
    setStatus("Joining team...");
    await apiJson("/api/team/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode })
    });
    await refreshTeamState();
    teamJoinForm.reset();
    closeTeamModal();
    setStatus("Joined team");
  } catch (err) {
    setStatus(err.message, true);
  }
});

teamSwitchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const teamId = teamSelect.value;
  if (!teamId) return;

  try {
    setStatus("Switching team...");
    await apiJson("/api/team/switch", {
      method: "POST",
      body: JSON.stringify({ teamId })
    });
    await refreshTeamState();
    setStatus("Team switched");
  } catch (err) {
    setStatus(err.message, true);
  }
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const titleText = taskTitleInput.value.trim();
  const assigneeUserId = taskAssigneeInput.value.trim();
  if (!titleText) return;

  try {
    setStatus("Saving task...");
    await apiJson("/api/team/tasks", {
      method: "POST",
      body: JSON.stringify({ title: titleText, assigneeUserId })
    });
    taskForm.reset();
    await refreshTeamState();
    setStatus("Task added");
  } catch (err) {
    setStatus(err.message, true);
  }
});

analyzeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const repoPath = repoPathInput.value.trim();
  if (!repoPath) return;

  try {
    setStatus("Analyzing repository...");
    const data = await apiJson("/api/rde/analyze", {
      method: "POST",
      body: JSON.stringify({ repoPath })
    });
    analysisOutput.textContent = JSON.stringify(data, null, 2);
    setStatus("Analysis complete");
  } catch (err) {
    setStatus(err.message, true);
  }
});

window.forgeAPI
  .getAppMeta()
  .then((appMeta) => {
    meta.textContent = `${appMeta.name} v${appMeta.version} • ${appMeta.platform}`;
  })
  .catch(() => {
    meta.textContent = "Unable to load app metadata";
  });

setActiveView(isCodeOnlyWorkspace ? "code" : "workspace");
if (isCodeOnlyWorkspace) {
  document.body.classList.add("code-only-workspace");
  title.textContent = "Code Workspace";
  if (codeTerminal) {
    codeTerminal.classList.add("active");
  }
  initCodeOnlyTerminal().catch(() => {});
  if (window.forgeAPI?.onTerminalData && window.forgeAPI?.onTerminalExit) {
    terminalUnsubscribeData = window.forgeAPI.onTerminalData((payload) => {
      appendTerminalOutput(payload?.data || "");
    });
    terminalUnsubscribeExit = window.forgeAPI.onTerminalExit((payload) => {
      terminalStarted = false;
      terminalEchoLocalInput = false;
      appendTerminalOutput(`\r\n[terminal exited] code=${payload?.code ?? "unknown"}\r\n`);
    });
  }
  requestAnimationFrame(() => {
    if (monacoEditor) {
      monacoEditor.layout();
    }
  });
}
if (artifactMermaid?.textContent) {
  renderArtifactDiagram(artifactMermaid.textContent);
}

refreshSession()
  .then(async () => {
    const initialView = urlParams.get("view");
    const initialRepoPath = urlParams.get("repoPath");
    const initialRepoFullName = urlParams.get("repoFullName");
    const initialRef = urlParams.get("ref");
    const initialSource = urlParams.get("source");
    const initialFilePath = urlParams.get("filePath");

    if (!isCodeOnlyWorkspace && initialView && labels[initialView]) {
      setActiveView(initialView);
    }

    if (initialRepoPath) {
      try {
        await loadCodeTreeByPath(initialRepoPath);
        setActiveView("code");
        if (initialFilePath) {
          await loadCodeFile(initialFilePath);
        }
        if (isCodeOnlyWorkspace) {
          await startWorkspaceTerminal(currentCodeRepoPath || "");
        }
      } catch (err) {
        setStatus(err.message, true);
      }
    } else if (initialRepoFullName && initialSource === "github") {
      try {
        const data = await apiJson(
          `/api/code/tree/by-repo?repoFullName=${encodeURIComponent(
            initialRepoFullName
          )}&ref=${encodeURIComponent(initialRef || "")}`,
          { method: "GET" }
        );
        if (data.source === "github") {
          currentCodeSource = "github";
          currentCodeRepoFullName = data.repoFullName;
          currentCodeRef = data.ref || "";
          currentCodeRepoPath = "";
          currentCodeFilePath = "";
          renderCodeFiles(data.files || []);
          const ok = await ensureMonacoLoaded();
          if (ok && monacoEditor) {
            monacoEditor.updateOptions({ readOnly: true });
            monacoEditor.setValue("// GitHub read-only mode. Select a file from the list.");
          }
          if (codeEditorMeta) {
            codeEditorMeta.textContent = `${data.repoFullName} @ ${data.ref} • read-only (GitHub)`;
          }
          setActiveView("code");
          if (initialFilePath) {
            await loadCodeFile(initialFilePath);
          }
          if (isCodeOnlyWorkspace) {
            await startWorkspaceTerminal(currentCodeRepoPath || "");
          }
        }
      } catch (err) {
        setStatus(err.message, true);
      }
    } else if (isCodeOnlyWorkspace) {
      await startWorkspaceTerminal(currentCodeRepoPath || "");
    }
  })
  .catch(() => {
    setStatus("Unable to load session", true);
  });

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeSignInModal();
  }
  if (target instanceof HTMLElement && target.dataset.closeTeamModal === "true") {
    closeTeamModal();
  }

  if (target instanceof HTMLElement && target.dataset.deleteTeam) {
    const teamId = target.dataset.deleteTeam;
    const confirmed = window.confirm("Delete this team?");
    if (!confirmed) return;

    apiJson(`/api/team/${teamId}`, { method: "DELETE" })
      .then(async () => {
        await refreshTeamState();
        setStatus("Team deleted");
      })
      .catch((err) => {
        setStatus(err.message, true);
      });
  }

  if (target instanceof HTMLElement) {
    const toggleButton = target.closest("[data-tree-toggle]");
    if (toggleButton instanceof HTMLElement && toggleButton.dataset.treeToggle) {
      const dirPath = toggleButton.dataset.treeToggle;
      if (expandedCodeDirs.has(dirPath)) {
        expandedCodeDirs.delete(dirPath);
      } else {
        expandedCodeDirs.add(dirPath);
      }
      renderCodeFiles(currentCodeFiles, { preserveExpansion: true });
      return;
    }
  }

  if (target instanceof HTMLElement) {
    const fileButton = target.closest("[data-code-file]");
    if (fileButton instanceof HTMLElement && fileButton.dataset.codeFile) {
      loadCodeFile(fileButton.dataset.codeFile);
    }
  }

  if (target instanceof HTMLElement && target.dataset.taskDelete) {
    const taskId = target.dataset.taskDelete;
    apiJson(`/api/team/tasks/${taskId}`, { method: "DELETE" })
      .then(async () => {
        await refreshTeamState();
        setStatus("Task removed");
      })
      .catch((err) => {
        setStatus(err.message, true);
      });
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.taskToggle) {
    const taskId = target.dataset.taskToggle;
    const status = target.checked ? "completed" : "open";
    apiJson(`/api/team/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    })
      .then(async () => {
        await refreshTeamState();
        setStatus(status === "completed" ? "Task completed" : "Task reopened");
      })
      .catch((err) => {
        setStatus(err.message, true);
      });
  }
});

window.addEventListener("beforeunload", () => {
  if (terminalUnsubscribeData) {
    terminalUnsubscribeData();
    terminalUnsubscribeData = null;
  }
  if (terminalUnsubscribeExit) {
    terminalUnsubscribeExit();
    terminalUnsubscribeExit = null;
  }
  if (window.forgeAPI?.stopTerminal) {
    window.forgeAPI.stopTerminal().catch(() => {});
  }
  terminalEchoLocalInput = false;
});

// Robot page initialization - restore state from localStorage
(function initRobotPage() {
  const savedFolder = localStorage.getItem("forge_selected_robot_folder") || "";
  const savedRepo = localStorage.getItem("forge_selected_robot_repo") || "";
  const sourceMode = localStorage.getItem("forge_robot_source_mode") || "";

  // Update source badge on load
  if (robotSourceBadge) {
    if (sourceMode === "folder" && savedFolder) {
      robotSourceBadge.textContent = "Source: folder";
    } else if (savedRepo) {
      robotSourceBadge.textContent = "Source: repo";
    } else {
      robotSourceBadge.textContent = "Source: none";
    }
  }

  // Update meta text on load
  if (robotRepoMeta) {
    if (sourceMode === "folder" && savedFolder) {
      robotRepoMeta.textContent = `${savedFolder} • local folder source`;
    } else if (savedRepo) {
      robotRepoMeta.textContent = `${savedRepo} • GitHub repo source`;
    }
  }
})();

// Robot page event handlers (inline version)
if (robotRefreshButton) {
  robotRefreshButton.addEventListener("click", async () => {
    const repoFullName = robotRepoSelect?.value || localStorage.getItem("forge_selected_robot_repo") || "";
    const folderPath = localStorage.getItem("forge_selected_robot_folder") || "";

    if (!repoFullName && !folderPath) {
      setStatus("Select a repo or folder first", true);
      return;
    }

    try {
      setStatus("Syncing robot workspace...");
      const payload = repoFullName ? { repoFullName } : { sourcePath: folderPath };
      const data = await apiJson("/api/robot/workspace/sync", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const nodeCount = data.workspace?.graph?.nodes?.length || 0;
      setStatus(`Robot workspace synced - ${nodeCount} components`);

      // Update source badge
      if (robotSourceBadge) {
        robotSourceBadge.textContent = repoFullName ? "Source: repo" : "Source: folder";
      }

      // Update graph meta
      if (robotGraphMeta) {
        robotGraphMeta.textContent = `${repoFullName || folderPath} • ${nodeCount} nodes`;
      }

      // Render the robot graph
      await renderRobotGraph(data.workspace);

      // Render requirements list
      renderRequirementList(data.workspace?.requirements);

      // Update discovered components panel
      if (robotDiscoveredComponents && data.workspace?.graph?.nodes) {
        const nodes = data.workspace.graph.nodes;
        const hasJetson = nodes.some(n => (n.label || "").toLowerCase().includes("jetson") || (n.componentLabel || "").toLowerCase().includes("compute"));
        const hasArm = nodes.some(n => (n.label || "").toLowerCase().includes("arm") || (n.componentLabel || "").toLowerCase().includes("arm"));
        const hasCamera = nodes.some(n => (n.label || "").toLowerCase().includes("camera"));

        if (hasJetson || hasArm || hasCamera) {
          const items = [];
          if (hasJetson) items.push("<li>Compute/Jetson detected</li>");
          if (hasArm) items.push("<li>Robot arm detected</li>");
          if (hasCamera) items.push("<li>Camera detected</li>");
          robotDiscoveredComponents.innerHTML = `<ul class="robot-check-list">${items.join("")}</ul>`;
        } else {
          robotDiscoveredComponents.innerHTML = `<p class="muted">${nodeCount} nodes found. No robot hardware detected yet.</p>`;
        }

        // Update Live Bench visibility
        updateBenchVisibility(hasArm || hasJetson, { armType: "so100" });
      }
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

// Helper function to render robot graph
async function renderRobotGraph(workspace) {
  if (!robotGraphMount) return;

  const nodes = workspace?.graph?.nodes || [];
  const edges = workspace?.graph?.edges || [];

  if (!nodes.length) {
    robotGraphMount.innerHTML = `
      <div class="robot-graph-empty">
        <h3>Empty Robot Graph</h3>
        <p>Select a repo or folder, then sync the workspace to infer robot components.</p>
      </div>
    `;
    return;
  }

  // Load vis-network if needed
  if (!window.vis?.Network) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/vis-network/standalone/umd/vis-network.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } catch {
      robotGraphMount.innerHTML = '<div class="robot-graph-empty"><p>Could not load graph renderer.</p></div>';
      return;
    }
  }

  robotGraphMount.innerHTML = "";

  const COMPONENT_COLORS = {
    "component-arm": { background: "#0f766e", border: "#2dd4bf", text: "#ecfeff" },
    "component-base": { background: "#92400e", border: "#f59e0b", text: "#fff7ed" },
    "component-camera": { background: "#1d4ed8", border: "#60a5fa", text: "#eff6ff" },
    "component-compute": { background: "#14532d", border: "#4ade80", text: "#f0fdf4" },
    "component-unknown": { background: "#1e293b", border: "#64748b", text: "#e2e8f0" }
  };

  const getColor = (token) => COMPONENT_COLORS[token] || COMPONENT_COLORS["component-unknown"];

  const visNodes = nodes.map((node) => {
    const color = getColor(node.componentColorToken);
    return {
      id: node.id,
      label: node.label || node.id,
      title: node.description || node.label,
      shape: "box",
      margin: 12,
      font: { color: color.text, size: 14 },
      color: { background: color.background, border: color.border }
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const visEdges = edges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: edge.label || "",
      color: { color: "#475569" },
      arrows: { to: { enabled: true, scaleFactor: 0.6 } }
    }));

  new window.vis.Network(robotGraphMount, { nodes: visNodes, edges: visEdges }, {
    autoResize: true,
    interaction: { hover: true, tooltipDelay: 200 },
    physics: { enabled: true, solver: "forceAtlas2Based" }
  });
}

// Helper function to render requirements list
function renderRequirementList(requirements) {
  if (!robotRequirementList) return;

  if (!requirements || !requirements.length) {
    robotRequirementList.innerHTML = '<div class="robot-list-card"><p class="muted">No requirements yet. Add one above or let the planner create them.</p></div>';
    return;
  }

  robotRequirementList.innerHTML = requirements.map((req) => {
    const optionCount = (req.options || []).length;
    const statusClass = req.status === "resolved" ? "robot-pill-success" :
                        req.status === "options_ready" ? "robot-pill-warn" : "";
    const statusLabel = req.status === "resolved" ? "RESOLVED" :
                        req.status === "options_ready" ? `${optionCount} OPTIONS` : "OPEN";

    return `<article class="robot-list-card" data-requirement-id="${req.id}">
      <div class="robot-requirement-header">
        <span class="robot-pill ${statusClass}">${statusLabel}</span>
      </div>
      <h4>${req.title || "Untitled"}</h4>
      <p>${req.description || ""}</p>
      <div class="actions mt-3">
        <button type="button" data-discover-requirement="${req.id}">${optionCount ? "Refresh Options" : "Discover Options"}</button>
      </div>
    </article>`;
  }).join("");
}

// Helper function to update Live Bench visibility
function updateBenchVisibility(hasComponents, config = {}) {
  const benchEmptyState = document.getElementById("bench-empty-state");
  const benchIframe = document.getElementById("bench-iframe");

  if (benchEmptyState) {
    benchEmptyState.style.display = hasComponents ? "none" : "flex";
  }

  if (benchIframe) {
    if (hasComponents) {
      const params = new URLSearchParams({
        armType: config.armType || "so100",
        joints: "6",
        ip: config.ip || "",
        armPort: config.armPort || "8765",
        cameraPort: config.cameraPort || "8766"
      });
      const targetUrl = `/bench/?${params.toString()}`;

      if (benchIframe.src === "about:blank" || !benchIframe.src.includes(params.toString())) {
        benchIframe.src = targetUrl;
      }
      benchIframe.style.display = "block";
    } else {
      benchIframe.src = "about:blank";
      benchIframe.style.display = "none";
    }
  }
}

if (robotOpenFolderButton) {
  robotOpenFolderButton.addEventListener("click", async () => {
    if (!window.forgeAPI?.openFolder) {
      setStatus("Folder selection not available", true);
      return;
    }

    const result = await window.forgeAPI.openFolder();
    if (!result || result.canceled || !result.path) return;

    localStorage.setItem("forge_selected_robot_folder", result.path);
    localStorage.setItem("forge_robot_source_mode", "folder");

    if (robotRepoMeta) {
      robotRepoMeta.textContent = `${result.path} • local folder source`;
    }
    if (robotSourceBadge) {
      robotSourceBadge.textContent = "Source: folder";
    }

    try {
      setStatus("Syncing robot workspace from folder...");
      const data = await apiJson("/api/robot/workspace/sync", {
        method: "POST",
        body: JSON.stringify({ sourcePath: result.path })
      });
      const nodeCount = data.workspace?.graph?.nodes?.length || 0;
      setStatus(`Robot workspace synced - ${nodeCount} components`);

      // Update graph meta
      if (robotGraphMeta) {
        robotGraphMeta.textContent = `${result.path} • ${nodeCount} nodes`;
      }

      // Render the robot graph
      await renderRobotGraph(data.workspace);

      // Render requirements list
      renderRequirementList(data.workspace?.requirements);

      // Update discovered components panel
      if (robotDiscoveredComponents && data.workspace?.graph?.nodes) {
        const nodes = data.workspace.graph.nodes;
        const hasJetson = nodes.some(n => (n.label || "").toLowerCase().includes("jetson") || (n.componentLabel || "").toLowerCase().includes("compute"));
        const hasArm = nodes.some(n => (n.label || "").toLowerCase().includes("arm") || (n.componentLabel || "").toLowerCase().includes("arm"));
        const hasCamera = nodes.some(n => (n.label || "").toLowerCase().includes("camera"));

        if (hasJetson || hasArm || hasCamera) {
          const items = [];
          if (hasJetson) items.push("<li>Compute/Jetson detected</li>");
          if (hasArm) items.push("<li>Robot arm detected</li>");
          if (hasCamera) items.push("<li>Camera detected</li>");
          robotDiscoveredComponents.innerHTML = `<ul class="robot-check-list">${items.join("")}</ul>`;

          // Update Live Bench visibility
          updateBenchVisibility(hasArm || hasJetson, { armType: "so100" });
        }
      }
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (robotRequirementForm) {
  robotRequirementForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const titleInput = document.getElementById("robot-requirement-title");
    const descInput = document.getElementById("robot-requirement-description");
    const title = titleInput?.value?.trim() || "";
    const description = descInput?.value?.trim() || "";

    if (!title && !description) {
      setStatus("Enter a requirement title or description", true);
      return;
    }

    const repoFullName = robotRepoSelect?.value || localStorage.getItem("forge_selected_robot_repo") || "";
    const folderPath = localStorage.getItem("forge_selected_robot_folder") || "";

    if (!repoFullName && !folderPath) {
      setStatus("Select a repo or folder first", true);
      return;
    }

    try {
      setStatus("Creating requirement...");
      const payload = repoFullName ? { repoFullName } : { sourcePath: folderPath };
      const data = await apiJson("/api/robot/requirements", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          title: title || description,
          description,
          capability: `${title} ${description}`.trim()
        })
      });
      robotRequirementForm.reset();
      setStatus("Requirement created");

      // Render updated requirements list
      renderRequirementList(data.workspace?.requirements || [data.requirement].filter(Boolean));
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}
