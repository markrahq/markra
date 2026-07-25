import { fireEvent, render, screen, within } from "@testing-library/react";
import { AssetCleanupDialog } from "./AssetCleanupDialog";
import type { WorkspaceAssetIndex } from "../lib/workspace-assets";

const now = 1_800_000_000_000;

function cleanupIndex(overrides: Partial<WorkspaceAssetIndex> = {}): WorkspaceAssetIndex {
  const oldAsset = {
    kind: "asset" as const,
    modifiedAt: now - 8 * 24 * 60 * 60 * 1000,
    name: "old.png",
    path: "/mock-vault/assets/old.png",
    relativePath: "assets/old.png",
    sizeBytes: 1024
  };
  const recentAsset = {
    kind: "asset" as const,
    modifiedAt: now - 2 * 24 * 60 * 60 * 1000,
    name: "recent.png",
    path: "/mock-vault/assets/recent.png",
    relativePath: "assets/recent.png",
    sizeBytes: 2048
  };

  return {
    candidateAssets: [oldAsset, recentAsset],
    referencedAssets: [],
    scannedDocumentCount: 3,
    scannedDocuments: [],
    unreadableDocuments: [],
    unusedAssets: [oldAsset, recentAsset],
    ...overrides
  };
}

describe("AssetCleanupDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("previews unused assets and leaves recent files unselected by default", () => {
    const onTrash = vi.fn();

    render(
      <AssetCleanupDialog
        index={cleanupIndex()}
        language="en"
        onClose={() => {}}
        onRefresh={() => {}}
        onTrash={onTrash}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Clean up unused images" });
    expect(within(dialog).getByText("2 unused images")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "old.png" })).toHaveAttribute(
      "src",
      "/mock-vault/assets/old.png"
    );
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "old.png" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "recent.png" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Move 1 image to Trash" }));

    expect(onTrash).toHaveBeenCalledWith([
      expect.objectContaining({ path: "/mock-vault/assets/old.png" })
    ]);
  });

  it("leaves assets with an unknown modification time unselected", () => {
    const unknownAsset = {
      kind: "asset" as const,
      name: "unknown.png",
      path: "/mock-vault/assets/unknown.png",
      relativePath: "assets/unknown.png",
      sizeBytes: 512
    };

    render(
      <AssetCleanupDialog
        index={cleanupIndex({
          candidateAssets: [unknownAsset],
          unusedAssets: [unknownAsset]
        })}
        language="en"
        onClose={() => {}}
        onRefresh={() => {}}
        onTrash={() => {}}
      />
    );

    expect(screen.getByRole("checkbox", { name: "unknown.png" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Move 0 images to Trash" })).toBeDisabled();
  });

  it("blocks cleanup when any Markdown document could not be scanned", () => {
    render(
      <AssetCleanupDialog
        index={cleanupIndex({
          unreadableDocuments: [{
            name: "locked.md",
            path: "/mock-vault/locked.md",
            relativePath: "locked.md"
          }]
        })}
        language="en"
        onClose={() => {}}
        onRefresh={() => {}}
        onTrash={() => {}}
      />
    );

    expect(screen.getByText("1 Markdown file could not be read. Cleanup is disabled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move 1 image to Trash" })).toBeDisabled();
  });

  it("keeps the empty state focused and hides the zero-item destructive action", () => {
    render(
      <AssetCleanupDialog
        index={cleanupIndex({
          candidateAssets: [],
          unusedAssets: []
        })}
        language="en"
        onClose={() => {}}
        onRefresh={() => {}}
        onTrash={() => {}}
      />
    );

    expect(screen.getByText("No unused managed images were found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move 0 images to Trash" })).not.toBeInTheDocument();
  });
});
