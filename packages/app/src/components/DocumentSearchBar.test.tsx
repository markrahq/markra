import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentSearchBar } from "./DocumentSearchBar";

describe("DocumentSearchBar", () => {
  it("disables navigation and replacement while a regular expression is invalid", () => {
    const next = vi.fn();
    const previous = vi.fn();
    const replace = vi.fn();
    render(
      <DocumentSearchBar
        activeIndex={0}
        caseSensitive={false}
        matchCount={1}
        query="["
        queryValid={false}
        regularExpression
        replaceOpen
        replacement="synthetic"
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onNext={next}
        onPrevious={previous}
        onQueryChange={() => {}}
        onRegularExpressionChange={() => {}}
        onReplace={replace}
        onReplaceAll={() => {}}
        onReplaceOpenChange={() => {}}
        onReplacementChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Previous match" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Replace" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "All" })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find in document" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Replace" }), { key: "Enter" });

    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
