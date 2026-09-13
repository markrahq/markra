import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { ThemeFileSelect, ThemeFolderSettings } from "./ThemeFolderSettings";

function controls() {
  return {
    available: true, directory: "/mock/themes", files: ["example.css"],
    selection: { light: "missing.css", dark: null }, css: { light: null, dark: null },
    failedFiles: ["missing.css"], error: false, loading: false, ready: true,
    refresh: vi.fn(), openFolder: vi.fn(), select: vi.fn()
  };
}

it("opens the folder, refreshes themes, and explains a missing file fallback", () => {
  const themeFiles = controls();
  render(<ThemeFolderSettings themeFiles={themeFiles} translate={translate} />);
  fireEvent.click(screen.getByRole("button", { name: "Open theme folder" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh themes" }));
  expect(themeFiles.openFolder).toHaveBeenCalledOnce();
  expect(themeFiles.refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("missing.css");
  expect(screen.getByRole("status")).toHaveTextContent("saved CSS");
});

it("preserves a missing selection and allows returning to inline CSS", () => {
  const themeFiles = controls();
  render(<ThemeFileSelect appearance="light" themeFiles={themeFiles} translate={translate} />);
  const select = screen.getByRole("combobox", { name: "Light theme source" });
  expect(select).toHaveValue("missing.css");
  fireEvent.change(select, { target: { value: "example.css" } });
  expect(themeFiles.select).toHaveBeenCalledWith("light", "example.css");
  fireEvent.change(select, { target: { value: "" } });
  expect(themeFiles.select).toHaveBeenCalledWith("light", null);
});

it("disables the selector while saving and offers recovery after a directory error", () => {
  const themeFiles = { ...controls(), loading: true, error: true };
  render(<>
    <ThemeFolderSettings themeFiles={themeFiles} translate={translate} />
    <ThemeFileSelect appearance="dark" themeFiles={themeFiles} translate={translate} />
  </>);
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("try again");
});
