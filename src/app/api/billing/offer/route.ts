import { BILLING_OFFER } from "@/lib/billing";
import { response } from "@/server/http";
export const runtime = "nodejs";
export async function GET() {
  return response({ offer: BILLING_OFFER });
}
