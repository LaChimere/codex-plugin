import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const CLAUDE_SESSION_ID_ENV = "CODEX_COMPANION_SESSION_ID";
export const COPILOT_SESSION_ID_ENV = "COPILOT_AGENT_SESSION_ID";
const COPILOT_PLUGIN_DATA_REGISTRY = path.join(os.tmpdir(), "codex-companion", "copilot-plugin-data");

function pluginDataRegistryFile(sessionId) {
  const digest = createHash("sha256").update(String(sessionId)).digest("hex");
  return path.join(COPILOT_PLUGIN_DATA_REGISTRY, `${digest}.json`);
}

function recalledPluginDataDir(sessionId) {
  if (!sessionId) {
    return null;
  }
  try {
    const record = JSON.parse(fs.readFileSync(pluginDataRegistryFile(sessionId), "utf8"));
    return typeof record.pluginDataDir === "string" && record.pluginDataDir ? record.pluginDataDir : null;
  } catch {
    return null;
  }
}

export function getCurrentSessionId(env = process.env) {
  return env[CLAUDE_SESSION_ID_ENV] ?? env[COPILOT_SESSION_ID_ENV] ?? null;
}

export function getPluginDataDir(env = process.env) {
  return (
    env.CLAUDE_PLUGIN_DATA ??
    env.COPILOT_PLUGIN_DATA ??
    recalledPluginDataDir(env[COPILOT_SESSION_ID_ENV]) ??
    null
  );
}

export function rememberPluginDataDir(sessionId, pluginDataDir) {
  if (!sessionId || !pluginDataDir) {
    return;
  }
  fs.mkdirSync(COPILOT_PLUGIN_DATA_REGISTRY, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    pluginDataRegistryFile(sessionId),
    `${JSON.stringify({ pluginDataDir: path.resolve(pluginDataDir) })}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

export function forgetPluginDataDir(sessionId) {
  if (!sessionId) {
    return;
  }
  const registryFile = pluginDataRegistryFile(sessionId);
  if (fs.existsSync(registryFile)) {
    fs.unlinkSync(registryFile);
  }
}

export function normalizeHookInput(input = {}, env = process.env) {
  return {
    sessionId: input.session_id ?? input.sessionId ?? getCurrentSessionId(env),
    transcriptPath: input.transcript_path ?? input.transcriptPath ?? null,
    cwd: input.cwd ?? env.CLAUDE_PROJECT_DIR ?? null,
    lastAssistantMessage: input.last_assistant_message ?? input.lastAssistantMessage ?? "",
    stopHookActive: Boolean(input.stop_hook_active ?? input.stopHookActive)
  };
}
