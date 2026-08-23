# Project Files MCP Bridge

Private, read-only MCP access for approved Claude connections. The bridge exposes all permitted non-secret project source, configuration, documentation, design assets, and attachments.

## Connection

Use the Streamable HTTP endpoint:

```text
https://<your-Replit-domain>/mcp-files/mcp
```

For local Replit preview testing, use the active development domain with the same `/mcp-files/mcp` path. For an external Claude connection, use the published deployment domain only after publishing is explicitly approved.

Configure the connector to send:

```text
Authorization: Bearer <MCP_FILES_TOKEN>
```

The endpoint requires an MCP session, which the client creates automatically by calling `initialize`.

## Available tools

| Tool | Purpose |
| --- | --- |
| `list_project_files` | Lists all permitted non-secret project files, including design assets and attachments. |
| `read_project_file` | Reads one permitted UTF-8 text file, capped at 1 MiB. |
| `create_project_archive` | Returns the next ZIP batch of permitted files with a SHA-256 `MANIFEST.txt`, capped at 50 MiB per batch. |
| `read_project_binary_chunk` | Returns a verified chunk of a permitted binary file, capped at 4 MiB; continue until `nextOffset` is null. |

The bridge has no write, delete, shell, database, or arbitrary-download tools.

## File safety policy

The bridge permits the project locations needed for a complete non-secret transfer, including application artifacts, `attached_assets`, `lib`, `docs`, `scripts`, and root configuration files. Archives are paginated with `nextCursor`; files larger than an archive batch are transferred with `read_project_binary_chunk`.

It rejects:

- absolute paths, `..` traversal, and symbolic links;
- secret, credential, key, password, token, and session-like file names;
- environment files and private certificates;
- dependency folders, build output, caches, and migration/export backups;
- database files and dumps, secrets, credentials, session material, certificates, and logs.

Every request is authenticated and rate-limited. Audit records contain the operation name, outcome, and byte count only; they never include a token or file content.

## Token operations

Set `MCP_FILES_TOKEN` in Replit Secrets to a random value of at least 32 characters. Never place it in a repository file or frontend configuration.

For a timed rotation window:

1. Set a new `MCP_FILES_TOKEN`.
2. Move the old token into `MCP_FILES_TOKEN_PREVIOUS`.
3. Set `MCP_FILES_TOKEN_PREVIOUS_EXPIRES_AT` to an ISO-8601 timestamp in the future.
4. Restart the bridge. After the time passes, the old token is rejected.
5. Remove the previous-token secrets after the grace period.

For immediate revocation, rotate `MCP_FILES_TOKEN` and do not set a previous token. A compromised grace token can also be revoked by clearing the previous-token secrets and restarting the bridge.

`MCP_FILES_TOKEN_REVOKED_HASHES` is available for exceptional cases where a token fingerprint must be rejected before its expiry. It accepts comma-separated SHA-256 token fingerprints, never raw token values.

## Health check

```text
GET /mcp-files/healthz
```

The health endpoint is intentionally public but returns no secret, filesystem, user, or connection details.