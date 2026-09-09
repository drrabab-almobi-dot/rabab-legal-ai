import { unzipSync } from "fflate";

const MEBIBYTE = 1024 * 1024;

export interface SafeZipEntry {
  entryName: string;
  data: Buffer;
}

export interface SafeZipOptions {
  include?: (entryName: string) => boolean;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
}

function normalizeEntryName(entryName: string): string {
  return entryName.replaceAll("\\", "/");
}

function assertSafeEntryName(entryName: string): string {
  const normalized = normalizeEntryName(entryName);
  const segments = normalized.split("/");

  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === "..")
  ) {
    throw new Error("يحتوي ملف ZIP على مسار غير آمن");
  }

  return normalized;
}

/**
 * Decompress selected ZIP entries in memory while rejecting path traversal,
 * oversized files, decompression bombs, and archives with excessive entries.
 */
export function readSafeZipEntries(
  buffer: Buffer,
  options: SafeZipOptions = {},
): SafeZipEntry[] {
  const include = options.include ?? (() => true);
  const maxEntries = options.maxEntries ?? 1_000;
  const maxEntryBytes = options.maxEntryBytes ?? 50 * MEBIBYTE;
  const maxTotalBytes = options.maxTotalBytes ?? 100 * MEBIBYTE;

  let seenEntries = 0;
  let selectedBytes = 0;

  const input = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  const extracted = unzipSync(input, {
    filter(file) {
      const entryName = assertSafeEntryName(file.name);
      seenEntries += 1;
      if (seenEntries > maxEntries) {
        throw new Error(`يتجاوز ملف ZIP الحد المسموح (${maxEntries} ملف)`);
      }
      if (entryName.endsWith("/")) return false;

      if (!include(entryName)) return false;

      const originalSize = Number(file.originalSize);
      if (!Number.isSafeInteger(originalSize) || originalSize < 0) {
        throw new Error("تعذر التحقق من حجم ملف داخل ZIP");
      }
      if (originalSize > maxEntryBytes) {
        throw new Error("يحتوي ملف ZIP على ملف يتجاوز الحجم المسموح");
      }

      selectedBytes += originalSize;
      if (selectedBytes > maxTotalBytes) {
        throw new Error("يتجاوز الحجم المفكوك لملف ZIP الحد المسموح");
      }

      return true;
    },
  });

  let actualTotalBytes = 0;
  return Object.entries(extracted).map(([entryName, data]) => {
    if (data.byteLength > maxEntryBytes) {
      throw new Error("يحتوي ملف ZIP على ملف يتجاوز الحجم المسموح");
    }
    actualTotalBytes += data.byteLength;
    if (actualTotalBytes > maxTotalBytes) {
      throw new Error("يتجاوز الحجم المفكوك لملف ZIP الحد المسموح");
    }

    return {
      entryName: assertSafeEntryName(entryName),
      data: Buffer.from(data),
    };
  });
}
