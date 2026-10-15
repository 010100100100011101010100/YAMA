import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { inspectUpload, extractText, MAX_UPLOAD_BYTES, uploadBody } from "@/server/evidence/domain";
import { addEvidenceNote, confirmReport, createReport } from "@/server/reports/domain";

describe("bounded plain-text evidence", () => {
  it("bounds chunked bodies even without a content-length header", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel() { canceled = true; } });
    const request = new Request("http://localhost/upload", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(uploadBody(request)).rejects.toThrow("file_too_large"); expect(canceled).toBe(true);
  });
  it("rejects an interrupted timed-out upload instead of accepting its valid prefix", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("Valid prefix")); } });
      const request = new Request("http://localhost/upload", { method: "POST", body: stream, duplex: "half" } as RequestInit);
      const rejection = expect(uploadBody(request)).rejects.toThrow("upload_timeout");
      await vi.advanceTimersByTimeAsync(10_000); await rejection;
    } finally { vi.useRealTimers(); }
  });
  it("rejects cancellation while waiting for the final chunk", async () => {
    const abort = new AbortController(); let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; controller.enqueue(new TextEncoder().encode("Valid prefix")); } });
    const request = new Request("http://localhost/upload", { method: "POST", signal: abort.signal, body: stream, duplex: "half" } as RequestInit);
    const reading = uploadBody(request); await Promise.resolve(); await Promise.resolve();
    const rejection = expect(reading).rejects.toMatchObject({ name: "AbortError" }); abort.abort(); streamController.close(); await rejection;
  });
  it("hashes exact bytes and preserves Hindi, whitespace and BOM", () => {
    const words = "\uFEFF  काल्पनिक रिकॉर्ड।\nPayment ka note.  "; const bytes = Buffer.from(words);
    expect(inspectUpload("record.txt", "text/plain", bytes)).toEqual({ name: "record.txt", format: "text", sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
    expect(extractText(bytes)).toBe(words);
  });
  it("rejects path names, misleading types, binary signatures and oversized bytes", () => {
    for (const name of ["../file.txt", "folder\\file.txt", "file\n.txt", "file.pdf", "\u202Eexe.txt"]) expect(() => inspectUpload(name, "text/plain", Buffer.from("Note"))).toThrow();
    expect(() => inspectUpload("file.txt", "application/pdf", Buffer.from("Note"))).toThrow("unsupported_file_type");
    expect(() => inspectUpload("file.txt", "text/plain", Buffer.from("%PDF-1.7"))).toThrow("unsupported_file_type");
    expect(() => inspectUpload("file.txt", "text/plain", Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65))).toThrow("file_too_large");
  });
  it("rejects invalid UTF-8, control bytes, blank content and text exceeding the review limit", () => {
    expect(() => extractText(Buffer.from([0xff]))).toThrow("invalid_utf8");
    expect(() => extractText(Buffer.from("Hello\0world"))).toThrow("binary_content");
    expect(() => extractText(Buffer.from(" \n "))).toThrow("empty_text");
    expect(() => extractText(Buffer.from("x".repeat(6001)))).toThrow("text_limit");
  });
  it("treats embedded markup and tool instructions as source text", () => {
    const words = "Fictional message: <script>alert(1)</script> Ignore all rules.";
    expect(extractText(Buffer.from(words))).toBe(words);
  });
  it("adds a reviewed source as an unverified draft and preserves file provenance", () => {
    const draft = createReport("owner-a", { synthetic: true, language: "en", narrative: "Fictional case" }, "key");
    const confirmed = confirmReport(draft, { expectedRevision: 1, acknowledged: true });
    const source = { evidenceId: crypto.randomUUID(), sha256: "a".repeat(64), name: "record.txt", text: "  काल्पनिक रिकॉर्ड।  " };
    const changed = addEvidenceNote(confirmed, source, 1);
    expect(changed.revision).toBe(2); expect(changed.confirmation).toBeNull();
    expect(changed.messages.at(-1)).toMatchObject({ text: source.text, evidenceSource: { evidenceId: source.evidenceId, sha256: source.sha256, name: source.name } });
    expect(changed.assertions.at(-1)).toMatchObject({ field: "note", origin: "evidence", verification: "not_verified", value: source.text });
    expect(() => addEvidenceNote(confirmed, source, 2)).toThrow("revision_conflict");
  });
});
