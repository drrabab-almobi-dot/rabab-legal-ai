import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";

const { default: app } = await import("../app.js");
const { db, usersTable } = await import("@workspace/db");
const { eq, sql } = await import("drizzle-orm");
const { JWT_SECRET } = await import("../middlewares/auth.js");

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

function createTextPdf(pageCount: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    for (let page = 1; page <= pageCount; page += 1) {
      document.addPage();
      document.fontSize(14).text(`Regression test page ${page}`);
    }
    document.end();
  });
}

let userId: number | null = null;
try {
  const email = `contract-extract-${uuidv4()}@test.local`;
  const result = await db.execute(
    sql`INSERT INTO users (name, email, password_hash, phone, role, is_active, phone_verified, token_version)
        VALUES ('Contract Extract Test', ${email}, 'x', '0500000000', 'user', true, true, 1)
        RETURNING id`,
  );
  userId = (result.rows[0] as { id: number }).id;

  const token = jwt.sign(
    { userId, userRole: "user", jti: uuidv4(), tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "5m" },
  );
  const pdf = await createTextPdf(11);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    "eleven-pages.pdf",
  );

  const response = await fetch(`${baseUrl}/api/contract/extract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = (await response.json()) as {
    error?: string;
    filename?: string;
    pageCount?: number;
    extractedText?: string;
  };

  assert.equal(
    response.status,
    200,
    `authenticated multi-page extraction must not fail: ${JSON.stringify(body)}`,
  );
  assert.equal(body.filename, "eleven-pages.pdf");
  assert.equal(body.pageCount, 11);
  assert.match(body.extractedText ?? "", /Regression test page 1/);
  assert.doesNotMatch(body.error ?? "", /userId/);
  console.log("✓ authenticated multi-page contract extraction uses req.userId");
} finally {
  if (userId !== null) {
    await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .catch(() => {});
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

process.exit(0);
