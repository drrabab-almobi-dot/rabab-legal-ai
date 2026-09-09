import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { readSafeZipEntries } from "./safe-zip";

function toBuffer(value: Uint8Array): Buffer {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

const archive = toBuffer(
  zipSync({
    "docs/first.txt": Buffer.from("first"),
    "docs/second.pdf": Buffer.from("second"),
    "ignored/image.png": Buffer.from("image"),
  }),
);

const selected = readSafeZipEntries(archive, {
  include: (entryName) => /\.(txt|pdf)$/i.test(entryName),
  maxEntries: 10,
  maxEntryBytes: 1024,
  maxTotalBytes: 2048,
});
assert.deepEqual(selected.map((entry) => entry.entryName).sort(), [
  "docs/first.txt",
  "docs/second.pdf",
]);
assert.equal(selected[0]?.data.toString(), "first");

assert.throws(
  () =>
    readSafeZipEntries(archive, {
      include: () => true,
      maxEntries: 2,
    }),
  /الحد المسموح/,
);

assert.throws(
  () =>
    readSafeZipEntries(archive, {
      include: () => true,
      maxEntryBytes: 4,
    }),
  /الحجم المسموح/,
);

assert.throws(
  () =>
    readSafeZipEntries(archive, {
      include: () => true,
      maxTotalBytes: 8,
    }),
  /الحجم المفكوك/,
);

const unsafePathArchive = toBuffer(
  zipSync({ "../outside.txt": Buffer.from("blocked") }),
);
assert.throws(
  () => readSafeZipEntries(unsafePathArchive),
  /مسار غير آمن/,
);

assert.throws(
  () => readSafeZipEntries(Buffer.from("not a zip")),
  /invalid|unexpected|zip/i,
);

console.log("Safe ZIP extraction policy passed");
