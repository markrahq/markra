import { render } from "@testing-library/react";
import { useDefaultContextMenuBlocker } from "./useDefaultContextMenuBlocker";

function ContextMenuHarness({ enabled }: { enabled: boolean }) {
  useDefaultContextMenuBlocker(enabled);

  return (
    <div>
      <div data-testid="context-target" />
      <input data-testid="text-input" defaultValue="Draft note" />
      <textarea data-testid="textarea" defaultValue="Draft note" />
      <div contentEditable data-testid="editable" suppressContentEditableWarning>
        Draft note
      </div>
      <input data-testid="checkbox" type="checkbox" />
    </div>
  );
}

function dispatchContextMenu(target: EventTarget) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true
  });

  target.dispatchEvent(event);

  return event;
}

describe("useDefaultContextMenuBlocker", () => {
  it("prevents the browser default context menu when enabled", () => {
    const { getByTestId } = render(<ContextMenuHarness enabled />);

    const event = dispatchContextMenu(getByTestId("context-target"));

    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves editable text control context menus available when enabled", () => {
    const { getByTestId } = render(<ContextMenuHarness enabled />);

    expect(dispatchContextMenu(getByTestId("text-input")).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(getByTestId("textarea")).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(getByTestId("editable")).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(getByTestId("checkbox")).defaultPrevented).toBe(true);
  });

  it("leaves context menus alone when disabled", () => {
    const { getByTestId } = render(<ContextMenuHarness enabled={false} />);

    const event = dispatchContextMenu(getByTestId("context-target"));

    expect(event.defaultPrevented).toBe(false);
  });
});
