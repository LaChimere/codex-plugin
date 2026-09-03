import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  forgetPluginDataDir,
  getCurrentSessionId,
  getPluginDataDir,
  normalizeHookInput,
  rememberPluginDataDir
} from "../plugins/codex/scripts/lib/host.mjs";

test("host helpers prefer existing Claude values and fall back to Copilot values", () => {
  assert.equal(
    getCurrentSessionId({ CODEX_COMPANION_SESSION_ID: "claude", COPILOT_AGENT_SESSION_ID: "copilot" }),
    "claude"
  );
  assert.equal(getCurrentSessionId({ COPILOT_AGENT_SESSION_ID: "copilot" }), "copilot");
  assert.equal(getPluginDataDir({ COPILOT_PLUGIN_DATA: "/copilot-data" }), "/copilot-data");
});

test("host helpers recall Copilot plugin data recorded by the session hook", () => {
  const sessionId = `copilot-test-${process.pid}-${Date.now()}`;
  rememberPluginDataDir(sessionId, "/copilot-data");
  try {
    assert.equal(getPluginDataDir({ COPILOT_AGENT_SESSION_ID: sessionId }), "/copilot-data");
  } finally {
    forgetPluginDataDir(sessionId);
  }
  assert.equal(getPluginDataDir({ COPILOT_AGENT_SESSION_ID: sessionId }), null);
});

test("host helpers derive plugin data for an installed Copilot marketplace plugin", () => {
  const copilotHome = path.join(path.sep, "tmp", "copilot-home");
  const pluginRoot = path.join(copilotHome, "installed-plugins", "lachimere-codex", "codex");

  assert.equal(
    getPluginDataDir({ COPILOT_HOME: copilotHome }, pluginRoot),
    path.join(copilotHome, "plugin-data", "lachimere-codex", "codex")
  );
});

test("host helpers do not guess plugin data for direct or unrelated plugin roots", () => {
  const copilotHome = path.join(path.sep, "tmp", "copilot-home");

  assert.equal(
    getPluginDataDir(
      { COPILOT_HOME: copilotHome },
      path.join(copilotHome, "installed-plugins", "_direct", "codex")
    ),
    null
  );
  assert.equal(getPluginDataDir({ COPILOT_HOME: copilotHome }, "/workspace/codex"), null);
});

test("hook normalization accepts Claude and Copilot field names", () => {
  assert.deepEqual(
    normalizeHookInput(
      {
        sessionId: "copilot-session",
        transcriptPath: "/copilot/events.jsonl",
        cwd: "/repo",
        stop_hook_active: true
      },
      {}
    ),
    {
      sessionId: "copilot-session",
      transcriptPath: "/copilot/events.jsonl",
      cwd: "/repo",
      lastAssistantMessage: "",
      stopHookActive: true
    }
  );
  assert.equal(
    normalizeHookInput({ session_id: "claude-session" }, { COPILOT_AGENT_SESSION_ID: "copilot" }).sessionId,
    "claude-session"
  );
});
