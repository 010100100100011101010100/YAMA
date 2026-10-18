import "server-only";
import sharp from "sharp";
import type { CatalogueCase } from "./catalogue-policy";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Closed publication format for the authored catalogue, not a general PII detector.
 * Source reports and pixels are never used as shared previews. Real reports need
 * a separately reviewed publication before they can enter this catalogue.
 */
export function discloseCatalogueCase(entry: CatalogueCase, visibleContacts: readonly string[] = []) {
  const profile = entry.reporter;
  const scrub = (value: string) => {
    let safe = value;
    if (profile) {
      for (const name of [profile.name, ...profile.name.split(/\s+/)].sort((a, b) => b.length - a.length)) {
        safe = safe.replace(new RegExp(`\\b${escapePattern(name)}\\b`, "giu"), "[name hidden]");
      }
      for (const detail of [profile.city, profile.occupation]) safe = safe.replace(new RegExp(`\\b${escapePattern(detail)}\\b`, "giu"), "[detail hidden]");
    }
    for (const identifier of entry.identifiers ?? []) {
      if (!visibleContacts.includes(identifier.value)) safe = safe.replaceAll(identifier.value, "[contact hidden]");
    }
    safe = safe.replace(/I'm \d{1,3}\b/gu, "I'm an adult");
    return safe;
  };
  const title = profile ? entry.title.replace(`${profile.name} · `, "") : entry.title;
  const account = entry.story ? entry.story.replace(/^I'm [^\n]+\.\n\n/, "") : entry.summary;
  return {
    title: scrub(title), summary: scrub(account),
    ...(entry.media ? { media: entry.media.map(item => ({ ...item, caption: scrub(item.caption) })) } : {}),
    ...(entry.resolution ? { resolution: { ...entry.resolution, summary: scrub(entry.resolution.summary),
      actions: entry.resolution.actions.map(action => ({ ...action, description: scrub(action.description) })) } } : {}),
    ...(entry.evidence ? { evidence: entry.evidence.map((file, index) => ({ ...file, name: file.format === "png" ? `Conversation image ${index + 1}.png` : `Conversation transcript ${index + 1}.txt` })) } : {}),
  };
}

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export async function sharedEvidenceImage(entry: CatalogueCase, visibleContacts: readonly string[] = []) {
  const shared = discloseCatalogueCase(entry, visibleContacts);
  const wrap = (value: string) => value.split("\n").flatMap(line => line.match(/.{1,76}(?:\s|$)|.{1,76}/g) ?? [""]);
  const lines = [...wrap(shared.title), "", ...wrap(shared.summary), "", "REPORTED OUTCOME", ...wrap(shared.resolution?.summary ?? "No outcome recorded.")];
  const height = 190 + lines.length * 25;
  // Reconstruct from the disclosure view. Blurring original pixels would retain
  // recoverable identity information in the response or OCR/metadata layers.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}"><rect width="1000" height="${height}" fill="#f4f2eb"/><text x="40" y="42" fill="#2c4438" font-family="sans-serif" font-size="20">Privacy copy · original file stays private</text><rect x="40" y="62" rx="6" width="180" height="25" fill="#a2aaa4"/><text x="238" y="82" fill="#33443b" font-family="sans-serif" font-size="18">Reporter details hidden</text>${lines.map((line, index) => `<text x="40" y="${132 + index * 25}" fill="#192c23" font-family="monospace" font-size="18">${xml(line)}</text>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
