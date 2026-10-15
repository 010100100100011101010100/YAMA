import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { extractionSchema } from "@/lib/evidence-extraction";
import { ServiceError } from "@/server/errors";
import { extractText } from "./domain";

export function validateDocumentOutput(payload: unknown, runtime: string) {
  const parsed = z.strictObject({ pages: z.array(z.strictObject({ number: z.number().int().min(1).max(3), method: z.enum(["pdf-text", "ocr"]), text: z.string().max(6000) })).min(1).max(3) }).safeParse(payload);
  if (!parsed.success || parsed.data.pages.some((page, index) => page.number !== index + 1)) throw new ServiceError(422, "document_malformed");
  const text = parsed.data.pages.map(page => page.text).join("\n\n");
  extractText(Buffer.from(text));
  let offset = 0;
  const pages = parsed.data.pages.map(page => { const range = { number: page.number, method: page.method, start: offset, end: offset + page.text.length }; offset = range.end + 2; return range; });
  const extraction = extractionSchema.parse({ version: "local-doc-v1", runtime, textSha256: createHash("sha256").update(text).digest("hex"), pages });
  return { text, extraction };
}
