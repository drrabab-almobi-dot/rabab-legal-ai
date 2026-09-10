import { unzip, unzipSync, type Unzipped } from "fflate";

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

interface ResolvedSafeZipOptions {
  include: (entryName: string) => boolean;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
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

function resolveOptions(options: SafeZipOptions): ResolvedSafeZipOptions {
  return {
    include: options.include ?? (() => true),
    maxEntries: options.maxEntries ?? 1_000,
    maxEntryBytes: options.maxEntryBytes ?? 50 * MEBIBYTE,
    maxTotalBytes: options.maxTotalBytes ?? 100 * MEBIBYTE,
  };
}

function createSafeEntryFilter(options: ResolvedSafeZipOptions) {
  let seenEntries = 0;
  let selectedBytes = 0;

  return (file: { name: string; originalSize: number }) => {
    const entryName = assertSafeEntryName(file.name);
    seenEntries += 1;
    if (seenEntries > options.maxEntries) {
      throw new Error(`يتجاوز ملف ZIP الحد المسموح (${options.maxEntries} ملف)`);
    }
    if (entryName.endsWith("/")) return false;

    if (!options.include(entryName)) return false;

    const originalSize = Number(file.originalSize);
    if (!Number.isSafeInteger(originalSize) || originalSize < 0) {
      throw new Error("تعذر التحقق من حجم ملف داخل ZIP");
    }
    if (originalSize > options.maxEntryBytes) {
      throw new Error("يحتوي ملف ZIP على ملف يتجاوز الحجم المسموح");
    }

    selectedBytes += originalSize;
    if (selectedBytes > options.maxTotalBytes) {
      throw new Error("يتجاوز الحجم المفكوك لملف ZIP الحد المسموح");
    }

    return true;
  };
}

function toSafeZipEntries(
  extracted: Unzipped,
  options: ResolvedSafeZipOptions,
): SafeZipEntry[] {
  let actualTotalBytes = 0;
  return Object.entries(extracted).map(([entryName, data]) => {
    if (data.byteLength > options.maxEntryBytes) {
      throw new Error("يحتوي ملف ZIP على ملف يتجاوز الحجم المسموح");
    }
    actualTotalBytes += data.byteLength;
    if (actualTotalBytes > options.maxTotalBytes) {
      throw new Error("يتجاوز الحجم المفكوك لملف ZIP الحد المسموح");
    }

    return {
      entryName: assertSafeEntryName(entryName),
      // Share fflate's output ArrayBuffer rather than copying it into a new Buffer.
      data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    };
  });
}

function asUint8ArrayView(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Decompress selected ZIP entries in memory while rejecting path traversal,
 * oversized files, decompression bombs, and archives with excessive entries.
 */
export function readSafeZipEntries(
  buffer: Buffer,
  options: SafeZipOptions = {},
): SafeZipEntry[] {
  const resolvedOptions = resolveOptions(options);
  const extracted = unzipSync(asUint8ArrayView(buffer), {
    filter: createSafeEntryFilter(resolvedOptions),
  });

  return toSafeZipEntries(extracted, resolvedOptions);
}

/**
 * Asynchronously decompress selected ZIP entries with the same safety policy
 * as readSafeZipEntries. Suitable for large, non-request-critical archives.
 */
export function readSafeZipEntriesAsync(
  buffer: Buffer,
  options: SafeZipOptions = {},
): Promise<SafeZipEntry[]> {
  const resolvedOptions = resolveOptions(options);

  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      unzip(
        asUint8ArrayView(buffer),
        { filter: createSafeEntryFilter(resolvedOptions) },
        (error, extracted) => {
          if (settled) return;
          if (error) {
            rejectOnce(error);
            return;
          }

          try {
            const entries = toSafeZipEntries(extracted, resolvedOptions);
            settled = true;
            resolve(entries);
          } catch (entryError) {
            rejectOnce(entryError);
          }
        },
      );
    } catch (error) {
      rejectOnce(error);
    }
  });
}
