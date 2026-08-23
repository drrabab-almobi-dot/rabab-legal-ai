import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { authorizeBearerHeader, assertTokenConfiguration, tokenFingerprint } from "./auth.mjs";
import { createFilePolicy, FilePolicyError } from "./file-policy.mjs";
import { MCP_PROTOCOL_VERSIONS, handleMcpMessage, createSession } from "./mcp-protocol.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.resolve(currentDirectory, "..");
const workspaceRoot = path.resolve(currentDirectory, "../../..");
const port = Number(process.env.PORT || 24564);
const rawBasePath = process.env.BASE_PATH || "/mcp-files/";
const basePath = rawBasePath === "/" ? "" : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`;
const protocolPath = `${basePath}/mcp` || "/mcp";
const healthPath = `${basePath}/healthz` || "/healthz";
const maxBodyBytes = 1024 * 1024;
const sessionTtlMs = 30 * 60 * 1000;
const rateLimitPerMinute = Number(process.env.MCP_RATE_LIMIT_PER_MINUTE || 60);
const sessions = new Map();
const rateWindows = new Map();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
assertTokenConfiguration();

const policy = createFilePolicy(workspaceRoot);

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function noContent(res, status = 202, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end();
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", "http://mcp-bridge.local").pathname;
  } catch {
    return "/";
  }
}

function isProtocolPath(pathname) {
  return pathname === protocolPath || pathname === "/mcp";
}

function isHealthPath(pathname) {
  return pathname === healthPath || pathname === "/healthz";
}

function audit(req, event, fields = {}) {
  const entry = {
    event,
    requestId: randomUUID(),
    method: req.method,
    path: requestPath(req),
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

function cleanupSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > sessionTtlMs) sessions.delete(id);
  }
  for (const [key, timestamps] of rateWindows) {
    const recent = timestamps.filter((timestamp) => now - timestamp < 60_000);
    if (recent.length) rateWindows.set(key, recent);
    else rateWindows.delete(key);
  }
}

function isRateAllowed(req, authorizationHeader, now = Date.now()) {
  const forwarded = req.headers["x-forwarded-for"];
  const address = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
  const key = `${address}:${tokenFingerprint(authorizationHeader.slice("Bearer ".length).trim())}`;
  const recent = (rateWindows.get(key) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= rateLimitPerMinute) {
    rateWindows.set(key, recent);
    return false;
  }
  recent.push(now);
  rateWindows.set(key, recent);
  return true;
}

async function readJsonBody(req) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > maxBodyBytes) throw new FilePolicyError("The JSON request is too large.", "TOO_LARGE");

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) throw new FilePolicyError("The JSON request is too large.", "TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FilePolicyError("The request body must be valid JSON.", "INVALID_JSON");
  }
}

function protocolVersionFor(req, message) {
  const requested = req.headers["mcp-protocol-version"];
  if (typeof requested === "string" && MCP_PROTOCOL_VERSIONS.includes(requested)) return requested;
  const messageVersion = message?.params?.protocolVersion;
  if (MCP_PROTOCOL_VERSIONS.includes(messageVersion)) return messageVersion;
  return MCP_PROTOCOL_VERSIONS[0];
}

async function handleProtocol(req, res) {
  const authorizationHeader = req.headers.authorization;
  if (!authorizeBearerHeader(authorizationHeader)) {
    audit(req, "mcp_auth_rejected", { reason: "invalid_bearer" });
    json(res, 401, { error: "Unauthorized." }, { "WWW-Authenticate": "Bearer" });
    return;
  }
  if (!isRateAllowed(req, authorizationHeader)) {
    audit(req, "mcp_rate_limited");
    json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
    return;
  }
  if (req.method !== "POST") {
    audit(req, "mcp_method_rejected");
    json(res, 405, { error: "Only POST is supported for the MCP protocol endpoint." }, { Allow: "POST" });
    return;
  }

  cleanupSessions();
  let message;
  try {
    message = await readJsonBody(req);
  } catch (error) {
    const status = error instanceof FilePolicyError && error.code === "TOO_LARGE" ? 413 : 400;
    audit(req, "mcp_request_rejected", { reason: error instanceof Error ? error.message : "invalid_body" });
    json(res, status, { error: error instanceof Error ? error.message : "Invalid request." });
    return;
  }
  if (Array.isArray(message)) {
    audit(req, "mcp_request_rejected", { reason: "batch_not_supported" });
    json(res, 400, { error: "Batch JSON-RPC requests are not supported." });
    return;
  }

  const isInitialize = message?.method === "initialize";
  let session = null;
  if (isInitialize) {
    session = createSession();
    sessions.set(session.id, session);
  } else {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId !== "string" || !sessions.has(sessionId)) {
      audit(req, "mcp_session_rejected");
      json(res, 400, { error: "A valid MCP session is required. Initialize first." });
      return;
    }
    session = sessions.get(sessionId);
    session.lastActivityAt = Date.now();
  }

  const response = await handleMcpMessage(message, { policy, session });
  const headers = {
    "MCP-Protocol-Version": protocolVersionFor(req, message),
  };
  if (isInitialize) headers["Mcp-Session-Id"] = session.id;
  if (response === null) {
    audit(req, "mcp_notification_accepted", { methodName: message.method });
    noContent(res, 202, headers);
    return;
  }

  const toolName = message?.method === "tools/call" ? message.params?.name : undefined;
  const structured = response.result?.structuredContent;
  audit(req, "mcp_request_completed", {
    methodName: message.method,
    toolName: typeof toolName === "string" ? toolName : undefined,
    isError: response.result?.isError === true,
    bytes: typeof structured?.bytes === "number" ? structured.bytes : structured?.sourceBytes,
  });
  json(res, 200, response, headers);
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extension] || "application/octet-stream";
}

async function serveStatic(req, res, pathname) {
  const publicRoot = path.resolve(currentDirectory, "public");
  let relative = pathname;
  if (basePath && relative.startsWith(`${basePath}/`)) relative = relative.slice(basePath.length + 1);
  else if (basePath && relative === basePath) relative = "";
  else if (relative === "/") relative = "";
  relative = relative.replace(/^\/+/, "");
  if (!relative || relative.includes("..")) relative = "index.html";

  let filePath = path.resolve(publicRoot, relative);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypeFor(filePath), "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    if (path.extname(relative)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    filePath = path.resolve(publicRoot, "index.html");
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Status page is not built yet.");
    }
  }
}

async function handleRequest(req, res) {
  const pathname = requestPath(req);
  if (isHealthPath(pathname)) {
    json(res, 200, {
      status: "ok",
      service: "project-files-mcp",
      protocol: "streamable-http",
      readOnly: true,
      authentication: "bearer-token",
      workspaceScope: "allowlisted-non-secret-project-files",
      supportedProtocolVersions: MCP_PROTOCOL_VERSIONS,
    });
    return;
  }
  if (isProtocolPath(pathname)) {
    await handleProtocol(req, res);
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await import("vite");
    const devServer = await getViteServer(vite);
    devServer.middlewares(req, res, () => {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    });
    return;
  }
  await serveStatic(req, res, pathname);
}

let viteServer;
async function getViteServer(vite) {
  if (!viteServer) {
    viteServer = await vite.createServer({
      root: artifactDirectory,
      base: rawBasePath,
      server: { middlewareMode: true },
      appType: "spa",
    });
  }
  return viteServer;
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    audit(req, "mcp_bridge_internal_error", { reason: error instanceof Error ? error.name : "unknown" });
    if (!res.headersSent) json(res, 500, { error: "The bridge could not complete the request." });
    else res.destroy();
  });
});

server.on("clientError", (_error, socket) => socket.destroy());
server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "mcp_bridge_started",
    port,
    protocolPath,
    healthPath,
    readOnly: true,
    workspaceScope: "allowlisted-source-and-documentation",
  }));
});