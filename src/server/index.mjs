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
const GITHUB_TOKENS_TABLE = "github_tokens";

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
      payload: {},
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

app.use(express.static(rendererDir));
app.use((_req, res) => {
  res.sendFile(path.join(rendererDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[forge-rde-server] running at ${APP_URL}`);
});
