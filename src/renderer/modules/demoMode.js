/**
 * Demo Mode Orchestrator
 * One-click automated demo that shows off all features
 */

import { apiJson } from "../lib/utils.js";

export function createDemoModeController({ agentController, setStatus, setActiveView }) {
  let isRunning = false;
  let currentStep = 0;
  let demoSteps = [];

  // Demo configuration
  const DEMO_REPO = "huggingface/lerobot"; // or local path
  const DEMO_MISSION = "Build a mobile manipulation demo by combining a LeRobot arm with an ELEGOO car base, verify device connectivity, and prepare for live bench pickup testing.";
  const DEMO_REQUIREMENT = "Electronic interface/control component to connect LeRobot arm system to ELEGOO car base";

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function showProgress(percent, message) {
    const progressBar = document.getElementById("demo-progress");
    const progressText = document.getElementById("demo-progress-text");

    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    if (progressText) {
      progressText.textContent = message;
    }
  }

  function createProgressOverlay() {
    const existing = document.getElementById("demo-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "demo-overlay";
    overlay.className = "demo-overlay";
    overlay.innerHTML = `
      <div class="demo-progress-container">
        <div class="demo-progress-header">
          <span class="demo-icon-large">🚀</span>
          <h2>Demo Mode Active</h2>
        </div>
        <div class="progress-bar" style="margin-top: 20px;">
          <div id="demo-progress" class="progress-bar-fill" style="width: 0%;"></div>
        </div>
        <p id="demo-progress-text" class="demo-progress-text">Initializing...</p>
        <button id="demo-cancel" class="secondary-action" style="margin-top: 20px;">Cancel Demo</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("demo-cancel").addEventListener("click", () => {
      cancelDemo();
    });

    return overlay;
  }

  function removeProgressOverlay() {
    const overlay = document.getElementById("demo-overlay");
    if (overlay) {
      overlay.classList.add("fade-out");
      setTimeout(() => overlay.remove(), 300);
    }
  }

  function showCelebration() {
    const celebration = document.createElement("div");
    celebration.className = "mission-ready";
    celebration.innerHTML = `
      <div class="mission-ready-content">
        <h2>🎉 MISSION READY 🎉</h2>
        <p style="color: var(--color-slate-300); margin-bottom: 24px;">Robot graph built, parts selected, ready for live bench</p>
        <button id="close-celebration" class="demo-mode-btn">Continue</button>
      </div>
    `;
    document.body.appendChild(celebration);

    // Add confetti
    createConfetti();

    document.getElementById("close-celebration").addEventListener("click", () => {
      celebration.remove();
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      if (document.body.contains(celebration)) {
        celebration.remove();
      }
    }, 5000);
  }

  function createConfetti() {
    const colors = ['#10b981', '#38bdf8', '#f59e0b', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const particle = document.createElement("div");
        particle.className = "confetti-particle";
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.top = "-10px";
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = `${2 + Math.random() * 2}s`;
        particle.style.animationDelay = `${Math.random() * 0.5}s`;
        document.body.appendChild(particle);

        setTimeout(() => particle.remove(), 4000);
      }, i * 30);
    }
  }

  // Open agent activity panel
  function openAgentPanel() {
    const panel = document.getElementById("agent-activity-panel");
    if (panel) {
      panel.classList.add("active");
    }
  }

  // Close agent activity panel
  function closeAgentPanel() {
    const panel = document.getElementById("agent-activity-panel");
    if (panel) {
      panel.classList.remove("active");
    }
  }

  async function runDemo() {
    if (isRunning) return;
    isRunning = true;
    currentStep = 0;

    // Open agent panel
    openAgentPanel();

    // Create progress overlay
    const overlay = createProgressOverlay();

    try {
      // Step 1: Switch to My Robot view
      showProgress(5, "Opening My Robot workspace...");
      agentController.logThinking("Initializing demo sequence...");
      await sleep(800);
      setActiveView("robot");
      await sleep(500);

      // Step 2: Agent introduction
      showProgress(10, "Agent analyzing workspace...");
      agentController.logAnalyzing("Scanning for robot components in LeRobot codebase...");
      await sleep(1000);

      // Step 3: Simulate component discovery
      showProgress(20, "Discovering robot components...");
      agentController.addActivity("Found arm_server.py - LeRobot SO-100 arm controller");
      await sleep(600);
      agentController.addActivity("Found camera_server.py - Multi-camera vision pipeline");
      await sleep(600);
      agentController.addActivity("Detected Jetson Orin compute platform");
      await sleep(600);
      agentController.addActivity("Found calibration configs for 6-DOF arm");
      await sleep(500);
      agentController.logDiscovery("Discovered 4 robot components!");
      await sleep(800);

      // Step 4: Trigger actual workspace sync
      showProgress(35, "Syncing robot graph from source...");
      agentController.logThinking("Building robot graph from source evidence...");

      // Click the sync button if available
      const syncButton = document.getElementById("robot-refresh-button");
      if (syncButton) {
        syncButton.click();
        await sleep(2000);
      }

      agentController.logSuccess("Robot graph synchronized with 12 nodes");
      await sleep(500);

      // Step 5: Plan mission
      showProgress(50, "Planning integration mission...");
      agentController.logAnalyzing("Generating mission plan for LeRobot + ELEGOO integration...");
      await sleep(1200);

      // Fill in mission objective
      const objectiveInput = document.getElementById("robot-objective");
      if (objectiveInput) {
        await typeText(objectiveInput, DEMO_MISSION, 15);
        await sleep(500);
      }

      agentController.addActivity("Identified 3 execution phases");
      await sleep(400);
      agentController.addActivity("Detected integration blocker: missing controller");
      await sleep(400);
      agentController.logDiscovery("Mission plan ready with verification gates");
      await sleep(600);

      // Step 6: Create requirement
      showProgress(65, "Creating integration requirement...");
      agentController.logSearching("Creating requirement for missing component...");

      const reqTitleInput = document.getElementById("robot-requirement-title");
      if (reqTitleInput) {
        await typeText(reqTitleInput, DEMO_REQUIREMENT, 20);
        await sleep(300);
      }

      await sleep(800);
      agentController.logSuccess("Requirement added to queue");
      await sleep(500);

      // Step 7: Discover parts
      showProgress(75, "Searching for compatible parts...");
      agentController.logSearching("Searching DuckDuckGo for motor controllers...");
      await sleep(1000);
      agentController.addActivity("Found 8 candidate parts from web search");
      await sleep(600);
      agentController.logAnalyzing("Ranking options by compatibility with LeRobot...");
      await sleep(1000);
      agentController.addActivity("Top match: Pololu Maestro USB Controller (92% fit)");
      await sleep(400);
      agentController.addActivity("Runner up: Arduino Motor Shield (78% fit)");
      await sleep(400);
      agentController.logDiscovery("Part options ranked and ready for selection!");
      await sleep(600);

      // Step 8: Show task generation
      showProgress(90, "Generating team tasks...");
      agentController.logThinking("Converting plan into actionable tasks...");
      await sleep(800);
      agentController.addActivity("Created task: Mount arm bracket to rover base");
      await sleep(400);
      agentController.addActivity("Created task: Verify serial and power path");
      await sleep(400);
      agentController.addActivity("Created task: Run grasp test with calibration");
      await sleep(400);
      agentController.logSuccess("3 tasks ready for team assignment");
      await sleep(600);

      // Step 9: Complete
      showProgress(100, "Demo complete!");
      agentController.logSuccess("Demo sequence complete. Ready for live bench.");

      await sleep(500);
      removeProgressOverlay();

      // Show celebration
      showCelebration();

    } catch (error) {
      console.error("Demo error:", error);
      agentController.logError(`Demo failed: ${error.message}`);
      removeProgressOverlay();
      setStatus(`Demo error: ${error.message}`, true);
    }

    isRunning = false;
  }

  async function typeText(element, text, delay = 30) {
    element.value = "";
    element.focus();

    for (let i = 0; i < text.length; i++) {
      element.value = text.substring(0, i + 1);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(delay);
    }
  }

  function cancelDemo() {
    isRunning = false;
    removeProgressOverlay();
    closeAgentPanel();
    agentController.logError("Demo cancelled by user");
    setStatus("Demo cancelled");
  }

  function init() {
    // Add click handler to demo button
    const demoBtn = document.getElementById("demo-mode-btn");
    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        if (!isRunning) {
          runDemo();
        }
      });
    }

    // Add click handler to agent status (opens panel)
    const agentStatus = document.getElementById("agent-status-indicator");
    if (agentStatus) {
      agentStatus.addEventListener("click", () => {
        const panel = document.getElementById("agent-activity-panel");
        if (panel) {
          panel.classList.toggle("active");
        }
      });
    }

    // Add close handler for agent panel
    const closeBtn = document.getElementById("agent-activity-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeAgentPanel);
    }
  }

  return {
    init,
    runDemo,
    cancelDemo,
    isRunning: () => isRunning
  };
}

// Add CSS for demo overlay
const style = document.createElement("style");
style.textContent = `
  .demo-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(8px);
    animation: fade-in 0.3s ease;
  }
  .demo-overlay.fade-out {
    animation: fade-out 0.3s ease forwards;
  }
  @keyframes fade-out {
    to { opacity: 0; }
  }
  .demo-progress-container {
    text-align: center;
    padding: 48px;
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
    border-radius: 24px;
    border: 1px solid var(--color-slate-700);
    min-width: 400px;
    box-shadow: 0 32px 64px rgba(0, 0, 0, 0.5);
  }
  .demo-progress-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 8px;
  }
  .demo-progress-header h2 {
    margin: 0;
    font-size: 28px;
    background: linear-gradient(135deg, var(--color-emerald-400), var(--color-sky-400));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .demo-icon-large {
    font-size: 36px;
  }
  .demo-progress-text {
    margin-top: 16px;
    color: var(--color-slate-300);
    font-size: 14px;
  }
`;
document.head.appendChild(style);
