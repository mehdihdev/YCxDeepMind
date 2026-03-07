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
const githubSummary = document.getElementById("github-summary");

const analyzeForm = document.getElementById("analyze-form");
const repoPathInput = document.getElementById("repo-path");
const analysisOutput = document.getElementById("analysis-output");

const labels = {
  workspace: "Team Workspace",
  robot: "My Robot",
  bench: "Live Bench",
  artifacts: "Artifacts"
};

function setActiveView(viewId) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });

  views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });

  title.textContent = labels[viewId] || "Forge RDE";
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#fca5a5" : "#9eb1cc";
}

function renderRepos(repos) {
  repoGrid.innerHTML = "";
  if (!repos.length) {
    repoGrid.innerHTML =
      '<div class="empty-repo">No repositories found yet.</div>';
    return;
  }

  repos.forEach((repo) => {
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
}

function openSignInModal() {
  signInModal.classList.remove("hidden");
  signInModal.setAttribute("aria-hidden", "false");
}

function closeSignInModal() {
  signInModal.classList.add("hidden");
  signInModal.setAttribute("aria-hidden", "true");
}

async function refreshSession() {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  const data = await res.json();
  if (!data.user) {
    accountButton.textContent = "Sign in";
    githubSummary.textContent = "Connect GitHub to load recent projects.";
    return data;
  }
  accountButton.textContent = data.user.name || "Account";
  githubSummary.textContent = data.githubConnected
    ? "Connected and syncing your recent projects."
    : "Connected account. Link GitHub to load recent projects.";
  if (data.githubConnected) {
    refreshRepos();
  }
  return data;
}

async function refreshRepos() {
  try {
    setStatus("Loading repositories...");
    const res = await fetch("/api/github/repos", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Unable to load repositories");
    }
    renderRepos(data.repos || []);
    setStatus(`Loaded ${data.repos.length} repositories`);
  } catch (err) {
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
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }
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

analyzeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const repoPath = repoPathInput.value.trim();
  if (!repoPath) return;

  try {
    setStatus("Analyzing repository...");
    const res = await fetch("/api/rde/analyze", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Analyze failed");
    }
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

refreshSession().catch(() => {
  setStatus("Unable to load session", true);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeSignInModal();
  }
});
