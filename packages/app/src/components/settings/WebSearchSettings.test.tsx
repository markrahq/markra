import { fireEvent, render, screen } from "@testing-library/react";
import { t } from "@markra/shared";
import { defaultWebSearchSettings } from "../../lib/settings/web-search-settings";
import { WebSearchSettings } from "./WebSearchSettings";

describe("WebSearchSettings", () => {
  it("offers Parallel as an opt-in and names its destination even when search is off", () => {
    const settings = { ...defaultWebSearchSettings, enabled: false };
    const onUpdateSettings = vi.fn();
    const translate = (key: string) => t("en", key);
    const { rerender } = render(
      <WebSearchSettings settings={settings} onUpdateSettings={onUpdateSettings} translate={translate} />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Search provider" }), { target: { value: "parallel" } });
    expect(onUpdateSettings).toHaveBeenCalledExactlyOnceWith({ ...settings, providerId: "parallel" });

    rerender(
      <WebSearchSettings
        settings={{ ...settings, providerId: "parallel" }}
        onUpdateSettings={onUpdateSettings}
        translate={translate}
      />
    );
    expect(screen.getByText(/Markra sends queries to mcp\.parallel\.ai/u)).toBeVisible();
    expect(screen.queryByLabelText("SearXNG URL")).not.toBeInTheDocument();
  });
});
