const navButtons = Array.from(document.querySelectorAll(".nav-item"));
const views = Array.from(document.querySelectorAll(".view"));
const title = document.getElementById("view-title");
const meta = document.getElementById("meta");
const statusText = document.getElementById("status-text");

const accountButton = document.getElementById("account-button");
const loginForm = document.getElementById("login-form");
const signInModal = document.getElementById("signin-modal");
const githubConnectButton = document.getElementById("github-connect");
const reposRefreshButton = document.getElementById("repos-refresh");
const repoGrid = document.getElementById("repo-grid");
const repoShowMoreButton = document.getElementById("repo-show-more");
const githubSummary = document.getElementById("github-summary");
const robotRepoSelect = document.getElementById("robot-repo-select");
const robotRepoMeta = document.getElementById("robot-repo-meta");

const teamStorageBadge = document.getElementById("team-storage-badge");
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

const analyzeForm = document.getElementById("analyze-form");
const repoPathInput = document.getElementById("repo-path");
const analysisOutput = document.getElementById("analysis-output");

const labels = {
  workspace: "Team Workspace",
  robot: "My Robot",
  bench: "Live Bench",
  artifacts: "Artifacts",
  settings: "Account Settings"
};

let currentSession = { user: null, githubConnected: false };
let cachedRepos = [];
let showAllRepos = false;
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
    accountButton.textContent = "Sign in";
    githubSummary.textContent = "Connect GitHub to load recent projects.";
    if (settingsGithubStatus) {
      settingsGithubStatus.textContent = "Sign in to manage integrations.";
    }
    renderRepos([]);
    await refreshTeamState();
    return data;
  }

  accountButton.textContent = data.user.name || "Account";
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

accountButton.addEventListener("click", async () => {
  const session = await refreshSession();
  if (!session.user) {
    openSignInModal();
    return;
  }
  setStatus(`Signed in as ${session.user.name || session.user.email}`);
});

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

if (settingsProfileForm) {
  settingsProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const firstName = settingsFirstNameInput.value.trim();
    if (!firstName) return;

    try {
      setStatus("Saving profile...");
      const data = await apiJson("/api/account/profile", {
        method: "POST",
        body: JSON.stringify({ first_name: firstName })
      });
      if (data?.user?.name) {
        accountButton.textContent = data.user.name;
      }
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

refreshSession().catch(() => {
  setStatus("Unable to load session", true);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeSignInModal();
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
});
