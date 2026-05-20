import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { MarkdownTabsBar } from "./MarkdownTabsBar";

describe("MarkdownTabsBar", () => {
  it("marks titlebar tab empty space as a window drag region", () => {
    const { container } = render(
      <MarkdownTabsBar
        activeTabId="tab-a"
        items={[
          {
            dirty: false,
            id: "tab-a",
            name: "Alpha.md",
            path: "/synthetic/alpha.md"
          }
        ]}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(container.querySelector(".document-tabs-titlebar")).toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".document-tabs-drag-spacer")).toHaveAttribute("data-tauri-drag-region");
  });

  it("renders grouped tab items from nested arrays with separate close buttons", async () => {
    const onCloseTab = vi.fn();
    const onSelectTab = vi.fn();

    const { container } = render(
      <MarkdownTabsBar
        activeTabId="tab-a"
        items={[
          [
            {
              dirty: false,
              id: "tab-a",
              name: "Alpha.md",
              path: "/synthetic/alpha.md"
            },
            {
              dirty: false,
              id: "tab-b",
              name: "Beta.md",
              path: "/synthetic/beta.md"
            }
          ],
          {
            dirty: false,
            id: "tab-c",
            name: "Gamma.md",
            path: "/synthetic/gamma.md"
          }
        ]}
        onCloseTab={onCloseTab}
        onNewTab={() => {}}
        onSelectTab={onSelectTab}
      />
    );

    const group = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(group).toBeInTheDocument();
    expect(within(group).getByRole("tab", { name: /Alpha\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(group).getByRole("tab", { name: /Beta\.md/ })).toHaveAttribute("aria-selected", "false");

    fireEvent.click(within(group).getByRole("tab", { name: /Beta\.md/ }));
    expect(onSelectTab).toHaveBeenCalledWith("tab-a");

    fireEvent.click(within(group).getByRole("button", { name: "Close tab Beta.md" }));

    await waitFor(() => expect(onCloseTab).toHaveBeenCalledWith("tab-b"));
  });

  it("treats grouped tab items as one item for close other and close right actions", async () => {
    const onCloseTab = vi.fn();

    render(
      <MarkdownTabsBar
        activeTabId="tab-a"
        items={[
          [
            {
              dirty: false,
              id: "tab-a",
              name: "Alpha.md",
              path: "/synthetic/alpha.md"
            },
            {
              dirty: false,
              id: "tab-b",
              name: "Beta.md",
              path: "/synthetic/beta.md"
            }
          ],
          {
            dirty: false,
            id: "tab-c",
            name: "Gamma.md",
            path: "/synthetic/gamma.md"
          },
          {
            dirty: false,
            id: "tab-d",
            name: "Delta.md",
            path: "/synthetic/delta.md"
          }
        ]}
        onCloseTab={onCloseTab}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close other tabs" }));

    await waitFor(() => expect(onCloseTab).toHaveBeenCalledTimes(2));
    expect(onCloseTab).toHaveBeenNthCalledWith(1, "tab-c");
    expect(onCloseTab).toHaveBeenNthCalledWith(2, "tab-d");

    onCloseTab.mockClear();
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close tabs to the right" }));

    await waitFor(() => expect(onCloseTab).toHaveBeenCalledTimes(2));
    expect(onCloseTab).toHaveBeenNthCalledWith(1, "tab-c");
    expect(onCloseTab).toHaveBeenNthCalledWith(2, "tab-d");
  });

  it("opens tab actions from right click and closes related tabs", async () => {
    const onCloseTab = vi.fn();

    render(
      <MarkdownTabsBar
        activeTabId="tab-b"
        items={[
          {
            dirty: false,
            id: "tab-a",
            name: "Alpha.md",
            path: "/synthetic/alpha.md"
          },
          {
            dirty: false,
            id: "tab-b",
            name: "Beta.md",
            path: "/synthetic/beta.md"
          },
          {
            dirty: false,
            id: "tab-c",
            name: "Gamma.md",
            path: "/synthetic/gamma.md"
          }
        ]}
        onCloseTab={onCloseTab}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));

    const menu = screen.getByRole("menu", { name: "Beta.md" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Close other tabs" }));

    await waitFor(() => expect(onCloseTab).toHaveBeenCalledTimes(2));
    expect(onCloseTab).toHaveBeenNthCalledWith(1, "tab-a");
    expect(onCloseTab).toHaveBeenNthCalledWith(2, "tab-c");

    onCloseTab.mockClear();
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close tabs to the right" }));

    await waitFor(() => expect(onCloseTab).toHaveBeenCalledTimes(1));
    expect(onCloseTab).toHaveBeenCalledWith("tab-c");
  });

  it("opens a markdown tab to the side from the tab actions menu", () => {
    const onOpenTabToSide = vi.fn();

    render(
      <MarkdownTabsBar
        activeTabId="tab-a"
        items={[
          {
            dirty: false,
            id: "tab-a",
            name: "Alpha.md",
            path: "/synthetic/alpha.md"
          },
          {
            dirty: false,
            id: "tab-b",
            name: "Beta.md",
            path: "/synthetic/beta.md"
          }
        ]}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onOpenTabToSide={onOpenTabToSide}
        onSelectTab={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    expect(onOpenTabToSide).toHaveBeenCalledWith("tab-b");
  });
});
