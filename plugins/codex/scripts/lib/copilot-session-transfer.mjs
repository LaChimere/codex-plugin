import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const MAX_EVENT_LINE_BYTES = 8 * 1024 * 1024;
const MAX_TOOL_RESULT_CHARS = 4_000;

function appendAttachmentMarkers(text, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return text;
  }
  const markers = attachments.map((attachment) => {
    const name = String(attachment?.displayName ?? "attachment").trim() || "attachment";
    const mimeType = String(attachment?.mimeType ?? "unknown type").trim() || "unknown type";
    return `[Attachment omitted: ${name}, ${mimeType}]`;
  });
  return [text, ...markers].filter(Boolean).join("\n\n");
}

function formatToolResult(data) {
  const result = data?.result;
  let value;
  if (typeof result?.content === "string") {
    value = result.content;
  } else if (typeof result?.detailedContent === "string") {
    value = result.detailedContent;
  } else if (result != null) {
    value = "[Non-text tool result omitted]";
  } else if (data?.error != null) {
    if (typeof data.error === "string") {
      value = data.error;
    } else if (typeof data.error?.message === "string") {
      const code = data.error.code == null ? "" : ` (${String(data.error.code)})`;
      value = `${data.error.message}${code}`;
    } else {
      value = "[Non-text tool error omitted]";
    }
  } else {
    value = "";
  }
  return String(value).slice(0, MAX_TOOL_RESULT_CHARS);
}

function copilotEventToRecord(event, state) {
  const data = event?.data ?? {};
  if (event?.type === "session.start") {
    const eventCwd = data.context?.cwd;
    if (typeof eventCwd === "string" && eventCwd.trim()) {
      state.cwd = eventCwd;
    }
    return null;
  }

  if (event?.type === "user.message") {
    const source = data.source ?? null;
    if ((source != null && source !== "user") || data.isAutopilotContinuation === true) {
      state.stats.ignoredInternalMessages += 1;
      return null;
    }
    const content = appendAttachmentMarkers(String(data.content ?? "").trim(), data.attachments);
    if (!content) {
      return null;
    }
    state.stats.userMessages += 1;
    state.stats.attachmentsOmitted += Array.isArray(data.attachments) ? data.attachments.length : 0;
    return {
      type: "user",
      cwd: state.cwd,
      timestamp: event.timestamp,
      message: { content }
    };
  }

  if (event?.type === "assistant.message") {
    if (data.parentToolCallId) {
      state.stats.ignoredSubagentMessages += 1;
      return null;
    }
    const content = String(data.content ?? "").trim();
    if (!content) {
      return null;
    }
    state.stats.assistantMessages += 1;
    return {
      type: "assistant",
      cwd: state.cwd,
      timestamp: event.timestamp,
      message: { content }
    };
  }

  if (event?.type === "tool.execution_start") {
    if (data.parentToolCallId) {
      state.stats.ignoredSubagentMessages += 1;
      return null;
    }
    state.stats.toolCalls += 1;
    return {
      type: "assistant",
      cwd: state.cwd,
      timestamp: event.timestamp,
      message: {
        content: [
          {
            type: "tool_use",
            id: data.toolCallId,
            name: data.toolName ?? data.mcpToolName ?? "unknown",
            input: data.arguments ?? {}
          }
        ]
      }
    };
  }

  if (event?.type === "tool.execution_complete") {
    if (data.parentToolCallId) {
      state.stats.ignoredSubagentMessages += 1;
      return null;
    }
    state.stats.toolResults += 1;
    return {
      type: "assistant",
      cwd: state.cwd,
      timestamp: event.timestamp,
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: data.toolCallId,
            is_error: data.success === false,
            content: formatToolResult(data)
          }
        ]
      }
    };
  }

  return null;
}

async function writeLine(stream, value) {
  const line = `${JSON.stringify(value)}\n`;
  if (stream.write(line)) {
    return;
  }
  await once(stream, "drain");
}

async function processLine(line, output, state) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    state.stats.malformedLines += 1;
    return;
  }
  const record = copilotEventToRecord(event, state);
  if (record) {
    await writeLine(output, record);
  }
}

export async function exportCopilotSession(sourcePath, outputPath, options = {}) {
  const sourceStat = fs.statSync(sourcePath);
  const snapshotBytes = sourceStat.size;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  const output = fs.createWriteStream(tempPath, { encoding: "utf8", mode: 0o600 });
  const state = {
    cwd: options.fallbackCwd,
    stats: {
      sourceBytes: snapshotBytes,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      ignoredInternalMessages: 0,
      ignoredSubagentMessages: 0,
      attachmentsOmitted: 0,
      malformedLines: 0,
      oversizedLines: 0
    }
  };

  try {
    if (snapshotBytes > 0) {
      const input = fs.createReadStream(sourcePath, {
        encoding: "utf8",
        start: 0,
        end: snapshotBytes - 1
      });
      let buffer = "";
      let oversized = false;
      for await (const chunk of input) {
        let start = 0;
        for (let index = 0; index < chunk.length; index += 1) {
          if (chunk[index] !== "\n") {
            continue;
          }
          if (!oversized) {
            buffer += chunk.slice(start, index);
            await processLine(buffer, output, state);
          } else {
            state.stats.oversizedLines += 1;
          }
          buffer = "";
          oversized = false;
          start = index + 1;
        }
        if (!oversized) {
          buffer += chunk.slice(start);
          if (Buffer.byteLength(buffer, "utf8") > MAX_EVENT_LINE_BYTES) {
            buffer = "";
            oversized = true;
          }
        }
      }
      if (!oversized && buffer.trim()) {
        await processLine(buffer, output, state);
      } else if (oversized) {
        state.stats.oversizedLines += 1;
      }
    }

    await new Promise((resolve, reject) => {
      output.end(resolve);
      output.once("error", reject);
    });
    if (state.stats.userMessages === 0) {
      throw new Error(`Copilot session contains no visible user messages: ${sourcePath}`);
    }
    fs.renameSync(tempPath, outputPath);
    return {
      cwd: state.cwd,
      stats: state.stats
    };
  } catch (error) {
    output.destroy();
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}
