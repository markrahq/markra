import { render, waitFor } from "@testing-library/react";
import { JsonCodeEditor } from "./JsonCodeEditor";

describe("JsonCodeEditor", () => {
  it("uses theme-aware token and selection colors", async () => {
    const { container } = render(
      <JsonCodeEditor
        label="Synthetic headers"
        onChange={() => {}}
        value={'{"endpoint":"https://example.test","enabled":true,"retries":2,"optional":null}'}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-markra-json-property")).toBeInTheDocument();
    });

    const tokenText = (selector: string) =>
      Array.from(
        container.querySelectorAll(selector),
        (element) => element.textContent ?? "",
      ).join("");

    expect(tokenText(".cm-markra-json-property")).toContain('"endpoint"');
    expect(tokenText(".cm-markra-json-string")).toContain("https://example.test");
    expect(tokenText(".cm-markra-json-literal")).toContain("true");
    expect(tokenText(".cm-markra-json-literal")).toContain("2");
    expect(tokenText(".cm-markra-json-literal")).toContain("null");

    const themeStyles = Array.from(
      document.head.querySelectorAll("style"),
      (style) => style.textContent ?? "",
    ).filter((styles) => styles.includes(".cm-markra-json-property"));

    expect(themeStyles.some((styles) => styles.includes("var(--text-heading)"))).toBe(true);
    expect(themeStyles.some((styles) => styles.includes("var(--text-primary)"))).toBe(true);
    expect(
      themeStyles.some((styles) =>
        styles.includes(
          "background-color: color-mix(in srgb, var(--accent) 22%, transparent) !important;",
        ),
      ),
    ).toBe(true);
  });
});
