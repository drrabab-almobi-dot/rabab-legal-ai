import assert from "node:assert/strict";
import test from "node:test";
import { FilePolicyError } from "./file-policy.mjs";
import { handleMcpMessage } from "./mcp-protocol.mjs";

const policy = {
  async listFiles() {
    return { files: [{ path: "docs/bridge.md", bytes: 9, extension: ".md" }], truncated: false };
  },
  async readTextFile(filePath) {
    if (filePath === ".env") throw new FilePolicyError("The requested file is outside the permitted project scope.");
    return { path: filePath, bytes: 9, text: "# Bridge\n" };
  },
  async readAllowedFile(filePath) {
    return { path: filePath, bytes: 9, data: Buffer.from("# Bridge\n") };
  },
  async readBinaryChunk(filePath, offset) {
    return {
      path: filePath,
      offset,
      bytes: 3,
      totalBytes: 3,
      data: Buffer.from([1, 2, 3]),
      nextOffset: null,
    };
  },
};

test("initializes and advertises only read-only tools", async () => {
  const response = await handleMcpMessage(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { policy },
  );
  assert.equal(response.result.protocolVersion, "2025-03-26");

  const tools = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { policy });
  assert.deepEqual(tools.result.tools.map((tool) => tool.name), [
    "list_project_files",
    "read_project_file",
    "create_project_archive",
    "read_project_binary_chunk",
  ]);
});

test("returns an MCP tool error for a sensitive file request", async () => {
  const response = await handleMcpMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_project_file", arguments: { path: ".env" } } },
    { policy },
  );
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /outside the permitted project scope/i);
});

test("creates a ZIP resource with a manifest", async () => {
  const response = await handleMcpMessage(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_project_archive", arguments: {} } },
    { policy, now: Date.parse("2026-08-23T00:00:00.000Z") },
  );
  const resource = response.result.content.find((item) => item.type === "resource").resource;
  const zip = Buffer.from(resource.blob, "base64");
  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(response.result.structuredContent.fileCount, 1);
});

test("returns a bounded binary resource with a checksum", async () => {
  const response = await handleMcpMessage(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read_project_binary_chunk", arguments: { path: "attached_assets/brand.png" } } },
    { policy },
  );
  const resource = response.result.content.find((item) => item.type === "resource").resource;
  assert.equal(Buffer.from(resource.blob, "base64").toString("hex"), "010203");
  assert.equal(response.result.structuredContent.nextOffset, null);
  assert.match(response.result.structuredContent.sha256, /^[a-f0-9]{64}$/);
});