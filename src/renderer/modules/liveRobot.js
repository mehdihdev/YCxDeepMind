/**
 * Forge RDE - Live Robot Connection Module
 * Handles WebSocket connections to arm and camera servers on Jetson.
 *
 * IMPORTANT: This module only activates AFTER the robot graph has discovered
 * components. The agent analyzes docs/code/configs first, then this enables.
 */

import { escapeHtml } from "../lib/utils.js";

const JOINT_NAMES = ["base", "shoulder", "elbow", "wrist_pitch", "wrist_roll", "gripper"];

export function createLiveRobotController({ elements, setStatus }) {
  // Discovery state - what components has the agent found?
  let discoveredComponents = {
    hasJetson: false,
    hasArm: false,
    hasCamera: false,
    jetsonIp: null,
    armPort: null,
    cameraPort: null,
    armType: null,
    cameras: []
  };

  // Connection state
  let armSocket = null;
  let cameraSocket = null;
  let armState = { leader: null, follower: null, teleop_enabled: false };
  let recordingState = { active: false, episodes: 0, frames: [] };
  let recordingInterval = null;

  // Get saved connection info
  function getSavedConnection() {
    return {
      ip: localStorage.getItem("forge_jetson_ip") || "",
      armPort: localStorage.getItem("forge_arm_port") || "8765",
      cameraPort: localStorage.getItem("forge_camera_port") || "8766"
    };
  }

  // Save connection info
  function saveConnection(ip, armPort, cameraPort) {
    localStorage.setItem("forge_jetson_ip", ip);
    localStorage.setItem("forge_arm_port", armPort);
    localStorage.setItem("forge_camera_port", cameraPort);
  }

  // Show/hide panels based on discovery state
  function updatePanelVisibility() {
    const livePanel = document.getElementById("robot-live-panel");
    const demoPanel = document.getElementById("robot-demo-panel");
    const armPanel = document.getElementById("robot-arm-panel");
    const cameraPanel = document.getElementById("robot-camera-panel");

    const hasComponents = discoveredComponents.hasJetson ||
                          discoveredComponents.hasArm ||
                          discoveredComponents.hasCamera;

    // Show connection panel only if we discovered connectable components
    if (livePanel) {
      livePanel.classList.toggle("hidden", !hasComponents);
    }

    // Demo panel shows when connected
    const isConnected = armSocket && armSocket.readyState === WebSocket.OPEN;
    if (demoPanel) {
      demoPanel.classList.toggle("hidden", !isConnected);
    }
    if (armPanel) {
      armPanel.classList.toggle("hidden", !isConnected || !discoveredComponents.hasArm);
    }
    if (cameraPanel) {
      cameraPanel.classList.toggle("hidden", !isConnected || !discoveredComponents.hasCamera);
    }
  }

  // Render discovered components
  function renderDiscoveredComponents() {
    const container = document.getElementById("robot-discovered-components");
    if (!container) return;

    const hasAny = discoveredComponents.hasJetson ||
                   discoveredComponents.hasArm ||
                   discoveredComponents.hasCamera;

    if (!hasAny) {
      container.innerHTML = `
        <p class="muted">Sync a workspace to discover robot components. The agent will analyze your docs, code, and configs to identify what hardware you have.</p>
        <div class="robot-demo-card" style="margin-top: 12px;">
          <p class="muted" style="font-size: 11px;">Try pointing to:</p>
          <ul style="margin-top: 8px; font-size: 12px; color: var(--color-slate-300);">
            <li>• A folder with robot.config.json</li>
            <li>• A repo with arm_server.py</li>
            <li>• Docs, datasheets, or code files</li>
          </ul>
        </div>
      `;
      return;
    }

    let html = '<div class="robot-demo-grid">';

    if (discoveredComponents.hasJetson) {
      html += `
        <div class="robot-demo-card">
          <h4>🖥️ Jetson Controller</h4>
          <p class="muted">${escapeHtml(discoveredComponents.jetsonIp || "IP not configured")}</p>
        </div>
      `;
    }

    if (discoveredComponents.hasArm) {
      html += `
        <div class="robot-demo-card">
          <h4>🦾 Robot Arm</h4>
          <p class="muted">${escapeHtml(discoveredComponents.armType || "LeRobot SO-100")}</p>
          <p class="muted" style="font-size: 11px;">Leader + Follower setup</p>
        </div>
      `;
    }

    if (discoveredComponents.hasCamera) {
      const camCount = discoveredComponents.cameras?.length || 1;
      html += `
        <div class="robot-demo-card">
          <h4>📷 Camera${camCount > 1 ? 's' : ''}</h4>
          <p class="muted">${camCount} camera${camCount > 1 ? 's' : ''} configured</p>
        </div>
      `;
    }

    html += '</div>';
    html += `<p class="muted" style="margin-top: 12px; font-size: 11px;">Components discovered from workspace analysis</p>`;

    container.innerHTML = html;
  }

  // Called when robot graph discovers components (from workspace sync)
  function onComponentsDiscovered(components) {
    const hasAny = components.hasJetson || components.hasArm || components.hasCamera;

    discoveredComponents = {
      hasJetson: components.hasJetson || false,
      hasArm: components.hasArm || false,
      hasCamera: components.hasCamera || false,
      jetsonIp: components.jetsonIp || null,
      armPort: components.armPort || "8765",
      cameraPort: components.cameraPort || "8766",
      armType: components.armType || null,
      cameras: components.cameras || []
    };

    // Auto-fill connection form with discovered values (only if we have components)
    if (hasAny) {
      if (discoveredComponents.jetsonIp && elements.robotJetsonIp) {
        elements.robotJetsonIp.value = discoveredComponents.jetsonIp;
      }
      if (discoveredComponents.armPort && elements.robotArmPort) {
        elements.robotArmPort.value = discoveredComponents.armPort;
      }
      if (discoveredComponents.cameraPort && elements.robotCameraPort) {
        elements.robotCameraPort.value = discoveredComponents.cameraPort;
      }
    }

    renderDiscoveredComponents();
    updatePanelVisibility();
    updateBenchVisibility();
  }

  // Show/hide bench based on discovered components
  function updateBenchVisibility() {
    const benchEmptyState = document.getElementById("bench-empty-state");
    const benchIframe = document.getElementById("bench-iframe");

    const hasComponents = discoveredComponents.hasArm || discoveredComponents.hasJetson;

    if (benchEmptyState) {
      benchEmptyState.style.display = hasComponents ? "none" : "flex";
    }

    if (benchIframe) {
      if (hasComponents) {
        // Build URL with workspace configuration
        const config = {
          armType: discoveredComponents.armType || "so100",
          joints: "6",
          ip: discoveredComponents.jetsonIp || "",
          armPort: discoveredComponents.armPort || "8765",
          cameraPort: discoveredComponents.cameraPort || "8766"
        };
        const params = new URLSearchParams(config);
        const targetUrl = `/bench/?${params.toString()}`;

        // Only reload if URL changed (prevents unnecessary refreshes)
        if (benchIframe.src === "about:blank" || !benchIframe.src.includes(params.toString())) {
          benchIframe.src = targetUrl;
        }
        benchIframe.style.display = "block";
      } else {
        // Reset iframe to blank when no components
        benchIframe.src = "about:blank";
        benchIframe.style.display = "none";
      }
    }
  }

  // Initialize form with saved values
  function initializeForm() {
    const saved = getSavedConnection();
    if (elements.robotJetsonIp) elements.robotJetsonIp.value = saved.ip;
    if (elements.robotArmPort) elements.robotArmPort.value = saved.armPort;
    if (elements.robotCameraPort) elements.robotCameraPort.value = saved.cameraPort;
  }

  // Update connection status UI
  function updateConnectionStatus(server, status) {
    const dotId = server === "arm" ? "robotArmStatusDot" : "robotCameraStatusDot";
    const textId = server === "arm" ? "robotArmStatus" : "robotCameraStatus";

    const dot = elements[dotId] || document.getElementById(`robot-${server}-status-dot`);
    const text = elements[textId] || document.getElementById(`robot-${server}-status`);

    if (dot) {
      dot.className = `robot-status-dot ${status}`;
    }
    if (text) {
      const labels = {
        disconnected: "Disconnected",
        connecting: "Connecting...",
        connected: "Connected",
        error: "Error"
      };
      text.textContent = labels[status] || status;
    }
  }

  // Render arm state
  function renderArmState() {
    const container = elements.robotArmState || document.getElementById("robot-arm-state");
    if (!container) return;

    if (!armState.leader && !armState.follower) {
      container.innerHTML = '<p class="muted">Connect to see live joint positions</p>';
      return;
    }

    const rows = JOINT_NAMES.map((name, i) => {
      const leaderPos = armState.leader?.positions?.[i];
      const followerPos = armState.follower?.positions?.[i];

      return `
        <div class="robot-joint-row">
          <span class="robot-joint-name">${escapeHtml(name)}</span>
          <div class="robot-joint-values">
            <span class="robot-joint-value leader" title="Leader">
              L: ${leaderPos !== undefined ? leaderPos.toFixed(1) : "--"}°
            </span>
            <span class="robot-joint-value follower" title="Follower">
              F: ${followerPos !== undefined ? followerPos.toFixed(1) : "--"}°
            </span>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = rows;
  }

  // Render camera feed
  function renderCameraFrame(base64Data) {
    const container = elements.robotCameraPreview || document.getElementById("robot-camera-preview");
    if (!container) return;

    if (!base64Data) {
      container.innerHTML = '<p class="muted">Connect to see camera feed</p>';
      return;
    }

    let img = container.querySelector("img");
    if (!img) {
      container.innerHTML = "";
      img = document.createElement("img");
      container.appendChild(img);
    }
    img.src = `data:image/jpeg;base64,${base64Data}`;
  }

  // Update teleop status UI
  function updateTeleopStatus() {
    const statusEl = document.getElementById("robot-teleop-status");
    const toggleBtn = document.getElementById("robot-teleop-toggle");

    if (statusEl) {
      statusEl.textContent = armState.teleop_enabled ? "Active" : "Off";
      statusEl.style.color = armState.teleop_enabled ? "var(--color-emerald-400)" : "";
    }
    if (toggleBtn) {
      toggleBtn.textContent = armState.teleop_enabled ? "Disable" : "Enable";
      toggleBtn.classList.toggle("active", armState.teleop_enabled);
    }
  }

  // Connect to arm server
  function connectArm() {
    const ip = elements.robotJetsonIp?.value || getSavedConnection().ip;
    const port = elements.robotArmPort?.value || getSavedConnection().armPort;

    if (!ip) {
      setStatus("Enter Jetson IP address", true);
      return;
    }

    if (armSocket) {
      armSocket.close();
    }

    updateConnectionStatus("arm", "connecting");
    const url = `ws://${ip}:${port}`;

    try {
      armSocket = new WebSocket(url);

      armSocket.onopen = () => {
        updateConnectionStatus("arm", "connected");
        setStatus("Arm server connected");
        updatePanelVisibility();
        // Request initial state
        armSocket.send(JSON.stringify({ type: "get_state" }));
      };

      armSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "state") {
            armState = {
              leader: data.leader || null,
              follower: data.follower || null,
              teleop_enabled: data.teleop_enabled || false
            };
            renderArmState();
            updateTeleopStatus();

            // Record frame if recording
            if (recordingState.active) {
              recordFrame();
            }
          } else if (data.type === "teleop_status") {
            armState.teleop_enabled = data.enabled;
            updateTeleopStatus();
          } else if (data.type === "error") {
            setStatus(`Arm error: ${data.message}`, true);
          }
        } catch (e) {
          console.error("Failed to parse arm message:", e);
        }
      };

      armSocket.onerror = () => {
        updateConnectionStatus("arm", "error");
        setStatus("Arm connection error", true);
      };

      armSocket.onclose = () => {
        updateConnectionStatus("arm", "disconnected");
        armSocket = null;
        updatePanelVisibility();
      };
    } catch (e) {
      updateConnectionStatus("arm", "error");
      setStatus(`Arm connection failed: ${e.message}`, true);
    }
  }

  // Connect to camera server
  function connectCamera() {
    const ip = elements.robotJetsonIp?.value || getSavedConnection().ip;
    const port = elements.robotCameraPort?.value || getSavedConnection().cameraPort;

    if (!ip) {
      return;
    }

    if (cameraSocket) {
      cameraSocket.close();
    }

    updateConnectionStatus("camera", "connecting");
    const url = `ws://${ip}:${port}`;

    try {
      cameraSocket = new WebSocket(url);

      cameraSocket.onopen = () => {
        updateConnectionStatus("camera", "connected");
        // Subscribe to first camera
        cameraSocket.send(JSON.stringify({ type: "subscribe", cameras: ["top", "cam0"] }));
      };

      cameraSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "frame" && data.data) {
            renderCameraFrame(data.data);

            // Store frame if recording
            if (recordingState.active) {
              recordingState.currentFrame = data.data;
            }
          } else if (data.type === "cameras") {
            console.log("Available cameras:", data.cameras);
          }
        } catch (e) {
          console.error("Failed to parse camera message:", e);
        }
      };

      cameraSocket.onerror = () => {
        updateConnectionStatus("camera", "error");
      };

      cameraSocket.onclose = () => {
        updateConnectionStatus("camera", "disconnected");
        cameraSocket = null;
        renderCameraFrame(null);
      };
    } catch (e) {
      updateConnectionStatus("camera", "error");
    }
  }

  // Connect to both servers
  function connect() {
    const ip = elements.robotJetsonIp?.value;
    const armPort = elements.robotArmPort?.value;
    const cameraPort = elements.robotCameraPort?.value;

    if (ip) {
      saveConnection(ip, armPort, cameraPort);
    }

    connectArm();
    connectCamera();
  }

  // Disconnect from servers
  function disconnect() {
    if (armSocket) {
      armSocket.close();
      armSocket = null;
    }
    if (cameraSocket) {
      cameraSocket.close();
      cameraSocket = null;
    }
    updateConnectionStatus("arm", "disconnected");
    updateConnectionStatus("camera", "disconnected");
    renderArmState();
    renderCameraFrame(null);
  }

  // Toggle teleoperation
  function toggleTeleop() {
    if (!armSocket || armSocket.readyState !== WebSocket.OPEN) {
      setStatus("Not connected to arm server", true);
      return;
    }

    const newState = !armState.teleop_enabled;
    armSocket.send(JSON.stringify({ type: "set_teleop", enabled: newState }));
  }

  // Send home command
  function goHome() {
    if (!armSocket || armSocket.readyState !== WebSocket.OPEN) {
      setStatus("Not connected to arm server", true);
      return;
    }

    armSocket.send(JSON.stringify({ type: "home", arm: "follower" }));
    setStatus("Homing follower arm...");
  }

  // Start calibration wizard (opens Live Bench in calibrate mode)
  function startCalibration() {
    setStatus("Opening calibration wizard in Live Bench...");
    // Switch to bench view and set calibration mode
    const benchNav = document.querySelector('[data-view="bench"]');
    if (benchNav) benchNav.click();

    // TODO: Pass calibration mode to bench iframe
    const iframe = document.getElementById("bench-iframe");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "setMode", mode: "calibrate" }, "*");
    }
  }

  // Recording functions
  function recordFrame() {
    if (!recordingState.active) return;

    const frame = {
      timestamp: Date.now(),
      leader: armState.leader?.positions || [],
      follower: armState.follower?.positions || [],
      image: recordingState.currentFrame || null
    };
    recordingState.frames.push(frame);
  }

  function toggleRecording() {
    if (recordingState.active) {
      // Stop recording
      recordingState.active = false;
      if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
      }

      recordingState.episodes++;
      const frameCount = recordingState.frames.length;

      // Save episode
      const episode = {
        id: recordingState.episodes,
        frames: recordingState.frames,
        recordedAt: new Date().toISOString()
      };

      // Store in localStorage (simplified - real impl would use file system)
      const episodes = JSON.parse(localStorage.getItem("forge_recorded_episodes") || "[]");
      episodes.push({ id: episode.id, frameCount, recordedAt: episode.recordedAt });
      localStorage.setItem("forge_recorded_episodes", JSON.stringify(episodes));

      recordingState.frames = [];
      setStatus(`Episode ${recordingState.episodes} saved (${frameCount} frames)`);
    } else {
      // Start recording
      if (!armSocket || armSocket.readyState !== WebSocket.OPEN) {
        setStatus("Connect to arm server before recording", true);
        return;
      }

      recordingState.active = true;
      recordingState.frames = [];
      setStatus("Recording started...");
    }

    updateRecordingStatus();
  }

  function updateRecordingStatus() {
    const statusEl = document.getElementById("robot-recording-status");
    const toggleBtn = document.getElementById("robot-record-toggle");
    const episodeEl = document.getElementById("robot-episode-count");

    if (statusEl) {
      statusEl.textContent = recordingState.active ? "Recording..." : "Stopped";
      statusEl.style.color = recordingState.active ? "var(--color-rose-400)" : "";
    }
    if (toggleBtn) {
      toggleBtn.textContent = recordingState.active ? "Stop" : "Record";
      toggleBtn.classList.toggle("active", recordingState.active);
      if (recordingState.active) {
        toggleBtn.style.backgroundColor = "var(--color-rose-600)";
        toggleBtn.style.borderColor = "var(--color-rose-500)";
      } else {
        toggleBtn.style.backgroundColor = "";
        toggleBtn.style.borderColor = "";
      }
    }
    if (episodeEl) {
      episodeEl.textContent = `Episodes: ${recordingState.episodes}`;
    }
  }

  // Load config from forge-rde-lerobot folder
  async function loadConfig() {
    try {
      const result = await window.forgeAPI.openFile({
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Select robot.config.json"
      });

      if (!result || result.canceled || !result.path) return;

      const response = await fetch(`file://${result.path}`);
      const config = await response.json();

      // Update form with config values
      if (config.jetson?.ip && elements.robotJetsonIp) {
        elements.robotJetsonIp.value = config.jetson.ip;
      }
      if (config.servers?.arm?.port && elements.robotArmPort) {
        elements.robotArmPort.value = String(config.servers.arm.port);
      }
      if (config.servers?.camera?.port && elements.robotCameraPort) {
        elements.robotCameraPort.value = String(config.servers.camera.port);
      }

      setStatus(`Loaded config: ${config.robot?.name || "robot.config.json"}`);
    } catch (e) {
      // Fallback: prompt for manual entry or use stored values
      setStatus("Enter connection details manually", true);
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Connect button
    const connectBtn = document.getElementById("robot-connect");
    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        if (armSocket || cameraSocket) {
          disconnect();
          connectBtn.textContent = "Connect";
        } else {
          connect();
          connectBtn.textContent = "Disconnect";
        }
      });
    }

    // Load config button
    const loadConfigBtn = document.getElementById("robot-load-config");
    if (loadConfigBtn) {
      loadConfigBtn.addEventListener("click", loadConfig);
    }

    // Teleop toggle
    const teleopBtn = document.getElementById("robot-teleop-toggle");
    if (teleopBtn) {
      teleopBtn.addEventListener("click", toggleTeleop);
    }

    // Calibration button
    const calibrateBtn = document.getElementById("robot-calibrate-btn");
    if (calibrateBtn) {
      calibrateBtn.addEventListener("click", startCalibration);
    }

    // Recording toggle
    const recordBtn = document.getElementById("robot-record-toggle");
    if (recordBtn) {
      recordBtn.addEventListener("click", toggleRecording);
    }

    // Home button
    const homeBtn = document.getElementById("robot-home-btn");
    if (homeBtn) {
      homeBtn.addEventListener("click", goHome);
    }
  }

  // Initialize
  function init() {
    initializeForm();
    setupEventListeners();
    updateRecordingStatus();

    // Load episode count from storage
    const episodes = JSON.parse(localStorage.getItem("forge_recorded_episodes") || "[]");
    recordingState.episodes = episodes.length;
    updateRecordingStatus();

    // Ensure bench starts in empty state until components are discovered
    updateBenchVisibility();
    updatePanelVisibility();
    renderDiscoveredComponents();
  }

  // Reset discovered components (called when switching workspaces)
  function resetDiscovery() {
    discoveredComponents = {
      hasJetson: false,
      hasArm: false,
      hasCamera: false,
      jetsonIp: null,
      armPort: null,
      cameraPort: null,
      armType: null,
      cameras: []
    };
    renderDiscoveredComponents();
    updatePanelVisibility();
    updateBenchVisibility();
  }

  return {
    init,
    connect,
    disconnect,
    toggleTeleop,
    toggleRecording,
    goHome,
    getArmState: () => armState,
    isConnected: () => (armSocket && armSocket.readyState === WebSocket.OPEN),
    // Discovery API - called by robot graph when components are found
    onComponentsDiscovered,
    getDiscoveredComponents: () => discoveredComponents,
    resetDiscovery
  };
}
