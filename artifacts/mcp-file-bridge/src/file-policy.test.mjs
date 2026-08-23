import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createFilePolicy, FilePolicyError } from "./file-policy.mjs";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcp-file-policy-"));
  try {
    await mkdir(path.join(root, "attached_assets"), { recursive: true });
    await mkdir(path.join(root, "artifacts/api-server/src"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "node_modules/example"), { recursive: true });
    await writeFile(path.join(root, "artifacts/api-server/src/app.ts"), "export const safe = true;\n");
    await writeFile(path.join(root, "artifacts/api-server/src/.env"), "PRIVATE=value\n");
    await writeFile(path.join(root, "attached_assets/brand.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(root, "attached_assets/token.txt"), "must-not-transfer\n");
    await writeFile(path.join(root, "docs/bridge.md"), "# Bridge\n");
    await writeFile(path.join(root, "node_modules/example/index.js"), "module.exports = {};\n");
    await symlink(path.join(root, "docs/bridge.md"), path.join(root, "artifacts/api-server/src/linked.ts"));
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("lists only explicitly permitted regular files", async () => {
  await withFixture(async (root) => {
    const policy = createFilePolicy(root);
    const listing = await policy.listFiles();
    assert.deepEqual(
      listing.files.map((file) => file.path),
      ["artifacts/api-server/src/app.ts", "attached_assets/brand.png", "docs/bridge.md"],
    );
  });
});

test("rejects traversal, sensitive files, and symbolic links", async () => {
  await withFixture(async (root) => {
    const policy = createFilePolicy(root);
    await assert.rejects(() => policy.readTextFile("../package.json"), FilePolicyError);
    await assert.rejects(() => policy.readTextFile("artifacts/api-server/src/.env"), FilePolicyError);
    await assert.rejects(() => policy.readTextFile("artifacts/api-server/src/linked.ts"), FilePolicyError);
  });
});

test("enforces the configured text read limit", async () => {
  await withFixture(async (root) => {
    const policy = createFilePolicy(root);
    await assert.rejects(() => policy.readTextFile("artifacts/api-server/src/app.ts", 10), FilePolicyError);
    const file = await policy.readTextFile("artifacts/api-server/src/app.ts", 1024);
    assert.equal(file.text, "export const safe = true;\n");
  });
});

test("reads permitted binary attachments in bounded chunks", async () => {
  await withFixture(async (root) => {
    const policy = createFilePolicy(root);
    const chunk = await policy.readBinaryChunk("attached_assets/brand.png", 1, 2);
    assert.deepEqual(chunk.data, Buffer.from([0x50, 0x4e]));
    assert.equal(chunk.nextOffset, 3);
    await assert.rejects(() => policy.readBinaryChunk("attached_assets/token.txt", 0, 2), FilePolicyError);
  });
});