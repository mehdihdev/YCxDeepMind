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
      hasCamera: false,
      jetsonIp: null,
      armPort: "8765",
      cameraPort: "8766",
      armType: null,
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

      // Detect arm nodes
      if (label.includes("arm") || label.includes("so-100") || label.includes("so100") ||
          label.includes("leader") || label.includes("follower") ||
          componentLabel.includes("arm") || kind === "arm") {
        components.hasArm = true;
        if (label.includes("so-100") || label.includes("so100") || description.includes("so-100")) {
          components.armType = "SO-100";
        } else if (label.includes("lerobot") || description.includes("lerobot")) {
          components.armType = "LeRobot";
        }
      }

      // Detect camera nodes
      if (label.includes("camera") || label.includes("webcam") || label.includes("realsense") ||
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
        return `<article class="robot-list-card${activeClass}" data-requirement-id="${escapeHtml(requirement.id)}">
          <p class="robot-board-eyebrow">${escapeHtml(requirement.status || "open")}</p>
          <h4>${escapeHtml(requirement.title)}</h4>
          <p>${escapeHtml(requirement.description || "")}</p>
          <p class="robot-discovery-meta">Options: ${escapeHtml(String((requirement.options || []).length))} • Source: ${escapeHtml(
            requirement.source || "user"
          )}</p>
          <div class="actions mt-3">
            <button type="button" data-discover-requirement="${escapeHtml(requirement.id)}">Discover Options</button>
            <button type="button" class="secondary-action" data-focus-requirement="${escapeHtml(requirement.id)}">View Options</button>
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

    elements.robotOptionList.innerHTML = requirement.options
      .map((option) => {
        const selectedClass = option.selected ? " selected" : "";
        return `<article class="robot-option-card${selectedClass}">
          <p class="robot-board-eyebrow">${escapeHtml(option.selected ? "SELECTED" : "OPTION")}</p>
          <h4>${escapeHtml(option.title)}</h4>
          <p>${escapeHtml(option.fitSummary || option.excerpt || "")}</p>
          <p class="robot-discovery-meta">Score ${escapeHtml(String(option.score ?? "n/a"))}</p>
          ${
            option.url
              ? `<p class="robot-discovery-meta"><a href="${escapeHtml(option.url)}" target="_blank" rel="noreferrer">Open source / datasheet</a></p>`
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
              ? `<ul class="robot-check-list">${option.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>`
              : ""
          }
          <div class="actions mt-3">
            <button type="button" data-select-option="${escapeHtml(option.id)}" data-requirement-id="${escapeHtml(
              requirement.id
            )}">${option.selected ? "Selected" : "Bind Into Graph"}</button>
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
          navigationButtons: true
        },
        layout: {
          improvedLayout: true,
          randomSeed: 12
        },
        nodes: {
          borderWidth: 2,
          shadow: {
            enabled: true,
            color: "rgba(15, 23, 42, 0.45)",
            size: 18,
            x: 0,
            y: 10
          }
        },
        edges: {
          width: 1.2
        },
        physics: {
          enabled: physicsEnabled,
          solver: "forceAtlas2Based",
          stabilization: {
            enabled: true,
            iterations: graphHasFitted ? 120 : 220,
            fit: !graphHasFitted
          },
          forceAtlas2Based: {
            gravitationalConstant: -42,
            centralGravity: 0.01,
            springLength: 150,
            springConstant: 0.08
          },
          minVelocity: 0.75
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
          animation: false
        });
      } else {
        graphNetwork?.fit({
          animation: {
            duration: 350,
            easingFunction: "easeInOutQuad"
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
        setStatus("Robot workspace synced");
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
        setStatus("Robot workspace synced");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.robotPlanForm) {
    elements.robotPlanForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Planning mission...");
        await runPlanner();
        setStatus("Mission board updated");
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

  if (elements.robotVerifyForm) {
    elements.robotVerifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Running verifier...");
        await runVerifier();
        setStatus("Verifier completed");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.robotRequirementList) {
    elements.robotRequirementList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const focusId = String(target.dataset.focusRequirement || "");
      if (focusId) {
        activeRequirementId = focusId;
        renderRequirementList();
        renderOptionList();
        return;
      }
      const discoverId = String(target.dataset.discoverRequirement || "");
      if (discoverId) {
        setStatus("Discovering part options...");
        discoverRequirement(discoverId)
          .then(() => setStatus("Part options updated"))
          .catch((error) => setStatus(error.message, true));
      }
    });
  }

  if (elements.robotOptionList) {
    elements.robotOptionList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const discoverId = String(target.dataset.discoverRequirement || "");
      if (discoverId) {
        setStatus("Discovering part options...");
        discoverRequirement(discoverId)
          .then(() => setStatus("Part options updated"))
          .catch((error) => setStatus(error.message, true));
        return;
      }
      const optionId = String(target.dataset.selectOption || "");
      const requirementId = String(target.dataset.requirementId || "");
      if (!optionId || !requirementId) return;
      setStatus("Binding selected option into graph...");
      selectOption(requirementId, optionId)
        .then(() => setStatus("Part bound into robot graph"))
        .catch((error) => setStatus(error.message, true));
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

  if (elements.robotTaskSuggestions) {
    elements.robotTaskSuggestions.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const taskId = String(target.dataset.saveTask || "");
      if (!taskId) return;
      const select = elements.robotTaskSuggestions.querySelector(`[data-task-assignee="${CSS.escape(taskId)}"]`);
      const assigneeUserId = String(select?.value || "");
      setStatus("Saving suggested task to Task Log...");
      saveSuggestedTask(taskId, assigneeUserId)
        .then(() => setStatus("Suggested task saved to Task Log"))
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
