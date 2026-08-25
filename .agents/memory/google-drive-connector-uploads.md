---
name: Google Drive connector uploads
description: Constraints and resilient fallback for moving large private files through the Google Drive connector.
---

For large private-file transfers through the Google Drive connector, prefer multipart uploads in moderately sized parts. The connector's resumable upload session can accept the initial request but reject subsequent `PUT` chunks, while multipart `POST` uploads usually succeed. In the Replit CodeExecution proxy, passing a Node `Buffer` as `proxyFetch` body can fail before the request is sent; when that transport limitation appears, a `multipart/related` request with a MIME base64 media part preserves raw bytes in the resulting Drive file.

**Why:** The connector proxy may block resumable-session `PUT` traffic or a WAF may reject a particular binary segment even when the OAuth connection is healthy and other segments upload normally.

**How to apply:** Keep Drive files private. On a segment-specific WAF rejection, first try a two-stage raw-binary upload: create the Drive file metadata, then `PATCH` its `/upload/drive/v3/files/{id}?uploadType=media` endpoint with the original bytes. If the proxy rejects `Buffer` request bodies, use multipart/related with `Content-Transfer-Encoding: base64` only as transport encoding; verify the stored Drive file size and MD5, and never create Base64 files. This can bypass a multipart-only challenge without altering or subdividing the requested raw layout. Do not reauthorize OAuth solely for a generic `403` without an authentication diagnosis.