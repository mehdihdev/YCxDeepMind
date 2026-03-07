import { apiJson, escapeHtml, setHidden } from "./lib/utils.js";
import { createTeamController } from "./modules/team.js";
import { createCodeController } from "./modules/code.js";
import { createArtifactController } from "./modules/artifacts.js";
import { createRobotController } from "./modules/robot.js";
import { createLiveRobotController } from "./modules/liveRobot.js";

const byId = (id) => document.getElementById(id);

const elements = {
  navButtons: Array.from(document.querySelectorAll(".nav-item")),
  views: Array.from(document.querySelectorAll(".view")),
  title: byId("view-title"),
  meta: byId("meta"),
  statusText: byId("status-text"),
  accountSignInButton: byId("account-signin"),
  accountSummary: byId("account-summary"),
  accountName: byId("account-name"),
  accountEmail: byId("account-email"),
  sidebarLogoutButton: byId("sidebar-logout"),
  loginForm: byId("login-form"),
  signInModal: byId("signin-modal"),
  githubConnectButton: byId("github-connect"),
  reposRefreshButton: byId("repos-refresh"),
  repoGrid: byId("repo-grid"),
  repoShowMoreButton: byId("repo-show-more"),
  githubSummary: byId("github-summary"),
  robotRepoSelect: byId("robot-repo-select"),
  robotRepoMeta: byId("robot-repo-meta"),
  robotOpenFolderButton: byId("robot-open-folder-button"),
  robotRefreshButton: byId("robot-refresh-button"),
  robotSourceBadge: byId("robot-source-badge"),
  robotGraphMeta: byId("robot-graph-meta"),
  robotGraphRevision: byId("robot-graph-revision"),
  robotSummaryGrid: byId("robot-summary-grid"),
  robotGraphMount: byId("robot-graph"),
  robotPlanForm: byId("robot-plan-form"),
  robotObjectiveInput: byId("robot-objective"),
  robotMissionBoard: byId("robot-mission-board"),
  robotRequirementForm: byId("robot-requirement-form"),
  robotRequirementTitleInput: byId("robot-requirement-title"),
  robotRequirementDescriptionInput: byId("robot-requirement-description"),
  robotRequirementList: byId("robot-requirement-list"),
  robotVerifyForm: byId("robot-verify-form"),
  robotObservationsInput: byId("robot-observations"),
  robotVerifierRuns: byId("robot-verifier-runs"),
  robotNodeDetail: byId("robot-node-detail"),
  robotOptionList: byId("robot-option-list"),
  robotTaskSuggestions: byId("robot-task-suggestions"),
  artifactGenerateForm: byId("artifact-generate-form"),
  artifactRepoSelect: byId("artifact-repo-select"),
  artifactSaveButton: byId("artifact-save-button"),
  artifactStatus: byId("artifact-status"),
  artifactTitle: byId("artifact-title"),
  artifactDescription: byId("artifact-description"),
  artifactMermaidRender: byId("artifact-mermaid-render"),
  artifactMermaid: byId("artifact-mermaid"),
  teamStorageBadge: byId("team-storage-badge"),
  teamOpenModalButton: byId("team-open-modal"),
  teamCreateForm: byId("team-create-form"),
  teamJoinForm: byId("team-join-form"),
  teamSwitchForm: byId("team-switch-form"),
  teamSelect: byId("team-select"),
  teamPillList: byId("team-pill-list"),
  activeTeamMeta: byId("active-team-meta"),
  membersList: byId("team-members-list"),
  teamTaskForm: byId("team-task-form"),
  taskTitleInput: byId("team-task-title"),
  taskAssigneeInput: byId("team-task-assignee"),
  taskList: byId("team-task-list"),
  artifactList: byId("team-artifact-list"),
  teamModal: byId("team-modal"),
  teamNameInput: byId("team-name"),
  teamInviteCodeInput: byId("team-invite-code"),
  settingsProfileForm: byId("settings-profile-form"),
  settingsFirstNameInput: byId("settings-first-name"),
  settingsPasswordForm: byId("settings-password-form"),
  settingsPasswordInput: byId("settings-password"),
  settingsGithubStatus: byId("settings-github-status"),
  settingsGithubDisconnectButton: byId("settings-github-disconnect"),
  settingsDeleteAccountButton: byId("settings-delete-account"),
  settingsLogoutButton: byId("settings-logout"),
  codeLoadForm: byId("code-load-form"),
  codeRepoSelect: byId("code-repo-select"),
  codeOpenFolderButton: byId("code-open-folder"),
  codeFileList: byId("code-file-list"),
  codeEditorMeta: byId("code-editor-meta"),
  monacoMount: byId("monaco-editor"),
  // Live Robot elements
  robotJetsonIp: byId("robot-jetson-ip"),
  robotArmPort: byId("robot-arm-port"),
  robotCameraPort: byId("robot-camera-port"),
  robotArmState: byId("robot-arm-state"),
  robotCameraPreview: byId("robot-camera-preview")
};

const labels = {
  workspace: "Team Workspace",
  code: "Code Workspace",
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
let currentVisualizerRepoPath = "";
let currentTeamState = {
  storage: "unknown",
  teams: [],
  activeTeamId: null,
  members: [],
  tasks: [],
  artifacts: []
};

function setActiveView(viewId) {
  for (const button of elements.navButtons) {
    button.classList.toggle("active", button.dataset.view === viewId);
  }
  for (const view of elements.views) {
    view.classList.toggle("active", view.id === viewId);
  }
  if (elements.title) {
    elements.title.textContent = labels[viewId] || "Forge RDE";
  }
  // Toggle fullscreen mode for bench view
  document.body.classList.toggle("bench-active", viewId === "bench");
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

  terminalInstance.onData(async (data) => {
    if (!window.forgeAPI?.writeTerminal) return;
    await window.forgeAPI.writeTerminal({ data });
  });

  window.addEventListener("resize", () => {
    resizeWorkspaceTerminal().catch(() => {});
  });
  setTimeout(() => {
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
    terminalStarted = true;
    appendTerminalOutput(`\r\n[terminal] started in ${launchCwd || "default cwd"}\r\n`);
    await resizeWorkspaceTerminal();
  } catch (err) {
    appendTerminalOutput(`\r\n[terminal] ${err.message}\r\n`);
  }
}

function renderRepos(repos) {
  cachedRepos = repos;
  repoGrid.innerHTML = "";
  if (!repos.length) {
    elements.repoGrid.innerHTML = '<div class="empty-repo">No repositories loaded yet.</div>';
    if (elements.repoShowMoreButton) {
      elements.repoShowMoreButton.style.display = "none";
    }
    return;
  }

  const visibleRepos = showAllRepos ? repos : repos.slice(0, 6);
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
    if (repos.length <= 6) {
      repoShowMoreButton.style.display = "none";
    } else {
      elements.repoShowMoreButton.style.display = "inline-flex";
      elements.repoShowMoreButton.textContent = showAllRepos ? "Show less" : "Show more";
    }
  }
}

function renderRobotRepoSelector() {
  if (!robotRepoSelect) return;

  const saved = localStorage.getItem("forge_selected_robot_repo") || "";
  robotRepoSelect.innerHTML = "";

  if (!cachedRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No repositories loaded";
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

  cachedRepos.forEach((repo) => {
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
  artifactRepoSelect.innerHTML = "";

  if (!cachedRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No repositories loaded";
    artifactRepoSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  artifactRepoSelect.appendChild(placeholder);

  cachedRepos.forEach((repo) => {
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
  codeRepoSelect.innerHTML = "";

  if (!cachedRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No repositories loaded";
    codeRepoSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  codeRepoSelect.appendChild(placeholder);

  cachedRepos.forEach((repo) => {
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
  visualizerRepoSelect.innerHTML = "";

  if (!cachedRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No repositories loaded";
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

  cachedRepos.forEach((repo) => {
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
  if (!elements.signInModal) return;
  elements.signInModal.classList.remove("hidden");
  elements.signInModal.setAttribute("aria-hidden", "false");
}

function closeSignInModal() {
  if (!elements.signInModal) return;
  elements.signInModal.classList.add("hidden");
  elements.signInModal.setAttribute("aria-hidden", "true");
}

const teamController = createTeamController({
  elements,
  setStatus
});

const codeController = createCodeController({
  elements,
  setStatus
});

const artifactController = createArtifactController({
  elements,
  setStatus,
  onSaved: () => teamController.refresh()
});

const liveRobotController = createLiveRobotController({
  elements,
  setStatus
});

const robotController = createRobotController({
  elements,
  setStatus,
  getTeamMembers: () => teamController.getMembers(),
  saveTaskToLog: ({ title, assigneeUserId }) => teamController.createTask({ title, assigneeUserId }),
  // Pass live robot controller for component discovery
  onComponentsDiscovered: (components) => liveRobotController.onComponentsDiscovered(components)
});

// Initialize live robot controller
liveRobotController.init();

function pushRepos(repos) {
  cachedRepos = Array.isArray(repos) ? repos : [];
  renderRepoGrid(cachedRepos);
  codeController.setRepos(cachedRepos);
  artifactController.setRepos(cachedRepos);
  robotController.setRepos(cachedRepos);
}

async function refreshRepos() {
  if (!currentSession.user) return;
  if (!currentSession.githubConnected) {
    pushRepos([]);
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

function renderCodeFiles(files) {
  codeFileList.innerHTML = "";
  if (!files.length) {
    codeFileList.innerHTML = '<li class="empty-list">No files found.</li>';
    return;
  }
  files.forEach((filePath) => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="code-file-btn" data-code-file="${filePath}">${filePath}</button>`;
    codeFileList.appendChild(li);
  });
}

async function loadCodeTreeByPath(repoPath) {
  const data = await apiJson(`/api/code/tree?repoPath=${encodeURIComponent(repoPath)}`, {
    method: "GET"
  });
  currentCodeRepoPath = data.repoPath;
  renderCodeFiles(data.files || []);
  if (codeEditorMeta) {
    codeEditorMeta.textContent = `Loaded ${data.files.length} files from ${data.repoPath}`;
  }
  await ensureMonacoLoaded();
}

async function loadCodeFile(filePath) {
  if (!currentCodeRepoPath || !filePath) return;

  try {
    const data = await apiJson(
      `/api/code/file?repoPath=${encodeURIComponent(currentCodeRepoPath)}&filePath=${encodeURIComponent(
        filePath
      )}`,
      { method: "GET" }
    );

    const ok = await ensureMonacoLoaded();
    if (ok && monacoEditor) {
      const model = window.monaco.editor.createModel(
        data.content,
        inferLanguage(filePath),
        window.monaco.Uri.parse(`inmemory://forge/${filePath}`)
      );
      monacoEditor.setModel(model);
    }

    if (codeEditorMeta) {
      codeEditorMeta.textContent = `${data.repoPath} • ${data.filePath}`;
    }
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
      option.textContent = member.user?.name || member.user?.email || member.user_id;
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
      const name = member.user?.name || member.user?.email || member.user_id;
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
      const assignee = task.assignee_user_id ? ` • assignee: ${task.assignee_user_id}` : "";
      li.innerHTML = `<strong>${task.title}</strong><span>${task.status}${assignee}</span>`;
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

if (robotRepoSelect) {
  robotRepoSelect.addEventListener("change", () => {
    const selected = robotRepoSelect.value;
    localStorage.setItem("forge_selected_robot_repo", selected);
    updateRobotRepoMeta(selected);
  });
}

if (elements.settingsLogoutButton) {
  elements.settingsLogoutButton.addEventListener("click", () => {
    elements.sidebarLogoutButton?.click();
  });
}

if (codeRepoSelect) {
  codeRepoSelect.addEventListener("change", () => {
    localStorage.setItem("forge_selected_code_repo", codeRepoSelect.value);
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

if (elements.loginForm) {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(byId("email")?.value || "").trim();
    const password = String(byId("password")?.value || "");
    try {
      setStatus("Signing in...");
      currentSession = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      closeSignInModal();
      renderSession();
      await Promise.allSettled([teamController.refresh(), currentSession.githubConnected ? refreshRepos() : Promise.resolve()]);
      await Promise.allSettled([codeController.loadStoredSource(), robotController.loadWorkspace()]);
      setStatus("Signed in");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (elements.githubConnectButton) {
  elements.githubConnectButton.addEventListener("click", () => {
    if (!currentSession.user) {
      openSignInModal();
      return;
    }
    window.location.assign("/api/auth/github/connect");
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
      await loadCodeTreeByPath(data.repoPath);
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

if (visualizerLoadForm) {
  visualizerLoadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const first_name = String(elements.settingsFirstNameInput?.value || "").trim();
    if (!first_name) return;
    try {
      setStatus("Saving profile...");
      const data = await apiJson("/api/account/profile", {
        method: "POST",
        body: JSON.stringify({ first_name })
      });
      currentSession.user = data.user;
      renderSession();
      setStatus("Profile updated");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (elements.settingsPasswordForm) {
  elements.settingsPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = String(elements.settingsPasswordInput?.value || "");
    try {
      setStatus("Updating password...");
      await apiJson("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      elements.settingsPasswordForm.reset();
      setStatus("Password updated");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (elements.settingsGithubDisconnectButton) {
  elements.settingsGithubDisconnectButton.addEventListener("click", async () => {
    try {
      setStatus("Disconnecting GitHub...");
      await apiJson("/api/account/github/disconnect", { method: "POST" });
      currentSession.githubConnected = false;
      renderSession();
      pushRepos([]);
      setStatus("GitHub disconnected");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (elements.settingsDeleteAccountButton) {
  elements.settingsDeleteAccountButton.addEventListener("click", async () => {
    if (!window.confirm("Delete this account permanently?")) return;
    try {
      setStatus("Deleting account...");
      await apiJson("/api/account/delete", { method: "POST" });
      currentSession = { user: null, githubConnected: false };
      renderSession();
      pushRepos([]);
      await teamController.refresh();
      codeController.reset();
      await robotController.loadWorkspace().catch(() => {});
      setStatus("Account deleted");
    } catch (error) {
      setStatus(error.message, true);
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

setActiveView("workspace");
if (artifactMermaid?.textContent) {
  renderArtifactDiagram(artifactMermaid.textContent);
}

refreshSession().catch(() => {
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

  if (target instanceof HTMLElement && target.dataset.codeFile) {
    loadCodeFile(target.dataset.codeFile);
  }
});
