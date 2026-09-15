import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { CustomThemeCssControl } from "./ThemeSettingsControls";

it("rejects an oversized CSS file while preserving the current source", async () => {
  const update = vi.fn();
  const { container } = render(<CustomThemeCssControl customThemeCss="/* retained */" label="CSS" onUpdateCustomThemeCss={update} translate={translate} />);
  const file = new File(["x".repeat(1024 * 1024 + 1)], "oversized.css", { type: "text/css" });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("1 MiB"));
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("/* retained */");
});

it("imports and exports large supported CSS without altering it", async () => {
  const css = `#write { color: #123456; } /* ${"mock ".repeat(12_000)} */`;
  const update = vi.fn();
  const { container } = render(<CustomThemeCssControl customThemeCss={css} label="CSS" onUpdateCustomThemeCss={update} translate={translate} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([css], "mock.css", { type: "text/css" })] } });
  await waitFor(() => expect(update).toHaveBeenCalledWith(css));
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-theme");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Export CSS" }));
  expect(await (create.mock.calls[0][0] as Blob).text()).toBe(css);
  vi.restoreAllMocks();
});
