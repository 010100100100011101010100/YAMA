import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EvidencePicker from "@/components/yama/EvidencePicker";
import MatrixOrb from "@/components/ui/matrix-orb";
import TaskStatus from "@/components/yama/TaskStatus";
import { getCopy } from "@/lib/copy";

describe("selected component adapters", () => {
  it("opens the real file picker from the folder with the keyboard", async () => {
    const input = createRef<HTMLInputElement>();
    render(<EvidencePicker evidence={[]} inputRef={input} copy={getCopy("en")} onAdd={vi.fn()} onRemove={vi.fn()} onAttempt={vi.fn()} />);
    const choose = vi.spyOn(input.current!, "click");
    const folder = screen.getByRole("button", { name: "Choose a file" });
    folder.focus();
    await userEvent.keyboard("{Enter}");
    expect(choose).toHaveBeenCalledOnce();
  });

  it("keeps selected filenames readable and rejects unsupported files", () => {
    const input = createRef<HTMLInputElement>();
    const add = vi.fn(); const remove = vi.fn();
    render(<EvidencePicker evidence={[{ id: "local", name: "fictional-receipt.txt", size: 30, type: "text/plain" }]} inputRef={input} copy={getCopy("en")} onAdd={add} onRemove={remove} onAttempt={vi.fn()} />);
    expect(screen.getByText("fictional-receipt.txt")).toBeVisible();
    expect(screen.getByText("Selected locally · not uploaded")).toBeVisible();
    fireEvent.change(input.current!, { target: { files: [new File(["script"], "script.html", { type: "text/html" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("This file was not added");
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove fictional-receipt.txt" }));
    expect(remove).toHaveBeenCalledWith("local");
  });

  it("renders a static orb under reduced motion and responds to preference changes", () => {
    let reduced = true;
    let changed: (() => void) | undefined;
    const media = vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: reduced, media: query, onchange: null,
      addEventListener: (_event: string, callback: EventListenerOrEventListenerObject) => { changed = callback as () => void; },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true,
    }));
    const draw = vi.fn();
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ scale: vi.fn(), clearRect: draw, beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() } as unknown as CanvasRenderingContext2D);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(99);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    try {
      const { unmount } = render(<MatrixOrb state="thinking" size={56} labels={{ thinking: "Checking the example" }} />);
      expect(screen.getByRole("status")).toHaveTextContent("Checking the example");
      expect(draw).toHaveBeenCalled();
      expect(frame).not.toHaveBeenCalled();
      reduced = false;
      // Changing the OS preference should switch between a static frame and RAF.
      act(() => changed?.());
      expect(frame).toHaveBeenCalledOnce();
      unmount();
      expect(cancel).toHaveBeenCalledWith(99);
    } finally { media.mockRestore(); context.mockRestore(); frame.mockRestore(); cancel.mockRestore(); }
  });

  it("stops showing the orb when the comparison is cancelled", () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const props = { copy: getCopy("en"), onCancel: vi.fn(), onRetry: vi.fn(), onShow: vi.fn(), comparisonAvailable: true };
      const { rerender } = render(<TaskStatus {...props} task={{ id: "fixture", revision: 1, status: "running" }} />);
      expect(screen.getByRole("status")).toHaveTextContent("Drishti is checking the example");
      rerender(<TaskStatus {...props} task={{ id: "fixture", revision: 1, status: "canceled" }} />);
      expect(screen.queryByText("Drishti is checking the example")).not.toBeInTheDocument();
      expect(screen.getAllByText("Comparison stopped")[0]).toBeVisible();
    } finally { context.mockRestore(); }
  });
});
