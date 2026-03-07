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
const githubSummary = document.getElementById("github-summary");
const robotRepoSelect = document.getElementById("robot-repo-select");
const robotRepoMeta = document.getElementById("robot-repo-meta");
const artifactGenerateForm = document.getElementById("artifact-generate-form");
const artifactRepoSelect = document.getElementById("artifact-repo-select");
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
const codeOpenFolderButton = document.getElementById("code-open-folder");
const codeFileList = document.getElementById("code-file-list");
const codeEditorMeta = document.getElementById("code-editor-meta");
const monacoMount = document.getElementById("monaco-editor");
const visualizerLoadForm = document.getElementById("visualizer-load-form");
const visualizerRepoSelect = document.getElementById("visualizer-repo-select");
const visualizerOpenFolderButton = document.getElementById("visualizer-open-folder");
const visualizerStats = document.getElementById("visualizer-stats");
const visualizerGraphMount = document.getElementById("visualizer-graph");

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

function renderRepos(repos) {
  cachedRepos = repos;
  repoGrid.innerHTML = "";
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

if (visualizerRepoSelect) {
  visualizerRepoSelect.addEventListener("change", () => {
    localStorage.setItem("forge_selected_visualizer_repo", visualizerRepoSelect.value);
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
