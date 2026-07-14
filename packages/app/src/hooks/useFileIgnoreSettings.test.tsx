import { act, renderHook, waitFor } from "@testing-library/react";
import {
  defaultFileIgnoreSettings,
  getStoredFileIgnoreSettings
} from "../lib/settings/app-settings";
import { listenAppFileIgnoreSettingsChanged } from "../lib/settings/settings-events";
import { useFileIgnoreSettings } from "./useFileIgnoreSettings";

vi.mock("../lib/settings/app-settings", () => ({
  defaultFileIgnoreSettings: { rules: "" },
  getStoredFileIgnoreSettings: vi.fn()
}));

vi.mock("../lib/settings/settings-events", () => ({
  listenAppFileIgnoreSettingsChanged: vi.fn()
}));

const mockedGetStoredFileIgnoreSettings = vi.mocked(getStoredFileIgnoreSettings);
const mockedListenAppFileIgnoreSettingsChanged = vi.mocked(listenAppFileIgnoreSettingsChanged);

describe("useFileIgnoreSettings", () => {
  beforeEach(() => {
    mockedGetStoredFileIgnoreSettings.mockReset();
    mockedListenAppFileIgnoreSettingsChanged.mockReset();
    mockedListenAppFileIgnoreSettingsChanged.mockResolvedValue(() => {});
  });

  it("loads saved rules and reacts to cross-window changes", async () => {
    let onSettingsChanged: Parameters<typeof listenAppFileIgnoreSettingsChanged>[0] | null = null;
    mockedGetStoredFileIgnoreSettings.mockResolvedValue({ rules: "generated/" });
    mockedListenAppFileIgnoreSettingsChanged.mockImplementation(async (handler) => {
      onSettingsChanged = handler;
      return () => {};
    });

    const { result } = renderHook(() => useFileIgnoreSettings());

    expect(result.current).toEqual({
      loading: true,
      settings: defaultFileIgnoreSettings
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        loading: false,
        settings: { rules: "generated/" }
      });
    });

    act(() => {
      onSettingsChanged?.({ rules: "drafts/" });
    });

    expect(result.current.settings).toEqual({ rules: "drafts/" });
  });
});
