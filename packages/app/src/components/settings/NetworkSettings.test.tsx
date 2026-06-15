import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { translate } from "../../test/settings-components";
import { defaultNetworkSettings, type NetworkSettings as NetworkSettingsValue } from "../../lib/settings/app-settings";
import { NetworkSettings } from "./NetworkSettings";

describe("NetworkSettings", () => {
  function Harness() {
    const [settings, setSettings] = useState<NetworkSettingsValue>({
      ...defaultNetworkSettings,
      proxyEnabled: true,
      proxyUrl: "socks5://127.0.0.1:1080"
    });

    return (
      <NetworkSettings
        settings={settings}
        translate={translate}
        onUpdateSettings={setSettings}
      />
    );
  }

  it("edits the app proxy URL and local address bypass", () => {
    render(<Harness />);

    const proxySwitch = screen.getByRole("switch", { name: "Use app proxy" });
    const proxyUrl = screen.getByRole("textbox", { name: "Proxy URL" });
    const bypassLocal = screen.getByRole("checkbox", { name: "Bypass local and private network addresses" });

    expect(proxySwitch).toHaveAttribute("aria-checked", "true");
    expect(proxyUrl).toHaveValue("socks5://127.0.0.1:1080");
    expect(bypassLocal).toBeChecked();

    fireEvent.change(proxyUrl, { target: { value: "http://127.0.0.1:7890" } });
    fireEvent.click(bypassLocal);

    expect(screen.getByRole("textbox", { name: "Proxy URL" })).toHaveValue("http://127.0.0.1:7890");
    expect(screen.getByRole("checkbox", { name: "Bypass local and private network addresses" })).not.toBeChecked();
  });
});
