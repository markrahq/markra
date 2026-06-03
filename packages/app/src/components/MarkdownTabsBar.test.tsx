import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { MarkdownTabsBar } from "./MarkdownTabsBar";

describe("MarkdownTabsBar", () => {
  function mockElementFromPoint(element: Element) {
    const mock = vi.fn(() => element);

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: mock
    });

    return mock;
  }

  const overflowItems = Array.from({ length: 8 }, (_, index) => ({
    dirty: false,
    id: `tab-${index + 1}`,
    name: `Synthetic ${index + 1}.md`,
    path: `/synthetic/doc-${index + 1}.md`
  }));

  it("marks only titlebar tab empty space as a window drag region", () => {
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
    expect(container.querySelector(".document-tabs-titlebar")).not.toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("tab", { name: /Alpha\.md/ }).closest("[data-tauri-drag-region]")).toBeNull();
    expect(container.querySelector(".document-tabs-drag-spacer")).toHaveAttribute("data-tauri-drag-region");
  });

  it("keeps the new tab action outside the horizontally scrolling tablist", () => {
    render(
      <MarkdownTabsBar
        activeTabId="tab-1"
        items={overflowItems}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    const tablist = screen.getByRole("tablist", { name: "Open documents" });
    const newTabButton = screen.getByRole("button", { name: "New tab" });

    expect(tablist).not.toContainElement(newTabButton);
    expect(newTabButton.closest(".document-tabs-controls")).toBeInTheDocument();
  });

  it("scrolls overflowing tabs horizontally with a vertical mouse wheel", () => {
    render(
      <MarkdownTabsBar
        activeTabId="tab-1"
        items={overflowItems}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    const tablist = screen.getByRole("tablist", { name: "Open documents" });
    Object.defineProperty(tablist, "clientWidth", { configurable: true, value: 220 });
    Object.defineProperty(tablist, "scrollWidth", { configurable: true, value: 960 });
    tablist.scrollLeft = 0;

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 84
    });

    tablist.dispatchEvent(wheelEvent);

    expect(tablist.scrollLeft).toBe(84);
  });

  it("keeps the active tab visible when selection changes", () => {
    const { rerender } = render(
      <MarkdownTabsBar
        activeTabId="tab-1"
        items={overflowItems}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    const scrollIntoView = vi.fn();
    for (const element of document.querySelectorAll<HTMLElement>("[data-document-tab-id='tab-8']")) {
      element.scrollIntoView = scrollIntoView;
    }

    rerender(
      <MarkdownTabsBar
        activeTabId="tab-8"
        items={overflowItems}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest"
    });
  });

  it("omits titlebar empty drag space when native drag regions are unavailable", () => {
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
        nativeDragRegionEnabled={false}
        placement="titlebar"
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onSelectTab={() => {}}
      />
    );

    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(container.querySelector(".document-tabs-drag-spacer")).not.toBeInTheDocument();
  });

  it("keeps document tabs out of native browser dragging so pointer drag owns side-by-side drops", () => {
    const { container } = render(
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
        onOpenTabToSide={() => {}}
        onSelectTab={() => {}}
      />
    );

    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });

    expect(betaTab).toHaveAttribute("draggable", "false");
    expect(betaTab.closest(".group\\/tab")).toHaveAttribute("draggable", "false");
    expect(container.querySelector("[draggable='true']")).toBeNull();
  });

  it("marks the page as tab-dragging while a pointer tab drag is active", () => {
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
        onOpenTabToSide={() => {}}
        onSelectTab={() => {}}
      />
    );

    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(document.body);

    expect(document.documentElement).not.toHaveAttribute("data-document-tab-dragging");

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 22, clientY: 12, pointerId: 1 });
    expect(document.documentElement).not.toHaveAttribute("data-document-tab-dragging");

    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    expect(document.documentElement).toHaveAttribute("data-document-tab-dragging", "true");

    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });
    expect(document.documentElement).not.toHaveAttribute("data-document-tab-dragging");
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("shows a shadowed tab preview while pointer dragging", () => {
    const { container } = render(
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
        onOpenTabToSide={() => {}}
        onSelectTab={() => {}}
      />
    );

    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(document.body);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    expect(container.querySelector(".document-tab-drag-preview")).not.toBeInTheDocument();

    fireEvent.pointerMove(window, { clientX: 80, clientY: 32, pointerId: 1 });
    const preview = container.querySelector(".document-tab-drag-preview") as HTMLElement;

    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent("Beta.md");
    expect(preview.className).toContain("shadow-");
    expect(preview.style.transform).toBe("translate3d(92px, 44px, 0)");

    fireEvent.pointerUp(window, { clientX: 80, clientY: 32, pointerId: 1 });
    expect(container.querySelector(".document-tab-drag-preview")).not.toBeInTheDocument();
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("clears pointer tab dragging when the window loses focus", () => {
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
        onOpenTabToSide={() => {}}
        onSelectTab={() => {}}
      />
    );

    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(document.body);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    expect(document.documentElement).toHaveAttribute("data-document-tab-dragging", "true");

    fireEvent.blur(window);
    expect(document.documentElement).not.toHaveAttribute("data-document-tab-dragging");

    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });
    expect(elementFromPoint).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document, "elementFromPoint");
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

  it("cancels a side-by-side tab group from the tab actions menu", () => {
    const onCancelSideBySide = vi.fn();
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
          ]
        ]}
        onCancelSideBySide={onCancelSideBySide}
        onCloseTab={onCloseTab}
        onNewTab={() => {}}
        onOpenTabToSide={() => {}}
        onSelectTab={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Beta\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel side-by-side" }));

    expect(onCancelSideBySide).toHaveBeenCalledWith("tab-b");
    expect(onCloseTab).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Beta.md" })).not.toBeInTheDocument();
  });

  it("opens a pointer-dragged markdown tab to the side when released over the active tab", () => {
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

    const alphaTab = screen.getByRole("tab", { name: /Alpha\.md/ });
    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(alphaTab);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });

    expect(onOpenTabToSide).toHaveBeenCalledWith("tab-b", "tab-a");
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("uses the pointer drop target tab as the main side-by-side tab", () => {
    const onOpenTabToSide = vi.fn();

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
          }
        ]}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onOpenTabToSide={onOpenTabToSide}
        onSelectTab={() => {}}
      />
    );

    const alphaTab = screen.getByRole("tab", { name: /Alpha\.md/ });
    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(alphaTab);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });

    expect(onOpenTabToSide).toHaveBeenCalledWith("tab-b", "tab-a");
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("opens a pointer-dragged markdown tab to the side when released over another tab", () => {
    const onOpenTabToSide = vi.fn();

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
          }
        ]}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onOpenTabToSide={onOpenTabToSide}
        onSelectTab={() => {}}
      />
    );

    const alphaTab = screen.getByRole("tab", { name: /Alpha\.md/ });
    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(alphaTab);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });

    expect(onOpenTabToSide).toHaveBeenCalledWith("tab-b", "tab-a");
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("treats the whole tab item as a pointer side-by-side drop target", () => {
    const onOpenTabToSide = vi.fn();

    const { container } = render(
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
          }
        ]}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onOpenTabToSide={onOpenTabToSide}
        onSelectTab={() => {}}
      />
    );

    const alphaCloseButton = screen.getByRole("button", { name: "Close tab Alpha.md" });
    const betaTab = screen.getByRole("tab", { name: /Beta\.md/ });
    const elementFromPoint = mockElementFromPoint(alphaCloseButton);

    expect(alphaCloseButton.closest(".group\\/tab")).toHaveAttribute("data-document-tab-id", "tab-a");

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });

    expect(onOpenTabToSide).toHaveBeenCalledWith("tab-b", "tab-a");
    expect(elementFromPoint).toHaveBeenCalled();
    expect(container.querySelector("[data-document-tab-dragging='true']")).toBeNull();
    Reflect.deleteProperty(document, "elementFromPoint");
  });
});
