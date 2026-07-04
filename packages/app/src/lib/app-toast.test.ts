import { toast } from "sonner";
import { appNoticeToasterId, dismissAppToast, showAppToast } from "./app-toast";

vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn()
  }
}));

const mockedToast = vi.mocked(toast);

describe("appToast", () => {
  beforeEach(() => {
    mockedToast.dismiss.mockReset();
    mockedToast.error.mockReset();
    mockedToast.loading.mockReset();
    mockedToast.success.mockReset();
  });

  it("routes success, loading, error, and dismiss through one shared toast API", () => {
    const action = {
      label: "Restart",
      onClick: vi.fn()
    };

    showAppToast({ message: "Saved", status: "success" });
    showAppToast({ action, id: "update-test", message: "Downloading", status: "loading" });
    showAppToast({
      id: "provider-test",
      message: "Failed",
      status: "error"
    });
    showAppToast({ duration: Infinity, id: "update-ready", message: "Ready", status: "success" });
    dismissAppToast("provider-test");

    expect(mockedToast.success).toHaveBeenCalledWith("Saved", {
      duration: 4500,
      id: "app-toast"
    });
    expect(mockedToast.loading).toHaveBeenCalledWith("Downloading", {
      action,
      duration: Infinity,
      id: "update-test"
    });
    expect(mockedToast.error).toHaveBeenCalledWith("Failed", {
      duration: Infinity,
      id: "provider-test"
    });
    expect(mockedToast.success).toHaveBeenCalledWith("Ready", {
      duration: Infinity,
      id: "update-ready"
    });
    expect(mockedToast.dismiss).toHaveBeenCalledWith("provider-test");
  });

  it("passes long error detail through as a toast description", () => {
    const toastWithDescription = {
      description: "S3 image upload failed: HTTP 403",
      message: "Could not save the pasted image.",
      status: "error"
    } as Parameters<typeof showAppToast>[0] & { description: string };

    showAppToast(toastWithDescription);

    expect(mockedToast.error).toHaveBeenCalledWith("Could not save the pasted image.", {
      description: "S3 image upload failed: HTTP 403",
      duration: Infinity,
      id: "app-toast"
    });
  });

  it("routes diagnostic notices through the bottom-right notice toaster", () => {
    showAppToast({
      id: "runtime-error-diagnostics",
      message: "Markra caught an error.",
      status: "error",
      surface: "notice"
    });

    expect(mockedToast.error).toHaveBeenCalledWith("Markra caught an error.", {
      duration: Infinity,
      id: "runtime-error-diagnostics",
      position: "bottom-right",
      toasterId: appNoticeToasterId
    });
  });
});
