import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureAbsolutePath } from "./fs.mjs";
import { exportCopilotSession } from "./copilot-session-transfer.mjs";
import { getPluginDataDir } from "./host.mjs";

export const TRANSCRIPT_PATH_ENV = "CODEX_COMPANION_TRANSCRIPT_PATH";
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function copilotHome(env = process.env) {
  return path.resolve(env.COPILOT_HOME || path.join(os.homedir(), ".copilot"));
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function canonicalFile(filePath, label) {
  let canonical;
  try {
    canonical = fs.realpathSync(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
  if (!fs.statSync(canonical).isFile()) {
    throw new Error(`${label} must be a file: ${canonical}`);
  }
  return canonical;
}

function resolveUserPath(cwd, value) {
  if (value === "~") {
    return os.homedir();
  }
  if (String(value).startsWith("~/")) {
    return path.join(os.homedir(), String(value).slice(2));
  }
  return ensureAbsolutePath(cwd, value);
}

export function resolveClaudeSessionPath(cwd, options = {}) {
  const requestedPath = options.source || process.env[TRANSCRIPT_PATH_ENV];
  if (!requestedPath) {
    throw new Error("Could not identify the current Claude transcript. Retry with --source <path-to-claude-jsonl>.");
  }

  const sourcePath = resolveUserPath(cwd, requestedPath);
  if (path.extname(sourcePath) !== ".jsonl") {
    throw new Error(`Claude session source must be a JSONL file: ${sourcePath}`);
  }

  let source;
  let projects;
  try {
    source = fs.realpathSync(sourcePath);
    projects = fs.realpathSync(CLAUDE_PROJECTS_DIR);
  } catch {
    throw new Error(`Claude session file not found: ${sourcePath}`);
  }
  const relative = path.relative(projects, source);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Codex can import Claude sessions only from ${CLAUDE_PROJECTS_DIR}: ${source}`);
  }
  return source;
}

function resolveCopilotSessionPath(cwd, value, env = process.env) {
  const sessionRoot = path.join(copilotHome(env), "session-state");
  const sourcePath = canonicalFile(resolveUserPath(cwd, value), "Copilot session source");
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(sessionRoot);
  } catch {
    throw new Error(`Copilot session directory not found: ${sessionRoot}`);
  }
  if (!isWithin(canonicalRoot, sourcePath) || path.basename(sourcePath) !== "events.jsonl") {
    throw new Error(`Codex can import Copilot sessions only from ${sessionRoot}/<session-id>/events.jsonl: ${sourcePath}`);
  }
  const sessionId = path.basename(path.dirname(sourcePath));
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error(`Copilot session directory must use a UUID: ${path.dirname(sourcePath)}`);
  }
  return { sourcePath, sessionId };
}

function isRequestedClaudeSource(cwd, value) {
  try {
    const source = fs.realpathSync(resolveUserPath(cwd, value));
    const projects = fs.realpathSync(CLAUDE_PROJECTS_DIR);
    return isWithin(projects, source);
  } catch {
    return false;
  }
}

export async function prepareSessionTransfer(cwd, options = {}) {
  const env = options.env ?? process.env;
  const requestedPath = options.source || env[TRANSCRIPT_PATH_ENV];
  if (requestedPath && isRequestedClaudeSource(cwd, requestedPath)) {
    const sourcePath = resolveClaudeSessionPath(cwd, { source: requestedPath });
    return {
      host: "claude",
      sessionId: path.basename(sourcePath, ".jsonl"),
      sourcePath,
      importPath: sourcePath,
      cwd,
      stats: null
    };
  }

  let copilotSource = requestedPath;
  if (!copilotSource) {
    const sessionId = env.COPILOT_AGENT_SESSION_ID;
    if (sessionId) {
      copilotSource = path.join(copilotHome(env), "session-state", sessionId, "events.jsonl");
    }
  }
  if (!copilotSource) {
    throw new Error("Could not identify the current host session. Retry with --source <path-to-session-jsonl>.");
  }

  let copilotSession;
  try {
    copilotSession = resolveCopilotSessionPath(cwd, copilotSource, env);
  } catch (error) {
    if (requestedPath) {
      throw new Error(
        `Codex can import external sessions only from ${CLAUDE_PROJECTS_DIR} or ${path.join(copilotHome(env), "session-state")}: ${resolveUserPath(cwd, requestedPath)}`,
        { cause: error }
      );
    }
    throw error;
  }
  const { sourcePath, sessionId } = copilotSession;
  const pluginDataDir = getPluginDataDir(env);
  if (!pluginDataDir) {
    throw new Error("Copilot plugin data directory is unavailable. Run transfer from an installed Copilot plugin session.");
  }
  const externalAgentHome = path.join(path.resolve(pluginDataDir), "external-agent-home");
  const importPath = path.join(externalAgentHome, ".claude", "projects", "copilot", `${sessionId}.jsonl`);
  const exported = await exportCopilotSession(sourcePath, importPath, { fallbackCwd: cwd });
  return {
    host: "copilot",
    sessionId,
    sourcePath,
    importPath,
    externalAgentHome,
    cwd: exported.cwd || cwd,
    sourceVersion: exported.sourceVersion,
    stats: exported.stats
  };
}
