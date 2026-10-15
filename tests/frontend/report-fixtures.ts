import { vi } from "vitest";
import type { ConnectionsResult, ReportApi, SavedReport } from "@/lib/report-api";
import { CONNECTION_RECIPE } from "@/lib/connections";

export const reportId = "00000000-0000-4000-8000-000000000001";
export const messageId = "00000000-0000-4000-8000-000000000002";
export const assertionId = "00000000-0000-4000-8000-000000000003";
export function savedReport(revision = 1): SavedReport {
  const text = "  काल्पनिक घटना।\nसामान नहीं आया।  ";
  return { _id: reportId, synthetic: true, language: "en", revision,
    messages: [{ id: messageId, text }], assertions: [{ id: assertionId, field: "narrative", value: text,
      originalValue: text, included: true, polarity: "affirmed", origin: "narration", verification: "not_verified",
      source: { messageId, start: 0, end: text.length } }], confirmation: null };
}
export function confirmedReport(): SavedReport {
  return { ...savedReport(), confirmation: { revision: 1, kind: "user_confirmed" } };
}
export function connections(status: "pending" | "ready" = "ready"): ConnectionsResult {
  return { status, reportId, revision: 1, recipe: CONNECTION_RECIPE, sources: [], candidates: [] };
}
export function reportGateway(): ReportApi {
  return { restore: vi.fn(async () => null), create: vi.fn(async () => savedReport()), get: vi.fn(async () => savedReport()),
    revise: vi.fn(async () => savedReport(2)), confirm: vi.fn(async () => confirmedReport()), connections: vi.fn(async () => connections()) };
}
