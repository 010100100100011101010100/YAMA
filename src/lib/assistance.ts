import { z } from "zod";

export const assistanceLanguage = z.enum(["en", "hi", "hinglish"]);
const sourceUrls = ["https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss", "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2298336&lang=1&reg=3", "https://consumerhelpline.gov.in/public/about"] as const;
const routeUrls = ["https://112.gov.in/", "https://cybercrime.gov.in/", "https://consumerhelpline.gov.in/"] as const;
export const assistanceSchema = z.strictObject({
  version: z.literal("india-assistance-2026-10-11"), jurisdiction: z.literal("IN"), free: z.literal(true), language: assistanceLanguage,
  options: z.array(z.strictObject({ id: z.enum(["emergency", "cybercrime", "consumer"]), title: z.string().max(200), body: z.string().max(600), applicability: z.string().max(600),
    sourceUrl: z.enum(sourceUrls), routeUrl: z.enum(routeUrls), contact: z.enum(["112", "1930", "1915"]).nullable(),
    checkedAt: z.literal("2026-10-11"), reviewBy: z.literal("2027-01-09"), status: z.enum(["current", "needs_review"]),
  })).length(3),
}).superRefine((catalogue, context) => {
  const ids = ["emergency", "cybercrime", "consumer"], contacts = ["112", "1930", "1915"];
  if (catalogue.options.some((option, index) => option.id !== ids[index] || option.sourceUrl !== sourceUrls[index] || option.routeUrl !== routeUrls[index]
    || option.contact !== (option.status === "current" ? contacts[index] : null))) context.addIssue({ code: "custom", message: "Invalid assistance source" });
});
export type Assistance = z.infer<typeof assistanceSchema>;
