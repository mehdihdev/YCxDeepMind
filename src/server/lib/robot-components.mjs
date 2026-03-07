export const ROBOT_COMPONENTS = {
  arm: {
    id: "arm",
    label: "Arm",
    colorToken: "component-arm"
  },
  car: {
    id: "car",
    label: "Car",
    colorToken: "component-base"
  },
  base: {
    id: "base",
    label: "Base",
    colorToken: "component-base"
  },
  camera: {
    id: "camera",
    label: "Camera",
    colorToken: "component-camera"
  },
  audio: {
    id: "audio",
    label: "Audio",
    colorToken: "component-audio"
  },
  compute: {
    id: "compute",
    label: "Compute",
    colorToken: "component-compute"
  },
  planner: {
    id: "planner",
    label: "Planner",
    colorToken: "component-planner"
  },
  verifier: {
    id: "verifier",
    label: "Verifier",
    colorToken: "component-verifier"
  },
  parts: {
    id: "parts",
    label: "Parts",
    colorToken: "component-parts"
  },
  source: {
    id: "source",
    label: "Source",
    colorToken: "component-source"
  },
  task: {
    id: "task",
    label: "Task",
    colorToken: "component-task"
  },
  unknown: {
    id: "unknown",
    label: "Unknown",
    colorToken: "component-unknown"
  }
};

function keywordMatch(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getRobotComponentMeta(componentId) {
  return ROBOT_COMPONENTS[componentId] || ROBOT_COMPONENTS.unknown;
}

export function inferRobotComponentFromText(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return ROBOT_COMPONENTS.unknown;
  if (keywordMatch(normalized, ["arm", "gripper", "servo", "manipulator", "lerobot"])) {
    return ROBOT_COMPONENTS.arm;
  }
  if (keywordMatch(normalized, ["base", "wheel", "motor", "drive", "chassis", "elegoo"])) {
    return ROBOT_COMPONENTS.base;
  }
  if (keywordMatch(normalized, ["camera", "vision", "image", "video", "depth", "csi"])) {
    return ROBOT_COMPONENTS.camera;
  }
  if (keywordMatch(normalized, ["audio", "mic", "microphone", "speaker"])) {
    return ROBOT_COMPONENTS.audio;
  }
  if (keywordMatch(normalized, ["jetson", "cuda", "gpu", "compute", "torch", "inference"])) {
    return ROBOT_COMPONENTS.compute;
  }
  if (keywordMatch(normalized, ["planner", "mission", "plan"])) {
    return ROBOT_COMPONENTS.planner;
  }
  if (keywordMatch(normalized, ["verifier", "verify", "bench", "diagnostic", "healthcheck"])) {
    return ROBOT_COMPONENTS.verifier;
  }
  if (keywordMatch(normalized, ["parts", "datasheet", "vendor", "bom"])) {
    return ROBOT_COMPONENTS.parts;
  }
  if (keywordMatch(normalized, ["task", "assignee", "todo"])) {
    return ROBOT_COMPONENTS.task;
  }
  if (keywordMatch(normalized, ["readme", "package", "config", "launch", "source"])) {
    return ROBOT_COMPONENTS.source;
  }
  return ROBOT_COMPONENTS.unknown;
}
