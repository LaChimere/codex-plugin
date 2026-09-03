import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { prepareSessionTransfer } from "../plugins/codex/scripts/lib/claude-session-transfer.mjs";
import { exportCopilotSession } from "../plugins/codex/scripts/lib/copilot-session-transfer.mjs";
import { makeTempDir } from "./helpers.mjs";

const SESSION_ID = "12345678-1234-1234-1234-123456789abc";

function event(type, data, timestamp = "2026-09-03T03:36:08.522Z") {
  return JSON.stringify({ type, timestamp, data });
}

function writeEvents(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

test("Copilot session export preserves visible conversation and omits tool context", async () => {
  const root = makeTempDir();
  const repo = path.join(root, "repo");
  const sourcePath = path.join(root, "events.jsonl");
  const outputPath = path.join(root, "exports", `${SESSION_ID}.jsonl`);
  fs.mkdirSync(repo);
  writeEvents(sourcePath, [
    event("session.start", { version: 1, context: { cwd: repo } }),
    event("user.message", {
      content: "Review this change",
      transformedContent: "SYSTEM CONTENT MUST NOT BE COPIED",
      attachments: [
        { displayName: "design.png", mimeType: "image/png", path: "/secret/design.png" }
      ]
    }),
    event("system.message", { content: "PRIVATE SYSTEM PROMPT" }),
    event("assistant.message", {
      content: "I will inspect it.",
      reasoningText: "PRIVATE REASONING",
      encryptedContent: "PRIVATE ENCRYPTED VALUE"
    }),
    event("tool.execution_start", {
      toolCallId: "call-1",
      toolName: "bash",
      arguments: { command: "git diff", description: "Inspect changes" }
    }),
    event("tool.execution_complete", {
      toolCallId: "call-1",
      success: true,
      result: { content: "diff output" }
    }),
    event("assistant.message", { content: "child output", parentToolCallId: "parent-1" }),
    event("tool.execution_start", { toolName: "bash", arguments: {}, parentToolCallId: "parent-1" }),
    event("user.message", { content: "internal skill prompt", source: "skill-review" }),
    event("user.message", { content: "automatic continuation", isAutopilotContinuation: true }),
    event("session.binary_asset", { data: "PRIVATE BINARY DATA", mimeType: "image/png" }),
    "not-json",
    event("assistant.message", { content: "The change looks safe.", phase: "final_answer" })
  ]);

  const result = await exportCopilotSession(sourcePath, outputPath, { fallbackCwd: root });
  const records = fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(result.cwd, repo);
  assert.equal(result.stats.userMessages, 1);
  assert.equal(result.stats.assistantMessages, 2);
  assert.equal(result.stats.toolCalls, 1);
  assert.equal(result.stats.toolResults, 1);
  assert.equal(result.stats.ignoredInternalMessages, 2);
  assert.equal(result.stats.ignoredSubagentMessages, 2);
  assert.equal(result.stats.attachmentsOmitted, 1);
  assert.equal(result.stats.malformedLines, 1);
  assert.deepEqual(records.map((record) => record.type), ["user", "assistant"]);
  assert.match(records[0].message.content, /Review this change/);
  assert.match(records[0].message.content, /Attachment omitted: design\.png, image\/png/);
  assert.equal(records[1].message.content, "I will inspect it.\n\nThe change looks safe.");

  const exported = fs.readFileSync(outputPath, "utf8");
  for (const excluded of [
    "SYSTEM CONTENT MUST NOT BE COPIED",
    "PRIVATE SYSTEM PROMPT",
    "PRIVATE REASONING",
    "PRIVATE ENCRYPTED VALUE",
    "PRIVATE BINARY DATA",
    "/secret/design.png",
    "git diff",
    "diff output",
    "child output",
    "internal skill prompt",
    "automatic continuation"
  ]) {
    assert.doesNotMatch(exported, new RegExp(excluded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Copilot session export counts tool events without importing their payloads", async () => {
  const root = makeTempDir();
  const sourcePath = path.join(root, "events.jsonl");
  const outputPath = path.join(root, "export.jsonl");
  writeEvents(sourcePath, [
    event("user.message", { content: "Run both checks" }),
    event("tool.execution_start", {
      toolCallId: "call-a",
      toolName: "bash",
      arguments: { command: "first" }
    }),
    event("tool.execution_start", {
      toolCallId: "call-b",
      toolName: "bash",
      arguments: { command: "second" }
    }),
    event("tool.execution_complete", {
      toolCallId: "call-b",
      success: true,
      result: { content: "second result" }
    }),
    event("tool.execution_complete", {
      toolCallId: "call-a",
      success: true,
      result: { attachment: { path: "/secret/result.png", data: "BASE64_BINARY" } }
    })
  ]);

  const result = await exportCopilotSession(sourcePath, outputPath, { fallbackCwd: root });
  const records = fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(result.stats.toolCalls, 2);
  assert.equal(result.stats.toolResults, 2);
  assert.deepEqual(records.map((record) => record.message.content), ["Run both checks"]);
  assert.doesNotMatch(fs.readFileSync(outputPath, "utf8"), /first|second|secret|BASE64_BINARY/);
});

test("Copilot session export stays bounded when a turn contains many tool events", async () => {
  const root = makeTempDir();
  const sourcePath = path.join(root, "events.jsonl");
  const outputPath = path.join(root, "export.jsonl");
  const lines = [
    event("user.message", { content: "Investigate the repository" }),
    event("assistant.message", { content: "I will inspect it." })
  ];
  for (let index = 0; index < 500; index += 1) {
    lines.push(
      event("tool.execution_start", {
        toolCallId: `call-${index}`,
        toolName: "bash",
        arguments: { command: `command-${index}` }
      }),
      event("tool.execution_complete", {
        toolCallId: `call-${index}`,
        success: true,
        result: { content: "x".repeat(4_000) }
      })
    );
  }
  lines.push(event("assistant.message", { content: "Inspection complete." }));
  writeEvents(sourcePath, lines);

  const result = await exportCopilotSession(sourcePath, outputPath, { fallbackCwd: root });
  const records = fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(result.stats.toolCalls, 500);
  assert.equal(result.stats.toolResults, 500);
  assert.deepEqual(records.map((record) => record.type), ["user", "assistant"]);
  assert.equal(records[1].message.content, "I will inspect it.\n\nInspection complete.");
  assert.ok(fs.statSync(outputPath).size < 1_000);
});

test("session transfer resolves the current Copilot session and writes a stable import file", async () => {
  const root = makeTempDir();
  const repo = path.join(root, "repo");
  const copilotHome = path.join(root, ".copilot");
  const pluginData = path.join(root, "plugin-data");
  const sourcePath = path.join(copilotHome, "session-state", SESSION_ID, "events.jsonl");
  fs.mkdirSync(repo);
  writeEvents(sourcePath, [
    event("session.start", { version: 1, context: { cwd: repo } }),
    event("user.message", { content: "Continue this in Codex" })
  ]);

  const first = await prepareSessionTransfer(repo, {
    env: {
      COPILOT_HOME: copilotHome,
      COPILOT_AGENT_SESSION_ID: SESSION_ID,
      COPILOT_PLUGIN_DATA: pluginData
    }
  });
  const second = await prepareSessionTransfer(repo, {
    env: {
      COPILOT_HOME: copilotHome,
      COPILOT_AGENT_SESSION_ID: SESSION_ID,
      COPILOT_PLUGIN_DATA: pluginData
    }
  });

  assert.equal(first.host, "copilot");
  assert.equal(first.sessionId, SESSION_ID);
  assert.equal(first.sourcePath, fs.realpathSync(sourcePath));
  assert.equal(
    first.importPath,
    path.join(pluginData, "external-agent-home", ".claude", "projects", "copilot", `${SESSION_ID}.jsonl`)
  );
  assert.equal(first.externalAgentHome, path.join(pluginData, "external-agent-home"));
  assert.equal(second.importPath, first.importPath);
});

test("session transfer rejects Copilot sources outside the active session root", async () => {
  const root = makeTempDir();
  const repo = path.join(root, "repo");
  const copilotHome = path.join(root, ".copilot");
  const sourcePath = path.join(root, SESSION_ID, "events.jsonl");
  fs.mkdirSync(repo);
  writeEvents(sourcePath, [event("user.message", { content: "outside" })]);
  fs.mkdirSync(path.join(copilotHome, "session-state"), { recursive: true });

  await assert.rejects(
    prepareSessionTransfer(repo, {
      source: sourcePath,
      env: { COPILOT_HOME: copilotHome, COPILOT_PLUGIN_DATA: path.join(root, "plugin-data") }
    }),
    /only from .*\.claude.*projects.*or.*session-state/i
  );
});
