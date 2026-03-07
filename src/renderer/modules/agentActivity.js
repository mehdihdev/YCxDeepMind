/**
 * Agent Activity Feed
 * Shows live agent actions with typewriter effects and status indicators
 */

import { escapeHtml } from "../lib/utils.js";

const AGENT_STATES = {
  idle: { icon: "🤖", label: "Ready", color: "var(--color-slate-400)" },
  thinking: { icon: "🧠", label: "Thinking...", color: "var(--color-amber-400)" },
  searching: { icon: "🔍", label: "Searching...", color: "var(--color-sky-400)" },
  analyzing: { icon: "📊", label: "Analyzing...", color: "var(--color-purple-400)" },
  writing: { icon: "✍️", label: "Writing...", color: "var(--color-emerald-400)" },
  success: { icon: "✅", label: "Done", color: "var(--color-emerald-400)" },
  error: { icon: "❌", label: "Error", color: "var(--color-rose-400)" }
};

export function createAgentActivityController({ setStatus }) {
  let activities = [];
  let currentState = "idle";
  let typingInterval = null;
  let container = null;

  function getContainer() {
    if (!container) {
      container = document.getElementById("agent-activity-feed");
    }
    return container;
  }

  function setState(state) {
    currentState = state;
    updateStatusIndicator();
  }

  function updateStatusIndicator() {
    const indicator = document.getElementById("agent-status-indicator");
    if (!indicator) return;

    const stateConfig = AGENT_STATES[currentState] || AGENT_STATES.idle;
    indicator.innerHTML = `
      <span class="agent-status-icon ${currentState === 'thinking' || currentState === 'searching' || currentState === 'analyzing' ? 'pulse' : ''}">${stateConfig.icon}</span>
      <span class="agent-status-label" style="color: ${stateConfig.color}">${stateConfig.label}</span>
    `;
  }

  function addActivity(message, type = "info") {
    const activity = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date(),
      typing: true
    };

    activities.unshift(activity);
    if (activities.length > 50) {
      activities = activities.slice(0, 50);
    }

    renderActivities();
    typewriterEffect(activity);
  }

  function typewriterEffect(activity) {
    const element = document.querySelector(`[data-activity-id="${activity.id}"] .activity-text`);
    if (!element) return;

    const fullText = activity.message;
    let currentIndex = 0;
    element.textContent = "";

    const interval = setInterval(() => {
      if (currentIndex < fullText.length) {
        element.textContent = fullText.substring(0, currentIndex + 1);
        currentIndex++;
      } else {
        clearInterval(interval);
        activity.typing = false;
        element.classList.remove("typing");
      }
    }, 20); // Fast typing
  }

  function renderActivities() {
    const feed = getContainer();
    if (!feed) return;

    if (!activities.length) {
      feed.innerHTML = `
        <div class="activity-empty">
          <span class="agent-avatar">🤖</span>
          <p>Agent ready. Start a task to see activity.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = activities.slice(0, 15).map((activity) => {
      const typeClass = activity.type === "success" ? "activity-success" :
                        activity.type === "error" ? "activity-error" :
                        activity.type === "discovery" ? "activity-discovery" : "";
      const typingClass = activity.typing ? "typing" : "";

      return `
        <div class="activity-item ${typeClass}" data-activity-id="${activity.id}">
          <span class="activity-dot"></span>
          <span class="activity-text ${typingClass}">${escapeHtml(activity.message)}</span>
        </div>
      `;
    }).join("");
  }

  // Public API for streaming agent events
  function logThinking(message) {
    setState("thinking");
    addActivity(message, "info");
  }

  function logSearching(message) {
    setState("searching");
    addActivity(message, "info");
  }

  function logAnalyzing(message) {
    setState("analyzing");
    addActivity(message, "info");
  }

  function logDiscovery(message) {
    setState("success");
    addActivity(message, "discovery");
  }

  function logSuccess(message) {
    setState("success");
    addActivity(message, "success");
    setTimeout(() => setState("idle"), 2000);
  }

  function logError(message) {
    setState("error");
    addActivity(message, "error");
    setTimeout(() => setState("idle"), 3000);
  }

  function clear() {
    activities = [];
    setState("idle");
    renderActivities();
  }

  // Initialize
  function init() {
    updateStatusIndicator();
    renderActivities();
  }

  return {
    init,
    setState,
    logThinking,
    logSearching,
    logAnalyzing,
    logDiscovery,
    logSuccess,
    logError,
    addActivity,
    clear,
    getState: () => currentState
  };
}

// Demo sequence for showcasing the agent
export function runAgentDemo(controller) {
  const steps = [
    { delay: 0, fn: () => controller.logThinking("Initializing workspace analysis...") },
    { delay: 800, fn: () => controller.logAnalyzing("Scanning source files for robot components...") },
    { delay: 1500, fn: () => controller.addActivity("Found arm_server.py - LeRobot arm controller") },
    { delay: 2200, fn: () => controller.addActivity("Found camera_server.py - Vision pipeline") },
    { delay: 2800, fn: () => controller.addActivity("Detected Jetson compute platform") },
    { delay: 3500, fn: () => controller.logDiscovery("Discovered 3 robot components!") },
    { delay: 4200, fn: () => controller.logSearching("Searching for integration options...") },
    { delay: 5000, fn: () => controller.addActivity("Querying DuckDuckGo for motor controllers...") },
    { delay: 5800, fn: () => controller.addActivity("Found 8 candidate parts") },
    { delay: 6500, fn: () => controller.logAnalyzing("Ranking options by compatibility...") },
    { delay: 7500, fn: () => controller.logSuccess("Analysis complete. Ready for mission planning.") }
  ];

  steps.forEach(step => {
    setTimeout(step.fn, step.delay);
  });
}
