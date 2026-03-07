import { apiJson, escapeHtml } from "../lib/utils.js";
import { ensureMermaidLoaded } from "../lib/loaders.js";

export function createArtifactController({ elements, setStatus, onSaved }) {
  let repos = [];
  let generatedArtifact = null;

  function renderRepoSelector() {
    if (!elements.artifactRepoSelect) return;
    const savedRepo = localStorage.getItem("forge_selected_artifact_repo") || "";
    if (!repos.length) {
      elements.artifactRepoSelect.innerHTML = '<option value="">No repositories loaded</option>';
      return;
    }

    const options = ['<option value="">Select a repository</option>'];
    for (const repo of repos) {
      const selected = repo.full_name === savedRepo ? " selected" : "";
      options.push(`<option value="${escapeHtml(repo.full_name)}"${selected}>${escapeHtml(repo.full_name)}</option>`);
    }
    elements.artifactRepoSelect.innerHTML = options.join("");
  }

  async function renderMermaid(diagram) {
    if (!elements.artifactMermaidRender || !elements.artifactMermaid) return;
    elements.artifactMermaid.textContent = diagram.mermaid || "";
    const loaded = await ensureMermaidLoaded();
    if (!loaded || !window.mermaid) {
      elements.artifactMermaidRender.innerHTML = `<div class="output">${escapeHtml(diagram.mermaid || "")}</div>`;
      return;
    }

    const renderId = `artifact-${Date.now()}`;
    const rendered = await window.mermaid.render(renderId, diagram.mermaid || "flowchart LR\nA[No diagram]");
    elements.artifactMermaidRender.innerHTML = rendered.svg;
  }

  async function generate(repoFullName) {
    const data = await apiJson("/api/artifacts/generate", {
      method: "POST",
      body: JSON.stringify({ repoFullName })
    });
    generatedArtifact = data.artifact;
    if (elements.artifactTitle) {
      elements.artifactTitle.textContent = generatedArtifact.title || "Generated artifact";
    }
    if (elements.artifactDescription) {
      elements.artifactDescription.textContent = generatedArtifact.description || "";
    }
    if (elements.artifactStatus) {
      elements.artifactStatus.textContent = `Generated at ${generatedArtifact.generatedAt || "now"}`;
    }
    await renderMermaid(generatedArtifact);
  }

  async function save() {
    if (!generatedArtifact) {
      throw new Error("Generate an artifact first.");
    }
    await apiJson("/api/team/artifacts", {
      method: "POST",
      body: JSON.stringify({
        type: "plan",
        title: generatedArtifact.title,
        summary: generatedArtifact.description,
        payload: generatedArtifact
      })
    });
    if (typeof onSaved === "function") {
      await onSaved();
    }
  }

  if (elements.artifactGenerateForm) {
    elements.artifactGenerateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const repoFullName = String(elements.artifactRepoSelect?.value || "");
      if (!repoFullName) {
        setStatus("Select a repository for the artifact generator.", true);
        return;
      }
      localStorage.setItem("forge_selected_artifact_repo", repoFullName);
      try {
        setStatus("Generating integration diagram...");
        await generate(repoFullName);
        setStatus("Artifact generated");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (elements.artifactSaveButton) {
    elements.artifactSaveButton.addEventListener("click", async () => {
      try {
        setStatus("Saving artifact to team workspace...");
        await save();
        setStatus("Artifact saved");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  return {
    setRepos(nextRepos) {
      repos = Array.isArray(nextRepos) ? nextRepos : [];
      renderRepoSelector();
    }
  };
}
