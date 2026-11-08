import { describe, expect, it } from "vitest";
import { contentRangeHeader, parseByteRange } from "@/lib/range";

describe("HTTP byte ranges", () => {
  it("returns null when no range is requested", () => {
    expect(parseByteRange(null, 100)).toBeNull();
  });

  it("parses a normal range", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
  });

  it("clamps an end beyond the file size", () => {
    expect(parseByteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
  });

  it("supports open-ended ranges", () => {
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
  });

  it("supports suffix ranges", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-1000", 100)).toEqual({ start: 0, end: 99 });
  });

  it.each([
    "bytes=0-1,4-5",
    "bytes=100-101",
    "bytes=20-10",
    "bytes=-0",
    "bytes=abc-def",
    "items=0-1",
    "bytes=",
  ])("rejects invalid range %s", (header) => {
    expect(parseByteRange(header, 100)).toBe("invalid");
  });

  it("rejects invalid file sizes", () => {
    expect(parseByteRange("bytes=0-1", -1)).toBe("invalid");
    expect(parseByteRange("bytes=0-1", 1.5)).toBe("invalid");
  });

  it("formats a Content-Range header", () => {
    expect(contentRangeHeader({ start: 10, end: 19 }, 100)).toBe("bytes 10-19/100");
  });
});
