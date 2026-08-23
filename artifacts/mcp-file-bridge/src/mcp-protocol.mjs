import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  DEFAULT_MAX_ARCHIVE_BYTES,
  DEFAULT_MAX_BINARY_CHUNK_BYTES,
  DEFAULT_MAX_READ_BYTES,
  FilePolicyError,
} from "./file-policy.mjs";
import { createZipArchive } from "./zip.mjs";

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MCP_SERVER_INFO = {
  name: "rabab-project-files",
  version: "1.1.0",
};

export const MCP_TOOLS = [
  {
    name: "list_project_files",
    description: "List every permitted non-secret project file, including source, documentation, and project attachments.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Optional permitted relative directory prefix." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_project_file",
    description: `Read one permitted UTF-8 text file, limited to ${DEFAULT_MAX_READ_BYTES} bytes.`,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path returned by list_project_files." },
        maxBytes: { type: "integer", minimum: 1, maximum: DEFAULT_MAX_READ_BYTES },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "create_project_archive",
    description: `Create the next read-only ZIP batch of permitted project files, up to ${DEFAULT_MAX_ARCHIVE_BYTES} uncompressed bytes, with SHA-256 manifest entries. Continue with nextCursor until complete; use read_project_binary_chunk for an individual file larger than a ZIP batch.`,
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Optional permitted relative directory prefix." },
        maxBytes: { type: "integer", minimum: 1, maximum: DEFAULT_MAX_ARCHIVE_BYTES },
        cursor: { type: "integer", minimum: 0, description: "Optional nextCursor returned by the previous archive batch." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_project_binary_chunk",
    description: `Read one chunk of a permitted binary project file, up to ${DEFAULT_MAX_BINARY_CHUNK_BYTES} bytes. Continue with nextOffset until the file is complete.`,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path returned by list_project_files." },
        offset: { type: "integer", minimum: 0, description: "Byte offset; defaults to 0." },
        maxBytes: { type: "integer", minimum: 1, maximum: DEFAULT_MAX_BINARY_CHUNK_BYTES },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

export function createSession() {
  return { id: randomUUID(), createdAt: Date.now(), lastActivityAt: Date.now() };
}

function resultText(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function mimeTypeFor(filePath) {
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  return {
    css: "text/css",
    gif: "image/gif",
    html: "text/html",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    json: "application/json",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    webp: "image/webp",
    zip: "application/zip",
  }[extension] || "application/octet-stream";
}

function assertArguments(argumentsValue) {
  if (argumentsValue === undefined) return {};
  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    throw new FilePolicyError("Tool arguments must be a JSON object.");
  }
  return argumentsValue;
}

async function callTool(name, rawArguments, policy, createdAt = new Date().toISOString()) {
  const argumentsValue = assertArguments(rawArguments);
  if (name === "list_project_files") {
    const listing = await policy.listFiles(argumentsValue.prefix || "");
    return resultText(JSON.stringify(listing), listing);
  }

  if (name === "read_project_file") {
    const result = await policy.readTextFile(argumentsValue.path, argumentsValue.maxBytes || DEFAULT_MAX_READ_BYTES);
    return resultText(result.text, { path: result.path, bytes: result.bytes, encoding: "utf-8" });
  }

  if (name === "read_project_binary_chunk") {
    const offset = argumentsValue.offset ?? 0;
    const result = await policy.readBinaryChunk(
      argumentsValue.path,
      offset,
      argumentsValue.maxBytes || DEFAULT_MAX_BINARY_CHUNK_BYTES,
    );
    const blob = result.data.toString("base64");
    const chunkHash = sha256(result.data);
    const summary = `Read ${result.bytes} binary bytes from ${result.path} at offset ${result.offset}.`;
    return {
      ...resultText(summary, {
        path: result.path,
        offset: result.offset,
        bytes: result.bytes,
        totalBytes: result.totalBytes,
        nextOffset: result.nextOffset,
        sha256: chunkHash,
      }),
      content: [
        { type: "text", text: summary },
        {
          type: "resource",
          resource: {
            uri: `rabab-project://file/${encodeURIComponent(result.path)}?offset=${result.offset}`,
            mimeType: mimeTypeFor(result.path),
            blob,
          },
        },
      ],
    };
  }

  if (name === "create_project_archive") {
    const maxBytes = argumentsValue.maxBytes || DEFAULT_MAX_ARCHIVE_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULT_MAX_ARCHIVE_BYTES) {
      throw new FilePolicyError(`maxBytes must be an integer between 1 and ${DEFAULT_MAX_ARCHIVE_BYTES}.`);
    }
    const listing = await policy.listFiles(argumentsValue.prefix || "");
    const cursor = argumentsValue.cursor ?? 0;
    if (!Number.isInteger(cursor) || cursor < 0 || cursor >= listing.files.length) {
      throw new FilePolicyError("cursor must be a valid non-negative archive cursor.");
    }
    const entries = [];
    let totalBytes = 0;
    let nextCursor = cursor;
    const oversizedFiles = [];
    const manifestLines = [
      "RABAB LEGAL AI project files MCP archive",
      `createdAt: ${createdAt}`,
      `archiveCursor: ${cursor}`,
      "path\tbytes\tsha256",
    ];

    for (let index = cursor; index < listing.files.length; index += 1) {
      const item = listing.files[index];
      if (item.bytes > maxBytes) {
        oversizedFiles.push({ path: item.path, bytes: item.bytes });
        nextCursor = index + 1;
        continue;
      }
      if (totalBytes + item.bytes > maxBytes) {
        nextCursor = index;
        break;
      }
      const file = await policy.readAllowedFile(item.path);
      totalBytes += file.data.length;
      entries.push({ name: file.path, data: file.data });
      manifestLines.push(`${file.path}\t${file.data.length}\t${sha256(file.data)}`);
      nextCursor = index + 1;
    }

    const archive = createZipArchive([
      { name: "MANIFEST.txt", data: Buffer.from(`${manifestLines.join("\n")}\n`, "utf8") },
      ...entries,
    ]);
    const blob = archive.toString("base64");
    const complete = nextCursor >= listing.files.length;
    const continuation = complete ? null : nextCursor;
    const summary = `Created archive batch with ${entries.length} permitted files (${totalBytes} bytes).`;
    return {
      ...resultText(
        summary,
        {
          fileCount: entries.length,
          sourceBytes: totalBytes,
          archiveBytes: archive.length,
          filename: `rabab-project-files-${cursor}.zip`,
          nextCursor: continuation,
          complete,
          oversizedFiles,
        },
      ),
      content: [
        { type: "text", text: summary },
        {
          type: "resource",
          resource: {
            uri: `rabab-project://archive/${cursor}`,
            mimeType: "application/zip",
            blob,
          },
        },
      ],
    };
  }

  throw new FilePolicyError("The requested tool does not exist.", "UNKNOWN_TOOL");
}

export async function handleMcpMessage(message, { policy, session, now = Date.now() }) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request." } };
  }
  const id = message.id ?? null;
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0];
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: "Read-only project source bridge. Secrets, sessions, live data, dependencies, generated files, and write operations are excluded.",
      },
    };
  }

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
  if (message.method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    try {
      return { jsonrpc: "2.0", id, result: await callTool(name, message.params?.arguments, policy, new Date(now).toISOString()) };
    } catch (error) {
      const messageText = error instanceof FilePolicyError ? error.message : "The requested file operation failed safely.";
      return { jsonrpc: "2.0", id, result: toolError(messageText) };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." } };
}