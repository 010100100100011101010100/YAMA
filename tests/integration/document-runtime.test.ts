import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseDocument } from "@/server/evidence/document-runtime";
const parse = async (name: string, format: "pdf" | "png" | "jpeg") => parseDocument(await readFile(`tests/fixtures/evidence/${name}`), format, new AbortController().signal);

it("extracts both PDF pages and records their exact ranges", async () => {
  const output = await parse("text-record.pdf", "pdf");
  expect(output.text).toContain("FICTIONAL TEST RECORD"); expect(output.text).toContain("Payment made for a laptop.");
  expect(output.extraction.pages.map(page => page.method)).toEqual(["pdf-text", "pdf-text"]);
  expect(output.text.slice(output.extraction.pages[1].start, output.extraction.pages[1].end)).toContain("Payment");
}, 65_000);
it.each(["record.png", "record.jpg"])("reads a real %s with local OCR", async name => {
  const output = await parse(name, name.endsWith("png") ? "png" : "jpeg");
  expect(output.text).toContain("FICTIONAL TEST RECORD"); expect(output.text).toContain("laptop");
  expect(output.extraction.pages[0].method).toBe("ocr");
}, 65_000);
it("reads Hindi text with the packaged language model", async () => {
  const output = await parse("hindi-record.png", "png");
  expect(output.text).toContain("काल्पनिक"); expect(output.text).toContain("सामान नहीं आया");
}, 65_000);
it("uses OCR for a scanned PDF with no text layer", async () => {
  const output = await parse("scanned-record.pdf", "pdf");
  expect(output.text).toContain("laptop"); expect(output.extraction.pages[0].method).toBe("ocr");
}, 65_000);
it.each([
  ["too-many-pages.pdf", "pdf", "page_limit"], ["encrypted-record.pdf", "pdf", "encrypted_pdf"],
  ["oversized.png", "png", "image_limit"], ["blank.png", "png", "empty_text"],
] as const)("refuses %s without returning partial text", async (name, format, error) => {
  await expect(parse(name, format)).rejects.toThrow(error);
}, 65_000);
it("refuses truncated documents and honors cancellation", async () => {
  await expect(parseDocument(Buffer.from("%PDF-1.7\nmalformed"), "pdf", new AbortController().signal)).rejects.toThrow("document_malformed");
  const stopping = new AbortController();
  const reading = parseDocument(await readFile("tests/fixtures/evidence/scanned-record.pdf"), "pdf", stopping.signal);
  const rejection = expect(reading).rejects.toThrow(); setTimeout(() => stopping.abort(), 100); await rejection;
}, 65_000);
