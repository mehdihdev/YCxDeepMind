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

let currentSession = { user: null, githubConnected: false };
let cachedRepos = [];
let showAllRepos = false;

function setStatus(message, isError = false) {
  if (!elements.statusText) return;
  elements.statusText.textContent = message || "";
  elements.statusText.classList.toggle("text-rose-300", Boolean(isError));
  elements.statusText.classList.toggle("text-slate-400", !isError);
}

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

function renderRepoGrid(repos) {
  if (!elements.repoGrid) return;
  if (!repos.length) {
    elements.repoGrid.innerHTML = '<div class="empty-repo">No repositories loaded yet.</div>';
    if (elements.repoShowMoreButton) {
      elements.repoShowMoreButton.style.display = "none";
    }
    return;
  }

  const visible = showAllRepos ? repos : repos.slice(0, 6);
  elements.repoGrid.innerHTML = visible
    .map(
      (repo) => `<a class="repo-card" href="${escapeHtml(repo.html_url || "#")}" target="_blank" rel="noreferrer">
        <div class="repo-card-top">
          <p class="repo-name">${escapeHtml(repo.name || repo.full_name)}</p>
          <span class="repo-visibility">${escapeHtml(repo.private ? "Private" : "Public")}</span>
        </div>
        <p class="repo-updated">${escapeHtml(repo.updated || "Updated recently")}</p>
        <p class="repo-description">${escapeHtml(repo.description || "No description provided.")}</p>
        <div class="repo-meta">
          <span>${escapeHtml(repo.language || "Unknown")}</span>
          <span>★ ${escapeHtml(String(repo.stars ?? 0))}</span>
          <span>⑂ ${escapeHtml(String(repo.forks ?? 0))}</span>
        </div>
      </a>`
    )
    .join("");

  if (elements.repoShowMoreButton) {
    if (repos.length <= 6) {
      elements.repoShowMoreButton.style.display = "none";
    } else {
      elements.repoShowMoreButton.style.display = "inline-flex";
      elements.repoShowMoreButton.textContent = showAllRepos ? "Show less" : "Show more";
    }
  }
}

function renderSession() {
  const user = currentSession.user;
  if (elements.accountName) {
    elements.accountName.textContent = user?.name || "Not signed in";
  }
  if (elements.accountEmail) {
    elements.accountEmail.textContent = user?.email || "-";
  }
  if (elements.settingsFirstNameInput) {
    elements.settingsFirstNameInput.value = user?.name || "";
  }
  if (elements.settingsGithubStatus) {
    elements.settingsGithubStatus.textContent = currentSession.githubConnected
      ? "GitHub connected."
      : "GitHub not connected.";
  }
  if (elements.githubSummary) {
    elements.githubSummary.textContent = currentSession.githubConnected
      ? "Load a repo here, then use the same source inside My Robot."
      : "Connect GitHub to load recent repositories.";
  }

  setHidden(elements.accountSummary, !user);
  setHidden(elements.sidebarLogoutButton, !user);
  if (elements.accountSignInButton) {
    elements.accountSignInButton.textContent = user ? "Signed in" : "Sign in";
    elements.accountSignInButton.disabled = Boolean(user);
  }
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
  setStatus("Refreshing repositories...");
  const data = await apiJson("/api/github/repos");
  pushRepos(data.repos || []);
  setStatus("Repositories loaded");
}

async function hydrateSession() {
  try {
    const appMeta = await window.forgeAPI.getAppMeta().catch(() => null);
    if (elements.meta && appMeta) {
      elements.meta.textContent = `${appMeta.name} ${appMeta.version} • ${appMeta.platform}`;
    }
    const session = await apiJson("/api/auth/session");
    currentSession = session;
    renderSession();
    if (currentSession.user) {
      await Promise.allSettled([
        teamController.refresh(),
        currentSession.githubConnected ? refreshRepos() : Promise.resolve()
      ]);
      await Promise.allSettled([codeController.loadStoredSource(), robotController.loadWorkspace()]);
    } else {
      pushRepos([]);
      await robotController.loadWorkspace().catch(() => {});
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

if (elements.navButtons.length) {
  for (const button of elements.navButtons) {
    button.addEventListener("click", () => setActiveView(button.dataset.view || "workspace"));
  }
}

if (elements.accountSignInButton) {
  elements.accountSignInButton.addEventListener("click", () => {
    if (!currentSession.user) {
      openSignInModal();
    }
  });
}

if (elements.sidebarLogoutButton) {
  elements.sidebarLogoutButton.addEventListener("click", async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
      currentSession = { user: null, githubConnected: false };
      renderSession();
      pushRepos([]);
      await teamController.refresh();
      codeController.reset();
      await robotController.loadWorkspace().catch(() => {});
      setStatus("Logged out");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (elements.settingsLogoutButton) {
  elements.settingsLogoutButton.addEventListener("click", () => {
    elements.sidebarLogoutButton?.click();
  });
}

if (elements.signInModal) {
  elements.signInModal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.closeModal === "true") {
      closeSignInModal();
    }
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

if (elements.reposRefreshButton) {
  elements.reposRefreshButton.addEventListener("click", () => {
    refreshRepos().catch((error) => setStatus(error.message, true));
  });
}

if (elements.repoShowMoreButton) {
  elements.repoShowMoreButton.addEventListener("click", () => {
    showAllRepos = !showAllRepos;
    renderRepoGrid(cachedRepos);
  });
}

if (elements.settingsProfileForm) {
  elements.settingsProfileForm.addEventListener("submit", async (event) => {
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

hydrateSession();
