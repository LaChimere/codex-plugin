import test from "node:test";
import assert from "node:assert/strict";

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
