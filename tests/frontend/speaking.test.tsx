import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Storyroom from "@/components/yama/Storyroom";
import AgentPortrait from "@/components/yama/AgentPortrait";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));

function speakingAgents(container: HTMLElement) {
  return [...new Set(Array.from(container.querySelectorAll('[data-agent-portrait][data-speaking="true"]'), node => node.getAttribute("data-agent-portrait")))];
}

describe("agent speaking presentation", () => {
  it("keeps each animated portrait's clipping and image references inside its own SVG", () => {
    const { container } = render(<>
      <AgentPortrait agent="saathi" speaking />
      <AgentPortrait agent="saathi" speaking />
      <AgentPortrait agent="drishti" speaking />
      <AgentPortrait agent="disha" speaking />
    </>);
    const portraits = Array.from(container.querySelectorAll("svg"));
    expect(portraits).toHaveLength(4);
    const allIds = Array.from(container.querySelectorAll("[id]"), element => element.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    portraits.forEach(portrait => {
      const localIds = new Set(Array.from(portrait.querySelectorAll("[id]"), element => element.id));
      expect(portrait.querySelectorAll("use").length).toBeGreaterThan(1);
      portrait.querySelectorAll("[href], [clip-path], [mask]").forEach(element => {
        for (const attribute of ["href", "clip-path", "mask"]) {
          const value = element.getAttribute(attribute);
          const reference = value?.match(/^#(.+)$|^url\(#(.+)\)$/);
          if (reference) expect(localIds.has(reference[1] ?? reference[2])).toBe(true);
        }
      });
    });
  });

  it("does not treat a selected agent as speaking", () => {
    const { container } = render(<Storyroom persisted={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Choose an agent" }), { target: { value: "drishti" } });
    expect(speakingAgents(container)).toEqual([]);
  });

  it("marks only the playing voice-preview speaker and clears on pause, interruption and handoff", () => {
    const { container } = render(<Storyroom persisted={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Voice$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
    expect(speakingAgents(container)).toEqual(["saathi"]);
    fireEvent.click(screen.getByRole("button", { name: "Pause preview" }));
    expect(speakingAgents(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Resume preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop preview" }));
    expect(speakingAgents(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Choose an agent" }), { target: { value: "disha" } });
    expect(speakingAgents(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Resume preview" }));
    expect(speakingAgents(container)).toEqual(["disha"]);
  });

  it("presents a newly delivered text reply briefly without moving focus or replaying it on language changes", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Storyroom persisted={false} />);
      const input = screen.getByRole("textbox", { name: "Your message" });
      input.focus();
      fireEvent.change(input, { target: { value: "I have the receipt." } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(speakingAgents(container)).toEqual(["saathi"]);
      expect(input).toHaveFocus();
      act(() => vi.advanceTimersByTime(2400));
      expect(speakingAgents(container)).toEqual([]);
      fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "hi" } });
      expect(speakingAgents(container)).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});
