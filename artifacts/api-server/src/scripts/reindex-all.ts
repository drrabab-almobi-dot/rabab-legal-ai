/**
 * One-shot re-indexing script — re-indexes all stored documents from raw binary.
 * Applies the current text-direction fix + quality filters from scratch.
 * Run: pnpm --filter @workspace/api-server exec ts-node --esm src/scripts/reindex-all.ts
 *  OR: compile with build.mjs and run the output.
 */

import { db, knowledgeDocumentsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";
import { indexDocument } from "../lib/document-indexer.js";

async function main() {
  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      mimeType: knowledgeDocumentsTable.mimeType,
      fileData: knowledgeDocumentsTable.fileData,
    })
    .from(knowledgeDocumentsTable)
    .where(isNull(knowledgeDocumentsTable.archivedAt));

  const indexable = docs.filter(
    (d) => d.fileData && (d.fileData as Buffer).length > 0
  );

  console.log(`\n📚 إعادة فهرسة ${indexable.length} وثيقة من أصل ${docs.length}...\n`);

  let ok = 0;
  let fail = 0;

  for (const doc of indexable) {
    try {
      process.stdout.write(`  ← ${doc.filename} … `);
      const { chunks } = await indexDocument(
        doc.id,
        Buffer.from(doc.fileData as Buffer),
        doc.mimeType ?? "application/octet-stream",
        doc.filename
      );
      ok++;
      process.stdout.write(`✓ ${chunks} مقاطع\n`);
    } catch (err: any) {
      fail++;
      process.stdout.write(`✗ ${err?.message ?? "خطأ"}\n`);
    }
  }

  console.log(`\n✅ اكتمل: نجح ${ok}، فشل ${fail} من أصل ${indexable.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
