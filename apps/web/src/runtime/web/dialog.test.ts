import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import { createWebRuntime } from "..";

describe("web dialog runtime", () => {
  it("uses browser confirmation for AI session delete prompts", async () => {
    const confirm = vi.fn(() => true);
    const runtime = createWebRuntime({
      confirm,
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.dialog.confirmAiAgentSessionDelete("Test", {
      cancelLabel: "Cancel",
      message: "Delete session?",
      okLabel: "Delete"
    })).resolves.toBe(true);
    await expect(runtime.dialog.showPandocSetup({
      cancelLabel: "Cancel",
      installLabel: "Install",
      message: "Pandoc is unavailable.",
      setPathLabel: "Set path",
      title: "Pandoc"
    })).resolves.toBe("cancel");
    await expect(runtime.dialog.showAppAbout()).resolves.toBeUndefined();

    expect(confirm).toHaveBeenCalledWith("Delete session?");
  });
});
