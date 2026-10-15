import { assistanceLanguage } from "@/lib/assistance";
import { assistanceCatalogue } from "@/server/assistance/catalogue";
import { response } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const language = assistanceLanguage.safeParse(query.get("language") ?? "en");
  if (!language.success || [...query.keys()].some(key => key !== "language") || query.getAll("language").length > 1) return response({ error: { code: "invalid_request" } }, 400);
  return response(assistanceCatalogue(language.data));
}
