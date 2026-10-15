import { describe, it, expect, vi } from "vitest";
import { ReportSession } from "@/lib/report-session";
import { reportGateway, savedReport } from "./report-fixtures";
describe("saved chat selection", () => {
  it("opens an explicit chat rather than silently restoring the most recent one", async () => {
    const api = reportGateway(),
      report = savedReport();
    const session = new ReportSession(api);
    await session.restore(new AbortController().signal, false, report._id);
    expect(api.get).toHaveBeenCalledWith(report._id, expect.any(AbortSignal));
    expect(api.restore).not.toHaveBeenCalled();
  });
  it("starts a new chat without appending narration to the previous saved report", async () => {
    const api = reportGateway();
    vi.mocked(api.restore).mockResolvedValue(savedReport());
    const session = new ReportSession(api);
    expect(
      await session.restore(new AbortController().signal, false, null),
    ).toBeNull();
    await session.send("Fictional new chat", "en");
    expect(api.create).toHaveBeenCalledWith(
      "Fictional new chat",
      "en",
      expect.any(String),
    );
    expect(api.revise).not.toHaveBeenCalled();
  });
});
