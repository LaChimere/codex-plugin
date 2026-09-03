#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

import { terminateProcessTree } from "./lib/process.mjs";
import { BROKER_ENDPOINT_ENV } from "./lib/app-server.mjs";
import {
  clearBrokerSession,
  LOG_FILE_ENV,
  loadBrokerSession,
  PID_FILE_ENV,
  sendBrokerShutdown,
  teardownBrokerSession
} from "./lib/broker-lifecycle.mjs";
import { loadState, resolveStateFile, saveState } from "./lib/state.mjs";
import { TRANSCRIPT_PATH_ENV } from "./lib/claude-session-transfer.mjs";
import {
  CLAUDE_SESSION_ID_ENV,
  forgetPluginDataDir,
  getPluginDataDir,
  normalizeHookInput,
  rememberPluginDataDir
} from "./lib/host.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

export const SESSION_ID_ENV = CLAUDE_SESSION_ID_ENV;
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || value == null || value === "") {
    return;
  }
  fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export ${name}=${shellEscape(value)}\n`, "utf8");
}

function cleanupSessionJobs(cwd, sessionId) {
  if (!cwd || !sessionId) {
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const stateFile = resolveStateFile(workspaceRoot);
  if (!fs.existsSync(stateFile)) {
    return;
  }

  const state = loadState(workspaceRoot);
  const removedJobs = state.jobs.filter((job) => job.sessionId === sessionId);
  if (removedJobs.length === 0) {
    return;
  }

  for (const job of removedJobs) {
    const stillRunning = job.status === "queued" || job.status === "running";
    if (!stillRunning) {
      continue;
    }
    try {
      terminateProcessTree(job.pid ?? Number.NaN);
    } catch {
      // Ignore teardown failures during session shutdown.
    }
  }

  saveState(workspaceRoot, {
    ...state,
    jobs: state.jobs.filter((job) => job.sessionId !== sessionId)
  });
}

function handleSessionStart(input) {
  const normalized = normalizeHookInput(input, process.env);
  const pluginDataDir = getPluginDataDir(process.env);
  if (!process.env.CLAUDE_ENV_FILE) {
    rememberPluginDataDir(normalized.sessionId, pluginDataDir);
  }
  appendEnvVar(SESSION_ID_ENV, normalized.sessionId);
  appendEnvVar(TRANSCRIPT_PATH_ENV, normalized.transcriptPath);
  appendEnvVar(PLUGIN_DATA_ENV, pluginDataDir);
}

async function handleSessionEnd(input) {
  const normalized = normalizeHookInput(input, process.env);
  const cwd = normalized.cwd || process.cwd();
  const brokerSession =
    loadBrokerSession(cwd) ??
    (process.env[BROKER_ENDPOINT_ENV]
      ? {
          endpoint: process.env[BROKER_ENDPOINT_ENV],
          pidFile: process.env[PID_FILE_ENV] ?? null,
          logFile: process.env[LOG_FILE_ENV] ?? null
        }
      : null);
  const brokerEndpoint = brokerSession?.endpoint ?? null;
  const pidFile = brokerSession?.pidFile ?? null;
  const logFile = brokerSession?.logFile ?? null;
  const sessionDir = brokerSession?.sessionDir ?? null;
  const pid = brokerSession?.pid ?? null;

  if (brokerEndpoint) {
    await sendBrokerShutdown(brokerEndpoint);
  }

  cleanupSessionJobs(cwd, normalized.sessionId);
  forgetPluginDataDir(normalized.sessionId);
  teardownBrokerSession({
    endpoint: brokerEndpoint,
    pidFile,
    logFile,
    sessionDir,
    pid,
    killProcess: terminateProcessTree
  });
  clearBrokerSession(cwd);
}

async function main() {
  const input = readHookInput();
  const eventName = process.argv[2] ?? input.hook_event_name ?? "";

  if (eventName === "SessionStart" || eventName === "sessionStart") {
    handleSessionStart(input);
    return;
  }

  if (eventName === "SessionEnd" || eventName === "sessionEnd") {
    await handleSessionEnd(input);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
