import { invoke } from "@tauri-apps/api/core";
import {
  listNativeSystemFontFamilies,
  normalizeNativeSystemFontFamilies
} from "./fonts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

const mockedInvoke = vi.mocked(invoke);

describe("native system fonts", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    mockedInvoke.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("normalizes font family names returned from native code", () => {
    expect(normalizeNativeSystemFontFamilies([
      { family: "Inter", label: "Inter" },
      { family: " Example Serif ", label: "示例衬线" },
      { family: "", label: "Blank" },
      42,
      { family: "Inter", label: "Inter Duplicate" }
    ])).toEqual([
      { family: "Inter", label: "Inter" },
      { family: "Example Serif", label: "示例衬线" }
    ]);
  });

  it("normalizes legacy string font families returned from native code", () => {
    expect(normalizeNativeSystemFontFamilies(["Inter", " Example Serif ", "", 42, "Inter"])).toEqual([
      { family: "Example Serif", label: "Example Serif" },
      { family: "Inter", label: "Inter" }
    ]);
  });

  it("lists system fonts through Tauri", async () => {
    mockedInvoke.mockResolvedValue([
      { family: "Inter", label: "Inter" },
      { family: "Example Serif", label: "示例衬线" }
    ]);

    await expect(listNativeSystemFontFamilies()).resolves.toEqual([
      { family: "Inter", label: "Inter" },
      { family: "Example Serif", label: "示例衬线" }
    ]);

    expect(mockedInvoke).toHaveBeenCalledWith("list_system_font_families");
  });
});
