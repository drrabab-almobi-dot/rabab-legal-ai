import { lstat, open, realpath, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
export const DEFAULT_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_BINARY_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_LIST_FILES = 10000;

const ALLOWED_DIRECTORIES = [
  "attached_assets",
  "artifacts/api-server",
  "artifacts/mcp-file-bridge",
  "artifacts/mockup-sandbox",
  "artifacts/rabab-legal",
  "artifacts/rabab-mobile",
  "docs",
  "lib",
  "scripts",
];

const ALLOWED_ROOT_FILES = new Set([
  ".gitignore",
  ".gitattributes",
  ".replit",
  ".replitignore",
  ".npmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "replit.md",
  "tsconfig.base.json",
  "tsconfig.json",
]);

const BLOCKED_SEGMENTS = new Set([
  ".agents",
  ".cache",
  ".expo",
  ".git",
  ".local",
  "build",
  "coverage",
  "dist",
  "migration_export",
  "node_modules",
  "out-tsc",
  "tmp",
]);

const SENSITIVE_NAME_PATTERNS = [
  /(^|[._-])env([._-]|$)/i,
  /secret/i,
  /credential/i,
  /password/i,
  /private/i,
  /(^|[._-])token([._-]|$)/i,
  /(^|[._-])session([._-]|$)/i,
  /database[_-]?url/i,
  /\.(?:pem|key|p12|pfx|jks|sqlite|db|log)$/i,
];

export class FilePolicyError extends Error {
  constructor(message, code = "NOT_ALLOWED") {
    super(message);
    this.name = "FilePolicyError";
    this.code = code;
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeRelativePath(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) {
    throw new FilePolicyError("A relative file path is required.");
  }
  if (input.includes("\0") || input.includes("\\")) {
    throw new FilePolicyError("The requested path is not allowed.");
  }
  if (input.startsWith("/")) {
    throw new FilePolicyError("Absolute paths are not allowed.");
  }

  const segments = input.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new FilePolicyError("Parent-directory traversal is not allowed.");
  }

  const normalized = segments.filter((segment) => segment && segment !== ".").join("/");
  if (!normalized) {
    throw new FilePolicyError("A file path is required.");
  }
  return normalized;
}

function isSensitiveSegment(segment) {
  if (/^\.env\.(?:example|sample|template)$/i.test(segment)) return false;
  return SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(segment));
}

function isAllowedRelativePath(relativePath) {
  const segments = relativePath.split("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (lowerSegments.some((segment) => BLOCKED_SEGMENTS.has(segment))) return false;
  if (segments.some(isSensitiveSegment)) return false;

  if (segments.length === 1) {
    return ALLOWED_ROOT_FILES.has(relativePath);
  }

  const isInsideAllowedDirectory = ALLOWED_DIRECTORIES.some(
    (directory) => relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
  if (!isInsideAllowedDirectory) return false;
  if (ALLOWED_DIRECTORIES.some((directory) => directory === relativePath || directory.startsWith(`${relativePath}/`))) {
    return true;
  }

  return true;
}

function isPermittedDirectoryPath(relativePath) {
  const segments = relativePath.split("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (lowerSegments.some((segment) => BLOCKED_SEGMENTS.has(segment))) return false;
  if (segments.some(isSensitiveSegment)) return false;
  return ALLOWED_DIRECTORIES.some(
    (directory) => relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
}

async function assertRegularFile(root, absolutePath, relativePath) {
  let stats;
  try {
    stats = await lstat(absolutePath);
  } catch {
    throw new FilePolicyError("The requested file was not found.");
  }
  if (stats.isSymbolicLink()) {
    throw new FilePolicyError("Symbolic links are not allowed.");
  }
  if (!stats.isFile()) {
    throw new FilePolicyError("The requested path is not a regular file.");
  }

  const resolved = await realpath(absolutePath);
  if (!isWithin(root, resolved)) {
    throw new FilePolicyError("The requested path is outside the project root.");
  }
  return { stats, resolved, relativePath };
}

export function createFilePolicy(projectRoot) {
  const root = path.resolve(projectRoot);

  function resolveRequestedPath(input) {
    const relativePath = normalizeRelativePath(input);
    if (!isAllowedRelativePath(relativePath)) {
      throw new FilePolicyError("The requested file is outside the permitted project scope.");
    }
    const absolutePath = path.resolve(root, ...relativePath.split("/"));
    if (!isWithin(root, absolutePath)) {
      throw new FilePolicyError("The requested path is outside the project root.");
    }
    return { relativePath, absolutePath };
  }

  async function getFile(input) {
    const resolvedPath = resolveRequestedPath(input);
    return assertRegularFile(root, resolvedPath.absolutePath, resolvedPath.relativePath);
  }

  async function walkDirectory(directoryPath, prefix, output) {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (output.length >= MAX_LIST_FILES) return;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.resolve(root, ...relativePath.split("/"));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (isPermittedDirectoryPath(relativePath)) {
          await walkDirectory(absolutePath, relativePath, output);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isAllowedRelativePath(relativePath)) continue;

      try {
        const safeFile = await assertRegularFile(root, absolutePath, relativePath);
        output.push({
          path: safeFile.relativePath,
          bytes: safeFile.stats.size,
          extension: path.posix.extname(safeFile.relativePath).toLowerCase() || null,
        });
      } catch {
        // A file can disappear or change type during an enumeration. Omit it
        // rather than leaking an unsafe path or failing the entire listing.
      }
    }
  }

  async function listFiles(prefix = "") {
    if (typeof prefix !== "string" || prefix.length > 512) {
      throw new FilePolicyError("The optional prefix is not allowed.");
    }

    const output = [];
    if (prefix) {
      const normalizedPrefix = normalizeRelativePath(prefix);
      if (!isAllowedRelativePath(normalizedPrefix) && !ALLOWED_DIRECTORIES.some(
        (directory) => normalizedPrefix === directory || normalizedPrefix.startsWith(`${directory}/`),
      )) {
        throw new FilePolicyError("The requested prefix is outside the permitted project scope.");
      }
      const absolutePrefix = path.resolve(root, ...normalizedPrefix.split("/"));
      if (!isWithin(root, absolutePrefix)) throw new FilePolicyError("The requested prefix is not allowed.");
      await walkDirectory(absolutePrefix, normalizedPrefix, output);
    } else {
      for (const rootFile of ALLOWED_ROOT_FILES) {
        if (output.length >= MAX_LIST_FILES) break;
        const absolutePath = path.resolve(root, rootFile);
        try {
          const safeFile = await assertRegularFile(root, absolutePath, rootFile);
          output.push({ path: safeFile.relativePath, bytes: safeFile.stats.size, extension: path.posix.extname(rootFile).toLowerCase() || null });
        } catch {
          // Optional root files are omitted when absent.
        }
      }
      for (const directory of ALLOWED_DIRECTORIES) {
        if (output.length >= MAX_LIST_FILES) break;
        await walkDirectory(path.resolve(root, ...directory.split("/")), directory, output);
      }
    }

    output.sort((left, right) => left.path.localeCompare(right.path));
    return { files: output, truncated: output.length >= MAX_LIST_FILES };
  }

  async function readTextFile(input, maxBytes = DEFAULT_MAX_READ_BYTES) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULT_MAX_READ_BYTES) {
      throw new FilePolicyError(`maxBytes must be an integer between 1 and ${DEFAULT_MAX_READ_BYTES}.`);
    }
    const safeFile = await getFile(input);
    if (safeFile.stats.size > maxBytes) {
      throw new FilePolicyError(`The file exceeds the ${maxBytes}-byte read limit.`, "TOO_LARGE");
    }
    const data = await readFile(safeFile.resolved);
    if (data.length > maxBytes) {
      throw new FilePolicyError(`The file exceeds the ${maxBytes}-byte read limit.`, "TOO_LARGE");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      throw new FilePolicyError("The requested file is not UTF-8 text.", "NOT_TEXT");
    }
    return { path: safeFile.relativePath, bytes: data.length, text };
  }

  async function readAllowedFile(input) {
    const safeFile = await getFile(input);
    return { path: safeFile.relativePath, bytes: safeFile.stats.size, data: await readFile(safeFile.resolved) };
  }

  async function readBinaryChunk(input, offset, maxBytes = DEFAULT_MAX_BINARY_CHUNK_BYTES) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new FilePolicyError("offset must be a non-negative integer.");
    }
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULT_MAX_BINARY_CHUNK_BYTES) {
      throw new FilePolicyError(`maxBytes must be an integer between 1 and ${DEFAULT_MAX_BINARY_CHUNK_BYTES}.`);
    }

    const safeFile = await getFile(input);
    if (offset >= safeFile.stats.size) {
      throw new FilePolicyError("offset is beyond the end of the file.");
    }

    const bytes = Math.min(maxBytes, safeFile.stats.size - offset);
    const data = Buffer.allocUnsafe(bytes);
    const handle = await open(safeFile.resolved, "r");
    try {
      const result = await handle.read(data, 0, bytes, offset);
      if (result.bytesRead !== bytes) throw new FilePolicyError("The file changed while it was being read.");
    } finally {
      await handle.close();
    }

    return {
      path: safeFile.relativePath,
      offset,
      bytes,
      totalBytes: safeFile.stats.size,
      data,
      nextOffset: offset + bytes < safeFile.stats.size ? offset + bytes : null,
    };
  }

  return {
    root,
    getFile,
    listFiles,
    readTextFile,
    readAllowedFile,
    readBinaryChunk,
  };
}