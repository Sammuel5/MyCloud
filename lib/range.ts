export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses a single HTTP byte range. Multi-range requests are deliberately
 * rejected so large files are always streamed with bounded memory.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  if (!Number.isSafeInteger(size) || size < 0) return "invalid";
  if (header.includes(",")) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return "invalid";
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return "invalid";

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) return "invalid";
    const start = Math.max(0, size - suffixLength);
    return { start, end: size - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return "invalid";
  let end: number;
  if (!endRaw) {
    end = size - 1;
  } else {
    end = Number(endRaw);
    if (!Number.isSafeInteger(end) || end < start) return "invalid";
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
