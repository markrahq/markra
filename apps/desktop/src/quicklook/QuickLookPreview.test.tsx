import { render } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: "<svg><g></g></svg>" }))
  }
}));

import { QuickLookPreview } from "./QuickLookPreview";

describe("QuickLookPreview", () => {
  it("shows a loading state until native Markdown data arrives", () => {
    const { getByText } = render(<QuickLookPreview payload={null} />);
    expect(getByText("Preparing preview…")).toBeInTheDocument();
  });

  it("renders the selected file name and Markdown body", () => {
    const { container, getByRole, getByText } = render(
      <QuickLookPreview
        payload={{
          appearance: "light",
          fileName: "mock.md",
          markdown: "# Synthetic heading\n\nSynthetic body."
        }}
      />
    );

    expect(getByRole("heading", { name: "mock.md", level: 1 })).toBeInTheDocument();
    expect(getByText("Synthetic heading")).toBeInTheDocument();
    expect(container.querySelector(".markra-quicklook-document .markdown-preview-paper")).not.toBeNull();
  });
});
