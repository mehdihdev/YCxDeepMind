import { apiJson, escapeHtml, inferLanguage } from "../lib/utils.js";
import { ensureMonacoLoaded, getMonacoEditor } from "../lib/loaders.js";

function getStoredFolder() {
  return localStorage.getItem("forge_selected_code_folder") || "";
}

function getStoredRepo() {
  return localStorage.getItem("forge_selected_code_repo") || "";
}

function getSourceMode() {
  return localStorage.getItem("forge_code_source_mode") || "repo";
}

function setSourceMode(mode) {
  localStorage.setItem("forge_code_source_mode", mode);
}

export function createCodeController({ elements, setStatus }) {
  let repos = [];
  let currentRepoPath = "";

  function renderRepoSelector() {
    if (!elements.codeRepoSelect) return;
    const savedRepo = getStoredRepo();
    const options = ['<option value="">Select a repository</option>'];
    for (const repo of repos) {
      const selected = repo.full_name === savedRepo ? " selected" : "";
      options.push(`<option value="${escapeHtml(repo.full_name)}"${selected}>${escapeHtml(repo.full_name)}</option>`);
    }
    if (!repos.length) {
      elements.codeRepoSelect.innerHTML = '<option value="">No repositories loaded</option>';
      return;
    }
    elements.codeRepoSelect.innerHTML = options.join("");
  }

  function resetFileList(message) {
    if (!elements.codeFileList) return;
    elements.codeFileList.innerHTML = `<li class="empty-list">${escapeHtml(message)}</li>`;
  }

  async function loadFile(filePath) {
    if (!currentRepoPath) return;
    try {
      const { ok } = await ensureMonacoLoaded(elements.monacoMount, elements.codeEditorMeta);
      if (!ok) return;
      const data = await apiJson(
        `/api/code/file?repoPath=${encodeURIComponent(currentRepoPath)}&filePath=${encodeURIComponent(filePath)}`
      );
      const editor = getMonacoEditor();
      if (editor) {
        editor.setValue(data.content || "");
        window.monaco.editor.setModelLanguage(editor.getModel(), inferLanguage(filePath));
      }
      if (elements.codeEditorMeta) {
        elements.codeEditorMeta.textContent = `${filePath} • ${currentRepoPath}`;
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function renderFileList(files) {
    if (!elements.codeFileList) return;
    if (!files.length) {
      resetFileList("No files found.");
      return;
    }
    elements.codeFileList.innerHTML = files
      .map(
        (filePath) =>
          `<li><button type="button" class="code-file-btn" data-code-file="${escapeHtml(filePath)}">${escapeHtml(
            filePath
          )}</button></li>`
      )
      .join("");
  }

  async function loadTreeFromRepo(repoFullName) {
    const data = await apiJson(`/api/code/tree/by-repo?repoFullName=${encodeURIComponent(repoFullName)}`);
    currentRepoPath = data.repoPath;
    renderFileList(data.files || []);
    if (elements.codeEditorMeta) {
      elements.codeEditorMeta.textContent = `${repoFullName} • ${currentRepoPath}`;
    }
  }

  async function loadTreeFromFolder(folderPath) {
    const data = await apiJson(`/api/code/tree?repoPath=${encodeURIComponent(folderPath)}`);
    currentRepoPath = data.repoPath;
    renderFileList(data.files || []);
    if (elements.codeEditorMeta) {
      elements.codeEditorMeta.textContent = `${data.repoPath} • local folder`;
    }
  }

  async function openFolder() {
    const result = await window.forgeAPI.openFolder();
    if (!result || result.canceled || !result.path) return;
    localStorage.setItem("forge_selected_code_folder", result.path);
    setSourceMode("folder");
    try {
      setStatus("Loading code folder...");
      await loadTreeFromFolder(result.path);
      setStatus("Code folder loaded");
    } catch (error) {
      resetFileList("Unable to load selected folder.");
      setStatus(error.message, true);
    }
  }

  async function loadStoredSource() {
    try {
      if (getSourceMode() === "folder" && getStoredFolder()) {
        await loadTreeFromFolder(getStoredFolder());
        return;
      }
      if (getStoredRepo()) {
        await loadTreeFromRepo(getStoredRepo());
      }
    } catch {
      resetFileList("Load a repository or folder to browse code.");
    }
  }

  if (elements.codeLoadForm) {
    elements.codeLoadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const repoFullName = String(elements.codeRepoSelect?.value || "");
      if (!repoFullName) {
        setStatus("Select a repository or use Open Folder.", true);
        return;
      }
      localStorage.setItem("forge_selected_code_repo", repoFullName);
      setSourceMode("repo");
      try {
        setStatus("Loading repository files...");
        await loadTreeFromRepo(repoFullName);
        setStatus("Repository files loaded");
      } catch (error) {
        resetFileList("Unable to load repository files.");
        setStatus(error.message, true);
      }
    });
  }

  if (elements.codeOpenFolderButton) {
    elements.codeOpenFolderButton.addEventListener("click", () => {
      openFolder().catch((error) => setStatus(error.message, true));
    });
  }

  if (elements.codeFileList) {
    elements.codeFileList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const filePath = String(target.dataset.codeFile || "");
      if (!filePath) return;
      loadFile(filePath).catch((error) => setStatus(error.message, true));
    });
  }

  return {
    setRepos(nextRepos) {
      repos = Array.isArray(nextRepos) ? nextRepos : [];
      renderRepoSelector();
    },
    loadStoredSource,
    reset() {
      currentRepoPath = "";
      resetFileList("Load a repository or folder to browse code.");
    }
  };
}
