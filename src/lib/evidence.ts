export function validateLocalEvidence(file: Pick<File, "size" | "type">): "size" | "type" | null {
  if (file.size > 5 * 1024 * 1024 || file.size === 0) return "size";
  if (!["image/png", "image/jpeg", "application/pdf", "text/plain"].includes(file.type)) return "type";
  return null;
}
