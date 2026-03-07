import { apiJson, escapeHtml, formatTimestamp } from "../lib/utils.js";

function emptyState() {
  return {
    storage: "unknown",
    teams: [],
    activeTeamId: null,
    members: [],
    tasks: [],
    artifacts: []
  };
}

function memberLabel(member) {
  const profile = member?.user || {};
  return profile.name || profile.email || member?.user_id || "Unknown member";
}

function renderSimpleList(listElement, items, emptyMessage) {
  if (!listElement) return;
  if (!items.length) {
    listElement.innerHTML = `<li class="empty-list">${escapeHtml(emptyMessage)}</li>`;
    return;
  }
  listElement.innerHTML = items.join("");
}

export function createTeamController({ elements, setStatus }) {
  let state = emptyState();

  function openModal() {
    if (!elements.teamModal) return;
    elements.teamModal.classList.remove("hidden");
    elements.teamModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!elements.teamModal) return;
    elements.teamModal.classList.add("hidden");
    elements.teamModal.setAttribute("aria-hidden", "true");
  }

  function populateAssigneeSelect(selectElement, selectedValue = "", includeUnassigned = true) {
    if (!selectElement) return;
    const members = state.members || [];
    const options = [];
    if (includeUnassigned) {
      options.push(`<option value="">Unassigned</option>`);
    }
    for (const member of members) {
      const selected = selectedValue === member.user_id ? " selected" : "";
      options.push(
        `<option value="${escapeHtml(member.user_id)}"${selected}>${escapeHtml(memberLabel(member))}</option>`
      );
    }
    selectElement.innerHTML = options.join("");
  }

  function render() {
    if (elements.teamStorageBadge) {
      elements.teamStorageBadge.textContent = `Storage: ${state.storage || "unknown"}`;
    }

    if (elements.teamSelect) {
      if (!state.teams.length) {
        elements.teamSelect.innerHTML = '<option value="">No teams yet</option>';
      } else {
        elements.teamSelect.innerHTML = state.teams
          .map((team) => {
            const selected = team.id === state.activeTeamId ? " selected" : "";
            return `<option value="${escapeHtml(team.id)}"${selected}>${escapeHtml(team.name)} (${escapeHtml(
              team.role || "member"
            )})</option>`;
          })
          .join("");
      }
    }

    if (elements.teamPillList) {
      if (!state.teams.length) {
        elements.teamPillList.innerHTML = "";
      } else {
        elements.teamPillList.innerHTML = state.teams
          .map((team) => {
            const activeClass = team.id === state.activeTeamId ? " active" : "";
            const deleteButton =
              team.role === "owner"
                ? `<button type="button" data-delete-team="${escapeHtml(team.id)}" class="team-pill-delete">×</button>`
                : "";
            return `<li class="team-pill${activeClass}"><span>${escapeHtml(team.name)}</span>${deleteButton}</li>`;
          })
          .join("");
      }
    }

    const activeTeam = state.teams.find((team) => team.id === state.activeTeamId);
    if (elements.activeTeamMeta) {
      elements.activeTeamMeta.textContent = activeTeam
        ? `${activeTeam.name} • Invite ${activeTeam.invite_code || "n/a"} • ${state.members.length} members`
        : "No active team";
    }

    renderSimpleList(
      elements.membersList,
      (state.members || []).map(
        (member) => `<li><div>${escapeHtml(memberLabel(member))}</div><span>${escapeHtml(member.role || "member")}</span></li>`
      ),
      "No members yet."
    );

    renderSimpleList(
      elements.taskList,
      (state.tasks || []).map((task) => {
        const assignee = state.members.find((member) => member.user_id === task.assignee_user_id);
        return `<li><div>
          <div>${escapeHtml(task.title || "Untitled task")}</div>
          <span>${escapeHtml(task.status || "open")} • ${escapeHtml(
            assignee ? memberLabel(assignee) : "Unassigned"
          )}</span>
        </div><span>${escapeHtml(formatTimestamp(task.created_at))}</span></li>`;
      }),
      "No tasks yet."
    );

    renderSimpleList(
      elements.artifactList,
      (state.artifacts || []).map(
        (artifact) => `<li><div>
          <div>${escapeHtml(artifact.title || "Untitled artifact")}</div>
          <span>${escapeHtml(artifact.type || "artifact")} • ${escapeHtml(artifact.summary || "")}</span>
        </div><span>${escapeHtml(formatTimestamp(artifact.created_at))}</span></li>`
      ),
      "No saved runs or fixes yet."
    );

    populateAssigneeSelect(elements.taskAssigneeInput);
  }

  async function refresh() {
    try {
      state = await apiJson("/api/team/state");
      render();
      return state;
    } catch (error) {
      state = emptyState();
      render();
      setStatus(error.message, true);
      return state;
    }
  }

  async function createTask({ title, assigneeUserId = "" }) {
    await apiJson("/api/team/tasks", {
      method: "POST",
      body: JSON.stringify({
        title,
        assigneeUserId: assigneeUserId || null
      })
    });
    await refresh();
  }

  function getMembers() {
    return state.members || [];
  }

  if (elements.teamOpenModalButton) {
    elements.teamOpenModalButton.addEventListener("click", openModal);
  }

  if (elements.teamModal) {
    elements.teamModal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.closeTeamModal === "true") {
        closeModal();
      }
    });
  }

  if (elements.teamCreateForm) {
    elements.teamCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(elements.teamNameInput?.value || "").trim();
      if (!name) return;
      try {
        setStatus("Creating team...");
        await apiJson("/api/team/create", {
          method: "POST",
          body: JSON.stringify({ name })
        });
        elements.teamCreateForm.reset();
        closeModal();
        await refresh();
        setStatus("Team created");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.teamJoinForm) {
    elements.teamJoinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const inviteCode = String(elements.teamInviteCodeInput?.value || "").trim();
      if (!inviteCode) return;
      try {
        setStatus("Joining team...");
        await apiJson("/api/team/join", {
          method: "POST",
          body: JSON.stringify({ inviteCode })
        });
        elements.teamJoinForm.reset();
        closeModal();
        await refresh();
        setStatus("Joined team");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.teamSwitchForm) {
    elements.teamSwitchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const teamId = String(elements.teamSelect?.value || "");
      if (!teamId) return;
      try {
        setStatus("Switching team...");
        await apiJson("/api/team/switch", {
          method: "POST",
          body: JSON.stringify({ teamId })
        });
        await refresh();
        setStatus("Team switched");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.teamTaskForm) {
    elements.teamTaskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = String(elements.taskTitleInput?.value || "").trim();
      const assigneeUserId = String(elements.taskAssigneeInput?.value || "");
      if (!title) return;
      try {
        setStatus("Adding task...");
        await createTask({ title, assigneeUserId });
        elements.teamTaskForm.reset();
        populateAssigneeSelect(elements.taskAssigneeInput);
        setStatus("Task added");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.teamPillList) {
    elements.teamPillList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const teamId = String(target.dataset.deleteTeam || "");
      if (!teamId) return;
      if (!window.confirm("Delete this team?")) return;
      try {
        setStatus("Deleting team...");
        await apiJson(`/api/team/${encodeURIComponent(teamId)}`, { method: "DELETE" });
        await refresh();
        setStatus("Team deleted");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  return {
    refresh,
    render,
    createTask,
    getMembers,
    getState: () => state,
    populateAssigneeSelect,
    openModal,
    closeModal
  };
}
