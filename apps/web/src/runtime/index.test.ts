import { FakeIndexedDbFactory } from "../test/web-runtime-fakes";
import { createWebRuntime } from "./index";

describe("web runtime", () => {
  it("creates a browser runtime with IndexedDB settings", async () => {
    const runtime = createWebRuntime({
      eventTarget: new EventTarget(),
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const store = await runtime.settings.loadStore("settings.json", {
      autoSave: false,
      defaults: { theme: "system" }
    });

    await store.set("theme", "solarized-dark");
    await store.save();

    const reloadedStore = await runtime.settings.loadStore("settings.json", {
      autoSave: false,
      defaults: {}
    });

    await expect(reloadedStore.get("theme")).resolves.toBe("solarized-dark");
    expect(runtime.events.isAvailable()).toBe(true);
    expect(runtime.features.ai).toBe(false);
    expect(runtime.features.export).toBe(true);
    expect(runtime.features.nativeWindowChrome).toBe(false);
    expect(runtime.features.networkProxy).toBe(false);
    expect(runtime.features.pandoc).toBe(false);
    expect(runtime.features.s3ImageUpload).toBe(false);
    expect(runtime.features.spellcheck).toBe(false);
    expect(runtime.features.updater).toBe(false);
    expect(runtime.platform.resolveDesktopPlatform()).toBe("windows");
    await expect(runtime.updater.checkAppUpdate()).resolves.toBeNull();
  });
});
