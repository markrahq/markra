import { listen } from "@tauri-apps/api/event";
import { desktopRuntime } from "./index";

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn()
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
  version: vi.fn(() => "26.5.1")
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn()
}));

vi.mock("@markra/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@markra/shared")>(),
  hasTauriRuntime: vi.fn(() => true)
}));

const mockedListen = vi.mocked(listen);

describe("desktop runtime events", () => {
  beforeEach(() => {
    mockedListen.mockReset();
  });

  it("ignores stale Tauri unlisten failures and only cleans up once", async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error("undefined is not an object (evaluating 'listeners[eventId].handlerId')"));
    mockedListen.mockResolvedValue(cleanup);

    const stopListening = await desktopRuntime.events.listen("markra://synthetic-event", () => {});

    await expect(Promise.resolve(stopListening())).resolves.toBeUndefined();
    await expect(Promise.resolve(stopListening())).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
