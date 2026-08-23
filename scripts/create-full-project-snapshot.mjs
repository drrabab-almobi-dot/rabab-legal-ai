import { createHash } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFilePolicy } from "../artifacts/mcp-file-bridge/src/file-policy.mjs";
import { createZipArchive } from "../artifacts/mcp-file-bridge/src/zip.mjs";

const projectRoot = process.cwd();
const outputDirectory = path.resolve(
  projectRoot,
  process.argv[2] || "exports/rabab-legal-full-project",
);
const batchLimitBytes = 45 * 1024 * 1024;
const fileChunkBytes = 4 * 1024 * 1024;

const policy = createFilePolicy(projectRoot);
const listing = await policy.listFiles();
if (listing.truncated) {
  throw new Error("The project file listing reached its safety limit; no snapshot was created.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let batchNumber = 1;
let batchEntries = [];
let batchRecords = [];
let batchSourceBytes = 0;
const batches = [];
const fileRecords = [];

async function flushBatch() {
  if (!batchEntries.length) return;

  const manifest = [
    "RABAB LEGAL AI — full non-secret project snapshot part",
    "All payload entries are raw bytes; the ZIP compression is lossless.",
    `part: ${batchNumber}`,
    `sourceBytes: ${batchSourceBytes}`,
    `chunkCount: ${batchRecords.length}`,
    "originalPath\toffset\tbytes\tentry\tsha256",
    ...batchRecords.map((record) =>
      [record.originalPath, record.offset, record.bytes, record.entry, record.sha256].join("\t"),
    ),
    "",
  ].join("\n");
  const archive = createZipArchive([
    { name: "MANIFEST.txt", data: Buffer.from(manifest, "utf8") },
    ...batchEntries,
  ]);
  const filename = `rabab-legal-project-part-${String(batchNumber).padStart(3, "0")}.zip`;
  await writeFile(path.join(outputDirectory, filename), archive);
  batches.push({
    part: batchNumber,
    filename,
    sourceBytes: batchSourceBytes,
    archiveBytes: archive.length,
    chunks: batchRecords.length,
  });
  batchNumber += 1;
  batchEntries = [];
  batchRecords = [];
  batchSourceBytes = 0;
}

for (const item of listing.files) {
  const safeFile = await policy.getFile(item.path);
  const handle = await open(safeFile.resolved, "r");
  const fileHash = createHash("sha256");
  let offset = 0;
  let chunkNumber = 1;
  try {
    if (safeFile.stats.size === 0) {
      batchEntries.push({ name: item.path, data: Buffer.alloc(0) });
      batchRecords.push({
        originalPath: item.path,
        offset: 0,
        bytes: 0,
        entry: item.path,
        sha256: createHash("sha256").update(Buffer.alloc(0)).digest("hex"),
      });
    }

    while (offset < safeFile.stats.size) {
      const bytes = Math.min(fileChunkBytes, safeFile.stats.size - offset);
      const data = Buffer.allocUnsafe(bytes);
      const result = await handle.read(data, 0, bytes, offset);
      if (result.bytesRead !== bytes) {
        throw new Error(`File changed while exporting: ${item.path}`);
      }

      if (batchEntries.length && batchSourceBytes + bytes > batchLimitBytes) {
        await flushBatch();
      }

      fileHash.update(data);
      const chunkHash = createHash("sha256").update(data).digest("hex");
      const entry =
        safeFile.stats.size <= fileChunkBytes
          ? item.path
          : `chunks/${String(fileRecords.length + 1).padStart(5, "0")}-${encodeURIComponent(item.path)}.part-${String(chunkNumber).padStart(4, "0")}`;
      batchEntries.push({ name: entry, data });
      batchRecords.push({
        originalPath: item.path,
        offset,
        bytes,
        entry,
        sha256: chunkHash,
      });
      batchSourceBytes += bytes;
      offset += bytes;
      chunkNumber += 1;
    }
  } finally {
    await handle.close();
  }

  fileRecords.push({
    path: item.path,
    bytes: safeFile.stats.size,
    sha256: fileHash.digest("hex"),
    chunks: chunkNumber - 1,
  });
}

await flushBatch();

const totalSourceBytes = fileRecords.reduce((sum, file) => sum + file.bytes, 0);
const globalManifest = [
  "RABAB LEGAL AI — full non-secret project snapshot",
  "This manifest covers every file permitted by the read-only transfer policy.",
  `fileCount: ${fileRecords.length}`,
  `sourceBytes: ${totalSourceBytes}`,
  `partCount: ${batches.length}`,
  "path\tbytes\tchunks\tsha256",
  ...fileRecords.map((file) => [file.path, file.bytes, file.chunks, file.sha256].join("\t")),
  "",
].join("\n");
await writeFile(path.join(outputDirectory, "TRANSFER_MANIFEST.tsv"), globalManifest, "utf8");

const instructions = [
  "RABAB LEGAL AI — Full Project Snapshot",
  "",
  "This is a lossless, read-only snapshot of all permitted non-secret project files.",
  "Secrets, credentials, session material, and database export data are intentionally not included.",
  "The ZIP parts contain raw file bytes and can be restored without changing their contents.",
  "",
  `Source files: ${fileRecords.length}`,
  `Source bytes: ${totalSourceBytes}`,
  `ZIP parts: ${batches.length}`,
  `Chunk size: ${fileChunkBytes} bytes`,
  "",
  "Extract all ZIP parts in order into the same directory. MANIFEST.txt in each part maps raw entries to their original paths and offsets.",
  "TRANSFER_MANIFEST.tsv contains the expected SHA-256 for every original file.",
  "For an entry named chunks/...part-NNNN, concatenate its entries by originalPath and offset to restore that large original file.",
  "",
  "MCP clients can transfer the same files directly with list_project_files, read_project_file, create_project_archive, and read_project_binary_chunk.",
  "",
].join("\n");
await writeFile(path.join(outputDirectory, "RESTORE_INSTRUCTIONS.txt"), instructions, "utf8");

console.log(
  JSON.stringify({
    outputDirectory,
    fileCount: fileRecords.length,
    sourceBytes: totalSourceBytes,
    partCount: batches.length,
    batches,
  }),
);