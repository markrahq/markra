import { showContextMenu } from "./ContextMenu";

function getMenu() {
  return document.querySelector("[data-markra-context-menu]");
}

function getMenuItemById(id: string) {
  const item = document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
  if (!item) throw new Error(`Menu item not found: ${id}`);

  return item;
}

function testRect(rect: Partial<DOMRect>): DOMRect {
  return {
    bottom: rect.bottom ?? 0,
    height: rect.height ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    toJSON: () => ({})
  };
}

describe("ContextMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders a themed self-drawn menu at the requested point and closes after selecting an item", () => {
    const select = vi.fn();

    showContextMenu(document, {
      entries: [
        {
          id: "markra:test:open",
          kind: "item",
          label: "Open",
          onSelect: select
        }
      ],
      position: {
        x: 32,
        y: 48
      }
    });

    const menu = getMenu();
    expect(menu).not.toBeNull();
    expect(menu).toHaveAttribute("role", "menu");
    expect(menu).toHaveClass("bg-(--bg-primary)");
    expect((menu as HTMLElement).style.left).toBe("32px");
    expect((menu as HTMLElement).style.top).toBe("48px");

    getMenuItemById("markra:test:open").click();

    expect(select).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();
  });

  it("renders disabled items and submenus with native-like menu roles", () => {
    const disabledSelect = vi.fn();
    const childSelect = vi.fn();

    showContextMenu(document, {
      entries: [
        {
          disabled: true,
          id: "markra:test:disabled",
          kind: "item",
          label: "Disabled",
          onSelect: disabledSelect
        },
        {
          entries: [
            {
              id: "markra:test:child",
              kind: "item",
              label: "Child",
              onSelect: childSelect
            }
          ],
          id: "markra:test:submenu",
          kind: "submenu",
          label: "More"
        }
      ],
      position: {
        x: 8,
        y: 8
      }
    });

    const disabledItem = getMenuItemById("markra:test:disabled");
    const submenuButton = getMenuItemById("markra:test:submenu");

    disabledItem.click();

    expect(disabledItem).toBeDisabled();
    expect(disabledSelect).not.toHaveBeenCalled();
    expect(submenuButton).toHaveAttribute("aria-haspopup", "menu");
    expect(submenuButton.querySelector("svg")).not.toBeNull();
    expect(submenuButton).not.toHaveTextContent(">");
    const submenu = document.querySelector<HTMLElement>("[data-menu-submenu-id='markra:test:submenu']");
    const submenuBridge = document.querySelector<HTMLElement>("[data-menu-submenu-bridge-id='markra:test:submenu']");

    expect(submenu).toHaveAttribute("role", "menu");
    expect(submenu?.style.left).toBe("calc(100% + 8px)");
    expect(submenuBridge?.style.width).toBe("8px");

    getMenuItemById("markra:test:child").click();

    expect(childSelect).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();
  });

  it("limits the main menu height when opened near the viewport bottom", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(300);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-markra-context-menu")) return 500;

      return 28;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-markra-context-menu")) return 216;

      return 32;
    });

    showContextMenu(document, {
      entries: Array.from({ length: 24 }, (_, index) => ({
        id: `markra:test:item-${index + 1}`,
        kind: "item" as const,
        label: `Item ${index + 1}`,
        onSelect: vi.fn()
      })),
      position: {
        x: 120,
        y: 260
      }
    });

    const menu = getMenu() as HTMLElement | null;

    expect(menu).not.toBeNull();
    expect(menu?.style.top).toBe("8px");
    expect(menu?.style.maxHeight).toBe("252px");
    expect(menu?.style.overflowY).toBe("auto");
  });

  it("keeps submenus inside the viewport when their anchor is near the bottom", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(220);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-menu-submenu-id")) return 120;
      if (this.hasAttribute("data-markra-context-menu")) return 180;

      return 28;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("data-menu-item-id") === "markra:test:submenu") {
        return testRect({
          bottom: 198,
          height: 28,
          left: 8,
          right: 224,
          top: 170,
          width: 216
        });
      }

      return testRect({
        bottom: 36,
        height: 28,
        left: 8,
        right: 224,
        top: 8,
        width: 216
      });
    });

    showContextMenu(document, {
      entries: [
        {
          entries: [
            {
              id: "markra:test:child-1",
              kind: "item",
              label: "Child 1",
              onSelect: vi.fn()
            },
            {
              id: "markra:test:child-2",
              kind: "item",
              label: "Child 2",
              onSelect: vi.fn()
            },
            {
              id: "markra:test:child-3",
              kind: "item",
              label: "Child 3",
              onSelect: vi.fn()
            }
          ],
          id: "markra:test:submenu",
          kind: "submenu",
          label: "More"
        }
      ],
      position: {
        x: 8,
        y: 8
      }
    });

    const submenu = document.querySelector<HTMLElement>("[data-menu-submenu-id='markra:test:submenu']");

    expect(submenu).not.toBeNull();
    expect(submenu?.style.top).toBe("-78px");
  });
});
