import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { PrivateActionReview } from "@/components/yama/PrivateActionReview";
import { AssistanceOptions } from "@/components/yama/AssistanceOptions";
import type { ActionsApi } from "@/lib/actions-api";
import type { ActionPreview } from "@/lib/actions";
import type { Assistance } from "@/lib/assistance";
import { savedReport, assertionId, messageId } from "./report-fixtures";

const report = savedReport();
function preview(): ActionPreview {
  return { recipe: "private-actions-v1", reportId: report._id, revision: report.revision, language: "hi", confirmation: "unconfirmed", verification: "not_independently_verified", submitted: false,
    receipt: "a".repeat(64), review: { status: "unreviewed", reviewedAt: null }, omittedAssertionIds: [], files: [],
    summary: [{ id: assertionId, field: "amount", value: "₹8000", originalValue: "₹18000", polarity: "uncertain", origin: "client_proposal", source: { messageId, start: 0, end: "काल्पनिक विवरण।".length }, quote: "काल्पनिक विवरण।", evidence: null }] };
}
describe("private next-step review", () => {
  it("shows sources and corrections, requires acknowledgement, then reports actual durable review", async () => {
    const current = preview(), user = userEvent.setup();
    current.summary.push({ ...current.summary[0], id: crypto.randomUUID(), field: "pattern", value: "paid", originalValue: "no_reply" });
    const api = { preview: vi.fn().mockResolvedValue(current), review: vi.fn().mockResolvedValue({ ...current, review: { status: "reviewed", reviewedAt: "2026-10-11T10:00:00Z" } }) } as unknown as ActionsApi;
    const { container } = render(<PrivateActionReview report={report} language="en" api={api} />);
    const submit = await screen.findByRole("button", { name: "Save reviewed draft" });
    expect(submit).toBeDisabled();
    const disclosure = screen.getByText("Summary and original sources"); disclosure.focus(); await user.keyboard("{Enter}");
    expect(screen.getByText("₹18000")).toBeInTheDocument(); expect(screen.getAllByText("काल्पनिक विवरण।")).toHaveLength(2);
    expect(screen.getAllByText(/Uncertain/)).toHaveLength(2);
    expect(screen.getByText("Payment made")).toBeInTheDocument(); expect(screen.getByText("Replies stopped")).toBeInTheDocument();
    expect(screen.queryByText("no_reply")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox")); await user.click(submit);
    expect(api.review).toHaveBeenCalledWith(report._id, report.revision, current.receipt);
    await screen.findByRole("button", { name: "Saved privately" });
    expect(screen.getByText(/Nothing has been filed or sent/)).toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("clears acknowledgement after a changed preview and never shows success for rejected approval", async () => {
    const current = preview(), user = userEvent.setup();
    const api = { preview: vi.fn().mockResolvedValueOnce(current).mockResolvedValue({ ...current, receipt: "b".repeat(64) }), review: vi.fn().mockRejectedValue(new Error("preview_changed")) } as unknown as ActionsApi;
    render(<PrivateActionReview report={report} language="en" api={api} />);
    await screen.findByRole("checkbox"); await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Save reviewed draft" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Saved privately")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh draft" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save reviewed draft" })).toBeDisabled());
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("keeps essential assistance available without a saved report and withholds expired contacts", async () => {
    const guidance: Assistance = { version: "india-assistance-2026-10-11", jurisdiction: "IN", free: true, language: "hi", options: [
      { id: "emergency", title: "तुरंत खतरा", body: "112", applicability: "भारत", contact: null, routeUrl: "https://112.gov.in/", sourceUrl: "https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss", checkedAt: "2026-10-11", reviewBy: "2027-01-09", status: "needs_review" },
    ] };
    const api = { assistance: vi.fn().mockResolvedValue(guidance) } as unknown as ActionsApi;
    render(<AssistanceOptions language="hi" api={api} />);
    await screen.findByText("तुरंत खतरा");
    expect(screen.queryByText("112")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("referrerpolicy", "no-referrer");
  });
  it("keeps keyboard focus while a changed preview clears acknowledgement", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      const current = preview();
      const api = { preview: vi.fn().mockResolvedValueOnce(current).mockResolvedValue({ ...current, receipt: "b".repeat(64) }) } as unknown as ActionsApi;
      const view = render(<PrivateActionReview report={report} language="en" api={api} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      screen.getByRole("checkbox").focus(); fireEvent.click(screen.getByRole("checkbox")); expect(screen.getByRole("checkbox")).toHaveFocus();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("checkbox")).toHaveFocus();
      view.unmount();
    } finally { vi.useRealTimers(); }
  });
});
