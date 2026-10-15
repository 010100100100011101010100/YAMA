import { z } from "zod";
export const extractionSchema = z.object({ version: z.literal("local-doc-v1"), runtime: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/), pages: z.array(z.object({ number: z.number().int().min(1).max(3),
    start: z.number().int().min(0).max(6000), end: z.number().int().min(0).max(6000), method: z.enum(["pdf-text", "ocr"]) })).min(1).max(3) })
  .refine(value => value.pages.every((page, index) => page.number === index + 1 && page.end >= page.start && page.start === (index ? value.pages[index - 1].end + 2 : 0)));
export type EvidenceExtraction = z.infer<typeof extractionSchema>;
