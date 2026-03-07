import { apiJson, escapeHtml, formatTimestamp, wrapText } from "../lib/utils.js";
import { ensureVisNetworkLoaded } from "../lib/loaders.js";

const COMPONENT_COLORS = {
  "component-arm": { background: "#0f766e", border: "#2dd4bf", text: "#ecfeff" },
  "component-base": { background: "#92400e", border: "#f59e0b", text: "#fff7ed" },
  "component-camera": { background: "#1d4ed8", border: "#60a5fa", text: "#eff6ff" },
  "component-audio": { background: "#6d28d9", border: "#a78bfa", text: "#f5f3ff" },
  "component-compute": { background: "#14532d", border: "#4ade80", text: "#f0fdf4" },
  "component-planner": { background: "#be123c", border: "#fb7185", text: "#fff1f2" },
  "component-verifier": { background: "#4338ca", border: "#818cf8", text: "#eef2ff" },
  "component-parts": { background: "#9a3412", border: "#fb923c", text: "#fff7ed" },
  "component-source": { background: "#0f172a", border: "#38bdf8", text: "#e0f2fe" },
  "component-task": { background: "#365314", border: "#84cc16", text: "#f7fee7" },
  "component-unknown": { background: "#1e293b", border: "#64748b", text: "#e2e8f0" }
};

function getStoredFolder() {
  return localStorage.getItem("forge_selected_robot_folder") || "";
}

function getStoredRepo() {
  return localStorage.getItem("forge_selected_robot_repo") || "";
}

function getSourceMode() {
  return localStorage.getItem("forge_robot_source_mode") || "repo";
}

function setSourceMode(mode) {
  localStorage.setItem("forge_robot_source_mode", mode);
}

function isRequirementNodeId(nodeId) {
  return String(nodeId || "").startsWith("requirement:");
}

function requirementIdFromNodeId(nodeId) {
  return String(nodeId || "").replace(/^requirement:/, "");
}

function requirementIdFromOptionNodeId(nodeId) {
  const match = String(nodeId || "").match(/^candidate:([^:]+):/);
  return match?.[1] || "";
}

function componentColor(token) {
  return COMPONENT_COLORS[token] || COMPONENT_COLORS["component-unknown"];
}

function nodeTooltip(node) {
  return [
    escapeHtml(node.label || node.id || "Node"),
    escapeHtml(node.componentLabel || "Unknown component"),
    escapeHtml(node.description || "")
  ]
    .filter(Boolean)
    .join(" • ");
}

function sourcePayloadFromState(mode, repoValue, folderValue) {
  if (mode === "folder" && folderValue) {
    return { sourcePath: folderValue };
  }
  if (repoValue) {
    return { repoFullName: repoValue };
  }
  if (folderValue) {
    return { sourcePath: folderValue };
  }
  return null;
}

export function createRobotController({ elements, setStatus, getTeamMembers, saveTaskToLog, onComponentsDiscovered }) {
  let repos = [];
  let workspaceResponse = null;
  let selectedNodeId = "";
  let activeRequirementId = "";
  let graphNetwork = null;
  let graphView = null;
  let graphPositions = {};
  let graphHasFitted = false;

  // Analyze graph nodes to detect robot hardware components
  function detectRobotComponents(workspace) {
    const nodes = workspace?.graph?.nodes || [];
    const components = {
      hasJetson: false,
      hasArm: false,
      hasCar: false,
      hasCamera: false,
      jetsonIp: null,
      armPort: "8765",
      cameraPort: "8766",
      armType: null,
      robotType: null, // "arm" or "car"
      carType: null,
      cameras: []
    };

    for (const node of nodes) {
      const label = (node.label || "").toLowerCase();
      const description = (node.description || "").toLowerCase();
      const componentLabel = (node.componentLabel || "").toLowerCase();
      const kind = (node.kind || "").toLowerCase();

      // Detect Jetson / compute nodes
      if (label.includes("jetson") || description.includes("jetson") ||
          componentLabel.includes("compute") || kind === "compute") {
        components.hasJetson = true;
        // Try to extract IP from description or evidence
        const ipMatch = description.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (ipMatch) {
          components.jetsonIp = ipMatch[1];
        }
      }

      // Detect car/mobile robot nodes (check before arm to prioritize car detection)
      if (label.includes("elegoo") || label.includes("smart car") || label.includes("robot car") ||
          label.includes("differential_drive") || label.includes("mobile robot") ||
          label.includes("wheel") || label.includes("l298n") || label.includes("motor driver") ||
          description.includes("elegoo") || description.includes("smart car") ||
          description.includes("differential_drive") || description.includes("4-wheel") ||
          componentLabel.includes("car") || componentLabel.includes("mobile") || kind === "car") {
        components.hasCar = true;
        components.robotType = "car";
        if (label.includes("elegoo") || description.includes("elegoo")) {
          components.carType = "elegoo_v4";
        } else {
          components.carType = "differential_drive";
        }
      }

      // Detect arm nodes
      if (label.includes("arm") || label.includes("so-100") || label.includes("so100") ||
          label.includes("leader") || label.includes("follower") ||
          componentLabel.includes("arm") || kind === "arm") {
        components.hasArm = true;
        if (!components.robotType) {
          components.robotType = "arm";
        }
        if (label.includes("so-100") || label.includes("so100") || description.includes("so-100")) {
          components.armType = "SO-100";
        } else if (label.includes("lerobot") || description.includes("lerobot")) {
          components.armType = "LeRobot";
        }
      }

      // Detect camera nodes
      if (label.includes("camera") || label.includes("webcam") || label.includes("realsense") ||
          label.includes("esp32-cam") || label.includes("esp32cam") ||
          componentLabel.includes("camera") || kind === "camera") {
        components.hasCamera = true;
        components.cameras.push({
          id: node.id,
          name: node.label || "Camera"
        });
      }

      // Check for robot.config.json evidence
      for (const evidence of node.evidence || []) {
        const source = (evidence.source || evidence.url || "").toLowerCase();
        if (source.includes("robot.config.json") || source.includes("config.json")) {
          // Config file found - likely has connection details
          const content = evidence.content || evidence.excerpt || "";
          const ipMatch = content.match(/"ip"\s*:\s*"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"/);
          if (ipMatch) {
            components.jetsonIp = ipMatch[1];
          }
          const armPortMatch = content.match(/"arm"\s*:\s*\{[^}]*"port"\s*:\s*(\d+)/);
          if (armPortMatch) {
            components.armPort = armPortMatch[1];
          }
          const cameraPortMatch = content.match(/"camera"\s*:\s*\{[^}]*"port"\s*:\s*(\d+)/);
          if (cameraPortMatch) {
            components.cameraPort = cameraPortMatch[1];
          }
          // Detect robot type from config
          const typeMatch = content.match(/"type"\s*:\s*"([^"]+)"/);
          if (typeMatch) {
            const configType = typeMatch[1].toLowerCase();
            if (configType.includes("differential") || configType.includes("car") || configType.includes("mobile")) {
              components.hasCar = true;
              components.robotType = "car";
              components.carType = "elegoo_v4";
            } else if (configType.includes("arm") || configType.includes("manipulator")) {
              components.robotType = "arm";
            }
          }
        }
      }
    }

    return components;
  }

  // Notify live robot controller about discovered components
  function notifyComponentsDiscovered(workspace) {
    if (typeof onComponentsDiscovered !== "function") return;

    const components = detectRobotComponents(workspace);
    const hasAnyComponents = components.hasJetson || components.hasArm || components.hasCamera;

    // Always call with current state - empty or populated
    onComponentsDiscovered(components);
  }

  function currentRepoValue() {
    return String(elements.robotRepoSelect?.value || getStoredRepo());
  }

  function currentFolderValue() {
    return getStoredFolder();
  }

  function currentSourcePayload() {
    return sourcePayloadFromState(getSourceMode(), currentRepoValue(), currentFolderValue());
  }

  function activeWorkspace() {
    return workspaceResponse?.workspace || {
      graph: { nodes: [], edges: [] },
      requirements: [],
      taskSuggestions: [],
      runs: { planner: [], verifier: [] },
      metadata: { emptyState: true }
    };
  }

  function activeSummary() {
    return workspaceResponse?.summary || {
      nodeCount: 0,
      edgeCount: 0,
      openRequirementCount: 0,
      plannerRuns: 0,
      verifierRuns: 0,
      updatedAt: ""
    };
  }

  function componentPalette() {
    return workspaceResponse?.componentPalette || [];
  }

  function renderRepoSelector() {
    if (!elements.robotRepoSelect) return;
    const savedRepo = getStoredRepo();
    if (!repos.length) {
      elements.robotRepoSelect.innerHTML = '<option value="">No repositories loaded</option>';
      return;
    }
    const options = ['<option value="">Select a repository</option>'];
    for (const repo of repos) {
      const selected = repo.full_name === savedRepo ? " selected" : "";
      options.push(`<option value="${escapeHtml(repo.full_name)}"${selected}>${escapeHtml(repo.full_name)}</option>`);
    }
    elements.robotRepoSelect.innerHTML = options.join("");
  }

  function updateSourceMeta() {
    const mode = getSourceMode();
    const repoValue = currentRepoValue();
    const folderValue = currentFolderValue();
    const source = currentSourcePayload();

    if (elements.robotSourceBadge) {
      elements.robotSourceBadge.textContent = source ? `Source: ${source.repoFullName ? "repo" : "folder"}` : "Source: none";
    }

    if (elements.robotRepoMeta) {
      if (!source) {
        elements.robotRepoMeta.textContent =
          "Select a repo or open any local folder to build a robot graph from real source evidence.";
      } else if (mode === "folder" && folderValue) {
        elements.robotRepoMeta.textContent = `${folderValue} • local folder source`;
      } else if (repoValue) {
        elements.robotRepoMeta.textContent = `${repoValue} • GitHub repo source`;
      }
    }
  }

  function renderSummaryGrid() {
    if (!elements.robotSummaryGrid) return;
    const workspace = activeWorkspace();
    const summary = activeSummary();
    const componentCounts = new Map();
    for (const node of workspace.graph?.nodes || []) {
      const key = node.componentLabel || "Unknown";
      componentCounts.set(key, (componentCounts.get(key) || 0) + 1);
    }
    const componentSummary = Array.from(componentCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([label, count]) => `${label}: ${count}`)
      .join(" • ");

    const cards = [
      ["Nodes", summary.nodeCount ?? 0],
      ["Edges", summary.edgeCount ?? 0],
      ["Open Requirements", summary.openRequirementCount ?? 0],
      ["Planner Runs", summary.plannerRuns ?? 0],
      ["Verifier Runs", summary.verifierRuns ?? 0],
      ["Components", componentSummary || "None yet"]
    ];

    elements.robotSummaryGrid.innerHTML = cards
      .map(
        ([label, value]) => `<div class="robot-stat"><div class="robot-stat-label">${escapeHtml(
          label
        )}</div><div class="robot-stat-value">${escapeHtml(String(value))}</div></div>`
      )
      .join("");
  }

  function renderMissionBoard() {
    if (!elements.robotMissionBoard) return;
    const board = activeWorkspace().runs?.planner?.[0];
    if (!board) {
      elements.robotMissionBoard.innerHTML =
        '<div class="robot-board-card"><p class="muted">Plan a mission to generate phases, blockers, verification gates, and assignable tasks.</p></div>';
      return;
    }

    const phases = (board.phases || [])
      .map(
        (phase) => `<div class="robot-detail-card">
          <p class="robot-board-eyebrow">${escapeHtml(phase.name || "Phase")}</p>
          <h4>${escapeHtml(phase.outcome || "Outcome pending")}</h4>
          <ul class="robot-check-list">${(phase.steps || [])
            .map((step) => `<li>${escapeHtml(step)}</li>`)
            .join("")}</ul>
          <p class="robot-board-foot">Verification gate: ${escapeHtml(phase.verificationGate || "None")}</p>
        </div>`
      )
      .join("");

    const blockers = (board.blockers || []).length
      ? `<div class="robot-pill-row">${board.blockers
          .map((blocker) => `<span class="robot-pill robot-pill-warn">${escapeHtml(blocker)}</span>`)
          .join("")}</div>`
      : '<p class="robot-board-foot">No blockers recorded.</p>';

    elements.robotMissionBoard.innerHTML = `
      <div class="robot-board-card">
        <p class="robot-board-eyebrow">MISSION</p>
        <h4>${escapeHtml(board.objective || "Mission")}</h4>
        <p>${escapeHtml(board.summary || "Mission board generated from the active graph.")}</p>
        ${blockers}
        <p class="robot-board-foot">Updated ${escapeHtml(formatTimestamp(board.createdAt))}</p>
      </div>
      ${phases}
    `;
  }

  function renderRequirementList() {
    if (!elements.robotRequirementList) return;
    const requirements = activeWorkspace().requirements || [];
    if (!requirements.find((item) => item.id === activeRequirementId)) {
      activeRequirementId = requirements[0]?.id || "";
    }
    if (!requirements.length) {
      elements.robotRequirementList.innerHTML =
        '<div class="robot-list-card"><p class="muted">No requirements yet. Add one directly or let the planner create them from the mission.</p></div>';
      return;
    }

    elements.robotRequirementList.innerHTML = requirements
      .map((requirement) => {
        const activeClass = requirement.id === activeRequirementId ? " active" : "";
        const optionCount = (requirement.options || []).length;
        const statusClass = requirement.status === "resolved" ? "robot-pill-success" :
                           requirement.status === "options_ready" ? "robot-pill-warn" : "";
        const statusLabel = requirement.status === "resolved" ? "RESOLVED" :
                           requirement.status === "options_ready" ? `${optionCount} OPTIONS` :
                           "OPEN";
        return `<article class="robot-list-card${activeClass}" data-requirement-id="${escapeHtml(requirement.id)}">
          <div class="robot-requirement-header">
            <span class="robot-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
            <button type="button" class="robot-delete-btn" data-delete-requirement="${escapeHtml(requirement.id)}" title="Delete requirement">×</button>
          </div>
          <h4>${escapeHtml(requirement.title)}</h4>
          <p>${escapeHtml(requirement.description || "")}</p>
          <p class="robot-discovery-meta">Source: ${escapeHtml(requirement.source || "user")}</p>
          <div class="actions mt-3">
            <button type="button" data-discover-requirement="${escapeHtml(requirement.id)}">${optionCount ? "Refresh Options" : "Discover Options"}</button>
            ${optionCount ? `<button type="button" class="secondary-action" data-focus-requirement="${escapeHtml(requirement.id)}">View ${optionCount} Options</button>` : ""}
          </div>
        </article>`;
      })
      .join("");
  }

  function renderOptionList() {
    if (!elements.robotOptionList) return;
    const requirements = activeWorkspace().requirements || [];
    const requirement =
      requirements.find((item) => item.id === activeRequirementId) || requirements[0] || null;
    if (!requirement) {
      elements.robotOptionList.innerHTML =
        '<div class="robot-option-card"><p class="muted">Select or create a requirement to inspect ranked part options.</p></div>';
      return;
    }
    activeRequirementId = requirement.id;

    if (!(requirement.options || []).length) {
      elements.robotOptionList.innerHTML = `
        <div class="robot-option-card">
          <h4>${escapeHtml(requirement.title)}</h4>
          <p>${escapeHtml(requirement.description || "")}</p>
          <p class="robot-discovery-meta">No ranked options yet.</p>
          <div class="actions mt-3">
            <button type="button" data-discover-requirement="${escapeHtml(requirement.id)}">Discover Options</button>
          </div>
        </div>
      `;
      return;
    }

    // Header showing current requirement
    let headerHtml = `
      <div class="robot-option-header">
        <div>
          <p class="robot-board-eyebrow">VIEWING OPTIONS FOR</p>
          <h4>${escapeHtml(requirement.title)}</h4>
        </div>
        ${requirement.status === "resolved" ? `
          <button type="button" class="danger-outline" data-deselect-requirement="${escapeHtml(requirement.id)}">Unbind Selection</button>
        ` : ""}
      </div>
    `;

    elements.robotOptionList.innerHTML = headerHtml + requirement.options
      .map((option, index) => {
        const selectedClass = option.selected ? " selected" : "";
        const isPdf = option.url && (option.url.toLowerCase().endsWith(".pdf") || option.isPdf);
        const scoreDisplay = option.score !== undefined ? `${Math.round(option.score * 100)}%` : "—";
        const scoreClass = option.score >= 0.8 ? "score-high" : option.score >= 0.5 ? "score-mid" : "score-low";

        return `<article class="robot-option-card${selectedClass}">
          <div class="robot-option-top">
            <span class="robot-option-rank">#${index + 1}</span>
            <span class="robot-option-score ${scoreClass}">${escapeHtml(scoreDisplay)} match</span>
            ${option.selected ? '<span class="robot-pill robot-pill-success">SELECTED</span>' : ""}
          </div>
          <h4>${escapeHtml(option.title)}</h4>
          <p class="robot-option-summary">${escapeHtml(option.fitSummary || option.excerpt || "")}</p>
          ${
            option.url
              ? `<div class="robot-datasheet-link">
                  <a href="${escapeHtml(option.url)}" target="_blank" rel="noreferrer" class="${isPdf ? "datasheet-pdf" : "datasheet-web"}">
                    ${isPdf ? "📄 View Datasheet (PDF)" : "🔗 View Source"}
                  </a>
                </div>`
              : ""
          }
          ${
            (option.interfaces || []).length
              ? `<div class="robot-pill-row">${option.interfaces
                  .map((item) => `<span class="robot-pill">${escapeHtml(item)}</span>`)
                  .join("")}</div>`
              : ""
          }
          ${
            (option.risks || []).length
              ? `<div class="robot-option-risks">
                  <p class="robot-risks-label">Considerations:</p>
                  <ul class="robot-check-list">${option.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>
                </div>`
              : ""
          }
          <div class="actions mt-3">
            ${option.selected
              ? `<button type="button" class="secondary-action" disabled>Currently Selected</button>`
              : `<button type="button" data-select-option="${escapeHtml(option.id)}" data-requirement-id="${escapeHtml(requirement.id)}">Select This Option</button>`
            }
          </div>
        </article>`;
      })
      .join("");
  }

  function renderVerifierRuns() {
    if (!elements.robotVerifierRuns) return;
    const runs = activeWorkspace().runs?.verifier || [];
    if (!runs.length) {
      elements.robotVerifierRuns.innerHTML =
        '<div class="robot-board-card"><p class="muted">Run verifier to inspect source-driven checks, command failures, and port mismatches.</p></div>';
      return;
    }

    elements.robotVerifierRuns.innerHTML = runs
      .slice(0, 4)
      .map(
        (run) => `<article class="robot-board-card">
          <p class="robot-board-eyebrow">VERIFIER RUN</p>
          <h4>${escapeHtml(run.focus || "Automatic source verification")}</h4>
          <p class="robot-board-foot">Started ${escapeHtml(formatTimestamp(run.createdAt))}</p>
          <ul class="robot-check-list">${(run.findings || [])
            .map((finding) => `<li>${escapeHtml(finding.message || `${finding.type || "finding"} recorded`)}</li>`)
            .join("")}</ul>
        </article>`
      )
      .join("");
  }

  function renderTaskSuggestions() {
    if (!elements.robotTaskSuggestions) return;
    const suggestions = activeWorkspace().taskSuggestions || [];
    const members = typeof getTeamMembers === "function" ? getTeamMembers() : [];

    if (!suggestions.length) {
      elements.robotTaskSuggestions.innerHTML =
        '<div class="robot-list-card"><p class="muted">Planner and verifier task suggestions will appear here.</p></div>';
      return;
    }

    elements.robotTaskSuggestions.innerHTML = suggestions
      .map((task) => {
        const assigneeOptions = ['<option value="">Unassigned</option>']
          .concat(
            members.map((member) => {
              const selected = task.recommendedAssigneeUserId === member.user_id ? " selected" : "";
              const label = member.user?.name || member.user?.email || member.user_id;
              return `<option value="${escapeHtml(member.user_id)}"${selected}>${escapeHtml(label)}</option>`;
            })
          )
          .join("");

        return `<article class="robot-list-card">
          <p class="robot-board-eyebrow">${escapeHtml(task.source || "agent")}</p>
          <h4>${escapeHtml(task.title)}</h4>
          <p>${escapeHtml(task.description || "")}</p>
          <p class="robot-discovery-meta">Run ${escapeHtml(task.sourceRunId || "n/a")}</p>
          <div class="robot-inline-form mt-3">
            <select data-task-assignee="${escapeHtml(task.id)}">${assigneeOptions}</select>
            <button type="button" data-save-task="${escapeHtml(task.id)}">Save To Task Log</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderNodeDetail() {
    if (!elements.robotNodeDetail) return;
    const workspace = activeWorkspace();
    const node = (workspace.graph?.nodes || []).find((item) => item.id === selectedNodeId);
    if (!node) {
      const palette = componentPalette()
        .map((component) => {
          const color = componentColor(component.colorToken);
          return `<span class="robot-pill"><span class="robot-swatch" style="background:${color.background};border-color:${color.border};"></span>${escapeHtml(
            component.label
          )}</span>`;
        })
        .join("");
      elements.robotNodeDetail.innerHTML = `
        <div class="robot-detail-card">
          <h4>Component Color Legend</h4>
          <p class="muted">Node colors are driven by the inferred robot subsystem, not just node type.</p>
          <div class="robot-pill-row">${palette || '<span class="robot-pill">No components yet</span>'}</div>
        </div>
      `;
      return;
    }

    const color = componentColor(node.componentColorToken);
    const evidence = (node.evidence || [])
      .slice(0, 5)
      .map(
        (item) => `<li>${escapeHtml(item.title || item.type || "Evidence")} • ${escapeHtml(
          item.source || item.url || ""
        )}</li>`
      )
      .join("");
    const badges = (node.badges || [])
      .map((badge) => `<span class="robot-pill">${escapeHtml(badge)}</span>`)
      .join("");
    const interfaces = (node.interfaces || [])
      .map((item) => `<span class="robot-pill">${escapeHtml(item)}</span>`)
      .join("");
    const ports = (node.ports || [])
      .map((item) => `<span class="robot-pill">${escapeHtml(item.name || item)}</span>`)
      .join("");
    const componentOptions = componentPalette()
      .map((component) => {
        const selected = component.id === node.componentId ? " selected" : "";
        return `<option value="${escapeHtml(component.id)}"${selected}>${escapeHtml(component.label)}</option>`;
      })
      .join("");

    elements.robotNodeDetail.innerHTML = `
      <article class="robot-detail-card">
        <p class="robot-board-eyebrow">NODE</p>
        <h4>${escapeHtml(node.label || node.id)}</h4>
        <p>${escapeHtml(node.description || "No description recorded.")}</p>
        <div class="robot-pill-row">
          <span class="robot-pill"><span class="robot-swatch" style="background:${color.background};border-color:${color.border};"></span>${escapeHtml(
            node.componentLabel || "Unknown"
          )}</span>
          <span class="robot-pill">${escapeHtml(node.kind || "node")}</span>
          <span class="robot-pill">${escapeHtml(node.status || "known")}</span>
        </div>
        <h5>Component Ownership</h5>
        <p class="muted">Belongs to <strong>${escapeHtml(node.componentLabel || "Unknown")}</strong> • ${escapeHtml(
          node.componentReason || "No component rationale recorded."
        )}</p>
        <p class="robot-node-meta">Assignment source: ${escapeHtml(node.componentSource || "heuristic")}</p>
        <div class="robot-inline-form mt-3">
          <select data-node-component-select="${escapeHtml(node.id)}">${componentOptions}</select>
          <button type="button" data-save-node-component="${escapeHtml(node.id)}">Update Component</button>
        </div>
        <h5>Collected From</h5>
        <div class="robot-pill-row">${badges || '<span class="robot-pill">No badges</span>'}</div>
        <h5>Interfaces</h5>
        <div class="robot-pill-row">${interfaces || '<span class="robot-pill">No interfaces</span>'}</div>
        <h5>Ports</h5>
        <div class="robot-pill-row">${ports || '<span class="robot-pill">No ports</span>'}</div>
        <h5>Evidence</h5>
        <ul class="robot-check-list">${evidence || "<li>No evidence recorded.</li>"}</ul>
      </article>
    `;
  }

  function renderGeneratedFiles() {
    const container = document.getElementById("robot-generated-files");
    if (!container) return;

    const workspace = activeWorkspace();
    const bindings = workspace.selectedOptionBindings || [];
    const source = currentSourcePayload();

    if (!bindings.length) {
      container.innerHTML = `
        <p class="muted">Select parts from the requirement queue to generate robot config files.</p>
        <div class="robot-demo-card" style="margin-top: 12px;">
          <p class="muted" style="font-size: 11px;">When you select a part:</p>
          <ul style="margin-top: 8px; font-size: 12px; color: var(--color-slate-300);">
            <li>• robot-parts.json is generated</li>
            <li>• robot.config.json is updated</li>
            <li>• Files are written to your workspace</li>
          </ul>
        </div>
      `;
      return;
    }

    // Show generated files and selected parts
    const targetPath = source?.sourcePath || (source?.repoFullName ? `~/.forge-rde/robot-workspaces/exports/${source.repoFullName.replace("/", "_")}` : "workspace");

    let html = `
      <div class="robot-demo-card" style="margin-bottom: 12px;">
        <h4 style="margin: 0; color: var(--color-emerald-300);">Files Generated</h4>
        <p class="muted" style="font-size: 11px; margin-top: 4px;">Written to: ${escapeHtml(targetPath)}</p>
        <div style="margin-top: 12px; display: grid; gap: 8px;">
          <div class="robot-file-item" data-view-file="robot-parts.json">
            <span style="color: var(--color-sky-300);">robot-parts.json</span>
            <span class="muted" style="font-size: 11px;">${bindings.length} part${bindings.length > 1 ? "s" : ""}</span>
          </div>
          <div class="robot-file-item" data-view-file="robot.config.json">
            <span style="color: var(--color-sky-300);">robot.config.json</span>
            <span class="muted" style="font-size: 11px;">Connection & setup</span>
          </div>
        </div>
        <button type="button" id="robot-view-files-btn" style="margin-top: 12px; width: 100%;">View Generated Files</button>
      </div>
      <h4 style="margin: 16px 0 8px 0; font-size: 14px;">Selected Parts</h4>
    `;

    for (const binding of bindings) {
      const requirement = workspace.requirements?.find((r) => r.id === binding.requirementId);
      const option = requirement?.options?.find((o) => o.id === binding.optionId);
      html += `
        <div class="robot-demo-card" style="margin-bottom: 8px;">
          <p style="margin: 0; font-size: 12px; color: var(--color-slate-200);">${escapeHtml(binding.title || option?.title || "Part")}</p>
          <p class="muted" style="font-size: 11px; margin-top: 4px;">For: ${escapeHtml(requirement?.title || "requirement")}</p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Attach view files button handler
    const viewFilesBtn = document.getElementById("robot-view-files-btn");
    if (viewFilesBtn) {
      viewFilesBtn.addEventListener("click", () => viewGeneratedFiles());
    }
  }

  async function viewGeneratedFiles() {
    const source = currentSourcePayload();
    if (!source) {
      setStatus("No workspace selected", true);
      return;
    }

    try {
      setStatus("Loading generated files...");
      const query = source.sourcePath
        ? `sourcePath=${encodeURIComponent(source.sourcePath)}`
        : `repoFullName=${encodeURIComponent(source.repoFullName)}`;

      const data = await apiJson(`/api/robot/generated-files?${query}`);

      if (!data.hasFiles) {
        setStatus("No files generated yet. Select a part first.", true);
        return;
      }

      // Show modal with file contents
      showGeneratedFilesModal(data);
      setStatus("Generated files loaded");
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function showGeneratedFilesModal(data) {
    // Remove existing modal if any
    const existingModal = document.getElementById("robot-files-modal");
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement("div");
    modal.id = "robot-files-modal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal="true"></div>
      <div class="modal-card" style="max-width: 800px; max-height: 80vh; overflow: auto;">
        <div class="modal-title-row">
          <h3>Generated Files</h3>
          <button type="button" data-close-modal="true" class="secondary-action">Close</button>
        </div>
        <p class="muted" style="margin-top: 8px;">These files were written to: ${escapeHtml(data.targetPath)}</p>

        <div style="margin-top: 24px;">
          <h4 style="color: var(--color-sky-300);">robot-parts.json</h4>
          <pre class="output" style="margin-top: 8px; max-height: 300px; overflow: auto;">${
            data.files["robot-parts.json"]
              ? escapeHtml(JSON.stringify(data.files["robot-parts.json"], null, 2))
              : '<span class="muted">File not generated yet</span>'
          }</pre>
        </div>

        <div style="margin-top: 24px;">
          <h4 style="color: var(--color-sky-300);">robot.config.json</h4>
          <pre class="output" style="margin-top: 8px; max-height: 300px; overflow: auto;">${
            data.files["robot.config.json"]
              ? escapeHtml(JSON.stringify(data.files["robot.config.json"], null, 2))
              : '<span class="muted">File not generated yet</span>'
          }</pre>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 12px;">
          <button type="button" id="robot-copy-config-btn">Copy robot.config.json</button>
          <button type="button" class="secondary-action" data-close-modal="true">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close modal handlers
    modal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
        modal.remove();
      }
    });

    // Copy config button
    const copyBtn = modal.querySelector("#robot-copy-config-btn");
    if (copyBtn && data.files["robot.config.json"]) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(JSON.stringify(data.files["robot.config.json"], null, 2));
        setStatus("robot.config.json copied to clipboard");
      });
    }
  }

  function rememberGraphState() {
    if (!graphNetwork) return;
    try {
      graphView = {
        position: graphNetwork.getViewPosition(),
        scale: graphNetwork.getScale()
      };
      graphPositions = graphNetwork.getPositions();
    } catch {
      graphView = null;
      graphPositions = {};
    }
  }

  async function renderGraph() {
    if (!elements.robotGraphMount) return;
    const workspace = activeWorkspace();
    const nodes = workspace.graph?.nodes || [];
    const edges = workspace.graph?.edges || [];

    rememberGraphState();

    if (graphNetwork) {
      graphNetwork.destroy();
      graphNetwork = null;
    }

    if (!nodes.length) {
      elements.robotGraphMount.innerHTML = `
        <div class="robot-graph-empty">
          <h3>Empty Robot Graph</h3>
          <p>Select a repo or folder, then sync the workspace to infer robot components and source relationships.</p>
        </div>
      `;
      return;
    }

    const visLoaded = await ensureVisNetworkLoaded();
    if (!visLoaded || !window.vis?.Network) {
      elements.robotGraphMount.innerHTML =
        '<div class="robot-graph-empty"><p>Could not load the graph renderer.</p></div>';
      return;
    }
    elements.robotGraphMount.innerHTML = "";

    const nodeIds = new Set(nodes.map((node) => node.id));
    const hasNewNodes = nodes.some((node) => !(node.id in graphPositions));
    const visNodes = nodes.map((node) => {
      const color = componentColor(node.componentColorToken);
      const position = graphPositions[node.id] || null;
      return {
        id: node.id,
        label: wrapText(node.label || node.id, 18, 4),
        title: nodeTooltip(node),
        shape: "box",
        margin: 12,
        widthConstraint: { maximum: 220 },
        font: { color: color.text, multi: "md", face: "ui-sans-serif", size: 15 },
        color: {
          background: color.background,
          border: color.border,
          highlight: { background: color.background, border: "#f8fafc" },
          hover: { background: color.background, border: "#f8fafc" }
        },
        x: position?.x,
        y: position?.y
      };
    });

    const visEdges = edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({
        id: `${edge.from}:${edge.to}:${edge.label || ""}`,
        from: edge.from,
        to: edge.to,
        label: wrapText(edge.label || "", 14, 2),
        color: { color: "#475569", highlight: "#cbd5e1" },
        font: { color: "#cbd5e1", strokeWidth: 0, size: 11, align: "middle" },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        smooth: { type: "dynamic" }
      }));

    const physicsEnabled = !graphHasFitted || hasNewNodes;

    graphNetwork = new window.vis.Network(
      elements.robotGraphMount,
      { nodes: visNodes, edges: visEdges },
      {
        autoResize: true,
        interaction: {
          hover: true,
          keyboard: true,
          navigationButtons: true,
          tooltipDelay: 200,
          zoomSpeed: 0.8,
          dragView: true
        },
        layout: {
          improvedLayout: true,
          randomSeed: 12
        },
        nodes: {
          borderWidth: 2,
          borderWidthSelected: 3,
          shadow: {
            enabled: true,
            color: "rgba(15, 23, 42, 0.55)",
            size: 20,
            x: 0,
            y: 12
          },
          scaling: {
            label: { enabled: true, min: 12, max: 18 }
          },
          chosen: {
            node: (values, id, selected, hovering) => {
              if (hovering || selected) {
                values.shadowSize = 28;
                values.borderWidth = 3;
              }
            }
          }
        },
        edges: {
          width: 1.5,
          hoverWidth: 2.5,
          selectionWidth: 2.5,
          smooth: {
            type: "continuous",
            roundness: 0.5
          }
        },
        physics: {
          enabled: physicsEnabled,
          solver: "forceAtlas2Based",
          stabilization: {
            enabled: true,
            iterations: graphHasFitted ? 120 : 250,
            fit: !graphHasFitted,
            updateInterval: 25
          },
          forceAtlas2Based: {
            gravitationalConstant: -50,
            centralGravity: 0.008,
            springLength: 160,
            springConstant: 0.06,
            damping: 0.5
          },
          minVelocity: 0.5,
          maxVelocity: 35
        }
      }
    );

    graphNetwork.on("selectNode", (params) => {
      selectedNodeId = params.nodes[0] || "";
      if (isRequirementNodeId(selectedNodeId)) {
        activeRequirementId = requirementIdFromNodeId(selectedNodeId);
      }
      const optionRequirementId = requirementIdFromOptionNodeId(selectedNodeId);
      if (optionRequirementId) {
        activeRequirementId = optionRequirementId;
      }
      renderNodeDetail();
      renderOptionList();
    });

    graphNetwork.on("deselectNode", () => {
      selectedNodeId = "";
      renderNodeDetail();
    });

    const restoreView = () => {
      graphNetwork?.setOptions({ physics: false });
      graphHasFitted = true;
      if (graphView?.position) {
        graphNetwork?.moveTo({
          position: graphView.position,
          scale: graphView.scale || 1,
          animation: {
            duration: 400,
            easingFunction: "easeOutQuad"
          }
        });
      } else {
        graphNetwork?.fit({
          animation: {
            duration: 600,
            easingFunction: "easeOutCubic"
          }
        });
      }
    };

    if (physicsEnabled) {
      graphNetwork.once("stabilizationIterationsDone", restoreView);
    } else {
      requestAnimationFrame(restoreView);
    }

    if (selectedNodeId && nodeIds.has(selectedNodeId)) {
      requestAnimationFrame(() => {
        graphNetwork?.selectNodes([selectedNodeId]);
      });
    }
  }

  async function applyWorkspaceResponse(nextResponse) {
    workspaceResponse = nextResponse;
    const summary = activeSummary();
    const source = workspaceResponse?.source || activeWorkspace().metadata?.source || null;

    if (elements.robotGraphRevision) {
      elements.robotGraphRevision.textContent = `Revision: ${summary.revision ?? 0}`;
    }
    if (elements.robotGraphMeta) {
      elements.robotGraphMeta.textContent = source
        ? `${source.label} • ${source.type} • Updated ${formatTimestamp(summary.updatedAt)}`
        : "No active source";
    }

    renderSummaryGrid();
    renderMissionBoard();
    renderRequirementList();
    renderOptionList();
    renderVerifierRuns();
    renderTaskSuggestions();
    renderNodeDetail();
    renderGeneratedFiles();
    await renderGraph();

    // Notify about discovered robot components
    notifyComponentsDiscovered(activeWorkspace());
  }

  async function loadWorkspace() {
    const source = currentSourcePayload();
    updateSourceMeta();
    if (!source) {
      workspaceResponse = null;
      selectedNodeId = "";
      activeRequirementId = "";
      graphHasFitted = false;
      graphView = null;
      graphPositions = {};
      await applyWorkspaceResponse({
        workspace: {
          graph: { nodes: [], edges: [] },
          requirements: [],
          taskSuggestions: [],
          runs: { planner: [], verifier: [] },
          metadata: { emptyState: true }
        },
        summary: {
          nodeCount: 0,
          edgeCount: 0,
          openRequirementCount: 0,
          plannerRuns: 0,
          verifierRuns: 0,
          revision: 0,
          updatedAt: ""
        },
        componentPalette: []
      });
      return;
    }
    const query = source.repoFullName
      ? `repoFullName=${encodeURIComponent(source.repoFullName)}`
      : `sourcePath=${encodeURIComponent(source.sourcePath)}`;
    const data = await apiJson(`/api/robot/workspace?${query}`);
    await applyWorkspaceResponse(data);
  }

  async function syncWorkspace() {
    const source = currentSourcePayload();
    if (!source) {
      throw new Error("Select a repo or folder before syncing the robot workspace.");
    }
    const data = await apiJson("/api/robot/workspace/sync", {
      method: "POST",
      body: JSON.stringify(source)
    });
    await applyWorkspaceResponse(data);
  }

  async function runPlanner() {
    const source = currentSourcePayload();
    const objective = String(elements.robotObjectiveInput?.value || "").trim();
    if (!source) throw new Error("Select a repo or folder first.");
    if (!objective) throw new Error("Mission objective is required.");
    const data = await apiJson("/api/robot/planner/run", {
      method: "POST",
      body: JSON.stringify({
        ...source,
        objective
      })
    });
    await applyWorkspaceResponse(data);
  }

  async function createRequirement() {
    const source = currentSourcePayload();
    const title = String(elements.robotRequirementTitleInput?.value || "").trim();
    const description = String(elements.robotRequirementDescriptionInput?.value || "").trim();
    if (!source) throw new Error("Select a repo or folder first.");
    if (!title && !description) throw new Error("Enter a requirement title or description.");
    const data = await apiJson("/api/robot/requirements", {
      method: "POST",
      body: JSON.stringify({
        ...source,
        title: title || description,
        description,
        capability: `${title} ${description}`.trim()
      })
    });
    activeRequirementId = data.requirement?.id || activeRequirementId;
    await applyWorkspaceResponse(data);
  }

  async function discoverRequirement(requirementId) {
    const source = currentSourcePayload();
    if (!source) throw new Error("Select a repo or folder first.");
    const data = await apiJson(`/api/robot/requirements/${encodeURIComponent(requirementId)}/discover`, {
      method: "POST",
      body: JSON.stringify(source)
    });
    activeRequirementId = requirementId;
    await applyWorkspaceResponse(data);
  }

  async function selectOption(requirementId, optionId) {
    const source = currentSourcePayload();
    if (!source) throw new Error("Select a repo or folder first.");
    const data = await apiJson(`/api/robot/requirements/${encodeURIComponent(requirementId)}/select`, {
      method: "POST",
      body: JSON.stringify({
        ...source,
        optionId
      })
    });
    activeRequirementId = requirementId;
    await applyWorkspaceResponse(data);

    // Return whether files were written (agentic action)
    return {
      filesWritten: data.filesWritten || false,
      optionTitle: data.option?.title || "part"
    };
  }

  async function deselectOption(requirementId) {
    const source = currentSourcePayload();
    if (!source) throw new Error("Select a repo or folder first.");
    const data = await apiJson(`/api/robot/requirements/${encodeURIComponent(requirementId)}/deselect`, {
      method: "POST",
      body: JSON.stringify(source)
    });
    activeRequirementId = requirementId;
    await applyWorkspaceResponse(data);
  }

  async function deleteRequirement(requirementId) {
    const source = currentSourcePayload();
    if (!source) throw new Error("Select a repo or folder first.");
    const data = await apiJson(`/api/robot/requirements/${encodeURIComponent(requirementId)}`, {
      method: "DELETE",
      body: JSON.stringify(source)
    });
    if (activeRequirementId === requirementId) {
      activeRequirementId = "";
    }
    await applyWorkspaceResponse(data);
  }

  async function runVerifier() {
    const source = currentSourcePayload();
    const focus = String(elements.robotObservationsInput?.value || "").trim();
    if (!source) throw new Error("Select a repo or folder first.");
    const data = await apiJson("/api/robot/verifier/run", {
      method: "POST",
      body: JSON.stringify({
        ...source,
        focus,
        manualInstructions: focus
      })
    });
    await applyWorkspaceResponse(data);
  }

  async function updateNodeComponent(nodeId) {
    const source = currentSourcePayload();
    if (!source) throw new Error("Select a repo or folder first.");
    const select = elements.robotNodeDetail?.querySelector(`[data-node-component-select="${CSS.escape(nodeId)}"]`);
    const componentId = String(select?.value || "").trim();
    if (!componentId) throw new Error("Select a component first.");
    const data = await apiJson(`/api/robot/nodes/${encodeURIComponent(nodeId)}/component`, {
      method: "POST",
      body: JSON.stringify({
        ...source,
        componentId
      })
    });
    selectedNodeId = nodeId;
    await applyWorkspaceResponse(data);
  }

  async function saveSuggestedTask(taskId, assigneeUserId) {
    const task = (activeWorkspace().taskSuggestions || []).find((item) => item.id === taskId);
    if (!task) throw new Error("Task suggestion not found.");
    await saveTaskToLog({
      title: task.title,
      assigneeUserId
    });
  }

  if (elements.robotRepoSelect) {
    elements.robotRepoSelect.addEventListener("change", () => {
      const repoFullName = String(elements.robotRepoSelect.value || "");
      localStorage.setItem("forge_selected_robot_repo", repoFullName);
      if (repoFullName) {
        setSourceMode("repo");
      }
      updateSourceMeta();
      loadWorkspace().catch((error) => setStatus(error.message, true));
    });
  }

  if (elements.robotOpenFolderButton) {
    elements.robotOpenFolderButton.addEventListener("click", async () => {
      const result = await window.forgeAPI.openFolder();
      if (!result || result.canceled || !result.path) return;
      localStorage.setItem("forge_selected_robot_folder", result.path);
      setSourceMode("folder");
      updateSourceMeta();
      try {
        setStatus("Syncing robot workspace from folder...");
        await syncWorkspace();
        const nodeCount = activeWorkspace().graph?.nodes?.length || 0;
        setStatus(`Robot workspace synced - ${nodeCount} components`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.robotRefreshButton) {
    elements.robotRefreshButton.addEventListener("click", async () => {
      try {
        setStatus("Syncing robot workspace...");
        await syncWorkspace();
        const nodeCount = activeWorkspace().graph?.nodes?.length || 0;
        setStatus(`Robot workspace synced - ${nodeCount} components`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }


  if (elements.robotRequirementForm) {
    elements.robotRequirementForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Creating requirement...");
        await createRequirement();
        elements.robotRequirementForm.reset();
        setStatus("Requirement created");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }


  if (elements.robotRequirementList) {
    elements.robotRequirementList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // Delete requirement
      const deleteBtn = target.closest("[data-delete-requirement]");
      if (deleteBtn) {
        const deleteId = String(deleteBtn.dataset.deleteRequirement || "");
        if (!deleteId) return;
        if (!window.confirm("Delete this requirement and all its options?")) return;
        setStatus("Deleting requirement...");
        deleteRequirement(deleteId)
          .then(() => setStatus("Requirement deleted"))
          .catch((error) => setStatus(error.message, true));
        return;
      }

      // Focus on requirement to show options
      const focusBtn = target.closest("[data-focus-requirement]");
      if (focusBtn) {
        const focusId = String(focusBtn.dataset.focusRequirement || "");
        if (!focusId) return;
        activeRequirementId = focusId;
        renderRequirementList();
        renderOptionList();
        // Scroll to the options panel
        const optionPanel = elements.robotOptionList?.closest(".robot-panel");
        if (optionPanel) {
          optionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setStatus("Showing options for requirement");
        return;
      }

      // Discover options
      const discoverBtn = target.closest("[data-discover-requirement]");
      if (discoverBtn) {
        const discoverId = String(discoverBtn.dataset.discoverRequirement || "");
        if (!discoverId) return;
        setStatus("Discovering part options...");
        discoverRequirement(discoverId)
          .then(() => {
            const req = (activeWorkspace().requirements || []).find(r => r.id === discoverId);
            const optCount = req?.options?.length || 0;
            setStatus(`Found ${optCount} part options`);
          })
          .catch((error) => setStatus(error.message, true));
      }
    });
  }

  if (elements.robotOptionList) {
    elements.robotOptionList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // Deselect / unbind option
      const deselectBtn = target.closest("[data-deselect-requirement]");
      if (deselectBtn) {
        const deselectId = String(deselectBtn.dataset.deselectRequirement || "");
        if (!deselectId) return;
        setStatus("Unbinding selected option...");
        deselectOption(deselectId)
          .then(() => setStatus("Option unbound from graph"))
          .catch((error) => setStatus(error.message, true));
        return;
      }

      // Discover options
      const discoverBtn = target.closest("[data-discover-requirement]");
      if (discoverBtn) {
        const discoverId = String(discoverBtn.dataset.discoverRequirement || "");
        if (!discoverId) return;
        setStatus("Discovering part options...");
        discoverRequirement(discoverId)
          .then(() => {
            const req = (activeWorkspace().requirements || []).find(r => r.id === discoverId);
            const optCount = req?.options?.length || 0;
            setStatus(`Found ${optCount} part options`);
          })
          .catch((error) => setStatus(error.message, true));
        return;
      }

      // Select option
      const selectBtn = target.closest("[data-select-option]");
      if (selectBtn) {
        const optionId = String(selectBtn.dataset.selectOption || "");
        const requirementId = String(selectBtn.dataset.requirementId || "");
        if (!optionId || !requirementId) return;
        setStatus("Binding selected option into graph...");
        selectOption(requirementId, optionId)
          .then((result) => {
            if (result.filesWritten) {
              setStatus(`${result.optionTitle} selected - wrote config files`);
            } else {
              setStatus(`${result.optionTitle} bound to graph`);
            }
          })
          .catch((error) => setStatus(error.message, true));
      }
    });
  }

  if (elements.robotNodeDetail) {
    elements.robotNodeDetail.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const nodeId = String(target.dataset.saveNodeComponent || "");
      if (!nodeId) return;
      setStatus("Updating node component...");
      updateNodeComponent(nodeId)
        .then(() => setStatus("Node component updated"))
        .catch((error) => setStatus(error.message, true));
    });
  }

  return {
    setRepos(nextRepos) {
      repos = Array.isArray(nextRepos) ? nextRepos : [];
      renderRepoSelector();
      updateSourceMeta();
    },
    loadWorkspace,
    updateSourceMeta
  };
}
