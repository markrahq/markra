import { render, screen } from "@testing-library/react";
import { QuietStatus } from "./QuietStatus";

describe("QuietStatus", () => {
  it("shows the document word count when no text is selected", () => {
    render(
      <QuietStatus
        dirty={false}
        wordCount={5}
      />
    );

    expect(screen.getByLabelText("Document status")).toHaveTextContent("5 words");
  });

  it("shows the selected word count instead of the document word count when text is selected", () => {
    render(
      <QuietStatus
        dirty={false}
        selectedWordCount={2}
        wordCount={5}
      />
    );

    expect(screen.getByLabelText("Document status")).toHaveTextContent("2 words");
    expect(screen.getByLabelText("Document status")).not.toHaveTextContent("5 words");
  });
});
