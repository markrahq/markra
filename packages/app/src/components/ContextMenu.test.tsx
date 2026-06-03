import { showContextMenu } from "./ContextMenu";

function getMenu() {
  return document.querySelector("[data-markra-context-menu]");
}

function getMenuItemById(id: string) {
  const item = document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
  if (!item) throw new Error(`Menu item not found: ${id}`);

  return item;
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
    expect(document.querySelector("[data-menu-submenu-id='markra:test:submenu']")).toHaveAttribute("role", "menu");

    getMenuItemById("markra:test:child").click();

    expect(childSelect).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();
  });
});
