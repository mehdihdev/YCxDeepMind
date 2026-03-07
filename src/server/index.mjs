import express from "express";
import session from "express-session";
import sessionFileStore from "session-file-store";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ROBOT_COMPONENTS,
  getRobotComponentMeta,
  inferRobotComponentFromText
} from "./lib/robot-components.mjs";
import { searchParts as searchPartsBrowserbase, fetchDatasheet } from "./lib/browserbase.mjs";
import {
  indexDatasheet,
  indexDatasheetFromUrl,
  queryDatasheets,
  askAboutDatasheet,
  getIndexStats
} from "./lib/chroma-rag.mjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDir = path.join(__dirname, "..", "renderer");
const nodeModulesDir = path.join(__dirname, "..", "..", "node_modules");

const PORT = Number(process.env.PORT || 3030);
const APP_URL = process.env.APP_URL || `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "forge-dev-secret";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
const ROBOT_AGENT_MODEL =
  process.env.ROBOT_AGENT_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash";
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || "gemini-3.1-flash-image-preview";
const VISUALIZER_SUMMARY_MODEL =
  process.env.VISUALIZER_SUMMARY_MODEL || ROBOT_AGENT_MODEL;
const GOOGLE_GENAI_BASE_URL =
  process.env.GOOGLE_GENAI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const LOCAL_REPOS_ROOT = process.env.LOCAL_REPOS_ROOT || "";
const GITHUB_TOKENS_TABLE = "github_tokens";
const VISUALIZER_MAX_FILES = Number(process.env.VISUALIZER_MAX_FILES || 500);
const VISUALIZER_SUMMARY_BATCH_SIZE = Number(process.env.VISUALIZER_SUMMARY_BATCH_SIZE || 10);
const VISUALIZER_SUMMARY_MAX_CHARS = Number(process.env.VISUALIZER_SUMMARY_MAX_CHARS || 2200);

const supabaseApiKey = SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY;
const supabase = SUPABASE_URL && supabaseApiKey
  ? createClient(SUPABASE_URL, supabaseApiKey, {
      auth: { persistSession: false, detectSessionInUrl: false }
    })
  : null;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, detectSessionInUrl: false }
    })
  : null;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/vendor/xterm", express.static(path.join(nodeModulesDir, "xterm")));
app.use("/vendor/xterm-addon-fit", express.static(path.join(nodeModulesDir, "xterm-addon-fit")));

const FileStore = sessionFileStore(session);
const sessionDir = path.join(os.homedir(), ".forge-rde", "sessions");
fsSync.mkdirSync(sessionDir, { recursive: true });
const robotGraphDir = path.join(os.homedir(), ".forge-rde", "robot-graphs");
fsSync.mkdirSync(robotGraphDir, { recursive: true });
const robotWorkspaceDir = path.join(os.homedir(), ".forge-rde", "robot-workspaces");
fsSync.mkdirSync(robotWorkspaceDir, { recursive: true });

app.use(
  session({
    store: new FileStore({
      path: sessionDir,
      ttl: SESSION_TTL_DAYS * 24 * 60 * 60,
      retries: 0
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    }
  })
);

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.first_name || user.email?.split("@")[0] || "User"
  };
}

async function fetchGithubRepos(token) {
  const repos = await fetchGithubJson(
    token,
    "/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator,organization_member"
  );
  return repos.map((repo) => ({
    name: repo.name,
    owner: repo.owner?.login,
    full_name: repo.full_name,
    private: repo.private,
    updated_at: repo.updated_at,
    updated: formatRepoDate(repo.updated_at),
    description: repo.description || "No description provided.",
    language: repo.language,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    html_url: repo.html_url
  }));
}

async function fetchGithubJson(token, route) {
  const response = await fetch(`https://api.github.com${route}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "forge-rde"
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API error (${response.status}) ${text}`);
  }

  return response.json();
}

function parseRepoFullName(repoFullName) {
  const [owner, repo] = String(repoFullName || "").split("/");
  if (!owner || !repo) {
    throw new Error("repoFullName must be in owner/repo format.");
  }
  return { owner, repo };
}

function encodeGithubFilePath(filePath) {
  return String(filePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function fetchGithubRepoTree(token, repoFullName, ref = "") {
  const { owner, repo } = parseRepoFullName(repoFullName);
  const repoMeta = await fetchGithubJson(token, `/repos/${owner}/${repo}`);
  const branch = String(ref || repoMeta.default_branch || "main");
  const treeData = await fetchGithubJson(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  const files = Array.isArray(treeData?.tree)
    ? treeData.tree
        .filter((entry) => entry?.type === "blob" && typeof entry.path === "string")
        .map((entry) => entry.path)
        .sort((a, b) => a.localeCompare(b))
    : [];

  return { defaultBranch: branch, files };
}

async function fetchGithubFileContent(token, repoFullName, filePath, ref = "") {
  const { owner, repo } = parseRepoFullName(repoFullName);
  const repoMeta = await fetchGithubJson(token, `/repos/${owner}/${repo}`);
  const branch = String(ref || repoMeta.default_branch || "main");
  const encodedPath = encodeGithubFilePath(filePath);
  const contentData = await fetchGithubJson(
    token,
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
  );

  if (Array.isArray(contentData)) {
    throw new Error("Requested path is a directory, not a file.");
  }

  if (contentData?.encoding === "base64" && typeof contentData?.content === "string") {
    const content = Buffer.from(contentData.content.replace(/\n/g, ""), "base64").toString("utf-8");
    return { content, ref: branch };
  }

  if (contentData?.download_url) {
    const fileResponse = await fetch(contentData.download_url);
    if (!fileResponse.ok) {
      throw new Error(`Unable to fetch file content (${fileResponse.status}).`);
    }
    const content = await fileResponse.text();
    return { content, ref: branch };
  }

  throw new Error("Unsupported GitHub content response.");
}

function formatRepoDate(isoString) {
  if (!isoString) return "Updated recently";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return `Updated ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  })}`;
}

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

function requireSupabase(req, res, next) {
  if (!supabase) {
    res.status(500).json({
      error:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY)."
    });
    return;
  }
  next();
}

async function createUserClientFromSession(sessionData) {
  if (!SUPABASE_URL || !supabaseApiKey) return null;
  const client = createClient(SUPABASE_URL, supabaseApiKey, {
    auth: { persistSession: false, detectSessionInUrl: false }
  });

  if (sessionData?.accessToken && sessionData?.refreshToken) {
    await client.auth.setSession({
      access_token: sessionData.accessToken,
      refresh_token: sessionData.refreshToken
    });
  }

  return client;
}

async function resolveGithubIdentity(sessionData) {
  if (!sessionData?.accessToken) return false;
  try {
    const userClient = await createUserClientFromSession(sessionData);
    if (!userClient) return false;
    const { data, error } = await userClient.auth.getUser();
    if (error) return false;
    return (data.user?.identities || []).some((identity) => identity.provider === "github");
  } catch {
    return false;
  }
}

async function loadGithubTokens(userId) {
  if (!supabaseAdmin || !userId) return null;
  const { data, error } = await supabaseAdmin
    .from(GITHUB_TOKENS_TABLE)
    .select("provider_token, provider_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function storeGithubTokens(userId, providerToken, providerRefreshToken) {
  if (!supabaseAdmin || !userId || !providerToken) return;
  await supabaseAdmin.from(GITHUB_TOKENS_TABLE).upsert(
    {
      user_id: userId,
      provider_token: providerToken,
      provider_refresh_token: providerRefreshToken || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
}

async function hydrateGithubToken(sessionData) {
  if (!sessionData?.user?.id) return;
  if (sessionData.githubToken) return;
  const stored = await loadGithubTokens(sessionData.user.id);
  if (stored?.provider_token) {
    sessionData.githubToken = stored.provider_token;
  }
}

const TEAM_TABLES = {
  workspaces: "team_workspaces",
  members: "team_members",
  tasks: "team_tasks",
  artifacts: "team_artifacts"
};

function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function missingTableError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.toLowerCase().includes("could not find the table") ||
    message.toLowerCase().includes("relation") ||
    message.toLowerCase().includes("does not exist")
  );
}

async function getAuthUsersMap(userIds) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map();

  for (const userId of unique) {
    let profile = { id: userId, name: "User", email: "" };
    if (supabaseAdmin) {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        const user = data?.user;
        if (user) {
          profile = {
            id: user.id,
            name: user.user_metadata?.first_name || user.email?.split("@")[0] || "User",
            email: user.email || ""
          };
        }
      } catch {
        // Best-effort user enrichment only.
      }
    }
    map.set(userId, profile);
  }
  return map;
}

async function getTeamStateFromSupabase(sessionData) {
  const userId = sessionData?.user?.id;
  const membershipRes = await supabaseAdmin
    .from(TEAM_TABLES.members)
    .select("team_id, role, joined_at")
    .eq("user_id", userId);
  if (membershipRes.error) {
    throw membershipRes.error;
  }

  const memberships = membershipRes.data || [];
  const teamIds = memberships.map((m) => m.team_id);
  let workspaceRows = [];
  if (teamIds.length) {
    const workspaceRes = await supabaseAdmin
      .from(TEAM_TABLES.workspaces)
      .select("id, name, invite_code")
      .in("id", teamIds);
    if (workspaceRes.error) {
      throw workspaceRes.error;
    }
    workspaceRows = workspaceRes.data || [];
  }

  const teams = memberships
    .map((membership) => {
      const workspace = workspaceRows.find((w) => w.id === membership.team_id);
      if (!workspace) return null;
      return {
        id: workspace.id,
        name: workspace.name,
        invite_code: workspace.invite_code,
        role: membership.role
      };
    })
    .filter(Boolean);

  let activeTeamId = sessionData?.activeTeamId;
  if (!activeTeamId || !teams.some((team) => team.id === activeTeamId)) {
    activeTeamId = teams[0]?.id || null;
    sessionData.activeTeamId = activeTeamId;
  }

  if (!activeTeamId) {
    return {
      storage: "supabase",
      teams: [],
      activeTeamId: null,
      members: [],
      tasks: [],
      artifacts: []
    };
  }

  const membersRes = await supabaseAdmin
    .from(TEAM_TABLES.members)
    .select("user_id, role, joined_at")
    .eq("team_id", activeTeamId)
    .order("joined_at", { ascending: true });
  if (membersRes.error) {
    throw membersRes.error;
  }

  const taskRes = await supabaseAdmin
    .from(TEAM_TABLES.tasks)
    .select("*")
    .eq("team_id", activeTeamId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (taskRes.error) {
    throw taskRes.error;
  }

  const artifactRes = await supabaseAdmin
    .from(TEAM_TABLES.artifacts)
    .select("*")
    .eq("team_id", activeTeamId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (artifactRes.error) {
    throw artifactRes.error;
  }

  const members = membersRes.data || [];
  const userMap = await getAuthUsersMap(members.map((m) => m.user_id));
  const membersWithProfile = members.map((m) => ({
    ...m,
    user: userMap.get(m.user_id) || { id: m.user_id, name: "User", email: "" }
  }));

  return {
    storage: "supabase",
    teams,
    activeTeamId,
    members: membersWithProfile,
    tasks: taskRes.data || [],
    artifacts: artifactRes.data || []
  };
}

async function getTeamState(sessionData) {
  if (!supabaseAdmin) {
    throw new Error("Team workspace requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  try {
    return await getTeamStateFromSupabase(sessionData);
  } catch (error) {
    if (missingTableError(error)) {
      throw new Error(
        "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      );
    }
    throw error;
  }
}

async function analyzeRepo(rootPath) {
  const ignored = new Set([".git", "node_modules", ".next", "dist", "build", ".pnpm-store"]);
  const extCounts = {};
  let totalFiles = 0;
  let totalDirs = 0;

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        totalDirs += 1;
        await walk(fullPath);
        continue;
      }
      totalFiles += 1;
      const ext = path.extname(entry.name).toLowerCase() || "<none>";
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }

  await walk(rootPath);

  const topExtensions = Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([ext, count]) => ({ ext, count }));

  return {
    repoPath: rootPath,
    stats: {
      totalFiles,
      totalDirectories: totalDirs,
      topExtensions
    }
  };
}

const CODE_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".pnpm-store",
  ".idea",
  ".vscode"
]);

function normalizeRepoPath(repoPathRaw) {
  return path.resolve(String(repoPathRaw || "").trim());
}

function safeJoinRepoPath(repoPath, relativePath) {
  const absolute = path.resolve(repoPath, relativePath);
  const normalizedRepo = `${repoPath}${path.sep}`;
  if (absolute !== repoPath && !absolute.startsWith(normalizedRepo)) {
    throw new Error("Invalid file path.");
  }
  return absolute;
}

async function listRepoFiles(repoPath) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        if (entry.name !== ".env.example" && entry.name !== ".env") {
          continue;
        }
      }
      if (entry.isDirectory() && CODE_IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(repoPath, fullPath).split(path.sep).join("/");

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(relPath);
      }
    }
  }

  await walk(repoPath);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function classifyImportSource(source) {
  if (source.startsWith(".") || source.startsWith("/") || source.startsWith("@/")) {
    return "local";
  }
  return "external";
}

function resolveLocalImportPath(importSource, fromRelativePath, allRelativePaths) {
  const fromDir = path.dirname(fromRelativePath);
  let targetBase = "";

  if (importSource.startsWith("@/")) {
    targetBase = importSource.slice(2);
  } else if (importSource.startsWith("/")) {
    targetBase = importSource.slice(1);
  } else {
    targetBase = path
      .normalize(path.join(fromDir, importSource))
      .split(path.sep)
      .join("/");
  }

  const candidates = [
    targetBase,
    `${targetBase}.ts`,
    `${targetBase}.tsx`,
    `${targetBase}.js`,
    `${targetBase}.jsx`,
    `${targetBase}.mjs`,
    `${targetBase}.cjs`,
    `${targetBase}/index.ts`,
    `${targetBase}/index.tsx`,
    `${targetBase}/index.js`,
    `${targetBase}/index.jsx`
  ];

  for (const candidate of candidates) {
    if (allRelativePaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractImportsFromCode(content) {
  const imports = [];
  const importRegex =
    /import\s+[^'"\\n]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const source = match[1] || match[2] || match[3];
    if (source) imports.push(source);
  }
  return imports;
}

function heuristicFileSummary(relPath) {
  const name = path.basename(relPath);
  const ext = path.extname(relPath).toLowerCase();
  if (name.toLowerCase().includes("readme")) return "Project documentation describing setup, usage, and repository context.";
  if (ext === ".json") return "Structured configuration or data file used by the application.";
  if (ext === ".md") return "Markdown document for notes, docs, or project planning.";
  if (ext === ".ts" || ext === ".tsx") return "TypeScript source implementing typed application logic and module behavior.";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "JavaScript source implementing runtime behavior for this project.";
  if (ext === ".py") return "Python module containing script or service logic for the repository.";
  if (ext === ".yml" || ext === ".yaml") return "YAML configuration describing environment, workflows, or service settings.";
  if (ext === ".css" || ext === ".scss") return "Stylesheet defining visual presentation and UI styling rules.";
  if (ext === ".html") return "HTML template defining page structure and document layout.";
  if (ext === ".sql") return "SQL schema or query file managing database structure or data operations.";
  return "Repository file likely supporting application logic, configuration, or project tooling.";
}

async function summarizeFilesWithGemini(repoPath, relativePaths) {
  const summaryByPath = new Map();
  if (!GOOGLE_AI_API_KEY) {
    return summaryByPath;
  }

  const summaryModels = Array.from(
    new Set(
      [
        VISUALIZER_SUMMARY_MODEL,
        process.env.GEMINI_TEXT_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash"
      ].filter(Boolean)
    )
  );

  const prepared = [];
  for (const relPath of relativePaths) {
    try {
      const absolute = safeJoinRepoPath(repoPath, relPath);
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) continue;
      if (stat.size > 250_000) {
        prepared.push({
          path: relPath,
          snippet: `Large file (${stat.size} bytes). Summarize only by filename and likely role.`
        });
        continue;
      }
      const content = await fs.readFile(absolute, "utf-8");
      prepared.push({
        path: relPath,
        snippet: content.slice(0, VISUALIZER_SUMMARY_MAX_CHARS)
      });
    } catch {
      prepared.push({
        path: relPath,
        snippet: "Unable to read file content. Summarize only by filename."
      });
    }
  }

  for (let i = 0; i < prepared.length; i += VISUALIZER_SUMMARY_BATCH_SIZE) {
    const batch = prepared.slice(i, i + VISUALIZER_SUMMARY_BATCH_SIZE);
    const prompt = `Summarize each source file for a repository visualizer.
Return ONLY JSON in this exact shape:
{
  "summaries": [
    { "path": "file/path.ext", "summary": "single concise sentence" }
  ]
}

Rules:
- Include every provided path exactly once.
- Each summary must be specific to that file and <= 28 words.
- Focus on role, behavior, and key responsibility.
- No markdown, no extra keys, no commentary.

Files:
${JSON.stringify(batch, null, 2)}`;

    let batchApplied = false;
    for (const model of summaryModels) {
      const endpoint = `${GOOGLE_GENAI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GOOGLE_AI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const text = extractTextParts(data);
        if (!text) continue;

        const parsed = parseJsonFromModelText(text);
        const summaries = Array.isArray(parsed?.summaries) ? parsed.summaries : [];
        for (const item of summaries) {
          const relPath = String(item?.path || "");
          const summary = String(item?.summary || "").trim();
          if (relPath && summary) {
            summaryByPath.set(relPath, summary);
          }
        }
        batchApplied = summaries.length > 0;
        if (batchApplied) break;
      } catch {
        // Try next model.
      }
    }

    if (!batchApplied) {
      for (const item of batch) {
        if (!summaryByPath.has(item.path)) {
          summaryByPath.set(item.path, heuristicFileSummary(item.path));
        }
      }
    }
  }

  return summaryByPath;
}

async function buildRepositoryGraph(repoPath, options = {}) {
  const includeSummaries = options.includeSummaries !== false;
  const files = await listRepoFiles(repoPath);
  const cappedFiles = files.slice(0, VISUALIZER_MAX_FILES);
  const allRelative = new Set(cappedFiles);
  const summaryByPath = includeSummaries
    ? await summarizeFilesWithGemini(repoPath, cappedFiles)
    : new Map();
  const nodes = [];
  const edges = [];
  const externalDeps = new Set();
  const rootNodeId = "__repo_root__";

  nodes.push({
    id: rootNodeId,
    label: path.basename(repoPath) || "Repository",
    group: "root",
    path: repoPath,
    summary: "Repository root node connecting all indexed files."
  });

  for (const relPath of cappedFiles) {
    nodes.push({
      id: relPath,
      label: path.basename(relPath),
      group: path.extname(relPath).replace(".", "") || "file",
      path: relPath,
      summary:
        summaryByPath.get(relPath) ||
        heuristicFileSummary(relPath)
    });
    edges.push({ from: rootNodeId, to: relPath, type: "contains" });
  }

  for (const relPath of cappedFiles) {
    try {
      const absolute = safeJoinRepoPath(repoPath, relPath);
      const stat = await fs.stat(absolute);
      if (stat.size > 250_000) continue;
      const content = await fs.readFile(absolute, "utf-8");
      const imports = extractImportsFromCode(content);
      for (const imp of imports) {
        const importType = classifyImportSource(imp);
        if (importType === "local") {
          const resolved = resolveLocalImportPath(imp, relPath, allRelative);
          if (resolved) {
            edges.push({ from: relPath, to: resolved, type: "local" });
          }
        } else {
          externalDeps.add(imp);
          edges.push({ from: relPath, to: imp, type: "external" });
        }
      }
    } catch {
      // Ignore individual file parse/read failures.
    }
  }

  return {
    repoPath,
    stats: {
      totalFiles: cappedFiles.length,
      totalEdges: edges.length,
      summaryModel: includeSummaries && GOOGLE_AI_API_KEY ? VISUALIZER_SUMMARY_MODEL : null,
      externalDependencies: Array.from(externalDeps).sort().slice(0, 100)
    },
    nodes,
    edges
  };
}

async function resolveRepoFullNameToLocalPath(repoFullName) {
  const { owner, repo } = parseRepoFullName(repoFullName);

  const candidates = [];
  if (LOCAL_REPOS_ROOT) {
    candidates.push(path.resolve(LOCAL_REPOS_ROOT, owner, repo));
    candidates.push(path.resolve(LOCAL_REPOS_ROOT, repo));
  }

  const cwd = process.cwd();
  if (path.basename(cwd) === repo) {
    candidates.push(cwd);
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    `No local checkout found for ${repoFullName}. Set LOCAL_REPOS_ROOT in .env to your repos directory.`
  );
}

function extractTextParts(apiResponse) {
  const candidates = apiResponse?.candidates || [];
  const parts = candidates.flatMap((candidate) => candidate?.content?.parts || []);
  return parts
    .filter((part) => typeof part?.text === "string" && part.text.trim())
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function parseJsonFromModelText(text) {
  const fenced = text.match(/```json\\s*([\\s\\S]*?)```/i);
  const raw = fenced?.[1] || text;
  return JSON.parse(raw);
}

async function callGeminiJson({
  prompt,
  model = ROBOT_AGENT_MODEL,
  fallback = null
}) {
  if (!GOOGLE_AI_API_KEY) {
    return fallback;
  }

  const endpoint = `${GOOGLE_GENAI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_AI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const text = extractTextParts(data);
    if (!text) {
      return fallback;
    }

    return parseJsonFromModelText(text);
  } catch {
    return fallback;
  }
}

async function generateIntegrationDiagramWithNanoBanana(repoFullName) {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY (or GEMINI_API_KEY).");
  }

  const prompt = `You are generating one engineering artifact for a robotics team workspace.
Return ONLY JSON with this exact shape:
{
  "title": "string",
  "description": "string",
  "mermaid": "string",
  "labels": ["string", "string", "string", "string"]
}

Task:
- Create a polished labeled integration diagram for repo "${repoFullName}".
- Context must include: ELEGOO car base, LeRobot arm, Jetson NX, camera/audio input, Robot Graph, Build Planner, Verifier, and patch/rerun loop.
- Mermaid must be valid flowchart syntax with LR direction.
- Keep description concise (<= 200 chars).
- No markdown, no backticks, JSON only.`;

  const endpoint = `${GOOGLE_GENAI_BASE_URL}/models/${encodeURIComponent(
    NANO_BANANA_MODEL
  )}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GOOGLE_AI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Nano Banana request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = extractTextParts(data);
  if (!text) {
    throw new Error(
      "Nano Banana returned no text content. Try a model that supports text output for this endpoint."
    );
  }

  const parsed = parseJsonFromModelText(text);
  if (!parsed?.title || !parsed?.description || !parsed?.mermaid) {
    throw new Error("Nano Banana response was missing required artifact fields.");
  }

  return {
    title: String(parsed.title),
    description: String(parsed.description),
    mermaid: String(parsed.mermaid),
    labels: Array.isArray(parsed.labels) ? parsed.labels.map((v) => String(v)) : [],
    generatedAt: new Date().toISOString(),
    generatedBy: {
      provider: "google",
      product: "nano-banana",
      model: NANO_BANANA_MODEL
    }
  };
}

function robotGraphFilePath(repoFullName) {
  const safe = String(repoFullName || "default-robot")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return path.join(robotGraphDir, `${safe || "default-robot"}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function createSeedRobotGraph(repoFullName) {
  const timestamp = nowIso();
  return {
    metadata: {
      repoFullName,
      robotName: "Forge Demo Robot",
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
      summary:
        "Seeded graph for the YC x Google DeepMind hackathon stack: ELEGOO rover, LeRobot arm, Jetson NX, camera, audio, planner, verifier.",
      goals: [
        "Unify robot docs, code, and discovered part evidence.",
        "Support pick-and-drive demo planning.",
        "Patch component and port facts when verification finds a mismatch."
      ]
    },
    nodes: [
      {
        id: "elegoo_car_base",
        label: "ELEGOO Car Base",
        category: "mobility",
        status: "known",
        description: "Rover chassis and drive platform.",
        interfaces: ["power", "motor-control"],
        ports: [],
        evidence: [{ type: "seed", title: "Hackathon demo baseline", source: "planner-doc" }]
      },
      {
        id: "lerobot_arm",
        label: "LeRobot Arm",
        category: "manipulator",
        status: "known",
        description: "Manipulator for pick-and-place actions mounted onto the rover.",
        interfaces: ["usb", "serial", "power"],
        ports: [{ name: "/dev/ttyUSB0", type: "serial", direction: "bidirectional" }],
        evidence: [{ type: "seed", title: "Hackathon demo baseline", source: "planner-doc" }]
      },
      {
        id: "jetson_nx",
        label: "Jetson NX",
        category: "compute",
        status: "known",
        description: "Primary onboard compute brain for planning, perception, and verification.",
        interfaces: ["usb", "csi", "gpio", "uart", "ethernet", "audio"],
        ports: [],
        evidence: [{ type: "seed", title: "Hackathon demo baseline", source: "planner-doc" }]
      },
      {
        id: "vision_camera",
        label: "Camera",
        category: "sensor",
        status: "needs-verification",
        description: "Primary video input for multimodal graph building and live bench verification.",
        interfaces: ["usb", "csi"],
        ports: [],
        evidence: [{ type: "seed", title: "Planner demo mentions camera/video", source: "planner-doc" }]
      },
      {
        id: "audio_input",
        label: "Audio Input",
        category: "sensor",
        status: "needs-verification",
        description: "Microphone or audio capture path for sound-based verification.",
        interfaces: ["usb", "audio-jack"],
        ports: [],
        evidence: [{ type: "seed", title: "Planner demo mentions audio", source: "planner-doc" }]
      },
      {
        id: "planner_agent",
        label: "Planner Agent",
        category: "agent",
        status: "active",
        description: "Turns a task into an integration plan against the robot graph.",
        interfaces: ["graph-read", "graph-write"],
        ports: [],
        evidence: [{ type: "seed", title: "Planner agent requested by product scope", source: "user-request" }]
      },
      {
        id: "verifier_agent",
        label: "Verifier Agent",
        category: "agent",
        status: "active",
        description: "Checks observations against graph facts and patches mismatches.",
        interfaces: ["graph-read", "graph-write", "video", "audio"],
        ports: [],
        evidence: [{ type: "seed", title: "Verifier agent requested by product scope", source: "user-request" }]
      }
    ],
    edges: [
      {
        source: "jetson_nx",
        target: "lerobot_arm",
        label: "controls over USB serial",
        status: "needs-verification"
      },
      {
        source: "jetson_nx",
        target: "vision_camera",
        label: "receives video stream",
        status: "needs-verification"
      },
      {
        source: "jetson_nx",
        target: "audio_input",
        label: "receives audio stream",
        status: "needs-verification"
      },
      {
        source: "elegoo_car_base",
        target: "lerobot_arm",
        label: "mechanical mount",
        status: "planned"
      },
      {
        source: "planner_agent",
        target: "verifier_agent",
        label: "patch and rerun loop",
        status: "active"
      }
    ],
    runs: {
      planner: [],
      verifier: [],
      discovery: []
    }
  };
}

async function loadRobotGraph(repoFullName) {
  const filePath = robotGraphFilePath(repoFullName);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    const seeded = createSeedRobotGraph(repoFullName);
    await saveRobotGraph(repoFullName, seeded);
    return seeded;
  }
}

async function saveRobotGraph(repoFullName, graph) {
  const nextGraph = {
    ...graph,
    metadata: {
      ...graph.metadata,
      repoFullName,
      updatedAt: nowIso(),
      revision: Number(graph.metadata?.revision || 0) + 1
    }
  };
  await fs.writeFile(robotGraphFilePath(repoFullName), JSON.stringify(nextGraph, null, 2));
  return nextGraph;
}

function pushUnique(list, value) {
  if (!value) return list;
  if (!list.includes(value)) {
    list.push(value);
  }
  return list;
}

function ensureNode(graph, candidate) {
  const existing = graph.nodes.find((node) => node.id === candidate.id);
  if (existing) return existing;
  const created = {
    ports: [],
    interfaces: [],
    evidence: [],
    ...candidate
  };
  graph.nodes.push(created);
  return created;
}

function upsertEdge(graph, edge) {
  const existing = graph.edges.find(
    (item) =>
      item.source === edge.source &&
      item.target === edge.target &&
      item.label.toLowerCase() === edge.label.toLowerCase()
  );
  if (existing) {
    existing.status = edge.status || existing.status;
    return existing;
  }
  graph.edges.push(edge);
  return edge;
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function summarizeGraph(graph) {
  const verificationNeeded = graph.nodes.filter((node) => node.status === "needs-verification").length;
  return {
    revision: graph.metadata?.revision || 0,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    verificationNeeded,
    discoveryRuns: graph.runs?.discovery?.length || 0,
    plannerRuns: graph.runs?.planner?.length || 0,
    verifierRuns: graph.runs?.verifier?.length || 0,
    updatedAt: graph.metadata?.updatedAt || graph.metadata?.createdAt || nowIso()
  };
}

function graphToMermaid(graph) {
  const lines = ["flowchart LR"];
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}[\"${String(node.label || node.id).replace(/"/g, "'")}\"]`);
  }
  for (const edge of graph.edges) {
    const label = String(edge.label || "").replace(/"/g, "'");
    lines.push(`  ${edge.source} -->|\"${label}\"| ${edge.target}`);
  }
  return lines.join("\n");
}

function htmlEntityDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return htmlEntityDecode(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeSearchResultUrl(rawUrl) {
  const decoded = htmlEntityDecode(rawUrl);
  const withProtocol = decoded.startsWith("//") ? `https:${decoded}` : decoded;
  try {
    const url = new URL(withProtocol);
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : withProtocol;
  } catch {
    return withProtocol;
  }
}

async function searchDuckDuckGo(query) {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "forge-rde"
    }
  });

  if (!response.ok) {
    throw new Error(`Parts search failed (${response.status}).`);
  }

  const html = await response.text();
  const matches = Array.from(
    html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
  );

  return matches.slice(0, 6).map((match, index) => ({
    rank: index + 1,
    url: normalizeSearchResultUrl(match[1]),
    title: stripHtml(match[2])
  }));
}

async function fetchSearchEvidence(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "forge-rde"
      }
    });
    if (!response.ok) {
      return { url, excerpt: "", sourceType: "unavailable" };
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("pdf")) {
      return { url, excerpt: "PDF datasheet discovered.", sourceType: "pdf" };
    }
    const html = await response.text();
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const descriptionMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    const excerpt = stripHtml(descriptionMatch?.[1] || html).slice(0, 280);
    return {
      url,
      title: stripHtml(titleMatch?.[1] || ""),
      excerpt,
      sourceType: contentType.includes("html") ? "web" : "unknown"
    };
  } catch {
    return { url, excerpt: "", sourceType: "unavailable" };
  }
}

function inferCategoryFromSearch(title, excerpt) {
  const text = `${title} ${excerpt}`.toLowerCase();
  if (text.includes("camera") || text.includes("depth")) return "sensor";
  if (text.includes("motor driver") || text.includes("servo driver")) return "actuation";
  if (text.includes("battery") || text.includes("power")) return "power";
  if (text.includes("arm") || text.includes("gripper")) return "manipulator";
  return "part-candidate";
}

function extractPortsAndInterfaces(text) {
  const source = String(text || "");
  const ports = Array.from(new Set(source.match(/\/dev\/(?:tty[A-Za-z]+|cu\.[A-Za-z0-9._-]+|tty\w+)/g) || []));
  const lowered = source.toLowerCase();
  const interfaces = [];
  const known = [
    "usb",
    "uart",
    "i2c",
    "spi",
    "gpio",
    "csi",
    "ethernet",
    "can",
    "serial",
    "audio"
  ];
  for (const item of known) {
    if (lowered.includes(item)) {
      interfaces.push(item);
    }
  }
  return { ports, interfaces };
}

function buildDiscoveryNodes(query, results) {
  return results.map((result, index) => {
    const category = inferCategoryFromSearch(result.title, result.excerpt || "");
    const { ports, interfaces } = extractPortsAndInterfaces(`${result.title} ${result.excerpt || ""}`);
    return {
      id: `${toSlug(category)}_${toSlug(result.title).slice(0, 28) || index + 1}`,
      label: result.title || `Candidate ${index + 1}`,
      category,
      status: "candidate",
      description: result.excerpt || "Candidate component discovered from web search.",
      interfaces,
      ports: ports.map((port) => ({ name: port, type: "observed", direction: "unknown" })),
      evidence: [
        {
          type: "search-result",
          title: result.title || "Search result",
          url: result.url,
          excerpt: result.excerpt || "",
          source: "duckduckgo"
        }
      ]
    };
  });
}

function mergeDiscoveryIntoGraph(graph, query, discoveryNodes) {
  const createdIds = [];
  for (const node of discoveryNodes) {
    const existing = graph.nodes.find(
      (item) => item.label.toLowerCase() === node.label.toLowerCase() || item.id === node.id
    );
    if (existing) {
      existing.status = existing.status === "known" ? existing.status : "candidate";
      existing.description = existing.description || node.description;
      for (const iface of node.interfaces || []) {
        pushUnique(existing.interfaces, iface);
      }
      for (const port of node.ports || []) {
        if (!existing.ports.some((item) => item.name === port.name)) {
          existing.ports.push(port);
        }
      }
      existing.evidence = [...(existing.evidence || []), ...(node.evidence || [])].slice(-8);
      createdIds.push(existing.id);
      continue;
    }

    graph.nodes.push(node);
    createdIds.push(node.id);
    upsertEdge(graph, {
      source: "planner_agent",
      target: node.id,
      label: `research for ${query.slice(0, 42)}`,
      status: "candidate"
    });
  }
  return createdIds;
}

async function discoverRobotParts(repoFullName, query) {
  const graph = await loadRobotGraph(repoFullName);
  const rawResults = await searchPartsBrowserbase(query);
  const enriched = [];
  for (const result of rawResults) {
    const evidence = await fetchSearchEvidence(result.url);
    enriched.push({
      ...result,
      excerpt: evidence.excerpt || "",
      sourceType: evidence.sourceType || "web"
    });
  }

  const discoveryNodes = buildDiscoveryNodes(query, enriched);
  const mergedNodeIds = mergeDiscoveryIntoGraph(graph, query, discoveryNodes);
  const run = {
    query,
    createdAt: nowIso(),
    resultCount: enriched.length,
    mergedNodeIds,
    results: enriched
  };
  graph.runs.discovery.unshift(run);
  return {
    graph: await saveRobotGraph(repoFullName, graph),
    run
  };
}

function buildPlannerPlan(graph, objective) {
  const missingNodes = graph.nodes.filter((node) => node.status === "needs-verification");
  const plan = {
    objective,
    createdAt: nowIso(),
    phases: [
      {
        name: "Stabilize Graph",
        tasks: [
          "Confirm the exact camera path and transport mode.",
          "Confirm the audio capture device and whether it is USB or analog.",
          "Verify the manipulator serial device path on the Jetson."
        ]
      },
      {
        name: "Mechanical + Electrical Integration",
        tasks: [
          "Mount the LeRobot arm onto the ELEGOO rover with a rigid bracket and center-of-mass check.",
          "Route clean power distribution between Jetson NX, rover base, and manipulator.",
          "Label every cable and document the final interface path in the graph."
        ]
      },
      {
        name: "Bringup",
        tasks: [
          "Bring up the Jetson, arm controller, camera, and audio pipeline one subsystem at a time.",
          "Record observed device nodes such as /dev/ttyACM0 or /dev/ttyUSB0.",
          "Run the verifier after each bringup step and patch the graph before continuing."
        ]
      },
      {
        name: "Demo Loop",
        tasks: [
          "Execute a pick-and-drive mission.",
          "Capture visual and audio evidence while the verifier compares behavior to the graph.",
          "Save the best plan/fix artifacts into the team workspace."
        ]
      }
    ],
    requiredSearches: [
      "mounting bracket for LeRobot arm on ELEGOO rover",
      "Jetson NX compatible camera datasheet",
      "Jetson NX USB microphone robotics"
    ],
    blockers: missingNodes.map((node) => `${node.label} is still marked ${node.status}`),
    recommendedOrder: graph.edges.map((edge) => `${edge.source} -> ${edge.target}: ${edge.label}`)
  };
  return plan;
}

async function runPlanner(repoFullName, objective) {
  const graph = await loadRobotGraph(repoFullName);
  const plan = buildPlannerPlan(graph, objective);
  graph.runs.planner.unshift(plan);
  return {
    graph: await saveRobotGraph(repoFullName, graph),
    plan
  };
}

function chooseVerificationNode(graph, observationText) {
  const text = observationText.toLowerCase();
  if (text.includes("camera") || text.includes("csi") || text.includes("video")) {
    return graph.nodes.find((node) => node.id === "vision_camera");
  }
  if (text.includes("audio") || text.includes("mic")) {
    return graph.nodes.find((node) => node.id === "audio_input");
  }
  if (text.includes("arm") || text.includes("gripper") || text.includes("tty")) {
    return graph.nodes.find((node) => node.id === "lerobot_arm");
  }
  return graph.nodes.find((node) => node.id === "jetson_nx");
}

function applyVerification(graph, observationText) {
  const findings = [];
  const targetNode = chooseVerificationNode(graph, observationText);
  const parsed = extractPortsAndInterfaces(observationText);
  const expectedPorts = (targetNode?.ports || []).map((port) => port.name);

  if (targetNode && parsed.ports.length) {
    for (const port of parsed.ports) {
      if (!targetNode.ports.some((item) => item.name === port)) {
        targetNode.ports.push({ name: port, type: "observed", direction: "bidirectional" });
      }
    }

    if (expectedPorts.length && !parsed.ports.some((port) => expectedPorts.includes(port))) {
      findings.push({
        type: "port-mismatch",
        nodeId: targetNode.id,
        severity: "high",
        message: `${targetNode.label} expected ${expectedPorts.join(", ")} but observed ${parsed.ports.join(", ")}.`
      });
    } else {
      findings.push({
        type: "port-confirmed",
        nodeId: targetNode.id,
        severity: "info",
        message: `${targetNode.label} observed on ${parsed.ports.join(", ")}.`
      });
    }
  }

  if (targetNode && parsed.interfaces.length) {
    for (const item of parsed.interfaces) {
      pushUnique(targetNode.interfaces, item);
    }
    if (targetNode.status === "needs-verification") {
      targetNode.status = "known";
    }
  }

  if (/expected/i.test(observationText) && /observed/i.test(observationText) && !findings.length) {
    findings.push({
      type: "mismatch-note",
      nodeId: targetNode?.id || "unknown",
      severity: "medium",
      message: "Observation indicates an expected-versus-observed mismatch. Graph was updated with the new evidence."
    });
  }

  if (targetNode) {
    targetNode.evidence = [
      ...(targetNode.evidence || []),
      {
        type: "verification",
        title: "Verifier observation",
        excerpt: observationText.slice(0, 280),
        source: "verifier-agent"
      }
    ].slice(-10);
  }

  const run = {
    createdAt: nowIso(),
    observationText,
    targetNodeId: targetNode?.id || null,
    findings
  };
  graph.runs.verifier.unshift(run);
  return run;
}

async function runVerifier(repoFullName, observationText) {
  const graph = await loadRobotGraph(repoFullName);
  const run = applyVerification(graph, observationText);
  return {
    graph: await saveRobotGraph(repoFullName, graph),
    run
  };
}

async function getRobotWorkspace(repoFullName) {
  const graph = await loadRobotGraph(repoFullName);
  return {
    graph,
    summary: summarizeGraph(graph),
    mermaid: graphToMermaid(graph)
  };
}

function robotWorkspaceKeyForSource(source) {
  const sourceId =
    source.type === "repo"
      ? `repo:${source.repoFullName}`
      : `folder:${normalizeRepoPath(source.sourcePath)}`;
  const hash = createHash("sha1").update(sourceId).digest("hex").slice(0, 12);
  return `${source.type}-${hash}`;
}

function robotWorkspaceFilePath(source) {
  return path.join(robotWorkspaceDir, `${robotWorkspaceKeyForSource(source)}.json`);
}

async function resolveRobotWorkspaceSource({ repoFullName = "", sourcePath = "" } = {}) {
  const trimmedRepo = String(repoFullName || "").trim();
  const trimmedPath = String(sourcePath || "").trim();

  if (!trimmedRepo && !trimmedPath) {
    throw new Error("repoFullName or sourcePath is required.");
  }

  if (trimmedRepo) {
    const resolvedPath = await resolveRepoFullNameToLocalPath(trimmedRepo);
    return {
      type: "repo",
      repoFullName: trimmedRepo,
      sourcePath: resolvedPath,
      label: trimmedRepo,
      provenanceTag: "repo"
    };
  }

  const normalizedPath = normalizeRepoPath(trimmedPath);
  const stat = await fs.stat(normalizedPath);
  if (!stat.isDirectory()) {
    throw new Error("sourcePath must be a directory.");
  }

  return {
    type: "folder",
    repoFullName: "",
    sourcePath: normalizedPath,
    label: path.basename(normalizedPath) || normalizedPath,
    provenanceTag: "folder"
  };
}

function createWorkspaceNode(node) {
  const componentMeta = getRobotComponentMeta(node.componentId);
  return {
    status: "known",
    provenance: [],
    interfaces: [],
    ports: [],
    evidence: [],
    badges: [],
    componentId: componentMeta.id,
    componentLabel: componentMeta.label,
    componentColorToken: componentMeta.colorToken,
    componentSource: "heuristic",
    componentReason: "",
    manualComponentOverride: null,
    ...node
  };
}

function createSeedRobotWorkspace(source) {
  const createdAt = nowIso();
  return {
    metadata: {
      workspaceId: randomUUID(),
      createdAt,
      updatedAt: createdAt,
      revision: 1,
      model: ROBOT_AGENT_MODEL,
      source,
      title: source.label,
      summary: "Empty-by-default robot workspace. Sync a repo or folder, then build the graph from source evidence.",
      emptyState: true
    },
    graph: { nodes: [], edges: [] },
    requirements: [],
    taskSuggestions: [],
    selectedOptionBindings: [],
    runs: {
      sync: [],
      planner: [],
      verifier: [],
      discovery: []
    }
  };
}

function assignComponentToNode(node, componentId, source = "heuristic") {
  const meta = getRobotComponentMeta(componentId);
  node.componentId = meta.id;
  node.componentLabel = meta.label;
  node.componentColorToken = meta.colorToken;
  node.componentSource = source;
  return node;
}

function manualComponentOverrideByNodeId(workspace) {
  const map = new Map();
  for (const node of workspace.graph.nodes || []) {
    if (node.manualComponentOverride) {
      map.set(node.id, node.manualComponentOverride);
    }
  }
  return map;
}

async function loadRobotWorkspaceState(source) {
  const filePath = robotWorkspaceFilePath(source);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    parsed.metadata = {
      ...(parsed.metadata || {}),
      source
    };
    parsed.graph = parsed.graph || { nodes: [], edges: [] };
    parsed.graph.nodes = (parsed.graph.nodes || []).map((node) =>
      createWorkspaceNode({
        ...node,
        componentId: node.manualComponentOverride || node.componentId || "unknown"
      })
    );
    parsed.graph.edges = parsed.graph.edges || [];
    parsed.requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];
    parsed.taskSuggestions = Array.isArray(parsed.taskSuggestions) ? parsed.taskSuggestions : [];
    parsed.selectedOptionBindings = Array.isArray(parsed.selectedOptionBindings)
      ? parsed.selectedOptionBindings
      : [];
    parsed.runs = parsed.runs || { sync: [], planner: [], verifier: [], discovery: [] };
    return parsed;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    const seeded = createSeedRobotWorkspace(source);
    await fs.writeFile(filePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

async function saveRobotWorkspaceState(workspace) {
  const filePath = robotWorkspaceFilePath(workspace.metadata.source);
  const next = {
    ...workspace,
    metadata: {
      ...(workspace.metadata || {}),
      updatedAt: nowIso(),
      revision: Number(workspace.metadata?.revision || 0) + 1
    }
  };
  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return next;
}

function removeWorkspaceGraphOrigin(workspace, origin) {
  workspace.graph.nodes = workspace.graph.nodes.filter((node) => node.origin !== origin);
  workspace.graph.edges = workspace.graph.edges.filter((edge) => edge.origin !== origin);
}

function findWorkspaceNode(workspace, nodeId) {
  return workspace.graph.nodes.find((node) => node.id === nodeId);
}

function addWorkspaceNode(workspace, node) {
  const existing = findWorkspaceNode(workspace, node.id);
  if (existing) {
    const manualOverride = existing.manualComponentOverride || null;
    Object.assign(existing, {
      ...existing,
      ...node,
      provenance: Array.from(new Set([...(existing.provenance || []), ...(node.provenance || [])])),
      badges: Array.from(new Set([...(existing.badges || []), ...(node.badges || [])])),
      interfaces: Array.from(new Set([...(existing.interfaces || []), ...(node.interfaces || [])])),
      ports: [...(existing.ports || []), ...(node.ports || [])].filter(
        (port, index, ports) => ports.findIndex((item) => item.name === port.name) === index
      ),
      evidence: [...(existing.evidence || []), ...(node.evidence || [])].slice(-12),
      manualComponentOverride: manualOverride
    });
    assignComponentToNode(
      existing,
      manualOverride || node.componentId || existing.componentId || "unknown",
      manualOverride ? "manual" : node.componentSource || existing.componentSource || "heuristic"
    );
    return existing;
  }
  workspace.graph.nodes.push(
    createWorkspaceNode({
      ...node,
      componentId: node.manualComponentOverride || node.componentId || "unknown"
    })
  );
  return workspace.graph.nodes[workspace.graph.nodes.length - 1];
}

function addWorkspaceEdge(workspace, edge) {
  const existing = workspace.graph.edges.find(
    (item) =>
      item.from === edge.from &&
      item.to === edge.to &&
      String(item.label || "").toLowerCase() === String(edge.label || "").toLowerCase()
  );
  if (existing) {
    Object.assign(existing, edge);
    return existing;
  }
  workspace.graph.edges.push(edge);
  return edge;
}

function workspaceSummary(workspace) {
  const nodes = workspace.graph?.nodes || [];
  const edges = workspace.graph?.edges || [];
  return {
    revision: workspace.metadata?.revision || 0,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    requirementCount: workspace.requirements?.length || 0,
    openRequirementCount: (workspace.requirements || []).filter((req) => req.status !== "resolved").length,
    plannerRuns: workspace.runs?.planner?.length || 0,
    verifierRuns: workspace.runs?.verifier?.length || 0,
    discoveryRuns: workspace.runs?.discovery?.length || 0,
    selectedBindings: workspace.selectedOptionBindings?.length || 0,
    sourceLabel: workspace.metadata?.source?.label || "",
    sourceType: workspace.metadata?.source?.type || "repo",
    updatedAt: workspace.metadata?.updatedAt || workspace.metadata?.createdAt || nowIso()
  };
}

function workspaceGraphToMermaid(workspace) {
  const lines = ["flowchart LR"];
  for (const node of workspace.graph.nodes || []) {
    lines.push(`  ${toSlug(node.id).replace(/_/g, "")}[\"${String(node.label || node.id).replace(/"/g, "'")}\"]`);
  }
  for (const edge of workspace.graph.edges || []) {
    const from = toSlug(edge.from).replace(/_/g, "");
    const to = toSlug(edge.to).replace(/_/g, "");
    lines.push(`  ${from} -->|\"${String(edge.label || "").replace(/"/g, "'")}\"| ${to}`);
  }
  return lines.join("\n");
}

function sourceRootNodeId(source) {
  return `source:${source.type}:root`;
}

function sourceFileNodeId(source, relPath) {
  return `source:${source.type}:file:${relPath}`;
}

function relevantSourceFiles(sourceGraph) {
  const preferred = (sourceGraph.nodes || [])
    .filter((node) => node.id !== "__repo_root__")
    .filter((node) =>
      /robot|arm|camera|audio|motor|servo|control|launch|bench|sensor|vision|readme|package|requirements|config|yaml|yml|json|py|js|ts|tsx|jsx/i.test(
        `${node.path || ""} ${node.label || ""}`
      )
    )
    .slice(0, 24);

  if (preferred.length >= 8) return preferred;
  return (sourceGraph.nodes || []).filter((node) => node.id !== "__repo_root__").slice(0, 24);
}

async function extractRobotSourceInsights(source, sourceGraph) {
  const candidates = relevantSourceFiles(sourceGraph)
    .slice(0, 10)
    .map((node) => ({
      path: node.path,
      summary: node.summary,
      label: node.label
    }));

  const fallback = {
    components: [],
    requirements: [],
    notes: []
  };

  if (!candidates.length) {
    return fallback;
  }

  const prompt = `You are Gemini 3.1 acting as a robotics graph builder.
Return ONLY JSON with this exact shape:
{
  "components": [
    {
      "label": "string",
      "kind": "hardware_component|software_component|port|capability",
      "componentId": "arm|base|camera|audio|compute|planner|verifier|parts|source|task|unknown",
      "description": "string",
      "reason": "string",
      "status": "known|needs-verification|candidate",
      "relatedPath": "string",
      "interfaces": ["string"],
      "ports": ["string"]
    }
  ],
  "requirements": [
    {
      "title": "string",
      "description": "string",
      "capability": "string",
      "searchQuery": "string"
    }
  ],
  "notes": ["string"]
}

Source label: ${source.label}
Source type: ${source.type}
Files:
${JSON.stringify(candidates, null, 2)}

Rules:
- Identify robotics-relevant components, ports, and missing requirements only.
- componentId should represent which robot subsystem the file or capability most likely belongs to.
- Prefer concrete ports/interfaces if present.
- Keep descriptions concise.
- No markdown, no commentary.`;

  return (await callGeminiJson({ prompt, fallback })) || fallback;
}

function inferInterfacesFromText(text) {
  return extractPortsAndInterfaces(text).interfaces;
}

function makeRequirementNodeId(requirementId) {
  return `requirement:${requirementId}`;
}

function makeCandidateOptionNodeId(requirementId, optionId) {
  return `candidate:${requirementId}:${optionId}`;
}

function makeTaskNodeId(taskId) {
  return `task:${taskId}`;
}

function ensureWorkspaceAgentNode(workspace, agentId, label, componentId, description) {
  return addWorkspaceNode(workspace, {
    id: agentId,
    label,
    kind: "software_component",
    category: "agent",
    status: "known",
    description,
    provenance: ["workspace-agent"],
    badges: ["agent"],
    componentId,
    componentSource: "heuristic",
    componentReason: "System agent node attached to planning, verification, or discovery graph updates.",
    origin: "agent-system"
  });
}

function syncRequirementNodes(workspace) {
  removeWorkspaceGraphOrigin(workspace, "requirement");
  removeWorkspaceGraphOrigin(workspace, "agent-system");

  const plannerNode = ensureWorkspaceAgentNode(
    workspace,
    "agent:planner",
    "Planner Agent",
    "planner",
    "Generates mission boards, requirements, and assignable tasks from the current workspace graph."
  );
  const verifierNode = ensureWorkspaceAgentNode(
    workspace,
    "agent:verifier",
    "Verifier Agent",
    "verifier",
    "Runs source-driven checks and pushes findings back into the robot graph."
  );
  const partsNode = ensureWorkspaceAgentNode(
    workspace,
    "agent:parts-discovery",
    "Parts Discovery Agent",
    "parts",
    "Ranks candidate parts and datasheet-backed options for missing capabilities."
  );

  for (const requirement of workspace.requirements) {
    addWorkspaceNode(workspace, {
      id: makeRequirementNodeId(requirement.id),
      label: requirement.title,
      kind: "requirement",
      category: "requirement",
      status: requirement.status === "resolved" ? "known" : "candidate",
      description: requirement.description,
      provenance: [requirement.source || "user"],
      badges: ["requirement", requirement.source || "user"],
      evidence: requirement.evidence || [],
      componentId: "parts",
      componentSource: "heuristic",
      componentReason: "Requirements represent missing parts or capabilities to resolve.",
      origin: "requirement"
    });

    const requirementSourceNodeId =
      requirement.source === "planner"
        ? plannerNode.id
        : requirement.source === "source"
          ? sourceRootNodeId(workspace.metadata.source)
          : partsNode.id;

    addWorkspaceEdge(workspace, {
      from: requirementSourceNodeId,
      to: makeRequirementNodeId(requirement.id),
      label: "requires",
      status: requirement.status,
      kind: "requirement-link",
      provenance: [requirement.source || "planner"],
      origin: "requirement"
    });

    for (const option of requirement.options || []) {
      addWorkspaceNode(workspace, {
        id: makeCandidateOptionNodeId(requirement.id, option.id),
        label: option.title,
        kind: option.selected ? "selected_part" : "candidate_part",
        category: "part-option",
        status: option.selected ? "known" : "candidate",
        description: option.fitSummary || option.excerpt || "Candidate part option.",
        provenance: ["parts discovery"],
        badges: ["parts discovery", option.selected ? "selected" : "option"],
        interfaces: option.interfaces || [],
        ports: (option.ports || []).map((port) => ({
          name: port,
          type: "observed",
          direction: "unknown"
        })),
        evidence: [
          {
            type: "option",
            title: option.title,
            url: option.url,
            excerpt: option.excerpt || "",
            source: option.sourceType || "web"
          }
        ],
        componentId: "parts",
        componentSource: "heuristic",
        componentReason: "Candidate and selected part options belong to the parts subsystem.",
        origin: "requirement"
      });

      addWorkspaceEdge(workspace, {
        from: partsNode.id,
        to: makeCandidateOptionNodeId(requirement.id, option.id),
        label: option.selected ? "selected option" : "candidate option",
        status: option.selected ? "active" : "candidate",
        kind: "part-option-link",
        provenance: ["parts discovery"],
        origin: "requirement"
      });
    }
  }
}

function syncTaskSuggestionNodes(workspace) {
  removeWorkspaceGraphOrigin(workspace, "task-suggestion");

  const plannerNode = findWorkspaceNode(workspace, "agent:planner");
  const verifierNode = findWorkspaceNode(workspace, "agent:verifier");

  for (const suggestion of workspace.taskSuggestions || []) {
    addWorkspaceNode(workspace, {
      id: makeTaskNodeId(suggestion.id),
      label: suggestion.title,
      kind: "task",
      category: "task",
      status: "candidate",
      description: suggestion.description,
      provenance: [suggestion.source || "planner"],
      badges: ["task", suggestion.source || "planner"],
      evidence: suggestion.sourceRunId
        ? [{ type: "task-suggestion", title: suggestion.sourceRunId, source: suggestion.source || "planner" }]
        : [],
      componentId: "task",
      componentSource: "heuristic",
      componentReason: "Suggested tasks are team work items derived from planner or verifier runs.",
      origin: "task-suggestion"
    });
    const sourceAgentNodeId = suggestion.source === "verifier" ? verifierNode?.id : plannerNode?.id;
    if (sourceAgentNodeId) {
      addWorkspaceEdge(workspace, {
        from: sourceAgentNodeId,
        to: makeTaskNodeId(suggestion.id),
        label: "work item",
        status: "candidate",
        kind: "task-link",
        provenance: [suggestion.source || "planner"],
        origin: "task-suggestion"
      });
    }
    if (suggestion.relatedNodeId && findWorkspaceNode(workspace, suggestion.relatedNodeId)) {
      addWorkspaceEdge(workspace, {
        from: suggestion.relatedNodeId,
        to: makeTaskNodeId(suggestion.id),
        label: "owns task",
        status: "candidate",
        kind: "task-link",
        provenance: [suggestion.source || "planner"],
        origin: "task-suggestion"
      });
    }
  }
}

function buildInsightAssignmentMap(insights) {
  const map = new Map();
  for (const component of insights?.components || []) {
    const key = String(component.relatedPath || "").trim();
    if (!key) continue;
    const inferred = inferRobotComponentFromText(
      `${component.componentId || ""} ${component.label || ""} ${component.description || ""} ${key}`
    );
    map.set(key, {
      componentId: component.componentId || inferred.id,
      reason: component.reason || component.description || "Gemini classified this source node by robotics responsibility."
    });
  }
  return map;
}

function resolveComponentAssignment({ node, insightMap, manualOverride = null, fallbackText = "" }) {
  if (manualOverride) {
    const meta = getRobotComponentMeta(manualOverride);
    return {
      componentId: meta.id,
      componentSource: "manual",
      componentReason: "Manually overridden in node details."
    };
  }

  const byPath = insightMap.get(String(node.path || ""));
  if (byPath) {
    return {
      componentId: byPath.componentId,
      componentSource: "gemini",
      componentReason: byPath.reason
    };
  }

  const inferred = inferRobotComponentFromText(
    `${node.path || ""} ${node.label || ""} ${node.summary || ""} ${fallbackText}`
  );
  return {
    componentId: inferred.id,
    componentSource: "heuristic",
    componentReason:
      inferred.id === "unknown"
        ? "No confident robot component match was inferred from the current source evidence."
        : `Inferred from source filename, summary, and robotics-related keywords for the ${inferred.label.toLowerCase()} subsystem.`
  };
}

function buildSourceGraphPreview(workspace, sourceGraph, source, insightMap, manualOverrides) {
  removeWorkspaceGraphOrigin(workspace, "source-graph");

  addWorkspaceNode(workspace, {
    id: sourceRootNodeId(source),
    label: source.label,
    kind: "software_component",
    category: source.type === "repo" ? "repo-root" : "folder-root",
    description:
      source.type === "repo"
        ? "Repo-derived source graph connected to the robot workspace."
        : "Folder-derived source graph connected to the robot workspace.",
    provenance: [source.provenanceTag],
    badges: [source.provenanceTag, "source root"],
    evidence: [{ type: source.type, title: source.label, source: source.sourcePath }],
    componentId: "source",
    componentSource: "heuristic",
    componentReason: "Root node for the active source tree.",
    origin: "source-graph"
  });

  const previewNodes = relevantSourceFiles(sourceGraph).slice(0, 18);
  for (const node of previewNodes) {
    const fileNodeId = sourceFileNodeId(source, node.path || node.id);
    const componentAssignment = resolveComponentAssignment({
      node,
      insightMap,
      manualOverride: manualOverrides.get(fileNodeId),
      fallbackText: source.label
    });
    addWorkspaceNode(workspace, {
      id: fileNodeId,
      label: node.label || path.basename(node.path || node.id),
      kind: "software_component",
      category: "source-file",
      description: node.summary || "Source-derived file node.",
      provenance: [source.provenanceTag],
      badges: [source.provenanceTag, "source file"],
      evidence: [
        {
          type: "source-file",
          title: node.path || node.label,
          excerpt: node.summary || "",
          source: source.sourcePath
        }
      ],
      manualComponentOverride: manualOverrides.get(fileNodeId) || null,
      ...componentAssignment,
      origin: "source-graph"
    });
    addWorkspaceEdge(workspace, {
      from: sourceRootNodeId(source),
      to: fileNodeId,
      label: "contains",
      status: "known",
      kind: "contains",
      provenance: [source.provenanceTag],
      origin: "source-graph"
    });
  }
}

function mergeInsightComponents(workspace, source, insights, manualOverrides) {
  removeWorkspaceGraphOrigin(workspace, "source-insights");

  for (const component of insights.components || []) {
    const componentId = `insight:${toSlug(component.label)}`;
    const componentMeta = component.componentId
      ? getRobotComponentMeta(component.componentId)
      : inferRobotComponentFromText(
          `${component.label || ""} ${component.description || ""} ${component.relatedPath || ""}`
        );
    addWorkspaceNode(workspace, {
      id: componentId,
      label: component.label,
      kind: component.kind || "software_component",
      category: component.kind || "software_component",
      status: component.status || "known",
      description: component.description || "Gemini-derived robotics signal from source.",
      provenance: [source.provenanceTag, "gemini-3.1"],
      badges: [source.provenanceTag, "gemini-3.1"],
      interfaces: component.interfaces || [],
      ports: (component.ports || []).map((port) => ({
        name: port,
        type: "observed",
        direction: "unknown"
      })),
      evidence: [
        {
          type: "gemini-extraction",
          title: component.relatedPath || component.label,
          source: component.relatedPath || source.label
        }
      ],
      manualComponentOverride: manualOverrides.get(componentId) || null,
      componentId: manualOverrides.get(componentId) || componentMeta.id,
      componentSource: manualOverrides.get(componentId) ? "manual" : component.componentId ? "gemini" : "heuristic",
      componentReason:
        component.reason ||
        component.description ||
        "Gemini-derived robotics signal grouped by inferred subsystem ownership.",
      origin: "source-insights"
    });

    addWorkspaceEdge(workspace, {
      from: sourceRootNodeId(source),
      to: componentId,
      label: "derived from source",
      status: "known",
      kind: "derived",
      provenance: [source.provenanceTag, "gemini-3.1"],
      origin: "source-insights"
    });
  }

  for (const requirement of insights.requirements || []) {
    const existing = workspace.requirements.find(
      (item) => item.title.toLowerCase() === String(requirement.title || "").toLowerCase()
    );
    if (!existing) {
      workspace.requirements.push({
        id: randomUUID(),
        title: requirement.title,
        description: requirement.description,
        capability: requirement.capability || requirement.title,
        searchQuery: requirement.searchQuery || requirement.title,
        status: "open",
        source: "source",
        options: [],
        evidence: [{ type: "gemini-extraction", title: source.label, source: source.provenanceTag }]
      });
    }
  }
}

async function syncRobotWorkspaceState(source) {
  let workspace = await loadRobotWorkspaceState(source);
  const sourceGraph = await buildRepositoryGraph(source.sourcePath, { includeSummaries: true });
  const insights = await extractRobotSourceInsights(source, sourceGraph);
  const manualOverrides = manualComponentOverrideByNodeId(workspace);
  const insightMap = buildInsightAssignmentMap(insights);

  workspace.metadata = {
    ...(workspace.metadata || {}),
    source,
    title: source.label,
    summary:
      source.type === "repo"
        ? `Repo-backed robot workspace for ${source.label}.`
        : `Folder-backed robot workspace for ${source.label}.`,
    emptyState: false
  };

  buildSourceGraphPreview(workspace, sourceGraph, source, insightMap, manualOverrides);
  mergeInsightComponents(
    workspace,
    source,
    insights || { components: [], requirements: [] },
    manualOverrides
  );
  syncRequirementNodes(workspace);
  syncTaskSuggestionNodes(workspace);

  const syncRun = {
    id: randomUUID(),
    createdAt: nowIso(),
    sourceType: source.type,
    sourceLabel: source.label,
    indexedFiles: sourceGraph.stats?.totalFiles || 0,
    indexedEdges: sourceGraph.stats?.totalEdges || 0,
    model: sourceGraph.stats?.summaryModel || ROBOT_AGENT_MODEL,
    notes: insights?.notes || []
  };
  workspace.runs.sync = [syncRun, ...(workspace.runs.sync || [])].slice(0, 20);

  workspace = await saveRobotWorkspaceState(workspace);
  return {
    workspace,
    sourceGraph
  };
}

function createTaskSuggestion(task, source, sourceRunId) {
  return {
    id: randomUUID(),
    title: task.title,
    description: task.description || "",
    relatedNodeId: task.relatedNodeId || null,
    source,
    sourceRunId,
    recommendedAssigneeUserId: task.recommendedAssigneeUserId || null
  };
}

function fallbackMissionBoard(workspace, objective) {
  const openRequirements = workspace.requirements.filter((item) => item.status !== "resolved");
  const focusNodeIds = (workspace.graph?.nodes || []).slice(0, 3).map((node) => node.id);
  const sourceNodeId = sourceRootNodeId(workspace.metadata.source);

  return {
    id: randomUUID(),
    objective,
    createdAt: nowIso(),
    summary: "Mission board generated from the current robot graph and source-derived context.",
    phases: [
      {
        name: "Source Recon",
        outcome: "Understand the active source and identify control, sensor, and runtime integration points.",
        steps: [
          "Review the source-derived nodes on the graph and inspect the files highlighted as robotics-relevant.",
          "Confirm device paths, scripts, and interface assumptions from the selected repo or folder."
        ],
        verificationGate: "Source graph synced"
      },
      {
        name: "Integration Plan",
        outcome: "Prepare the robot to execute the mission safely and predictably.",
        steps: [
          "Mount or secure all required hardware components and confirm compute-to-actuator connectivity.",
          "Bind any unresolved part requirements before bringup."
        ],
        verificationGate: "Hardware graph matches selected parts"
      },
      {
        name: "Bringup and Verify",
        outcome: "Run source-driven checks and verify observed ports/interfaces against the graph.",
        steps: [
          "Run the verifier and record any failing commands, missing dependencies, or port mismatches.",
          "Patch the graph from the verifier evidence before rerunning the mission."
        ],
        verificationGate: "Verifier passes critical checks"
      }
    ],
    blockers: openRequirements.map((item) => `${item.title} is unresolved`),
    requirements: openRequirements.map((item) => ({
      title: item.title,
      description: item.description,
      searchQuery: item.searchQuery
    })),
    verificationGates: ["Source graph synced", "Hardware graph matches selected parts", "Verifier passes critical checks"],
    suggestedTasks: [
      createTaskSuggestion(
        {
          title: "Verify critical runtime ports",
          description:
            "Confirm that the expected device paths and interfaces exposed by the active source match what is available on the robot host.",
          relatedNodeId: focusNodeIds[0] || sourceNodeId
        },
        "planner",
        objective
      ),
      createTaskSuggestion(
        {
          title: "Review source-derived control files",
          description: "Inspect the highlighted robotics-relevant files in the current source graph before bringup.",
          relatedNodeId: sourceNodeId
        },
        "planner",
        objective
      )
    ],
    focusNodeIds
  };
}

async function buildMissionBoardWithGemini(workspace, objective) {
  const previewNodes = (workspace.graph.nodes || []).slice(0, 18).map((node) => ({
    id: node.id,
    label: node.label,
    kind: node.kind,
    status: node.status,
    description: node.description
  }));
  const previewRequirements = (workspace.requirements || [])
    .filter((item) => item.status !== "resolved")
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      description: item.description,
      searchQuery: item.searchQuery
    }));

  const fallback = fallbackMissionBoard(workspace, objective);
  const prompt = `You are Gemini 3.1 generating a robotics mission board.
Return ONLY JSON with this exact shape:
{
  "summary": "string",
  "phases": [
    {
      "name": "string",
      "outcome": "string",
      "steps": ["string"],
      "verificationGate": "string"
    }
  ],
  "blockers": ["string"],
  "requirements": [
    {
      "title": "string",
      "description": "string",
      "searchQuery": "string"
    }
  ],
  "verificationGates": ["string"],
  "suggestedTasks": [
    {
      "title": "string",
      "description": "string",
      "relatedNodeId": "string"
    }
  ],
  "focusNodeIds": ["string"]
}

Objective: ${objective}
Source: ${workspace.metadata?.source?.label || "unknown"}
Nodes:
${JSON.stringify(previewNodes, null, 2)}
Open requirements:
${JSON.stringify(previewRequirements, null, 2)}

Rules:
- Output an actionable mission board, not a chat response.
- If the mission implies missing hardware or software, add requirements.
- Keep steps concise and concrete.
- relatedNodeId must reference one of the provided ids when possible.`;

  const ai = await callGeminiJson({ prompt, fallback });
  return {
    ...fallback,
    ...(ai || {}),
    id: randomUUID(),
    objective,
    createdAt: nowIso(),
    suggestedTasks: Array.isArray(ai?.suggestedTasks)
      ? ai.suggestedTasks.map((task) => createTaskSuggestion(task, "planner", objective))
      : fallback.suggestedTasks
  };
}

function mergeMissionRequirements(workspace, board) {
  for (const requirement of board.requirements || []) {
    const existing = workspace.requirements.find(
      (item) => item.title.toLowerCase() === String(requirement.title || "").toLowerCase()
    );
    if (existing) {
      existing.description = existing.description || requirement.description;
      existing.searchQuery = existing.searchQuery || requirement.searchQuery || requirement.title;
      continue;
    }
    workspace.requirements.push({
      id: randomUUID(),
      title: requirement.title,
      description: requirement.description,
      capability: requirement.title,
      searchQuery: requirement.searchQuery || requirement.title,
      status: "open",
      source: "planner",
      options: [],
      evidence: [{ type: "planner", title: board.objective, source: "planner-agent" }]
    });
  }
}

async function runRobotWorkspacePlanner(source, objective) {
  const { workspace } = await syncRobotWorkspaceState(source);
  const board = await buildMissionBoardWithGemini(workspace, objective);
  mergeMissionRequirements(workspace, board);
  workspace.taskSuggestions = [
    ...(board.suggestedTasks || []),
    ...(workspace.taskSuggestions || []).filter((task) => task.source !== "planner")
  ].slice(0, 20);
  syncRequirementNodes(workspace);
  syncTaskSuggestionNodes(workspace);
  workspace.runs.planner = [board, ...(workspace.runs.planner || [])].slice(0, 12);
  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    missionBoard: board
  };
}

async function createRobotWorkspaceRequirement(source, payload) {
  const { workspace } = await syncRobotWorkspaceState(source);
  const title = String(payload.title || payload.capability || "").trim();
  const description = String(payload.description || payload.capability || "").trim();
  if (!title) {
    throw new Error("Requirement title or capability is required.");
  }

  const fallback = {
    title,
    description,
    capability: String(payload.capability || title).trim(),
    searchQuery: String(payload.searchQuery || title).trim()
  };
  const prompt = `You are Gemini 3.1 normalizing a robotics part requirement.
Return ONLY JSON with this exact shape:
{
  "title": "string",
  "description": "string",
  "capability": "string",
  "searchQuery": "string"
}

Input:
${JSON.stringify(payload, null, 2)}

Rules:
- Make the title concise.
- Keep the searchQuery optimized for part discovery.
- No markdown, JSON only.`;
  const normalized = (await callGeminiJson({ prompt, fallback })) || fallback;

  const requirement = {
    id: randomUUID(),
    title: normalized.title,
    description: normalized.description,
    capability: normalized.capability,
    searchQuery: normalized.searchQuery || normalized.title,
    status: "open",
    source: "user",
    options: [],
    evidence: [{ type: "user", title: normalized.title, source: "manual requirement" }]
  };

  workspace.requirements.unshift(requirement);
  syncRequirementNodes(workspace);
  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    requirement
  };
}

function fallbackOptionRanking(requirement, results) {
  return results.map((result, index) => ({
    id: randomUUID(),
    title: result.title || `Option ${index + 1}`,
    url: result.url,
    excerpt: result.excerpt || "",
    fitSummary: `Candidate option for ${requirement.title}.`,
    interfaces: inferInterfacesFromText(`${result.title} ${result.excerpt || ""}`),
    ports: extractPortsAndInterfaces(`${result.title} ${result.excerpt || ""}`).ports,
    risks: [],
    score: 100 - index * 8,
    sourceType: result.sourceType || "web"
  }));
}

async function rankRequirementOptionsWithGemini(requirement, enrichedResults) {
  const fallback = {
    options: fallbackOptionRanking(requirement, enrichedResults)
  };
  const prompt = `You are Gemini 3.1 ranking part options for a robotics requirement.
Return ONLY JSON with this exact shape:
{
  "options": [
    {
      "title": "string",
      "url": "string",
      "excerpt": "string",
      "fitSummary": "string",
      "interfaces": ["string"],
      "ports": ["string"],
      "risks": ["string"],
      "score": 0
    }
  ]
}

Requirement:
${JSON.stringify(requirement, null, 2)}
Search results:
${JSON.stringify(enrichedResults, null, 2)}

Rules:
- Rank only the provided results.
- Prefer options that are clearly compatible with the requirement.
- Keep fitSummary concise.
- Preserve urls exactly.`;

  const ranked = (await callGeminiJson({ prompt, fallback })) || fallback;
  return Array.isArray(ranked.options)
    ? ranked.options.map((option, index) => ({
        id: randomUUID(),
        title: option.title || enrichedResults[index]?.title || `Option ${index + 1}`,
        url: option.url || enrichedResults[index]?.url || "",
        excerpt: option.excerpt || enrichedResults[index]?.excerpt || "",
        fitSummary: option.fitSummary || `Candidate option for ${requirement.title}.`,
        interfaces: Array.isArray(option.interfaces) ? option.interfaces : [],
        ports: Array.isArray(option.ports) ? option.ports : [],
        risks: Array.isArray(option.risks) ? option.risks : [],
        score: Number(option.score || 0),
        sourceType: enrichedResults[index]?.sourceType || "web"
      }))
    : fallback.options;
}

async function discoverRobotWorkspaceRequirement(source, requirementId) {
  const { workspace } = await syncRobotWorkspaceState(source);
  const requirement = workspace.requirements.find((item) => item.id === requirementId);
  if (!requirement) {
    throw new Error("Requirement not found.");
  }

  const rawResults = await searchPartsBrowserbase(requirement.searchQuery || requirement.title);
  const enrichedResults = [];
  for (const result of rawResults) {
    // Use Browserbase fetchDatasheet for richer extraction
    const datasheetInfo = await fetchDatasheet(result.url);
    enrichedResults.push({
      ...result,
      excerpt: datasheetInfo.description || result.snippet || "",
      sourceType: datasheetInfo.type || "web",
      specs: datasheetInfo.specs || {},
      pdfUrl: datasheetInfo.type === "pdf" ? datasheetInfo.url : null
    });
  }

  requirement.options = await rankRequirementOptionsWithGemini(requirement, enrichedResults);
  requirement.status = requirement.options.length ? "options_ready" : "open";
  requirement.evidence = [
    ...(requirement.evidence || []),
    {
      type: "parts-discovery",
      title: requirement.searchQuery || requirement.title,
      source: "browserbase"
    }
  ].slice(-12);

  const run = {
    id: randomUUID(),
    createdAt: nowIso(),
    requirementId,
    query: requirement.searchQuery || requirement.title,
    results: requirement.options
  };
  workspace.runs.discovery = [run, ...(workspace.runs.discovery || [])].slice(0, 20);
  syncRequirementNodes(workspace);
  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    requirement,
    run
  };
}

async function bindRobotWorkspaceOption(source, requirementId, optionId) {
  const workspace = await loadRobotWorkspaceState(source);
  const requirement = workspace.requirements.find((item) => item.id === requirementId);
  if (!requirement) {
    throw new Error("Requirement not found.");
  }

  const option = (requirement.options || []).find((item) => item.id === optionId);
  if (!option) {
    throw new Error("Option not found.");
  }

  for (const item of requirement.options || []) {
    item.selected = item.id === optionId;
  }
  requirement.status = "resolved";
  requirement.selectedOptionId = optionId;

  workspace.selectedOptionBindings = [
    {
      id: randomUUID(),
      requirementId,
      optionId,
      title: option.title,
      createdAt: nowIso()
    },
    ...(workspace.selectedOptionBindings || []).filter((item) => item.requirementId !== requirementId)
  ];

  syncRequirementNodes(workspace);
  const saved = await saveRobotWorkspaceState(workspace);

  // AGENTIC: Write selection to actual workspace folder
  await writePartsToWorkspace(source, workspace);

  return {
    workspace: saved,
    requirement,
    option,
    filesWritten: true
  };
}

// Write selected parts and config to actual workspace folder
async function writePartsToWorkspace(source, workspace) {
  let targetPath = null;

  if (source.sourcePath) {
    targetPath = source.sourcePath;
  } else if (source.repoFullName) {
    // For GitHub repos, write to a local cache that can be pushed
    const repoSlug = source.repoFullName.replace(/\//g, "_");
    targetPath = path.join(ROBOT_WORKSPACE_DIR, "exports", repoSlug);
  }

  if (!targetPath) return;

  await fs.mkdir(targetPath, { recursive: true });

  // Build robot-parts.json from all selected bindings
  const selectedParts = (workspace.selectedOptionBindings || []).map((binding) => {
    const requirement = workspace.requirements.find((r) => r.id === binding.requirementId);
    const option = requirement?.options?.find((o) => o.id === binding.optionId);
    return {
      id: binding.id,
      requirementId: binding.requirementId,
      requirementTitle: requirement?.title || "Unknown",
      partName: option?.title || binding.title,
      partUrl: option?.url || null,
      interfaces: option?.interfaces || [],
      fitSummary: option?.fitSummary || "",
      selectedAt: binding.createdAt
    };
  });

  const partsJson = {
    generatedAt: nowIso(),
    generatedBy: "forge-rde",
    workspace: workspace.metadata?.source?.label || "unknown",
    parts: selectedParts
  };

  await fs.writeFile(
    path.join(targetPath, "robot-parts.json"),
    JSON.stringify(partsJson, null, 2),
    "utf-8"
  );

  // Build robot.config.json with connection info from discovered components
  const nodes = workspace.graph?.nodes || [];
  const jetsonNode = nodes.find((n) =>
    (n.label || "").toLowerCase().includes("jetson") ||
    (n.componentLabel || "").toLowerCase().includes("compute")
  );
  const armNodes = nodes.filter((n) =>
    (n.componentLabel || "").toLowerCase().includes("arm") ||
    (n.label || "").toLowerCase().includes("arm")
  );
  const cameraNodes = nodes.filter((n) =>
    (n.componentLabel || "").toLowerCase().includes("camera")
  );

  // Extract IP from evidence if possible
  let jetsonIp = "192.168.1.100";
  for (const node of nodes) {
    for (const ev of node.evidence || []) {
      const content = ev.content || ev.excerpt || "";
      const ipMatch = content.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipMatch) {
        jetsonIp = ipMatch[1];
        break;
      }
    }
  }

  const configJson = {
    generatedAt: nowIso(),
    generatedBy: "forge-rde",
    robot: {
      name: workspace.metadata?.source?.label || "my-robot",
      type: armNodes.length ? "manipulator" : "unknown"
    },
    jetson: {
      ip: jetsonIp,
      user: "jetson"
    },
    servers: {
      arm: {
        port: 8765,
        enabled: armNodes.length > 0
      },
      camera: {
        port: 8766,
        enabled: cameraNodes.length > 0
      }
    },
    arms: armNodes.map((n) => ({
      id: n.id,
      name: n.label,
      type: (n.label || "").toLowerCase().includes("leader") ? "leader" : "follower"
    })),
    cameras: cameraNodes.map((n) => ({
      id: n.id,
      name: n.label
    })),
    selectedParts: selectedParts.map((p) => ({
      name: p.partName,
      requirement: p.requirementTitle
    }))
  };

  await fs.writeFile(
    path.join(targetPath, "robot.config.json"),
    JSON.stringify(configJson, null, 2),
    "utf-8"
  );

  console.log(`[Forge RDE] Wrote robot-parts.json and robot.config.json to ${targetPath}`);
}

async function unbindRobotWorkspaceOption(source, requirementId) {
  const workspace = await loadRobotWorkspaceState(source);
  const requirement = workspace.requirements.find((item) => item.id === requirementId);
  if (!requirement) {
    throw new Error("Requirement not found.");
  }

  // Deselect all options
  for (const item of requirement.options || []) {
    item.selected = false;
  }
  requirement.status = requirement.options?.length ? "options_ready" : "open";
  delete requirement.selectedOptionId;

  // Remove from bindings
  workspace.selectedOptionBindings = (workspace.selectedOptionBindings || []).filter(
    (item) => item.requirementId !== requirementId
  );

  syncRequirementNodes(workspace);
  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    requirement
  };
}

async function deleteRobotWorkspaceRequirement(source, requirementId) {
  const workspace = await loadRobotWorkspaceState(source);
  const requirementIndex = workspace.requirements.findIndex((item) => item.id === requirementId);
  if (requirementIndex === -1) {
    throw new Error("Requirement not found.");
  }

  const [deletedRequirement] = workspace.requirements.splice(requirementIndex, 1);

  // Remove from bindings
  workspace.selectedOptionBindings = (workspace.selectedOptionBindings || []).filter(
    (item) => item.requirementId !== requirementId
  );

  // Remove requirement node and any candidate nodes from graph
  const requirementNodeId = makeRequirementNodeId(requirementId);
  workspace.graph.nodes = (workspace.graph.nodes || []).filter((node) => {
    if (node.id === requirementNodeId) return false;
    if (String(node.id || "").startsWith(`candidate:${requirementId}:`)) return false;
    return true;
  });
  workspace.graph.edges = (workspace.graph.edges || []).filter((edge) => {
    if (edge.from === requirementNodeId || edge.to === requirementNodeId) return false;
    if (String(edge.from || "").startsWith(`candidate:${requirementId}:`)) return false;
    if (String(edge.to || "").startsWith(`candidate:${requirementId}:`)) return false;
    return true;
  });

  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    deletedRequirement
  };
}

function detectVerifierCommandsForSource(sourcePath) {
  const commands = [];
  const packageJsonPath = path.join(sourcePath, "package.json");
  const pyprojectPath = path.join(sourcePath, "pyproject.toml");
  const pytestIniPath = path.join(sourcePath, "pytest.ini");
  const testsPath = path.join(sourcePath, "tests");

  if (fsSync.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, "utf-8"));
      const scripts = packageJson.scripts || {};
      if (scripts.test) {
        commands.push({ label: "npm test", command: "npm", args: ["test"] });
      }
      if (scripts.lint) {
        commands.push({ label: "npm run lint", command: "npm", args: ["run", "lint"] });
      }
    } catch {
      // Ignore package parse failures.
    }
  }

  if (
    fsSync.existsSync(pyprojectPath) ||
    fsSync.existsSync(pytestIniPath) ||
    fsSync.existsSync(testsPath)
  ) {
    commands.push({ label: "python3 -m pytest -q", command: "python3", args: ["-m", "pytest", "-q"] });
  }

  return commands.slice(0, 3);
}

async function runCommandWithTimeout({ command, args, cwd, timeoutMs = 20000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: "1"
      }
    });

    let stdout = "";
    let stderr = "";
    let completed = false;

    const timer = setTimeout(() => {
      if (completed) return;
      child.kill("SIGTERM");
      completed = true;
      resolve({
        command: [command, ...args].join(" "),
        exitCode: null,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim(),
        timedOut: true
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (completed) return;
      completed = true;
      resolve({
        command: [command, ...args].join(" "),
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut: false
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (completed) return;
      completed = true;
      resolve({
        command: [command, ...args].join(" "),
        exitCode,
        stdout,
        stderr,
        timedOut: false
      });
    });
  });
}

function buildVerifierTaskSuggestions(run) {
  const tasks = [];
  for (const result of run.commandResults || []) {
    if (result.exitCode !== 0 || result.timedOut) {
      tasks.push(
        createTaskSuggestion(
          {
            title: `Investigate verifier failure: ${result.label || result.command}`,
            description: `Review command output and fix the issue before rerunning verifier checks.`,
            relatedNodeId: sourceRootNodeId(run.source)
          },
          "verifier",
          run.id
        )
      );
    }
  }
  for (const finding of run.findings || []) {
    if (finding.type === "port-mismatch") {
      tasks.push(
        createTaskSuggestion(
          {
            title: `Verify port mapping for ${finding.nodeLabel || finding.nodeId}`,
            description: finding.message,
            relatedNodeId: finding.nodeId
          },
          "verifier",
          run.id
        )
      );
    }
  }
  return tasks.slice(0, 8);
}

async function runRobotWorkspaceVerifier(source, payload) {
  const { workspace } = await syncRobotWorkspaceState(source);
  const commands = detectVerifierCommandsForSource(source.sourcePath);
  const commandResults = [];
  for (const entry of commands) {
    const result = await runCommandWithTimeout({
      command: entry.command,
      args: entry.args,
      cwd: source.sourcePath
    });
    commandResults.push({
      ...result,
      label: entry.label
    });
  }

  const manualText = String(payload.manualInstructions || payload.focus || "").trim();
  const combinedEvidenceText = [
    manualText,
    ...commandResults.map((result) => `${result.label}\n${result.stdout}\n${result.stderr}`)
  ]
    .filter(Boolean)
    .join("\n\n");

  const findings = [];
  const parsed = extractPortsAndInterfaces(combinedEvidenceText);
  const observedPorts = parsed.ports;
  const nodesWithPorts = (workspace.graph?.nodes || []).filter((node) => (node.ports || []).length);
  if (observedPorts.length && nodesWithPorts.length) {
    for (const node of nodesWithPorts) {
      const expectedPorts = (node.ports || []).map((port) => port.name).filter(Boolean);
      for (const observed of observedPorts) {
        if (!(node.ports || []).some((port) => port.name === observed)) {
          node.ports.push({ name: observed, type: "observed", direction: "bidirectional" });
        }
      }
      if (expectedPorts.length && !observedPorts.some((item) => expectedPorts.includes(item))) {
        findings.push({
          type: "port-mismatch",
          nodeId: node.id,
          nodeLabel: node.label,
          severity: "high",
          message: `${node.label} expected ${expectedPorts.join(", ")} but observed ${observedPorts.join(", ")}.`
        });
        node.status = "needs-verification";
      }
    }
  }

  for (const result of commandResults) {
    if (result.exitCode !== 0 || result.timedOut) {
      findings.push({
        type: "command-failure",
        nodeId: sourceRootNodeId(source),
        nodeLabel: source.label,
        severity: "high",
        message: `${result.label} failed${result.timedOut ? " due to timeout" : ""}.`
      });
    }
  }

  if (!findings.length) {
    findings.push({
      type: "healthy-run",
      nodeId: sourceRootNodeId(source),
      nodeLabel: source.label,
      severity: "info",
      message: "Verifier completed without critical source-driven errors."
    });
  }

  const run = {
    id: randomUUID(),
    createdAt: nowIso(),
    source,
    focus: String(payload.focus || ""),
    manualInstructions: manualText,
    commandResults: commandResults.map((result) => ({
      label: result.label,
      command: result.command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout.slice(0, 2400),
      stderr: result.stderr.slice(0, 2400)
    })),
    findings
  };

  workspace.taskSuggestions = [
    ...buildVerifierTaskSuggestions(run),
    ...(workspace.taskSuggestions || []).filter((task) => task.source !== "verifier")
  ].slice(0, 20);
  syncTaskSuggestionNodes(workspace);
  workspace.runs.verifier = [run, ...(workspace.runs.verifier || [])].slice(0, 12);
  const saved = await saveRobotWorkspaceState(workspace);
  return {
    workspace: saved,
    verifierRun: run
  };
}

function robotWorkspaceResponse(workspace, extra = {}) {
  return {
    workspace,
    graph: workspace.graph,
    requirements: workspace.requirements || [],
    taskSuggestions: workspace.taskSuggestions || [],
    source: workspace.metadata?.source || null,
    componentPalette: Object.values(ROBOT_COMPONENTS),
    summary: workspaceSummary(workspace),
    mermaid: workspaceGraphToMermaid(workspace),
    ...extra
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "forge-rde-server", appUrl: APP_URL });
});

app.get("/api/auth/session", async (req, res) => {
  const githubIdentity = await resolveGithubIdentity(req.session);
  await hydrateGithubToken(req.session);
  const githubConnected = Boolean(req.session?.githubToken) || githubIdentity;
  res.json({
    user: sanitizeUser(req.session?.user),
    githubConnected
  });
});

app.post("/api/auth/login", requireSupabase, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      res.status(401).json({ error: error?.message || "Login failed." });
      return;
    }

    req.session.user = data.user;
    req.session.accessToken = data.session?.access_token || "";
    req.session.refreshToken = data.session?.refresh_token || "";
    req.session.githubToken = data.session?.provider_token || "";
    const githubIdentity = await resolveGithubIdentity(req.session);
    await hydrateGithubToken(req.session);
    const githubConnected = Boolean(req.session.githubToken) || githubIdentity;
    res.json({ ok: true, user: sanitizeUser(data.user), githubConnected });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Login failed." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/account/profile", requireAuth, requireSupabase, async (req, res) => {
  const firstName = String(req.body?.first_name || "").trim();
  if (!firstName) {
    res.status(400).json({ error: "first_name is required." });
    return;
  }

  try {
    const userClient = await createUserClientFromSession(req.session);
    if (!userClient) {
      res.status(500).json({ error: "Unable to initialize user client." });
      return;
    }

    const { data, error } = await userClient.auth.updateUser({
      data: { first_name: firstName }
    });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    req.session.user = data.user;
    res.json({ ok: true, user: sanitizeUser(data.user) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to update profile." });
  }
});

app.post("/api/account/password", requireAuth, requireSupabase, async (req, res) => {
  const password = String(req.body?.password || "");
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  try {
    const userClient = await createUserClientFromSession(req.session);
    if (!userClient) {
      res.status(500).json({ error: "Unable to initialize user client." });
      return;
    }

    const { error } = await userClient.auth.updateUser({ password });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to update password." });
  }
});

app.post("/api/account/github/disconnect", requireAuth, requireSupabase, async (req, res) => {
  try {
    const userClient = await createUserClientFromSession(req.session);
    if (!userClient) {
      res.status(500).json({ error: "Unable to initialize user client." });
      return;
    }

    const { error } = await userClient.auth.unlinkIdentity({
      provider: "github"
    });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    req.session.githubToken = "";
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to disconnect GitHub." });
  }
});

app.post("/api/account/delete", requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is required for account deletion." });
    return;
  }

  try {
    const userId = req.session.user?.id;
    if (!userId) {
      res.status(400).json({ error: "No authenticated user found." });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    req.session.destroy(() => {
      res.json({ ok: true });
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to delete account." });
  }
});

app.get("/api/auth/github/connect", requireSupabase, requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${APP_URL}/api/auth/github/callback`
      }
    });

    if (error || !data?.url) {
      res.status(400).send(error?.message || "Unable to start GitHub OAuth.");
      return;
    }
    res.redirect(data.url);
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "Unable to start GitHub OAuth.");
  }
});

app.get("/api/auth/github/callback", requireSupabase, async (req, res) => {
  const code = String(req.query.code || "");
  if (!code) {
    res.status(400).send("Missing OAuth code");
    return;
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.user) {
      res.status(400).send(error?.message || "OAuth exchange failed.");
      return;
    }

    req.session.user = data.user;
    req.session.accessToken = data.session?.access_token || "";
    req.session.refreshToken = data.session?.refresh_token || "";
    req.session.githubToken = data.session?.provider_token || "";
    if (data.session?.provider_token) {
      await storeGithubTokens(
        data.user?.id,
        data.session.provider_token,
        data.session?.provider_refresh_token
      );
    }

    res.send(`
      <!doctype html>
      <html>
        <body style="font-family:sans-serif;background:#0b1220;color:#f5f8ff;display:flex;align-items:center;justify-content:center;min-height:100vh;">
          <div style="text-align:center;max-width:520px;">
            <h1 style="margin:0 0 8px 0;">GitHub connection complete</h1>
            <p style="opacity:.85;line-height:1.5;">You can return to Forge RDE. This window will close automatically.</p>
          </div>
          <script>
            setTimeout(() => {
              window.location.replace("/");
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "GitHub callback failed.");
  }
});

app.get("/api/github/repos", requireAuth, async (req, res) => {
  const githubIdentity = await resolveGithubIdentity(req.session);
  await hydrateGithubToken(req.session);
  const githubConnected = Boolean(req.session.githubToken) || githubIdentity;

  if (!req.session?.githubToken) {
    res.status(400).json({
      error: githubConnected
        ? "GitHub is linked, but no provider token is available yet. Reconnect GitHub once to refresh token storage."
        : "GitHub is not connected. Use Connect GitHub first."
    });
    return;
  }

  try {
    const repos = await fetchGithubRepos(req.session.githubToken);
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to fetch repos." });
  }
});

app.post("/api/rde/analyze", requireAuth, async (req, res) => {
  const repoPath = String(req.body?.repoPath || "");
  if (!repoPath) {
    res.status(400).json({ error: "repoPath is required." });
    return;
  }

  try {
    const result = await analyzeRepo(repoPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Analyze failed." });
  }
});

app.get("/api/robot/workspace", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.query.repoFullName,
      sourcePath: req.query.sourcePath
    });
    const workspace = await loadRobotWorkspaceState(source);
    res.json(robotWorkspaceResponse(workspace));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load robot workspace." });
  }
});

app.post("/api/robot/workspace/sync", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const { workspace, sourceGraph } = await syncRobotWorkspaceState(source);
    res.json(
      robotWorkspaceResponse(workspace, {
        sourceGraphStats: sourceGraph?.stats || null
      })
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to sync robot workspace." });
  }
});

app.post("/api/robot/nodes/:nodeId/component", requireAuth, async (req, res) => {
  const componentId = String(req.body?.componentId || "").trim();
  if (!componentId || !ROBOT_COMPONENTS[componentId]) {
    res.status(400).json({ error: "Valid componentId is required." });
    return;
  }

  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const workspace = await loadRobotWorkspaceState(source);
    const node = findWorkspaceNode(workspace, String(req.params.nodeId || ""));
    if (!node) {
      res.status(404).json({ error: "Node not found." });
      return;
    }
    node.manualComponentOverride = componentId;
    assignComponentToNode(node, componentId, "manual");
    node.componentReason = "Manually overridden in node details.";
    const saved = await saveRobotWorkspaceState(workspace);
    res.json(robotWorkspaceResponse(saved, { updatedNodeId: node.id }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to update node component." });
  }
});

app.post("/api/robot/planner/run", requireAuth, async (req, res) => {
  const objective = String(req.body?.objective || "").trim();
  if (!objective) {
    res.status(400).json({ error: "objective is required." });
    return;
  }

  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await runRobotWorkspacePlanner(source, objective);
    res.json(robotWorkspaceResponse(result.workspace, { missionBoard: result.missionBoard }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Planner run failed." });
  }
});

app.post("/api/robot/requirements", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await createRobotWorkspaceRequirement(source, req.body || {});
    res.json(robotWorkspaceResponse(result.workspace, { requirement: result.requirement }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to create requirement." });
  }
});

app.post("/api/robot/requirements/:requirementId/discover", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await discoverRobotWorkspaceRequirement(
      source,
      String(req.params.requirementId || "")
    );
    res.json(robotWorkspaceResponse(result.workspace, { requirement: result.requirement, discoveryRun: result.run }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to discover requirement options." });
  }
});

app.post("/api/robot/requirements/:requirementId/select", requireAuth, async (req, res) => {
  const optionId = String(req.body?.optionId || "").trim();
  if (!optionId) {
    res.status(400).json({ error: "optionId is required." });
    return;
  }

  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await bindRobotWorkspaceOption(
      source,
      String(req.params.requirementId || ""),
      optionId
    );
    res.json(robotWorkspaceResponse(result.workspace, {
      requirement: result.requirement,
      option: result.option,
      filesWritten: result.filesWritten
    }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to bind selected option." });
  }
});

app.post("/api/robot/requirements/:requirementId/deselect", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await unbindRobotWorkspaceOption(
      source,
      String(req.params.requirementId || "")
    );
    res.json(robotWorkspaceResponse(result.workspace, { requirement: result.requirement }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to deselect option." });
  }
});

app.delete("/api/robot/requirements/:requirementId", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await deleteRobotWorkspaceRequirement(
      source,
      String(req.params.requirementId || "")
    );
    res.json(robotWorkspaceResponse(result.workspace, { deletedRequirement: result.deletedRequirement }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to delete requirement." });
  }
});

app.post("/api/robot/verifier/run", requireAuth, async (req, res) => {
  try {
    const source = await resolveRobotWorkspaceSource({
      repoFullName: req.body?.repoFullName,
      sourcePath: req.body?.sourcePath
    });
    const result = await runRobotWorkspaceVerifier(source, req.body || {});
    res.json(robotWorkspaceResponse(result.workspace, { verifierRun: result.verifierRun }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Verifier run failed." });
  }
});

app.get("/api/robot/graph", requireAuth, async (req, res) => {
  const repoFullName = String(req.query.repoFullName || "").trim();
  if (!repoFullName) {
    res.status(400).json({ error: "repoFullName is required." });
    return;
  }

  try {
    const workspace = await getRobotWorkspace(repoFullName);
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load robot graph." });
  }
});

// Get generated files content (agentic output)
app.get("/api/robot/generated-files", requireAuth, async (req, res) => {
  const sourcePath = String(req.query.sourcePath || "").trim();
  const repoFullName = String(req.query.repoFullName || "").trim();

  let targetPath = null;
  if (sourcePath) {
    targetPath = sourcePath;
  } else if (repoFullName) {
    const repoSlug = repoFullName.replace(/\//g, "_");
    targetPath = path.join(ROBOT_WORKSPACE_DIR, "exports", repoSlug);
  }

  if (!targetPath) {
    res.status(400).json({ error: "sourcePath or repoFullName is required." });
    return;
  }

  try {
    const partsPath = path.join(targetPath, "robot-parts.json");
    const configPath = path.join(targetPath, "robot.config.json");

    let partsContent = null;
    let configContent = null;

    try {
      partsContent = JSON.parse(await fs.readFile(partsPath, "utf-8"));
    } catch {
      // File doesn't exist yet
    }

    try {
      configContent = JSON.parse(await fs.readFile(configPath, "utf-8"));
    } catch {
      // File doesn't exist yet
    }

    res.json({
      targetPath,
      files: {
        "robot-parts.json": partsContent,
        "robot.config.json": configContent
      },
      hasFiles: Boolean(partsContent || configContent)
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to read generated files." });
  }
});

app.post("/api/robot/discover", requireAuth, async (req, res) => {
  const repoFullName = String(req.body?.repoFullName || "").trim();
  const query = String(req.body?.query || "").trim();
  if (!repoFullName || !query) {
    res.status(400).json({ error: "repoFullName and query are required." });
    return;
  }

  try {
    const result = await discoverRobotParts(repoFullName, query);
    res.json({
      run: result.run,
      summary: summarizeGraph(result.graph),
      mermaid: graphToMermaid(result.graph),
      graph: result.graph
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Parts discovery failed." });
  }
});

app.post("/api/robot/plan", requireAuth, async (req, res) => {
  const repoFullName = String(req.body?.repoFullName || "").trim();
  const objective = String(req.body?.objective || "").trim();
  if (!repoFullName || !objective) {
    res.status(400).json({ error: "repoFullName and objective are required." });
    return;
  }

  try {
    const result = await runPlanner(repoFullName, objective);
    res.json({
      plan: result.plan,
      summary: summarizeGraph(result.graph),
      mermaid: graphToMermaid(result.graph),
      graph: result.graph
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Planner run failed." });
  }
});

app.post("/api/robot/verify", requireAuth, async (req, res) => {
  const repoFullName = String(req.body?.repoFullName || "").trim();
  const observations = String(req.body?.observations || "").trim();
  if (!repoFullName || !observations) {
    res.status(400).json({ error: "repoFullName and observations are required." });
    return;
  }

  try {
    const result = await runVerifier(repoFullName, observations);
    res.json({
      run: result.run,
      summary: summarizeGraph(result.graph),
      mermaid: graphToMermaid(result.graph),
      graph: result.graph
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Verifier run failed." });
  }
});

// Datasheet RAG endpoints
app.post("/api/datasheets/index", requireAuth, async (req, res) => {
  const { url, partId, title, description } = req.body;
  if (!url) {
    res.status(400).json({ error: "url is required." });
    return;
  }
  try {
    const result = await indexDatasheetFromUrl(url, {
      partId: partId || randomUUID(),
      title: title || "Unknown Part",
      description: description || "",
      indexedBy: req.session?.userId
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Indexing failed." });
  }
});

app.post("/api/datasheets/query", requireAuth, async (req, res) => {
  const { question, partId } = req.body;
  if (!question) {
    res.status(400).json({ error: "question is required." });
    return;
  }
  try {
    const results = await queryDatasheets(question, partId ? { partId } : {});
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Query failed." });
  }
});

app.post("/api/datasheets/ask", requireAuth, async (req, res) => {
  const { question, partId } = req.body;
  if (!question) {
    res.status(400).json({ error: "question is required." });
    return;
  }
  try {
    const answer = await askAboutDatasheet(question, partId);
    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Ask failed." });
  }
});

app.get("/api/datasheets/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getIndexStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Stats failed." });
  }
});

app.get("/api/code/tree", requireAuth, async (req, res) => {
  const repoPathRaw = String(req.query.repoPath || "");
  if (!repoPathRaw) {
    res.status(400).json({ error: "repoPath is required." });
    return;
  }

  try {
    const repoPath = normalizeRepoPath(repoPathRaw);
    const stat = await fs.stat(repoPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "repoPath must be a directory." });
      return;
    }

    const files = await listRepoFiles(repoPath);
    res.json({ repoPath, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load code tree." });
  }
});

app.get("/api/code/file", requireAuth, async (req, res) => {
  const repoPathRaw = String(req.query.repoPath || "");
  const filePathRaw = String(req.query.filePath || "");
  if (!repoPathRaw || !filePathRaw) {
    res.status(400).json({ error: "repoPath and filePath are required." });
    return;
  }

  try {
    const repoPath = normalizeRepoPath(repoPathRaw);
    const targetPath = safeJoinRepoPath(repoPath, filePathRaw);
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) {
      res.status(400).json({ error: "Requested path is not a file." });
      return;
    }
    if (stat.size > 1_000_000) {
      res.status(400).json({ error: "File too large for inline editor preview (>1MB)." });
      return;
    }

    const content = await fs.readFile(targetPath, "utf-8");
    res.json({
      repoPath,
      filePath: filePathRaw,
      content
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load file content." });
  }
});

app.get("/api/code/tree/by-repo", requireAuth, async (req, res) => {
  const repoFullName = String(req.query.repoFullName || "").trim();
  const ref = String(req.query.ref || "").trim();
  if (!repoFullName) {
    res.status(400).json({ error: "repoFullName is required." });
    return;
  }

  try {
    const repoPath = await resolveRepoFullNameToLocalPath(repoFullName);
    const files = await listRepoFiles(repoPath);
    res.json({
      source: "local",
      readOnly: false,
      repoPath,
      repoFullName,
      files
    });
  } catch (err) {
    try {
      await hydrateGithubToken(req.session);
      const token = req.session?.githubToken;
      if (!token) {
        throw err;
      }
      const tree = await fetchGithubRepoTree(token, repoFullName, ref);
      res.json({
        source: "github",
        readOnly: true,
        repoFullName,
        ref: tree.defaultBranch,
        files: tree.files
      });
    } catch (fallbackErr) {
      res.status(500).json({
        error:
          fallbackErr instanceof Error
            ? fallbackErr.message
            : "Unable to resolve local repository or fetch GitHub repository."
      });
    }
  }
});

app.get("/api/code/file/github", requireAuth, async (req, res) => {
  const repoFullName = String(req.query.repoFullName || "").trim();
  const filePath = String(req.query.filePath || "").trim();
  const ref = String(req.query.ref || "").trim();
  if (!repoFullName || !filePath) {
    res.status(400).json({ error: "repoFullName and filePath are required." });
    return;
  }

  try {
    await hydrateGithubToken(req.session);
    const token = req.session?.githubToken;
    if (!token) {
      res.status(400).json({
        error: "GitHub token unavailable. Connect GitHub and refresh your session."
      });
      return;
    }

    const data = await fetchGithubFileContent(token, repoFullName, filePath, ref);
    res.json({
      source: "github",
      readOnly: true,
      repoFullName,
      filePath,
      ref: data.ref,
      content: data.content
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load GitHub file content." });
  }
});

app.get("/api/visualizer/graph/by-repo", requireAuth, async (req, res) => {
  const repoFullName = String(req.query.repoFullName || "").trim();
  const includeSummaries = String(req.query.includeSummaries || "1") !== "0";
  if (!repoFullName) {
    res.status(400).json({ error: "repoFullName is required." });
    return;
  }

  try {
    const repoPath = await resolveRepoFullNameToLocalPath(repoFullName);
    const graph = await buildRepositoryGraph(repoPath, { includeSummaries });
    res.json({ repoFullName, ...graph });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to build repository graph." });
  }
});

app.get("/api/visualizer/graph", requireAuth, async (req, res) => {
  const repoPathRaw = String(req.query.repoPath || "").trim();
  const includeSummaries = String(req.query.includeSummaries || "1") !== "0";
  if (!repoPathRaw) {
    res.status(400).json({ error: "repoPath is required." });
    return;
  }

  try {
    const repoPath = normalizeRepoPath(repoPathRaw);
    const stat = await fs.stat(repoPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "repoPath must be a directory." });
      return;
    }

    const graph = await buildRepositoryGraph(repoPath, { includeSummaries });
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to build repository graph." });
  }
});

app.get("/api/team/state", requireAuth, async (req, res) => {
  try {
    const teamState = await getTeamState(req.session);
    res.json(teamState);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load team state." });
  }
});

app.post("/api/team/create", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    res.status(400).json({ error: "Team name is required." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const userId = req.session.user.id;
  const code = inviteCode();

  try {
    const insertWorkspace = await supabaseAdmin
      .from(TEAM_TABLES.workspaces)
      .insert({
        name,
        owner_user_id: userId,
        invite_code: code
      })
      .select("*")
      .single();
    if (insertWorkspace.error) {
      throw insertWorkspace.error;
    }

    const workspace = insertWorkspace.data;
    const memberInsert = await supabaseAdmin.from(TEAM_TABLES.members).upsert(
      {
        team_id: workspace.id,
        user_id: userId,
        role: "owner"
      },
      { onConflict: "team_id,user_id" }
    );
    if (memberInsert.error) {
      throw memberInsert.error;
    }
    req.session.activeTeamId = workspace.id;
    res.json({ ok: true, team: workspace, storage: "supabase" });
  } catch (err) {
    if (missingTableError(err)) {
      res.status(500).json({
        error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to create team." });
  }
});

app.post("/api/team/join", requireAuth, async (req, res) => {
  const joinCode = String(req.body?.inviteCode || "").trim().toUpperCase();
  if (!joinCode) {
    res.status(400).json({ error: "Invite code is required." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const userId = req.session.user.id;

  try {
    const workspaceRes = await supabaseAdmin
      .from(TEAM_TABLES.workspaces)
      .select("*")
      .eq("invite_code", joinCode)
      .maybeSingle();
    if (workspaceRes.error) {
      throw workspaceRes.error;
    }
    const workspace = workspaceRes.data;
    if (!workspace) {
      res.status(404).json({ error: "Invite code not found." });
      return;
    }

    const memberUpsert = await supabaseAdmin.from(TEAM_TABLES.members).upsert(
      {
        team_id: workspace.id,
        user_id: userId,
        role: "member"
      },
      { onConflict: "team_id,user_id" }
    );
    if (memberUpsert.error) {
      throw memberUpsert.error;
    }
    req.session.activeTeamId = workspace.id;
    res.json({ ok: true, team: workspace, storage: "supabase" });
  } catch (err) {
    if (missingTableError(err)) {
      res.status(500).json({
        error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to join team." });
  }
});

app.post("/api/team/switch", requireAuth, async (req, res) => {
  const teamId = String(req.body?.teamId || "");
  if (!teamId) {
    res.status(400).json({ error: "teamId is required." });
    return;
  }

  try {
    const state = await getTeamState(req.session);
    if (!state.teams.some((t) => t.id === teamId)) {
      res.status(403).json({ error: "You are not a member of that team." });
      return;
    }
    req.session.activeTeamId = teamId;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to switch team." });
  }
});

app.delete("/api/team/:teamId", requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const teamId = String(req.params.teamId || "");
  const userId = req.session.user?.id;
  if (!teamId) {
    res.status(400).json({ error: "teamId is required." });
    return;
  }

  try {
    const ownership = await supabaseAdmin
      .from(TEAM_TABLES.workspaces)
      .select("id")
      .eq("id", teamId)
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (ownership.error) {
      throw ownership.error;
    }
    if (!ownership.data) {
      res.status(403).json({ error: "Only the team owner can delete this team." });
      return;
    }

    const deleted = await supabaseAdmin.from(TEAM_TABLES.workspaces).delete().eq("id", teamId);
    if (deleted.error) {
      throw deleted.error;
    }

    if (req.session.activeTeamId === teamId) {
      req.session.activeTeamId = null;
    }

    res.json({ ok: true });
  } catch (err) {
    if (missingTableError(err)) {
      res.status(500).json({
        error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to delete team." });
  }
});

app.post("/api/team/tasks", requireAuth, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const assigneeUserId = String(req.body?.assigneeUserId || "").trim() || null;
  if (!title) {
    res.status(400).json({ error: "Task title is required." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const teamState = await getTeamState(req.session);
  const teamId = req.session.activeTeamId || teamState.activeTeamId;
  if (!teamId) {
    res.status(400).json({ error: "Create or join a team first." });
    return;
  }

  const insertTask = await supabaseAdmin
    .from(TEAM_TABLES.tasks)
    .insert({
      team_id: teamId,
      title,
      status: "open",
      assignee_user_id: assigneeUserId,
      created_by_user_id: req.session.user.id
    });
  if (insertTask.error) {
    if (missingTableError(insertTask.error)) {
      res.status(500).json({
        error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      });
      return;
    }
    res.status(500).json({ error: insertTask.error.message });
    return;
  }
  res.json({ ok: true, storage: "supabase" });
});

app.patch("/api/team/tasks/:taskId", requireAuth, async (req, res) => {
  const taskId = String(req.params.taskId || "").trim();
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!taskId) {
    res.status(400).json({ error: "taskId is required." });
    return;
  }
  if (!["open", "completed"].includes(status)) {
    res.status(400).json({ error: "status must be open or completed." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  try {
    const teamState = await getTeamState(req.session);
    const teamIds = (teamState.teams || []).map((team) => team.id);
    if (!teamIds.length) {
      res.status(403).json({ error: "You are not a member of any team." });
      return;
    }

    const updateRes = await supabaseAdmin
      .from(TEAM_TABLES.tasks)
      .update({ status })
      .eq("id", taskId)
      .in("team_id", teamIds)
      .select("id")
      .maybeSingle();

    if (updateRes.error) {
      if (missingTableError(updateRes.error)) {
        res.status(500).json({
          error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
        });
        return;
      }
      res.status(500).json({ error: updateRes.error.message });
      return;
    }

    if (!updateRes.data) {
      res.status(404).json({ error: "Task not found or access denied." });
      return;
    }

    res.json({ ok: true, storage: "supabase" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to update task." });
  }
});

app.delete("/api/team/tasks/:taskId", requireAuth, async (req, res) => {
  const taskId = String(req.params.taskId || "").trim();
  if (!taskId) {
    res.status(400).json({ error: "taskId is required." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  try {
    const teamState = await getTeamState(req.session);
    const teamIds = (teamState.teams || []).map((team) => team.id);
    if (!teamIds.length) {
      res.status(403).json({ error: "You are not a member of any team." });
      return;
    }

    const deleteRes = await supabaseAdmin
      .from(TEAM_TABLES.tasks)
      .delete()
      .eq("id", taskId)
      .in("team_id", teamIds)
      .select("id")
      .maybeSingle();

    if (deleteRes.error) {
      if (missingTableError(deleteRes.error)) {
        res.status(500).json({
          error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
        });
        return;
      }
      res.status(500).json({ error: deleteRes.error.message });
      return;
    }

    if (!deleteRes.data) {
      res.status(404).json({ error: "Task not found or access denied." });
      return;
    }

    res.json({ ok: true, storage: "supabase" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to delete task." });
  }
});

app.post("/api/team/artifacts", requireAuth, async (req, res) => {
  const type = String(req.body?.type || "").trim();
  const title = String(req.body?.title || "").trim();
  const summary = String(req.body?.summary || "").trim();
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
  if (!["run", "fix", "plan"].includes(type)) {
    res.status(400).json({ error: "type must be one of run, fix, plan." });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "Artifact title is required." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Team workspace requires SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const teamState = await getTeamState(req.session);
  const teamId = req.session.activeTeamId || teamState.activeTeamId;
  if (!teamId) {
    res.status(400).json({ error: "Create or join a team first." });
    return;
  }

  const insertArtifact = await supabaseAdmin
    .from(TEAM_TABLES.artifacts)
    .insert({
      team_id: teamId,
      type,
      title,
      summary,
      payload,
      created_by_user_id: req.session.user.id
    });
  if (insertArtifact.error) {
    if (missingTableError(insertArtifact.error)) {
      res.status(500).json({
        error: "Team workspace tables are missing. Run supabase/team_workspace_schema.sql first."
      });
      return;
    }
    res.status(500).json({ error: insertArtifact.error.message });
    return;
  }
  res.json({ ok: true, storage: "supabase" });
});

app.post("/api/artifacts/generate", requireAuth, async (req, res) => {
  const repoFullName = String(req.body?.repoFullName || "").trim();
  if (!repoFullName) {
    res.status(400).json({ error: "repoFullName is required." });
    return;
  }

  try {
    const diagram = await generateIntegrationDiagramWithNanoBanana(repoFullName);
    res.json({ ok: true, artifact: diagram });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Artifact generation failed with Nano Banana."
    });
  }
});

// Serve Live Bench React app at /bench
const benchDir = path.join(__dirname, "..", "..", "dist", "bench");
app.use("/bench", express.static(benchDir));
app.get("/bench", (_req, res) => {
  res.sendFile(path.join(benchDir, "index.html"));
});
app.get("/bench/", (_req, res) => {
  res.sendFile(path.join(benchDir, "index.html"));
});

app.use(express.static(rendererDir));
app.use((_req, res) => {
  res.sendFile(path.join(rendererDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[forge-rde-server] running at ${APP_URL}`);
});
