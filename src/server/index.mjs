import express from "express";
import session from "express-session";
import sessionFileStore from "session-file-store";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDir = path.join(__dirname, "..", "renderer");

const PORT = Number(process.env.PORT || 3030);
const APP_URL = process.env.APP_URL || `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "forge-dev-secret";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || "gemini-3.1-flash-image-preview";
const VISUALIZER_SUMMARY_MODEL =
  process.env.VISUALIZER_SUMMARY_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
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

const FileStore = sessionFileStore(session);
const sessionDir = path.join(os.homedir(), ".forge-rde", "sessions");
fsSync.mkdirSync(sessionDir, { recursive: true });
const robotGraphDir = path.join(os.homedir(), ".forge-rde", "robot-graphs");
fsSync.mkdirSync(robotGraphDir, { recursive: true });

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
  const response = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "forge-rde"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status})`);
  }

  const repos = await response.json();
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

async function summarizeFilesWithGemini(repoPath, relativePaths) {
  const summaryByPath = new Map();
  if (!GOOGLE_AI_API_KEY) {
    return summaryByPath;
  }

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

    const endpoint = `${GOOGLE_GENAI_BASE_URL}/models/${encodeURIComponent(
      VISUALIZER_SUMMARY_MODEL
    )}:generateContent`;

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
    } catch {
      // Best-effort summaries only.
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
        "Gemini summary unavailable for this file in the current run."
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
  const [owner, repo] = String(repoFullName || "").split("/");
  if (!owner || !repo) {
    throw new Error("repoFullName must be in owner/repo format.");
  }

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
  const rawResults = await searchDuckDuckGo(query);
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
  if (!repoFullName) {
    res.status(400).json({ error: "repoFullName is required." });
    return;
  }

  try {
    const repoPath = await resolveRepoFullNameToLocalPath(repoFullName);
    const files = await listRepoFiles(repoPath);
    res.json({ repoPath, repoFullName, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to resolve local repository." });
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

app.use(express.static(rendererDir));
app.use((_req, res) => {
  res.sendFile(path.join(rendererDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[forge-rde-server] running at ${APP_URL}`);
});
