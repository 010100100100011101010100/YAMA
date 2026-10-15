import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarNav from "@/components/primitives/SidebarNav";

afterEach(() => vi.restoreAllMocks());

function responsiveViewport(compact: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: compact,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  return (matches: boolean) => act(() => {
    media.matches = matches;
    listeners.forEach(listener => listener());
  });
}

function Sidebar() {
  return <SidebarNav label="Chats" collapseLabel="Collapse sidebar" expandLabel="Expand sidebar"
    items={[]} onNavigate={() => {}} footer={<button data-sidebar-dismiss>Options</button>}>
    <button data-sidebar-dismiss>New chat</button>
    <nav aria-label="Saved chats"><button data-sidebar-dismiss>Saved conversation</button></nav>
  </SidebarNav>;
}

describe("responsive chat navigation", () => {
  it("keeps desktop navigation available while collapsing and expanding the rail", async () => {
    responsiveViewport(false);
    const user = userEvent.setup();
    const { container } = render(<Sidebar />);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(container.querySelector("aside")).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
  });

  it("starts tablet and phone navigation closed, then closes on Escape and restores focus", async () => {
    responsiveViewport(true);
    const user = userEvent.setup();
    render(<Sidebar />);
    const opener = screen.getByRole("button", { name: "Expand sidebar" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New chat" })).not.toBeInTheDocument();
    await user.click(opener);
    const drawer = screen.getByRole("dialog", { name: "Chats" });
    expect(within(drawer).getByRole("button", { name: "Close sidebar" })).toHaveFocus();
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes the drawer after selecting a chat or opening settings", async () => {
    responsiveViewport(true);
    const user = userEvent.setup();
    render(<Sidebar />);
    for (const name of ["Saved conversation", "New chat", "Options"]) {
      await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
      await user.click(screen.getByRole("button", { name }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("does not reopen a stale drawer after crossing the desktop breakpoint", async () => {
    const resize = responsiveViewport(true);
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    resize(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    resize(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
