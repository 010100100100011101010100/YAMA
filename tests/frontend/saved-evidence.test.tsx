import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import SavedEvidencePicker from "@/components/yama/SavedEvidencePicker";
import { getSavedCopy } from "@/lib/persistence-copy";
import type { EvidenceApi, SavedEvidence } from "@/lib/evidence-api";
import { ReportApiError } from "@/lib/report-api";
import { reportId } from "./report-fixtures";

const savedFile = (status: SavedEvidence["status"] = "ready"): SavedEvidence => ({ id: "00000000-0000-4000-8000-000000000004", reportId, name: "record.txt", size: 30, sha256: "a".repeat(64), status, errorCode: null, reviewed: false });
function gateway(): EvidenceApi {
  return { list: vi.fn(async () => []), upload: vi.fn(async () => savedFile("stored")), extract: vi.fn(async () => savedFile()),
    source: vi.fn(async () => ({ evidenceId: savedFile().id, name: "record.txt", sha256: savedFile().sha256, text: "  काल्पनिक रिकॉर्ड।\nPayment ka note.  " })), cancel: vi.fn(async () => savedFile("canceled")), remove: vi.fn(async () => undefined) };
}
function view(api: EvidenceApi, onReview = vi.fn(async () => true)) {
  render(<SavedEvidencePicker reportId={reportId} copy={getSavedCopy("en")} language="en" inputRef={{ current: null }} api={api} onReview={onReview} disabled={false} onAttempt={() => undefined} />);
  return onReview;
}
describe("saved evidence review", () => {
  it("uploads and extracts, preserves exact source, and waits for explicit review", async () => {
    const user = userEvent.setup(); const api = gateway(); const onReview = view(api);
    await screen.findByText("No files added yet.");
    await user.upload(screen.getByLabelText("Choose a file", { selector: "input" }), new File(["Fictional record"], "record.txt", { type: "text/plain" }));
    await user.click(await screen.findByRole("button", { name: "Read text record.txt" }));
    expect(screen.getByRole("textbox", { name: "Extracted text" })).toHaveValue("  काल्पनिक रिकॉर्ड।\nPayment ka note.  ");
    expect(screen.getByRole("textbox", { name: "Extracted text" })).toHaveFocus();
    expect(onReview).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Add as draft note" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "I’ve read this text and want it in my draft." }));
    await user.click(screen.getByRole("button", { name: "Add as draft note" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(savedFile().id, savedFile().sha256));
    await screen.findByText("Added to your draft. Check and confirm your notes before comparing.");
    expect(api.extract).toHaveBeenCalledWith(reportId, savedFile().id);
    expect(screen.getByRole("button", { name: "Read text record.txt" })).toHaveFocus();
  }, 15000);
  it("retains a failed upload and retries with the same creation key", async () => {
    const user = userEvent.setup(); const api = gateway(); vi.mocked(api.upload).mockRejectedValueOnce(new ReportApiError("network_error")); view(api);
    await screen.findByText("No files added yet.");
    await user.upload(screen.getByLabelText("Choose a file", { selector: "input" }), new File(["Fictional record"], "record.txt", { type: "text/plain" }));
    await user.click(await screen.findByRole("button", { name: "Retry upload" }));
    await screen.findByRole("button", { name: "Read text record.txt" });
    expect(vi.mocked(api.upload).mock.calls[0][2]).toBe(vi.mocked(api.upload).mock.calls[1][2]);
  });
  it("shows failed extraction without allowing review and rejects unsupported selection", async () => {
    const user = userEvent.setup({ applyAccept: false }); const api = gateway(); vi.mocked(api.extract).mockResolvedValue({ ...savedFile("failed"), errorCode: "invalid_utf8" }); view(api);
    await screen.findByText("No files added yet.");
    const input = screen.getByLabelText("Choose a file", { selector: "input" });
    await user.upload(input, new File(["<svg>"], "record.svg", { type: "image/svg+xml" }));
    expect(api.upload).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent(".txt");
    await user.upload(input, new File(["Fictional record"], "record.txt", { type: "text/plain" }));
    await screen.findByText("The file isn’t valid UTF-8 text. Save it as UTF-8 and upload it again.");
    expect(screen.queryByRole("button", { name: "Read text record.txt" })).not.toBeInTheDocument();
  });
  it("keeps the reviewed text open when saving the draft fails", async () => {
    const user = userEvent.setup(); const api = gateway(); vi.mocked(api.list).mockResolvedValue([savedFile()]); const onReview = view(api, vi.fn(async () => false));
    await user.click(await screen.findByRole("button", { name: "Read text record.txt" }));
    await user.click(screen.getByRole("checkbox", { name: "I’ve read this text and want it in my draft." }));
    await user.click(screen.getByRole("button", { name: "Add as draft note" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox", { name: "Extracted text" })).toHaveValue("  काल्पनिक रिकॉर्ड।\nPayment ka note.  ");
  });
  it("restores file metadata, escapes markup, and removes only after the server acknowledges", async () => {
    const user = userEvent.setup(); const api = gateway(); vi.mocked(api.list).mockResolvedValue([savedFile()]);
    vi.mocked(api.source).mockResolvedValue({ evidenceId: savedFile().id, name: "record.txt", sha256: savedFile().sha256, text: "<script>alert(1)</script>" });
    let finish!: () => void; vi.mocked(api.remove).mockReturnValue(new Promise(resolve => { finish = resolve; })); view(api);
    await user.click(await screen.findByRole("button", { name: "Read text record.txt" }));
    expect(screen.getByRole("textbox", { name: "Extracted text" })).toHaveValue("<script>alert(1)</script>"); expect(document.querySelector("script")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove from list record.txt" }));
    expect(screen.getByText("record.txt")).toBeInTheDocument(); await act(async () => finish());
    expect(screen.queryByText("record.txt")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a file" })).toHaveFocus();
    expect(within(screen.getByRole("region", { name: "Your files" })).getByText(/report history/)).toBeInTheDocument();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations.map(item => item.id)).toEqual([]);
  }, 10000);
  it("accepts a PDF, polls queued processing without moving focus, and binds review to OCR text", async () => {
    const user = userEvent.setup(); const api = gateway();
    const pdf = { ...savedFile("stored"), name: "record.pdf", format: "pdf" as const, attempts: 0 };
    vi.mocked(api.upload).mockResolvedValue(pdf); vi.mocked(api.extract).mockResolvedValue({ ...pdf, status: "queued" });
    vi.mocked(api.list).mockResolvedValueOnce([]).mockResolvedValue([{ ...pdf, status: "ready", attempts: 1 }]);
    const extraction = { version: "local-doc-v1" as const, runtime: "sha256:" + "a".repeat(64), textSha256: "b".repeat(64), pages: [{ number: 1, start: 0, end: 9, method: "ocr" as const }] };
    vi.mocked(api.source).mockResolvedValue({ evidenceId: pdf.id, name: pdf.name, sha256: pdf.sha256, text: "OCR note.", extraction });
    const onReview = view(api); await screen.findByText("No files added yet.");
    await user.upload(screen.getByLabelText("Choose a file", { selector: "input" }), new File(["%PDF-1.7"], pdf.name, { type: "application/pdf" }));
    await screen.findByText("Waiting to read…");
    screen.getByRole("button", { name: "Choose a file" }).focus();
    await screen.findByRole("button", { name: "Read text record.pdf" }, { timeout: 4000 });
    expect(screen.getByRole("button", { name: "Choose a file" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Read text record.pdf" }));
    expect(screen.getByText(/OCR can misread/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Add as draft note" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(pdf.id, pdf.sha256, extraction.textSha256));
  }, 10000);
  it("cancels persisted processing and exposes a retry", async () => {
    const user = userEvent.setup(); const api = gateway(); vi.mocked(api.list).mockResolvedValue([savedFile("processing")]); view(api);
    await user.click(await screen.findByRole("button", { name: "Cancel reading record.txt" }));
    expect(api.cancel).toHaveBeenCalledWith(reportId, savedFile().id);
    await screen.findByText("Reading canceled"); expect(screen.getByRole("button", { name: "Retry reading" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retry reading" })).toHaveFocus();
  });
  it("keeps a focused file control when processing finishes in the background", async () => {
    const api = gateway(); vi.mocked(api.list).mockResolvedValueOnce([savedFile("queued")]).mockResolvedValue([savedFile()]); view(api);
    (await screen.findByRole("button", { name: "Cancel reading record.txt" })).focus();
    const ready = await screen.findByRole("button", { name: "Read text record.txt" }, { timeout: 4000 });
    expect(ready).toHaveFocus();
  });
});
