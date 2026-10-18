import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReplyText from "@/components/yama/ReplyText";
import ReplyReports from "@/components/yama/ReplyReports";
import type { DialoguePublicContext } from "@/lib/dialogue-sources";
import { connections, reportId } from "./report-fixtures";

const publicContext: DialoguePublicContext = { status: "ready", sources: [{ url: "https://cybercrime.gov.in/", title: "Reporting portal", publisher: "cybercrime.gov.in",
  retrievedAt: "2026-10-17T12:00:00.000Z", excerpt: "Official reporting information.", bodyRead: true, live: true }] };
describe("reply source links", () => {
  it("renders comparison tables with accessible headers and escaped cell contents", () => {
    render(<ReplyText text={'Purchase recoveries:\n\n| Report | Recovered | Outstanding |\n|---|---:|---:|\n| Camera | **₹0** | ₹7,200 |\n| <img src=x> | ₹3,000 | ₹6,600 |\n\nThese are reported outcomes.'} />);
    expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Report", "Recovered", "Outstanding"]);
    expect(screen.getByRole("cell", { name: "₹0" })).toHaveTextContent("₹0");
    expect(screen.getByRole("cell", { name: "<img src=x>" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
  it("renders emphasis around sourced facts without interpreting embedded markup", () => {
    render(<ReplyText text={'**₹3,000 recovered**; ₹6,600 remains. **<script>bad()</script>**'} />);
    expect(screen.getByText("₹3,000 recovered").tagName).toBe("STRONG");
    expect(screen.getByText("<script>bad()</script>").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });
  it("only activates supplied URLs and never interprets HTML, script links or unknown image embeds", async () => {
    const user = userEvent.setup();
    render(<ReplyText text={'Use [the portal](https://cybercrime.gov.in/). [Danger](javascript:alert(1)) <img src=x onerror=alert(1)> [Unknown](https://other.test/)'} publicContext={publicContext} />);
    expect(screen.getByRole("link", { name: "the portal" })).toHaveAttribute("href", "https://cybercrime.gov.in/");
    expect(screen.queryByRole("link", { name: "Danger" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Unknown" })).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Official reporting information.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("does not query the database for an empty source receipt", () => {
    const load = vi.fn();
    render(<ReplyReports reportId={reportId} language="en" receipt={{ recipe: "confirmed-pattern-sources-v1", revision: 1, cases: [] }} load={load} />);
    expect(load).not.toHaveBeenCalled();
  });
  it("fails closed when a retrieved case has a different content version", async () => {
    const load = vi.fn().mockResolvedValue(connections());
    render(<ReplyReports reportId={reportId} language="en" receipt={{ recipe: "confirmed-pattern-sources-v1", revision: 1, cases: [{ id: "missing", version: "a".repeat(64) }] }} load={load} />);
    expect(await screen.findByText("Sources couldn’t be opened.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
