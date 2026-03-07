let monacoLoaded = false;
let mermaidLoaded = false;
let visLoaded = false;
let monacoEditor = null;

export async function ensureMonacoLoaded(monacoMount, codeEditorMeta) {
  if (monacoLoaded) return { ok: true, editor: monacoEditor };
  if (!monacoMount) return { ok: false, editor: null };

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    await new Promise((resolve) => {
      window.require.config({
        paths: {
          vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs"
        }
      });
      window.require(["vs/editor/editor.main"], resolve);
    });

    monacoEditor = window.monaco.editor.create(monacoMount, {
      value: "// Load a repository, then click a file.",
      language: "javascript",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13
    });
    monacoLoaded = true;
    return { ok: true, editor: monacoEditor };
  } catch {
    if (codeEditorMeta) {
      codeEditorMeta.textContent =
        "Could not load Monaco from CDN. Check internet connection and retry.";
    }
    return { ok: false, editor: null };
  }
}

export function getMonacoEditor() {
  return monacoEditor;
}

export async function ensureMermaidLoaded() {
  if (mermaidLoaded) return true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose"
    });
    mermaidLoaded = true;
    return true;
  } catch {
    return false;
  }
}

export async function ensureVisNetworkLoaded() {
  if (visLoaded) return true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/vis-network/standalone/umd/vis-network.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    visLoaded = true;
    return true;
  } catch {
    return false;
  }
}
