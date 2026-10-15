import { describe, expect, it } from "vitest";
import { inspectUpload } from "@/server/evidence/domain";
import { validateDocumentOutput } from "@/server/evidence/document-output";

describe("document evidence boundaries", () => {
  it("requires matching extensions, declared MIME types and byte signatures", () => {
    expect(inspectUpload("record.pdf", "application/pdf", Buffer.from("%PDF-1.7\nsynthetic"))).toMatchObject({ format: "pdf" });
    expect(inspectUpload("record.png", "image/png", Buffer.from([137,80,78,71,13,10,26,10]))).toMatchObject({ format: "png" });
    expect(inspectUpload("record.jpg", "image/jpeg", Buffer.from([255,216,255,224]))).toMatchObject({ format: "jpeg" });
    expect(() => inspectUpload("record.png", "image/png", Buffer.from("<svg>"))).toThrow("unsupported_file_type");
    expect(() => inspectUpload("record.pdf", "text/plain", Buffer.from("%PDF-1.7"))).toThrow("unsupported_file_type");
    expect(() => inspectUpload("record.txt", "text/plain", Buffer.alloc(65537, 65))).toThrow("file_too_large");
    expect(() => inspectUpload("record.pdf", "application/pdf", Buffer.alloc(5*1024*1024+1, 65))).toThrow("file_too_large");
  });
  it("creates UTF-16 page ranges and hashes the actual extracted output", () => {
    const output = validateDocumentOutput({ pages: [{ number: 1, method: "pdf-text", text: "  काल्पनिक 🦅\n" }, { number: 2, method: "ocr", text: "सामान नहीं आया।\n" }] }, "sha256:" + "a".repeat(64));
    expect(output.text).toBe("  काल्पनिक 🦅\n\n\nसामान नहीं आया।\n");
    expect(output.extraction.pages[1].start).toBe("  काल्पनिक 🦅\n\n\n".length);
    expect(output.extraction.textSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(output.extraction.runtime).toBe("sha256:" + "a".repeat(64));
  });
  it("rejects malformed or over-limit parser output without truncation", () => {
    for (const payload of [{ pages: [] }, { pages: [{ number: 2, method: "ocr", text: "note" }] }, { pages: [{ number: 1, method: "ocr", text: "x".repeat(6001) }] }, { pages: [{ number: 1, method: "ocr", text: "hi\0" }] }]) {
      expect(() => validateDocumentOutput(payload, "sha256:" + "a".repeat(64))).toThrow();
    }
  });
});
