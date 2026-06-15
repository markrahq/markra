import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredExportSettings, saveStoredExportSettings } from "./app-settings";
import { normalizeExportSettings } from "./export-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("export settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads the default export settings", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredExportSettings()).resolves.toEqual({
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 18,
      pdfMarginPreset: "default",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });

    expect(store.get).toHaveBeenCalledWith("exportSettings");
  });

  it("normalizes persisted export settings", () => {
    expect(normalizeExportSettings({
      pandocArgs: " --toc --metadata title=\"Draft\" ",
      pandocPath: " /opt/homebrew/bin/pandoc ",
      pdfAuthor: " Ada Lovelace ",
      pdfFooter: "Page footer",
      pdfHeader: "Draft header",
      pdfHeightMm: 279,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    })).toEqual({
      pandocArgs: "--toc --metadata title=\"Draft\"",
      pandocPath: "/opt/homebrew/bin/pandoc",
      pdfAuthor: "Ada Lovelace",
      pdfFooter: "Page footer",
      pdfHeader: "Draft header",
      pdfHeightMm: 279,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });
    expect(normalizeExportSettings({
      pandocArgs: "x".repeat(1500),
      pandocPath: "x".repeat(700),
      pdfHeightMm: 9999,
      pdfMarginMm: 999,
      pdfMarginPreset: "custom",
      pdfPageSize: "custom",
      pdfWidthMm: 10
    })).toEqual({
      pandocArgs: "x".repeat(1000),
      pandocPath: "x".repeat(500),
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 2000,
      pdfMarginMm: 60,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: false,
      pdfPageSize: "custom",
      pdfWidthMm: 50
    });
    expect(normalizeExportSettings({ pdfMarginMm: 24 })).toEqual({
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });
  });

  it("persists normalized export settings", async () => {
    await saveStoredExportSettings({
      pandocArgs: " --toc ",
      pandocPath: " /usr/local/bin/pandoc ",
      pdfAuthor: "Ada",
      pdfFooter: "Footer",
      pdfHeader: "Header",
      pdfHeightMm: 279,
      pdfMarginMm: 72,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });

    expect(store.set).toHaveBeenCalledWith("exportSettings", {
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      pdfAuthor: "Ada",
      pdfFooter: "Footer",
      pdfHeader: "Header",
      pdfHeightMm: 279,
      pdfMarginMm: 60,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
