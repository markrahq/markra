import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DocumentHistoryDialog } from "./DocumentHistoryDialog";
import {
  listNativeMarkdownFileHistory,
  readNativeMarkdownFileHistory,
  type NativeMarkdownFileHistoryEntry
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  listNativeMarkdownFileHistory: vi.fn(),
  readNativeMarkdownFileHistory: vi.fn()
}));

const mockedListNativeMarkdownFileHistory = vi.mocked(listNativeMarkdownFileHistory);
const mockedReadNativeMarkdownFileHistory = vi.mocked(readNativeMarkdownFileHistory);

describe("DocumentHistoryDialog", () => {
  beforeEach(() => {
    mockedListNativeMarkdownFileHistory.mockReset();
    mockedReadNativeMarkdownFileHistory.mockReset();
  });

  it("loads history entries and restores a clicked state", async () => {
    const onClose = vi.fn();
    const onRestore = vi.fn();
    mockedListNativeMarkdownFileHistory.mockResolvedValue([
      {
        id: "history-newer",
        createdAt: 1_700_000_001_000,
        sizeBytes: 31
      },
      {
        id: "history-older",
        createdAt: 1_700_000_000_000,
        sizeBytes: 27
      }
    ]);
    mockedReadNativeMarkdownFileHistory.mockImplementation(async (_path, id) => ({
      id,
      contents: id === "history-older"
        ? "# Earlier\n\nSynthetic history."
        : "# Newer\n\nSynthetic history."
    }));

    render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={onClose}
        onRestore={onRestore}
      />
    );

    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "History versions" })).not.toBeInTheDocument();
    const listbox = await screen.findByRole("listbox", { name: "History versions" });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Restore version" })).not.toBeInTheDocument();

    fireEvent.click(options[1]);

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith("# Earlier\n\nSynthetic history.", "history-older");
    });
    expect(mockedListNativeMarkdownFileHistory).toHaveBeenCalledWith("/mock-files/guide.md");
    expect(mockedReadNativeMarkdownFileHistory).toHaveBeenLastCalledWith(
      "/mock-files/guide.md",
      "history-older"
    );
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses a restrained entrance animation", async () => {
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={() => {}}
        onRestore={() => {}}
      />
    );

    const panel = await screen.findByRole("region", { name: "History versions" });

    expect(panel).toHaveClass(
      "animate-[markra-history-panel-in_140ms_cubic-bezier(0.2,0,0,1)_both]",
      "motion-reduce:animate-none"
    );
    expect(panel).toHaveStyle({ top: "48px" });
  });

  it("dismisses on an outside pointer press without dismissing interactions inside the panel", async () => {
    const onClose = vi.fn();
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={onClose}
        onRestore={() => {}}
      />
    );

    const panel = await screen.findByRole("region", { name: "History versions" });

    fireEvent.pointerDown(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sits below both rows of the self-drawn Windows titlebar", async () => {
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={() => {}}
        onRestore={() => {}}
        windowsSelfDrawnChrome
      />
    );

    expect(await screen.findByRole("region", { name: "History versions" })).toHaveStyle({
      top: "88px"
    });
  });

  it("restores the selected version after StrictMode remount checks", async () => {
    const onRestore = vi.fn();
    mockedListNativeMarkdownFileHistory.mockResolvedValue([
      {
        id: "history-current",
        createdAt: 1_700_000_001_000,
        sizeBytes: 27
      }
    ]);
    mockedReadNativeMarkdownFileHistory.mockResolvedValue({
      id: "history-current",
      contents: "# Earlier\n\nSynthetic history."
    });

    render(
      <StrictMode>
        <DocumentHistoryDialog
          documentPath="/mock-files/guide.md"
          language="en"
          onClose={() => {}}
          onRestore={onRestore}
        />
      </StrictMode>
    );

    const option = await screen.findByRole("option");
    fireEvent.click(option);

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith("# Earlier\n\nSynthetic history.", "history-current");
    });
  });

  it("shows an empty state when the document has no saved history", async () => {
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={() => {}}
        onRestore={() => {}}
      />
    );

    expect(await screen.findByText("No saved versions yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore version" })).not.toBeInTheDocument();
  });

  it("keeps existing entries visible while a refresh is loading", async () => {
    const initialEntries: NativeMarkdownFileHistoryEntry[] = [
      {
        id: "history-original",
        createdAt: 1_700_000_001_000,
        sizeBytes: 27
      }
    ];
    const refreshedEntries: NativeMarkdownFileHistoryEntry[] = [
      {
        id: "history-updated",
        createdAt: 1_700_000_002_000,
        sizeBytes: 35
      },
      ...initialEntries
    ];
    let resolveRefresh: (entries: NativeMarkdownFileHistoryEntry[]) => unknown = () => {};
    const refreshPromise = new Promise<NativeMarkdownFileHistoryEntry[]>((resolve) => {
      resolveRefresh = resolve;
    });
    mockedListNativeMarkdownFileHistory
      .mockResolvedValueOnce(initialEntries)
      .mockReturnValueOnce(refreshPromise);

    const { rerender } = render(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={() => {}}
        onRestore={() => {}}
        refreshKey={0}
      />
    );

    expect(await screen.findByRole("listbox", { name: "History versions" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);

    rerender(
      <DocumentHistoryDialog
        documentPath="/mock-files/guide.md"
        language="en"
        onClose={() => {}}
        onRestore={() => {}}
        refreshKey={1}
      />
    );

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByText("Loading versions...")).not.toBeInTheDocument();

    resolveRefresh(refreshedEntries);

    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });
  });
});
