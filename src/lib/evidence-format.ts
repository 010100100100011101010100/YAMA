export const evidenceFormats = {
  txt: { format: "text", mime: "text/plain", limit: 64 * 1024 },
  pdf: { format: "pdf", mime: "application/pdf", limit: 5 * 1024 * 1024 },
  png: { format: "png", mime: "image/png", limit: 5 * 1024 * 1024 },
  jpg: { format: "jpeg", mime: "image/jpeg", limit: 5 * 1024 * 1024 },
  jpeg: { format: "jpeg", mime: "image/jpeg", limit: 5 * 1024 * 1024 },
} as const;
export type EvidenceFormat = typeof evidenceFormats[keyof typeof evidenceFormats]["format"];
export function uploadFormat(name: string) {
  const extension = name.toLowerCase().split(".").at(-1);
  return evidenceFormats[extension as keyof typeof evidenceFormats] ?? null;
}
